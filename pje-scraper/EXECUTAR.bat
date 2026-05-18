@echo off
chcp 65001 > nul
title Falaw PJe - Coleta de Audiencias
cd /d "%~dp0"
set PYTHONUTF8=1

echo.
echo ============================================================
echo   FALAW - Coleta Automatica de Audiencias PJe
echo   %DATE%  %TIME:~0,5%
echo ============================================================
echo.
echo   O sistema vai abrir o Chrome automaticamente,
echo   entrar em cada TRT via Whom e salvar as audiencias.
echo.
echo   ATENCAO: Se o Chrome estiver aberto SEM a porta de
echo   debug (9222), ele sera reiniciado automaticamente.
echo   Salve o que estiver fazendo antes de continuar.
echo.
echo   [1] Executar  (Chrome aparece na tela)
echo   [2] Executar  (Chrome roda em segundo plano)
echo   [3] Cancelar
echo.
choice /c 123 /n /m "  Escolha: "

if %errorlevel%==3 (
    echo.
    echo   Operacao cancelada.
    timeout /t 2 > nul
    exit /b 0
)
if %errorlevel%==2 (
    set MODO_OCULTO=true
    echo.
    echo   Modo: Chrome em segundo plano
) else (
    set MODO_OCULTO=false
    echo.
    echo   Modo: Chrome visivel
)

echo.
echo   Iniciando em 3 segundos...
timeout /t 3 > nul
echo.

REM Ativar ambiente virtual Python
if exist "..\\.venv\\Scripts\\activate.bat" (
    call "..\\.venv\\Scripts\\activate.bat"
) else if exist ".venv\\Scripts\\activate.bat" (
    call ".venv\\Scripts\\activate.bat"
)

python scraper.py

echo.
echo ============================================================
echo   Concluido!
echo   Resultados em: logs\scraper.log
echo ============================================================
echo.
pause
