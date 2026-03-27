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


def _strat(spy_open, vixy_open, signal, vix, n, sizing, spy_w=0.80, vixy_w=0.20):
    """Run a strategy with correct open-price execution.

    Timing convention (all arrays indexed by trading day i = 0..n-1):
      - signal[i]  = computed at CLOSE of day i (uses close prices)
      - hw[i]      = VIXY weight held from OPEN of day i to OPEN of day i+1
                     Determined by signal[i-1] (close of previous day)
      - exec price = open[i] (where we enter/exit)
      - return     = open[i+1]/open[i] - 1 (earned while holding from open i to open i+1)

    So: signal at close of day i-1 → trade at open of day i → earn return open[i+1]/open[i]-1
    """
    # hw[i] = weight active from open[i] to open[i+1]
    # hw[0] = 0 (no signal before day 0)
    hw = [0.0] * n
    for i in range(1, n):
        if signal[i - 1] > 0:
            # Size determined at signal time: close of day i-1
            hw[i] = (vix[i - 1] / 100.0) if sizing else vixy_w

    # Portfolio return from open[i] to open[i+1]
    # Equity at index i represents value at open of day i
    eq = [100.0]
    pr = [0.0]  # no return on day 0
    for i in range(n - 1):
        r_spy = (spy_open[i + 1] / spy_open[i] - 1) if spy_open[i] > 0 else 0.0
        r_vixy = (vixy_open[i + 1] / vixy_open[i] - 1) if vixy_open[i] > 0 else 0.0
        day_ret = spy_w * r_spy + hw[i] * r_vixy
        pr.append(day_ret)
        eq.append(eq[-1] * (1 + day_ret))

    # VIXY sleeve equity: growth of $1 from hedge component only
    sleq = [1.0]
    for i in range(n - 1):
        r_vixy = (vixy_open[i + 1] / vixy_open[i] - 1) if vixy_open[i] > 0 else 0.0
        slr = hw[i] * r_vixy
        sleq.append(sleq[-1] * (1 + slr))

    return dict(
        equity=[round(v, 2) for v in eq],
        hedge_weight=[round(v, 4) for v in hw],
        vixy_sleeve_equity=[round(v, 6) for v in sleq],
        stats=_stats(eq, pr),
    )


def _compute():
    """Main computation: fetch data, compute signals, run strategies."""
    p1 = int(datetime(2011, 1, 1).timestamp())
    p2 = int(time.time())

    raw = _fetch_all(["SPY", "VIXY", "^VIX", "^VIX3M", "^GSPC"], p1, p2)
    dates, al, al_open = _align(raw)
    if len(dates) < 100:
        raise ValueError(f"Insufficient aligned data: {len(dates)} days")

    spy, vixy, vix, vix3m, gspc = (
        al["SPY"],
        al["VIXY"],
        al["^VIX"],
        al["^VIX3M"],
        al["^GSPC"],
    )
    spy_open, vixy_open = al_open["SPY"], al_open["VIXY"]
    n = len(dates)
    gspc_r = _ret(gspc)  # close-to-close for realized vol calculation

    # Realized vol windows
    rv5 = _rvol(gspc_r, 5)
    rv10 = _rvol(gspc_r, 10)

    # VIX moving averages
    ma30 = _ma(vix, 30)
    ma90 = _ma(vix, 90)

    # eVRP = implied vol - realized vol
    evrp5 = [None if rv5[i] is None else vix[i] - rv5[i] for i in range(n)]
    evrp10 = [None if rv10[i] is None else vix[i] - rv10[i] for i in range(n)]

    # ── Signals ──────────────────────────────────────────────
    # Benchmark: VIX > VIX3M → hedge on
    sig_bm = [1.0 if vix[i] > vix3m[i] else 0.0 for i in range(n)]

    # eVRP(10D) <= 0 → hedge on
    sig_e10 = [
        1.0 if evrp10[i] is not None and evrp10[i] <= 0 else 0.0 for i in range(n)
    ]

    # eVRP(10D) <= 0 AND VIX > 30D MA
    sig_e10_m30 = [
        1.0
        if (
            evrp10[i] is not None
            and evrp10[i] <= 0
            and ma30[i] is not None
            and vix[i] > ma30[i]
        )
        else 0.0
        for i in range(n)
    ]

    # eVRP(5D) <= 0 AND VIX > 30D MA
    sig_e5_m30 = [
        1.0
        if (
            evrp5[i] is not None
            and evrp5[i] <= 0
            and ma30[i] is not None
            and vix[i] > ma30[i]
        )
        else 0.0
        for i in range(n)
    ]

    # ── Strategies ───────────────────────────────────────────
    strats = {}

    # 100% SPY buy-and-hold (open-to-open)
    spy_eq = [100.0]
    spy_pr = [0.0]
    for i in range(n - 1):
        r = (spy_open[i + 1] / spy_open[i] - 1) if spy_open[i] > 0 else 0.0
        spy_pr.append(r)
        spy_eq.append(spy_eq[-1] * (1 + r))
    strats["100% SPY"] = dict(
        equity=[round(v, 2) for v in spy_eq],
        hedge_weight=[0.0] * n,
        vixy_sleeve_equity=[1.0] * n,
        stats=_stats(spy_eq, spy_pr),
    )

    strats["Benchmark VIX>VIX3M"] = _strat(spy_open, vixy_open, sig_bm, vix, n, False)
    strats["Fixed eVRP(10D)"] = _strat(spy_open, vixy_open, sig_e10, vix, n, False)
    strats["Fixed eVRP(10D)+MA30"] = _strat(spy_open, vixy_open, sig_e10_m30, vix, n, False)
    strats["Sizing eVRP(10D)"] = _strat(spy_open, vixy_open, sig_e10, vix, n, True)
    strats["Sizing eVRP(5D)+MA30"] = _strat(spy_open, vixy_open, sig_e5_m30, vix, n, True)

    # ── Current signals ──────────────────────────────────────
    li = n - 1
    curr = dict(
        date=dates[li],
        spy=round(spy[li], 2),
        vixy=round(vixy[li], 2),
        vix=round(vix[li], 2),
        vix3m=round(vix3m[li], 2),
        evrp_5d=round(evrp5[li], 2) if evrp5[li] is not None else None,
        evrp_10d=round(evrp10[li], 2) if evrp10[li] is not None else None,
        vix_ma30=round(ma30[li], 2) if ma30[li] is not None else None,
        vix_ma90=round(ma90[li], 2) if ma90[li] is not None else None,
        benchmark_on=sig_bm[li] == 1.0,
        evrp10_on=sig_e10[li] == 1.0,
        evrp10_ma30_on=sig_e10_m30[li] == 1.0,
        sizing_e5_ma30_on=sig_e5_m30[li] == 1.0,
    )

    rnd = lambda a, d=2: [round(v, d) if v is not None else None for v in a]
    return dict(
        dates=dates,
        spy_price=rnd(spy),
        vixy_price=rnd(vixy),
        spy_open=rnd(spy_open),
        vixy_open=rnd(vixy_open),
        vix=rnd(vix),
        vix3m=rnd(vix3m),
        evrp_10d=rnd(evrp10),
        evrp_5d=rnd(evrp5),
        strategies=strats,
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
