"""
projuris_sync.py — Sincronização de audiências via API Projuris → Supabase | Falaw

Fluxo:
  1. Autentica no Projuris via OAuth2 Client Credentials
  2. Busca audiências/compromissos no período configurado
  3. Normaliza e salva no Supabase (tabela pauta_audiencias)
"""

import os
import re
import logging
import hashlib
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv

_HERE = Path(__file__).parent
load_dotenv(_HERE / ".env")

# ── Configuração ──────────────────────────────────────────────────────────────

PROJURIS_API_URL    = os.getenv("PROJURIS_API_URL", "").rstrip("/")
PROJURIS_CLIENT_ID  = os.getenv("PROJURIS_CLIENT_ID", "")
PROJURIS_SECRET     = os.getenv("PROJURIS_CLIENT_SECRET", "")

DIAS_BUSCA = int(os.getenv("DIAS_BUSCA", "365"))

SB_URL   = os.getenv("SUPABASE_URL", "").rstrip("/")
SB_KEY   = os.getenv("SUPABASE_KEY", "")
SB_TABLE = "pauta_audiencias"

_LOG_DIR = _HERE / "logs"
_LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_LOG_DIR / "projuris_sync.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)


# ── OAuth2 Client Credentials ─────────────────────────────────────────────────

_token_cache: dict = {"access_token": "", "expires_at": 0}


def _get_token() -> str:
    """Obtém (ou reutiliza) o access_token OAuth2 do Projuris."""
    now = datetime.utcnow().timestamp()
    if _token_cache["access_token"] and now < _token_cache["expires_at"] - 60:
        return _token_cache["access_token"]

    if not PROJURIS_API_URL:
        raise RuntimeError("PROJURIS_API_URL não configurada no .env")
    if not PROJURIS_CLIENT_ID or not PROJURIS_SECRET:
        raise RuntimeError("PROJURIS_CLIENT_ID / PROJURIS_CLIENT_SECRET não configurados no .env")

    # Endpoint padrão OAuth2 — ajuste o path conforme documentação do Projuris
    token_url = f"{PROJURIS_API_URL}/oauth/token"
    resp = requests.post(
        token_url,
        data={
            "grant_type":    "client_credentials",
            "client_id":     PROJURIS_CLIENT_ID,
            "client_secret": PROJURIS_SECRET,
        },
        timeout=15,
    )
    resp.raise_for_status()
    body = resp.json()

    access_token = body.get("access_token") or body.get("token", "")
    expires_in   = int(body.get("expires_in", 3600))

    if not access_token:
        raise RuntimeError(f"Resposta de token inválida: {body}")

    _token_cache["access_token"] = access_token
    _token_cache["expires_at"]   = now + expires_in
    log.info("Token Projuris obtido com sucesso.")
    return access_token


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_get_token()}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    }


# ── Busca de audiências no Projuris ───────────────────────────────────────────

def buscar_audiencias_projuris() -> list[dict]:
    """
    Busca audiências/compromissos no Projuris para o período de hoje até +DIAS_BUSCA.
    Retorna lista de dicts no formato interno normalizado.
    """
    hoje = datetime.today()
    fim  = hoje + timedelta(days=DIAS_BUSCA)

    # Parâmetros padrão — ajuste os nomes dos campos conforme documentação do Projuris
    params = {
        "dataInicio": hoje.strftime("%Y-%m-%d"),
        "dataFim":    fim.strftime("%Y-%m-%d"),
        "tipo":       "audiencia",
        "page":       0,
        "size":       200,
    }

    # Endpoint de audiências — ajuste o path conforme documentação do Projuris
    # Candidatos comuns: /audiencias, /compromissos, /agenda/audiencias
    endpoint = f"{PROJURIS_API_URL}/audiencias"

    all_items: list[dict] = []
    page = 0

    while True:
        params["page"] = page
        log.info(f"  Buscando página {page} | {params['dataInicio']} → {params['dataFim']}")
        resp = requests.get(endpoint, headers=_headers(), params=params, timeout=30)

        if resp.status_code == 404:
            log.warning(f"Endpoint {endpoint} retornou 404. Verifique PROJURIS_API_URL e o path correto.")
            break

        resp.raise_for_status()
        body = resp.json()

        # Suporte a respostas paginadas { content: [...] } ou lista direta [...]
        if isinstance(body, list):
            items = body
        elif isinstance(body, dict):
            items = body.get("content") or body.get("data") or body.get("audiencias") or body.get("items") or []
        else:
            items = []

        if not items:
            break

        all_items.extend(items)
        log.info(f"  {len(items)} audiências na página {page} — total: {len(all_items)}")

        # Verificar se há mais páginas
        if isinstance(body, dict):
            total_pages = body.get("totalPages") or body.get("total_pages", 1)
            if page + 1 >= total_pages:
                break
        if len(items) < params["size"]:
            break

        page += 1

    return all_items


# ── Normalização ──────────────────────────────────────────────────────────────

def _normaliza(s: str) -> str:
    n = unicodedata.normalize("NFD", s)
    return "".join(c for c in n if unicodedata.category(c) != "Mn").lower()


def _extrair_tipo_audiencia(item: dict) -> str:
    """Infere tipo_audiencia (CHECK constraint) a partir do título/nome/descrição da tarefa."""
    fontes = [
        item.get("tituloCompromisso") or "",
        item.get("titulo") or "",
        item.get("nomeTarefa") or "",
        item.get("nomeTarefaModelo") or "",
        item.get("descricao") or "",
    ]
    texto = " ".join(str(f) for f in fontes if f)
    t = _normaliza(texto)
    if re.search(r"\buna\b", t):
        return "UNA"
    if re.search(r"concilia", t):
        return "CONCILIAÇÃO"
    if re.search(r"instruc", t):
        return "INSTRUÇÃO"
    if re.search(r"inici", t):
        return "INICIAL"
    return ""


_SUFIXOS_EMPRESA = re.compile(
    r"\s*(\(cliente\)|\(r\xe9\)|s/?a\.?|s\.a\.?|ltda\.?|eireli|me\b|epp\b|"
    r"ag[e\xea]ncia|comercio|com\.br|\.com|industria|servi[c\xe7]os|do brasil|brasil).*$",
    re.IGNORECASE,
)


def _extrair_modalidade(link: str, item: dict) -> str:
    """Infere modalidade a partir do link e da descrição/título."""
    if link:
        return "VIRTUAL"
    fontes = [
        item.get("tituloCompromisso") or "",
        item.get("titulo") or "",
        item.get("nomeTarefa") or "",
        item.get("descricao") or "",
    ]
    t = _normaliza(" ".join(str(f) for f in fontes if f))
    if re.search(r"videoconfer|virtual|online|telepresencial", t):
        return "VIRTUAL"
    if re.search(r"presencial", t):
        return "PRESENCIAL"
    return ""


def _extrair_cliente(item: dict) -> str:
    """Extrai o nome do cliente Falaw a partir da parte ré/reclamada."""
    direto = str(
        item.get("cliente") or item.get("nomeCliente") or
        item.get("clienteNome") or ""
    ).strip()
    if direto:
        return direto
    reclamada = str(
        item.get("reclamada") or item.get("polo_passivo") or
        item.get("poloPassivo") or item.get("reu") or ""
    ).strip()
    if not reclamada:
        return ""
    nome = _SUFIXOS_EMPRESA.sub("", reclamada).strip().rstrip(",.").strip()
    nome = re.split(r"[/|;]", nome)[0].strip()
    return nome[:80]


def _extrair_tipo_responsabilidade(item: dict) -> str:
    """Extrai tipo de responsabilidade do item Projuris."""
    return str(
        item.get("tipoResponsabilidade") or item.get("tipo_responsabilidade") or
        item.get("responsabilidade") or item.get("tipoParticipacao") or ""
    ).strip()[:60]


def _make_id(processo: str, data: str, hora: str) -> str:
    raw = f"projuris|{processo}|{data}|{hora}".encode()
    return "prj-" + hashlib.md5(raw).hexdigest()[:12]


def normalizar(item: dict) -> dict:
    """
    Converte um registro bruto da API Projuris para o schema pauta_audiencias.
    Ajuste os nomes dos campos conforme a resposta real da API.
    """
    # Campos de data/hora — tenta nomes comuns
    data_raw = (
        item.get("dataAudiencia") or item.get("data_audiencia") or
        item.get("data") or item.get("dtAudiencia") or ""
    )
    hora_raw = (
        item.get("horaAudiencia") or item.get("hora_audiencia") or
        item.get("hora") or item.get("horario") or ""
    )

    # Normaliza data para YYYY-MM-DD e hora para HH:MM
    data, hora = "", ""
    if data_raw:
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"):
            try:
                dt = datetime.strptime(data_raw[:len(fmt)], fmt)
                data = dt.strftime("%Y-%m-%d")
                if not hora_raw:
                    hora = dt.strftime("%H:%M")
                break
            except ValueError:
                continue
    if hora_raw and not hora:
        hora = str(hora_raw)[:5]

    processo = (
        item.get("numeroProcesso") or item.get("numero_processo") or
        item.get("processo") or item.get("nrProcesso") or ""
    )

    reclamante = (
        item.get("reclamante") or item.get("polo_ativo") or
        item.get("poloAtivo") or item.get("autor") or ""
    )
    reclamada = (
        item.get("reclamada") or item.get("polo_passivo") or
        item.get("poloPassivo") or item.get("reu") or ""
    )

    tipo = _extrair_tipo_audiencia(item) or (
        item.get("tipoAudiencia") or item.get("tipo_audiencia") or
        item.get("tipo") or ""
    ).upper()[:30]

    modalidade = (
        item.get("modalidade") or item.get("tipoSessao") or
        item.get("tipo_sessao") or ""
    ).upper()[:20]

    vara = (
        item.get("vara") or item.get("orgaoJulgador") or
        item.get("orgao_julgador") or item.get("tribunal") or ""
    )

    link = (
        item.get("linkVideoconferencia") or item.get("link_video") or
        item.get("link") or item.get("urlVideoconferencia") or ""
    )

    modalidade            = _extrair_modalidade(str(link), item)
    cliente               = _extrair_cliente(item)
    tipo_responsabilidade = _extrair_tipo_responsabilidade(item)

    id_senha_parts = []
    meeting_id = item.get("meetingId") or item.get("meeting_id") or item.get("idReuniao") or ""
    senha      = item.get("senha") or item.get("password") or item.get("codigoAcesso") or ""
    if meeting_id:
        id_senha_parts.append(f"ID: {meeting_id}")
    if senha:
        id_senha_parts.append(f"Senha: {senha}")

    uid = _make_id(processo, data, hora)

    testemunha_necessaria = tipo in ("UNA", "INSTRUÇÃO")

    return {
        "id":                    uid,
        "processo":              str(processo),
        "reclamante":            str(reclamante),
        "reclamada":             str(reclamada),
        "data_audiencia":        data,
        "horario":               hora,
        "tipo_audiencia":        tipo,
        "modalidade":            modalidade,
        "vara":                  str(vara),
        "status":                "agendada",
        "origem":                "projuris",
        "link":                  str(link),
        "id_senha":              " | ".join(id_senha_parts),
        "cliente":               cliente,
        "tipo_responsabilidade": tipo_responsabilidade,
        "testemunha_necessaria": testemunha_necessaria,
        "updated_at":            datetime.utcnow().isoformat(),
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
        batch = records[i:i + 50]
        r = requests.post(url, headers=headers, json=batch, timeout=20)
        if r.status_code in (200, 201):
            sent += len(batch)
        else:
            log.error(f"Supabase {r.status_code}: {r.text[:200]}")
    return sent


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    log.info("=" * 60)
    log.info(f"Projuris Sync — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    log.info(f"API: {PROJURIS_API_URL or 'NÃO CONFIGURADA'}")
    log.info(f"Supabase: {SB_URL or 'NÃO CONFIGURADO'}")
    log.info(f"Período: hoje + {DIAS_BUSCA} dias")
    log.info("=" * 60)

    if not PROJURIS_API_URL:
        log.error("PROJURIS_API_URL não configurada no .env — abortando.")
        raise SystemExit(1)

    if not SB_URL or not SB_KEY:
        log.error("SUPABASE_URL / SUPABASE_KEY não configurados — abortando.")
        raise SystemExit(1)

    raw_items = buscar_audiencias_projuris()
    log.info(f"Total bruto recebido do Projuris: {len(raw_items)}")

    if not raw_items:
        log.info("Nenhuma audiência encontrada no período.")
        return

    records = [normalizar(r) for r in raw_items]
    enviados = sb_upsert(records)
    log.info(f"Audiências salvas no Supabase: {enviados}")

    log.info("=" * 60)
    log.info("Sincronização concluída.")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
