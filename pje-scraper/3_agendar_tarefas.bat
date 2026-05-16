@echo off
title Agendar Coleta Automatica - Falaw
echo ============================================================
echo  FALAW - Agendamento automatico de coleta PJe
echo  Criara 2 tarefas: 08:00 e 18:00, dias uteis (seg-sex)
echo ============================================================
echo.
echo Requer permissao de Administrador.
echo.

REM Caminho absoluto do scraper e python
set SCRAPER_DIR=%~dp0
set VENV_PYTHON=%SCRAPER_DIR%..\\.venv\\Scripts\\python.exe
if not exist "%VENV_PYTHON%" set VENV_PYTHON=python

REM Tarefa da manha (08:00)
schtasks /create ^
  /tn "Falaw - Coleta PJe Manha" ^
  /tr "\"%VENV_PYTHON%\" \"%SCRAPER_DIR%scraper.py\"" ^
  /sc WEEKLY ^
  /d MON,TUE,WED,THU,FRI ^
  /st 08:00 ^
  /sd 01/01/2026 ^
  /f ^
  /rl HIGHEST

if %errorlevel%==0 (
    echo [OK] Tarefa da manha criada: seg-sex as 08:00
) else (
    echo [ERRO] Falha ao criar tarefa da manha. Execute como Administrador.
)

REM Tarefa do fim do dia (18:00)
schtasks /create ^
  /tn "Falaw - Coleta PJe Tarde" ^
  /tr "\"%VENV_PYTHON%\" \"%SCRAPER_DIR%scraper.py\"" ^
  /sc WEEKLY ^
  /d MON,TUE,WED,THU,FRI ^
  /st 18:00 ^
  /sd 01/01/2026 ^
  /f ^
  /rl HIGHEST

if %errorlevel%==0 (
    echo [OK] Tarefa da tarde criada: seg-sex as 18:00
) else (
    echo [ERRO] Falha ao criar tarefa da tarde. Execute como Administrador.
)

echo.
echo Para ver as tarefas: Gerenciador de Tarefas ^> guia Agendador de Tarefas
echo Para remover: schtasks /delete /tn "Falaw - Coleta PJe Manha" /f
echo               schtasks /delete /tn "Falaw - Coleta PJe Tarde" /f
echo.
echo ATENCAO: O Chrome deve estar aberto com o perfil do escritorio
echo          e logado nos TRTs antes do horario agendado.
echo.
pause
