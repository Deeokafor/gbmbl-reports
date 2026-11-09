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
            return {"report_title": "Sales Summary Report", "period_from": start_date_str, "period_to": end_date_str, "customers": [], "total_sales": 0.0}
        
        pdf_bytes = raw[idx:]
        clean_name = f"sales_{start_date_str.replace('/', '-')}"
        tmp_pdf = os.path.join(RAW_EXPORTS_DIR, f"{clean_name}.pdf")
        tmp_txt = os.path.join(RAW_EXPORTS_DIR, f"{clean_name}.txt")
        
        with open(tmp_pdf, "wb") as f: f.write(pdf_bytes)
        subprocess.run(["pdftotext", "-layout", tmp_pdf, tmp_txt], check=True)
        with open(tmp_txt, "r") as f: lines = f.readlines()

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
            if not line_str or any(line_str.startswith(x) for x in ["Sales Summary", "Print Out", "Customer", "Balances"]):
                continue
            if line_str.startswith("Total"):
                parts = line_str.split()
                if len(parts) >= 2:
                    data["total_sales"] = float(parts[1].replace(",", ""))
                continue

            match = row_pattern.match(line)
            if match:
                cust_name = match.group(1).strip()
                amt = float(match.group(2).replace(",", ""))
                tax = float(match.group(3).replace(",", ""))
                data["customers"].append({"name": cust_name, "amount": amt, "tax": tax})

        if data["total_sales"] > 0:
            for c in data["customers"]:
                c["share_pct"] = round((c["amount"] / data["total_sales"]) * 100, 2)
        data["customers"].sort(key=lambda x: x["amount"], reverse=True)
        return data

    def fetch_pnl(self, start_date_str, end_date_str):
        """Fetch Profit and Loss (REP_ID 707)"""
        payload = {
            'REP_ID': '707',
            'Class': '6',
            'PARAM_0': start_date_str,
            'PARAM_1': end_date_str,
            'PARAM_2': '0',
            'PARAM_3': '0',
            'PARAM_4[]': '0',
            'PARAM_5': '0',
            'PARAM_6': '0',
            'PARAM_8': '0',
            'PARAM_9': '0',
            'Rep707': 'Display'
        }
        resp = self.session.post(f"{self.base_url}/reporting/reports_main.php", data=payload)
        raw = resp.content
        idx = raw.find(b"%PDF-")
        if idx == -1:
            return {"income": 0.0, "cost_of_goods": 0.0, "operating_expenses": 0.0, "net_profit": 0.0, "profit_margin": 0.0}

        tmp_pdf = os.path.join(RAW_EXPORTS_DIR, f"pnl_{start_date_str.replace('/', '-')}.pdf")
        tmp_txt = os.path.join(RAW_EXPORTS_DIR, f"pnl_{start_date_str.replace('/', '-')}.txt")
        with open(tmp_pdf, "wb") as f: f.write(raw[idx:])
        subprocess.run(["pdftotext", "-layout", tmp_pdf, tmp_txt], check=True)
        with open(tmp_txt, "r") as f: lines = f.readlines()

        return self._parse_pnl_lines(lines)

    def _parse_pnl_lines(self, lines):
        pnl = {
            "total_sales": 0.0,
            "cost_of_goods": 0.0,
            "gross_profit": 0.0,
            "operating_expenses": 0.0,
            "net_profit": 0.0,
            "profit_margin": 0.0
        }
        for line in lines:
            line_str = line.strip()
            if "Total Sales Revenue" in line_str or "Total Income" in line_str:
                parts = re.findall(r'[\d,]+\.?\d*', line_str)
                if parts: pnl["total_sales"] = float(parts[0].replace(",", ""))
            elif "Total Cost of Goods Sold" in line_str:
                parts = re.findall(r'[\d,]+\.?\d*', line_str)
                if parts: pnl["cost_of_goods"] = float(parts[0].replace(",", ""))
            elif "Total General & Administrative" in line_str:
                parts = re.findall(r'[\d,]+\.?\d*', line_str)
                if parts: pnl["operating_expenses"] = float(parts[0].replace(",", ""))
            elif "Calculated Return" in line_str:
                parts = re.findall(r'[\d,]+\.?\d*', line_str)
                if parts: pnl["net_profit"] = float(parts[0].replace(",", ""))

        pnl["gross_profit"] = pnl["total_sales"] - pnl["cost_of_goods"]
        if pnl["total_sales"] > 0:
            pnl["profit_margin"] = round((pnl["net_profit"] / pnl["total_sales"]) * 100, 1)
        return pnl

    def fetch_debtors(self, end_date_str):
        """Fetch Aged Debtors (REP_ID 102)"""
        payload = {
            'REP_ID': '102',
            'Class': '0',
            'PARAM_0': end_date_str,
            'PARAM_1': '',
            'PARAM_2': '',
            'PARAM_3': '0',
            'PARAM_4': '0',
            'PARAM_5': '0',
            'PARAM_6': '0',
            'PARAM_8': '0',
            'PARAM_9': '0',
            'Rep102': 'Display'
        }
        resp = self.session.post(f"{self.base_url}/reporting/reports_main.php", data=payload)
        raw = resp.content
        idx = raw.find(b"%PDF-")
        if idx == -1:
            return {"total_debtors": 0.0, "current": 0.0, "days_1_30": 0.0, "days_31_60": 0.0, "over_60": 0.0, "customers": []}

        tmp_pdf = os.path.join(RAW_EXPORTS_DIR, f"debtors_{end_date_str.replace('/', '-')}.pdf")
        tmp_txt = os.path.join(RAW_EXPORTS_DIR, f"debtors_{end_date_str.replace('/', '-')}.txt")
        with open(tmp_pdf, "wb") as f: f.write(raw[idx:])
        subprocess.run(["pdftotext", "-layout", tmp_pdf, tmp_txt], check=True)
        with open(tmp_txt, "r") as f: lines = f.readlines()

        return self._parse_debtors_lines(lines)

    def _parse_debtors_lines(self, lines):
        debtors = {
            "total_debtors": 0.0,
            "current": 0.0,
            "days_1_30": 0.0,
            "days_31_60": 0.0,
            "over_60": 0.0,
            "customers": []
        }

        # Matches customer header row: NAME followed by NGN and 5 numbers
        cust_pattern = re.compile(r"^\s*([A-Za-z0-9\s\.\-_&/'#]+?)\s+(NGN|[A-Z]{3})\s+([\d,\.\-]+)\s+([\d,\.\-]+)\s+([\d,\.\-]+)\s+([\d,\.\-]+)\s+([\d,\.\-]+)\s*$")

        for line in lines:
            line_str = line.strip()
            if "Grand Total" in line_str:
                # Extract the 5 numbers: Current, 1-30, 31-60, Over 60, Total Balance
                parts = re.findall(r'[\d,]+\.\d{2}', line_str)
                if len(parts) >= 5:
                    debtors["current"] = float(parts[0].replace(",", ""))
                    debtors["days_1_30"] = float(parts[1].replace(",", ""))
                    debtors["days_31_60"] = float(parts[2].replace(",", ""))
                    debtors["over_60"] = float(parts[3].replace(",", ""))
                    debtors["total_debtors"] = float(parts[4].replace(",", ""))
                continue

            match = cust_pattern.match(line)
            if match:
                name = match.group(1).strip()
                if "Customer" in name or "Grand Total" in name:
                    continue
                try:
                    curr = float(match.group(3).replace(",", ""))
                    d1_30 = float(match.group(4).replace(",", ""))
                    d31_60 = float(match.group(5).replace(",", ""))
                    d_over = float(match.group(6).replace(",", ""))
                    total = float(match.group(7).replace(",", ""))
                    if total > 0: # Only list those actually owing money
                        debtors["customers"].append({
                            "name": name,
                            "current": curr,
                            "days_1_30": d1_30,
                            "days_31_60": d31_60,
                            "over_60": d_over,
                            "total_owed": total
                        })
                except Exception:
                    pass

        debtors["customers"].sort(key=lambda x: x["total_owed"], reverse=True)
        return debtors

    def fetch_full_monthly_bundle(self, start_date_str, end_date_str):
        sales = self.fetch_sales_summary(start_date_str, end_date_str)
        pnl = self.fetch_pnl(start_date_str, end_date_str)
        debtors = self.fetch_debtors(end_date_str)
        return {
            **sales,
            "pnl": pnl,
            "debtors": debtors
        }

if __name__ == "__main__":
    scraper = FrontAccountingScraper()
    scraper.login()
    print("Testing full bundle for June 2026...")
    bundle = scraper.fetch_full_monthly_bundle("06/01/2026", "06/30/2026")
    print(f"Sales: ₦{bundle['total_sales']:,.2f}")
    print(f"Net Profit: ₦{bundle['pnl']['net_profit']:,.2f} ({bundle['pnl']['profit_margin']}%)")
    print(f"Total Debtors: ₦{bundle['debtors']['total_debtors']:,.2f}")
