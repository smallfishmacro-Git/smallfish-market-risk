"""
Vercel serverless function: VIXY tail-hedge strategy model.
Based on: https://quantpedia.com/hedging-tail-risk-with-robust-vixy-models/

Fetches Yahoo Finance data for SPY, VIXY, ^VIX, ^VIX3M, ^GSPC and computes
strategy signals and equity curves in pure Python (no external dependencies).
"""
from http.server import BaseHTTPRequestHandler
import urllib.request
import urllib.parse
import ssl
import json
import math
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

YF_CHART = "https://query2.finance.yahoo.com/v8/finance/chart/{}?period1={}&period2={}&interval=1d"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
TRADING_DAYS = 252

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def _fetch(ticker, p1, p2):
    """Fetch daily close and open prices from Yahoo Finance v8 chart API."""
    url = YF_CHART.format(urllib.parse.quote(ticker, safe=""), p1, p2)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
        j = json.loads(r.read())
    res = j["chart"]["result"][0]
    ts_list = res.get("timestamp", [])
    quote = res["indicators"]["quote"][0]
    opens = quote.get("open", [])
    # Use adjusted close if available, otherwise regular close
    adj = None
    if "adjclose" in res.get("indicators", {}):
        adj_list = res["indicators"]["adjclose"]
        if adj_list and "adjclose" in adj_list[0]:
            adj = adj_list[0]["adjclose"]
    closes = adj if adj else quote["close"]
    dates, close_px, open_px = [], [], []
    for t, c, o in zip(ts_list, closes, opens):
        if c is not None and o is not None:
            dates.append(datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"))
            close_px.append(round(float(c), 4))
            open_px.append(round(float(o), 4))
    return dates, close_px, open_px


def _fetch_all(tickers, p1, p2):
    """Fetch all tickers in parallel."""
    with ThreadPoolExecutor(max_workers=len(tickers)) as pool:
        futures = {tk: pool.submit(_fetch, tk, p1, p2) for tk in tickers}
        return {tk: f.result() for tk, f in futures.items()}


def _align(raw):
    """Align all tickers on common trading dates. Returns close and open dicts."""
    sets = [set(d) for d, _, _ in raw.values()]
    common = sorted(sets[0].intersection(*sets[1:]))
    closes, opens = {}, {}
    for tk, (dates, close_px, open_px) in raw.items():
        clk = dict(zip(dates, close_px))
        olk = dict(zip(dates, open_px))
        closes[tk] = [clk[d] for d in common]
        opens[tk] = [olk[d] for d in common]
    return common, closes, opens


def _ret(prices):
    """Daily percentage returns."""
    r = [0.0]
    for i in range(1, len(prices)):
        r.append((prices[i] / prices[i - 1] - 1) if prices[i - 1] > 0 else 0.0)
    return r


def _rvol(rets, w):
    """Rolling annualized realized volatility (percentage points)."""
    n = len(rets)
    rv = [None] * n
    for i in range(w - 1, n):
        sl = rets[i - w + 1 : i + 1]
        m = sum(sl) / w
        v = sum((x - m) ** 2 for x in sl) / (w - 1) if w > 1 else 0
        rv[i] = math.sqrt(v) * math.sqrt(TRADING_DAYS) * 100
    return rv


def _ma(vals, w):
    """Simple rolling mean."""
    n = len(vals)
    r = [None] * n
    for i in range(w - 1, n):
        s = [v for v in vals[i - w + 1 : i + 1] if v is not None]
        r[i] = sum(s) / len(s) if s else None
    return r


def _stats(equity, port_ret):
    """Compute CAGR, vol, Sharpe, max DD from equity and returns arrays."""
    n = len(equity)
    peak = mx_dd = 0
    for v in equity:
        if v > peak:
            peak = v
        dd = (peak - v) / peak if peak > 0 else 0
        if dd > mx_dd:
            mx_dd = dd
    tr = equity[-1] / equity[0] - 1 if equity[0] > 0 else 0
    yrs = n / TRADING_DAYS
    cagr = (equity[-1] / equity[0]) ** (1 / yrs) - 1 if yrs > 0 and equity[0] > 0 else 0
    m_r = sum(port_ret) / n if n > 0 else 0
    var_r = sum((x - m_r) ** 2 for x in port_ret) / (n - 1) if n > 1 else 0
    vol = math.sqrt(var_r) * math.sqrt(TRADING_DAYS)
    sh = cagr / vol if vol > 0 else 0
    return dict(
        cagr=round(cagr * 100, 2),
        vol=round(vol * 100, 2),
        sharpe=round(sh, 2),
        max_dd=round(mx_dd * 100, 2),
        total_return=round(tr * 100, 2),
    )


def _strat(spy_close, vixy_close, spy_open, vixy_open, signal, vix, n,
           sizing, spy_w=0.80, vixy_w=0.20):
    """Run a strategy modelling a real portfolio valued at market close.

    Timing convention (all arrays indexed by trading day i = 0..n-1):
      - signal[i]    = computed at CLOSE of day i
      - hw[i]        = VIXY weight for day i, decided by signal[i-1]
      - Execution    = at OPEN of day i
      - Portfolio     = valued at CLOSE each day

    Return calculation for the VIXY component on day i (i >= 1):
      - ENTER (hw[i-1]=0 → hw[i]>0): buy at open[i], value at close[i]
        vixy_ret = close[i] / open[i] - 1, weight = hw[i]
      - EXIT (hw[i-1]>0 → hw[i]=0): sell at open[i], had position overnight
        vixy_ret = open[i] / close[i-1] - 1, weight = hw[i-1]
      - STAY IN (hw[i-1]>0 → hw[i]>0): if weight changes, split overnight/intraday
        overnight = open[i] / close[i-1] - 1  (weight = hw[i-1])
        intraday  = close[i] / open[i] - 1    (weight = hw[i], after rebalance)
      - STAY OUT: 0

    SPY component: always close-to-close (80% weight, no trading).
    """
    # hw[i] = weight for day i, determined by signal at close of day i-1
    hw = [0.0] * n
    for i in range(1, n):
        if signal[i - 1] > 0:
            hw[i] = (vix[i - 1] / 100.0) if sizing else vixy_w

    eq = [100.0]
    pr = [0.0]
    sleq = [1.0]
    for i in range(1, n):
        # SPY: always close-to-close
        r_spy = (spy_close[i] / spy_close[i - 1] - 1) if spy_close[i - 1] > 0 else 0.0

        was_in = hw[i - 1] > 0
        now_in = hw[i] > 0

        if now_in and not was_in:
            # ENTER at open[i]
            r_vixy = (vixy_close[i] / vixy_open[i] - 1) if vixy_open[i] > 0 else 0.0
            vixy_contrib = hw[i] * r_vixy
        elif was_in and not now_in:
            # EXIT at open[i] — capture overnight gap from close[i-1] to open[i]
            r_vixy = (vixy_open[i] / vixy_close[i - 1] - 1) if vixy_close[i - 1] > 0 else 0.0
            vixy_contrib = hw[i - 1] * r_vixy
        elif was_in and now_in:
            # STAY IN — split into overnight (old weight) and intraday (new weight)
            r_overnight = (vixy_open[i] / vixy_close[i - 1] - 1) if vixy_close[i - 1] > 0 else 0.0
            r_intraday = (vixy_close[i] / vixy_open[i] - 1) if vixy_open[i] > 0 else 0.0
            vixy_contrib = hw[i - 1] * r_overnight + hw[i] * r_intraday
        else:
            vixy_contrib = 0.0

        day_ret = spy_w * r_spy + vixy_contrib
        pr.append(day_ret)
        eq.append(eq[-1] * (1 + day_ret))
        sleq.append(sleq[-1] * (1 + vixy_contrib))

    return dict(
        equity=[round(v, 2) for v in eq],
        hedge_weight=[round(v, 4) for v in hw],
        vixy_sleeve_equity=[round(v, 6) for v in sleq],
        stats=_stats(eq, pr),
    )


def _strat_c2c(spy_close, vixy_close, signal, vix, n,
               sizing, spy_w=0.80, vixy_w=0.20):
    """Close-to-close backtest as in the Quantpedia article.

    Signal at close of day i-1 → position active on day i.
    All returns are close[i]/close[i-1] - 1. One-day execution lag.
    """
    hw = [0.0] * n
    for i in range(1, n):
        if signal[i - 1] > 0:
            hw[i] = (vix[i - 1] / 100.0) if sizing else vixy_w

    eq = [100.0]
    pr = [0.0]
    sleq = [1.0]
    for i in range(1, n):
        r_spy = (spy_close[i] / spy_close[i - 1] - 1) if spy_close[i - 1] > 0 else 0.0
        r_vixy = (vixy_close[i] / vixy_close[i - 1] - 1) if vixy_close[i - 1] > 0 else 0.0
        vixy_contrib = hw[i] * r_vixy
        day_ret = spy_w * r_spy + vixy_contrib
        pr.append(day_ret)
        eq.append(eq[-1] * (1 + day_ret))
        sleq.append(sleq[-1] * (1 + vixy_contrib))

    return dict(
        equity=[round(v, 2) for v in eq],
        hedge_weight=[round(v, 4) for v in hw],
        vixy_sleeve_equity=[round(v, 6) for v in sleq],
        stats=_stats(eq, pr),
    )


def _build(dates, spy_close, hedge_close, spy_open, hedge_open, vix, vix3m, gspc):
    """Build signals, strategies, and price arrays for a given hedge instrument."""
    n = len(dates)
    gspc_r = _ret(gspc)

    # Realized vol windows
    rv5 = _rvol(gspc_r, 5)
    rv10 = _rvol(gspc_r, 10)

    # VIX moving averages
    ma30 = _ma(vix, 30)

    # eVRP = implied vol - realized vol
    evrp5 = [None if rv5[i] is None else vix[i] - rv5[i] for i in range(n)]
    evrp10 = [None if rv10[i] is None else vix[i] - rv10[i] for i in range(n)]

    # ── Signals ──────────────────────────────────────────────
    sig_bm = [1.0 if vix[i] > vix3m[i] else 0.0 for i in range(n)]
    sig_e10 = [
        1.0 if evrp10[i] is not None and evrp10[i] <= 0 else 0.0 for i in range(n)
    ]
    sig_e10_m30 = [
        1.0
        if (evrp10[i] is not None and evrp10[i] <= 0
            and ma30[i] is not None and vix[i] > ma30[i])
        else 0.0
        for i in range(n)
    ]
    sig_e5_m30 = [
        1.0
        if (evrp5[i] is not None and evrp5[i] <= 0
            and ma30[i] is not None and vix[i] > ma30[i])
        else 0.0
        for i in range(n)
    ]

    # ── Strategies ───────────────────────────────────────────
    strats = {}

    # 100% SPY buy-and-hold
    spy_eq = [100.0]
    spy_pr = [0.0]
    for i in range(1, n):
        r = (spy_close[i] / spy_close[i - 1] - 1) if spy_close[i - 1] > 0 else 0.0
        spy_pr.append(r)
        spy_eq.append(spy_eq[-1] * (1 + r))
    strats["100% SPY"] = dict(
        equity=[round(v, 2) for v in spy_eq],
        hedge_weight=[0.0] * n,
        vixy_sleeve_equity=[1.0] * n,
        stats=_stats(spy_eq, spy_pr),
    )

    strats["Benchmark VIX>VIX3M"] = _strat(spy_close, hedge_close, spy_open, hedge_open, sig_bm, vix, n, False)
    strats["Fixed eVRP(10D)"] = _strat(spy_close, hedge_close, spy_open, hedge_open, sig_e10, vix, n, False)
    strats["Fixed eVRP(10D)+MA30"] = _strat(spy_close, hedge_close, spy_open, hedge_open, sig_e10_m30, vix, n, False)
    strats["Sizing eVRP(10D)"] = _strat(spy_close, hedge_close, spy_open, hedge_open, sig_e10, vix, n, True)
    strats["Sizing eVRP(5D)+MA30"] = _strat(spy_close, hedge_close, spy_open, hedge_open, sig_e5_m30, vix, n, True)

    # Close-to-close strategies (Quantpedia article style)
    c2c = {}
    c2c["100% SPY"] = strats["100% SPY"]
    c2c["Benchmark VIX>VIX3M"] = _strat_c2c(spy_close, hedge_close, sig_bm, vix, n, False)
    c2c["Fixed eVRP(10D)"] = _strat_c2c(spy_close, hedge_close, sig_e10, vix, n, False)
    c2c["Fixed eVRP(10D)+MA30"] = _strat_c2c(spy_close, hedge_close, sig_e10_m30, vix, n, False)
    c2c["Sizing eVRP(10D)"] = _strat_c2c(spy_close, hedge_close, sig_e10, vix, n, True)
    c2c["Sizing eVRP(5D)+MA30"] = _strat_c2c(spy_close, hedge_close, sig_e5_m30, vix, n, True)

    rnd = lambda a, d=2: [round(v, d) if v is not None else None for v in a]
    return dict(
        dates=dates,
        spy_price=rnd(spy_close),
        hedge_price=rnd(hedge_close),
        spy_open=rnd(spy_open),
        hedge_open=rnd(hedge_open),
        vix=rnd(vix),
        vix3m=rnd(vix3m),
        evrp_10d=rnd(evrp10),
        evrp_5d=rnd(evrp5),
        strategies=strats,
        strategies_c2c=c2c,
    )


def _compute():
    """Main computation: fetch data, compute signals, run strategies."""
    p1 = int(datetime(2007, 11, 1).timestamp())
    p2 = int(time.time())

    raw = _fetch_all(["SPY", "VIXY", "SDS", "^VIX", "^VIX3M", "^GSPC"], p1, p2)

    # VIXY alignment (starts ~2011)
    vixy_raw = {k: raw[k] for k in ["SPY", "VIXY", "^VIX", "^VIX3M", "^GSPC"]}
    v_dates, v_cl, v_op = _align(vixy_raw)
    if len(v_dates) < 100:
        raise ValueError(f"Insufficient VIXY-aligned data: {len(v_dates)} days")
    vixy_result = _build(
        v_dates, v_cl["SPY"], v_cl["VIXY"], v_op["SPY"], v_op["VIXY"],
        v_cl["^VIX"], v_cl["^VIX3M"], v_cl["^GSPC"],
    )

    # SDS alignment (starts ~2007-11, VIX3M inception)
    sds_raw = {k: raw[k] for k in ["SPY", "SDS", "^VIX", "^VIX3M", "^GSPC"]}
    s_dates, s_cl, s_op = _align(sds_raw)
    if len(s_dates) < 100:
        raise ValueError(f"Insufficient SDS-aligned data: {len(s_dates)} days")
    sds_result = _build(
        s_dates, s_cl["SPY"], s_cl["SDS"], s_op["SPY"], s_op["SDS"],
        s_cl["^VIX"], s_cl["^VIX3M"], s_cl["^GSPC"],
    )

    # Current signals (from VIXY alignment — most recent data)
    li = len(v_dates) - 1
    vix_v, vix3m_v = v_cl["^VIX"], v_cl["^VIX3M"]
    evrp5_v, evrp10_v = vixy_result["evrp_5d"], vixy_result["evrp_10d"]
    ma30_v = _ma(vix_v, 30)
    curr = dict(
        date=v_dates[li],
        spy=round(v_cl["SPY"][li], 2),
        vixy=round(v_cl["VIXY"][li], 2),
        vix=round(vix_v[li], 2),
        vix3m=round(vix3m_v[li], 2),
        evrp_5d=evrp5_v[li],
        evrp_10d=evrp10_v[li],
        vix_ma30=round(ma30_v[li], 2) if ma30_v[li] is not None else None,
        benchmark_on=vix_v[li] > vix3m_v[li],
        evrp10_on=evrp10_v[li] is not None and evrp10_v[li] <= 0,
        evrp10_ma30_on=(
            evrp10_v[li] is not None and evrp10_v[li] <= 0
            and ma30_v[li] is not None and vix_v[li] > ma30_v[li]
        ),
        sizing_e5_ma30_on=(
            evrp5_v[li] is not None and evrp5_v[li] <= 0
            and ma30_v[li] is not None and vix_v[li] > ma30_v[li]
        ),
    )

    return dict(
        vixy=vixy_result,
        sds=sds_result,
        current_signals=curr,
        computed_at=datetime.utcnow().isoformat() + "Z",
    )


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            payload = json.dumps(_compute()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header(
                "Cache-Control", "s-maxage=3600, stale-while-revalidate=86400"
            )
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(
                json.dumps({"error": f"VIXY model computation failed: {e}"}).encode()
            )

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
