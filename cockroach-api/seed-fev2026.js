/**
 * seed-fev2026.js — Importa os dados de Fevereiro 2026 para o CockroachDB
 *
 * Uso:
 *   node seed-fev2026.js --api=https://sua-api-url.com
 *
 * Ou defina a variável de ambiente:
 *   IFOOD_API_URL=https://sua-api-url.com node seed-fev2026.js
 */

const API_URL = (() => {
  const arg = process.argv.find(a => a.startsWith('--api='));
  if (arg) return arg.slice(6).replace(/\/$/, '');
  if (process.env.IFOOD_API_URL) return process.env.IFOOD_API_URL.replace(/\/$/, '');
  console.error('\n❌  Informe a URL da API:\n   node seed-fev2026.js --api=https://sua-api.com\n');
  process.exit(1);
})();

async function del(path) {
  const res = await fetch(`${API_URL}${path}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`DELETE ${path} → ${res.status}: ${text}`);
  }
}

async function post(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

/* ═══════════════════════════════════════════════════════════
   PERÍODO
═══════════════════════════════════════════════════════════ */
const PERIOD_ID = 'fev-2026';

const period = {
  id: PERIOD_ID,
  label: 'Fevereiro 2026',
  month_year: '2026-02',
  is_active: false,
};

/* ═══════════════════════════════════════════════════════════
   KPIs
═══════════════════════════════════════════════════════════ */
const kpis = [
  /* ── VISÃO GERAL ── */
  { tab_key: 'visao-geral', kpi_key: 'processos-ativos',    label: 'Processos Ativos',           value: '1.383', unit: '',   trend_pct: null,   sort_order: 1, chart_title: null, chart_data: null },
  { tab_key: 'visao-geral', kpi_key: 'encerrados',          label: 'Encerrados desde 2022',       value: '1.401', unit: '',   trend_pct: null,   sort_order: 2, chart_title: null, chart_data: null },
  { tab_key: 'visao-geral', kpi_key: 'dec-fav-2026',        label: 'Decisões Favoráveis 2026',    value: '22',    unit: '',   trend_pct: 46.8,   sort_order: 3, chart_title: null, chart_data: null },
  { tab_key: 'visao-geral', kpi_key: 'dec-desf-2026',       label: 'Decisões Desfavoráveis 2026', value: '25',    unit: '',   trend_pct: 53.2,   sort_order: 4, chart_title: null, chart_data: null },
  { tab_key: 'visao-geral', kpi_key: 'novas-acoes-2026',    label: 'Novas Ações 2026',            value: '4',     unit: '',   trend_pct: null,   sort_order: 5, chart_title: null, chart_data: null },
  { tab_key: 'visao-geral', kpi_key: 'taxa-fav-sentencas',  label: 'Taxa Fav. Sentenças',         value: '25,0',  unit: '%',  trend_pct: null,   sort_order: 6, chart_title: null, chart_data: null },
  { tab_key: 'visao-geral', kpi_key: 'taxa-fav-acordaos',   label: 'Taxa Fav. Acórdãos',          value: '54,3',  unit: '%',  trend_pct: null,   sort_order: 7,
    chart_title: 'Distribuição por Causa Raiz',
    chart_data: JSON.stringify({
      type: 'doughnut',
      data: {
        labels: ['☁ Nuvem', '🚚 Op. Logístico', '👤 Ex-Foodlover', '🤝 Terceirização', '🏪 Marketplace'],
        datasets: [{
          data: [605, 530, 197, 41, 9],
          backgroundColor: ['#1565C0', '#E65100', '#6A1B9A', '#2E7D32', '#00796B'],
          borderWidth: 2,
          borderColor: '#fff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10 } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${((ctx.raw/1383)*100).toFixed(1)}%)` } },
        },
      },
    }),
  },

  /* ── NUVEM ── */
  { tab_key: 'nuvem', kpi_key: 'total-ativos',     label: 'Total Ativos',               value: '605',   unit: '',  trend_pct: null,  sort_order: 1,  chart_title: null, chart_data: null },
  { tab_key: 'nuvem', kpi_key: 'pct-carteira',     label: '% da Carteira',              value: '43,7',  unit: '%', trend_pct: null,  sort_order: 2,  chart_title: null, chart_data: null },
  { tab_key: 'nuvem', kpi_key: 'dec-fav',          label: 'Decisões Favoráveis Fev/26', value: '9',     unit: '',  trend_pct: null,  sort_order: 3,  chart_title: null, chart_data: null },
  { tab_key: 'nuvem', kpi_key: 'dec-desf',         label: 'Decisões Desfavoráveis',     value: '7',     unit: '',  trend_pct: null,  sort_order: 4,  chart_title: null, chart_data: null },
  { tab_key: 'nuvem', kpi_key: 'taxa-sucesso',     label: 'Taxa Sucesso Fev/26',        value: '56,2',  unit: '%', trend_pct: 56.2,  sort_order: 5,  chart_title: null, chart_data: null },
  { tab_key: 'nuvem', kpi_key: 'sent-fav',         label: 'Sentenças Favoráveis',       value: '0',     unit: '',  trend_pct: null,  sort_order: 6,  chart_title: null, chart_data: null },
  { tab_key: 'nuvem', kpi_key: 'sent-desf',        label: 'Sentenças Desfavoráveis',    value: '2',     unit: '',  trend_pct: null,  sort_order: 7,  chart_title: null, chart_data: null },
  { tab_key: 'nuvem', kpi_key: 'ac-fav',           label: 'Acórdãos Favoráveis',        value: '9',     unit: '',  trend_pct: null,  sort_order: 8,  chart_title: null, chart_data: null },
  { tab_key: 'nuvem', kpi_key: 'ac-desf',          label: 'Acórdãos Desfavoráveis',     value: '5',     unit: '',  trend_pct: null,  sort_order: 9,  chart_title: null, chart_data: null },
  { tab_key: 'nuvem', kpi_key: 'taxa-fav-sent',    label: 'Taxa Fav. Sentenças',        value: '0,0',   unit: '%', trend_pct: null,  sort_order: 10, chart_title: null, chart_data: null },
  { tab_key: 'nuvem', kpi_key: 'taxa-fav-ac',      label: 'Taxa Fav. Acórdãos',         value: '64,3',  unit: '%', trend_pct: 64.3,  sort_order: 11, chart_title: null, chart_data: null },

  /* ── OPERADOR LOGÍSTICO ── */
  { tab_key: 'op-logistico', kpi_key: 'total-ativos',    label: 'Total Ativos',             value: '530',  unit: '',  trend_pct: null,  sort_order: 1,  chart_title: null, chart_data: null },
  { tab_key: 'op-logistico', kpi_key: 'pct-carteira',    label: '% da Carteira',            value: '38,3', unit: '%', trend_pct: null,  sort_order: 2,  chart_title: null, chart_data: null },
  { tab_key: 'op-logistico', kpi_key: 'dec-fav',         label: 'Favoráveis Fev/26',        value: '11',   unit: '',  trend_pct: null,  sort_order: 3,  chart_title: null, chart_data: null },
  { tab_key: 'op-logistico', kpi_key: 'dec-desf',        label: 'Desfavoráveis Fev/26',     value: '11',   unit: '',  trend_pct: null,  sort_order: 4,  chart_title: null, chart_data: null },
  { tab_key: 'op-logistico', kpi_key: 'taxa-sucesso',    label: 'Taxa Sucesso Fev/26',      value: '50,0', unit: '%', trend_pct: 50.0,  sort_order: 5,  chart_title: null, chart_data: null },
  { tab_key: 'op-logistico', kpi_key: 'sent-fav',        label: 'Sentenças Favoráveis',     value: '2',    unit: '',  trend_pct: null,  sort_order: 6,  chart_title: null, chart_data: null },
  { tab_key: 'op-logistico', kpi_key: 'sent-desf',       label: 'Sentenças Desfavoráveis',  value: '4',    unit: '',  trend_pct: null,  sort_order: 7,  chart_title: null, chart_data: null },
  { tab_key: 'op-logistico', kpi_key: 'ac-fav',          label: 'Acórdãos Favoráveis',      value: '9',    unit: '',  trend_pct: null,  sort_order: 8,  chart_title: null, chart_data: null },
  { tab_key: 'op-logistico', kpi_key: 'ac-desf',         label: 'Acórdãos Desfavoráveis',   value: '7',    unit: '',  trend_pct: null,  sort_order: 9,  chart_title: null, chart_data: null },
  { tab_key: 'op-logistico', kpi_key: 'taxa-fav-sent',   label: 'Taxa Fav. Sentenças',      value: '33,3', unit: '%', trend_pct: 33.3,  sort_order: 10, chart_title: null, chart_data: null },
  { tab_key: 'op-logistico', kpi_key: 'taxa-fav-ac',     label: 'Taxa Fav. Acórdãos',       value: '56,3', unit: '%', trend_pct: 56.3,  sort_order: 11, chart_title: null, chart_data: null },

  /* ── EX-FOODLOVER ── */
  { tab_key: 'ex-foodlover', kpi_key: 'total-ativos',  label: 'Total Ativos',    value: '197',  unit: '',  trend_pct: null, sort_order: 1, chart_title: null, chart_data: null },
  { tab_key: 'ex-foodlover', kpi_key: 'pct-carteira',  label: '% da Carteira',   value: '14,2', unit: '%', trend_pct: null, sort_order: 2, chart_title: null, chart_data: null },

  /* ── TERCEIRIZAÇÃO ── */
  { tab_key: 'terceirizacao', kpi_key: 'total-ativos',  label: 'Total Ativos',         value: '41',   unit: '',  trend_pct: null, sort_order: 1, chart_title: null, chart_data: null },
  { tab_key: 'terceirizacao', kpi_key: 'pct-carteira',  label: '% da Carteira',        value: '3,0',  unit: '%', trend_pct: null, sort_order: 2, chart_title: null, chart_data: null },
  { tab_key: 'terceirizacao', kpi_key: 'dec-fav',       label: 'Favoráveis Fev/26',    value: '2',    unit: '',  trend_pct: null, sort_order: 3, chart_title: null, chart_data: null },
  { tab_key: 'terceirizacao', kpi_key: 'dec-desf',      label: 'Desfavoráveis Fev/26', value: '2',    unit: '',  trend_pct: null, sort_order: 4, chart_title: null, chart_data: null },
  { tab_key: 'terceirizacao', kpi_key: 'taxa-sucesso',  label: 'Taxa Sucesso',         value: '50,0', unit: '%', trend_pct: 50.0, sort_order: 5, chart_title: null, chart_data: null },

  /* ── MARKETPLACE ── */
  { tab_key: 'marketplace', kpi_key: 'total-ativos',  label: 'Total Ativos',          value: '9',   unit: '',  trend_pct: null, sort_order: 1, chart_title: null, chart_data: null },
  { tab_key: 'marketplace', kpi_key: 'pct-carteira',  label: '% da Carteira',         value: '0,7', unit: '%', trend_pct: null, sort_order: 2, chart_title: null, chart_data: null },
  { tab_key: 'marketplace', kpi_key: 'dec-fav',       label: 'Favoráveis Fev/26',     value: '0',   unit: '',  trend_pct: null, sort_order: 3, chart_title: null, chart_data: null },
  { tab_key: 'marketplace', kpi_key: 'dec-desf',      label: 'Desfavoráveis Fev/26',  value: '1',   unit: '',  trend_pct: null, sort_order: 4, chart_title: null, chart_data: null },
  { tab_key: 'marketplace', kpi_key: 'taxa-sucesso',  label: 'Taxa Sucesso Fev/26',   value: '0,0', unit: '%', trend_pct: 0,    sort_order: 5, chart_title: null, chart_data: null },
];

/* ═══════════════════════════════════════════════════════════
   CONTENT HTML POR ABA
═══════════════════════════════════════════════════════════ */
const contents = [
  {
    tabKey: 'visao-geral',
    contentHtml: `
<div class="analysis-section">
  <h3 style="font-family:'Playfair Display',serif;margin:0 0 16px">Análise — Fevereiro 2026</h3>
  <div class="g2" style="gap:12px;margin-bottom:14px">
    <div class="ibox info"><strong>Carteira Total:</strong> 1.383 processos ativos em 24 TRTs. +4 novas ações em fev/26 (1 OL · 1 Terc. · 1 Func. · 1 Nuvem).</div>
    <div class="ibox success"><strong>Melhora vs Jan/26:</strong> Taxa favorável subiu de 35,9% (jan) para 46,8% (fev) considerando 2026 acumulado.</div>
  </div>
  <div class="g3" style="gap:12px;margin-bottom:14px">
    <div class="ibox info"><strong>Distribuição Causa Raiz:</strong><br>☁ Nuvem: 605 (43,7%)<br>🚚 OL: 530 (38,3%)<br>👤 Ex-FL: 197 (14,2%)<br>🤝 Terc.: 41 (3,0%)<br>🏪 Mktpl.: 9 (0,7%)</div>
    <div class="ibox info"><strong>Sentenças (fev/26):</strong><br>Favoráveis: 3 (25,0%)<br>Desfavoráveis: 9<br>Total: 12</div>
    <div class="ibox info"><strong>Acórdãos (fev/26):</strong><br>Favoráveis: 19 (54,3%)<br>Desfavoráveis: 16<br>Total: 35</div>
  </div>
  <div class="ibox warn"><strong>Advocacia Adversa de Alta Recorrência:</strong> Nuvem → Polastri e Zattar · OL → Carmona e Catanhede · Ex-FL → FFA – Ferrareze e Freitas / Balbino Advogados</div>
</div>`,
  },
  {
    tabKey: 'nuvem',
    contentHtml: `
<div class="analysis-section">
  <h3 style="font-family:'Playfair Display',serif;margin:0 0 16px">Análise Nuvem — Fevereiro 2026</h3>
  <div class="g2" style="gap:12px;margin-bottom:14px">
    <div class="ibox success"><strong>Resultado Fev/26:</strong> 16 decisões · 9 acórdãos favoráveis (64,3% em 2ºG) · melhor segmento do mês.</div>
    <div class="ibox info"><strong>Tema 1291 STF:</strong> Processo suspenso (TRT-19, R$1M) — cenário favorável. Sem tribunal dominante em condenações.</div>
  </div>
  <table class="tbl" style="margin-bottom:14px">
    <thead><tr><th>Tipo</th><th>Favorável</th><th>Desfavorável</th><th>Total</th><th>Taxa Fav.</th></tr></thead>
    <tbody>
      <tr><td>Sentenças</td><td>0</td><td>2</td><td>2</td><td style="color:var(--red)">0,0%</td></tr>
      <tr><td>Acórdãos</td><td>9</td><td>5</td><td>14</td><td style="color:var(--green)">64,3%</td></tr>
      <tr style="font-weight:700"><td>Total Fev/26</td><td>9</td><td>7</td><td>16</td><td style="color:var(--green)">56,2%</td></tr>
    </tbody>
  </table>
  <div class="g2" style="gap:12px">
    <div class="ibox info"><strong>Panorama Sentenças:</strong> 3 Recursos Ordinários. TRTs ativos: TRT-3 (MG) e TRT-5 (BA). Cenário pulverizado.</div>
    <div class="ibox info"><strong>Panorama Acórdãos:</strong> 4 Recursos de Revista. TRTs: TRT-1 (RJ), TRT-5 (BA), TRT-7 (CE). Tema 1291 STF ativo.</div>
  </div>
</div>`,
  },
  {
    tabKey: 'op-logistico',
    contentHtml: `
<div class="analysis-section">
  <h3 style="font-family:'Playfair Display',serif;margin:0 0 16px">Análise Operador Logístico — Fevereiro 2026</h3>
  <div class="g2" style="gap:12px;margin-bottom:14px">
    <div class="ibox success"><strong>Melhora expressiva:</strong> Taxa passou de 9,1% (jan/26) para 50,0% (fev/26) — recuperação significativa.</div>
    <div class="ibox warn"><strong>Atenção em 1ºG:</strong> TRT-4 (RS) com maior volume de condenações em sentenças — foco crítico.</div>
  </div>
  <table class="tbl" style="margin-bottom:14px">
    <thead><tr><th>Tipo</th><th>Fav.</th><th>Desf.</th><th>Total</th><th>Taxa Fav.</th></tr></thead>
    <tbody>
      <tr><td>Sentenças</td><td>2</td><td>4</td><td>6</td><td style="color:var(--yellow)">33,3%</td></tr>
      <tr><td>Acórdãos</td><td>9</td><td>7</td><td>16</td><td style="color:var(--green)">56,3%</td></tr>
      <tr style="font-weight:700"><td>Total Fev/26</td><td>11</td><td>11</td><td>22</td><td style="color:var(--yellow)">50,0%</td></tr>
    </tbody>
  </table>
  <div class="g2" style="gap:12px;margin-bottom:14px">
    <div class="ibox danger"><strong>⚠ TRT-1 (RJ) 7ª Turma:</strong> Mais recorrente em acórdãos desfavoráveis. Relatoras: Des. Sayonara Grillo e Des. Giselle Bondim. Monitoramento intensivo.</div>
    <div class="ibox warn"><strong>⚠ TRT-4 (RS) 1ºG:</strong> Maior volume de condenações em sentenças. 13 ROs e 15 RRs analisados jan–fev/26. Priorizar argumento de ausência de culpa in vigilando.</div>
  </div>
  <div class="ibox danger"><strong>⚠ Alerta Crítico:</strong> 6 OLs identificadas como inativas na carteira — risco crítico de execução direta do iFood.</div>
  <div style="margin-top:14px">
    <div style="font-weight:700;margin-bottom:8px;font-size:12px">Súmula 331 TST — Critérios de Defesa</div>
    <div class="mrow"><div class="mrow-lbl">Fiscalização regular do contrato com a OL</div><span class="badge bg">68% sucesso</span></div>
    <div class="mrow"><div class="mrow-lbl">Ausência de culpa in vigilando comprovada</div><span class="badge bg">62% sucesso</span></div>
    <div class="mrow"><div class="mrow-lbl">OL solvente e ativa no momento da condenação</div><span class="badge by">55% sucesso</span></div>
    <div class="mrow"><div class="mrow-lbl">Contrato com cláusulas trabalhistas</div><span class="badge by">40% sucesso</span></div>
    <div class="mrow"><div class="mrow-lbl">OL inativa — risco de responsabilização direta</div><span class="badge br">12% sucesso</span></div>
  </div>
</div>`,
  },
  {
    tabKey: 'ex-foodlover',
    contentHtml: `
<div class="analysis-section">
  <h3 style="font-family:'Playfair Display',serif;margin:0 0 16px">Análise Ex-Foodlover — Fevereiro 2026</h3>
  <div class="g2" style="gap:12px;margin-bottom:14px">
    <div class="ibox warn"><strong>Cenário predominantemente desfavorável</strong> ao iFood nas ações de horas extras. O Tema 1.046 do STF é sistematicamente ignorado ou rejeitado pelos julgadores de 1º e 2º grau.</div>
    <div class="ibox danger"><strong>Dado Crítico:</strong> Dos 86 processos analisados, apenas 5 decisões (&lt;6%) citaram o Tema 1.046 e foram favoráveis. Principal barreira: constatação de controle indireto de jornada via Salesforce, GPS, reuniões e Slack.</div>
  </div>
  <div class="g2" style="gap:12px;margin-bottom:14px">
    <div style="background:rgba(232,0,45,.07);border-left:3px solid var(--red);border-radius:0 8px 8px 0;padding:12px;font-size:12px">
      <strong>TRTs Mais Desfavoráveis:</strong><br>
      🔴 TRT-2 (SP) — maior volume desfavorável<br>
      🔴 TRT-3 (MG) — 5 citações, todas rejeitando<br>
      🔴 TRT-15 (Campinas) — padrão restritivo consistente
    </div>
    <div style="background:rgba(27,122,78,.07);border-left:3px solid var(--green);border-radius:0 8px 8px 0;padding:12px;font-size:12px">
      <strong>TRTs Mais Favoráveis:</strong><br>
      🟢 TRT-7 (CE) — único com 100% fav. em 2ºG<br>
      🟢 TRT-11 (AM) — receptivo à tese<br>
      🟢 TRT-20 (SE) — postura favorável
    </div>
  </div>
  <div class="ibox info"><strong>⚡ Recomendação Estratégica:</strong> A estratégia defensiva deve ir além da mera invocação do Tema 1.046 e focar na PROVA da ausência de controle de jornada. Descaracterizar o Salesforce/GPS como instrumento de controle de horário, diferenciando registro de atividade de controle de jornada.</div>
  <div style="margin-top:14px">
    <div style="font-weight:700;margin-bottom:8px;font-size:12px">Casos Paradigma Favoráveis</div>
    <div class="ibox success" style="margin-bottom:8px;font-size:11px"><strong>1000486-61.2024.5.02.0384 · TRT-2 (SP)</strong> — Juiz Marcio F. Teixeira — Aplicou Tema 1.046 para validar norma coletiva com controle de ponto por exceção.</div>
    <div class="ibox success" style="margin-bottom:8px;font-size:11px"><strong>1001247-47.2025.5.02.0032 · TRT-2 (SP)</strong> — Juíza Caroline Menegaz — Aplicou Tema 1.046 com art. 7º, XXVI CF. Validou CCTs de isenção de controle de jornada.</div>
    <div class="ibox success" style="font-size:11px"><strong>0000212-46.2024.5.07.0006 · TRT-7 (CE)</strong> — Des. Maria Roseli M. Alencar — Reformou sentença. Acolheu trabalho externo (art. 62, I).</div>
  </div>
</div>`,
  },
  {
    tabKey: 'terceirizacao',
    contentHtml: `
<div class="analysis-section">
  <h3 style="font-family:'Playfair Display',serif;margin:0 0 16px">Análise Terceirização — Fevereiro 2026</h3>
  <div class="g2" style="gap:12px;margin-bottom:14px">
    <div class="ibox info"><strong>Volume:</strong> 41 ativos (3,0% da carteira). Menor segmento tradicional. 2 fav. + 2 desf. em fev/26 = 50% de sucesso.</div>
    <div class="ibox warn"><strong>Amostra pequena</strong> — sem tendência consolidada. 1 acórdão desfavorável em fev/26 (TRT-2). Monitoramento pontual suficiente.</div>
  </div>
  <div style="font-size:12px;line-height:1.9">
    <div class="mrow"><div class="mrow-lbl">TRT-2 (SP) — dominante</div><span class="badge bg">maior vol.</span></div>
    <div class="mrow"><div class="mrow-lbl">TRT-15 (Campinas)</div><span class="badge bg">2ª maior</span></div>
    <div class="mrow"><div class="mrow-lbl">TRT-16 (MA) — Ex-Empr.</div><span class="badge bb">menor vol.</span></div>
    <div class="mrow"><div class="mrow-lbl">TRT-17 (ES) — Ex-Empr.</div><span class="badge bb">menor vol.</span></div>
  </div>
</div>`,
  },
  {
    tabKey: 'marketplace',
    contentHtml: `
<div class="analysis-section">
  <h3 style="font-family:'Playfair Display',serif;margin:0 0 16px">Análise Marketplace — Fevereiro 2026</h3>
  <div class="ibox info" style="margin-bottom:12px"><strong>Segmento em crescimento:</strong> +2 novas ações em fev/26. Composição: 7 Entregadores + 2 Restaurantes. Monitoramento pontual suficiente.</div>
  <div class="g2" style="gap:12px">
    <div class="ibox warn"><strong>Resultado Fev/26:</strong> 1 acórdão desfavorável (TRT-1, RJ). Taxa: 0,0% — amostra de 1 decisão, sem tendência consolidada.</div>
    <div class="ibox info"><strong>Volume:</strong> 9 ativos (0,7% da carteira). Menor segmento da carteira.</div>
  </div>
</div>`,
  },
  {
    tabKey: 'destaques',
    contentHtml: `
<div class="analysis-section">
  <div class="ibox info" style="margin-bottom:20px"><strong>Fevereiro 2026 — 6 casos em destaque</strong> · THL Entregas em monitoramento contínuo · Tema 1291 STF suspenso (R$1M)</div>
</div>`,
  },
];

/* ═══════════════════════════════════════════════════════════
   DESTAQUES (Casos em Destaque)
═══════════════════════════════════════════════════════════ */
const highlights = [
  {
    icon: '⚖️',
    title: 'Arismaria Carneiro Santos — Laudo Pericial Favorável',
    body: 'Nuvem · TRT-19 (AL) · Laudo pericial reconheceu que não há subordinação típica na relação com entregador cadastrado na plataforma. Resultado favorável em 1ª instância — improcedência do pedido de vínculo.',
    sortOrder: 1,
  },
  {
    icon: '✅',
    title: 'Ramom Bretas Dias — Horas Extras Improcedentes',
    body: 'Ex-Foodlover · TRT-2 (SP) · Pedidos de horas extras integralmente improcedentes. Tema 1.046 STF aplicado. Justa causa por manipulação de metas (geração de pedidos artificiais) mantida.',
    sortOrder: 2,
  },
  {
    icon: '⏳',
    title: 'Sinval de Praga Cruz Alves — Aguardando Sentença',
    body: 'Operador Logístico · TRT-4 (RS) · Processo em fase de instrução processual. Responsabilidade subsidiária contestada: OL solvente e ativa. Sentença aguardada com perspectiva favorável.',
    sortOrder: 3,
  },
  {
    icon: '🏢',
    title: 'THL Entregas — Monitoramento Contínuo (3 Casos)',
    body: 'Operador Logístico · TRT-1 (RJ), TRT-4 (RS), TRT-15 (SP) · 3 processos ativos envolvendo a mesma OL. Monitoramento conjunto pelo risco de execução solidária. OL ativa e solvente — risco moderado.',
    sortOrder: 4,
  },
  {
    icon: '⚠️',
    title: 'OL Acidente — Responsabilidade Solidária R$ 150k',
    body: 'Operador Logístico · TRT-2 (SP) · Entregador sofreu acidente em serviço. Pleito de R$ 150.000 em danos morais e materiais. OL co-ré. Risco de responsabilidade solidária do iFood — atenção máxima.',
    sortOrder: 5,
  },
  {
    icon: '🚨',
    title: 'Morte Entregador Nuvem — TRT-19 — R$ 1M Suspenso',
    body: 'Nuvem · TRT-19 (AL) · Processo envolvendo morte de entregador cadastrado na plataforma. Condenação de R$ 1.000.000 em 1ª instância. Recurso provido — processo suspenso via Tema 1291 STF. Cenário favorável em 2ºG.',
    sortOrder: 6,
  },
];

/* ═══════════════════════════════════════════════════════════
   SEED PRINCIPAL
═══════════════════════════════════════════════════════════ */
async function seed() {
  console.log(`\n🌱  Iniciando seed — Fevereiro 2026`);
  console.log(`🔗  API: ${API_URL}\n`);

  // 1. Criar período
  console.log('📅  Criando período...');
  try {
    const p = await post('/api/ifood/periods', period);
    console.log(`   ✅  Período criado: ${p.id || p.label || JSON.stringify(p)}`);
  } catch (e) {
    if (e.message.includes('409') || e.message.toLowerCase().includes('unique') || e.message.toLowerCase().includes('already exists')) {
      console.log(`   ⚠️   Período já existe — continuando...`);
    } else {
      throw e;
    }
  }

  // 2. Limpar KPIs anteriores e reinserir
  console.log(`\n📊  Limpando KPIs anteriores...`);
  await del(`/api/ifood/kpis/by-period/${PERIOD_ID}`);
  console.log(`   ✅  KPIs antigos removidos`);

  console.log(`   Importando ${kpis.length} KPIs...`);
  const kpisPayload = kpis.map(k => ({ ...k, id: `${PERIOD_ID}-${k.tab_key}-${k.kpi_key}`, period_id: PERIOD_ID }));
  await post('/api/ifood/kpis/bulk', { rows: kpisPayload });
  console.log(`   ✅  ${kpis.length} KPIs importados`);

  // 3. Content por aba
  console.log(`\n📝  Importando conteúdo de ${contents.length} abas...`);
  for (const c of contents) {
    await post('/api/ifood/content', {
      id: `${PERIOD_ID}-${c.tabKey}`,
      period_id: PERIOD_ID,
      tab_key: c.tabKey,
      content_html: c.contentHtml.trim(),
    });
    console.log(`   ✅  Aba ${c.tabKey}`);
  }

  // 4. Destaques
  console.log(`\n⭐  Importando ${highlights.length} casos em destaque...`);
  await post('/api/ifood/highlights/replace', {
    periodId: PERIOD_ID,
    rows: highlights.map((h, i) => ({ ...h, id: `${PERIOD_ID}-hl-${i + 1}` })),
  });
  console.log(`   ✅  ${highlights.length} destaques importados`);

  console.log(`\n✅  Seed completo! Período "${period.label}" disponível no dashboard.\n`);
}

seed().catch(err => {
  console.error('\n❌  Erro durante o seed:\n', err.message);
  process.exit(1);
});
