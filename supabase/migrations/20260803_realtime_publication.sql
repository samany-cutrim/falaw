-- Habilita o Supabase Realtime (Postgres logical replication) nas tabelas usadas
-- pelas telas "ao vivo" do admin.html e do dashboard do escritório/admin de
-- correspondentes. Sem isso, o front-end se inscreve no canal mas nunca recebe
-- eventos de mudança — as telas continuam precisando de F5 manual.
--
-- Idempotente: cada linha só falha (sem quebrar as demais) se a tabela já
-- estiver na publicação; DO blocks abaixo ignoram esse erro específico.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'pauta_audiencias',
    'mencoes',
    'correspondentes',
    'equipe',
    'clients',
    'ClientReport',
    'newsletter',
    'contato',
    'curriculos',
    'comments',
    'pesquisas'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION WHEN duplicate_object THEN
      -- já estava na publicação — ok, segue pra próxima
      NULL;
    WHEN undefined_table THEN
      -- tabela não existe neste banco — ok, ignora
      NULL;
    END;
  END LOOP;
END $$;
