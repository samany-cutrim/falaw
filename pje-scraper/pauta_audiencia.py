"""
pauta_audiencia.py — Pauta de Audiências via API Projuris ADV → Supabase | Falaw

Fluxo:
  1. Autentica no Projuris ADV (bearer token via .env)
  2. Busca tarefas do calendário no período configurado
     Endpoint principal : /adv-service/v2/tarefa/calendario/consulta-sem-paginacao
     Fallback           : /adv-service/tarefa/consulta-com-paginacao
  3. Filtra audiências e normaliza os registros
  4. Faz upsert na tabela pauta_audiencias do Supabase

Uso:
    python pauta_audiencia.py                          # próximos DIAS_PAUTA dias
    python pauta_audiencia.py --inicio 2026-07-01 --fim 2026-07-31
    python pauta_audiencia.py --todas                  # todos os tipos de tarefa
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv

_HERE = Path(__file__).parent
load_dotenv(_HERE / ".env")

# ── Configuração ──────────────────────────────────────────────────────────────

PROJURIS_BASE = "https://service.projurisadv.com.br"

# Credenciais de login Projuris ADV (agenda controladoria)
_PROJURIS_USER     = "controladoria@falaw.com.br"
_PROJURIS_PASSWORD = "Falaw@26"

DIAS_PAUTA = int(os.getenv("DIAS_PAUTA", "365"))

SB_URL   = os.getenv("SUPABASE_URL", "").rstrip("/")
SB_KEY   = os.getenv("SUPABASE_KEY", "")
SB_TABLE = "pauta_audiencias"

_LOG_DIR = _HERE / "logs"
_LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_LOG_DIR / "pauta_audiencia.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)


# ── Autenticação Projuris ADV via Playwright (login pelo browser) ─────────────

_token_cache: dict = {"token": "", "expires_at": 0.0}

_APP_LOGIN_URL    = "https://app.projurisadv.com.br"
_APP_CALENDAR_URL = "https://app.projurisadv.com.br/home/calendario"
_SERVICE_HOST     = "service.projurisadv.com.br"


def _obter_token_playwright() -> str:
    """
    Abre o Projuris ADV no browser (headless), faz login com as credenciais
    embutidas e intercepta o Bearer token das requisições à API.
    Retorna o token capturado.
    """
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    log.info("Iniciando login Projuris ADV via browser (Playwright)…")
    captured: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        )
        page = ctx.new_page()

        # Intercepta requisições ao service para capturar o token
        def on_request(req):
            if _SERVICE_HOST in req.url:
                auth = req.headers.get("authorization", "")
                if auth.lower().startswith("bearer ") and not captured:
                    token = auth.split(" ", 1)[1].strip()
                    if len(token) > 20:
                        captured.append(token)
                        log.info("Bearer token capturado das requisições de rede.")

        page.on("request", on_request)

        # 1. Acessa a página de login (redireciona para Keycloak)
        page.goto(_APP_LOGIN_URL, wait_until="networkidle", timeout=30_000)

        # 2. Aguarda redirect para o Keycloak e carrega o formulário
        try:
            page.wait_for_url("**/login.projurisadv.com.br/**", timeout=15_000)
        except PWTimeout:
            pass

        # 3. Preenche e-mail/usuário
        page.wait_for_selector("input[name='username']", timeout=15_000)
        page.fill("input[name='username']", _PROJURIS_USER)
        log.info(f"Usuário preenchido: {_PROJURIS_USER}")

        # 4. Preenche senha
        page.fill("input[type='password']", _PROJURIS_PASSWORD)
        log.info("Senha preenchida.")

        # 5. Submete o formulário
        page.click("button[type='submit']")
        log.info("Formulário submetido.")

        # 6. Aguarda redirecionamento de volta para o app
        try:
            page.wait_for_url("https://app.projurisadv.com.br/**", timeout=30_000)
            log.info(f"Login OK — URL: {page.url}")
        except PWTimeout:
            log.warning(f"Timeout aguardando redirecionamento pós-login. URL: {page.url}")

        # 7. Navega para o calendário para disparar as chamadas de API e capturar o token
        if not captured:
            page.goto(_APP_CALENDAR_URL, wait_until="networkidle", timeout=30_000)
            page.wait_for_timeout(5_000)

        browser.close()

    if not captured:
        raise RuntimeError(
            "Não foi possível capturar o Bearer token. "
            "Verifique as credenciais ou o fluxo de login do Projuris ADV."
        )

    return captured[0]


def _obter_token() -> str:
    """Obtém (ou reutiliza do cache) o Bearer token via login no browser."""
    now = datetime.utcnow().timestamp()

    # Cache ainda válido (reutiliza por 50 min)
    if _token_cache["token"] and now < _token_cache["expires_at"] - 60:
        return _token_cache["token"]

    token = _obter_token_playwright()
    # Tokens Projuris expiram em ~1h; cache por 55 min
    _token_cache["token"]      = token
    _token_cache["expires_at"] = now + 3300

    # Fallback de emergência: token estático do .env
    if not token:
        static = os.getenv("PROJURIS_BEARER_TOKEN", "")
        if static:
            log.warning("Usando PROJURIS_BEARER_TOKEN estático do .env como fallback")
            return static
        raise RuntimeError("Falha ao obter token do Projuris ADV.")

    return token


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_obter_token()}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
        "Referer":       "https://app.projurisadv.com.br/",
        "Origin":        "https://app.projurisadv.com.br",
    }


# ── Busca de tarefas ──────────────────────────────────────────────────────────

def _extrair_lista(body) -> list[dict]:
    """Extrai lista de tarefas de qualquer formato de resposta do Projuris ADV."""
    if isinstance(body, list):
        return body
    if not isinstance(body, dict):
        return []

    # Formato v2: grupos por data/tipo — achata todos os grupos
    grupos = body.get("tarefasAgrupadasDataTipoWs")
    if grupos and isinstance(grupos, list):
        items: list[dict] = []
        for grupo in grupos:
            if isinstance(grupo, dict):
                # Cada grupo tem uma lista de tarefas (chave variável)
                for k in ("tarefas", "listaTarefas", "items", "data"):
                    v = grupo.get(k)
                    if isinstance(v, list):
                        items.extend(v)
                        break
                else:
                    # Tenta qualquer chave com lista
                    for v in grupo.values():
                        if isinstance(v, list) and v and isinstance(v[0], dict):
                            items.extend(v)
                            break
        if items:
            return items

    # Formatos legados
    return (
        body.get("content") or body.get("data") or
        body.get("tarefas") or body.get("items") or
        body.get("resultado") or []
    )


def buscar_calendario(data_inicio: str, data_fim: str) -> list[dict]:
    """POST /v2/tarefa/calendario/consulta-sem-paginacao com payload exato do app."""
    url = f"{PROJURIS_BASE}/adv-service/v2/tarefa/calendario/consulta-sem-paginacao"
    log.info(f"Calendario: {data_inicio} -> {data_fim}")
    payload = {
        "dataTarefaInicio": f"{data_inicio}T00:00:00.000Z",
        "dataTarefaFim":    f"{data_fim}T00:00:00.000Z",
        "visaoPessoal":     True,
        "tipoFiltroTarefaConsulta": "TODOS",
        "usuariosResponsaveis": None,
    }
    resp = requests.post(url, headers=_headers(), json=payload, timeout=30)
    resp.raise_for_status()
    result = _extrair_lista(resp.json())
    log.info(f"  Retornou {len(result)} itens")
    return result


def buscar_paginado(data_inicio: str, data_fim: str) -> list[dict]:
    """Fallback paginado caso o endpoint de calendario nao esteja disponivel."""
    all_rows: list[dict] = []
    pagina   = 0

    # Tenta endpoints paginados em ordem
    endpoints = [
        f"{PROJURIS_BASE}/adv-service/v2/tarefa/consulta-com-paginacao",
        f"{PROJURIS_BASE}/adv-service/tarefa/consulta-com-paginacao",
    ]

    for url in endpoints:
        all_rows = []
        pagina   = 0
        while True:
            log.info(f"  Pagina {pagina} ({url})")
            params = {
                "quan-registros":  100,
                "pagina":          pagina,
                "ordenacao-tipo":  "ASC",
                "ordenacao-chave": "ORDENACAO_DATA_PREVISTA",
                "dataInicio":      data_inicio,
                "dataFim":         data_fim,
            }
            try:
                resp = requests.get(url, headers=_headers(), params=params, timeout=30)
            except requests.RequestException:
                break
            if resp.status_code != 200:
                log.debug(f"  GET {url} → {resp.status_code}")
                break
            body  = resp.json()
            items = _extrair_lista(body)
            all_rows.extend(items)
            if not items or len(items) < 100:
                break
            if isinstance(body, dict):
                total = body.get("totalPages") or body.get("total_pages", 1)
                if pagina + 1 >= total:
                    break
            pagina += 1
        if all_rows:
            return all_rows

    return all_rows

    return all_rows


def buscar_feriados(data_inicio: str, data_fim: str) -> set[str]:
    url = f"{PROJURIS_BASE}/adv-service/feriado/consulta/data-inicio/{data_inicio}/data-fim/{data_fim}"
    try:
        resp = requests.get(url, headers=_headers(), timeout=15)
        if resp.status_code != 200:
            return set()
        feriados = _extrair_lista(resp.json())
        datas: set[str] = set()
        for f in feriados:
            d = (f.get("data") or f.get("dataFeriado") or f.get("date") or "") if isinstance(f, dict) else str(f)
            if d:
                datas.add(str(d)[:10])
        return datas
    except Exception as exc:
        log.warning(f"Feriados indisponiveis: {exc}")
        return set()


# ── Filtragem e normalizacao ──────────────────────────────────────────────────

import unicodedata

_TIPOS_AUDIENCIA = {
    "audiencia", "hearing", "julgamento", "conciliacao",
    "instrucao", "sessao", "pauta",
}


def _normaliza(s: str) -> str:
    """Remove acentos e converte para minúsculas."""
    n = unicodedata.normalize("NFD", s)
    return "".join(c for c in n if unicodedata.category(c) != "Mn").lower()


def _is_audiencia(item: dict) -> bool:
    # Projuris v2 usa 'nomeTarefaTipo'
    tipo = (
        item.get("nomeTarefaTipo") or item.get("tipoTarefa") or
        item.get("tipo_tarefa") or item.get("tipoEvento") or
        item.get("tipo") or ""
    )
    return any(t in _normaliza(str(tipo)) for t in _TIPOS_AUDIENCIA)


def _ms_to_dt(ms_val) -> datetime | None:
    """Converte timestamp em milissegundos para datetime."""
    if ms_val is None:
        return None
    try:
        return datetime.utcfromtimestamp(int(ms_val) / 1000)
    except (ValueError, TypeError, OSError):
        return None


def _parse_data_hora(item: dict) -> tuple[str, str]:
    data, hora = "", ""

    # Projuris v2: compromisso agendado tem dataInicioCompromisso / horaInicioCompromisso
    dt_ms = (item.get("dataInicioCompromisso") or
             item.get("dataLimite") or
             item.get("dataConclusaoPrevista"))
    hora_ms = item.get("horaInicioCompromisso") or item.get("horaLimite")

    if dt_ms:
        dt = _ms_to_dt(dt_ms)
        if dt:
            data = dt.strftime("%Y-%m-%d")
            hora = dt.strftime("%H:%M")

    # horaInicioCompromisso é também timestamp ms com a hora real
    if hora_ms:
        ht = _ms_to_dt(hora_ms)
        if ht:
            hora = ht.strftime("%H:%M")

    # Fallback: campos string convencionais
    if not data:
        for k in ("dataPrevista", "data_prevista", "dataAudiencia",
                  "dataInicio", "data_inicio", "data"):
            raw = item.get(k)
            if raw:
                for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M",
                            "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"):
                    try:
                        dt = datetime.strptime(str(raw)[:len(fmt)], fmt)
                        data = dt.strftime("%Y-%m-%d")
                        if not hora:
                            hora = dt.strftime("%H:%M")
                        break
                    except (ValueError, TypeError):
                        continue
                if data:
                    break

    return data, hora


def _make_id(processo: str, data: str, hora: str) -> str:
    raw = f"projuris-adv|{processo}|{data}|{hora}".encode()
    return "adv-" + hashlib.md5(raw).hexdigest()[:12]


def _str_parte(v) -> str:
    """Extrai nome de uma parte (pode ser string, dict ou list)."""
    if not v:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        return v.get("nome") or v.get("name") or v.get("valor") or str(v)
    if isinstance(v, list):
        return "; ".join(_str_parte(x) for x in v if x)
    return str(v)


def normalizar(item: dict) -> dict:
    data, hora = _parse_data_hora(item)

    processo = str(item.get("numeroProcesso") or item.get("numero_processo") or
                   item.get("processo") or item.get("nrProcesso") or "")

    reclamante = _str_parte(
        item.get("parteAtiva") or item.get("reclamante") or
        item.get("poloAtivo") or item.get("autor")
    )
    reclamada = _str_parte(
        item.get("partePassiva") or item.get("reclamada") or
        item.get("poloPassivo") or item.get("reu")
    )

    # tipo_audiencia: deixa em branco para evitar conflito com CHECK constraint
    tipo = ""

    # Vara/local: extrai da descricao (ex: "... 2ª Vara do Trabalho de Paulista)")
    vara = ""
    descricao = str(item.get("descricao") or "")
    if descricao:
        import re
        m = re.search(r"[-–]\s*(.+?)\s*[)\]]?\s*$", descricao)
        if m:
            vara = m.group(1).strip()

    link = str(item.get("linkVideoconferencia") or item.get("link_video") or
               item.get("link") or "")

    advogado = _str_parte(
        item.get("dadosResponsaveis") or item.get("usuarioResponsaveis") or ""
    )[:80]

    situacao_raw = str(item.get("situacao") or "").lower()
    if "conclu" in situacao_raw:
        status = "realizada"
    elif "cancel" in situacao_raw:
        status = "cancelada"
    else:
        status = "agendada"

    return {
        "id":             _make_id(processo, data, hora),
        "processo":       processo,
        "reclamante":     reclamante,
        "reclamada":      reclamada,
        "data_audiencia": data,
        "horario":        hora,
        "tipo_audiencia": tipo,
        "modalidade":     "",
        "vara":           vara,
        "status":         status,
        "origem":         "pje",
        "link":           link,
        "id_senha":       "",
        "advogado":       advogado,
        "updated_at":     datetime.utcnow().isoformat(),
    }


# ── Supabase upsert ───────────────────────────────────────────────────────────

def _sb_headers() -> dict:
    return {
        "apikey":        SB_KEY,
        "Authorization": f"Bearer {SB_KEY}",
        "Content-Type":  "application/json",
    }


def sb_upsert(records: list[dict]) -> int:
    if not records or not SB_URL or not SB_KEY:
        return 0
    url     = f"{SB_URL}/rest/v1/{SB_TABLE}"
    headers = {**_sb_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"}
    sent    = 0
    for i in range(0, len(records), 50):
        batch = records[i : i + 50]
        r = requests.post(url, headers=headers, json=batch, timeout=20)
        if r.status_code in (200, 201):
            sent += len(batch)
        else:
            log.error(f"Supabase {r.status_code}: {r.text[:600]}")
    return sent


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Pauta de audiencias — Projuris ADV -> Supabase")
    parser.add_argument("--inicio", default=None, help="Data de inicio (YYYY-MM-DD)")
    parser.add_argument("--fim",    default=None, help="Data de fim (YYYY-MM-DD)")
    parser.add_argument("--todas",  action="store_true",
                        help="Inclui todos os tipos de tarefa (nao so audiencias)")
    args = parser.parse_args()

    hoje        = datetime.today()
    data_inicio = args.inicio or hoje.strftime("%Y-%m-%d")
    data_fim    = args.fim    or (hoje + timedelta(days=DIAS_PAUTA)).strftime("%Y-%m-%d")

    log.info("=" * 60)
    log.info(f"Pauta de Audiencias — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    log.info(f"Projuris ADV: {PROJURIS_BASE}")
    log.info(f"Supabase: {SB_URL or 'NAO CONFIGURADO'}")
    log.info(f"Periodo: {data_inicio} -> {data_fim}")
    log.info("=" * 60)

    if not SB_URL or not SB_KEY:
        log.error("SUPABASE_URL / SUPABASE_KEY nao configurados — abortando.")
        raise SystemExit(1)

    # 1. Busca tarefas (calendario; fallback paginado)
    tarefas: list[dict] = []
    try:
        tarefas = buscar_calendario(data_inicio, data_fim)
        log.info(f"Calendario: {len(tarefas)} tarefas recebidas")
    except Exception as exc:
        log.warning(f"Calendario falhou ({exc}) — usando endpoint paginado...")

    if not tarefas:
        tarefas = buscar_paginado(data_inicio, data_fim)
        log.info(f"Paginado: {len(tarefas)} tarefas recebidas")

    # 2. Feriados (informativo)
    feriados = buscar_feriados(data_inicio, data_fim)
    if feriados:
        log.info(f"Feriados no periodo: {sorted(feriados)}")

    # 3. Filtra audiencias
    if args.todas:
        selecionadas = tarefas
    else:
        selecionadas = [t for t in tarefas if _is_audiencia(t)]
        log.info(f"Audiencias filtradas: {len(selecionadas)} de {len(tarefas)}")

    if not selecionadas:
        log.info("Nenhuma audiencia encontrada no periodo.")
        return

    # 4. Normaliza e salva no Supabase
    records  = [normalizar(t) for t in selecionadas]
    enviados = sb_upsert(records)

    log.info(f"Audiencias salvas no Supabase ({SB_TABLE}): {enviados}")
    log.info("=" * 60)
    log.info("Sincronizacao concluida.")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
