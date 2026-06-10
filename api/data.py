"""
Vercel serverless function: Market Risk data proxy.
Fetches pre-computed market_risk.json from the market-dashboard GitHub repo.
"""
from http.server import BaseHTTPRequestHandler
import urllib.request
import ssl
import json

GITHUB_JSON = (
    "https://raw.githubusercontent.com/"
    "smallfishmacro-Git/market-dashboard/main/"
    "data/datasets/market_risk.json"
)

YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{}?range=20y&interval=1d"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def _fetch_yahoo_daily_close(symbol):
    url = YAHOO_CHART.format(symbol)
    req = urllib.request.Request(url, headers={"User-Agent": "SmallFish/1.0"})
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    result = payload.get("chart", {}).get("result") or []
    if not result:
        return []
    data = result[0]

    timestamps = data.get("timestamp") or []
    quote = (data.get("indicators", {}).get("quote") or [{}])[0]
    closes = quote.get("close") or []

    out = []
    for ts, cl in zip(timestamps, closes):
        if cl is None:
            continue
        date = __import__("datetime").datetime.utcfromtimestamp(int(ts)).strftime("%Y-%m-%d")
        out.append((date, float(cl)))
    return out


def _build_btc_trend_series():
    btc = _fetch_yahoo_daily_close("BTC-USD")
    spy = _fetch_yahoo_daily_close("SPY")
    if not btc or not spy:
        return None

    btc_map = {d: v for d, v in btc}
    spy_map = {d: v for d, v in spy}
    dates = sorted(set(btc_map.keys()).intersection(spy_map.keys()))
    if len(dates) < 22:
        return None

    trend_dates = []
    trend_vals = []
    for i in range(21, len(dates)):
        d = dates[i]
        p_d = dates[i - 21]
        btc_0 = btc_map[p_d]
        btc_1 = btc_map[d]
        spy_0 = spy_map[p_d]
        spy_1 = spy_map[d]
        if btc_0 <= 0 or spy_0 <= 0:
            continue
        btc_ret_21 = btc_1 / btc_0 - 1.0
        spy_ret_21 = spy_1 / spy_0 - 1.0
        bull = 1 if (btc_ret_21 > 0 and btc_ret_21 > spy_ret_21) else 0
        trend_dates.append(d)
        trend_vals.append(bull)

    if not trend_dates:
        return None
    return trend_dates, trend_vals


def _last_change_date(dates, trend):
    if not dates or not trend:
        return None
    if len(trend) == 1:
        return dates[0]
    for i in range(len(trend) - 1, 0, -1):
        if trend[i] != trend[i - 1]:
            return dates[i]
    return dates[0]


def _apply_btc_override(payload_obj):
    indicators = payload_obj.get("indicators")
    if not isinstance(indicators, list):
        return payload_obj

    rebuilt = _build_btc_trend_series()
    if not rebuilt:
        return payload_obj
    dates, trend = rebuilt

    for ind in indicators:
        if ind.get("col") == "BTC" or ind.get("name") == "Bitcoin Liquidity Proxy":
            ind["dates"] = dates
            ind["trend"] = trend
            ind["status"] = int(trend[-1])
            lcd = _last_change_date(dates, trend)
            if lcd:
                ind["lastChange"] = lcd
                ind["lastUpdate"] = dates[-1]
            break
    return payload_obj


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            req = urllib.request.Request(
                GITHUB_JSON,
                headers={"User-Agent": "SmallFish/1.0"},
            )
            with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
                payload = resp.read()

            try:
                payload_obj = json.loads(payload.decode("utf-8"))
                payload_obj = _apply_btc_override(payload_obj)
                payload = json.dumps(payload_obj, separators=(",", ":")).encode("utf-8")
            except Exception:
                # If BTC override fails for any reason, serve upstream payload unchanged.
                pass

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header(
                "Cache-Control",
                "s-maxage=300, stale-while-revalidate=86400"
            )
            self.end_headers()
            self.wfile.write(payload)

        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(
                f'{{"error":"Failed to fetch pre-computed data: {e}"}}'.encode()
            )

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
