-- Menções (@Nome) dentro do bate-papo de orientações da Pauta de Audiências.
-- Cada linha é uma menção individual, com seu próprio "visto" (lida_at) —
-- marcar uma como lida não afeta as demais.
CREATE TABLE IF NOT EXISTS mencoes (
  id BIGSERIAL PRIMARY KEY,
  audiencia_id TEXT NOT NULL,
  mencionado TEXT NOT NULL,
  autor TEXT,
  texto TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lida_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mencoes_pendentes ON mencoes (lida_at, created_at);
CREATE INDEX IF NOT EXISTS idx_mencoes_audiencia  ON mencoes (audiencia_id);
