@echo off
chcp 65001 > nul
title Falaw PJe - Coleta de Audiencias
cd /d "%~dp0"
set PYTHONUTF8=1

echo.
echo ============================================================
echo  FALAW - Coleta de audiencias PJe
echo  %DATE% %TIME:~0,5%
echo ============================================================
echo.
echo  IMPORTANTE — leia antes de continuar:
echo.
echo  O Chrome do Falaw vai abrir automaticamente.
echo  Antes de iniciar a coleta voce deve:
echo.
echo    1. Abrir a extensao Whom no Chrome (icone na barra)
echo    2. Selecionar o certificado digital
echo    3. Autenticar em cada TRT que deseja coletar
echo    4. Voltar aqui e pressionar Enter
echo.
echo ============================================================
echo.

REM ── Ativar venv ──────────────────────────────────────────────────────────────
if exist "..\\.venv\\Scripts\\activate.bat" (
    call "..\\.venv\\Scripts\\activate.bat"
)

set MODO_OCULTO=false
set MODO_INTERATIVO=true

echo Iniciando coleta...
echo.
python scraper.py

echo.
echo ============================================================
echo  Concluido! Verifique logs\scraper.log
echo ============================================================
echo.
pause
