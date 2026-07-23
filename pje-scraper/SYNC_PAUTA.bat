@echo off
:: Dispara a Edge Function projuris-sync no Supabase (sistema oficial de sync)
curl -s -X POST ^
  "https://yleofidqkimeanpuothv.supabase.co/functions/v1/projuris-sync" ^
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZW9maWRxa2ltZWFucHVvdGh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQ3Njc1MiwiZXhwIjoyMDkwMDUyNzUyfQ.j5ORA0kTEogVuzsDHh3YvneWrZMVKqyFRCkUjo7EF1k" ^
  -H "Content-Type: application/json" ^
  >> "%~dp0..\logs\pauta_sync.log" 2>&1
echo Sync disparado: %date% %time% >> "%~dp0..\logs\pauta_sync.log"
