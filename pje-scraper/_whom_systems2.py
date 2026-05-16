"""
Busca sistemas TRT/PJe no Whom - versao corrigida
"""
import requests, time
from playwright.sync_api import sync_playwright

CDP = "http://127.0.0.1:9222"
EXT = "chrome-extension://lnidijeaekolpfeckelhkomndglcglhh/index.html"

for t in requests.get(f"{CDP}/json/list").json():
    if "lnidijeaek" in t.get("url",""):
        requests.get(f"{CDP}/json/close/{t['id']}")
requests.put(f"{CDP}/json/new?{EXT}")
time.sleep(2.5)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(CDP)
    page = None
    for ctx in browser.contexts:
        for pg in ctx.pages:
            if "lnidijeaek" in pg.url:
                page = pg; break
    time.sleep(2.5)
    
    # Fechar NPS apenas se visível
    nps = page.locator("button:has-text('Responder depois')")
    try:
        if nps.count() > 0:
            nps.wait_for(state="visible", timeout=3000)
            nps.click()
            print("[OK] NPS fechado")
            time.sleep(1)
    except Exception:
        print("[INFO] NPS nao visivel, continuando...")

    # Clicar no certificado (item não-disabled no menu de cert)
    cert_item = page.locator("[role='menuitem']:not([disabled])").first
    try:
        cert_item.wait_for(state="visible", timeout=5000)
        txt = cert_item.inner_text().strip()
        print(f"[INFO] Primeiro item visivel: {txt!r}")
        cert_item.click()
        print("[OK] Clicou no primeiro item")
        time.sleep(2)
    except Exception as e:
        print(f"[ERRO] {e}")

    # Buscar por varios termos no campo de sistema
    si = page.locator("input[placeholder*='sistema']")
    try:
        si.wait_for(state="visible", timeout=5000)
    except Exception:
        print("[ERRO] Campo de sistema nao encontrado")
        # Listar todos inputs
        for inp in page.locator("input").all():
            print(f"  input: placeholder={inp.get_attribute('placeholder')!r}")
        exit(1)

    for term in ["", "TRT", "Pje", "trabalhista", "tribunal"]:
        si.click()
        si.fill(term)
        time.sleep(1.5)
        items = [it for it in page.locator("[role='menuitem']").all() if it.is_visible()]
        print(f"\nBusca '{term}' -> {len(items)} items:")
        for item in items:
            try: print(f"  - {item.inner_text().strip()[:80]!r}")
            except: pass
