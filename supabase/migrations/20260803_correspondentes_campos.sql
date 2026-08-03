-- Campos adicionais no cadastro de correspondentes: CPF (preposto), OAB (advogado)
-- e observações gerais, usados também para reforçar a checagem de duplicidade no admin.
ALTER TABLE correspondentes
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS oab TEXT,
  ADD COLUMN IF NOT EXISTS observacoes TEXT;
