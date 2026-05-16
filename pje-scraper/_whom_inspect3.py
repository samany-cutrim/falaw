"""
Inspeciona o Whom passo a passo:
1. Abre extensão
2. Fecha NPS
3. Clica no CERTIFICADO especificamente
4. Limpa o campo de sistema e lista todos os sistemas disponíveis
"""
import requests, time
from playwright.sync_api import sync_playwright

EXT_URL  = "chrome-extension://lnidijeaekolpfeckelhkomndglcglhh/index.html"
CDP_URL  = "http://127.0.0.1:9222"
CERT_NAME = "Tatiana"

# Fechar abas do Whom anteriores
for t in requests.get(f"{CDP_URL}/json/list").json():
    if "lnidijeaek" in t.get("url", ""):
        requests.get(f"{CDP_URL}/json/close/{t['id']}")

requests.put(f"{CDP_URL}/json/new?{EXT_URL}")
time.sleep(2)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(CDP_URL)
    page = None
    for ctx in browser.contexts:
        for pg in ctx.pages:
            if "lnidijeaek" in pg.url:
                page = pg; break
    if not page:
        print("Whom nao abriu"); exit(1)

    time.sleep(2.5)

    # 1. Fechar NPS
    nps_btn = page.locator("button:has-text('Responder depois')")
    if nps_btn.count() > 0 and nps_btn.is_visible():
        nps_btn.click()
        print("[OK] NPS fechado")
        time.sleep(1)

    # 2. Certificado - clicar diretamente no item "Tatiana" na lista
    cert_input = page.locator("input[placeholder='Pesquise por certificado']")
    if cert_input.count() > 0 and cert_input.is_visible():
        cert_input.click()
        print("[OK] Cert input clicado")
        time.sleep(0.5)
    
    cert_item = page.locator(f"[role='menuitem']:has-text('{CERT_NAME}')").first
    if cert_item.count() > 0:
        cert_item.click()
        print(f"[OK] Cert selecionado: {CERT_NAME}")
        time.sleep(1.5)
    else:
        print(f"[ERRO] Cert '{CERT_NAME}' nao encontrado")

    # 3. Ver o campo de sistema
    sys_input = page.locator("input[placeholder*='sistema']")
    if sys_input.count() > 0:
        val = sys_input.get_attribute("value") or ""
        print(f"[INFO] Sistema atual: {val!r}")
        
        # Limpar campo (clicar no X)
        clear_btn = page.locator("button.sc-hjGZqJ")
        if clear_btn.count() > 0 and clear_btn.is_visible():
            clear_btn.click()
            print("[OK] Campo de sistema limpo")
            time.sleep(0.5)
        else:
            # Tentar triple_click e delete
            sys_input.click()
            sys_input.press("Control+a")
            sys_input.press("Backspace")
            time.sleep(0.3)
        
        # Listar todos os sistemas no dropdown
        items = page.locator("[role='menuitem']:not([disabled])").all()
        print(f"\nSistemas disponíveis ({len(items)}):")
        for item in items:
            try:
                txt = item.inner_text().strip().replace("\n", " ")
                print(f"  - {txt!r}")
            except Exception: pass
        
        # Salvar HTML do estado atual
        html = page.content()
        with open("pje-scraper/_whom_dom3.txt", "w", encoding="utf-8") as f:
            f.write(html)
        print("\nHTML salvo em _whom_dom3.txt")
    else:
        print("[ERRO] Campo de sistema nao encontrado")
        inputs = page.locator("input").all()
        for i, inp in enumerate(inputs):
            print(f"  [{i}] placeholder={inp.get_attribute('placeholder')!r}")
