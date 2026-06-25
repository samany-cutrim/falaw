"""Teste de login e interceptacao de requisicoes Projuris ADV."""
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

USER = "controladoria@falaw.com.br"
PASS = "Falaw@26"
captured_token = []
captured_requests = []

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context()
    page = ctx.new_page()

    def on_request(req):
        url = req.url
        if "service.projurisadv.com.br" not in url:
            return
        auth = req.headers.get("authorization", "")
        if auth.lower().startswith("bearer ") and not captured_token:
            captured_token.append(auth.split(" ", 1)[1].strip())
            print("Token capturado!")
        if any(k in url for k in ["calendario", "tarefa", "audiencia"]):
            entry = {"method": req.method, "url": url}
            try:
                entry["post_data"] = req.post_data
            except Exception:
                pass
            captured_requests.append(entry)
            print(f"  -> {req.method} {url}")
            if req.post_data:
                print(f"     body: {req.post_data[:500]}")

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
    print("Login OK:", page.url[:80])

    print("\nNavegando para /home/calendario...")
    page.goto("https://app.projurisadv.com.br/home/calendario",
              wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(6000)
    browser.close()

print("\n" + "="*60)
print(f"Token: {'SIM' if captured_token else 'NAO'}")
print(f"Requisicoes capturadas: {len(captured_requests)}")
for r in captured_requests:
    print(f"\n  {r['method']} {r['url']}")
    if r.get('post_data'):
        print(f"  body: {r['post_data'][:500]}")
