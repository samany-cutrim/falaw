# ─────────────────────────────────────────────────────────────────────────────
#  Falaw — Servidor local PJe  (porta 7777)
#
#  Inicie com:  INICIAR_SERVIDOR.bat
#  O admin em admin.html chama /sync  →  roda scraper.py como subprocesso
#  e transmite os logs em tempo real via SSE (/stream).
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from threading import Thread, Lock

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from supabase import create_client

load_dotenv(Path(__file__).parent / ".env")

PORT         = int(os.getenv("PORT", "7777"))
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

_SCRIPT = Path(__file__).parent / "scraper.py"

# ── Estado global ─────────────────────────────────────────────────────────────
_lock = Lock()
_job: dict = {
    "running":   False,
    "message":   "Aguardando início",
    "progress":  0,      # número de sistemas processados (para a barra)
    "total":     49,     # 24 TRTs × 2 graus + TST
    "log":       [],
    "erro":      None,
}


def _log(msg: str) -> None:
    ts   = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    _job["log"].append(line)


# ── Job principal ─────────────────────────────────────────────────────────────

def _run_job(modo_oculto: bool) -> None:
    _job.update({
        "running":  True,
        "progress": 0,
        "log":      [],
        "erro":     None,
        "message":  "Iniciando Chrome de scraping…",
    })

    env = os.environ.copy()
    env["MODO_OCULTO"] = "true" if modo_oculto else "false"

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

            # Contar sistemas processados para a barra de progresso
            if re.search(r'\[TRT-\d+/[12]G\]|\[TST\]', line):
                _job["progress"] = min(_job["progress"] + 1, _job["total"])

        proc.wait()
        _job["progress"] = _job["total"]

        if proc.returncode == 0:
            _job["message"] = "✓ Coleta concluída"
        else:
            _job["erro"]    = "Scraper encerrou com código de erro"
            _job["message"] = "Erro na coleta — veja o log abaixo"

    except Exception as exc:
        _log(f"ERRO: {exc}")
        _job["erro"]    = str(exc)
        _job["message"] = f"Erro: {exc}"
    finally:
        _job["running"] = False


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
        "message":  _job["message"],
        "progress": _job["progress"],
        "total":    _job["total"],
        "erro":     _job["erro"],
        "log":      _job["log"][-100:],
    })


@app.post("/sync")
def sync():
    body        = request.get_json(silent=True) or {}
    modo_oculto = bool(body.get("modo_oculto", False))

    with _lock:
        if _job["running"]:
            return jsonify({"ok": False, "message": "Coleta já em andamento"}), 409
        Thread(target=_run_job, args=(modo_oculto,), daemon=True).start()

    return jsonify({"ok": True, "message": "Coleta iniciada"})


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


if __name__ == "__main__":
    print("=" * 55)
    print("  Falaw — Servidor Local PJe")
    print(f"  Rodando em  http://localhost:{PORT}")
    print("  Ctrl+C para encerrar")
    print("=" * 55)
    app.run(host="127.0.0.1", port=PORT, debug=False, threaded=True)
