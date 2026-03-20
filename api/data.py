"""
Vercel serverless function: Market Risk data proxy.
Fetches pre-computed market_risk.json from the market-dashboard GitHub repo.
"""
from http.server import BaseHTTPRequestHandler
import urllib.request
import ssl

GITHUB_JSON = (
    "https://raw.githubusercontent.com/"
    "smallfishmacro-Git/market-dashboard/main/"
    "data/datasets/market_risk.json"
)

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            req = urllib.request.Request(
                GITHUB_JSON,
                headers={"User-Agent": "SmallFish/1.0"},
            )
            with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
                payload = resp.read()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header(
                "Cache-Control",
                "s-maxage=3600, stale-while-revalidate=86400"
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
