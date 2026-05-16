"""
whom_auth.py — Automatiza o login via Whom para todos os TRTs configurados
Detecta automaticamente o ID da extensão Whom instalada no Chrome.

Uso: python whom_auth.py
Requisito: Chrome aberto com --remote-debugging-port=9222 (1_abrir_chrome.bat)
"""

import json
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

_LOG_DIR = _HERE / "logs"
_LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_LOG_DIR / "whom_auth.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)

CDP_BASE = f"http://127.0.0.1:{CHROME_DEBUG_PORT}"


# ── Detectar extensão Whom ────────────────────────────────────────────────────

def encontrar_whom() -> tuple[str, str]:
    """Varre a pasta de extensões do Chrome e retorna (extension_id, popup_filename)."""
    appdata = Path(os.environ.get("LOCALAPPDATA", ""))
    possiveis_data_dirs = []
    for canal in ["Google/Chrome", "Google/Chrome Beta", "Google/Chrome Dev", "Chromium"]:
        d = appdata / canal / "User Data"
        if d.exists():
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

def main():
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

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(CDP_BASE)
            log.info(f"Conectado ao Chrome (porta {CHROME_DEBUG_PORT})")
        except Exception as e:
            log.error(f"Não foi possível conectar ao Chrome: {e}")
            log.error("Abra o Chrome com 1_abrir_chrome.bat antes de executar.")
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
