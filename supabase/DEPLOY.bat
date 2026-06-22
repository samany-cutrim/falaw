:: Deploy da Edge Function projuris-sync no Supabase
:: Execute este arquivo uma vez para fazer o deploy e configurar os secrets.
:: Pré-requisito: ter o Supabase CLI instalado (https://supabase.com/docs/guides/cli)

@echo off
setlocal

:: ── Configurações ─────────────────────────────────────────────────────────────
set SUPABASE_PROJECT_REF=yleofidqkimeanpuothv
set SUPABASE_ACCESS_TOKEN=sbp_e6c9eea3c0234e458661995320fda97d88f5a50c

:: Secrets da API Projuris — preencha PROJURIS_API_URL antes de rodar
set PROJURIS_API_URL=
set PROJURIS_CLIENT_ID=api_cliente_codigo_122785
set PROJURIS_CLIENT_SECRET=kQFgDRJwUTRoQwoZTckkMOrOvu2BaQE
set DIAS_BUSCA=365

:: ──────────────────────────────────────────────────────────────────────────────

echo [1/3] Vinculando projeto Supabase...
supabase link --project-ref %SUPABASE_PROJECT_REF% --access-token %SUPABASE_ACCESS_TOKEN%

echo [2/3] Configurando secrets...
supabase secrets set PROJURIS_API_URL=%PROJURIS_API_URL% --project-ref %SUPABASE_PROJECT_REF% --access-token %SUPABASE_ACCESS_TOKEN%
supabase secrets set PROJURIS_CLIENT_ID=%PROJURIS_CLIENT_ID% --project-ref %SUPABASE_PROJECT_REF% --access-token %SUPABASE_ACCESS_TOKEN%
supabase secrets set PROJURIS_CLIENT_SECRET=%PROJURIS_CLIENT_SECRET% --project-ref %SUPABASE_PROJECT_REF% --access-token %SUPABASE_ACCESS_TOKEN%
supabase secrets set DIAS_BUSCA=%DIAS_BUSCA% --project-ref %SUPABASE_PROJECT_REF% --access-token %SUPABASE_ACCESS_TOKEN%

echo [3/3] Fazendo deploy da Edge Function...
supabase functions deploy projuris-sync --project-ref %SUPABASE_PROJECT_REF% --access-token %SUPABASE_ACCESS_TOKEN%

echo.
echo === Deploy concluido! ===
echo A funcao roda automaticamente todos os dias as 06:00 BRT.
echo Para testar manualmente, acesse o painel do Supabase:
echo   https://supabase.com/dashboard/project/%SUPABASE_PROJECT_REF%/functions
echo.
pause
