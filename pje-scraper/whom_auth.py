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
from pathlib import Path
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

load_dotenv()

CHROME_DEBUG_PORT = int(os.getenv("CHROME_DEBUG_PORT", "9222"))
CERT_NAME         = os.getenv("WHOM_CERT_NAME", "")          # Ex: "Tatiana Guimaraes Ferraz Andrade"
CHROME_PROFILE    = os.getenv("CHROME_PROFILE", "Default")   # Perfil onde o Whom está instalado

# TRTs que o escritório usa — edite conforme necessário no .env (WHOM_TRTS)
# Formato: "TRTn Pje - 1º grau" e/ou "TRTn Pje - 2º grau"
# Separe por vírgula no .env: WHOM_TRTS=TRT1 Pje - 1º grau,TRT2 Pje - 1º grau,...
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

Path("logs").mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("logs/whom_auth.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)


# ── Detectar extensão Whom ────────────────────────────────────────────────────

def encontrar_whom() -> tuple[str, str]:
    """
    Varre a pasta de extensões do Chrome em busca do Whom.
    Retorna (extension_id, popup_filename) ou ("", "").
    """
    possiveis_data_dirs = []

    # Caminhos padrão do Chrome no Windows
    appdata = Path(os.environ.get("LOCALAPPDATA", ""))
    for canal in ["Google/Chrome", "Google/Chrome Beta", "Google/Chrome Dev", "Chromium"]:
        d = appdata / canal / "User Data"
        if d.exists():
            possiveis_data_dirs.append(d)

    if not possiveis_data_dirs:
        log.error("Diretório do Chrome não encontrado.")
        return "", ""

    # Perfis a verificar
    perfis = ["Default", CHROME_PROFILE] + [f"Profile {i}" for i in range(1, 25)]

    for data_dir in possiveis_data_dirs:
        for perfil in perfis:
            ext_base = data_dir / perfil / "Extensions"
            if not ext_base.exists():
                continue
            for ext_id_dir in ext_base.iterdir():
                if not ext_id_dir.is_dir():
                    continue
                # Cada extensão tem uma subpasta por versão
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


# ── Automação da interface do Whom ────────────────────────────────────────────

def autenticar_sistema(ctx, ext_url: str, cert_name: str, sistema: str) -> bool:
    """
    Abre a página do Whom via window.open() (bypassa ERR_BLOCKED_BY_CLIENT),
    seleciona o certificado e autentica no sistema informado.
    Retorna True se conseguiu clicar em Acessar.
    """
    try:
        # Abre a extensão via window.open() a partir de uma aba neutra
        # Isso bypassa o ERR_BLOCKED_BY_CLIENT que ocorre com page.goto()
        bridge = ctx.new_page()
        bridge.goto("about:blank", timeout=5000)

        with ctx.expect_page(timeout=10000) as popup_info:
            bridge.evaluate(f"window.open('{ext_url}', '_blank', 'width=400,height=600')")

        page = popup_info.value
        page.wait_for_load_state("domcontentloaded", timeout=10000)
        time.sleep(1.5)

        # ── Campo de certificado ──────────────────────────────────────────────
        cert_sels = [
            'input[placeholder*="certificado" i]',
            'input[placeholder*="Busque" i]',
            'input[aria-label*="certificado" i]',
            '.certificate-search input',
            'input:first-of-type',
        ]
        cert_input = None
        for sel in cert_sels:
            c = page.locator(sel).first
            if c.count() > 0 and c.is_visible():
                cert_input = c
                break

        if not cert_input:
            log.warning(f"Campo de certificado não encontrado para {sistema}")
            page.close(); bridge.close()
            return False

        cert_input.click()
        time.sleep(0.3)

        if cert_name:
            cert_input.fill(cert_name)
            time.sleep(0.8)
            sugestao = page.locator(f"li:has-text('{cert_name}'), [role='option']:has-text('{cert_name}'), .option:has-text('{cert_name}')").first
            if sugestao.count() > 0:
                sugestao.click()
                time.sleep(0.5)
            else:
                primeira = page.locator("li[role='option'], .suggestion-item, .list-item").first
                if primeira.count() > 0:
                    primeira.click()
                    time.sleep(0.5)

        # ── Campo de sistema ──────────────────────────────────────────────────
        sistema_sels = [
            'input[placeholder*="sistema" i]',
            'input[placeholder*="Buscar" i]:last-of-type',
            'input[aria-label*="sistema" i]',
            '.system-search input',
            'input:nth-of-type(2)',
        ]
        sistema_input = None
        for sel in sistema_sels:
            c = page.locator(sel).first
            if c.count() > 0 and c.is_visible():
                sistema_input = c
                break

        if not sistema_input:
            log.warning(f"Campo de sistema não encontrado para {sistema}")
            page.close(); bridge.close()
            return False

        sistema_input.click()
        time.sleep(0.3)
        sistema_input.fill(sistema)
        time.sleep(1.2)

        opcao = page.locator(
            f"li:has-text('{sistema}'), [role='option']:has-text('{sistema}'), .option:has-text('{sistema}')"
        ).first
        if opcao.count() > 0:
            opcao.click()
            time.sleep(0.5)
        else:
            trecho = sistema.split()[0]
            opcao_parcial = page.locator(
                f"li:has-text('{sistema}'), [role='option']:has-text('{sistema}')"
            ).first
            if opcao_parcial.count() > 0:
                opcao_parcial.click()
                time.sleep(0.5)
            else:
                log.warning(f"Sistema '{sistema}' não encontrado no Whom")
                page.close(); bridge.close()
                return False

        # ── Botão Acessar ─────────────────────────────────────────────────────
        acessar = page.locator("button:has-text('Acessar'), input[value='Acessar']").first
        if acessar.count() == 0 or not acessar.is_enabled():
            log.warning(f"Botão Acessar não habilitado para {sistema}")
            page.close(); bridge.close()
            return False

        acessar.click()
        log.info(f"Acessar clicado: {sistema}")
        time.sleep(3)

        page.close()
        bridge.close()
        return True

    except PWTimeout:
        log.warning(f"Timeout ao autenticar {sistema}")
        return False
    except Exception as e:
        log.error(f"Erro ao autenticar {sistema}: {e}")
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

    # Detectar Whom
    ext_id, popup_file = encontrar_whom()
    if not ext_id:
        log.error("Não foi possível encontrar a extensão Whom. Abortando.")
        return

    ext_url = f"chrome-extension://{ext_id}/{popup_file}"
    log.info(f"URL do Whom: {ext_url}")

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:{CHROME_DEBUG_PORT}")
            log.info(f"Conectado ao Chrome (porta {CHROME_DEBUG_PORT})")
        except Exception as e:
            log.error(f"Não foi possível conectar ao Chrome: {e}")
            log.error("Abra o Chrome com 1_abrir_chrome.bat antes de executar.")
            return

        ctx = browser.contexts[0] if browser.contexts else browser.new_context()

        ok = []
        nao_encontrado = []
        erro = []

        for sistema in WHOM_TRTS:
            log.info(f"Autenticando: {sistema}")
            sucesso = autenticar_sistema(ctx, ext_url, CERT_NAME, sistema)
            if sucesso:
                ok.append(sistema)
                # Fecha abas extras abertas pelo Acessar (mantém só as do PJe)
                time.sleep(1)
                for pg in ctx.pages:
                    if "chrome-extension" not in pg.url and pg.url not in ("about:blank", ""):
                        try:
                            if any(k in pg.url for k in ["trt", "tst", "pje"]):
                                pg.close()  # fecha aba do PJe aberta pelo Whom
                        except Exception:
                            pass
            else:
                nao_encontrado.append(sistema)

    log.info("\n" + "=" * 60)
    log.info("RESULTADO")
    log.info("=" * 60)
    log.info(f"Autenticados ({len(ok)}): {', '.join(ok) if ok else '—'}")
    if nao_encontrado:
        log.warning(f"Não encontrados ({len(nao_encontrado)}): {', '.join(nao_encontrado)}")
    log.info("=" * 60)
    log.info("Sessões ativas. Execute scraper.py para coletar as audiências.")


if __name__ == "__main__":
    main()
