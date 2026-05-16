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

CHROME_DEBUG_PORT = int(os.getenv("CHROME_DEBUG_PORT", "9222"))
CERT_NAME         = os.getenv("WHOM_CERT_NAME", "")
CHROME_PROFILE    = os.getenv("CHROME_PROFILE", "Default")
MODO_OCULTO       = os.getenv("MODO_OCULTO", "false").lower() in ("true", "1", "sim", "s")

_APPDATA = Path(os.environ.get("LOCALAPPDATA", ""))

# Perfil de Chrome EXCLUSIVO para scraping — nunca interfere com o Chrome normal em uso.
# Primeira vez: o Chrome abrirá com um perfil limpo; instale a extensão Whom nele.
CHROME_USER_DATA  = os.getenv(
    "CHROME_USER_DATA",
    str(_APPDATA / "Google" / "Chrome" / "FalawScraper"),
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
        requests.get(f"{CDP_BASE}/json/version", timeout=2)
        log.info(f"Chrome já está na porta {CHROME_DEBUG_PORT}. Reutilizando sessão.")
        return True
    except Exception:
        pass

    # Localizar executável do Chrome
    chrome_exe = next((c for c in _CHROME_CANDIDATOS if Path(c).exists()), "")
    if not chrome_exe:
        log.error("Chrome não encontrado no sistema.")
        return False

    # Criar diretório de dados do Chrome de scraping (separado do Chrome normal)
    udata = Path(CHROME_USER_DATA)
    udata.mkdir(parents=True, exist_ok=True)

    # Limpar apenas os singleton locks do Chrome de SCRAPING (nunca toca no Chrome em uso)
    for lock in ["SingletonLock", "SingletonSocket", "SingletonCookie"]:
        try:
            (udata / lock).unlink(missing_ok=True)
        except Exception:
            pass

    # Abrir Chrome de scraping (profile isolado, não interfere com Chrome normal)
    modo_txt = "oculto" if MODO_OCULTO else "visível"
    log.info(f"Abrindo Chrome de scraping [{modo_txt}] (porta {CHROME_DEBUG_PORT}, dir {udata.name}/{CHROME_PROFILE})...")
    if MODO_OCULTO:
        log.info("  Chrome rodando em segundo plano (sem janela visível).")
    else:
        log.info("  Se for a primeira vez: instale a extensão Whom neste Chrome.")

    chrome_args = [
        f"--remote-debugging-port={CHROME_DEBUG_PORT}",
        f"--user-data-dir={CHROME_USER_DATA}",
        f"--profile-directory={CHROME_PROFILE}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-session-crashed-bubble",
        "about:blank",
    ]
    if MODO_OCULTO:
        # Posiciona a janela fora da tela — extensões continuam funcionando
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
            requests.get(f"{CDP_BASE}/json/version", timeout=2)
            log.info("Chrome pronto!")
            return True
        except Exception:
            pass

    log.error(f"Chrome não respondeu na porta {CHROME_DEBUG_PORT} após 30 segundos.")
    return False


# ── Detectar extensão Whom ────────────────────────────────────────────────────

def encontrar_whom() -> tuple[str, str]:
    """Varre a pasta de extensões do Chrome e retorna (extension_id, popup_filename).
    Procura primeiro no perfil de scraping (FalawScraper), depois no Chrome normal."""
    possiveis_data_dirs = []

    # 1. Perfil de scraping (prioridade)
    scraping_dir = Path(CHROME_USER_DATA)
    if scraping_dir.exists():
        possiveis_data_dirs.append(scraping_dir)

    # 2. Chrome normal como fallback
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
                            popup = (
                                manifest.get("action", {}).get("default_popup")
                                or manifest.get("browser_action", {}).get("default_popup")
                                or "index.html"
                            )
                            ext_id = ext_id_dir.name
                            log.info(f"Whom encontrado: ID={ext_id} | popup={popup} | perfil={perfil}")
                            return ext_id, popup
                    except Exception:
                        continue

    log.error("Extensão Whom não encontrada. Verifique se está instalada no Chrome.")
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

def autenticar_sistema(browser, ext_id: str, popup: str, sistema: str) -> bool:
    """
    Abre o popup do Whom via CDP /json/new usando ctx.expect_page() para capturar
    corretamente a nova aba sem interferência do Playwright.
    Retorna True se conseguiu clicar em Acessar.
    """
    ext_url = f"chrome-extension://{ext_id}/{popup}"

    _fechar_abas_whom(ext_id)
    time.sleep(0.5)

    # Capturar nova aba usando expect_page (forma correta quando Playwright já está conectado)
    page = None
    for ctx in browser.contexts:
        try:
            with ctx.expect_page(timeout=8000) as page_info:
                requests.put(f"{CDP_BASE}/json/new?{ext_url}", timeout=5)
            page = page_info.value
            break
        except Exception:
            continue

    if not page:
        # Fallback: abrir sem captura de evento e procurar pelo URL
        requests.put(f"{CDP_BASE}/json/new?{ext_url}", timeout=5)
        time.sleep(3)
        for ctx in browser.contexts:
            for pg in ctx.pages:
                if ext_id in pg.url:
                    page = pg
                    break
            if page:
                break

    if not page:
        log.warning(f"[{sistema}] Página do Whom não encontrada após abertura")
        return False

    try:
        page.wait_for_load_state("domcontentloaded", timeout=10000)
        time.sleep(1.5)
    except Exception:
        pass

    try:
        # ── Fechar NPS se aparecer ────────────────────────────────────────────
        try:
            nps = page.locator("button:has-text('Responder depois')")
            nps.wait_for(state="visible", timeout=2500)
            nps.click()
            time.sleep(1)
            log.debug("NPS fechado")
        except PWTimeout:
            pass

        # ── Selecionar certificado ────────────────────────────────────────────
        # Verifica se o campo de sistema já está visível (cert já selecionado)
        si_loc = page.locator("input[placeholder*='sistema' i], input[placeholder*='Digite' i]")
        sistema_visivel = False
        try:
            si_loc.first.wait_for(state="visible", timeout=1500)
            sistema_visivel = True
        except PWTimeout:
            pass

        if not sistema_visivel:
            cert_item = page.locator("[role='menuitem']:not([disabled])").first
            try:
                cert_item.wait_for(state="visible", timeout=5000)
                cert_item.click()
                time.sleep(2)
            except PWTimeout:
                log.warning(f"[{sistema}] Certificado não encontrado no Whom")
                page.close()
                return False

        # ── Campo de sistema ──────────────────────────────────────────────────
        si = page.locator("input[placeholder*='sistema' i], input[placeholder*='Digite' i]").first
        try:
            si.wait_for(state="visible", timeout=5000)
        except PWTimeout:
            log.warning(f"[{sistema}] Campo de sistema não ficou visível")
            page.close()
            return False

        si.click()
        si.fill(sistema)
        time.sleep(1.2)

        # ── Selecionar sistema no dropdown ────────────────────────────────────
        opcao = page.locator(f"[role='menuitem']:has-text('{sistema}')").first
        try:
            opcao.wait_for(state="visible", timeout=3000)
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

        acessar.click()
        log.info(f"[OK] {sistema}")
        time.sleep(3)

        # Fechar aba da extensão
        page.close()

        # Fechar abas do PJe abertas pelo Whom (não queremos poluir o Chrome)
        ctx = browser.contexts[0] if browser.contexts else None
        if ctx:
            for pg in ctx.pages:
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

def autenticar_e_capturar_pje_page(browser, ext_id: str, popup: str, sistema: str):
    """
    Autentica via Whom e retorna a página PJe aberta pelo Whom.
    Ao contrário de autenticar_sistema(), NÃO fecha a aba PJe — o chamador
    deve navegar para a pauta e fechar a aba quando terminar.
    Retorna None se a autenticação falhar.
    """
    ext_url = f"chrome-extension://{ext_id}/{popup}"
    _fechar_abas_whom(ext_id)
    time.sleep(0.5)

    page = None
    for ctx in browser.contexts:
        try:
            with ctx.expect_page(timeout=8000) as page_info:
                requests.put(f"{CDP_BASE}/json/new?{ext_url}", timeout=5)
            page = page_info.value
            break
        except Exception:
            continue

    if not page:
        requests.put(f"{CDP_BASE}/json/new?{ext_url}", timeout=5)
        time.sleep(3)
        for ctx in browser.contexts:
            for pg in ctx.pages:
                if ext_id in pg.url:
                    page = pg
                    break
            if page:
                break

    if not page:
        log.warning(f"[{sistema}] Popup Whom não encontrado")
        return None

    try:
        page.wait_for_load_state("domcontentloaded", timeout=10000)
        time.sleep(1.5)
    except Exception:
        pass

    try:
        # NPS
        try:
            nps = page.locator("button:has-text('Responder depois')")
            nps.wait_for(state="visible", timeout=2500)
            nps.click()
            time.sleep(1)
        except PWTimeout:
            pass

        # Certificado
        si_loc = page.locator("input[placeholder*='sistema' i], input[placeholder*='Digite' i]")
        sistema_visivel = False
        try:
            si_loc.first.wait_for(state="visible", timeout=1500)
            sistema_visivel = True
        except PWTimeout:
            pass

        if not sistema_visivel:
            cert_item = page.locator("[role='menuitem']:not([disabled])").first
            try:
                cert_item.wait_for(state="visible", timeout=5000)
                cert_item.click()
                time.sleep(2)
            except PWTimeout:
                log.warning(f"[{sistema}] Certificado não encontrado")
                page.close()
                return None

        # Campo de sistema
        si = page.locator("input[placeholder*='sistema' i], input[placeholder*='Digite' i]").first
        try:
            si.wait_for(state="visible", timeout=5000)
        except PWTimeout:
            log.warning(f"[{sistema}] Campo sistema não visível")
            page.close()
            return None

        si.click()
        si.fill(sistema)
        time.sleep(1.2)

        opcao = page.locator(f"[role='menuitem']:has-text('{sistema}')").first
        try:
            opcao.wait_for(state="visible", timeout=3000)
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

        pje_page = None
        ctx_popup = page.context
        try:
            with ctx_popup.expect_page(timeout=12000) as pje_info:
                acessar.click()
            pje_page = pje_info.value
            try:
                pje_page.wait_for_load_state("domcontentloaded", timeout=15000)
            except Exception:
                pass
            log.info(f"[OK] {sistema} → {pje_page.url[:80]}")
        except Exception:
            acessar.click()
            time.sleep(4)
            log.info(f"[OK] {sistema}")
            for ctx2 in browser.contexts:
                for pg in ctx2.pages:
                    u = pg.url
                    if (any(k in u for k in ["trt", "tst.jus.br", "pje"])
                            and "chrome-extension" not in u
                            and "about:" not in u):
                        pje_page = pg
                        break
                if pje_page:
                    break

        page.close()
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

    if not garantir_chrome_aberto():
        log.error("Não foi possível abrir o Chrome. Abortando.")
        return

    ext_id, popup_file = encontrar_whom()
    if not ext_id:
        log.error("Não foi possível encontrar a extensão Whom. Abortando.")
        return

    log.info(f"URL do Whom: chrome-extension://{ext_id}/{popup_file}")

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(CDP_BASE)
            log.info(f"Conectado ao Chrome (porta {CHROME_DEBUG_PORT})")
        except Exception as e:
            log.error(f"Não foi possível conectar ao Chrome: {e}")
            return

        ok = []
        nao_encontrado = []

        for sistema in WHOM_TRTS:
            log.info(f"Autenticando: {sistema}")
            sucesso = autenticar_sistema(browser, ext_id, popup_file, sistema)
            if sucesso:
                ok.append(sistema)
            else:
                nao_encontrado.append(sistema)
            # Pequena pausa entre sistemas para não sobrecarregar
            time.sleep(0.5)

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
