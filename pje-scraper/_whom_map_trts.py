"""
Mapeia TODOS os sistemas TRT disponiveis no Whom
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
    
    nps = page.locator("button:has-text('Responder depois')")
    try:
        nps.wait_for(state="visible", timeout=2000)
        nps.click(); time.sleep(1)
    except Exception:
        pass

    # Selecionar certificado
    cert_item = page.locator("[role='menuitem']:not([disabled])").first
    try:
        cert_item.wait_for(state="visible", timeout=5000)
        cert_item.click(); time.sleep(2)
    except Exception as e:
        print(f"Cert err: {e}")

    si = page.locator("input[placeholder*='sistema']")
    si.wait_for(state="visible", timeout=5000)

    all_systems = set()
    
    # Buscar TRT por numero (1 a 24)
    for n in range(1, 25):
        si.click()
        si.fill(f"TRT{n} ")
        time.sleep(1)
        items = [it for it in page.locator("[role='menuitem']").all() if it.is_visible()]
        for item in items:
            try:
                txt = item.inner_text().strip()
                if txt:
                    all_systems.add(txt)
            except: pass

    # Buscar TST
    for term in ["TST", "JTE"]:
        si.click()
        si.fill(term)
        time.sleep(1)
        items = [it for it in page.locator("[role='menuitem']").all() if it.is_visible()]
        for item in items:
            try:
                txt = item.inner_text().strip()
                if txt:
                    all_systems.add(txt)
            except: pass

    trt_systems = sorted([s for s in all_systems if any(x in s for x in ["TRT", "TST", "JTE"])])
    print(f"\nTotal sistemas TRT/TST encontrados: {len(trt_systems)}")
    for s in trt_systems:
        print(f"  {s!r}")
