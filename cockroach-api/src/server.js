import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

const PORT = Number(process.env.PORT || 8787);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map((x) => x.trim()) }));
app.use(express.json({ limit: '50mb' }));

function parseDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

function baseUrl(req) {
  const host = req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return `${proto}://${host}`;
}

function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up' });
  } catch (e) {
    res.status(500).json({ ok: false, db: 'down', error: String(e.message || e) });
  }
});

app.get('/api/reports/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const data = await prisma.clientReport.findMany({
      where: { clientId },
      orderBy: { uploadedAt: 'desc' }
    });
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/reports', async (req, res) => {
  try {
    const row = req.body || {};
    if (!row.id || !row.clientId || !row.title || !row.fileName) {
      return res.status(400).json({ error: 'Campos obrigatorios: id, clientId, title, fileName' });
    }

    const saved = await prisma.clientReport.upsert({
      where: { id: String(row.id) },
      create: {
        id: String(row.id),
        clientId: String(row.clientId),
        title: String(row.title),
        period: row.period ? String(row.period) : null,
        description: row.description ? String(row.description) : null,
        fileName: String(row.fileName),
        fileUrl: row.fileUrl ? String(row.fileUrl) : null,
        fileSize: toIntOrNull(row.fileSize),
        uploadedAt: row.uploadedAt ? new Date(row.uploadedAt) : new Date(),
        stats: row.stats ?? null
      },
      update: {
        clientId: String(row.clientId),
        title: String(row.title),
        period: row.period ? String(row.period) : null,
        description: row.description ? String(row.description) : null,
        fileName: String(row.fileName),
        fileUrl: row.fileUrl ? String(row.fileUrl) : null,
        fileSize: toIntOrNull(row.fileSize),
        uploadedAt: row.uploadedAt ? new Date(row.uploadedAt) : undefined,
        stats: row.stats ?? null
      }
    });

    return res.status(201).json(saved);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete('/api/reports/:id', async (req, res) => {
  try {
    await prisma.clientReport.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete('/api/reports/by-client/:clientId', async (req, res) => {
  try {
    const out = await prisma.clientReport.deleteMany({ where: { clientId: req.params.clientId } });
    return res.json({ deleted: out.count || 0 });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/ifood/periods', async (_req, res) => {
  try {
    const data = await prisma.ifoodPeriod.findMany({ orderBy: { monthYear: 'desc' } });
    return res.json(data.map((r) => ({
      id: r.id,
      label: r.label,
      month_year: r.monthYear,
      is_active: r.isActive,
      created_at: r.createdAt
    })));
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/ifood/periods', async (req, res) => {
  try {
    const row = req.body || {};
    if (!row.id || !row.label || !row.month_year) {
      return res.status(400).json({ error: 'Campos obrigatorios: id, label, month_year' });
    }
    const saved = await prisma.ifoodPeriod.upsert({
      where: { id: String(row.id) },
      create: {
        id: String(row.id),
        label: String(row.label),
        monthYear: String(row.month_year),
        isActive: !!row.is_active,
        createdAt: row.created_at ? new Date(row.created_at) : new Date()
      },
      update: {
        label: String(row.label),
        monthYear: String(row.month_year),
        isActive: !!row.is_active
      }
    });
    return res.status(201).json(saved);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/ifood/periods/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.ifoodPeriod.updateMany({ data: { isActive: false } });
    await prisma.ifoodPeriod.update({ where: { id }, data: { isActive: true } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/ifood/periods/:id/clear-text', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.ifoodContent.deleteMany({ where: { periodId: id } });
    await prisma.ifoodHighlight.deleteMany({ where: { periodId: id } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete('/api/ifood/periods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.ifoodContent.deleteMany({ where: { periodId: id } });
    await prisma.ifoodHighlight.deleteMany({ where: { periodId: id } });
    await prisma.ifoodKpi.deleteMany({ where: { periodId: id } });
    await prisma.ifoodRawData.deleteMany({ where: { periodId: id } });
    await prisma.ifoodPeriod.delete({ where: { id } });
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/ifood/kpis', async (req, res) => {
  try {
    const periodId = String(req.query.periodId || '');
    const tabKey = String(req.query.tabKey || '');
    if (!periodId) return res.status(400).json({ error: 'periodId obrigatorio' });
    const data = await prisma.ifoodKpi.findMany({
      where: {
        periodId,
        ...(tabKey ? { tabKey } : {})
      },
      orderBy: { sortOrder: 'asc' }
    });
    return res.json(data.map((r) => ({
      id: r.id,
      period_id: r.periodId,
      tab_key: r.tabKey,
      kpi_key: r.kpiKey,
      label: r.label,
      value: r.value,
      unit: r.unit,
      trend_pct: r.trendPct,
      sort_order: r.sortOrder,
      chart_title: r.chartTitle,
      chart_data: r.chartData,
      created_at: r.createdAt
    })));
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/ifood/kpis', async (req, res) => {
  try {
    const row = req.body || {};
    if (!row.id || !row.period_id || !row.tab_key || !row.kpi_key || !row.label || row.value === undefined) {
      return res.status(400).json({ error: 'Campos obrigatorios: id, period_id, tab_key, kpi_key, label, value' });
    }
    const saved = await prisma.ifoodKpi.upsert({
      where: { id: String(row.id) },
      create: {
        id: String(row.id),
        periodId: String(row.period_id),
        tabKey: String(row.tab_key),
        kpiKey: String(row.kpi_key),
        label: String(row.label),
        value: String(row.value),
        unit: row.unit ? String(row.unit) : null,
        trendPct: row.trend_pct === null || row.trend_pct === undefined ? null : Number(row.trend_pct),
        sortOrder: toIntOrNull(row.sort_order) ?? 0,
        chartTitle: row.chart_title ? String(row.chart_title) : null,
        chartData: row.chart_data ?? null
      },
      update: {
        periodId: String(row.period_id),
        tabKey: String(row.tab_key),
        kpiKey: String(row.kpi_key),
        label: String(row.label),
        value: String(row.value),
        unit: row.unit ? String(row.unit) : null,
        trendPct: row.trend_pct === null || row.trend_pct === undefined ? null : Number(row.trend_pct),
        sortOrder: toIntOrNull(row.sort_order) ?? 0,
        chartTitle: row.chart_title ? String(row.chart_title) : null,
        chartData: row.chart_data ?? null
      }
    });
    return res.status(201).json(saved);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/ifood/kpis/bulk', async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'rows obrigatorio' });
    await prisma.$transaction(rows.map((row) => prisma.ifoodKpi.upsert({
      where: { id: String(row.id) },
      create: {
        id: String(row.id),
        periodId: String(row.period_id),
        tabKey: String(row.tab_key),
        kpiKey: String(row.kpi_key),
        label: String(row.label),
        value: String(row.value),
        unit: row.unit ? String(row.unit) : null,
        trendPct: row.trend_pct === null || row.trend_pct === undefined ? null : Number(row.trend_pct),
        sortOrder: toIntOrNull(row.sort_order) ?? 0,
        chartTitle: row.chart_title ? String(row.chart_title) : null,
        chartData: row.chart_data ?? null
      },
      update: {
        periodId: String(row.period_id),
        tabKey: String(row.tab_key),
        kpiKey: String(row.kpi_key),
        label: String(row.label),
        value: String(row.value),
        unit: row.unit ? String(row.unit) : null,
        trendPct: row.trend_pct === null || row.trend_pct === undefined ? null : Number(row.trend_pct),
        sortOrder: toIntOrNull(row.sort_order) ?? 0,
        chartTitle: row.chart_title ? String(row.chart_title) : null,
        chartData: row.chart_data ?? null
      }
    })));
    return res.json({ ok: true, count: rows.length });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete('/api/ifood/kpis/:id', async (req, res) => {
  try {
    await prisma.ifoodKpi.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete('/api/ifood/kpis/by-period/:periodId', async (req, res) => {
  try {
    const out = await prisma.ifoodKpi.deleteMany({ where: { periodId: req.params.periodId } });
    return res.json({ deleted: out.count || 0 });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/ifood/content', async (req, res) => {
  try {
    const periodId = String(req.query.periodId || '');
    const tabKey = String(req.query.tabKey || req.query.tab_key || '');
    if (!periodId && !tabKey) return res.status(400).json({ error: 'periodId ou tabKey obrigatorio' });
    const data = await prisma.ifoodContent.findMany({
      where: {
        ...(periodId ? { periodId } : {}),
        ...(tabKey ? { tabKey } : {})
      }
    });
    return res.json(data.map((r) => ({
      id: r.id,
      period_id: r.periodId,
      tab_key: r.tabKey,
      content_html: r.contentHtml,
      updated_at: r.updatedAt
    })));
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/ifood/content', async (req, res) => {
  try {
    const row = req.body || {};
    if (!row.id || !row.period_id || !row.tab_key) {
      return res.status(400).json({ error: 'Campos obrigatorios: id, period_id, tab_key' });
    }
    const saved = await prisma.ifoodContent.upsert({
      where: { periodId_tabKey: { periodId: String(row.period_id), tabKey: String(row.tab_key) } },
      create: {
        id: String(row.id),
        periodId: String(row.period_id),
        tabKey: String(row.tab_key),
        contentHtml: String(row.content_html || ''),
        updatedAt: row.updated_at ? new Date(row.updated_at) : new Date()
      },
      update: {
        contentHtml: String(row.content_html || ''),
        updatedAt: row.updated_at ? new Date(row.updated_at) : new Date()
      }
    });
    return res.status(201).json(saved);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete('/api/ifood/content/:id', async (req, res) => {
  try {
    await prisma.ifoodContent.delete({ where: { id: req.params.id } });
    return res.json({ deleted: 1 });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete('/api/ifood/content/by-period/:periodId', async (req, res) => {
  try {
    const out = await prisma.ifoodContent.deleteMany({ where: { periodId: req.params.periodId } });
    return res.json({ deleted: out.count || 0 });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/ifood/highlights', async (req, res) => {
  try {
    const periodId = String(req.query.periodId || '');
    if (!periodId) return res.status(400).json({ error: 'periodId obrigatorio' });
    const data = await prisma.ifoodHighlight.findMany({
      where: { periodId },
      orderBy: { sortOrder: 'asc' }
    });
    return res.json(data.map((r) => ({
      id: r.id,
      period_id: r.periodId,
      icon: r.icon,
      title: r.title,
      body: r.body,
      sort_order: r.sortOrder,
      created_at: r.createdAt
    })));
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/ifood/highlights', async (req, res) => {
  try {
    const row = req.body || {};
    if (!row.id || !row.period_id || !row.title) {
      return res.status(400).json({ error: 'Campos obrigatorios: id, period_id, title' });
    }
    const saved = await prisma.ifoodHighlight.upsert({
      where: { id: String(row.id) },
      create: {
        id: String(row.id),
        periodId: String(row.period_id),
        icon: row.icon ? String(row.icon) : null,
        title: String(row.title),
        body: row.body ? String(row.body) : null,
        sortOrder: toIntOrNull(row.sort_order) ?? 0
      },
      update: {
        periodId: String(row.period_id),
        icon: row.icon ? String(row.icon) : null,
        title: String(row.title),
        body: row.body ? String(row.body) : null,
        sortOrder: toIntOrNull(row.sort_order) ?? 0
      }
    });
    return res.status(201).json(saved);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/ifood/highlights/replace', async (req, res) => {
  try {
    const periodId = String(req.body?.periodId || '');
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!periodId) return res.status(400).json({ error: 'periodId obrigatorio' });
    await prisma.ifoodHighlight.deleteMany({ where: { periodId } });
    if (rows.length) {
      await prisma.ifoodHighlight.createMany({
        data: rows.map((row) => ({
          id: String(row.id),
          periodId,
          icon: row.icon ? String(row.icon) : null,
          title: String(row.title || ''),
          body: row.body ? String(row.body) : null,
          sortOrder: toIntOrNull(row.sort_order) ?? 0
        }))
      });
    }
    return res.json({ ok: true, count: rows.length });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete('/api/ifood/highlights/:id', async (req, res) => {
  try {
    await prisma.ifoodHighlight.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

// ══════════════════════════════════════════════════════════════════
// CLIENT DASHBOARD  (ex-empregados + terceirização/subsidiária)
// ══════════════════════════════════════════════════════════════════

// ── Periods ──────────────────────────────────────────────────────

app.get('/api/client-dash/:clientId/periods', async (req, res) => {
  try {
    const data = await prisma.clientDashPeriod.findMany({
      where: { clientId: req.params.clientId },
      orderBy: { monthYear: 'desc' }
    });
    return res.json(data.map((r) => ({
      id: r.id, client_id: r.clientId, label: r.label,
      month_year: r.monthYear, is_active: r.isActive, created_at: r.createdAt
    })));
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/client-dash/:clientId/periods', async (req, res) => {
  try {
    const { clientId } = req.params;
    const row = req.body || {};
    if (!row.id || !row.label || !row.month_year)
      return res.status(400).json({ error: 'Campos obrigatorios: id, label, month_year' });
    const saved = await prisma.clientDashPeriod.upsert({
      where: { id: String(row.id) },
      create: { id: String(row.id), clientId, label: String(row.label), monthYear: String(row.month_year), isActive: !!row.is_active },
      update: { label: String(row.label), monthYear: String(row.month_year), isActive: !!row.is_active }
    });
    return res.status(201).json(saved);
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/client-dash/:clientId/periods/:id/activate', async (req, res) => {
  try {
    const { clientId, id } = req.params;
    await prisma.clientDashPeriod.updateMany({ where: { clientId }, data: { isActive: false } });
    await prisma.clientDashPeriod.update({ where: { id }, data: { isActive: true } });
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

app.delete('/api/client-dash/:clientId/periods/:id', async (req, res) => {
  try {
    const { clientId, id } = req.params;
    await prisma.clientDashContent.deleteMany({ where: { clientId, periodId: id } });
    await prisma.clientDashHighlight.deleteMany({ where: { clientId, periodId: id } });
    await prisma.clientDashKpi.deleteMany({ where: { clientId, periodId: id } });
    await prisma.clientDashPeriod.delete({ where: { id } });
    return res.status(204).send();
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

// ── KPIs ─────────────────────────────────────────────────────────

app.get('/api/client-dash/:clientId/kpis', async (req, res) => {
  try {
    const { clientId } = req.params;
    const periodId = String(req.query.periodId || '');
    const tabKey   = String(req.query.tabKey   || '');
    if (!periodId) return res.status(400).json({ error: 'periodId obrigatorio' });
    const data = await prisma.clientDashKpi.findMany({
      where: { clientId, periodId, ...(tabKey ? { tabKey } : {}) },
      orderBy: { sortOrder: 'asc' }
    });
    return res.json(data.map((r) => ({
      id: r.id, client_id: r.clientId, period_id: r.periodId, tab_key: r.tabKey,
      kpi_key: r.kpiKey, label: r.label, value: r.value, unit: r.unit,
      trend_pct: r.trendPct, sort_order: r.sortOrder,
      chart_title: r.chartTitle, chart_data: r.chartData, created_at: r.createdAt
    })));
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/client-dash/:clientId/kpis', async (req, res) => {
  try {
    const { clientId } = req.params;
    const row = req.body || {};
    if (!row.id || !row.period_id || !row.tab_key || !row.kpi_key || !row.label || row.value === undefined)
      return res.status(400).json({ error: 'Campos obrigatorios: id, period_id, tab_key, kpi_key, label, value' });
    const saved = await prisma.clientDashKpi.upsert({
      where: { id: String(row.id) },
      create: {
        id: String(row.id), clientId, periodId: String(row.period_id), tabKey: String(row.tab_key),
        kpiKey: String(row.kpi_key), label: String(row.label), value: String(row.value),
        unit: row.unit ? String(row.unit) : null,
        trendPct: row.trend_pct == null ? null : Number(row.trend_pct),
        sortOrder: toIntOrNull(row.sort_order) ?? 0,
        chartTitle: row.chart_title ? String(row.chart_title) : null,
        chartData: row.chart_data ?? null
      },
      update: {
        periodId: String(row.period_id), tabKey: String(row.tab_key),
        kpiKey: String(row.kpi_key), label: String(row.label), value: String(row.value),
        unit: row.unit ? String(row.unit) : null,
        trendPct: row.trend_pct == null ? null : Number(row.trend_pct),
        sortOrder: toIntOrNull(row.sort_order) ?? 0,
        chartTitle: row.chart_title ? String(row.chart_title) : null,
        chartData: row.chart_data ?? null
      }
    });
    return res.status(201).json(saved);
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

// PUT = upsert por ID (edição manual no admin)
app.put('/api/client-dash/:clientId/kpis/:id', async (req, res) => {
  req.body = { ...req.body, id: req.params.id };
  req.params = { clientId: req.params.clientId };
  // delegate — find the POST handler logic inline
  try {
    const { clientId } = req.params;
    const row = req.body || {};
    if (!row.id || !row.period_id || !row.tab_key || !row.kpi_key || !row.label || row.value === undefined)
      return res.status(400).json({ error: 'Campos obrigatorios: id, period_id, tab_key, kpi_key, label, value' });
    const saved = await prisma.clientDashKpi.upsert({
      where: { id: String(row.id) },
      create: {
        id: String(row.id), clientId, periodId: String(row.period_id), tabKey: String(row.tab_key),
        kpiKey: String(row.kpi_key), label: String(row.label), value: String(row.value),
        unit: row.unit ? String(row.unit) : null,
        trendPct: row.trend_pct == null ? null : Number(row.trend_pct),
        sortOrder: toIntOrNull(row.sort_order) ?? 0,
        chartTitle: row.chart_title ? String(row.chart_title) : null,
        chartData: row.chart_data ?? null
      },
      update: {
        periodId: String(row.period_id), tabKey: String(row.tab_key),
        kpiKey: String(row.kpi_key), label: String(row.label), value: String(row.value),
        unit: row.unit ? String(row.unit) : null,
        trendPct: row.trend_pct == null ? null : Number(row.trend_pct),
        sortOrder: toIntOrNull(row.sort_order) ?? 0,
        chartTitle: row.chart_title ? String(row.chart_title) : null,
        chartData: row.chart_data ?? null
      }
    });
    return res.status(200).json(saved);
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

app.delete('/api/client-dash/:clientId/kpis/:id', async (req, res) => {
  try {
    await prisma.clientDashKpi.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/client-dash/:clientId/kpis/bulk', async (req, res) => {
  try {
    const { clientId } = req.params;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'rows obrigatorio' });
    await prisma.$transaction(rows.map((row) => prisma.clientDashKpi.upsert({
      where: { id: String(row.id) },
      create: {
        id: String(row.id), clientId, periodId: String(row.period_id), tabKey: String(row.tab_key),
        kpiKey: String(row.kpi_key), label: String(row.label), value: String(row.value),
        unit: row.unit ? String(row.unit) : null,
        trendPct: row.trend_pct == null ? null : Number(row.trend_pct),
        sortOrder: toIntOrNull(row.sort_order) ?? 0,
        chartTitle: row.chart_title ? String(row.chart_title) : null,
        chartData: row.chart_data ?? null
      },
      update: {
        periodId: String(row.period_id), tabKey: String(row.tab_key),
        kpiKey: String(row.kpi_key), label: String(row.label), value: String(row.value),
        unit: row.unit ? String(row.unit) : null,
        trendPct: row.trend_pct == null ? null : Number(row.trend_pct),
        sortOrder: toIntOrNull(row.sort_order) ?? 0,
        chartTitle: row.chart_title ? String(row.chart_title) : null,
        chartData: row.chart_data ?? null
      }
    })));
    return res.json({ ok: true, count: rows.length });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

app.delete('/api/client-dash/:clientId/kpis/by-period/:periodId', async (req, res) => {
  try {
    const out = await prisma.clientDashKpi.deleteMany({
      where: { clientId: req.params.clientId, periodId: req.params.periodId }
    });
    return res.json({ deleted: out.count || 0 });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

app.delete('/api/client-dash/:clientId/highlights/by-period/:periodId', async (req, res) => {
  try {
    const out = await prisma.clientDashHighlight.deleteMany({
      where: { clientId: req.params.clientId, periodId: req.params.periodId }
    });
    return res.json({ deleted: out.count || 0 });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

// ── Content ───────────────────────────────────────────────────────

app.get('/api/client-dash/:clientId/content', async (req, res) => {
  try {
    const { clientId } = req.params;
    const periodId = String(req.query.periodId || '');
    const tabKey   = String(req.query.tabKey   || '');
    if (!periodId && !tabKey) return res.status(400).json({ error: 'periodId ou tabKey obrigatorio' });
    const data = await prisma.clientDashContent.findMany({
      where: { clientId, ...(periodId ? { periodId } : {}), ...(tabKey ? { tabKey } : {}) }
    });
    return res.json(data.map((r) => ({
      id: r.id, client_id: r.clientId, period_id: r.periodId, tab_key: r.tabKey,
      content_html: r.contentHtml, updated_at: r.updatedAt
    })));
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/client-dash/:clientId/content', async (req, res) => {
  try {
    const { clientId } = req.params;
    const row = req.body || {};
    if (!row.id || !row.period_id || !row.tab_key)
      return res.status(400).json({ error: 'Campos obrigatorios: id, period_id, tab_key' });
    const saved = await prisma.clientDashContent.upsert({
      where: { clientId_periodId_tabKey: { clientId, periodId: String(row.period_id), tabKey: String(row.tab_key) } },
      create: { id: String(row.id), clientId, periodId: String(row.period_id), tabKey: String(row.tab_key), contentHtml: String(row.content_html || '') },
      update: { contentHtml: String(row.content_html || ''), updatedAt: new Date() }
    });
    return res.status(201).json(saved);
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

// ── Highlights ────────────────────────────────────────────────────

app.get('/api/client-dash/:clientId/highlights', async (req, res) => {
  try {
    const { clientId } = req.params;
    const periodId = String(req.query.periodId || '');
    if (!periodId) return res.status(400).json({ error: 'periodId obrigatorio' });
    const data = await prisma.clientDashHighlight.findMany({
      where: { clientId, periodId },
      orderBy: { sortOrder: 'asc' }
    });
    return res.json(data.map((r) => ({
      id: r.id, client_id: r.clientId, period_id: r.periodId,
      icon: r.icon, title: r.title, body: r.body, sort_order: r.sortOrder, created_at: r.createdAt
    })));
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/client-dash/:clientId/highlights', async (req, res) => {
  try {
    const { clientId } = req.params;
    const row = req.body || {};
    if (!row.id || !row.period_id || !row.title)
      return res.status(400).json({ error: 'Campos obrigatorios: id, period_id, title' });
    const saved = await prisma.clientDashHighlight.upsert({
      where: { id: String(row.id) },
      create: {
        id: String(row.id), clientId, periodId: String(row.period_id),
        icon: row.icon ? String(row.icon) : null, title: String(row.title),
        body: row.body ? String(row.body) : null, sortOrder: toIntOrNull(row.sort_order) ?? 0
      },
      update: {
        periodId: String(row.period_id), icon: row.icon ? String(row.icon) : null,
        title: String(row.title), body: row.body ? String(row.body) : null,
        sortOrder: toIntOrNull(row.sort_order) ?? 0
      }
    });
    return res.status(201).json(saved);
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/client-dash/:clientId/highlights/replace', async (req, res) => {
  try {
    const { clientId } = req.params;
    const periodId = String(req.body?.periodId || '');
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!periodId) return res.status(400).json({ error: 'periodId obrigatorio' });
    await prisma.clientDashHighlight.deleteMany({ where: { clientId, periodId } });
    if (rows.length) {
      await prisma.clientDashHighlight.createMany({
        data: rows.map((r) => ({
          id: String(r.id), clientId, periodId,
          icon: r.icon ? String(r.icon) : null, title: String(r.title || ''),
          body: r.body ? String(r.body) : null, sortOrder: toIntOrNull(r.sort_order) ?? 0
        }))
      });
    }
    return res.json({ ok: true, count: rows.length });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

app.delete('/api/client-dash/:clientId/highlights/:id', async (req, res) => {
  try {
    await prisma.clientDashHighlight.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
});

app.delete('/api/ifood/highlights/by-period/:periodId', async (req, res) => {
  try {
    const out = await prisma.ifoodHighlight.deleteMany({ where: { periodId: req.params.periodId } });
    return res.json({ deleted: out.count || 0 });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/ifood/raw-data', async (req, res) => {
  try {
    const row = req.body || {};
    if (!row.id || !row.period_id || !row.filename) {
      return res.status(400).json({ error: 'Campos obrigatorios: id, period_id, filename' });
    }
    const saved = await prisma.ifoodRawData.upsert({
      where: { id: String(row.id) },
      create: {
        id: String(row.id),
        periodId: String(row.period_id),
        filename: String(row.filename),
        rawJson: row.raw_json ?? {},
        uploadedAt: row.uploaded_at ? new Date(row.uploaded_at) : new Date()
      },
      update: {
        periodId: String(row.period_id),
        filename: String(row.filename),
        rawJson: row.raw_json ?? {},
        uploadedAt: row.uploaded_at ? new Date(row.uploaded_at) : new Date()
      }
    });
    return res.status(201).json(saved);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`falaw-cockroach-api running on port ${PORT}`);
});
