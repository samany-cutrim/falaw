@echo off
cd /d "%~dp0"
call "%~dp0..\\.venv\Scripts\activate.bat"
python pauta_audiencia.py --todas >> "%~dp0..\logs\pauta_sync.log" 2>&1
