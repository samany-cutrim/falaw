"""Inspeciona a resposta real da API de calendario do Projuris ADV."""
import json
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

USER = "controladoria@falaw.com.br"
PASS = "Falaw@26"
responses = []
all_headers = []

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context()
    page = ctx.new_page()

    def on_response(resp):
        if "calendario/consulta-sem-paginacao" in resp.url:
            try:
                body = resp.json()
                responses.append({"url": resp.url, "status": resp.status, "body": body})
            except Exception as e:
                responses.append({"url": resp.url, "status": resp.status, "body": str(e)})

    def on_request(req):
        if "service.projurisadv.com.br" in req.url and not all_headers:
            all_headers.append(dict(req.headers))

    page.on("response", on_response)
    page.on("request", on_request)

    page.goto("https://app.projurisadv.com.br", wait_until="networkidle", timeout=30000)
    try:
        page.wait_for_url("**/login.projurisadv.com.br/**", timeout=10000)
    except PWTimeout:
        pass
    page.wait_for_selector("input[name='username']", timeout=15000)
    page.fill("input[name='username']", USER)
    page.fill("input[type='password']", PASS)
    page.click("button[type='submit']")
    page.wait_for_url("https://app.projurisadv.com.br/**", timeout=30000)
    page.goto("https://app.projurisadv.com.br/home/calendario",
              wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(6000)
    browser.close()

print("=" * 60)
print(f"Respostas do calendario capturadas: {len(responses)}")
for r in responses[:1]:
    print(f"\nStatus: {r['status']}")
    body = r["body"]
    if isinstance(body, dict):
        grupos = body.get("tarefasAgrupadasDataTipoWs", [])
        print(f"Grupos: {len(grupos)}")
        todos_items = []
        for grupo in grupos:
            for k in ("tarefas", "listaTarefas", "items"):
                v = grupo.get(k)
                if isinstance(v, list):
                    todos_items.extend(v)
                    break
            else:
                for v in grupo.values():
                    if isinstance(v, list) and v and isinstance(v[0], dict):
                        todos_items.extend(v)
                        break
        print(f"Total de tarefas: {len(todos_items)}")

        # Mostra tipos distintos
        tipos = {}
        for t in todos_items:
            tp = (t.get("tipoTarefa") or t.get("tipoEvento") or t.get("tipo") or
                  t.get("descricaoTipoTarefa") or "?")
            tipos[tp] = tipos.get(tp, 0) + 1
        print("\nTipos encontrados:")
        for tp, cnt in sorted(tipos.items(), key=lambda x: -x[1]):
            print(f"  {cnt:3d}x  {tp}")

        # Mostra todas as chaves do primeiro item
        if todos_items:
            print("\nChaves do primeiro item:")
            print(list(todos_items[0].keys()))
            print("\nPrimeiro item completo:")
            print(json.dumps(todos_items[0], ensure_ascii=False, default=str, indent=2)[:1000])

