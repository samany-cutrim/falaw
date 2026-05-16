@echo off
title Falaw — Sync PJe Completo
cd /d "%~dp0"
chcp 65001 > nul

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║     FALAW — Coleta automatica do PJe         ║
echo  ║     %DATE% %TIME:~0,5%                          ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  Este script vai:
echo   1. Abrir o Chrome com depuracao remota
echo   2. Autenticar os TRTs via Whom (automatico)
echo   3. Coletar as audiencias e salvar no Supabase
echo.
echo  Pressione qualquer tecla para iniciar (ou feche para cancelar)...
pause > nul

REM ── Ativar venv ──────────────────────────────────────────────────────────────
if exist "..\\.venv\\Scripts\\activate.bat" (
    call "..\\.venv\\Scripts\\activate.bat"
)

REM ── Verificar se Chrome já está na porta 9222 ───────────────────────────────
echo.
echo [0/3] Verificando Chrome...
curl -s --max-time 2 http://127.0.0.1:9222/json/version > nul 2>&1
if %errorlevel% equ 0 (
    echo  Chrome ja esta rodando na porta 9222. Reutilizando sessao existente.
    goto :autenticar
)

REM Chrome aberto sem porta de depuracao — precisa fechar primeiro
tasklist /FI "IMAGENAME eq chrome.exe" 2>nul | find /I "chrome.exe" > nul
if %errorlevel% equ 0 (
    echo  Fechando Chrome existente (necessario para ativar depuracao remota)...
    taskkill /F /IM chrome.exe > nul 2>&1
    timeout /t 3 /nobreak > nul
)

REM ── Abrir Chrome com remote debugging ────────────────────────────────────────
echo  Abrindo Chrome...
set "CHROME="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME (
    echo  ERRO: Chrome nao encontrado nos caminhos padrao.
    pause
    exit /b 1
)

start "" "%CHROME%" --remote-debugging-port=9222 "--user-data-dir=C:\Users\manyc\AppData\Local\Google\Chrome\User Data" "--profile-directory=Profile 9" --no-first-run --no-default-browser-check --disable-session-crashed-bubble --restore-last-session

echo  Aguardando Chrome inicializar (8 segundos)...
timeout /t 8 /nobreak > nul

REM Confirmar que Chrome subiu na porta correta
curl -s --max-time 5 http://127.0.0.1:9222/json/version > nul 2>&1
if %errorlevel% neq 0 (
    echo  ERRO: Chrome nao respondeu na porta 9222. Verifique se o perfil nao esta em uso.
    pause
    exit /b 1
)
echo  Chrome pronto!

:autenticar
REM ── Autenticar via Whom (automatico) ─────────────────────────────────────────
echo.
echo [1/2] Autenticando TRTs via Whom...
python whom_auth.py
if %errorlevel% neq 0 (
    echo.
    echo  AVISO: whom_auth.py retornou erro. Verifique logs\whom_auth.log
    echo  Voce pode autenticar manualmente clicando no icone do Whom no Chrome.
    echo  Pressione qualquer tecla para continuar com a coleta mesmo assim...
    pause > nul
)

REM ── Coletar audiencias ────────────────────────────────────────────────────────
echo.
echo [2/2] Coletando audiencias do PJe...
python scraper.py

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║  Coleta concluida! Log em logs\scraper.log   ║
echo  ╚══════════════════════════════════════════════╝
echo.
pause
