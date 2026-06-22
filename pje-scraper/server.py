# ─────────────────────────────────────────────────────────────────────────────
#  Falaw — Servidor local (porta 7777)
#
#  Inicie com:  INICIAR_SERVIDOR.bat
#  O admin em admin.html chama /sync  →  roda projuris_sync.py como subprocesso
#  e transmite os logs em tempo real via SSE (/stream).
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from threading import Thread, Lock

import urllib.request
import urllib.parse

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from supabase import create_client

load_dotenv(Path(__file__).parent / ".env")

PORT         = int(os.getenv("PORT", "7777"))
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

_SCRIPT = Path(__file__).parent / "projuris_sync.py"

# ── Estado global ─────────────────────────────────────────────────────────────
_lock = Lock()
_job: dict = {
    "running":   False,
    "message":   "Aguardando início",
    "progress":  0,
    "total":     1,      # sincronização única via API Projuris
    "log":       [],
    "erro":      None,
    "state":     "idle",   # idle | running | done
}


def _log(msg: str) -> None:
    ts   = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    _job["log"].append(line)


# ── Job principal ─────────────────────────────────────────────────────────────

def _run_job() -> None:
    _job.update({
        "running":  True,
        "progress": 0,
        "log":      [],
        "erro":     None,
        "state":    "running",
        "message":  "Iniciando sincronização Projuris…",
    })

    env = os.environ.copy()

    try:
        proc = subprocess.Popen(
            [sys.executable, str(_SCRIPT)],
            env=env,
            cwd=str(_SCRIPT.parent),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )

        for raw in proc.stdout:
            line = raw.rstrip()
            if not line:
                continue
            _log(line)

            # Atualizar mensagem de progresso com texto limpo
            for marker in ("[INFO]", "[WARNING]", "[ERROR]"):
                if marker in line:
                    clean = line.split(marker, 1)[-1].strip()
                    if clean and not re.match(r'^[=─\-]+$', clean):
                        _job["message"] = clean
                    break

        proc.wait()
        _job["progress"] = _job["total"]

        _job["progress"] = 1
        if proc.returncode == 0:
            _job["message"] = "Sincronização Projuris concluída"
        else:
            _job["erro"]    = "Sincronização encerrou com código de erro"
            _job["message"] = "Erro na sincronização — veja o log abaixo"

    except Exception as exc:
        _log(f"ERRO: {exc}")
        _job["erro"]    = str(exc)
        _job["message"] = f"Erro: {exc}"
    finally:
        _job["running"] = False
        _job["state"]   = "idle"


# ── Flask ─────────────────────────────────────────────────────────────────────
_ADMIN_HTML = (Path(__file__).parent.parent
               / "html" / "Falaw" / "falaw.com.br" / "admin.html")

app = Flask(__name__)
CORS(app, origins=["*"])


@app.get("/admin")
def admin():
    """Serve o painel admin diretamente pelo servidor."""
    if _ADMIN_HTML.exists():
        return _ADMIN_HTML.read_text(encoding="utf-8"), 200, {"Content-Type": "text/html; charset=utf-8"}
    return "admin.html não encontrado", 404


@app.get("/status")
def status():
    return jsonify({
        "ok":       True,
        "running":  _job["running"],
        "state":    _job["state"],
        "message":  _job["message"],
        "progress": _job["progress"],
        "total":    _job["total"],
        "erro":     _job["erro"],
        "log":      _job["log"][-100:],
    })


@app.post("/sync")
def sync():
    with _lock:
        if _job["running"]:
            return jsonify({"ok": False, "message": "Sincronização já em andamento"}), 409
        Thread(target=_run_job, daemon=True).start()

    return jsonify({"ok": True, "message": "Sincronização Projuris iniciada"})


@app.get("/stream")
def stream() -> Response:
    """SSE — transmite logs e progresso em tempo real para o admin."""
    def _generate():
        last_len = 0
        while True:
            data = {
                "running":  _job["running"],
                "message":  _job["message"],
                "progress": _job["progress"],
                "total":    _job["total"],
                "erro":     _job["erro"],
                "newLines": _job["log"][last_len:],
            }
            last_len = len(_job["log"])
            data["state"] = _job["state"]
            yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
            if not _job["running"]:
                break
            time.sleep(1)

    return Response(
        _generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/import-excel")
def import_excel():
    body = request.get_json(force=True)
    rows = body.get("rows", [])
    if not rows:
        return jsonify({"ok": False, "message": "Nenhuma linha recebida"}), 400
    try:
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        sb.table("pauta_audiencias").upsert(rows, on_conflict="id").execute()
        return jsonify({"ok": True, "message": f"{len(rows)} audiências importadas", "count": len(rows)})
    except Exception as exc:
        return jsonify({"ok": False, "message": str(exc)}), 500


# ── Busca de notícias jurídicas trabalhistas ──────────────────────────────────

_QUERIES = [
    "direito trabalhista Brasil",
    "TST decisão trabalhista",
    "INSS benefício previdenciário",
    "reforma trabalhista",
    "FGTS eSocial",
    "NR-1 segurança trabalho",
    "CLT jurisprudência",
    "iFood aplicativo trabalhador",
]

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

def _fetch_google_news_rss(query: str) -> list[dict]:
    """Busca notícias pelo Google News RSS (sem API key)."""
    q = urllib.parse.quote(query)
    url = f"https://news.google.com/rss/search?q={q}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
    try:
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=8) as resp:
            xml = resp.read()
        root = ET.fromstring(xml)
        items = []
        for item in root.findall(".//item")[:4]:
            title   = (item.findtext("title")   or "").strip()
            link    = (item.findtext("link")     or "").strip()
            pubdate = (item.findtext("pubDate")  or "").strip()
            source_el = item.find("{http://purl.org/rss/1.0/modules/content/}encoded")
            source  = ""
            # Tenta extrair nome da fonte do título (formato: "Título - Fonte")
            if " - " in title:
                parts  = title.rsplit(" - ", 1)
                title  = parts[0].strip()
                source = parts[1].strip()
            if title and link:
                items.append({"titulo": title, "url": link, "fonte": source, "data": pubdate[:16]})
        return items
    except Exception:
        return []


@app.get("/noticias-juridicas")
def noticias_juridicas():
    """Retorna notícias jurídicas trabalhistas recentes do Google News RSS."""
    resultados: list[dict] = []
    vistas: set = set()

    for query in _QUERIES:
        for item in _fetch_google_news_rss(query):
            key = item["url"]
            if key not in vistas:
                vistas.add(key)
                resultados.append(item)
        if len(resultados) >= 24:
            break

    return jsonify({"ok": True, "noticias": resultados[:24]})


if __name__ == "__main__":
    print("=" * 55)
    print("  Falaw — Servidor Local PJe")
    print(f"  Rodando em  http://localhost:{PORT}")
    print("  Ctrl+C para encerrar")
    print("=" * 55)
    app.run(host="127.0.0.1", port=PORT, debug=False, threaded=True)
