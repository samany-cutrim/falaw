"""
whom_auth.py — Automatiza o login via Whom para todos os TRTs configurados.
Abre o Chrome automaticamente se necessário.
Detecta automaticamente o ID da extensão Whom instalada no Chrome.

Uso: python whom_auth.py
"""

import json
import subprocess
import time
import logging
import os
import requests
from pathlib import Path
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

_HERE = Path(__file__).parent
load_dotenv(_HERE / ".env")

CHROME_DEBUG_PORT  = int(os.getenv("CHROME_DEBUG_PORT", "9222"))
CERT_NAME          = os.getenv("WHOM_CERT_NAME", "")
CHROME_PROFILE     = os.getenv("CHROME_PROFILE", "Default")
MODO_OCULTO        = os.getenv("MODO_OCULTO", "false").lower() in ("true", "1", "sim", "s")
# ID e popup da extensão Whom — configure no .env para evitar detecção automática
WHOM_EXT_ID_ENV    = os.getenv("WHOM_EXT_ID", "")
WHOM_EXT_POPUP_ENV = os.getenv("WHOM_EXT_POPUP", "")

_APPDATA = Path(os.environ.get("LOCALAPPDATA", ""))

# Chrome do usuário (onde o Whom já está instalado)
CHROME_USER_DATA  = os.getenv(
    "CHROME_USER_DATA",
    str(_APPDATA / "Google" / "Chrome" / "User Data"),
)

# TRTs configurados — edite WHOM_TRTS no .env para restringir
# Formato: "TRT1 Pje - 1º grau,TRT1 Pje - 2º grau,..."
_WHOM_TRTS_ENV = os.getenv("WHOM_TRTS", "")
WHOM_TRTS = [t.strip() for t in _WHOM_TRTS_ENV.split(",") if t.strip()] if _WHOM_TRTS_ENV else [
    "TRT1 Pje - 1º grau",  "TRT1 Pje - 2º grau",
    "TRT2 Pje - 1º grau",  "TRT2 Pje - 2º grau",
    "TRT3 Pje - 1º grau",  "TRT3 Pje - 2º grau",
    "TRT4 Pje - 1º grau",  "TRT4 Pje - 2º grau",
    "TRT5 Pje - 1º grau",  "TRT5 Pje - 2º grau",
    "TRT6 Pje - 1º grau",  "TRT6 Pje - 2º grau",
    "TRT7 Pje - 1º grau",  "TRT7 Pje - 2º grau",
    "TRT8 Pje - 1º grau",  "TRT8 Pje - 2º grau",
    "TRT9 Pje - 1º grau",  "TRT9 Pje - 2º grau",
    "TRT10 Pje - 1º grau", "TRT10 Pje - 2º grau",
    "TRT11 Pje - 1º grau", "TRT11 Pje - 2º grau",
    "TRT12 Pje - 1º grau", "TRT12 Pje - 2º grau",
    "TRT13 Pje - 1º grau", "TRT13 Pje - 2º grau",
    "TRT14 Pje - 1º grau", "TRT14 Pje - 2º grau",
    "TRT15 Pje - 1º grau", "TRT15 Pje - 2º grau",
    "TRT16 Pje - 1º grau", "TRT16 Pje - 2º grau",
    "TRT17 Pje - 1º grau", "TRT17 Pje - 2º grau",
    "TRT18 Pje - 1º grau", "TRT18 Pje - 2º grau",
    "TRT19 Pje - 1º grau", "TRT19 Pje - 2º grau",
    "TRT20 Pje - 1º grau", "TRT20 Pje - 2º grau",
    "TRT21 Pje - 1º grau", "TRT21 Pje - 2º grau",
    "TRT22 Pje - 1º grau", "TRT22 Pje - 2º grau",
    "TRT23 Pje - 1º grau", "TRT23 Pje - 2º grau",
    "TRT24 Pje - 1º grau", "TRT24 Pje - 2º grau",
    "TST Pje",
]

log = logging.getLogger(__name__)

CDP_BASE = f"http://127.0.0.1:{CHROME_DEBUG_PORT}"


def matar_todo_chrome() -> None:
    """Mata TODOS os processos Chrome para liberar o perfil de usuário."""
    try:
        subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
             "Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue"],
            timeout=10,
        )
        time.sleep(2)
        log.info("Chrome encerrado.")
        udata = Path(CHROME_USER_DATA)
        for lock in ["SingletonLock", "SingletonSocket", "SingletonCookie"]:
            for d in [udata, udata / CHROME_PROFILE]:
                try: (d / lock).unlink(missing_ok=True)
                except Exception: pass
    except Exception as e:
        log.warning(f"Não foi possível matar Chrome: {e}")


def matar_chrome_scraping() -> None:
    """Alias de matar_todo_chrome() para compatibilidade."""
    matar_todo_chrome()

_CHROME_CANDIDATOS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


# ── Garantir que Chrome está rodando com debug port ───────────────────────────

def garantir_chrome_aberto() -> bool:
    """
    Verifica se Chrome já está na porta de debug.
    Se não, mata o Chrome existente e abre um novo com o debug port.
    Retorna True quando Chrome está disponível.
    """
    try:
        r = requests.get(f"{CDP_BASE}/json/version", timeout=3)
        if r.status_code == 200:
            log.info(f"Chrome já está na porta {CHROME_DEBUG_PORT}. Reutilizando sessão.")
            return True
    except Exception:
        pass

    # Localizar executável do Chrome
    chrome_exe = next((c for c in _CHROME_CANDIDATOS if Path(c).exists()), "")
    if not chrome_exe:
        log.error("Chrome não encontrado no sistema.")
        return False

    # Matar TODOS os processos chrome.exe antes de relançar com debug port
    log.info("Encerrando todos os processos Chrome para relançar com debug port...")
    subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
         "Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue"],
        timeout=10,
    )
    time.sleep(2)

    # Limpar singleton locks do perfil de usuário real
    udata = Path(CHROME_USER_DATA)
    udata.mkdir(parents=True, exist_ok=True)
    default_dir = udata / CHROME_PROFILE
    for lock in ["SingletonLock", "SingletonSocket", "SingletonCookie"]:
        try:
            (udata / lock).unlink(missing_ok=True)
        except Exception:
            pass
        try:
            (default_dir / lock).unlink(missing_ok=True)
        except Exception:
            pass

    # Abrir Chrome do usuário real com debug port (onde o Whom já está instalado)
    modo_txt = "oculto" if MODO_OCULTO else "visível"
    log.info(f"Abrindo Chrome [{modo_txt}] com debug port {CHROME_DEBUG_PORT} (perfil: {CHROME_PROFILE})...")

    chrome_args = [
        f"--remote-debugging-port={CHROME_DEBUG_PORT}",
        f"--user-data-dir={CHROME_USER_DATA}",
        f"--profile-directory={CHROME_PROFILE}",
        "--remote-allow-origins=*",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-session-crashed-bubble",
        "--disable-background-networking",
        "about:blank",
    ]
    if MODO_OCULTO:
        chrome_args += ["--window-position=-10000,0", "--window-size=1280,800"]

    ps_args = ",".join(f'"{a}"' for a in chrome_args)
    window_style = "Minimized" if MODO_OCULTO else "Normal"
    ps_cmd = f'Start-Process -FilePath "{chrome_exe}" -ArgumentList {ps_args} -WindowStyle {window_style}'
    subprocess.Popen(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Aguardar até 30 segundos
    for _ in range(30):
        time.sleep(1)
        try:
            r = requests.get(f"{CDP_BASE}/json/version", timeout=2)
            if r.status_code == 200:
                log.info("Chrome pronto!")
                return True
        except Exception:
            pass

    log.error(f"Chrome não respondeu na porta {CHROME_DEBUG_PORT} após 30 segundos.")
    return False


def reconectar_contexto(p):
    """
    Reconecta ao Chrome via CDP e retorna (browser, ctx).
    Usado quando o BrowserContext é fechado inesperadamente pelo Chrome.
    """
    try:
        browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:{CHROME_DEBUG_PORT}")
        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        log.info("Reconectado ao Chrome via CDP.")
        return browser, ctx
    except Exception as e:
        log.error(f"Falha ao reconectar ao Chrome: {e}")
        return None, None


# ── Detectar extensão Whom ────────────────────────────────────────────────────

def encontrar_whom() -> tuple[str, str]:
    """Retorna (extension_id, popup_path) do Whom.
    Usa WHOM_EXT_ID/.env quando configurado; senão faz detecção automática."""

    # Configuração manual via .env — mais confiável (evita detecção errada)
    if WHOM_EXT_ID_ENV:
        popup = WHOM_EXT_POPUP_ENV or "sidepanel.html?mode=tab"
        log.info(f"Whom (configurado): ID={WHOM_EXT_ID_ENV} | popup={popup}")
        return WHOM_EXT_ID_ENV, popup

    # ── Auto-detecção ─────────────────────────────────────────────────────────
    possiveis_data_dirs = []
    scraping_dir = Path(CHROME_USER_DATA)
    if scraping_dir.exists():
        possiveis_data_dirs.append(scraping_dir)
    appdata = Path(os.environ.get("LOCALAPPDATA", ""))
    for canal in ["Google/Chrome", "Google/Chrome Beta", "Google/Chrome Dev", "Chromium"]:
        d = appdata / canal / "User Data"
        if d.exists() and d != scraping_dir:
            possiveis_data_dirs.append(d)

    if not possiveis_data_dirs:
        log.error("Diretório do Chrome não encontrado.")
        return "", ""

    perfis = ["Default", CHROME_PROFILE] + [f"Profile {i}" for i in range(1, 25)]

    for data_dir in possiveis_data_dirs:
        for perfil in perfis:
            ext_base = data_dir / perfil / "Extensions"
            if not ext_base.exists():
                continue
            for ext_id_dir in ext_base.iterdir():
                if not ext_id_dir.is_dir():
                    continue
                for versao_dir in sorted(ext_id_dir.iterdir(), reverse=True):
                    manifest_path = versao_dir / "manifest.json"
                    if not manifest_path.exists():
                        continue
                    try:
                        manifest = json.loads(manifest_path.read_text("utf-8", errors="ignore"))
                        nome = manifest.get("name", "").lower()
                        descricao = manifest.get("description", "").lower()
                        if "whom" in nome or ("certificado" in descricao and "digital" in descricao):
                            # Side panel extension usa side_panel.default_path
                            popup = (
                                manifest.get("action", {}).get("default_popup")
                                or manifest.get("browser_action", {}).get("default_popup")
                                or manifest.get("side_panel", {}).get("default_path")
                                or "sidepanel.html"
                            )
                            # Side panels precisam do ?mode=tab para abrir como aba
                            if "sidepanel" in popup.lower() and "?" not in popup:
                                popup = f"{popup}?mode=tab"
                            ext_id = ext_id_dir.name
                            log.info(f"Whom encontrado: ID={ext_id} | popup={popup} | perfil={perfil}")
                            return ext_id, popup
                    except Exception:
                        continue

    log.error(
        "Extensão Whom não encontrada.\n"
        "  → Configure WHOM_EXT_ID no arquivo .env com o ID da extensão.\n"
        "  → Exemplo: WHOM_EXT_ID=lnidijeaekolpfeckelhkomndglcglhh"
    )
    return "", ""


# ── Helpers CDP ────────────────────────────────────────────────────────────────

def _fechar_abas_whom(ext_id: str) -> None:
    try:
        for t in requests.get(f"{CDP_BASE}/json/list", timeout=5).json():
            if ext_id in t.get("url", ""):
                requests.get(f"{CDP_BASE}/json/close/{t['id']}", timeout=5)
    except Exception:
        pass


# ── Automação da interface do Whom ────────────────────────────────────────────

# Campo de CERTIFICADO (estado inicial — placeholder "Pesquise por certificado")
_CERT_LOC = (
    "input[placeholder*='certificado' i], "
    "input[placeholder*='Pesquise por cert' i]"
)

# Campo de SISTEMA (estado após certificado selecionado — placeholder "Digite ou selecione um sistema pra acessar")
_SI_LOC = (
    "input[placeholder*='sistema' i], "
    "input[placeholder*='pra acessar' i], "
    "input[placeholder*='para acessar' i]"
)

def _variantes_sistema(sistema: str) -> list[str]:
    """
    Gera variantes do nome do sistema para lidar com diferenças tipográficas do Whom.
    Ex: "TRT1 Pje - 1º grau" → também testa "TRT1 Pje - 1° Grau", "TRT1 PJe - 1° Grau", etc.
    """
    variantes = {sistema}

    # Trocar ordinal º (U+00BA) ↔ grau ° (U+00B0)
    for v in list(variantes):
        if "º" in v:
            variantes.add(v.replace("º", "°"))
        if "°" in v:
            variantes.add(v.replace("°", "º"))

    # Capitalização do "grau" → "Grau"
    for v in list(variantes):
        if " grau" in v:
            variantes.add(v.replace(" grau", " Grau"))
        if " Grau" in v:
            variantes.add(v.replace(" Grau", " grau"))

    # "grau" com til: "1º grau" → "1o grau" e vice-versa (para .env sem acentos)
    for v in list(variantes):
        for par in [("1º", "1o"), ("2º", "2o"), ("1°", "1o"), ("2°", "2o")]:
            if par[0] in v:
                variantes.add(v.replace(par[0], par[1]))
            if par[1] in v:
                variantes.add(v.replace(par[1], par[0]))

    return list(variantes)


def _opcao_sistema(page, sistema: str):
    """
    Retorna o locator para o item da lista do Whom que corresponde ao sistema.
    Tenta texto exato e todas as variantes de capitalização/símbolo ordinal.
    O Whom usa role='menuitem' com texto dentro de <span>.
    """
    _SEL_ITEM = "[role='menuitem'], [role='option'], [role='listitem'], li"
    for variante in _variantes_sistema(sistema):
        loc = page.locator(f"{_SEL_ITEM}:has-text('{variante}')").first
        try:
            if loc.count() > 0:
                return loc
        except Exception:
            pass
    # Último recurso: busca pelo número do TRT no texto (ex: "TRT1" em "TRT1 Pje - 1° Grau")
    import re as _re
    m = _re.search(r"TRT(\d+)", sistema, _re.IGNORECASE)
    if m:
        num = m.group(1)
        grau = "1" if "1" in sistema.split("TRT"+num)[-1][:5] else "2"
        for v in [f"TRT{num} Pje - 1° Grau", f"TRT{num} Pje - 2° Grau",
                  f"TRT{num} Pje - 1º Grau", f"TRT{num} Pje - 2º Grau",
                  f"TRT{num} Pje - 1° grau", f"TRT{num} Pje - 2° grau"]:
            if grau in v.split("TRT"+num)[-1][:10]:
                loc = page.locator(f"{_SEL_ITEM}:has-text('{v}')").first
                try:
                    if loc.count() > 0:
                        return loc
                except Exception:
                    pass
    # Retorna o primeiro item genérico como fallback (para não travar)
    return page.locator(f"{_SEL_ITEM}:has-text('{sistema}')").first

def _abrir_whom_page(ctx, ext_id: str, popup: str):
    """Abre a extensão Whom numa nova aba (launch_persistent_context) e retorna a página."""
    ext_url = f"chrome-extension://{ext_id}/{popup}"
    # Fechar abas Whom existentes
    for pg in list(ctx.pages):
        if ext_id in pg.url:
            try:
                pg.close()
            except Exception:
                pass
    time.sleep(0.3)

    page = ctx.new_page()
    try:
        page.goto(ext_url, wait_until="domcontentloaded", timeout=12000)
        time.sleep(1.5)
        return page
    except Exception as e:
        log.warning(f"Erro ao abrir Whom ({ext_url}): {e}")
        try:
            page.close()
        except Exception:
            pass
        return None


def _selecionar_certificado(page, cert_name: str) -> bool:
    """
    Verifica se o Whom está na tela de seleção de certificado.
    Se sim, digita o nome do certificado e clica no item correspondente.
    Retorna True se o certificado foi selecionado ou já estava selecionado.
    """
    cert_input = page.locator(_CERT_LOC).first
    try:
        cert_input.wait_for(state="visible", timeout=5000)
    except PWTimeout:
        # Campo de certificado não apareceu → certificado já selecionado
        return True

    # Campo de certificado visível → selecionar pelo nome
    try:
        cert_input.click()
        time.sleep(0.3)
        if cert_name:
            cert_input.fill(cert_name)
            time.sleep(1.0)
            # Clicar no item que corresponde ao certificado
            item = page.locator(
                f"[role='menuitem']:has-text('{cert_name}'), "
                f"[role='option']:has-text('{cert_name}')"
            ).first
            try:
                item.wait_for(state="visible", timeout=4000)
                item.click()
                time.sleep(1.5)
                log.debug(f"Certificado selecionado: {cert_name}")
                return True
            except PWTimeout:
                pass
        # Fallback: clicar no primeiro item disponível
        item = page.locator("[role='menuitem']:not([disabled])").first
        item.wait_for(state="visible", timeout=4000)
        item.click()
        time.sleep(1.5)
        return True
    except Exception as e:
        log.warning(f"Erro ao selecionar certificado: {e}")
        return False


def _esperar_campo_sistema(page, cert_name: str = "", timeout_ms=10000) -> bool:
    """
    Garante que o campo de sistema está visível.
    1) Se o campo de certificado aparecer primeiro, seleciona o certificado.
    2) Aguarda o campo de sistema aparecer.
    Retorna True se o campo de sistema ficou visível.
    """
    # Primeiro: tentar selecionar certificado se necessário
    _selecionar_certificado(page, cert_name)

    # Agora aguardar o campo de sistema
    si_loc = page.locator(_SI_LOC)
    try:
        si_loc.first.wait_for(state="visible", timeout=timeout_ms)
        return True
    except PWTimeout:
        log.warning("Campo de sistema não ficou visível após seleção de certificado")
        return False


def autenticar_sistema(ctx, ext_id: str, popup: str, sistema: str) -> bool:
    """
    Abre o painel do Whom numa nova aba e executa o fluxo de autenticação.
    Retorna True se conseguiu clicar em Acessar.
    """
    page = _abrir_whom_page(ctx, ext_id, popup)

    if not page:
        log.warning(f"[{sistema}] Página do Whom não encontrada após abertura")
        return False

    try:
        # ── Fechar NPS se aparecer ────────────────────────────────────────────
        try:
            nps = page.locator("button:has-text('Responder depois')")
            nps.wait_for(state="visible", timeout=2500)
            nps.click()
            time.sleep(0.8)
            log.debug("NPS fechado")
        except PWTimeout:
            pass

        # ── Aguardar campo de sistema (certificado já pré-selecionado no v3.3.7+) ──
        if not _esperar_campo_sistema(page, cert_name=CERT_NAME, timeout_ms=10000):
            log.warning(f"[{sistema}] Campo de sistema não apareceu")
            page.close()
            return False

        # ── Campo de sistema ──────────────────────────────────────────────────
        si = page.locator(_SI_LOC).first
        si.click()
        time.sleep(0.3)
        si.fill("")
        time.sleep(0.2)
        si.fill(sistema)
        time.sleep(1.5)

        # ── Selecionar item na lista filtrada ─────────────────────────────────
        opcao = _opcao_sistema(page, sistema)
        try:
            opcao.wait_for(state="visible", timeout=4000)
            opcao.click()
            time.sleep(0.5)
        except PWTimeout:
            log.warning(f"[{sistema}] Sistema não encontrado no dropdown do Whom")
            page.close()
            return False

        # ── Botão Acessar ─────────────────────────────────────────────────────
        acessar = page.locator("button:has-text('Acessar')").first
        try:
            acessar.wait_for(state="visible", timeout=3000)
        except PWTimeout:
            log.warning(f"[{sistema}] Botão Acessar não apareceu")
            page.close()
            return False

        if not acessar.is_enabled():
            log.warning(f"[{sistema}] Botão Acessar desabilitado")
            page.close()
            return False

        # JS click contorna overlay sc-gloWDX que intercepta pointer events
        try:
            acessar.evaluate("el => el.click()")
        except Exception:
            acessar.click(force=True)
        log.info(f"[OK] {sistema}")
        time.sleep(3)

        # Fechar aba da extensão
        page.close()

        # Fechar abas do PJe abertas pelo Whom (não queremos poluir o Chrome)
        for pg in list(ctx.pages):
            url = pg.url
            if any(k in url for k in ["trt", "tst", "pje"]) and "chrome-extension" not in url:
                try:
                    pg.close()
                except Exception:
                    pass

        return True

    except PWTimeout as e:
        log.warning(f"[{sistema}] Timeout: {e}")
        try: page.close()
        except Exception: pass
        return False
    except Exception as e:
        log.error(f"[{sistema}] Erro inesperado: {e}")
        try: page.close()
        except Exception: pass
        return False


# ── Main ───────────────────────────────────────────────────────────────────────

def _aguardar_pje_em_qualquer_aba(ctx, sistema: str, timeout_s: int = 90):
    """
    Varre TODAS as abas abertas procurando uma que chegue em .jus.br.
    Retorna a primeira aba PJe válida encontrada, ou None se timeout.

    Estratégia: não monitora uma aba específica — o Whom pode abrir
    progress.html que depois redireciona para o PJe, ou pode abrir o PJe
    diretamente. Qualquer aba .jus.br fora do chrome-extension é válida.
    """
    deadline = time.time() + timeout_s
    ultimo_log = {}
    while time.time() < deadline:
        for pg in ctx.pages:
            try:
                url = pg.url
            except Exception:
                continue
            if (".jus.br" in url
                    and "chrome-extension" not in url
                    and "about:" not in url
                    and "acesso-negado" not in url):
                log.info(f"[OK] {sistema} → {url[:80]}")
                try:
                    pg.wait_for_load_state("domcontentloaded", timeout=10000)
                except Exception:
                    pass
                time.sleep(1.0)
                return pg
            # Logar mudanças sem spam por aba
            if url != ultimo_log.get(id(pg)):
                if "chrome-extension" in url and "progress" in url:
                    log.info(f"[{sistema}] Doc9 processando cert A3...")
                ultimo_log[id(pg)] = url
        time.sleep(0.8)

    log.warning(f"[{sistema}] Timeout ({timeout_s}s) — nenhuma aba PJe encontrada")
    return None


def autenticar_e_capturar_pje_page(ctx, ext_id: str, popup: str, sistema: str):
    """
    Autentica via Whom e retorna a página PJe aberta pelo Whom.
    NÃO fecha a aba PJe — o chamador deve navegar para a pauta e fechá-la.
    Retorna None se a autenticação falhar.
    """
    page = _abrir_whom_page(ctx, ext_id, popup)

    if not page:
        log.warning(f"[{sistema}] Painel Whom não abriu")
        return None

    try:
        # NPS
        try:
            nps = page.locator("button:has-text('Responder depois')")
            nps.wait_for(state="visible", timeout=2500)
            nps.click()
            time.sleep(0.8)
        except PWTimeout:
            pass

        # ── Aguardar campo de sistema (certificado já pré-selecionado no v3.3.7+) ──
        if not _esperar_campo_sistema(page, cert_name=CERT_NAME, timeout_ms=10000):
            log.warning(f"[{sistema}] Campo de sistema não apareceu")
            page.close()
            return None

        # Campo de sistema
        si = page.locator(_SI_LOC).first
        si.click()
        time.sleep(0.3)
        si.fill("")
        time.sleep(0.2)
        si.fill(sistema)
        time.sleep(1.5)

        # Selecionar item na lista filtrada
        opcao = _opcao_sistema(page, sistema)
        try:
            opcao.wait_for(state="visible", timeout=4000)
            opcao.click()
            time.sleep(0.5)
        except PWTimeout:
            log.warning(f"[{sistema}] Sistema não encontrado no dropdown")
            page.close()
            return None

        # Botão Acessar — capturar aba PJe que o Whom abre
        acessar = page.locator("button:has-text('Acessar')").first
        try:
            acessar.wait_for(state="visible", timeout=3000)
        except PWTimeout:
            log.warning(f"[{sistema}] Botão Acessar não apareceu")
            page.close()
            return None

        if not acessar.is_enabled():
            log.warning(f"[{sistema}] Botão Acessar desabilitado")
            page.close()
            return None

        # ── Clicar em Acessar e aguardar PJe em qualquer aba ────────────────
        # Whom v3.3.9 modo aba: clicar Acessar abre progress.html em nova aba,
        # que redireciona para pje.trtN.jus.br. O overlay sc-gloWDX bloqueia
        # pointer events → JS click.
        # Não tentamos rastrear qual aba — varremos todas até achar .jus.br.

        def _clicar_acessar():
            try:
                acessar.evaluate("el => el.click()")
            except Exception:
                try:
                    acessar.click(force=True)
                except Exception:
                    acessar.click()

        _clicar_acessar()

        # Aguardar qualquer aba chegar em .jus.br (Doc9 pode demorar ~40s)
        pje_page = _aguardar_pje_em_qualquer_aba(ctx, sistema, timeout_s=90)

        if pje_page is None:
            log.warning(f"[{sistema}] Nenhuma aba PJe encontrada após 90s")
            return None

        # Fechar aba do Whom se for diferente da aba PJe
        if page != pje_page:
            try:
                page.close()
            except Exception:
                pass

        return pje_page

    except Exception as e:
        log.error(f"[{sistema}] Erro: {e}")
        try:
            page.close()
        except Exception:
            pass
        return None


def main():
    _log_dir = _HERE / "logs"
    _log_dir.mkdir(exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(_log_dir / "whom_auth.log", encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    log.info("=" * 60)
    log.info("Whom Auth — Detectando extensão e autenticando TRTs")
    log.info("=" * 60)

    if not CERT_NAME:
        log.error("WHOM_CERT_NAME não configurado no .env")
        log.error("Exemplo: WHOM_CERT_NAME=Tatiana Guimaraes Ferraz Andrade")
        return

    ext_id, popup_file = encontrar_whom()
    if not ext_id:
        log.error("Não foi possível encontrar a extensão Whom. Abortando.")
        return

    log.info(f"URL do Whom: chrome-extension://{ext_id}/{popup_file}")

    log.info("Verificando Chrome...")
    if not garantir_chrome_aberto():
        log.error("Nao foi possivel iniciar Chrome. Abortando.")
        return

    with sync_playwright() as p:
        log.info(f"Conectando ao Chrome via CDP (porta {CHROME_DEBUG_PORT})...")
        browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:{CHROME_DEBUG_PORT}")
        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        log.info("Conectado ao Chrome.")

        ok = []
        nao_encontrado = []

        for sistema in WHOM_TRTS:
            log.info(f"Autenticando: {sistema}")
            # Verificar se o contexto ainda está vivo
            try:
                _ = ctx.pages
            except Exception:
                log.warning("BrowserContext fechado. Reconectando ao Chrome...")
                try:
                    browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:{CHROME_DEBUG_PORT}")
                    ctx = browser.contexts[0] if browser.contexts else browser.new_context()
                    log.info("Reconectado.")
                except Exception as e:
                    log.error(f"Reconexão falhou: {e}. Abortando.")
                    break

            sucesso = autenticar_sistema(ctx, ext_id, popup_file, sistema)
            if sucesso:
                ok.append(sistema)
            else:
                nao_encontrado.append(sistema)
            time.sleep(0.5)

        # Chrome permanece aberto

    log.info("\n" + "=" * 60)
    log.info("RESULTADO")
    log.info("=" * 60)
    log.info(f"Autenticados ({len(ok)}): {', '.join(ok) if ok else '—'}")
    if nao_encontrado:
        log.warning(f"Não autenticados ({len(nao_encontrado)}): {', '.join(nao_encontrado)}")
    log.info("=" * 60)
    log.info("Sessões ativas. Execute scraper.py para coletar as audiências.")


if __name__ == "__main__":
    main()
