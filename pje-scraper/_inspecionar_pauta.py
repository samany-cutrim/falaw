"""
Diagnóstico: abre a pauta do TRT-1 e faz dump do HTML + estrutura de tabela.
Rode com Chrome já aberto na porta 9222.
"""
from playwright.sync_api import sync_playwright
import time

TRT_BASE = "https://pje.trt2.jus.br"  # Altere para o TRT onde você está logado

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    ctx = browser.contexts[0]
    page = ctx.new_page()

    url = f"{TRT_BASE}/pjekz/pauta-usuarios-externos"
    print(f"\nNavegando para: {url}")
    page.goto(url, timeout=30000, wait_until="domcontentloaded")
    time.sleep(5)

    print(f"URL atual: {page.url}")
    print(f"Título: {page.title()}")

    # Verificar elementos de tabela
    for sel in [
        ".p-datatable-tbody > tr",
        "p-table .p-datatable-tbody > tr",
        "table tbody tr",
        "[class*='datatable'] tbody tr",
        "tr",
    ]:
        n = page.locator(sel).count()
        print(f"  {sel!r}: {n} elementos")

    # Listar classes de elementos principais
    print("\nPrimeiros 20 elementos com classe contendo 'table' ou 'datatable' ou 'row':")
    elems = page.locator("[class*='table'],[class*='datatable'],[class*='row'],[class*='linha']").all()[:20]
    for e in elems:
        tag = e.evaluate("el => el.tagName")
        cls = e.get_attribute("class") or ""
        print(f"  <{tag}> class={cls[:100]!r}")

    # Dump parcial do HTML
    html = page.content()
    print("\n--- HTML (3000 chars a partir do <body>) ---")
    body_start = html.find("<body")
    print(html[body_start:body_start+3000] if body_start >= 0 else html[:3000])

    page.close()
