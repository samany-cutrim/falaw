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
  tipo_audiencia        TEXT NOT NULL DEFAULT '' CHECK (tipo_audiencia IN ('INICIAL','INSTRUÇÃO','CONCILIAÇÃO','UNA','PERÍCIA','ENCERRAMENTO DE INSTRUÇÃO','SUSTENTAÇÃO ORAL','DILIGÊNCIA','')),
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
  origem                TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','excel','pje','projuris')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE pauta_audiencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access" ON pauta_audiencias;
CREATE POLICY "anon full access" ON pauta_audiencias FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── Controle de sincronização (Projuris Sync) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_log (
  id         BIGSERIAL PRIMARY KEY,
  source     TEXT NOT NULL,          -- 'projuris'
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count      INT NOT NULL DEFAULT 0
);
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
-- Apenas a service_role (Edge Function) pode inserir/ler
DROP POLICY IF EXISTS "service full access" ON sync_log;
CREATE POLICY "service full access" ON sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Agendamento via pg_cron — Edge Functions (gratuito, sem Render) ──────────
-- Jobs ativos (consultado em 2026-07-15):
--   jobid 1 — sync-pauta-diario      → 0 10 * * 1-5  (seg–sex 07h BRT, job legado)
--   jobid 2 — projuris-sync-2x-dia   → 0 11,19 * * * (08h e 16h BRT, todos os dias)
--   jobid 3 — whatsapp-notify-diario → 0 * * * *     (a cada hora — avisa 24h antes do horário da audiência)
--
-- Para consultar: SELECT jobid, jobname, schedule, active FROM cron.job;
-- Para remover:   SELECT cron.unschedule('projuris-sync-2x-dia');
--                 SELECT cron.unschedule('whatsapp-notify-diario');
--                 SELECT cron.unschedule('sync-pauta-diario');
--
-- Para recriar os jobs das Edge Functions (caso necessário):
-- SELECT cron.schedule(
--   'projuris-sync-2x-dia', '0 11,19 * * *',
--   $$ SELECT net.http_post(
--        url     := 'https://yleofidqkimeanpuothv.supabase.co/functions/v1/projuris-sync',
--        headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--        body    := '{}'::jsonb); $$);
--
-- SELECT cron.schedule(
--   'whatsapp-notify-diario', '0 * * * *',  -- a cada hora; função filtra pelo horário da audiência (BRT)
--   $$ SELECT net.http_post(
--        url     := 'https://yleofidqkimeanpuothv.supabase.co/functions/v1/whatsapp-notify',
--        headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--        body    := '{}'::jsonb); $$);


-- ── iFood Dashboard ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "IfoodPeriod" (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  month_year  TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "IfoodPeriod" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access" ON "IfoodPeriod";
CREATE POLICY "anon full access" ON "IfoodPeriod" FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS "IfoodKpi" (
  id          TEXT PRIMARY KEY,
  period_id   TEXT NOT NULL REFERENCES "IfoodPeriod"(id) ON DELETE CASCADE,
  tab_key     TEXT NOT NULL,
  kpi_key     TEXT NOT NULL,
  label       TEXT,
  value       TEXT,
  unit        TEXT,
  chart_data  JSONB,
  chart_title TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  trend_pct   NUMERIC,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "IfoodKpi" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access" ON "IfoodKpi";
CREATE POLICY "anon full access" ON "IfoodKpi" FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS "IfoodContent" (
  id          TEXT PRIMARY KEY,
  period_id   TEXT NOT NULL REFERENCES "IfoodPeriod"(id) ON DELETE CASCADE,
  tab_key     TEXT NOT NULL,
  content     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "IfoodContent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access" ON "IfoodContent";
CREATE POLICY "anon full access" ON "IfoodContent" FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS "IfoodHighlight" (
  id              TEXT PRIMARY KEY,
  period_id       TEXT NOT NULL REFERENCES "IfoodPeriod"(id) ON DELETE CASCADE,
  icon            TEXT,
  title           TEXT,
  body            TEXT,
  description     TEXT,
  highlight_type  TEXT NOT NULL DEFAULT 'card',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Migração: adiciona colunas se já existir a tabela
ALTER TABLE "IfoodHighlight" ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE "IfoodHighlight" ADD COLUMN IF NOT EXISTS highlight_type TEXT NOT NULL DEFAULT 'card';
ALTER TABLE "IfoodHighlight" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access" ON "IfoodHighlight";
CREATE POLICY "anon full access" ON "IfoodHighlight" FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── Relatórios de Clientes ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ClientReport" (
  id           TEXT PRIMARY KEY,
  "clientId"   TEXT NOT NULL,
  title        TEXT,
  period       TEXT,
  description  TEXT,
  "fileName"   TEXT,
  "fileUrl"    TEXT,
  "fileSize"   BIGINT,
  "uploadedAt" TIMESTAMPTZ DEFAULT NOW(),
  stats        JSONB
);
ALTER TABLE "ClientReport" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access" ON "ClientReport";
CREATE POLICY "anon full access" ON "ClientReport" FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── Dashboard de Clientes (genérico) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ClientDashPeriod" (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL,
  label       TEXT NOT NULL,
  month_year  TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "ClientDashPeriod" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access" ON "ClientDashPeriod";
CREATE POLICY "anon full access" ON "ClientDashPeriod" FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS "ClientDashKpi" (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL,
  period_id   TEXT NOT NULL,
  tab_key     TEXT NOT NULL,
  kpi_key     TEXT NOT NULL,
  label       TEXT,
  value       TEXT,
  unit        TEXT,
  trend_pct   NUMERIC,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  chart_title TEXT,
  chart_data  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "ClientDashKpi" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access" ON "ClientDashKpi";
CREATE POLICY "anon full access" ON "ClientDashKpi" FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS "ClientDashContent" (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL,
  period_id   TEXT NOT NULL,
  tab_key     TEXT NOT NULL,
  content_html TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, period_id, tab_key)
);
ALTER TABLE "ClientDashContent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access" ON "ClientDashContent";
CREATE POLICY "anon full access" ON "ClientDashContent" FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS "ClientDashHighlight" (
  id              TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL,
  period_id       TEXT NOT NULL,
  icon            TEXT,
  title           TEXT,
  body            TEXT,
  description     TEXT,
  highlight_type  TEXT NOT NULL DEFAULT 'card',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "ClientDashHighlight" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access" ON "ClientDashHighlight";
CREATE POLICY "anon full access" ON "ClientDashHighlight" FOR ALL TO anon USING (true) WITH CHECK (true);

-- Pesquisas de Qualidade de Audiências
CREATE TABLE IF NOT EXISTS pesquisas (
  id                        TEXT PRIMARY KEY,
  tipo                      TEXT NOT NULL CHECK (tipo IN ('advogado','preposto')),
  nome                      TEXT,
  oab                       TEXT,
  cargo                     TEXT,
  data_audiencia            DATE,
  vara_comarca              TEXT,
  num_processo              TEXT,
  empresa                   TEXT,
  tipo_audiencia            TEXT CHECK (tipo_audiencia IN ('virtual','presencial')),
  orientacoes_antecedencia  TEXT,
  orientacoes_claras        TEXT,
  info_claras_depoimento    TEXT,
  contato_previo            TEXT,
  intercorrencia            TEXT,
  intercorrencia_descricao  TEXT,
  falha_tecnica             TEXT,
  preposto_preparado        TEXT,
  respondente_preparado     TEXT,
  escala_avaliacao          INTEGER CHECK (escala_avaliacao BETWEEN 1 AND 5),
  observacoes               TEXT,
  submitted_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE pesquisas ENABLE ROW LEVEL SECURITY;
-- Migrações (caso a tabela já exista sem estes campos):
ALTER TABLE pesquisas ADD COLUMN IF NOT EXISTS nome  TEXT;
ALTER TABLE pesquisas ADD COLUMN IF NOT EXISTS oab   TEXT;
ALTER TABLE pesquisas ADD COLUMN IF NOT EXISTS cargo TEXT;
DROP POLICY IF EXISTS "anon insert pesquisas" ON pesquisas;
CREATE POLICY "anon insert pesquisas" ON pesquisas FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "auth read pesquisas" ON pesquisas;
CREATE POLICY "auth read pesquisas"   ON pesquisas FOR SELECT TO authenticated USING (true);


-- -- CORRESPONDENTES ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS correspondentes (
  id         TEXT PRIMARY KEY,
  nome       TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL,
  celular    TEXT DEFAULT '',
  tipo       TEXT NOT NULL DEFAULT 'advogado' CHECK (tipo IN ('advogado','preposto','admin')),
  code       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE correspondentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access correspondentes" ON correspondentes;
CREATE POLICY "anon full access correspondentes"
  ON correspondentes FOR ALL TO anon
  USING (true) WITH CHECK (true);
-- Migrações:
ALTER TABLE correspondentes ADD COLUMN IF NOT EXISTS celular TEXT DEFAULT '';
ALTER TABLE correspondentes DROP CONSTRAINT IF EXISTS correspondentes_tipo_check;
ALTER TABLE correspondentes ADD CONSTRAINT correspondentes_tipo_check
  CHECK (tipo IN ('advogado','preposto','admin'));

-- Migra��o: orientacao_enviada (persist�ncia cross-device do checkbox do escrit�rio)
ALTER TABLE pauta_audiencias ADD COLUMN IF NOT EXISTS orientacao_enviada BOOLEAN NOT NULL DEFAULT FALSE;
-- Migrações recentes:
ALTER TABLE pauta_audiencias ADD COLUMN IF NOT EXISTS testemunhas      TEXT NOT NULL DEFAULT '';
ALTER TABLE pauta_audiencias ADD COLUMN IF NOT EXISTS corr_tipo_envio  TEXT DEFAULT NULL;
ALTER TABLE pauta_audiencias ADD COLUMN IF NOT EXISTS valor_advogado         NUMERIC(10,2) DEFAULT NULL;
ALTER TABLE pauta_audiencias ADD COLUMN IF NOT EXISTS valor_preposto         NUMERIC(10,2) DEFAULT NULL;
ALTER TABLE pauta_audiencias ADD COLUMN IF NOT EXISTS whatsapp_notificado_at TIMESTAMPTZ   DEFAULT NULL;

-- Migração: adiciona SUSTENTAÇÃO ORAL ao check constraint de tipo_audiencia
ALTER TABLE pauta_audiencias DROP CONSTRAINT IF EXISTS pauta_audiencias_tipo_audiencia_check;
ALTER TABLE pauta_audiencias ADD CONSTRAINT pauta_audiencias_tipo_audiencia_check
  CHECK (tipo_audiencia IN ('INICIAL','INSTRUÇÃO','CONCILIAÇÃO','UNA','PERÍCIA','ENCERRAMENTO DE INSTRUÇÃO','SUSTENTAÇÃO ORAL',''));

-- Migração: adiciona DILIGÊNCIA ao check constraint de tipo_audiencia
ALTER TABLE pauta_audiencias DROP CONSTRAINT IF EXISTS pauta_audiencias_tipo_audiencia_check;
ALTER TABLE pauta_audiencias ADD CONSTRAINT pauta_audiencias_tipo_audiencia_check
  CHECK (tipo_audiencia IN ('INICIAL','INSTRUÇÃO','CONCILIAÇÃO','UNA','PERÍCIA','ENCERRAMENTO DE INSTRUÇÃO','SUSTENTAÇÃO ORAL','DILIGÊNCIA',''));

-- EQUIPE INTERNA (advogados do escritório — usado para notificação WhatsApp)
CREATE TABLE IF NOT EXISTS equipe (
  id      TEXT PRIMARY KEY,
  nome    TEXT,
  email   TEXT,
  celular TEXT,
  cargo   TEXT
);
ALTER TABLE equipe ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon full access" ON equipe;
CREATE POLICY "anon full access" ON equipe FOR ALL TO anon USING (true) WITH CHECK (true);
