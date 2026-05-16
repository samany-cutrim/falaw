import requests, time
from playwright.sync_api import sync_playwright

EXT_URL = "chrome-extension://lnidijeaekolpfeckelhkomndglcglhh/index.html"

# Fechar aba anterior se existir
for t in requests.get("http://127.0.0.1:9222/json/list").json():
    if "lnidijeaek" in t.get("url", ""):
        requests.get(f"http://127.0.0.1:9222/json/close/{t['id']}")

requests.put(f"http://127.0.0.1:9222/json/new?{EXT_URL}")
time.sleep(2)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    page = None
    for ctx in browser.contexts:
        for pg in ctx.pages:
            if "lnidijeaek" in pg.url:
                page = pg
                break
    if not page:
        print("NAO ACHOU")
        exit(1)

    time.sleep(2)

    # Fechar NPS se existir
    try:
        btn = page.locator("button:has-text('Responder depois')")
        if btn.count() > 0 and btn.is_visible():
            btn.click()
            print("NPS fechado")
            time.sleep(1.5)
    except Exception as e:
        print("NPS:", e)

    # Clicar no certificado
    try:
        cert = page.locator("[role='menuitem']:not([disabled])")
        print("Certs visíveis:", cert.count())
        if cert.count() > 0:
            cert.first.click()
            print("Cert clicado")
            time.sleep(2)
    except Exception as e:
        print("Cert:", e)

    # Dump
    html = page.content()
    with open("pje-scraper/_whom_dom2.txt", "w", encoding="utf-8") as f:
        f.write(html)

    # Listar novos buttons
    btns = page.locator("button").all()
    print(f"Buttons: {len(btns)}")
    for b in btns:
        try:
            txt = b.inner_text()[:80].strip()
            if txt:
                print(f"  btn: {txt!r}")
        except Exception:
            pass

    print("HTML2 salvo em pje-scraper/_whom_dom2.txt")
