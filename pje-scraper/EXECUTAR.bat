@echo off
chcp 65001 > nul
title Falaw PJe - Coleta Completa
cd /d "%~dp0"
set PYTHONUTF8=1

echo.
echo ============================================================
echo  FALAW - Coleta completa do PJe
echo  %DATE% %TIME:~0,5%
echo ============================================================
echo.
echo  Como deseja executar?
echo.
echo    [1] Visivel  - Chrome aparece na tela
echo    [2] Oculto   - Chrome roda em segundo plano (sem janela)
echo.
choice /c 12 /n /m "  Opcao: "

if %errorlevel%==1 (
    set MODO_OCULTO=false
    echo.
    echo  Modo: VISIVEL
) else (
    set MODO_OCULTO=true
    echo.
    echo  Modo: OCULTO ^(Chrome em segundo plano^)
)

echo.
echo  Pressione qualquer tecla para iniciar...
pause > nul

REM ── Ativar venv ──────────────────────────────────────────────────────────────
if exist "..\\.venv\\Scripts\\activate.bat" (
    call "..\\.venv\\Scripts\\activate.bat"
)

echo.
echo Iniciando coleta...
echo.
python scraper.py

echo.
echo ============================================================
echo  Concluido! Verifique logs\scraper.log
echo ============================================================
echo.
pause
