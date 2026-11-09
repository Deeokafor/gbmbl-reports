import os
import re
import requests
from bs4 import BeautifulSoup

def read_env():
    env_vars = {}
    if os.path.exists(".env"):
        with open(".env") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env_vars[k.strip()] = v.strip().strip('"').strip("'")
    return env_vars

env = read_env()
BASE_URL = "https://goodeybestmultibiz.com.ng/erp"
USERNAME = env.get("username")
PASSWORD = env.get("password")

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
})

def test_login():
    login_url = f"{BASE_URL}/index.php"
    resp = session.get(login_url)
    print(f"Login page status: {resp.status_code}")
    
    soup = BeautifulSoup(resp.text, "html.parser")
    token_input = soup.find("input", {"name": "_token"})
    token = token_input.get("value", "") if token_input else ""
    print(f"Token extracted: {token[:10]}...")
    
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
    
    post_resp = session.post(f"{BASE_URL}/index.php", data=payload)
    print(f"Post-login status: {post_resp.status_code}, URL: {post_resp.url}")
    
    # Check if logged in by accessing reports page
    rep_resp = session.get(f"{BASE_URL}/reporting/reports_main.php?Class=0")
    if "Login" in rep_resp.text and "user_name_entry_field" in rep_resp.text:
        print("Login failed or redirected back to login.")
        return False
    else:
        print("Login SUCCESSFUL! Reports page accessed.")
        # Find available forms or reports
        rep_soup = BeautifulSoup(rep_resp.text, "html.parser")
        print("Page title:", rep_soup.title.string if rep_soup.title else "No title")
        return True

if __name__ == "__main__":
    test_login()
