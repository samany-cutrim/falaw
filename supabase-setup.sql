-- FALAW ADVOGADOS - Supabase Setup
-- Execute no SQL Editor do Supabase: Database > SQL Editor

-- 1. Newsletter
CREATE TABLE IF NOT EXISTS newsletter (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  date       DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 2. Solicitacoes de Contato
CREATE TABLE IF NOT EXISTS contato (
  id         TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  empresa    TEXT,
  email      TEXT NOT NULL,
  telefone   TEXT,
  mensagem   TEXT,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  read       BOOLEAN NOT NULL DEFAULT FALSE
);

-- 3. Curriculos / Candidaturas
CREATE TABLE IF NOT EXISTS curriculos (
  id           TEXT PRIMARY KEY,
  nome         TEXT NOT NULL,
  email        TEXT NOT NULL,
  telefone     TEXT,
  linkedin     TEXT,
  apresentacao TEXT,
  cv_file_name TEXT,
  cv_url       TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source       TEXT NOT NULL DEFAULT 'site'
);

-- 4. Artigos do Blog
CREATE TABLE IF NOT EXISTS articles (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL DEFAULT '',
  category  TEXT NOT NULL DEFAULT '',
  excerpt   TEXT NOT NULL DEFAULT '',
  date      TEXT NOT NULL DEFAULT '',
  readtime  TEXT NOT NULL DEFAULT '',
  url       TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT TRUE,
  content   TEXT NOT NULL DEFAULT '',
  photo     TEXT NOT NULL DEFAULT ''
);

-- 5. Portal de Clientes
CREATE TABLE IF NOT EXISTS clients (
  id         TEXT PRIMARY KEY,
  name       TEXT,
  company    TEXT NOT NULL,
  email      TEXT NOT NULL,
  code       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reports    JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Row Level Security (RLS)
ALTER TABLE newsletter ENABLE ROW LEVEL SECURITY;
ALTER TABLE contato    ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients    ENABLE ROW LEVEL SECURITY;

-- Permite acesso total com a anon key
DROP POLICY IF EXISTS "anon full access" ON newsletter;
DROP POLICY IF EXISTS "anon full access" ON contato;
DROP POLICY IF EXISTS "anon full access" ON curriculos;
DROP POLICY IF EXISTS "anon full access" ON articles;
DROP POLICY IF EXISTS "anon full access" ON clients;

CREATE POLICY "anon full access" ON newsletter FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON contato    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON curriculos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON articles   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON clients    FOR ALL TO anon USING (true) WITH CHECK (true);

-- Storage Buckets
-- Crie manualmente no Supabase: Storage > New bucket
--   reports   (publico: sim)
--   curriculos (publico: sim)
--
-- Depois execute os comandos abaixo (descomente removendo os "--" no inicio):

-- INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', true) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('curriculos', 'curriculos', true) ON CONFLICT DO NOTHING;

-- CREATE POLICY "anon upload reports" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'reports');
-- CREATE POLICY "anon read reports"   ON storage.objects FOR SELECT TO anon USING (bucket_id = 'reports');
-- CREATE POLICY "anon delete reports" ON storage.objects FOR DELETE TO anon USING (bucket_id = 'reports');

-- CREATE POLICY "anon upload curriculos" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'curriculos');
-- CREATE POLICY "anon read curriculos"   ON storage.objects FOR SELECT TO anon USING (bucket_id = 'curriculos');
-- CREATE POLICY "anon delete curriculos" ON storage.objects FOR DELETE TO anon USING (bucket_id = 'curriculos');
