@echo off
title Chrome PJe - Falaw
echo Abrindo Chrome com perfil do escritorio...
echo.
echo IMPORTANTE: Se ja tiver um Chrome aberto, feche-o primeiro.
echo.

REM ── Ajuste o nome do perfil abaixo ──────────────────────────────────────────
REM Para descobrir o seu perfil:
REM   1. Abra o Chrome normalmente
REM   2. Acesse chrome://version
REM   3. Veja o campo "Caminho do perfil" (ex: ...User Data\Profile 1)
REM   4. Substitua "Profile 1" pelo nome da ultima pasta encontrada
set PERFIL=Profile 1

REM ── Caminho do Chrome (ajuste se necessario) ─────────────────────────────────
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

start "" %CHROME% --remote-debugging-port=9222 --profile-directory="%PERFIL%"

echo Chrome iniciado. Aguarde carregar, faca login nos TRTs normalmente com o Whom.
echo Depois execute: 2_coletar_audiencias.bat
echo.
pause
