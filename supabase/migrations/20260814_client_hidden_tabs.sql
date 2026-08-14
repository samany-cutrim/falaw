-- Permite ao admin ocultar abas específicas do dashboard do cliente
-- (Visão Geral, Ex-empregados, Subsidiária, Destaques do Mês, Comparativo)
-- por cliente. Guarda as chaves das abas ocultas (ex.: {"comparativo"}).
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS hidden_tabs TEXT[] NOT NULL DEFAULT '{}';
