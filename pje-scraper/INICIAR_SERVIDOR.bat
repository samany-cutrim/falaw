@echo off
title Falaw - Servidor Local
cd /d "%~dp0"

echo.
echo ============================================================
echo  FALAW - Iniciando servidor local
echo ============================================================
echo.

REM ── Ativar venv ──────────────────────────────────────────────────────────────
if exist "..\\.venv\\Scripts\\activate.bat" (
    call "..\\.venv\\Scripts\\activate.bat"
)

REM ── Verificar se já está rodando ─────────────────────────────────────────────
curl -s http://localhost:7777/status > nul 2>&1
if %errorlevel%==0 (
    echo  Servidor ja esta rodando em http://localhost:7777
    echo  Abrindo painel...
    start "" "http://localhost:7777/admin"
    timeout /t 2 > nul
    exit /b 0
)

REM ── Iniciar servidor em janela minimizada ─────────────────────────────────────
echo  Iniciando servidor...
start /min "Falaw Servidor (nao feche)" cmd /k "..\\.venv\\Scripts\\activate.bat & python server.py"

REM ── Aguardar servidor subir (até 15s) ────────────────────────────────────────
echo  Aguardando servidor iniciar...
set /a TENTATIVAS=0
:AGUARDAR
timeout /t 1 > nul
set /a TENTATIVAS+=1
curl -s http://localhost:7777/status > nul 2>&1
if %errorlevel%==0 goto PRONTO
if %TENTATIVAS% LSS 15 goto AGUARDAR

echo.
echo  AVISO: servidor demorou mais que o esperado.
echo  Verifique a janela "Falaw Servidor" que foi aberta.
goto FIM

:PRONTO
echo  Servidor pronto!

REM ── Abrir painel no navegador ─────────────────────────────────────────────────
echo  Abrindo painel admin...
start "" "http://localhost:7777/admin"

:FIM
echo.
echo  Esta janela pode ser fechada.
echo  O servidor continua rodando na janela minimizada.
echo.
timeout /t 4 > nul
