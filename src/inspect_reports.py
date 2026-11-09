import os
import requests
from bs4 import BeautifulSoup
from test_login import read_env, BASE_URL

env = read_env()
USERNAME = env.get("username")
PASSWORD = env.get("password")

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
})

def login():
    resp = session.get(f"{BASE_URL}/index.php")
    soup = BeautifulSoup(resp.text, "html.parser")
    token = soup.find("input", {"name": "_token"}).get("value", "")
    payload = {
        "user_name_entry_field": USERNAME,
        "password": PASSWORD,
        "company_login_name": "0",
        "SubmitUser": "  Login -->  ",
        "ui_mode": "",
        "_focus": "user_name_entry_field",
        "_modified": "0",
        "_confirmed": "",
        "_token": token
    }
    session.post(f"{BASE_URL}/index.php", data=payload)

def inspect_reports():
    login()
    # Check Class=0 (Sales), Class=1 (Purchases), Class=2 (Inventory), Class=3 (GL)
    for class_id in range(4):
        url = f"{BASE_URL}/reporting/reports_main.php?Class={class_id}"
        resp = session.get(url)
        soup = BeautifulSoup(resp.text, "html.parser")
        print(f"\n================ Class {class_id} Reports ================")
        forms = soup.find_all("form")
        for form in forms:
            for a in form.find_all("a"):
                href = a.get("href", "")
                text = a.text.strip()
                if text and ("rep_id" in href or "Class" in href or "submit" in str(a)):
                    print(f"- {text} -> {href}")
            # Also check select options or list items
            for option in form.find_all("option"):
                print(f"  Option: {option.text.strip()} (value: {option.get('value')})")
            for input_btn in form.find_all("input", {"type": "submit"}):
                print(f"  Button: {input_btn.get('value')} (name: {input_btn.get('name')})")

if __name__ == "__main__":
    inspect_reports()
