@echo off
title Coletando Audiencias PJe - Falaw
cd /d "%~dp0"

echo ============================================================
echo  FALAW - Coletando audiencias do PJe
echo  %date% %time%
echo ============================================================
echo.
echo Certifique-se de que o Chrome esta aberto e voce esta
echo logado nos TRTs desejados. Pressione qualquer tecla para iniciar.
echo.
pause

REM Ativa o venv se existir
if exist "..\\.venv\\Scripts\\activate.bat" (
    call "..\\.venv\\Scripts\\activate.bat"
)

echo [1/2] Autenticando TRTs via Whom...
python whom_auth.py
if %errorlevel% neq 0 (
    echo AVISO: whom_auth.py retornou erro. Continuando com sessoes existentes...
)

echo.
echo [2/2] Coletando audiencias do PJe...
python scraper.py

echo.
echo ============================================================
echo  Coleta finalizada. Verifique o log em logs\scraper.log
echo ============================================================
pause
