@echo off
title Falaw — PJe Scraper
echo.
echo  ============================================================
echo   Falaw Advogados — Servidor de Sincronizacao PJe
echo  ============================================================
echo.

:: Verificar se o .env existe
if not exist "%~dp0.env" (
    echo  ATENCAO: arquivo .env nao encontrado.
    echo  Copie .env.example para .env e preencha os dados.
    echo.
    copy "%~dp0.env.example" "%~dp0.env"
    echo  Arquivo .env criado. Edite-o antes de continuar.
    echo.
    pause
    exit /b 1
)

:: Ativar venv se existir
if exist "%~dp0..\. venv\Scripts\activate.bat" (
    call "%~dp0..\. venv\Scripts\activate.bat"
) else if exist "%~dp0venv\Scripts\activate.bat" (
    call "%~dp0venv\Scripts\activate.bat"
)

:: Instalar dependências se necessário
pip show flask >nul 2>&1
if errorlevel 1 (
    echo  Instalando dependencias...
    pip install -r "%~dp0requirements.txt" -q
    playwright install chromium
)

echo  Iniciando servidor em http://localhost:7777
echo  Deixe esta janela aberta e va para o painel admin.
echo.
python "%~dp0server.py"
pause
