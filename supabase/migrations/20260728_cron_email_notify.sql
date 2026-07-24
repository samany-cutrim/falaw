-- Agenda pauta-email-notify 5 min após o projuris-sync (08h05 e 16h05 BRT = 11h05 e 19h05 UTC)
-- Para ativar, execute este bloco no SQL Editor do Supabase:

SELECT cron.schedule(
  'pauta-email-notify-2x-dia',
  '5 11,19 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://yleofidqkimeanpuothv.supabase.co/functions/v1/pauta-email-notify',
      headers := '{"Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZW9maWRxa2ltZWFucHVvdGh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQ3Njc1MiwiZXhwIjoyMDkwMDUyNzUyfQ.j5ORA0kTEogVuzsDHh3YvneWrZMVKqyFRCkUjo7EF1k","Content-Type":"application/json"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);
