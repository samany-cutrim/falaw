"""
Diagnóstico: abre Chrome com launch_persistent_context (Profile 9)
e navega direto para o popup do Whom para fazer dump do DOM real.
Chrome NÃO pode estar aberto quando rodar este script.
Resultado salvo em _whom_dom.txt
"""
from playwright.sync_api import sync_playwright
import time
import os
import glob

USER_DATA = r"C:\Users\manyc\AppData\Local\Google\Chrome\User Data"
PROFILE   = "Profile 9"
EXT_ID    = "lnidijeaekolpfeckelhkomndglcglhh"

# Remover lock files do Chrome para evitar "sessão existente"
for lock_pattern in [
    os.path.join(USER_DATA, "SingletonLock"),
    os.path.join(USER_DATA, "SingletonSocket"),
    os.path.join(USER_DATA, "SingletonCookie"),
    os.path.join(USER_DATA, PROFILE, "SingletonLock"),
    os.path.join(USER_DATA, PROFILE, "SingletonSocket"),
]:
    if os.path.exists(lock_pattern):
        os.remove(lock_pattern)
        print(f"Removido: {lock_pattern}")

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        USER_DATA,
        channel="chrome",
        headless=False,
        args=[
            f"--profile-directory={PROFILE}",
            "--no-first-run",
            "--no-default-browser-check",
        ],
        ignore_default_args=["--enable-automation", "--disable-extensions"],
    )

    page = ctx.new_page()
    url = f"chrome-extension://{EXT_ID}/index.html"
    page.goto(url, timeout=15000)
    time.sleep(3)

    inputs = page.locator("input").all()
    btns   = page.locator("button").all()
    sels   = page.locator("select, [role='listbox'], [role='combobox'], p-dropdown, mat-select").all()
    html   = page.content()

    resultado = []
    resultado.append(f"URL atual: {page.url}")
    resultado.append(f"Título: {page.title()}")
    resultado.append(f"\nTotal inputs: {len(inputs)}")
    for i, inp in enumerate(inputs):
        resultado.append(f"  [{i}] type={inp.get_attribute('type')!r} name={inp.get_attribute('name')!r} placeholder={inp.get_attribute('placeholder')!r} class={str(inp.get_attribute('class') or '')[:80]!r}")
    resultado.append(f"\nTotal buttons: {len(btns)}")
    for b in btns:
        try:
            resultado.append(f"  btn: {b.inner_text()[:80]!r}  class={str(b.get_attribute('class') or '')[:60]!r}")
        except Exception:
            pass
    resultado.append(f"\nTotal selects/dropdowns: {len(sels)}")
    for s in sels:
        tag = s.evaluate("el => el.tagName")
        resultado.append(f"  <{tag}> class={str(s.get_attribute('class') or '')[:80]!r}")
    resultado.append("\n--- HTML (6000 chars) ---")
    body_start = html.find("<body")
    resultado.append(html[body_start:body_start+6000] if body_start >= 0 else html[:6000])

    with open("_whom_dom.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(resultado))

    time.sleep(1)
    ctx.close()
