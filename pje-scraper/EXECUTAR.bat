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
echo   2. Autenticar os TRTs via Whom
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
curl -s --max-time 2 http://localhost:9222/json/version > nul 2>&1
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
    echo  Caminhos testados:
    echo    C:\Program Files\Google\Chrome\Application\chrome.exe
    echo    C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
    pause
    exit /b 1
)
echo  Chrome encontrado em: %CHROME%

start "" "%CHROME%" --remote-debugging-port=9222 "--user-data-dir=C:\Users\manyc\AppData\Local\Google\Chrome\User Data" "--profile-directory=Profile 9" --no-first-run --no-default-browser-check --disable-session-crashed-bubble --restore-last-session

echo  Aguardando Chrome inicializar (8 segundos)...
timeout /t 8 /nobreak > nul
echo  Chrome pronto!

:autenticar
REM ── Instrucoes para autenticar via Whom ──────────────────────────────────────
echo.
echo [1/2] Autenticar via Whom (necessario fazer manualmente)
echo.
echo  1. Clique no icone do Whom na barra do Chrome (canto superior direito)
echo  2. Selecione o certificado: Tatiana Guimaraes Ferraz Andrade
echo  3. Selecione cada TRT e clique em Acessar
echo  4. Repita para todos os TRTs do escritorio
echo.
echo  Quando terminar de autenticar, pressione qualquer tecla para iniciar a coleta...
pause > nul

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
