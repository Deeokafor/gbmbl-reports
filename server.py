import os
import json
import http.server
import socketserver
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
DATA_DIR = os.path.join(BASE_DIR, "data")
HISTORICAL_JSON = os.path.join(DATA_DIR, "historical_sales.json")

# Add src to python path for imports
sys.path.insert(0, os.path.join(BASE_DIR, "src"))
from erp_extractor import FrontAccountingScraper

PORT = 8080

class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Serve files directly from the public/ directory
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def do_GET(self):
        if self.path == "/api/data":
            if os.path.exists(HISTORICAL_JSON):
                with open(HISTORICAL_JSON, "r") as f:
                    content = f.read()
            else:
                content = json.dumps({})
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(content.encode("utf-8"))
        elif self.path == "/api/refresh":
            try:
                scraper = FrontAccountingScraper()
                scraper.login()
                months = [
                    ('June 2026', '06/01/2026', '06/30/2026'),
                    ('July 2026', '07/01/2026', '07/31/2026'),
                    ('August 2026', '08/01/2026', '08/31/2026'),
                    ('September 2026', '09/01/2026', '09/30/2026'),
                    ('October 2026', '10/01/2026', '10/31/2026')
                ]
                all_data = {}
                for label, start, end in months:
                    all_data[label] = scraper.fetch_full_monthly_bundle(start, end)
                with open(HISTORICAL_JSON, "w") as f:
                    json.dump(all_data, f, indent=2)
                with open(os.path.join(PUBLIC_DIR, "data", "historical_sales.json"), "w") as f:
                    json.dump(all_data, f, indent=2)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "message": "Refreshed from ERP"}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode("utf-8"))
        else:
            super().do_GET()

def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), DashboardHandler) as httpd:
        print(f"Executive Dashboard Server running at http://localhost:{PORT}")
        httpd.serve_forever()

if __name__ == "__main__":
    run_server()
