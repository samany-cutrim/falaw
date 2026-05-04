const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.ifoodKpi.findFirst({ where: { kpiKey: 'chart_julgadores' } }).then(r => {
  if (!r) { console.log('NOT FOUND'); return; }
  const cd = JSON.parse(r.chartData || '{}');
  console.log('labels:', JSON.stringify(cd.data && cd.data.labels && cd.data.labels.slice(0, 3)));
  console.log('datasets:', cd.data && cd.data.datasets && cd.data.datasets.map(function(d){ return d.label; }));
  const meta = cd.falaw_meta || {};
  console.log('tooltip_mode:', meta.tooltip_mode);
  console.log('meta keys:', Object.keys(meta));
  const det = meta.details || {};
  const k0 = Object.keys(det)[0];
  if (k0) { console.log('detail[0] key:', k0); console.log('detail[0] value:', JSON.stringify(det[k0])); }
}).finally(function(){ p.$disconnect(); });
