import requests, time
from playwright.sync_api import sync_playwright

EXT_URL = "chrome-extension://lnidijeaekolpfeckelhkomndglcglhh/index.html"

# Criar aba via CDP raw
r = requests.put(f"http://127.0.0.1:9222/json/new?{EXT_URL}")
tab_id = r.json()["id"]
print("Tab ID:", tab_id)
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
        print("Aba nao encontrada!")
    else:
        print("URL:", page.url)
        time.sleep(2)
        inputs = page.locator("input").all()
        btns   = page.locator("button").all()
        sels   = page.locator("select,[role='listbox'],[role='combobox'],p-dropdown").all()
        print(f"Inputs: {len(inputs)}, Buttons: {len(btns)}, Selects: {len(sels)}")
        for i, inp in enumerate(inputs):
            print(f"  [{i}] type={inp.get_attribute('type')!r} placeholder={inp.get_attribute('placeholder')!r} class={str(inp.get_attribute('class') or '')[:80]!r}")
        for b in btns:
            try: print(f"  btn: {b.inner_text()[:60]!r}")
            except: pass
        html = page.content()
        with open("pje-scraper/_whom_dom.txt", "w", encoding="utf-8") as f:
            f.write(html)
        print("HTML salvo em pje-scraper/_whom_dom.txt")
