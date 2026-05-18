"""
scraper.py — Coleta audiências PJe → Supabase | Falaw
Fluxo por TRT/grau: navega para pauta (sessão já aberta via Whom manual) →
define período de 1 ano → pagina → entra em cada processo para buscar
intimação (link, ID, senha) → salva no Supabase.
"""

import os
import re
import time
import logging
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote
from dotenv import load_dotenv
import requests
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

from whom_auth import (
    garantir_chrome_aberto,
    reconectar_contexto,
    CHROME_DEBUG_PORT,
    WHOM_TRTS,
    autenticar_e_capturar_pje_page,
    encontrar_whom,
)

_HERE = Path(__file__).parent
load_dotenv(_HERE / ".env")

DIAS_BUSCA      = int(os.getenv("DIAS_BUSCA", "365"))
SB_URL          = os.getenv("SUPABASE_URL", "").rstrip("/")
SB_KEY          = os.getenv("SUPABASE_KEY", "")
SB_TABLE        = "pauta_audiencias"

_LOG_DIR = _HERE / "logs"
_LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_LOG_DIR / "scraper.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)


# ── Mapeamento sistemas → fallback URLs ───────────────────────────────────────

def _build_sistemas():
    todos = []
    for n in range(1, 25):
        todos.append({
            "whom":          f"TRT{n} Pje - 1º grau",
            "nome":          f"TRT-{n}/1G",
            "fallback_base": f"https://pje.trt{n}.jus.br",
        })
        todos.append({
            "whom":          f"TRT{n} Pje - 2º grau",
            "nome":          f"TRT-{n}/2G",
            "fallback_base": f"https://pje.trt{n}.jus.br",
        })
    todos.append({
        "whom":          "TST Pje",
        "nome":          "TST",
        "fallback_base": "https://pje.tst.jus.br",
    })
    if WHOM_TRTS:
        todos = [s for s in todos if s["whom"] in WHOM_TRTS]
    return todos

SISTEMAS = _build_sistemas()


# ── Parse helpers ─────────────────────────────────────────────────────────────

MESES = {
    "janeiro":1,"fevereiro":2,"março":3,"abril":4,"maio":5,"junho":6,
    "julho":7,"agosto":8,"setembro":9,"outubro":10,"novembro":11,"dezembro":12,
    "jan":1,"fev":2,"mar":3,"abr":4,"mai":5,"jun":6,
    "jul":7,"ago":8,"set":9,"out":10,"nov":11,"dez":12,
}

def parse_data_hora(txt: str) -> tuple[str, str]:
    txt = txt.strip()
    m = re.search(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})", txt)
    if m:
        return m.group(1), m.group(2)
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})\s+(\d{2}:\d{2})", txt)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}", m.group(4)
    m = re.search(r"(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\s+(\d{2}:\d{2})", txt, re.IGNORECASE)
    if m:
        dia, mes_str, ano, hora = m.groups()
        mes = MESES.get(mes_str.lower())
        if mes:
            return f"{ano}-{mes:02d}-{int(dia):02d}", hora
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", txt)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}", ""
    return "", ""


def parse_tipo(txt: str) -> tuple[str, str]:
    t = txt.upper()
    if "UNA" in t or "CONCILIAÇ" in t:
        tipo = "UNA"
    elif "INSTRUÇÃO" in t or "INSTRUCAO" in t:
        tipo = "INSTRUCAO"
    elif "INICIAL" in t:
        tipo = "INICIAL"
    elif "JULGAMENTO" in t:
        tipo = "JULGAMENTO"
    elif "PERIC" in t:
        tipo = "PERICIAL"
    else:
        tipo = txt.strip().upper()[:20] if txt.strip() else "AUDIENCIA"
    if "VIDEO" in t or "VIRTUAL" in t or "REMOT" in t or "DIGITAL" in t or "TELEPR" in t:
        mod = "VIRTUAL"
    elif "PRESENCIAL" in t or "FÍSIC" in t or "FISIC" in t:
        mod = "PRESENCIAL"
    elif "HIBRIDA" in t or "HÍBRID" in t:
        mod = "HIBRIDA"
    else:
        mod = ""
    return tipo, mod


def make_id(processo: str, data: str, hora: str) -> str:
    raw = f"{processo}|{data}|{hora}".encode()
    h = 0x811c9dc5
    for b in raw:
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"pje-{h:08x}"


# ── Supabase ──────────────────────────────────────────────────────────────────

def sb_headers() -> dict:
    return {
        "apikey": SB_KEY,
        "Authorization": f"Bearer {SB_KEY}",
        "Content-Type": "application/json",
    }


def sb_upsert(records: list[dict]) -> int:
    if not records or not SB_URL or not SB_KEY:
        return 0
    url = f"{SB_URL}/rest/v1/{SB_TABLE}"
    headers = {**sb_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"}
    sent = 0
    for i in range(0, len(records), 50):
        batch = records[i:i + 50]
        r = requests.post(url, headers=headers, json=batch, timeout=20)
        if r.status_code in (200, 201):
            sent += len(batch)
        else:
            log.error(f"Supabase {r.status_code}: {r.text[:200]}")
    return sent


def sb_buscar_ativos(nome: str) -> list[dict]:
    # Cancelamento desabilitado: sem coluna trt_grau no schema para filtrar por TRT
    return []


def sb_marcar_cancelado(ids: list[str]):
    if not ids or not SB_URL or not SB_KEY:
        return
    url = f"{SB_URL}/rest/v1/{SB_TABLE}"
    for uid in ids:
        requests.patch(
            f"{url}?id=eq.{uid}",
            headers={**sb_headers(), "Prefer": "return=minimal"},
            json={"status": "cancelado_pje", "updated_at": datetime.utcnow().isoformat()},
            timeout=20,
        )


# ── Filtro de data ────────────────────────────────────────────────────────────

def _set_calendar_input(page, inp, valor: str):
    """
    Preenche um campo p-calendar do PrimeNG/PJe.
    O campo é um <input> dentro de <p-calendar>. O PrimeNG bloqueia digitação
    direta em alguns casos, então usamos JavaScript para setar o valor e
    disparar os eventos que o Angular precisa para reconhecer a mudança.
    """
    try:
        # Fechar qualquer calendário popup aberto antes
        page.keyboard.press("Escape")
        time.sleep(0.1)

        # Forçar o valor via JavaScript + disparo de eventos do Angular/PrimeNG
        page.evaluate(
            """(el, val) => {
                // Setar o valor nativo
                var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                ).set;
                nativeInputValueSetter.call(el, val);

                // Disparar eventos que o Angular/PrimeNG escuta
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            }""",
            inp.element_handle(),
            valor,
        )
        time.sleep(0.3)

        # Tab para confirmar e fechar o popup de calendário
        inp.focus()
        time.sleep(0.1)
        inp.press("Tab")
        time.sleep(0.3)
        page.keyboard.press("Escape")
        time.sleep(0.2)
    except Exception:
        # Fallback: digitação manual caractere a caractere
        try:
            inp.click(force=True)
            time.sleep(0.2)
            inp.press("Control+a")
            inp.press("Delete")
            inp.type(valor, delay=50)
            time.sleep(0.3)
            inp.press("Tab")
            time.sleep(0.3)
            page.keyboard.press("Escape")
            time.sleep(0.2)
        except Exception:
            pass


def _achar_inputs_data(page):
    """
    Localiza os dois inputs de data (De e Até) na pauta do PJe.
    O PJe usa <p-calendar> do PrimeNG mas o input interno pode ter
    diferentes estruturas dependendo da versão. Tenta múltiplos seletores.
    Retorna (input_de, input_ate) — qualquer um pode ser None.
    """
    # Estratégia 1: p-calendar input (PrimeNG padrão)
    cal = page.locator("p-calendar input")
    if cal.count() >= 2:
        log.debug("    inputs data via: p-calendar input")
        return cal.nth(0), cal.nth(1)
    if cal.count() == 1:
        return cal.nth(0), None

    # Estratégia 2: span.p-calendar > input
    cal2 = page.locator("span.p-calendar input, div.p-calendar input, [class*='p-calendar'] input")
    if cal2.count() >= 2:
        log.debug("    inputs data via: [class*=p-calendar] input")
        return cal2.nth(0), cal2.nth(1)

    # Estratégia 3: inputs próximos aos labels "De" e "Até"
    inp_de = None
    inp_ate = None
    for lbl_de in ["label:has-text('De')", "span:has-text('De *')", "*:has-text('De *')"]:
        try:
            lbl = page.locator(lbl_de).first
            if lbl.count() > 0:
                # Tentar input irmão ou filho próximo
                parent = lbl.locator("xpath=..").first
                inp = parent.locator("input").first
                if inp.count() > 0:
                    inp_de = inp
                    break
        except Exception:
            pass

    for lbl_ate in ["label:has-text('Até')", "span:has-text('Até *')", "*:has-text('Até *')"]:
        try:
            lbl = page.locator(lbl_ate).first
            if lbl.count() > 0:
                parent = lbl.locator("xpath=..").first
                inp = parent.locator("input").first
                if inp.count() > 0:
                    inp_ate = inp
                    break
        except Exception:
            pass

    if inp_de or inp_ate:
        log.debug("    inputs data via: label De/Até")
        return inp_de, inp_ate

    # Estratégia 4: todos os inputs visíveis na área de filtro (pegar os últimos 2)
    todos = page.locator("input:visible").all()
    # Filtrar inputs que parecem ser de data (curtos, sem placeholder longo)
    candidatos = []
    for inp in todos:
        try:
            ph = inp.get_attribute("placeholder") or ""
            val = inp.input_value() or ""
            cls = inp.get_attribute("class") or ""
            # Excluir inputs de busca por número de processo
            if any(x in ph.lower() for x in ["número", "processo", "cpf", "cnpj", "buscar", "pesquisar"]):
                continue
            if any(x in cls.lower() for x in ["search", "busca"]):
                continue
            candidatos.append(inp)
        except Exception:
            pass

    if len(candidatos) >= 2:
        log.debug(f"    inputs data via: fallback ({len(candidatos)} candidatos)")
        return candidatos[-2], candidatos[-1]
    if len(candidatos) == 1:
        return candidatos[0], None

    log.warning("    Nenhum input de data encontrado na pauta")
    return None, None


def _aguardar_pauta_carregar(page):
    """Aguarda qualquer indicador de que a pauta Angular foi montada."""
    # Tentar múltiplos seletores indicadores da pauta
    for sel in [
        "p-calendar input", "span.p-calendar", "[class*='p-calendar']",
        "thead th:has-text('Processo')", ".p-datatable", "p-table",
        "table tbody", ".p-paginator"
    ]:
        try:
            page.locator(sel).first.wait_for(state="visible", timeout=3000)
            return
        except Exception:
            continue
    time.sleep(2.0)


def definir_periodo(page):
    """
    Define De=hoje, Até=hoje+DIAS_BUSCA e dispara a busca.
    """
    hoje   = datetime.today()
    fim    = hoje + timedelta(days=DIAS_BUSCA)
    hoje_s = hoje.strftime("%d/%m/%Y")
    fim_s  = fim.strftime("%d/%m/%Y")

    _aguardar_pauta_carregar(page)

    inp_de, inp_ate = _achar_inputs_data(page)
    log.info(f"    De={hoje_s} Até={fim_s} | inp_de={inp_de is not None} inp_ate={inp_ate is not None}")

    if inp_de:
        _set_calendar_input(page, inp_de, hoje_s)
        time.sleep(0.6)
    if inp_ate:
        _set_calendar_input(page, inp_ate, fim_s)
        time.sleep(0.6)

    # Disparar a busca: pressionar Enter no último campo preenchido
    try:
        if inp_ate:
            inp_ate.press("Enter")
        elif inp_de:
            inp_de.press("Enter")
        time.sleep(1)
    except Exception:
        pass

    # Aguardar resultados
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:
        pass
    time.sleep(2)


# ── Extração de linhas da pauta ───────────────────────────────────────────────

def extrair_linhas_pagina(page, nome: str, trt_grau: str) -> list[dict]:
    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass

    linhas = []
    for sel in [".p-datatable-tbody > tr", "table tbody tr", "[class*='datatable'] tbody tr"]:
        found = page.locator(sel).all()
        if found:
            linhas = found
            break

    audiencias = []
    for linha in linhas:
        celulas = linha.locator("td").all()
        if len(celulas) < 3:
            continue
        textos = [c.inner_text().strip() for c in celulas]
        if not any(textos):
            continue

        # Colunas: [0] Processo+partes  [1] Prioridade  [2] Data/hora  [3] Tipo  [4] Vara
        processo_raw  = textos[0] if textos else ""
        data_hora_raw = textos[2] if len(textos) > 2 else ""
        tipo_raw      = textos[3] if len(textos) > 3 else ""
        vara_raw      = textos[4] if len(textos) > 4 else ""

        linhas_proc = processo_raw.split("\n")
        processo    = linhas_proc[0].strip()
        partes_raw  = " | ".join(l.strip() for l in linhas_proc[1:] if l.strip())

        reclamante, reclamada = "", ""
        if " X " in partes_raw.upper():
            sp = re.split(r"\s+[xX]\s+", partes_raw, maxsplit=1)
            reclamante = sp[0].strip()
            reclamada  = sp[1].strip() if len(sp) > 1 else ""
        elif "|" in partes_raw:
            sp = partes_raw.split("|")
            reclamante = sp[0].strip()
            reclamada  = sp[1].strip() if len(sp) > 1 else ""

        data, hora = parse_data_hora(data_hora_raw)
        tipo, mod  = parse_tipo(tipo_raw)
        uid        = make_id(processo, data, hora)

        if not processo and not data:
            continue

        # Capturar href do processo para buscar intimação depois
        proc_href = ""
        try:
            link_el = celulas[0].locator("a").first
            if link_el.count() > 0:
                proc_href = link_el.get_attribute("href") or ""
                if proc_href in ("#", "javascript:void(0)", "javascript:;"):
                    proc_href = ""
        except Exception:
            pass

        audiencias.append({
            "id":             uid,
            "processo":       processo,
            "reclamante":     reclamante,
            "reclamada":      reclamada,
            "data_audiencia": data,
            "horario":        hora,
            "tipo_audiencia": tipo,
            "modalidade":     mod,
            "vara":           vara_raw,
            "status":         "agendada",
            "origem":         "pje",
            "updated_at":     datetime.utcnow().isoformat(),
            # campos populados após busca na intimação
            "_proc_href":    proc_href,
            "_processo_num": processo,
        })
    return audiencias


# ── Paginação completa da pauta ───────────────────────────────────────────────

def scrape_todas_paginas(page, nome: str, trt_grau: str) -> list[dict]:
    todas  = []
    pagina = 1

    while pagina <= 50:
        log.info(f"    Página {pagina}…")
        items = extrair_linhas_pagina(page, nome, trt_grau)

        if not items:
            sem = page.locator("text='Não há resultados'").count()
            log.info(f"    {'Sem audiências no período' if sem else 'Tabela vazia'}")
            break

        todas.extend(items)
        log.info(f"    {len(items)} audiência(s) — total: {len(todas)}")

        prox = page.locator(
            "button[aria-label='Next Page']:not([disabled]),"
            ".p-paginator-next:not(.p-disabled),"
            "button.p-paginator-next:not([disabled])"
        ).first
        try:
            if prox.count() > 0 and prox.is_enabled():
                prox.click()
                pagina += 1
                time.sleep(2)
            else:
                break
        except Exception:
            break

    return todas


# ── Detalhes da intimação por processo ───────────────────────────────────────

# Padrões de link de videoconferência
_RE_LINKS = re.compile(
    r'https?://[^\s<>"\'()]+',
    re.IGNORECASE,
)
_DOMINIOS_VIDEO = re.compile(
    r'zoom\.us|teams\.microsoft\.com|meet\.google\.com|webex\.com|jitsi|whereby\.com'
    r'|videoconferencia|sala\.virtual|mconf|rnp\.br|jus\.br.*(?:video|sala|meet)',
    re.IGNORECASE,
)

# Padrões de ID e senha
_RE_MEETING_ID = re.compile(
    r'(?:ID\s+da\s+reuni[aã]o|meeting\s+id|ID\s+do\s+(?:meet|webinar|reuni[aã]o)|ID)\s*[:\-]?\s*([\d][\d\s\.\-]{4,})',
    re.IGNORECASE,
)
_RE_SENHA = re.compile(
    r'(?:senha|password|c[oó]digo\s+de\s+acesso|access\s+code)\s*[:\-]?\s*([A-Za-z0-9\!\@\#\$\%]{4,})',
    re.IGNORECASE,
)
_RE_TIPO_INTIM = re.compile(
    r'\b(virtual|presencial|h[íi]brida?|telep[re]+sencial|videoconfer[êe]ncia)\b',
    re.IGNORECASE,
)


def _extrair_de_texto(texto: str) -> dict:
    """Extrai link_video, meeting_id e senha de texto livre da intimação."""
    resultado = {"link_video": "", "meeting_id": "", "senha": "", "modalidade_intim": ""}

    # Links de vídeo
    for url in _RE_LINKS.findall(texto):
        url_clean = url.rstrip(".,;)")
        if _DOMINIOS_VIDEO.search(url_clean):
            resultado["link_video"] = url_clean
            break

    # Meeting ID
    m = _RE_MEETING_ID.search(texto)
    if m:
        resultado["meeting_id"] = re.sub(r'\s+', ' ', m.group(1)).strip()

    # Senha
    m = _RE_SENHA.search(texto)
    if m:
        resultado["senha"] = m.group(1).strip()

    # Modalidade confirmada na intimação
    m = _RE_TIPO_INTIM.search(texto)
    if m:
        val = m.group(1).upper()
        if "VIRTUAL" in val or "VIDEO" in val or "TELEPR" in val:
            resultado["modalidade_intim"] = "VIRTUAL"
        elif "HIBRIDA" in val or "HÍBRIDA" in val:
            resultado["modalidade_intim"] = "HIBRIDA"
        elif "PRESENCIAL" in val:
            resultado["modalidade_intim"] = "PRESENCIAL"

    return resultado


def buscar_detalhes_intimacao(ctx, base: str, proc_href: str, proc_num: str) -> dict:
    """
    Abre o processo em nova aba, navega para Comunicações/Audiências,
    extrai link de vídeo, meeting ID e senha da intimação mais recente.
    Fecha a aba ao terminar. Retorna dict com as chaves extraídas.
    """
    vazio = {"link_video": "", "meeting_id": "", "senha": "", "modalidade_intim": ""}

    # Montar URL do processo
    if proc_href and proc_href.startswith("http"):
        url = proc_href
    elif proc_href and proc_href.startswith("/"):
        url = f"{base}{proc_href}"
    else:
        # Fallback: busca por número do processo
        url = f"{base}/pjekz/consulta-publica/listView.seam?paginaConsulta=0&numeroProcesso={quote(proc_num, safe='')}"

    proc_page = ctx.new_page()
    try:
        proc_page.goto(url, wait_until="domcontentloaded", timeout=20000)
        time.sleep(1.5)

        # Tentar navegar para abas de comunicação/audiências (várias nomenclaturas)
        for aba in ["Comunicações", "Comunicacoes", "Intimações", "Audiências", "Audiencias"]:
            tab = proc_page.locator(
                f"[role='tab']:has-text('{aba}'), "
                f"a.nav-link:has-text('{aba}'), "
                f"li:has-text('{aba}') a"
            ).first
            try:
                if tab.count() > 0:
                    tab.wait_for(state="visible", timeout=3000)
                    tab.click()
                    time.sleep(1.5)
                    break
            except Exception:
                pass

        # Tentar abrir o documento/intimação mais recente visível
        for doc_sel in [
            "button:has-text('Visualizar')",
            "a:has-text('Visualizar')",
            ".p-datatable-tbody tr:first-child button",
            ".p-datatable-tbody tr:first-child a",
        ]:
            doc_btn = proc_page.locator(doc_sel).first
            try:
                if doc_btn.count() > 0 and doc_btn.is_visible():
                    # Abrir em nova aba para não perder o contexto do processo
                    with ctx.expect_page(timeout=8000) as doc_info:
                        doc_btn.click(modifiers=["Control"])
                    doc_page = doc_info.value
                    try:
                        doc_page.wait_for_load_state("domcontentloaded", timeout=12000)
                        time.sleep(1)
                        texto = doc_page.inner_text("body")
                        doc_page.close()
                        resultado = _extrair_de_texto(texto)
                        if resultado["link_video"] or resultado["meeting_id"]:
                            return resultado
                    except Exception:
                        try:
                            doc_page.close()
                        except Exception:
                            pass
                    break
            except Exception:
                pass

        # Fallback: extrair texto da página inteira do processo
        texto = proc_page.inner_text("body")
        return _extrair_de_texto(texto)

    except Exception as e:
        log.debug(f"buscar_detalhes_intimacao [{proc_num}]: {e}")
        return vazio
    finally:
        try:
            proc_page.close()
        except Exception:
            pass


# ── Processamento por sistema ─────────────────────────────────────────────────

def processar_sistema(ctx, sistema: dict, ext_id: str, popup: str) -> tuple[int, int]:
    nome = sistema["nome"]
    base = sistema["fallback_base"]
    whom = sistema["whom"]

    log.info(f"  Autenticando via Whom: {whom}")

    # Autenticar via Whom e capturar a página PJe que ele abre
    page = autenticar_e_capturar_pje_page(ctx, ext_id, popup, whom)
    if page is None:
        log.warning(f"  {nome}: falha na autenticacao via Whom")
        return -1, 0

    # Navegar para a pauta — usando a URL base extraída da URL atual (sessão ativa)
    # O Whom redireciona para /pjekz/painel/usuario-externo; a base real do TRT
    # está na URL atual da página, mais confiável que o fallback_base do .env
    url_base_real = base
    try:
        url_corrente = page.url
        if ".jus.br" in url_corrente and "chrome-extension" not in url_corrente:
            from urllib.parse import urlparse
            parsed = urlparse(url_corrente)
            url_base_real = f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        pass

    pauta_url = f"{url_base_real}/pjekz/pauta-usuarios-externos"
    log.info(f"  Pauta: {pauta_url}")

    # ── Verificar se já existe aba com a pauta aberta ─────────────────────────
    # O Whom às vezes abre a pauta diretamente em nova aba. Se já existir,
    # usar ela em vez de navegar na aba do painel.
    aba_pauta = None
    for pg in ctx.pages:
        try:
            if "pauta-usuarios-externos" in pg.url and ".jus.br" in pg.url:
                aba_pauta = pg
                log.info(f"  {nome}: aba da pauta já aberta → {pg.url[:80]}")
                break
        except Exception:
            pass

    if aba_pauta and aba_pauta != page:
        try:
            page.close()
        except Exception:
            pass
        page = aba_pauta

    # ── Navegar para a pauta se ainda não estiver lá ─────────────────────────
    if "pauta-usuarios-externos" not in page.url:
        log.info(f"  {nome}: navegando via Angular Router para pauta...")
        try:
            # Usar evaluate para forçar o Angular Router a navegar internamente
            # goto() com wait_until="commit" pode não funcionar em SPAs Angular
            page.evaluate(f"window.location.href = '{pauta_url}'")
            time.sleep(2)
        except Exception as e:
            log.warning(f"  {nome}: evaluate falhou ({e}), tentando goto...")
            try:
                page.goto(pauta_url, wait_until="commit", timeout=30000)
            except Exception as e2:
                log.warning(f"  {nome}: erro ao navegar para pauta — {e2}")
                try: page.close()
                except Exception: pass
                return 0, 0

    # Verificar acesso negado
    url_atual = page.url.lower()
    if any(k in url_atual for k in ["login", "token", "acesso-negado", "acesso_negado", "nao-autorizado"]):
        log.warning(f"  {nome}: sessão inválida (URL: {page.url[:80]})")
        page.close()
        return -1, 0

    # Aguardar Angular montar a tabela da pauta (qualquer indicador visível)
    # O p-calendar pode não ser o componente PrimeNG — tentar múltiplos seletores
    SELETORES_PAUTA = [
        "p-calendar input",               # PrimeNG p-calendar
        "input[placeholder*='De']",        # input com placeholder De
        "input[placeholder*='Até']",       # input com placeholder Até
        ".p-datepicker-trigger",           # botão trigger do datepicker
        "span.p-calendar",                 # span wrapper do p-calendar
        "[class*='p-calendar']",           # qualquer elemento com p-calendar na class
        "p-table",                         # tabela de resultados
        ".p-datatable",                    # datatable PrimeNG
        "table.p-datatable-table",         # tabela real
        "thead th:has-text('Processo')",   # cabeçalho da tabela de processos
    ]
    pauta_carregada = False
    for sel in SELETORES_PAUTA:
        try:
            page.locator(sel).first.wait_for(state="visible", timeout=5000)
            log.info(f"  {nome}: pauta carregada ✓ (via '{sel}')")
            pauta_carregada = True
            break
        except Exception:
            continue

    if not pauta_carregada:
        url_atual = page.url.lower()
        if any(k in url_atual for k in ["login", "token", "acesso-negado", "nao-autorizado"]):
            log.warning(f"  {nome}: redirecionado para login (URL: {page.url[:80]})")
            page.close()
            return -1, 0
        if "pauta-usuarios-externos" not in url_atual:
            log.warning(f"  {nome}: URL não é a pauta (URL: {page.url[:80]})")
        log.warning(f"  {nome}: componentes da pauta não detectados. Continuando mesmo assim...")
    
    # Pausa extra para Angular finalizar renderização
    time.sleep(2)

    log.info(f"  Período: hoje → +{DIAS_BUSCA} dias")
    definir_periodo(page)

    audiencias = scrape_todas_paginas(page, nome, nome)
    page.close()

    if not audiencias:
        return 0, 0

    # ── Buscar detalhes da intimação processo a processo ──────────────────────
    log.info(f"  Buscando detalhes das intimações ({len(audiencias)} processo(s))...")
    for i, aud in enumerate(audiencias, 1):
        proc_href = aud.pop("_proc_href", "")
        proc_num  = aud.pop("_processo_num", "")
        log.info(f"    [{i}/{len(audiencias)}] {proc_num[:40]}…")
        detalhes = buscar_detalhes_intimacao(ctx, base, proc_href, proc_num)
        # Atualizar modalidade se intimação confirmou algo diferente
        if detalhes["modalidade_intim"]:
            aud["modalidade"] = detalhes["modalidade_intim"]
        aud["link"] = detalhes["link_video"]
        partes_id_senha = []
        if detalhes["meeting_id"]:
            partes_id_senha.append(f"ID: {detalhes['meeting_id']}")
        if detalhes["senha"]:
            partes_id_senha.append(f"Senha: {detalhes['senha']}")
        aud["id_senha"] = " | ".join(partes_id_senha)
        time.sleep(0.5)

    # ── Salvar no Supabase ────────────────────────────────────────────────────
    enviados = sb_upsert(audiencias)
    log.info(f"  {nome}: {enviados} audiências salvas")

    # ── Detectar cancelamentos ────────────────────────────────────────────────
    cancelados = 0
    ids_coletados = {a["id"] for a in audiencias}
    ativos_sb     = sb_buscar_ativos(nome)
    ids_sb        = {r["id"] for r in ativos_sb}
    desaparecidos = ids_sb - ids_coletados
    if desaparecidos:
        sb_marcar_cancelado(list(desaparecidos))
        cancelados = len(desaparecidos)
        log.info(f"  {nome}: {cancelados} marcada(s) como cancelado_pje")

    return enviados, cancelados


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log.info("=" * 60)
    log.info(f"Iniciando coleta — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    log.info(f"Supabase: {SB_URL or 'NÃO CONFIGURADO'}")
    log.info(f"Sistemas: {len(SISTEMAS)} | Período: hoje + {DIAS_BUSCA} dias")
    log.info("=" * 60)

    if not SB_URL or not SB_KEY:
        log.error("SUPABASE_URL e SUPABASE_KEY não configurados no .env")
        return

    # Whom é obrigatório — autentica cada TRT antes do scrape
    ext_id, popup = encontrar_whom()
    if not ext_id:
        log.error("Extensao Whom nao encontrada. Configure WHOM_EXT_ID no .env. Abortando.")
        return
    log.info(f"Whom: chrome-extension://{ext_id}/{popup}")

    # Garantir Chrome aberto com debug port (SEM matar abas existentes)
    log.info("Verificando Chrome...")
    if not garantir_chrome_aberto():
        log.error("Nao foi possivel iniciar Chrome. Abortando.")
        return

    resumo = {"ok": [], "sem_auth": [], "sem_aud": [], "erro": [], "total": 0, "cancelados": 0}

    with sync_playwright() as p:
        log.info(f"Conectando ao Chrome via CDP (porta {CHROME_DEBUG_PORT})...")
        browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:{CHROME_DEBUG_PORT}")
        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        log.info("Conectado ao Chrome.")

        for sistema in SISTEMAS:
            nome = sistema["nome"]
            log.info(f"\n{'─' * 50}")
            log.info(f"[{nome}]")
            try:
                # Verificar se o contexto ainda está vivo; reconectar se necessário
                try:
                    _ = ctx.pages
                except Exception:
                    log.warning("BrowserContext fechado. Reconectando ao Chrome...")
                    browser, ctx = reconectar_contexto(p)
                    if ctx is None:
                        log.error("Não foi possível reconectar ao Chrome. Abortando.")
                        break

                enviados, cancelados = processar_sistema(ctx, sistema, ext_id, popup)
                resumo["cancelados"] += cancelados
                if enviados == -1:
                    resumo["sem_auth"].append(nome)
                elif enviados > 0:
                    resumo["total"] += enviados
                    resumo["ok"].append(f"{nome} ({enviados} auds, {cancelados} cancel.)")
                else:
                    resumo["sem_aud"].append(nome)
            except Exception as e:
                log.error(f"  {nome}: erro inesperado — {e}")
                resumo["erro"].append(nome)
                # Tentar reconectar se o contexto foi perdido
                if "closed" in str(e).lower() or "context" in str(e).lower():
                    log.warning("Tentando reconectar ao Chrome após erro de contexto...")
                    try:
                        browser, ctx = reconectar_contexto(p)
                        if ctx is None:
                            log.error("Reconexão falhou. Abortando.")
                            break
                    except Exception as re_e:
                        log.error(f"Reconexão falhou: {re_e}. Abortando.")
                        break
            time.sleep(1)

        # Chrome permanece aberto com todas as abas existentes
        log.info("Scraping concluido. Chrome mantido aberto.")

    log.info("\n" + "=" * 60)
    log.info("RELATÓRIO FINAL")
    log.info("=" * 60)
    log.info(f"Total salvas:             {resumo['total']}")
    log.info(f"Cancelamentos detectados: {resumo['cancelados']}")
    if resumo["ok"]:
        log.info("Com audiências:\n  " + "\n  ".join(resumo["ok"]))
    if resumo["sem_aud"]:
        log.info("Sem audiências no período:\n  " + "\n  ".join(resumo["sem_aud"]))
    if resumo["sem_auth"]:
        log.warning("Sem autenticação:\n  " + "\n  ".join(resumo["sem_auth"]))
    if resumo["erro"]:
        log.error("Com erro:\n  " + "\n  ".join(resumo["erro"]))
    log.info("=" * 60)


if __name__ == "__main__":
    main()
