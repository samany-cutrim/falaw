"""
Testa login no Projuris ADV simulando o formulário HTML do Keycloak com requests.
Sem Playwright — só HTTP puro.
"""
import re
import requests
from urllib.parse import urlparse, parse_qs, urljoin

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
})

CLIENT_ID    = "adv-view-js-app-sajadv"
REDIRECT_URI = "https://app.projurisadv.com.br/"
AUTH_BASE    = "https://login.projurisadv.com.br/realms/projurisadv-realm"
TOKEN_URL    = f"{AUTH_BASE}/protocol/openid-connect/token"
AUTH_URL     = (
    f"{AUTH_BASE}/protocol/openid-connect/auth"
    f"?response_type=code"
    f"&client_id={CLIENT_ID}"
    f"&redirect_uri={REDIRECT_URI}"
)

USERNAME = "controladoria@falaw.com.br"
PASSWORD = "Falaw@26"

# ── 1. Abre página de login do Keycloak ──────────────────────────────────────
print("1. GET página de login...")
r = SESSION.get(AUTH_URL, allow_redirects=True, timeout=15)
print(f"   Status: {r.status_code}  URL final: {r.url[:80]}")

# Extrai action do <form>
m = re.search(r'<form[^>]+action="([^"]+)"', r.text)
if not m:
    print("   ERRO: form não encontrado na página de login")
    print(r.text[:800])
    exit(1)

form_action = m.group(1).replace("&amp;", "&")
print(f"   Form action: {form_action[:100]}")

# Extrai campos ocultos (execution, _charset_, etc.)
hidden = dict(re.findall(r'<input[^>]+type="hidden"[^>]+name="([^"]*)"[^>]+value="([^"]*)"', r.text))
hidden.update(dict(re.findall(r'<input[^>]+name="([^"]*)"[^>]+type="hidden"[^>]+value="([^"]*)"', r.text)))
print(f"   Campos ocultos: {list(hidden.keys())}")

# ── 2. Submete credenciais ────────────────────────────────────────────────────
print("\n2. POST credenciais...")
payload = {**hidden, "username": USERNAME, "password": PASSWORD, "credentialId": ""}
r2 = SESSION.post(form_action, data=payload, allow_redirects=False, timeout=15)
print(f"   Status: {r2.status_code}")
location = r2.headers.get("Location", "")
print(f"   Location: {location[:120]}")

# Segue redirects manualmente para capturar o code
code = ""
current_url = location
for i in range(8):
    if not current_url:
        break
    parsed = urlparse(current_url)
    qs = parse_qs(parsed.query)
    if "code" in qs:
        code = qs["code"][0]
        print(f"   Authorization code obtido na iteração {i}: {code[:20]}...")
        break
    if "error" in qs:
        print(f"   Keycloak erro: {qs}")
        break
    # Segue o redirect
    r_next = SESSION.get(current_url, allow_redirects=False, timeout=15)
    print(f"   [{i}] {r_next.status_code} -> {r_next.headers.get('Location','')[:80]}")
    current_url = r_next.headers.get("Location", "")

if not code:
    print("\nERRO: authorization code não capturado")
    exit(1)

# ── 3. Troca code por token ───────────────────────────────────────────────────
print("\n3. Troca code por Bearer token...")
r3 = SESSION.post(TOKEN_URL, data={
    "grant_type":    "authorization_code",
    "client_id":     CLIENT_ID,
    "redirect_uri":  REDIRECT_URI,
    "code":          code,
}, timeout=15)
print(f"   Status: {r3.status_code}")

if r3.ok:
    body = r3.json()
    token = body.get("access_token", "")
    print(f"   Token obtido: {token[:40]}...")
    print(f"   expires_in: {body.get('expires_in')}s")

    # ── 4. Testa chamada ao calendário ───────────────────────────────────────
    print("\n4. Testando API do calendário...")
    from datetime import date, timedelta
    hoje = date.today().isoformat()
    fim  = (date.today() + timedelta(days=30)).isoformat()
    cal_r = SESSION.post(
        "https://service.projurisadv.com.br/adv-service/v2/tarefa/calendario/consulta-sem-paginacao",
        json={
            "dataTarefaInicio": f"{hoje}T00:00:00.000Z",
            "dataTarefaFim":    f"{fim}T00:00:00.000Z",
            "visaoPessoal":     True,
            "tipoFiltroTarefaConsulta": "TODOS",
            "usuariosResponsaveis": None,
        },
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
            "Accept":        "application/json",
            "Origin":        "https://app.projurisadv.com.br",
            "Referer":       "https://app.projurisadv.com.br/",
        },
        timeout=20,
    )
    print(f"   Calendário status: {cal_r.status_code}")
    print(f"   Resposta: {cal_r.text[:300]}")
else:
    print(f"   Erro: {r3.text[:300]}")
