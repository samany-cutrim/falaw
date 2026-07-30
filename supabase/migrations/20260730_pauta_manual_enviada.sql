-- Marca quais audiências já foram comunicadas por um envio manual de pauta
-- (botão "Enviar Pauta" no admin, para cliente ou correspondente), para o
-- e-mail automático de "audiência agendada" (pauta-email-notify) não duplicar
-- o aviso de uma audiência que o destinatário já recebeu por outro canal.
ALTER TABLE pauta_audiencias
  ADD COLUMN IF NOT EXISTS pauta_manual_enviada_at TIMESTAMPTZ DEFAULT NULL;
