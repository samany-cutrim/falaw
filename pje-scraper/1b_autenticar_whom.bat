@echo off
title Detectar Whom e Autenticar TRTs - Falaw
cd /d "%~dp0"

echo ============================================================
echo  FALAW - Autenticacao automatica via Whom
echo  Detecta a extensao e autentica nos TRTs configurados
echo ============================================================
echo.
echo Certifique-se de que:
echo  1. O Chrome esta aberto (via 1_abrir_chrome.bat)
echo  2. WHOM_CERT_NAME esta configurado no .env
echo.
echo Pressione qualquer tecla para iniciar...
pause > nul

if exist "..\\.venv\\Scripts\\activate.bat" (
    call "..\\.venv\\Scripts\\activate.bat"
)

python whom_auth.py

echo.
echo ============================================================
echo  Verifique o log em logs\whom_auth.log
echo  Se todas as autenticacoes foram OK, execute 2_coletar_audiencias.bat
echo ============================================================
pause
