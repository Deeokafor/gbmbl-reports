import os
import re
import json
import subprocess
import requests
from bs4 import BeautifulSoup
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(BASE_DIR, ".env")
DATA_DIR = os.path.join(BASE_DIR, "data")
RAW_EXPORTS_DIR = os.path.join(BASE_DIR, "raw_exports")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RAW_EXPORTS_DIR, exist_ok=True)

def read_env():
    env_vars = {}
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env_vars[k.strip()] = v.strip().strip('"').strip("'")
    return env_vars

class FrontAccountingScraper:
    def __init__(self):
        env = read_env()
        self.base_url = "https://goodeybestmultibiz.com.ng/erp"
        self.username = env.get("username")
        self.password = env.get("password")
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })

    def login(self):
        resp = self.session.get(f"{self.base_url}/index.php")
        soup = BeautifulSoup(resp.text, "html.parser")
        token = soup.find("input", {"name": "_token"}).get("value", "")
        payload = {
            "user_name_entry_field": self.username,
            "password": self.password,
            "company_login_name": "0",
            "SubmitUser": "  Login -->  ",
            "ui_mode": "",
            "_focus": "user_name_entry_field",
            "_modified": "0",
            "_confirmed": "",
            "_token": token
        }
        res = self.session.post(f"{self.base_url}/index.php", data=payload)
        return res.status_code == 200

    def fetch_sales_summary(self, start_date_str, end_date_str):
        payload = {
            'REP_ID': '114',
            'Class': '0',
            'PARAM_0': start_date_str,
            'PARAM_1': end_date_str,
            'PARAM_2': '0',
            'PARAM_3': '',
            'PARAM_4': '0',
            'PARAM_5': '0',
            'Rep114': 'Display: Sales Summary Report'
        }
        resp = self.session.post(f"{self.base_url}/reporting/reports_main.php", data=payload)
        raw = resp.content
        idx = raw.find(b"%PDF-")
        if idx == -1:
            raise Exception("PDF stream not found in response")
        
        pdf_bytes = raw[idx:]
        clean_name = f"sales_{start_date_str.replace('/', '-')}"
        tmp_pdf = os.path.join(RAW_EXPORTS_DIR, f"{clean_name}.pdf")
        tmp_txt = os.path.join(RAW_EXPORTS_DIR, f"{clean_name}.txt")
        
        with open(tmp_pdf, "wb") as f:
            f.write(pdf_bytes)
        
        subprocess.run(["pdftotext", "-layout", tmp_pdf, tmp_txt], check=True)
        
        with open(tmp_txt, "r") as f:
            lines = f.readlines()

        return self._parse_sales_summary_lines(lines, start_date_str, end_date_str)

    def _parse_sales_summary_lines(self, lines, start_date_str, end_date_str):
        data = {
            "report_title": "Sales Summary Report",
            "period_from": start_date_str,
            "period_to": end_date_str,
            "generated_at": datetime.now().isoformat(),
            "customers": [],
            "total_sales": 0.0
        }

        row_pattern = re.compile(r"^\s*([A-Za-z0-9\s\.\-_&/'#]+?)\s{2,}([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$")

        for line in lines:
            line_str = line.strip()
            if not line_str or line_str.startswith("Sales Summary Report") or line_str.startswith("Print Out Date") or line_str.startswith("Customer") or line_str.startswith("Balances in Home"):
                continue
            
            if line_str.startswith("Total"):
                parts = line_str.split()
                if len(parts) >= 2:
                    total_val = float(parts[1].replace(",", ""))
                    data["total_sales"] = total_val
                continue

            match = row_pattern.match(line)
            if match:
                cust_name = match.group(1).strip()
                amt = float(match.group(2).replace(",", ""))
                tax = float(match.group(3).replace(",", ""))
                data["customers"].append({
                    "name": cust_name,
                    "amount": amt,
                    "tax": tax
                })

        if data["total_sales"] > 0:
            for c in data["customers"]:
                c["share_pct"] = round((c["amount"] / data["total_sales"]) * 100, 2)
        
        data["customers"].sort(key=lambda x: x["amount"], reverse=True)
        return data

if __name__ == "__main__":
    scraper = FrontAccountingScraper()
    print("Logging into ERP...")
    scraper.login()
    print("Fetching June 2026 data...")
    june_data = scraper.fetch_sales_summary("06/01/2026", "06/30/2026")
    output_path = os.path.join(DATA_DIR, "june_2026_sales.json")
    with open(output_path, "w") as f:
        json.dump(june_data, f, indent=2)
    print("Saved to", output_path)
