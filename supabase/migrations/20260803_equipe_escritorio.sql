-- Equipe interna do escritório (advogados + founder) — usada como lista de
-- pessoas mencionáveis (@nome) no bate-papo de orientações da Pauta de
-- Audiências. Separada da tabela `correspondentes` (advogados/prepostos
-- correspondentes externos), que não deve aparecer nas menções.
CREATE TABLE IF NOT EXISTS equipe_escritorio (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO equipe_escritorio (id, nome)
VALUES ('equipe-tgfa', 'Tatiana (TGFA)')
ON CONFLICT (id) DO NOTHING;
