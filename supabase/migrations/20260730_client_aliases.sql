-- Lista de razões sociais / nomes de pessoas que pertencem a um mesmo cliente
-- (ex.: Grupo Dória tem várias empresas + pessoas físicas ligadas). Usada para
-- casar audiências desses nomes com o dashboard do cliente, o "Enviar Pauta"
-- e o aviso automático de audiência agendada/cancelada, em vez de depender só
-- da primeira palavra do nome cadastrado (que falha para grupos multi-razão
-- social ou nomes de pessoa física).
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
