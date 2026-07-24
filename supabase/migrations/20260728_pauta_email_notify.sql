-- Colunas para rastrear notificações de e-mail por audiência
ALTER TABLE pauta_audiencias
  ADD COLUMN IF NOT EXISTS email_agendada_notificado_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_cancelada_notificado_at TIMESTAMPTZ DEFAULT NULL;
