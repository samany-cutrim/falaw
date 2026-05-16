import requests, time
from playwright.sync_api import sync_playwright

CDP = "http://127.0.0.1:9222"
EXT = "chrome-extension://lnidijeaekolpfeckelhkomndglcglhh/index.html"

for t in requests.get(f"{CDP}/json/list").json():
    if "lnidijeaek" in t.get("url",""):
        requests.get(f"{CDP}/json/close/{t['id']}")
requests.put(f"{CDP}/json/new?{EXT}")
time.sleep(2)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(CDP)
    page = None
    for ctx in browser.contexts:
        for pg in ctx.pages:
            if "lnidijeaek" in pg.url:
                page = pg; break
    time.sleep(2.5)
    nps = page.locator("button:has-text('Responder depois')")
    if nps.count(): nps.click(); time.sleep(1)
    
    si = page.locator("input[placeholder*='sistema']")
    si.click(); time.sleep(0.3)
    
    for term in ["TRT", "Pje", "trabalhista", ""]:
        si.fill(term)
        time.sleep(1.2)
        items = page.locator("[role='menuitem']").all()
        visible = [it for it in items if it.is_visible()]
        print(f"Busca '{term}' -> {len(visible)} items:")
        for item in visible:
            try: print(f"  - {item.inner_text().strip()[:80]!r}")
            except: pass
        print()
