# ─────────────────────────────────────────────────────────────────────────────
#  PJe Scraper — Servidor local para sincronização automática da Pauta
#  Falaw Advogados
#
#  Como usar:
#    1. Instale as dependências:  pip install -r requirements.txt
#    2. Instale o Playwright:     playwright install chromium
#    3. Configure o arquivo .env (copie .env.example)
#    4. Execute:                  python server.py
#    5. Mantenha rodando e clique "Sincronizar PJe" no painel admin
#
#  O servidor escuta em http://localhost:7777
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import json
import os
import re
import time
import uuid
import traceback
from datetime import datetime, date
from threading import Thread, Lock
from typing import Generator

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

load_dotenv()

# ─── Configuração ─────────────────────────────────────────────────────────────
SUPABASE_URL  = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY", "")   # anon key
CERT_PATH     = os.getenv("CERT_PATH", "")      # caminho do .pfx (opcional)
CERT_PASSWORD = os.getenv("CERT_PASSWORD", "")  # senha do certificado (opcional)
PORT          = int(os.getenv("PORT", "7777"))
ADVOGADO_NOME = os.getenv("ADVOGADO_NOME", "TATIANA")  # nome no Whom

# TRTs a serem varridos (adicione/remova conforme necessidade)
TRT_URLS = [
    {"nome": "TRT1 - Rio de Janeiro",   "url": "https://pje.trt1.jus.br/primeirograu/login.seam"},
    {"nome": "TRT2 - São Paulo",        "url": "https://pje.trt2.jus.br/primeirograu/login.seam"},
    {"nome": "TRT3 - Minas Gerais",     "url": "https://pje.trt3.jus.br/pje/login.seam"},
    {"nome": "TRT4 - Rio Grande do Sul","url": "https://pje.trt4.jus.br/primeirograu/login.seam"},
    {"nome": "TRT5 - Bahia",            "url": "https://pje.trt5.jus.br/pje/login.seam"},
    {"nome": "TRT6 - Pernambuco",       "url": "https://pje.trt6.jus.br/primeirograu/login.seam"},
    {"nome": "TRT7 - Ceará",            "url": "https://pje.trt7.jus.br/primeirograu/login.seam"},
    {"nome": "TRT9 - Paraná",           "url": "https://pje.trt9.jus.br/primeirograu/login.seam"},
    {"nome": "TRT15 - Campinas",        "url": "https://pje.trt15.jus.br/primeirograu/login.seam"},
    {"nome": "TRT17 - Espírito Santo",  "url": "https://pje.trt17.jus.br/primeirograu/login.seam"},
]

# ─── Estado global do job de sincronização ────────────────────────────────────
_job_lock   = Lock()
_job_status = {
    "running":   False,
    "progress":  0,
    "total":     len(TRT_URLS),
    "message":   "Aguardando início",
    "log":       [],
    "resultado": [],
    "erro":      None,
}


def _log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    _job_status["log"].append(line)


# ─── Helpers Supabase ──────────────────────────────────────────────────────────
def _sb_upsert(rows: list[dict]) -> tuple[int, str]:
    """Envia linhas para a tabela pauta_audiencias via REST."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return 0, "SUPABASE_URL / SUPABASE_KEY não configurados no .env"
    try:
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        resp = sb.table("pauta_audiencias").upsert(rows, on_conflict="id").execute()
        return len(rows), ""
    except Exception as exc:
        return 0, str(exc)


# ─── Parsing do tipo de audiência ─────────────────────────────────────────────
def _parse_tipo(tipo_raw: str) -> tuple[str, str]:
    """Recebe 'INSTRUÇÃO - VIRTUAL' → ('INSTRUÇÃO', 'VIRTUAL')"""
    tipo_raw = (tipo_raw or "").strip().upper()
    modalidade = ""
    for m in ("VIRTUAL", "PRESENCIAL", "HÍBRIDA", "HIBRIDA"):
        if m in tipo_raw:
            modalidade = "HÍBRIDA" if m == "HIBRIDA" else m
            break
    tipo_aud = ""
    for t in ("INSTRUÇÃO", "INSTRUCAO", "INICIAL", "CONCILIAÇÃO", "CONCILIACAO", "UNA"):
        if t in tipo_raw:
            tipo_aud = t.replace("INSTRUCAO", "INSTRUÇÃO").replace("CONCILIACAO", "CONCILIAÇÃO")
            break
    return tipo_aud, modalidade


def _make_id(processo: str, data: str, horario: str) -> str:
    raw = f"{processo}-{data}-{horario}"
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, raw))


# ─── Scraping via Playwright ───────────────────────────────────────────────────
def _scrape_pje(trt: dict, page) -> list[dict]:
    """
    Acessa um TRT, faz login por certificado digital (Whom),
    navega para Minha Pauta e extrai as audiências.
    Retorna lista de dicts com os dados.
    """
    nome  = trt["nome"]
    url   = trt["url"]
    items = []

    try:
        _log(f"→ {nome}: abrindo login...")
        page.goto(url, timeout=30_000)
        page.wait_for_load_state("domcontentloaded", timeout=15_000)

        # ── Tentar login por certificado digital ──────────────────────────────
        # PJe mostra um botão "Certificado Digital" ou similar
        cert_selectors = [
            "a[title*='Certificado']",
            "a:has-text('Certificado Digital')",
            "button:has-text('Certificado')",
            "#loginCertificado",
            ".login-cert",
        ]
        for sel in cert_selectors:
            try:
                btn = page.locator(sel).first
                if btn.is_visible(timeout=3_000):
                    btn.click()
                    _log(f"   {nome}: clicou em 'Certificado Digital'")
                    page.wait_for_load_state("networkidle", timeout=20_000)
                    break
            except Exception:
                continue

        # Aguarda o Whom (pop-up nativo do OS) ou redirecionamento
        time.sleep(3)
        page.wait_for_load_state("domcontentloaded", timeout=20_000)

        # ── Navegar para Minha Pauta ──────────────────────────────────────────
        pauta_selectors = [
            "a:has-text('Minha Pauta')",
            "a:has-text('minha pauta')",
            "a[href*='minha-pauta']",
            "a[href*='minhapauta']",
            "a[href*='pauta']",
            "li:has-text('Pauta') a",
        ]
        found_pauta = False
        for sel in pauta_selectors:
            try:
                el = page.locator(sel).first
                if el.is_visible(timeout=4_000):
                    el.click()
                    page.wait_for_load_state("domcontentloaded", timeout=20_000)
                    _log(f"   {nome}: acessou Minha Pauta")
                    found_pauta = True
                    break
            except Exception:
                continue

        if not found_pauta:
            # Tenta URL direta
            base = url.split("/login.seam")[0]
            page.goto(base + "/pje/painel.seam", timeout=20_000)
            time.sleep(2)

        # ── Extrair dados da pauta ────────────────────────────────────────────
        # Aguarda tabela de audiências
        time.sleep(3)
        rows_data = page.evaluate("""() => {
            const rows = [];
            // Tenta localizar tabela com dados de audiência
            const tables = document.querySelectorAll('table');
            for (const tbl of tables) {
                const headers = Array.from(tbl.querySelectorAll('th')).map(h => h.innerText.trim().toLowerCase());
                const hasProcesso = headers.some(h => h.includes('processo') || h.includes('número'));
                if (!hasProcesso) continue;
                const trs = tbl.querySelectorAll('tbody tr');
                for (const tr of trs) {
                    const cells = Array.from(tr.querySelectorAll('td')).map(c => c.innerText.trim());
                    if (cells.length >= 3) rows.push({ headers, cells });
                }
                if (rows.length > 0) break;
            }
            return rows;
        }""")

        hoje = date.today()
        for row in rows_data:
            cells = row.get("cells", [])
            if not cells:
                continue
            # Mapeamento genérico: tenta encontrar os campos por posição/header
            headers = row.get("headers", [])
            def _get(keywords):
                for kw in keywords:
                    for i, h in enumerate(headers):
                        if kw in h and i < len(cells):
                            return cells[i]
                return cells[0] if cells else ""

            data_raw    = _get(["data", "dia"])
            horario_raw = _get(["hora", "horário"])
            processo    = _get(["processo", "número", "numero"])
            tipo_raw    = _get(["tipo", "audiência", "audiencia"])
            vara_raw    = _get(["vara", "órgão", "orgao", "juízo"])
            reclamante  = _get(["reclamante", "parte"])
            reclamada   = _get(["reclamada", "ré", "re"])

            # Filtrar apenas hoje e futuras
            try:
                d = datetime.strptime(re.sub(r'\s+', ' ', data_raw).strip(), "%d/%m/%Y").date()
                if d < hoje:
                    continue
                data_iso = d.isoformat()
            except Exception:
                data_iso = data_raw

            tipo_aud, modalidade = _parse_tipo(tipo_raw)
            row_id = _make_id(processo, data_iso, horario_raw)
            items.append({
                "id":                    row_id,
                "data_audiencia":        data_iso,
                "horario":               horario_raw,
                "tipo_audiencia":        tipo_aud,
                "modalidade":            modalidade,
                "processo":              processo,
                "vara":                  vara_raw,
                "reclamante":            reclamante,
                "reclamada":             reclamada,
                "origem":                "pje",
                "status":                "agendada",
            })
        _log(f"   {nome}: {len(items)} audiências encontradas")

    except Exception as exc:
        _log(f"   {nome}: ERRO — {exc}")

    return items


# ─── Job principal de sincronização ───────────────────────────────────────────
def _run_sync_job() -> None:
    from playwright.sync_api import sync_playwright

    _job_status.update({
        "running":   True,
        "progress":  0,
        "log":       [],
        "resultado": [],
        "erro":      None,
        "message":   "Iniciando navegador...",
    })

    all_rows = []
    try:
        with sync_playwright() as pw:
            # Abre Chrome visível (para que o Whom possa ser acionado)
            launch_args = {
                "headless": False,
                "args": [
                    "--no-sandbox",
                    "--disable-web-security",
                    "--allow-running-insecure-content",
                ],
            }
            # Certificado P12/PFX (se configurado)
            context_kwargs = {}
            if CERT_PATH and os.path.exists(CERT_PATH):
                context_kwargs["client_certificates"] = [{
                    "origin": "*.jus.br",
                    "pfxPath": CERT_PATH,
                    "password": CERT_PASSWORD,
                }]

            browser = pw.chromium.launch(**launch_args)
            context = browser.new_context(**context_kwargs)
            page    = context.new_page()

            for i, trt in enumerate(TRT_URLS):
                _job_status["message"] = f"Acessando {trt['nome']}..."
                rows = _scrape_pje(trt, page)
                all_rows.extend(rows)
                _job_status["progress"] = i + 1

            browser.close()

        _log(f"Total extraído: {len(all_rows)} audiências")
        _job_status["message"] = f"Salvando {len(all_rows)} audiências no Supabase..."

        if all_rows:
            n, err = _sb_upsert(all_rows)
            if err:
                _log(f"Erro ao salvar: {err}")
                _job_status["erro"] = err
            else:
                _log(f"Salvas com sucesso: {n} audiências")

        _job_status["resultado"] = all_rows
        _job_status["message"]   = f"✓ Concluído — {len(all_rows)} audiências importadas do PJe"

    except Exception as exc:
        _log(f"ERRO GERAL: {exc}")
        _log(traceback.format_exc())
        _job_status["erro"]    = str(exc)
        _job_status["message"] = f"Erro: {exc}"
    finally:
        _job_status["running"] = False


# ─── Flask App ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, origins=["*"])   # permite chamadas do admin.html (localhost ou file://)


@app.get("/status")
def status():
    return jsonify({
        "ok":       True,
        "running":  _job_status["running"],
        "message":  _job_status["message"],
        "progress": _job_status["progress"],
        "total":    _job_status["total"],
        "erro":     _job_status["erro"],
        "log":      _job_status["log"][-50:],  # últimas 50 linhas
        "count":    len(_job_status["resultado"]),
    })


@app.post("/sync")
def sync():
    with _job_lock:
        if _job_status["running"]:
            return jsonify({"ok": False, "message": "Sincronização já em andamento"}), 409
        Thread(target=_run_sync_job, daemon=True).start()
    return jsonify({"ok": True, "message": "Sincronização iniciada"})


@app.get("/stream")
def stream() -> Response:
    """Server-Sent Events para acompanhar o progresso em tempo real."""
    def _generate() -> Generator[str, None, None]:
        last_log_len = 0
        while True:
            st = _job_status
            data = {
                "running":  st["running"],
                "message":  st["message"],
                "progress": st["progress"],
                "total":    st["total"],
                "erro":     st["erro"],
                "newLines": st["log"][last_log_len:],
            }
            last_log_len = len(st["log"])
            yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
            if not st["running"] and last_log_len >= len(st["log"]):
                break
            time.sleep(1)
    return Response(_generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/import-excel")
def import_excel():
    """
    Recebe JSON com array de audiências (já parseadas pelo admin.html via xlsx.js)
    e salva no Supabase.
    """
    body = request.get_json(force=True)
    rows = body.get("rows", [])
    if not rows:
        return jsonify({"ok": False, "message": "Nenhuma linha recebida"}), 400
    n, err = _sb_upsert(rows)
    if err:
        return jsonify({"ok": False, "message": err}), 500
    return jsonify({"ok": True, "message": f"{n} audiências importadas", "count": n})


if __name__ == "__main__":
    print("=" * 60)
    print("  Falaw — PJe Scraper Server")
    print(f"  Rodando em http://localhost:{PORT}")
    print("  Mantenha esta janela aberta.")
    print("  Para encerrar: Ctrl+C")
    print("=" * 60)
    if not SUPABASE_URL:
        print("  ⚠  SUPABASE_URL não configurado no .env")
    if not CERT_PATH:
        print("  ℹ  CERT_PATH não configurado — login manual no navegador")
    print()
    app.run(host="127.0.0.1", port=PORT, debug=False, threaded=True)
