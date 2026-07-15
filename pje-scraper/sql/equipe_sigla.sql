-- Sigla de identificação do advogado usada pelo escritório (ex: Samany Cutrim → SC).
-- O notificador de WhatsApp usa a sigla para casar a audiência com o advogado
-- quando a pauta traz a sigla em vez do nome completo.
-- Rode este script UMA VEZ no Supabase: Dashboard → SQL Editor → New query.

alter table public.equipe
  add column if not exists sigla text;
