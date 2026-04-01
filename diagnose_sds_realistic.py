"""Diagnose: Why is SDS REALISTIC much better than SDS CLOSE-TO-CLOSE?"""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
import urllib.request, urllib.parse, ssl, json, time
from datetime import datetime

TRADING_DAYS = 252
YF = "https://query2.finance.yahoo.com/v8/finance/chart/{}?period1={}&period2={}&interval=1d"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE

def fetch(tk, p1, p2):
    url = YF.format(urllib.parse.quote(tk, safe=""), p1, p2)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        j = json.loads(r.read())
    res = j["chart"]["result"][0]
    ts = res.get("timestamp", [])
    q = res["indicators"]["quote"][0]
    raw_opens = q.get("open", [])
    raw_closes = q.get("close", [])
    adj_closes = None
    if "adjclose" in res.get("indicators", {}):
        al = res["indicators"]["adjclose"]
        if al and "adjclose" in al[0]: adj_closes = al[0]["adjclose"]
    rows = []
    for t, rc, ro, ac in zip(ts, raw_closes, raw_opens,
                              adj_closes if adj_closes else raw_closes):
        if rc is not None and ro is not None and ac is not None and rc != 0:
            adj_factor = float(ac) / float(rc)
            rows.append((pd.Timestamp(datetime.utcfromtimestamp(t).strftime("%Y-%m-%d")),
                         float(ac), float(ro) * adj_factor))
    df = pd.DataFrame(rows, columns=["date", "close", "open"]).set_index("date")
    return df

print("Downloading data...")
p1 = int(datetime(2007, 11, 1).timestamp())
p2 = int(time.time())
spy = fetch("SPY", p1, p2)
sds = fetch("SDS", p1, p2)
vix = fetch("^VIX", p1, p2)
vix3m = fetch("^VIX3M", p1, p2)
gspc = fetch("^GSPC", p1, p2)

# Align on common dates
idx = spy.index.intersection(sds.index).intersection(vix.index).intersection(vix3m.index).intersection(gspc.index)
idx = idx.sort_values()
d = pd.DataFrame({
    "spy_c": spy.loc[idx, "close"], "spy_o": spy.loc[idx, "open"],
    "sds_c": sds.loc[idx, "close"], "sds_o": sds.loc[idx, "open"],
    "vix": vix.loc[idx, "close"], "vix3m": vix3m.loc[idx, "close"],
    "gspc_c": gspc.loc[idx, "close"],
})
print(f"Data: {idx[0].date()} to {idx[-1].date()}, {len(d)} days\n")

# Compute signals (same for both)
gspc_ret = d["gspc_c"].pct_change()
rv5 = gspc_ret.rolling(5).std() * np.sqrt(252) * 100
evrp5 = d["vix"] - rv5
ma30 = d["vix"].rolling(30).mean()
raw_sig = ((evrp5 <= 0) & (d["vix"] > ma30)).astype(float)
signal = raw_sig.shift(1).fillna(0)

# Hedge weight (sizing mode): VIX[i-1] / 100
hw = signal * d["vix"].shift(1) / 100
hw = hw.fillna(0)

# Returns
spy_r = d["spy_c"].pct_change().fillna(0)
sds_r_c2c = d["sds_c"].pct_change().fillna(0)
sds_r_overnight = (d["sds_o"] / d["sds_c"].shift(1) - 1).fillna(0)
sds_r_intraday = (d["sds_c"] / d["sds_o"] - 1).fillna(0)

# Verify: overnight + intraday ≈ c2c (but multiplicatively)
sds_r_combined = (1 + sds_r_overnight) * (1 + sds_r_intraday) - 1
check = (sds_r_c2c - sds_r_combined).abs().max()
print(f"Sanity check: max |c2c - (1+overnight)*(1+intraday)-1| = {check:.10f}\n")

# Track previous weight
hw_prev = hw.shift(1).fillna(0)
was_in = hw_prev > 0
now_in = hw > 0

enter = now_in & ~was_in
exit_ = ~now_in & was_in
stay_in = was_in & now_in
stay_out = ~was_in & ~now_in

# ─── C2C model ───
c2c_hedge = hw * sds_r_c2c
c2c_port = 0.80 * spy_r + c2c_hedge

# ─── REALISTIC model ───
real_hedge = pd.Series(0.0, index=d.index)
# ENTER: buy at open, value at close
real_hedge[enter] = hw[enter] * sds_r_intraday[enter]
# EXIT: sell at open, capture overnight gap
real_hedge[exit_] = hw_prev[exit_] * sds_r_overnight[exit_]
# STAY IN: split overnight (old wt) + intraday (new wt)
real_hedge[stay_in] = hw_prev[stay_in] * sds_r_overnight[stay_in] + hw[stay_in] * sds_r_intraday[stay_in]
# STAY OUT: 0
real_port = 0.80 * spy_r + real_hedge

# ─── Compare ───
diff = real_hedge - c2c_hedge
cum_diff = diff.cumsum()

# Equity curves
eq_c2c = (1 + c2c_port).cumprod() * 100
eq_real = (1 + real_port).cumprod() * 100

print("=" * 80)
print("FINAL EQUITY: REALISTIC vs C2C (Sizing eVRP(5D)+MA30 on SDS)")
print(f"  C2C:       {eq_c2c.iloc[-1]:.2f}")
print(f"  REALISTIC: {eq_real.iloc[-1]:.2f}")
print(f"  Diff:      {eq_real.iloc[-1] - eq_c2c.iloc[-1]:.2f}")
print()

# Break down by transition type
print("=" * 80)
print("CUMULATIVE HEDGE CONTRIBUTION DIFFERENCE BY TRANSITION TYPE")
print(f"  ENTER days ({enter.sum():>4d} days): {diff[enter].sum()*100:>+8.2f}%")
print(f"  EXIT  days ({exit_.sum():>4d} days): {diff[exit_].sum()*100:>+8.2f}%")
print(f"  STAY  days ({stay_in.sum():>4d} days): {diff[stay_in].sum()*100:>+8.2f}%")
print(f"  OUT   days ({stay_out.sum():>4d} days): {diff[stay_out].sum()*100:>+8.2f}%")
print(f"  TOTAL:                     {diff.sum()*100:>+8.2f}%")
print()

# Detailed ENTER analysis
print("=" * 80)
print("ENTER DAYS: what REALISTIC misses vs C2C")
print("  C2C:       hw[i] * (sds_close[i]/sds_close[i-1] - 1)")
print("  REALISTIC: hw[i] * (sds_close[i]/sds_open[i] - 1)")
print("  Diff = -hw[i] * (sds_open[i]/sds_close[i-1] - 1)  [misses overnight gap]")
enter_overnight = sds_r_overnight[enter]
print(f"  Avg overnight return on ENTER days: {enter_overnight.mean()*100:+.3f}%")
print(f"  → REALISTIC misses this × weight on ENTER")
print()

# Detailed EXIT analysis
print("=" * 80)
print("EXIT DAYS: what REALISTIC captures that C2C doesn't")
print("  C2C:       hw[i]=0 → captures nothing")
print("  REALISTIC: hw[i-1] * (sds_open[i]/sds_close[i-1] - 1)  [overnight gap]")
exit_overnight = sds_r_overnight[exit_]
exit_wt = hw_prev[exit_]
exit_contrib = (exit_wt * exit_overnight)
print(f"  Avg overnight return on EXIT days: {exit_overnight.mean()*100:+.3f}%")
print(f"  Avg weight on EXIT days: {exit_wt.mean():.3f}")
print(f"  Total EXIT contribution: {exit_contrib.sum()*100:+.2f}%")
print()

# Detailed STAY_IN analysis
print("=" * 80)
print("STAY-IN DAYS: weight splitting + cross-term effect")
print("  C2C:       hw[i] * r_c2c")
print("  REALISTIC: hw[i-1]*r_overnight + hw[i]*r_intraday")
print()
stay_diff = diff[stay_in]
# Decompose: weight effect vs cross-term
# C2C = hw[i] * ((1+r_on)*(1+r_id)-1) = hw[i]*r_on + hw[i]*r_id + hw[i]*r_on*r_id
# REAL = hw[i-1]*r_on + hw[i]*r_id
# Diff = (hw[i-1]-hw[i])*r_on - hw[i]*r_on*r_id
weight_effect = (hw_prev[stay_in] - hw[stay_in]) * sds_r_overnight[stay_in]
cross_term = -hw[stay_in] * sds_r_overnight[stay_in] * sds_r_intraday[stay_in]
print(f"  Weight-change effect (hw[i-1]-hw[i])*r_overnight: {weight_effect.sum()*100:+.2f}%")
print(f"  Cross-term -hw[i]*r_overnight*r_intraday:         {cross_term.sum()*100:+.2f}%")
print(f"  Total STAY diff:                                  {stay_diff.sum()*100:+.2f}%")
print()

# Top 20 days by absolute impact
print("=" * 80)
print("TOP 20 DAYS BY ABSOLUTE IMPACT (realistic - c2c)")
impact = pd.DataFrame({
    "type": np.where(enter, "ENTER", np.where(exit_, "EXIT", np.where(stay_in, "STAY", "OUT"))),
    "sds_c2c_ret": sds_r_c2c,
    "sds_overnight": sds_r_overnight,
    "sds_intraday": sds_r_intraday,
    "hw": hw,
    "hw_prev": hw_prev,
    "c2c_contrib": c2c_hedge,
    "real_contrib": real_hedge,
    "diff": diff,
}).sort_values("diff", ascending=False, key=abs)
pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 12)
pd.set_option("display.float_format", lambda x: f"{x:+.4f}" if abs(x) < 10 else f"{x:+.1f}")
print(impact.head(20).to_string())
print()

# Year-by-year breakdown
print("=" * 80)
print("YEAR-BY-YEAR CONTRIBUTION DIFFERENCE (realistic - c2c)")
yearly = diff.groupby(diff.index.year).sum() * 100
for yr, v in yearly.items():
    if abs(v) > 0.01:
        print(f"  {yr}: {v:+.2f}%")
