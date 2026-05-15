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
  id           TEXT PRIMARY KEY,
  name         TEXT,
  company      TEXT NOT NULL,
  email        TEXT NOT NULL,
  notify_email TEXT,
  comparativo_enabled BOOLEAN NOT NULL DEFAULT false,
  code         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reports      JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Migração: adiciona notify_email se a tabela já existia sem a coluna
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notify_email TEXT;
-- Migração: adiciona comparativo_enabled
ALTER TABLE clients ADD COLUMN IF NOT EXISTS comparativo_enabled BOOLEAN NOT NULL DEFAULT false;

-- 6. Configuracoes de Admin (senha compartilhada entre navegadores)
CREATE TABLE IF NOT EXISTS admin_settings (
  id            TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE newsletter ENABLE ROW LEVEL SECURITY;
ALTER TABLE contato    ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- 7. Comentários de artigos
CREATE TABLE IF NOT EXISTS comments (
  id         BIGSERIAL PRIMARY KEY,
  article_id TEXT NOT NULL,
  nome       TEXT NOT NULL,
  email      TEXT NOT NULL,
  mensagem   TEXT NOT NULL,
  approved   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
-- Anon pode inserir (postar comentário) e ler apenas aprovados
DROP POLICY IF EXISTS "anon insert comments" ON comments;
DROP POLICY IF EXISTS "anon read comments"   ON comments;
CREATE POLICY "anon insert comments" ON comments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon read comments"   ON comments FOR SELECT TO anon USING (approved = true);

-- Permite acesso total com a anon key
DROP POLICY IF EXISTS "anon full access" ON newsletter;
DROP POLICY IF EXISTS "anon full access" ON contato;
DROP POLICY IF EXISTS "anon full access" ON curriculos;
DROP POLICY IF EXISTS "anon full access" ON articles;
DROP POLICY IF EXISTS "anon full access" ON clients;
DROP POLICY IF EXISTS "anon full access" ON admin_settings;

CREATE POLICY "anon full access" ON newsletter FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON contato    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON curriculos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON articles   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON clients    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON admin_settings FOR ALL TO anon USING (true) WITH CHECK (true);

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Perfis de admin com controle de acesso por papel (role)
-- ─────────────────────────────────────────────────────────────────────────────
-- Crie usuários normalmente no Supabase Auth (Authentication > Users > Add user).
-- Depois insira aqui o UUID do usuário e defina o papel:
--   'superadmin' → acesso completo ao painel
--   'restrito'   → acesso apenas às abas Clientes e Pauta de Audiências
--
-- Exemplo:
--   INSERT INTO admin_users (user_id, role) VALUES ('uuid-do-usuario', 'restrito');

CREATE TABLE IF NOT EXISTS admin_users (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'superadmin' CHECK (role IN ('superadmin','restrito')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access" ON admin_users;
CREATE POLICY "anon full access" ON admin_users FOR ALL TO anon USING (true) WITH CHECK (true);
-- Permite que o próprio usuário autenticado leia seu registro
DROP POLICY IF EXISTS "auth read own" ON admin_users;
CREATE POLICY "auth read own" ON admin_users FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Pauta de Audiências
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pauta_audiencias (
  id                    TEXT PRIMARY KEY,
  -- Data / tempo
  data_audiencia        DATE NOT NULL,
  horario               TEXT NOT NULL DEFAULT '',
  -- Tipo (ex: "INICIAL - VIRTUAL") — dividido nos dois campos abaixo
  tipo_audiencia        TEXT NOT NULL DEFAULT '' CHECK (tipo_audiencia IN ('INICIAL','INSTRUÇÃO','CONCILIAÇÃO','UNA','')),
  modalidade            TEXT NOT NULL DEFAULT '' CHECK (modalidade IN ('VIRTUAL','PRESENCIAL','HÍBRIDA','')),
  -- Acesso
  id_senha              TEXT NOT NULL DEFAULT '',
  link                  TEXT NOT NULL DEFAULT '',
  -- Partes e responsáveis
  processo              TEXT NOT NULL DEFAULT '',
  vara                  TEXT NOT NULL DEFAULT '',
  cliente               TEXT NOT NULL DEFAULT '',
  reclamante            TEXT NOT NULL DEFAULT '',
  reclamada             TEXT NOT NULL DEFAULT '',
  tipo_responsabilidade TEXT NOT NULL DEFAULT '',
  responsavel_conducao  TEXT NOT NULL DEFAULT '',
  advogado              TEXT NOT NULL DEFAULT '',
  -- Testemunha
  testemunha_necessaria BOOLEAN NOT NULL DEFAULT FALSE,
  testemunhas           TEXT NOT NULL DEFAULT '',
  -- Preposto
  observacoes_preposto  TEXT NOT NULL DEFAULT '',
  dados_preposto        TEXT NOT NULL DEFAULT '',
  -- Extra
  comentarios           TEXT NOT NULL DEFAULT '',
  orientacao            TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada','realizada','adiada','cancelada')),
  origem                TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','excel','pje')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE pauta_audiencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access" ON pauta_audiencias;
CREATE POLICY "anon full access" ON pauta_audiencias FOR ALL TO anon USING (true) WITH CHECK (true);
