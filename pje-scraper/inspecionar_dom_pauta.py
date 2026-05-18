"""
Conecta ao Chrome já aberto e inspeciona o DOM da pauta PJe
para descobrir os seletores corretos dos campos De/Até.
Execute com: python inspecionar_dom_pauta.py
"""
import os, time
from pathlib import Path
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

load_dotenv(Path(__file__).parent / ".env")
PORT = int(os.getenv("CHROME_DEBUG_PORT", "9222"))

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
    ctx = browser.contexts[0]

    # Encontrar aba com pauta
    page = None
    for pg in ctx.pages:
        if "pauta-usuarios-externos" in pg.url:
            page = pg
            print(f"Aba encontrada: {pg.url}")
            break

    if not page:
        print("Nenhuma aba com pauta encontrada. Abra a pauta manualmente.")
        exit(1)

    # Inspecionar inputs de data
    print("\n--- Todos os INPUTs da página ---")
    inputs = page.locator("input").all()
    for i, inp in enumerate(inputs):
        try:
            ph = inp.get_attribute("placeholder") or ""
            cls = inp.get_attribute("class") or ""
            typ = inp.get_attribute("type") or ""
            name = inp.get_attribute("name") or ""
            aria = inp.get_attribute("aria-label") or ""
            vis = inp.is_visible()
            print(f"  [{i}] type={typ!r} placeholder={ph!r} name={name!r} aria={aria!r} visible={vis}")
            print(f"       class={cls[:80]!r}")
        except Exception as e:
            print(f"  [{i}] erro: {e}")

    print("\n--- p-calendar elements ---")
    cals = page.locator("p-calendar").all()
    print(f"  p-calendar count: {len(cals)}")
    for i, cal in enumerate(cals):
        try:
            print(f"  [{i}] outer: {cal.inner_html()[:200]}")
        except Exception as e:
            print(f"  [{i}] erro: {e}")

    print("\n--- Inputs dentro de p-calendar ---")
    cal_inputs = page.locator("p-calendar input").all()
    print(f"  count: {len(cal_inputs)}")

    print("\n--- Inputs com placeholder vazio ---")
    for i, inp in enumerate(inputs):
        try:
            if inp.is_visible():
                ph = inp.get_attribute("placeholder") or ""
                if not ph or ph in ["", " "]:
                    print(f"  [{i}] sem placeholder, class={inp.get_attribute('class')[:60]!r}")
        except Exception:
            pass

    print("\n--- Labels De / Até ---")
    for txt in ["De", "Até", "De *", "Até *", "Data"]:
        labels = page.locator(f"label:has-text('{txt}'), span:has-text('{txt}')").all()
        for l in labels[:3]:
            try:
                print(f"  label '{txt}': {l.inner_html()[:100]}")
            except Exception:
                pass

    print("\nDOM do filtro completo:")
    try:
        filtro = page.locator(".p-panel, .filtro, form, [class*='filter'], [class*='search']").first
        print(filtro.inner_html()[:2000])
    except Exception as e:
        print(f"  erro: {e}")
