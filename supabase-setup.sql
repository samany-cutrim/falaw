-- ══════════════════════════════════════════════════════════════
--  FALAW ADVOGADOS — Supabase Setup
--  Execute no SQL Editor do Supabase: Database → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Newsletter
CREATE TABLE IF NOT EXISTS newsletter (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  date       DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 2. Solicitações de Contato
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

-- 3. Currículos / Candidaturas
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

-- 4. Portal de Clientes
CREATE TABLE IF NOT EXISTS clients (
  id         TEXT PRIMARY KEY,
  name       TEXT,
  company    TEXT NOT NULL,
  email      TEXT NOT NULL,
  code       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reports    JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- ── Row Level Security (RLS) ──────────────────────────────────
-- Habilita RLS em todas as tabelas
ALTER TABLE newsletter ENABLE ROW LEVEL SECURITY;
ALTER TABLE contato    ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients    ENABLE ROW LEVEL SECURITY;

-- Permite acesso total com a anon key
-- (a anon key é mantida em segredo nas configurações do admin)
CREATE POLICY "anon full access" ON newsletter FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON contato    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON curriculos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON clients    FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── Storage Buckets ───────────────────────────────────────────
-- Crie manualmente no Supabase: Storage → New bucket
--   • reports   (público: sim)
--   • curriculos (público: sim)
--
-- Depois execute estas políticas:

-- Permite upload de arquivos anônimos (admin usa anon key)
-- Substitua 'reports' e 'curriculos' pelo nome exato dos buckets criados.

-- INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', true) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('curriculos', 'curriculos', true) ON CONFLICT DO NOTHING;

-- CREATE POLICY "anon upload reports" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'reports');
-- CREATE POLICY "anon read reports"   ON storage.objects FOR SELECT TO anon USING (bucket_id = 'reports');
-- CREATE POLICY "anon delete reports" ON storage.objects FOR DELETE TO anon USING (bucket_id = 'reports');

-- CREATE POLICY "anon upload curriculos" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'curriculos');
-- CREATE POLICY "anon read curriculos"   ON storage.objects FOR SELECT TO anon USING (bucket_id = 'curriculos');
-- CREATE POLICY "anon delete curriculos" ON storage.objects FOR DELETE TO anon USING (bucket_id = 'curriculos');
