-- FALAW ADVOGADOS — iFood BI Dashboard — Supabase Schema
-- Execute no SQL Editor do Supabase: Database > SQL Editor
-- Depois de executar o supabase-setup.sql principal

-- ── 1. PERÍODOS ──────────────────────────────────────────────────────────────
-- Cada período representa um mês/ciclo de relatório (ex.: "Fevereiro 2026")
CREATE TABLE IF NOT EXISTS ifood_periods (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,          -- "Fevereiro 2026"
  month_year TEXT NOT NULL,          -- "2026-02"  (YYYY-MM)
  is_active  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. KPIs / MÉTRICAS ───────────────────────────────────────────────────────
-- Um registro por indicador por aba por período
-- chart_data (JSONB): { type, labels[], datasets[{label,data[],borderColor,...}] }
CREATE TABLE IF NOT EXISTS ifood_kpis (
  id          TEXT PRIMARY KEY,
  period_id   TEXT NOT NULL REFERENCES ifood_periods(id) ON DELETE CASCADE,
  tab_key     TEXT NOT NULL,   -- visao-geral | nuvem | op-logistico | ex-foodlover | terceirizacao | marketplace | metas
  kpi_key     TEXT NOT NULL,   -- identificador único dentro da aba (ex.: total_processos)
  label       TEXT NOT NULL,   -- rótulo exibido no card
  value       TEXT NOT NULL DEFAULT '',  -- valor formatado (ex.: "1.234" ou "R$ 5,2 mi")
  unit        TEXT NOT NULL DEFAULT '',  -- sufixo/unidade (ex.: "processos", "%")
  trend_pct   NUMERIC,                   -- variação % em relação ao período anterior (positivo=alta, negativo=queda)
  sort_order  INTEGER NOT NULL DEFAULT 0,
  chart_data  JSONB,                     -- dados do gráfico associado (opcional)
  chart_title TEXT NOT NULL DEFAULT ''   -- título do gráfico
);

-- ── 3. CONTEÚDO TEXTUAL ──────────────────────────────────────────────────────
-- Texto/HTML por aba por período (análise escrita pelo advogado/gestor)
CREATE TABLE IF NOT EXISTS ifood_content (
  id          TEXT PRIMARY KEY,
  period_id   TEXT NOT NULL REFERENCES ifood_periods(id) ON DELETE CASCADE,
  tab_key     TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (period_id, tab_key)
);

-- ── 4. DESTAQUES DO MÊS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ifood_highlights (
  id         TEXT PRIMARY KEY,
  period_id  TEXT NOT NULL REFERENCES ifood_periods(id) ON DELETE CASCADE,
  icon       TEXT NOT NULL DEFAULT '★',     -- emoji ou ícone Unicode
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ── 5. DADOS BRUTOS DO EXCEL ─────────────────────────────────────────────────
-- Armazena o JSON extraído da planilha para referência / reprocessamento
CREATE TABLE IF NOT EXISTS ifood_raw_data (
  id         TEXT PRIMARY KEY,
  period_id  TEXT NOT NULL REFERENCES ifood_periods(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  raw_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────
ALTER TABLE ifood_periods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ifood_kpis       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ifood_content    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ifood_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ifood_raw_data   ENABLE ROW LEVEL SECURITY;

-- Acesso total com a anon key (mesmo padrão do setup principal)
CREATE POLICY "anon full access" ON ifood_periods    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON ifood_kpis       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON ifood_content    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON ifood_highlights FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON ifood_raw_data   FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── ÍNDICES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ifood_kpis_period_tab ON ifood_kpis (period_id, tab_key);
CREATE INDEX IF NOT EXISTS idx_ifood_content_period_tab ON ifood_content (period_id, tab_key);
CREATE INDEX IF NOT EXISTS idx_ifood_highlights_period ON ifood_highlights (period_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ifood_periods_active ON ifood_periods (is_active);
