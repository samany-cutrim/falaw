"""
scraper.py — Extrator de Audiências PJe-kz → Supabase | Falaw
Versão: CDP (conecta ao Chrome já aberto com Whom/certificado ativo)
Detecta cancelamentos: audiências que sumiram do PJe são marcadas como 'cancelado_pje'

COMO USAR:
1. Feche o Chrome completamente
2. Abra via atalho "Chrome PJe" (usa 1_abrir_chrome.bat)
3. Faça login nos TRTs normalmente com o Whom
4. Execute: python scraper.py
"""

import json
import time
import logging
import os
import hashlib
import re
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv
import requests
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

load_dotenv()

# ── Configurações ──────────────────────────────────────────────────────────────

CHROME_DEBUG_PORT = int(os.getenv("CHROME_DEBUG_PORT", "9222"))
DIAS_BUSCA        = int(os.getenv("DIAS_BUSCA", "60"))
SB_URL            = os.getenv("SUPABASE_URL", "").rstrip("/")
SB_KEY            = os.getenv("SUPABASE_KEY", "")
SB_TABLE          = "pauta_audiencias"

Path("logs").mkdir(exist_ok=True)

# TRTs — PJe-kz
TRTS = [
    {"nome": "TRT-1",  "base": "https://pje.trt1.jus.br"},
    {"nome": "TRT-2",  "base": "https://pje.trt2.jus.br"},
    {"nome": "TRT-3",  "base": "https://pje.trt3.jus.br"},
    {"nome": "TRT-4",  "base": "https://pje.trt4.jus.br"},
    {"nome": "TRT-5",  "base": "https://pje.trt5.jus.br"},
    {"nome": "TRT-6",  "base": "https://pje.trt6.jus.br"},
    {"nome": "TRT-7",  "base": "https://pje.trt7.jus.br"},
    {"nome": "TRT-8",  "base": "https://pje.trt8.jus.br"},
    {"nome": "TRT-9",  "base": "https://pje.trt9.jus.br"},
    {"nome": "TRT-10", "base": "https://pje.trt10.jus.br"},
    {"nome": "TRT-11", "base": "https://pje.trt11.jus.br"},
    {"nome": "TRT-12", "base": "https://pje.trt12.jus.br"},
    {"nome": "TRT-13", "base": "https://pje.trt13.jus.br"},
    {"nome": "TRT-14", "base": "https://pje.trt14.jus.br"},
    {"nome": "TRT-15", "base": "https://pje.trt15.jus.br"},
    {"nome": "TRT-16", "base": "https://pje.trt16.jus.br"},
    {"nome": "TRT-17", "base": "https://pje.trt17.jus.br"},
    {"nome": "TRT-18", "base": "https://pje.trt18.jus.br"},
    {"nome": "TRT-19", "base": "https://pje.trt19.jus.br"},
    {"nome": "TRT-20", "base": "https://pje.trt20.jus.br"},
    {"nome": "TRT-21", "base": "https://pje.trt21.jus.br"},
    {"nome": "TRT-22", "base": "https://pje.trt22.jus.br"},
    {"nome": "TRT-23", "base": "https://pje.trt23.jus.br"},
    {"nome": "TRT-24", "base": "https://pje.trt24.jus.br"},
]

# ── Logging ────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("logs/scraper.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────────

MESES = {
    "janeiro":1,"fevereiro":2,"março":3,"abril":4,"maio":5,"junho":6,
    "julho":7,"agosto":8,"setembro":9,"outubro":10,"novembro":11,"dezembro":12,
    "jan":1,"fev":2,"mar":3,"abr":4,"mai":5,"jun":6,
    "jul":7,"ago":8,"set":9,"out":10,"nov":11,"dez":12,
}

def parse_data_hora(txt: str) -> tuple[str, str]:
    """
    Aceita: 'Segunda, 18 de maio de 2026 14:20'
            '18/05/2026 14:20'
            '2026-05-18T14:20:00'
    Retorna: ('2026-05-18', '14:20')
    """
    txt = txt.strip()
    # ISO
    m = re.search(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})", txt)
    if m:
        return m.group(1), m.group(2)
    # dd/mm/yyyy HH:MM
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})\s+(\d{2}:\d{2})", txt)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}", m.group(4)
    # "Segunda, 18 de maio de 2026 14:20"
    m = re.search(r"(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\s+(\d{2}:\d{2})", txt, re.IGNORECASE)
    if m:
        dia, mes_str, ano, hora = m.groups()
        mes = MESES.get(mes_str.lower())
        if mes:
            return f"{ano}-{mes:02d}-{int(dia):02d}", hora
    # só data dd/mm/yyyy
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", txt)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}", ""
    return "", ""


def parse_tipo(txt: str) -> tuple[str, str]:
    """
    'Una por videoconferência' → ('UNA', 'VIRTUAL')
    'Instrução presencial'     → ('INSTRUCAO', 'PRESENCIAL')
    Retorna (tipo, modalidade)
    """
    t = txt.upper()
    if "UNA" in t or "CONCILIAÇ" in t:
        tipo = "UNA"
    elif "INSTRUÇÃO" in t or "INSTRUCAO" in t:
        tipo = "INSTRUCAO"
    elif "JULGAMENTO" in t:
        tipo = "JULGAMENTO"
    elif "PERIC" in t:
        tipo = "PERICIAL"
    else:
        tipo = txt.strip().upper()[:20] if txt.strip() else "AUDIENCIA"

    if "VIDEO" in t or "VIRTUAL" in t or "REMOT" in t or "DIGITAL" in t:
        mod = "VIRTUAL"
    elif "PRESENCIAL" in t or "FÍSIC" in t or "FISIC" in t:
        mod = "PRESENCIAL"
    elif "HIBRIDA" in t or "HÍBRID" in t:
        mod = "HIBRIDA"
    else:
        mod = ""
    return tipo, mod


def make_id(processo: str, data: str, hora: str) -> str:
    """ID estável baseado em FNV-1a do processo+data+hora."""
    raw = f"{processo}|{data}|{hora}".encode()
    h = 0x811c9dc5
    for b in raw:
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"pje-{h:08x}"


# ── Supabase helpers ───────────────────────────────────────────────────────────

def sb_headers() -> dict:
    return {
        "apikey": SB_KEY,
        "Authorization": f"Bearer {SB_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def sb_upsert(records: list[dict]) -> int:
    """Upsert em lote. Retorna quantos foram enviados."""
    if not records or not SB_URL or not SB_KEY:
        return 0
    url = f"{SB_URL}/rest/v1/{SB_TABLE}"
    headers = sb_headers()
    headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
    # Lotes de 50
    sent = 0
    for i in range(0, len(records), 50):
        batch = records[i:i+50]
        r = requests.post(url, headers=headers, json=batch, timeout=20)
        if r.status_code in (200, 201):
            sent += len(batch)
        else:
            log.error(f"Supabase upsert erro {r.status_code}: {r.text[:200]}")
    return sent


def sb_buscar_ativos_trt(nome_trt: str) -> list[dict]:
    """
    Busca todas as audiências ativas (status != cancelado) de um TRT
    com data futura, para detectar cancelamentos.
    """
    if not SB_URL or not SB_KEY:
        return []
    today = datetime.today().strftime("%Y-%m-%d")
    url = (
        f"{SB_URL}/rest/v1/{SB_TABLE}"
        f"?vara=ilike.*{nome_trt}*"
        f"&data_audiencia=gte.{today}"
        f"&status=neq.cancelado"
        f"&status=neq.cancelado_pje"
        f"&origem=eq.pje"
        f"&select=id,processo,data_audiencia,horario"
    )
    r = requests.get(url, headers=sb_headers(), timeout=20)
    if r.status_code == 200:
        return r.json()
    return []


def sb_marcar_cancelado_pje(ids: list[str]):
    """Marca audiências como 'cancelado_pje' (pendente confirmação no admin)."""
    if not ids or not SB_URL or not SB_KEY:
        return
    url = f"{SB_URL}/rest/v1/{SB_TABLE}"
    headers = sb_headers()
    headers["Prefer"] = "return=minimal"
    for uid in ids:
        r = requests.patch(
            f"{url}?id=eq.{uid}",
            headers=headers,
            json={"status": "cancelado_pje", "updated_at": datetime.utcnow().isoformat()},
            timeout=20,
        )
        if r.status_code not in (200, 204):
            log.warning(f"Erro ao marcar cancelado_pje id={uid}: {r.status_code}")


# ── Scraper PJe-kz ─────────────────────────────────────────────────────────────

def verificar_autenticado(page, base_url: str) -> bool:
    pauta_url = f"{base_url}/pjekz/pauta-usuarios-externos"
    try:
        page.goto(pauta_url, timeout=25000, wait_until="domcontentloaded")
        time.sleep(3)
        url_atual = page.url
        # Se redirecionou para login, sessão expirou
        if "login" in url_atual.lower() or "token" in url_atual.lower():
            log.warning(f"Sessão expirada: {base_url}")
            return False
        # Verificar se a página tem conteúdo de pauta
        if page.locator("table, .p-datatable, p-table").count() > 0:
            log.info(f"Sessão ativa: {base_url}")
            return True
        # Às vezes carrega lentamente
        page.wait_for_selector("table, .p-datatable, p-table, .p-datatable-tbody", timeout=10000)
        log.info(f"Sessão ativa (aguardou tabela): {base_url}")
        return True
    except PlaywrightTimeout:
        # Timeout pode significar que o TRT não tem audiências (tabela vazia) mas sessão ok
        url_atual = page.url
        if "login" not in url_atual.lower():
            log.info(f"Sessão ativa (sem tabela visível): {base_url}")
            return True
        log.warning(f"Timeout/sessão inativa: {base_url}")
        return False
    except Exception as e:
        log.error(f"Erro verificar auth {base_url}: {e}")
        return False


def expandir_periodo(page):
    """Tenta configurar o filtro de período para hoje + DIAS_BUSCA dias."""
    hoje = datetime.today()
    fim  = hoje + timedelta(days=DIAS_BUSCA)
    try:
        # Filtro de data inicial
        for sel in ["input[placeholder*='nício']", "input[placeholder*='inicio']",
                    "p-calendar:first-of-type input", "#dtInicio"]:
            c = page.locator(sel).first
            if c.count() > 0 and c.is_visible():
                c.triple_click()
                c.type(hoje.strftime("%d/%m/%Y"))
                time.sleep(0.3)
                break
        # Filtro de data final
        for sel in ["input[placeholder*='inal']", "input[placeholder*='fim']",
                    "p-calendar:last-of-type input", "#dtFim"]:
            c = page.locator(sel).first
            if c.count() > 0 and c.is_visible():
                c.triple_click()
                c.type(fim.strftime("%d/%m/%Y"))
                time.sleep(0.3)
                break
        # Pesquisar
        for sel in ["button:has-text('Pesquisar')", "button:has-text('Filtrar')",
                    "button[type='submit']", "p-button:has-text('Pesquisar')"]:
            b = page.locator(sel).first
            if b.count() > 0 and b.is_visible():
                b.click()
                time.sleep(3)
                break
    except Exception as e:
        log.debug(f"Período não ajustado: {e}")


def extrair_linhas_pagina(page, nome_trt: str) -> list[dict]:
    """Extrai registros de audiência da tabela visível na página atual."""
    audiencias = []
    try:
        # Aguardar tabela estabilizar
        page.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass

    # Seletores de linha para PJe-kz (PrimeNG) e PJe legado
    seletores_tr = [
        ".p-datatable-tbody > tr",
        "p-table .p-datatable-tbody > tr",
        "table tbody tr",
        "[class*='datatable'] tbody tr",
    ]
    linhas = []
    for sel in seletores_tr:
        found = page.locator(sel).all()
        if found:
            linhas = found
            break

    for linha in linhas:
        celulas = linha.locator("td").all()
        if len(celulas) < 3:
            continue
        textos = [c.inner_text().strip() for c in celulas]
        if not any(textos):
            continue

        # PJe-kz colunas: [0]=Processo+partes, [1]=Prioridade/Juízo Digital, [2]=Data e Horário, [3]=Tipo, [4]=Órgão Julgador
        processo_raw = textos[0] if len(textos) > 0 else ""
        data_hora_raw = textos[2] if len(textos) > 2 else textos[0]
        tipo_raw      = textos[3] if len(textos) > 3 else ""
        vara_raw      = textos[4] if len(textos) > 4 else ""

        # Extrair número do processo (linha 1) e partes (resto)
        linhas_proc = processo_raw.split("\n")
        processo = linhas_proc[0].strip() if linhas_proc else processo_raw
        partes_raw = " | ".join(l.strip() for l in linhas_proc[1:] if l.strip())

        reclamante, reclamada = "", ""
        if " X " in partes_raw.upper():
            partes_split = re.split(r"\s+[xX]\s+", partes_raw, maxsplit=1)
            reclamante = partes_split[0].strip()
            reclamada  = partes_split[1].strip() if len(partes_split) > 1 else ""
        elif "|" in partes_raw:
            partes_split = partes_raw.split("|")
            reclamante = partes_split[0].strip()
            reclamada  = partes_split[1].strip() if len(partes_split) > 1 else ""

        data, hora = parse_data_hora(data_hora_raw)
        tipo, mod   = parse_tipo(tipo_raw)
        uid         = make_id(processo, data, hora)

        if not processo and not data:
            continue

        audiencias.append({
            "id":            uid,
            "processo":      processo,
            "reclamante":    reclamante,
            "reclamada":     reclamada,
            "data_audiencia": data,
            "horario":       hora,
            "tipo_audiencia": tipo,
            "modalidade":    mod,
            "vara":          vara_raw,
            "status":        "agendado",
            "origem":        "pje",
            "updated_at":    datetime.utcnow().isoformat(),
        })
    return audiencias


def scrape_trt(page, trt: dict) -> list[dict]:
    """Coleta todas as páginas de um TRT. Retorna lista de audiências."""
    nome = trt["nome"]
    base = trt["base"]

    if not verificar_autenticado(page, base):
        return []

    # Tenta expandir período
    expandir_periodo(page)
    time.sleep(1)

    todas = []
    pagina = 1

    while pagina <= 30:  # máx 30 páginas por segurança
        log.info(f"{nome}: extraindo página {pagina}…")
        items = extrair_linhas_pagina(page, nome)
        if not items:
            log.info(f"{nome}: nenhuma linha na página {pagina}, finalizando")
            break
        todas.extend(items)
        log.info(f"{nome}: {len(items)} linha(s) página {pagina} ({len(todas)} total)")

        # Paginação PrimeNG
        proximo = page.locator(
            "button[aria-label='Next Page']:not([disabled]),"
            ".p-paginator-next:not(.p-disabled),"
            "button.p-paginator-next:not([disabled]),"
            "a:has-text('Próximo'):not(.disabled),"
            "a:has-text('>'):not(.disabled)"
        ).first
        try:
            if proximo.count() > 0 and proximo.is_enabled():
                proximo.click()
                pagina += 1
                time.sleep(2)
            else:
                break
        except Exception:
            break

    return todas


# ── Detecção de cancelamentos ──────────────────────────────────────────────────

def detectar_cancelamentos(nome_trt: str, ids_coletados: set[str]):
    """
    Compara os IDs coletados agora com os que estavam ativos no Supabase.
    Os que sumiram do PJe são marcados como 'cancelado_pje'.
    """
    ativos_sb = sb_buscar_ativos_trt(nome_trt)
    ids_sb = {r["id"] for r in ativos_sb}
    desaparecidos = ids_sb - ids_coletados
    if desaparecidos:
        log.info(f"{nome_trt}: {len(desaparecidos)} audiência(s) marcada(s) como cancelado_pje")
        sb_marcar_cancelado_pje(list(desaparecidos))
    return len(desaparecidos)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    log.info("=" * 60)
    log.info(f"Iniciando coleta — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    log.info(f"Supabase: {SB_URL or 'NÃO CONFIGURADO'}")
    log.info("=" * 60)

    if not SB_URL or not SB_KEY:
        log.error("SUPABASE_URL e SUPABASE_KEY não configurados no .env — abortando")
        return

    resumo = {"trt_ok": [], "trt_erro": [], "trt_sem_sessao": [], "total": 0, "cancelados": 0}

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(f"http://localhost:{CHROME_DEBUG_PORT}")
            log.info(f"Conectado ao Chrome (porta {CHROME_DEBUG_PORT})")
        except Exception as e:
            log.error(f"Não foi possível conectar ao Chrome: {e}")
            log.error("Certifique-se de que o Chrome foi aberto com 1_abrir_chrome.bat")
            return

        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        page = ctx.new_page()

        for trt in TRTS:
            try:
                audiencias = scrape_trt(page, trt)
                if audiencias is None:
                    resumo["trt_sem_sessao"].append(trt["nome"])
                    continue

                if audiencias:
                    enviados = sb_upsert(audiencias)
                    ids_coletados = {a["id"] for a in audiencias}
                    cancelados = detectar_cancelamentos(trt["nome"], ids_coletados)
                    resumo["total"] += enviados
                    resumo["cancelados"] += cancelados
                    resumo["trt_ok"].append(f"{trt['nome']} ({enviados} auds, {cancelados} cancel.)")
                else:
                    # TRT sem audiências futuras — verificar cancelamentos
                    ids_coletados = set()
                    cancelados = detectar_cancelamentos(trt["nome"], ids_coletados)
                    resumo["cancelados"] += cancelados
                    resumo["trt_ok"].append(f"{trt['nome']} (0 auds, {cancelados} cancel.)")

            except Exception as e:
                log.error(f"{trt['nome']}: erro inesperado — {e}")
                resumo["trt_erro"].append(trt["nome"])

        page.close()

    # Relatório final
    log.info("\n" + "=" * 60)
    log.info("RELATÓRIO FINAL")
    log.info("=" * 60)
    log.info(f"Total enviados ao Supabase: {resumo['total']}")
    log.info(f"Cancelamentos detectados:   {resumo['cancelados']}")
    if resumo["trt_ok"]:
        log.info(f"TRTs coletados:\n  " + "\n  ".join(resumo["trt_ok"]))
    if resumo["trt_sem_sessao"]:
        log.warning(f"TRTs SEM SESSÃO (refaça login):\n  " + "\n  ".join(resumo["trt_sem_sessao"]))
    if resumo["trt_erro"]:
        log.error(f"TRTs com erro:\n  " + "\n  ".join(resumo["trt_erro"]))
    log.info("=" * 60)


if __name__ == "__main__":
    main()
