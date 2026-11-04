# probe_login.py — ログインページの構造を確認するだけ(認証情報は不要)
# 依存: pip install requests beautifulsoup4 lxml
import requests
from bs4 import BeautifulSoup

URL = "https://nihs.managebac.com/login"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

r = requests.get(URL, headers={"User-Agent": UA}, timeout=20, allow_redirects=True)
print("status:", r.status_code, "| final url:", r.url)

soup = BeautifulSoup(r.text, "lxml")

print("\n--- forms ---")
for i, f in enumerate(soup.find_all("form")):
    print(f"[form {i}] method={f.get('method')} action={f.get('action')}")
    for inp in f.find_all(["input", "button"]):
        t = inp.get("type")
        name = inp.get("name")
        # hiddenの値(トークン)は伏せる
        val = "<hidden>" if t == "hidden" else inp.get("value")
        print(f"   {inp.name} type={t} name={name} value={val}")

print("\n--- SSO / external login candidates ---")
for a in soup.find_all("a", href=True):
    h = a["href"].lower()
    if any(k in h for k in ("google", "microsoft", "saml", "oauth", "sso", "auth")):
        print(" ", a.get_text(" ", strip=True), "->", a["href"])

print("\n--- title ---")
print(soup.title.get_text(strip=True) if soup.title else None)