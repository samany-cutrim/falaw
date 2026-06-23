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

PROJURIS_BASE  = os.getenv("PROJURIS_BASE_URL", "https://service.projurisadv.com.br").rstrip("/")
# Token capturado do browser: DevTools → Network → qualquer request → header Authorization: Bearer ...
PROJURIS_TOKEN = os.getenv("PROJURIS_BEARER_TOKEN", "")

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


# ── Autenticação ──────────────────────────────────────────────────────────────

def _headers() -> dict:
    if not PROJURIS_TOKEN:
        raise RuntimeError(
            "Configure PROJURIS_BEARER_TOKEN no .env.\n"
            "Como obter: abra o Projuris no browser → F12 → Network → "
            "qualquer request → copie o header  Authorization: Bearer <token>"
        )
    return {
        "Authorization": f"Bearer {PROJURIS_TOKEN}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    }


# ── Busca de tarefas ──────────────────────────────────────────────────────────

def _extrair_lista(body) -> list[dict]:
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        return (
            body.get("content") or body.get("data") or
            body.get("tarefas") or body.get("items") or []
        )
    return []


def buscar_calendario(data_inicio: str, data_fim: str) -> list[dict]:
    """Endpoint sem paginacao — retorna todas as tarefas do periodo de uma vez."""
    url = f"{PROJURIS_BASE}/adv-service/v2/tarefa/calendario/consulta-sem-paginacao"
    log.info(f"Calendario: {data_inicio} -> {data_fim}")
    resp = requests.get(
        url,
        headers=_headers(),
        params={"dataInicio": data_inicio, "dataFim": data_fim},
        timeout=30,
    )
    resp.raise_for_status()
    return _extrair_lista(resp.json())


def buscar_paginado(data_inicio: str, data_fim: str) -> list[dict]:
    """Fallback paginado caso o endpoint de calendario nao esteja disponivel."""
    url      = f"{PROJURIS_BASE}/adv-service/tarefa/consulta-com-paginacao"
    all_rows: list[dict] = []
    pagina   = 0

    while True:
        log.info(f"  Pagina {pagina}")
        resp = requests.get(
            url,
            headers=_headers(),
            params={
                "quan-registros":  100,
                "pagina":          pagina,
                "ordenacao-tipo":  "ASC",
                "ordenacao-chave": "ORDENACAO_DATA_PREVISTA",
                "dataInicio":      data_inicio,
                "dataFim":         data_fim,
            },
            timeout=30,
        )
        resp.raise_for_status()
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

_TIPOS_AUDIENCIA = {
    "audiencia", "audiencia", "hearing", "julgamento",
    "conciliacao", "conciliacao", "instrucao", "instrucao",
    "sessao", "sessao", "pauta",
}


def _is_audiencia(item: dict) -> bool:
    tipo = (
        item.get("tipoTarefa") or item.get("tipo_tarefa") or
        item.get("tipoEvento") or item.get("tipo") or ""
    ).lower()
    # normaliza acentos simples para comparacao
    import unicodedata
    tipo_norm = unicodedata.normalize("NFD", tipo)
    tipo_norm = "".join(c for c in tipo_norm if unicodedata.category(c) != "Mn")
    return any(t in tipo_norm for t in _TIPOS_AUDIENCIA)


def _parse_data_hora(item: dict) -> tuple[str, str]:
    _DATAS = ["dataPrevista", "data_prevista", "dataAudiencia", "data_audiencia",
              "dataInicio", "data_inicio", "data", "dtEvento", "dtAudiencia"]
    _HORAS = ["horaPrevista", "hora_prevista", "horaAudiencia", "hora_audiencia",
              "horaInicio", "hora_inicio", "hora", "horario"]

    data_raw = next((item[k] for k in _DATAS if item.get(k)), "")
    hora_raw = next((item[k] for k in _HORAS if item.get(k)), "")

    data, hora = "", ""
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            dt   = datetime.strptime(str(data_raw)[: len(fmt)], fmt)
            data = dt.strftime("%Y-%m-%d")
            if not hora_raw:
                hora = dt.strftime("%H:%M")
            break
        except (ValueError, TypeError):
            continue

    if hora_raw and not hora:
        hora = str(hora_raw)[:5]

    return data, hora


def _make_id(processo: str, data: str, hora: str) -> str:
    raw = f"projuris-adv|{processo}|{data}|{hora}".encode()
    return "adv-" + hashlib.md5(raw).hexdigest()[:12]


def normalizar(item: dict) -> dict:
    data, hora = _parse_data_hora(item)

    processo = (
        item.get("numeroProcesso") or item.get("numero_processo") or
        item.get("processo") or item.get("nrProcesso") or ""
    )
    reclamante = (
        item.get("reclamante") or item.get("poloAtivo") or
        item.get("polo_ativo") or item.get("autor") or ""
    )
    reclamada = (
        item.get("reclamada") or item.get("poloPassivo") or
        item.get("polo_passivo") or item.get("reu") or ""
    )
    tipo = (
        item.get("tipoAudiencia") or item.get("tipo_audiencia") or
        item.get("tipoEvento") or item.get("tipo") or "AUDIENCIA"
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
    resp_raw = item.get("responsavel") or item.get("advogadoResponsavel") or item.get("advogado") or ""
    if isinstance(resp_raw, dict):
        resp_raw = resp_raw.get("nome") or resp_raw.get("name") or ""

    id_senha_parts = []
    mid   = item.get("meetingId") or item.get("meeting_id") or item.get("idReuniao") or ""
    senha = item.get("senha") or item.get("password") or item.get("codigoAcesso") or ""
    if mid:
        id_senha_parts.append(f"ID: {mid}")
    if senha:
        id_senha_parts.append(f"Senha: {senha}")

    return {
        "id":             _make_id(processo, data, hora),
        "processo":       str(processo),
        "reclamante":     str(reclamante),
        "reclamada":      str(reclamada),
        "data_audiencia": data,
        "horario":        hora,
        "tipo_audiencia": tipo,
        "modalidade":     modalidade,
        "vara":           str(vara),
        "status":         "agendada",
        "origem":         "projuris-adv",
        "link":           str(link),
        "id_senha":       " | ".join(id_senha_parts),
        "responsavel":    str(resp_raw),
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
            log.error(f"Supabase {r.status_code}: {r.text[:200]}")
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
