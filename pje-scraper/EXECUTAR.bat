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

REM ── Fechar Chrome existente na porta 9222 ────────────────────────────────────
echo.
echo [0/3] Verificando Chrome...
netstat -ano | findstr ":9222" > nul 2>&1
if %errorlevel% equ 0 (
    echo  Chrome ja esta rodando na porta 9222. Reutilizando sessao existente.
    goto :autenticar
)

REM ── Abrir Chrome com remote debugging ────────────────────────────────────────
echo  Abrindo Chrome...
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% (
    echo  ERRO: Chrome nao encontrado. Ajuste o caminho no EXECUTAR.bat
    pause
    exit /b 1
)

start "" %CHROME% --remote-debugging-port=9222 --profile-directory="Profile 9"

echo  Aguardando Chrome inicializar...
:aguarda_chrome
timeout /t 2 /nobreak > nul
netstat -ano | findstr ":9222" > nul 2>&1
if %errorlevel% neq 0 goto :aguarda_chrome
echo  Chrome pronto!

:autenticar
REM ── Autenticar via Whom ───────────────────────────────────────────────────────
echo.
echo [1/3] Autenticando TRTs via Whom...
python whom_auth.py
if %errorlevel% neq 0 (
    echo.
    echo  AVISO: Autenticacao Whom com erros. Continuando com sessoes existentes...
)

REM ── Coletar audiencias ────────────────────────────────────────────────────────
echo.
echo [2/3] Coletando audiencias do PJe...
python scraper.py

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║  Coleta concluida! Log em logs\scraper.log   ║
echo  ╚══════════════════════════════════════════════╝
echo.
pause
