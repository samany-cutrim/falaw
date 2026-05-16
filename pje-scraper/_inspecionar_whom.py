from playwright.sync_api import sync_playwright
import time

EXT_URL = "chrome-extension://lnidijeaekolpfeckelhkomndglcglhh/index.html"

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    ctx = browser.contexts[0]
    bridge = ctx.new_page()
    bridge.goto("about:blank")

    with ctx.expect_page(timeout=10000) as popup_info:
        bridge.evaluate(f"window.open('{EXT_URL}', '_blank')")

    page = popup_info.value
    page.wait_for_load_state("domcontentloaded")
    time.sleep(2)

    inputs = page.locator("input").all()
    print(f"\nTotal inputs: {len(inputs)}")
    for i, inp in enumerate(inputs):
        ph  = inp.get_attribute("placeholder") or ""
        tp  = inp.get_attribute("type") or ""
        cls = inp.get_attribute("class") or ""
        print(f"  [{i}] type={tp!r} placeholder={ph!r} class={cls[:80]!r}")

    btns = page.locator("button").all()
    print(f"\nTotal buttons: {len(btns)}")
    for b in btns:
        try:
            print(f"  btn: {b.inner_text()[:80]!r}")
        except Exception:
            pass

    # Dump parcial do HTML para diagnóstico
    html = page.content()
    print("\n--- HTML parcial (primeiros 3000 chars) ---")
    print(html[:3000])

    page.close()
    bridge.close()
