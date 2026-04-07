-- FALAW ADVOGADOS — iFood BI Dashboard — Seed: Fevereiro 2026
-- Execute no SQL Editor do Supabase: Database > SQL Editor
-- Pré-requisito: supabase-ifood.sql já executado

-- ────────────────────────────────────────────────────────────────────────────────
-- 1. PERÍODO
-- ────────────────────────────────────────────────────────────────────────────────
INSERT INTO ifood_periods (id, label, month_year, is_active)
VALUES ('fev-2026', 'Fevereiro 2026', '2026-02', TRUE)
ON CONFLICT (id) DO UPDATE
  SET label      = EXCLUDED.label,
      month_year = EXCLUDED.month_year,
      is_active  = EXCLUDED.is_active;

-- ────────────────────────────────────────────────────────────────────────────────
-- 2. KPIs — VISÃO GERAL
-- ────────────────────────────────────────────────────────────────────────────────
INSERT INTO ifood_kpis (id, period_id, tab_key, kpi_key, label, value, unit, trend_pct, sort_order, chart_data, chart_title) VALUES

('fev2026-vg-1', 'fev-2026', 'visao-geral', 'processos_ativos',
 'Processos Ativos', '1.383', 'processos', NULL, 1,
 '{"type":"doughnut","data":{"labels":["Nuvem","Op. Logístico","Ex-Foodlover","Terceirização","Marketplace"],"datasets":[{"data":[605,530,197,41,9],"backgroundColor":["#7B1A2E","#0D2B5E","#0F9E76","#E67E22","#8E44AD"],"borderWidth":0}]},"options":{"plugins":{"legend":{"position":"bottom"}}}}',
 'Distribuição por Vertical'),

('fev2026-vg-2', 'fev-2026', 'visao-geral', 'processos_encerrados',
 'Processos Encerrados', '1.401', 'processos', NULL, 2,
 NULL, ''),

('fev2026-vg-3', 'fev-2026', 'visao-geral', 'decisoes_favoraveis',
 'Decisões Favoráveis', '22', '46,8% das decisões', 2.1, 3,
 '{"type":"doughnut","data":{"labels":["Favoráveis","Desfavoráveis"],"datasets":[{"data":[22,25],"backgroundColor":["#0F9E76","#7B1A2E"],"borderWidth":0}]},"options":{"plugins":{"legend":{"position":"bottom"}}}}',
 'Decisões do Mês — Fevereiro 2026'),

('fev2026-vg-4', 'fev-2026', 'visao-geral', 'decisoes_desfavoraveis',
 'Decisões Desfavoráveis', '25', '53,2% das decisões', -1.8, 4,
 NULL, ''),

('fev2026-vg-5', 'fev-2026', 'visao-geral', 'novas_acoes',
 'Novas Ações', '4', 'ações distribuídas', NULL, 5,
 NULL, '')

ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label, value = EXCLUDED.value, unit = EXCLUDED.unit,
      trend_pct = EXCLUDED.trend_pct, sort_order = EXCLUDED.sort_order,
      chart_data = EXCLUDED.chart_data, chart_title = EXCLUDED.chart_title;

-- ────────────────────────────────────────────────────────────────────────────────
-- 3. KPIs — NUVEM
-- ────────────────────────────────────────────────────────────────────────────────
INSERT INTO ifood_kpis (id, period_id, tab_key, kpi_key, label, value, unit, trend_pct, sort_order, chart_data, chart_title) VALUES

('fev2026-nv-1', 'fev-2026', 'nuvem', 'processos_ativos',
 'Processos Ativos', '605', 'processos', NULL, 1,
 NULL, ''),

('fev2026-nv-2', 'fev-2026', 'nuvem', 'decisoes_favoraveis',
 'Decisões Favoráveis', '9', '56,2%', 3.5, 2,
 '{"type":"doughnut","data":{"labels":["Favoráveis","Desfavoráveis"],"datasets":[{"data":[9,7],"backgroundColor":["#0F9E76","#7B1A2E"],"borderWidth":0}]},"options":{"plugins":{"legend":{"position":"bottom"}}}}',
 'Decisões Nuvem — Fev/2026'),

('fev2026-nv-3', 'fev-2026', 'nuvem', 'decisoes_desfavoraveis',
 'Decisões Desfavoráveis', '7', '43,8%', -2.1, 3,
 NULL, ''),

('fev2026-nv-4', 'fev-2026', 'nuvem', 'total_decisoes',
 'Total de Decisões', '16', 'decisões no mês', NULL, 4,
 NULL, '')

ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label, value = EXCLUDED.value, unit = EXCLUDED.unit,
      trend_pct = EXCLUDED.trend_pct, sort_order = EXCLUDED.sort_order,
      chart_data = EXCLUDED.chart_data, chart_title = EXCLUDED.chart_title;

-- ────────────────────────────────────────────────────────────────────────────────
-- 4. KPIs — OPERAÇÃO LOGÍSTICA
-- ────────────────────────────────────────────────────────────────────────────────
INSERT INTO ifood_kpis (id, period_id, tab_key, kpi_key, label, value, unit, trend_pct, sort_order, chart_data, chart_title) VALUES

('fev2026-ol-1', 'fev-2026', 'op-logistico', 'processos_ativos',
 'Processos Ativos', '530', 'processos', NULL, 1,
 NULL, ''),

('fev2026-ol-2', 'fev-2026', 'op-logistico', 'decisoes_favoraveis',
 'Decisões Favoráveis', '11', '50,0%', 0.0, 2,
 '{"type":"doughnut","data":{"labels":["Favoráveis","Desfavoráveis"],"datasets":[{"data":[11,11],"backgroundColor":["#0F9E76","#7B1A2E"],"borderWidth":0}]},"options":{"plugins":{"legend":{"position":"bottom"}}}}',
 'Decisões Op. Logístico — Fev/2026'),

('fev2026-ol-3', 'fev-2026', 'op-logistico', 'decisoes_desfavoraveis',
 'Decisões Desfavoráveis', '11', '50,0%', 1.2, 3,
 NULL, ''),

('fev2026-ol-4', 'fev-2026', 'op-logistico', 'total_decisoes',
 'Total de Decisões', '22', 'decisões no mês', NULL, 4,
 NULL, '')

ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label, value = EXCLUDED.value, unit = EXCLUDED.unit,
      trend_pct = EXCLUDED.trend_pct, sort_order = EXCLUDED.sort_order,
      chart_data = EXCLUDED.chart_data, chart_title = EXCLUDED.chart_title;

-- ────────────────────────────────────────────────────────────────────────────────
-- 5. KPIs — EX-FOODLOVER
-- ────────────────────────────────────────────────────────────────────────────────
INSERT INTO ifood_kpis (id, period_id, tab_key, kpi_key, label, value, unit, trend_pct, sort_order, chart_data, chart_title) VALUES

('fev2026-ef-1', 'fev-2026', 'ex-foodlover', 'processos_ativos',
 'Processos Ativos', '197', 'processos', NULL, 1,
 NULL, ''),

('fev2026-ef-2', 'fev-2026', 'ex-foodlover', 'decisoes_favoraveis',
 'Decisões Favoráveis', '2', '33,3%', -4.2, 2,
 '{"type":"doughnut","data":{"labels":["Favoráveis","Desfavoráveis"],"datasets":[{"data":[2,4],"backgroundColor":["#0F9E76","#7B1A2E"],"borderWidth":0}]},"options":{"plugins":{"legend":{"position":"bottom"}}}}',
 'Decisões Ex-Foodlover — Fev/2026'),

('fev2026-ef-3', 'fev-2026', 'ex-foodlover', 'decisoes_desfavoraveis',
 'Decisões Desfavoráveis', '4', '66,7%', 4.2, 3,
 NULL, ''),

('fev2026-ef-4', 'fev-2026', 'ex-foodlover', 'total_decisoes',
 'Total de Decisões', '6', 'decisões no mês', NULL, 4,
 NULL, '')

ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label, value = EXCLUDED.value, unit = EXCLUDED.unit,
      trend_pct = EXCLUDED.trend_pct, sort_order = EXCLUDED.sort_order,
      chart_data = EXCLUDED.chart_data, chart_title = EXCLUDED.chart_title;

-- ────────────────────────────────────────────────────────────────────────────────
-- 6. KPIs — TERCEIRIZAÇÃO
-- ────────────────────────────────────────────────────────────────────────────────
INSERT INTO ifood_kpis (id, period_id, tab_key, kpi_key, label, value, unit, trend_pct, sort_order, chart_data, chart_title) VALUES

('fev2026-tc-1', 'fev-2026', 'terceirizacao', 'processos_ativos',
 'Processos Ativos', '41', 'processos', NULL, 1,
 NULL, ''),

('fev2026-tc-2', 'fev-2026', 'terceirizacao', 'decisoes_favoraveis',
 'Decisões Favoráveis', '2', '50,0%', 5.0, 2,
 '{"type":"doughnut","data":{"labels":["Favoráveis","Desfavoráveis"],"datasets":[{"data":[2,2],"backgroundColor":["#0F9E76","#7B1A2E"],"borderWidth":0}]},"options":{"plugins":{"legend":{"position":"bottom"}}}}',
 'Decisões Terceirização — Fev/2026'),

('fev2026-tc-3', 'fev-2026', 'terceirizacao', 'decisoes_desfavoraveis',
 'Decisões Desfavoráveis', '2', '50,0%', -2.5, 3,
 NULL, ''),

('fev2026-tc-4', 'fev-2026', 'terceirizacao', 'total_decisoes',
 'Total de Decisões', '4', 'decisões no mês', NULL, 4,
 NULL, '')

ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label, value = EXCLUDED.value, unit = EXCLUDED.unit,
      trend_pct = EXCLUDED.trend_pct, sort_order = EXCLUDED.sort_order,
      chart_data = EXCLUDED.chart_data, chart_title = EXCLUDED.chart_title;

-- ────────────────────────────────────────────────────────────────────────────────
-- 7. KPIs — MARKETPLACE
-- ────────────────────────────────────────────────────────────────────────────────
INSERT INTO ifood_kpis (id, period_id, tab_key, kpi_key, label, value, unit, trend_pct, sort_order, chart_data, chart_title) VALUES

('fev2026-mp-1', 'fev-2026', 'marketplace', 'processos_ativos',
 'Processos Ativos', '9', 'processos', NULL, 1,
 NULL, ''),

('fev2026-mp-2', 'fev-2026', 'marketplace', 'decisoes_favoraveis',
 'Decisões Favoráveis', '0', '0,0%', NULL, 2,
 '{"type":"doughnut","data":{"labels":["Favoráveis","Desfavoráveis"],"datasets":[{"data":[0,1],"backgroundColor":["#0F9E76","#7B1A2E"],"borderWidth":0}]},"options":{"plugins":{"legend":{"position":"bottom"}}}}',
 'Decisões Marketplace — Fev/2026'),

('fev2026-mp-3', 'fev-2026', 'marketplace', 'decisoes_desfavoraveis',
 'Decisões Desfavoráveis', '1', '100,0%', NULL, 3,
 NULL, ''),

('fev2026-mp-4', 'fev-2026', 'marketplace', 'total_decisoes',
 'Total de Decisões', '1', 'decisão no mês', NULL, 4,
 NULL, '')

ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label, value = EXCLUDED.value, unit = EXCLUDED.unit,
      trend_pct = EXCLUDED.trend_pct, sort_order = EXCLUDED.sort_order,
      chart_data = EXCLUDED.chart_data, chart_title = EXCLUDED.chart_title;

-- ────────────────────────────────────────────────────────────────────────────────
-- 8. KPIs — METAS 2025
-- chart_data aqui usa formato especial: { pct, current, target }
-- renderMetas() lê pct para a barra de progresso
-- ────────────────────────────────────────────────────────────────────────────────
INSERT INTO ifood_kpis (id, period_id, tab_key, kpi_key, label, value, unit, trend_pct, sort_order, chart_data, chart_title) VALUES

('fev2026-mt-1', 'fev-2026', 'metas', 'improcedencia_1g',
 'Improcedência 1ª Instância', '169', 'de 315 decisões', NULL, 1,
 '{"pct":53.7,"current":"169","target":"315"}',
 'Meta: Improcedência 1G'),

('fev2026-mt-2', 'fev-2026', 'metas', 'acordaos_favoraveis',
 'Acórdãos Favoráveis', '318', 'de 241 (meta superada)', NULL, 2,
 '{"pct":100,"current":"318","target":"241"}',
 'Meta: Acórdãos Favoráveis'),

('fev2026-mt-3', 'fev-2026', 'metas', 'processos_arquivados',
 'Processos Arquivados', '674', 'de 59 (meta superada)', NULL, 3,
 '{"pct":100,"current":"674","target":"59"}',
 'Meta: Processos Arquivados')

ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label, value = EXCLUDED.value, unit = EXCLUDED.unit,
      trend_pct = EXCLUDED.trend_pct, sort_order = EXCLUDED.sort_order,
      chart_data = EXCLUDED.chart_data, chart_title = EXCLUDED.chart_title;

-- ────────────────────────────────────────────────────────────────────────────────
-- 9. CONTEÚDO TEXTUAL — UMA ANÁLISE POR ABA
-- ────────────────────────────────────────────────────────────────────────────────
INSERT INTO ifood_content (id, period_id, tab_key, content_html) VALUES

('fev2026-cnt-vg', 'fev-2026', 'visao-geral', '<div class="analysis-block">
<h3>Análise — Fevereiro 2026</h3>
<p>Em fevereiro de 2026, o contencioso iFood encerra o mês com <strong>1.383 processos ativos</strong> distribuídos entre as cinco verticais de negócio, e <strong>1.401 processos encerrados</strong> no histórico acumulado.</p>
<p>Foram proferidas <strong>47 decisões</strong> ao longo do mês: 22 favoráveis (46,8%) e 25 desfavoráveis (53,2%). Apesar do resultado ligeiramente negativo neste ciclo, a tendência histórica de êxito mantém-se dentro da faixa esperada para demandas trabalhistas de alta volumetria.</p>
<p>A distribuição do acervo ativo concentra-se na <strong>Nuvem</strong> (605 processos, 43,7%) e na <strong>Operação Logística</strong> (530 processos, 38,3%), que juntas representam 82% do total. O segmento <strong>Ex-Foodlover</strong> contabiliza 197 processos (14,2%), seguido por <strong>Terceirização</strong> (41) e <strong>Marketplace</strong> (9).</p>
<p>Foram distribuídas <strong>4 novas ações</strong> no período, indicando estabilidade no fluxo de entrada de demandas.</p>
</div>'),

('fev2026-cnt-nv', 'fev-2026', 'nuvem', '<div class="analysis-block">
<h3>Nuvem — Análise Fevereiro 2026</h3>
<p>A vertical Nuvem apresentou em fevereiro o melhor desempenho decisional do período, com <strong>taxa de êxito de 56,2%</strong> (9 favoráveis em 16 decisões). Este resultado supera a média geral do mês e demonstra a solidez da estratégia de defesa adotada para esta categoria de trabalhadores.</p>
<p>O acervo ativo de <strong>605 processos</strong> mantém-se estável, com baixo fluxo de novas distribuições em relação ao volume total. A concentração geográfica nos tribunais do Sudeste exige atenção contínua às pautas de julgamento, especialmente nas câmaras especializadas em trabalho em plataformas digitais.</p>
<p>A tese de não-caracterização do vínculo empregatício segue sendo acolhida em mais da metade dos julgamentos, resultado expressivo frente à jurisprudência em evolução sobre o tema.</p>
</div>'),

('fev2026-cnt-ol', 'fev-2026', 'op-logistico', '<div class="analysis-block">
<h3>Operação Logística — Análise Fevereiro 2026</h3>
<p>A Operação Logística registrou <strong>22 decisões em fevereiro</strong>, com resultado equilibrado de 50% favoráveis e 50% desfavoráveis (11 x 11). Este equilíbrio reflete a complexidade das demandas desta vertical, que envolve parceiros logísticos com diferentes vínculos contratuais.</p>
<p>O acervo de <strong>530 processos ativos</strong> consolida esta vertical como a segunda maior do contencioso iFood, demandando gestão estratégica das audiências e controle rigoroso dos prazos recursais.</p>
<p>Destaca-se a necessidade de acompanhamento mais próximo dos processos em fase recursal, onde a reversão de decisões desfavoráveis de primeiro grau representa oportunidade de melhoria no índice de êxito global desta vertical.</p>
</div>'),

('fev2026-cnt-ef', 'fev-2026', 'ex-foodlover', '<div class="analysis-block">
<h3>Ex-Foodlover — Análise Fevereiro 2026</h3>
<p>A vertical Ex-Foodlover apresentou em fevereiro resultado decisional abaixo da média, com <strong>taxa de êxito de 33,3%</strong> (2 favoráveis em 6 decisões). Este dado merece atenção estratégica, considerando o perfil diferenciado das demandas desta categoria, que frequentemente envolvem pedidos de vínculo cumulados com verbas rescisórias.</p>
<p>O acervo de <strong>197 processos ativos</strong> posiciona esta vertical como a terceira maior, com perspectiva de redução gradual à medida que o programa Foodlover encerrou suas operações. A tendência é de diminuição natural do estoque ao longo de 2026 com o encerramento dos processos em curso.</p>
<p>Recomenda-se análise qualitativa das causas das decisões desfavoráveis neste mês para identificar eventuais padrões de fundamentação que possam orientar ajustes na estratégia de defesa.</p>
</div>'),

('fev2026-cnt-tc', 'fev-2026', 'terceirizacao', '<div class="analysis-block">
<h3>Terceirização — Análise Fevereiro 2026</h3>
<p>A vertical Terceirização apresentou <strong>4 decisões em fevereiro</strong>, com resultado equilibrado de 50% favoráveis (2 x 2). O acervo de <strong>41 processos ativos</strong> configura a menor das verticais operacionais, com demandas tipicamente de maior complexidade envolvendo responsabilidade subsidiária e solidária.</p>
<p>O volume reduzido de decisões no mês é compatível com o tamanho do acervo. As teses envolvendo tomadores de serviço e prestadoras terceirizadas exigem estratégia individualizada por contrato e por empresa contratada.</p>
<p>O monitoramento das decisões do TST sobre terceirização no setor de tecnologia e plataformas digitais é essencial para antecipar mudanças de posicionamento dos Tribunais Regionais.</p>
</div>'),

('fev2026-cnt-mp', 'fev-2026', 'marketplace', '<div class="analysis-block">
<h3>Marketplace — Análise Fevereiro 2026</h3>
<p>A vertical Marketplace registrou <strong>1 decisão desfavorável</strong> em fevereiro, com acervo de <strong>9 processos ativos</strong>. O volume reduzido reflete o perfil desta vertical, cujas demandas envolvem principalmente restaurantes parceiros e lojistas da plataforma.</p>
<p>Embora o resultado isolado do mês seja desfavorável, a baixa volumetria impede conclusões estatisticamente relevantes. O acompanhamento trimestral desta vertical é suficiente para detectar tendências, salvo em caso de aumento inesperado de distribuições.</p>
<p>Recomenda-se atenção aos novos tipos de demanda surgidos com a expansão dos serviços de entrega não-alimentar no Marketplace, que podem gerar novas teses jurídicas ainda não consolidadas nos tribunais.</p>
</div>'),

('fev2026-cnt-mt', 'fev-2026', 'metas', '<div class="analysis-block">
<h3>Metas 2025 — Status em Fevereiro 2026</h3>
<p>O acompanhamento das metas estratégicas de 2025 demonstra desempenho <strong>acima do esperado</strong> em dois dos três indicadores monitorados.</p>
<ul>
  <li><strong>Improcedência 1ª Instância:</strong> 169 decisões favoráveis de um total de 315 analisadas (53,7%). Meta em progresso dentro do ritmo esperado.</li>
  <li><strong>Acórdãos Favoráveis:</strong> <span style="color:#0F9E76;font-weight:600;">318 acórdãos favoráveis obtidos</span>, superando em 31,9% a meta de 241. Resultado excepcional que reflete a qualidade das peças recursais e a expertise da equipe em segunda instância.</li>
  <li><strong>Processos Arquivados:</strong> <span style="color:#0F9E76;font-weight:600;">674 arquivamentos</span> contra meta de 59, representando 1.142% de superação. Este resultado expressivo decorre do esforço de saneamento do acervo e do acompanhamento proativo das extinções por abandono e prescrição.</li>
</ul>
<p>O conjunto dos indicadores posiciona a equipe Falaw com desempenho muito acima do contratado, consolidando a parceria estratégica com o iFood no contencioso trabalhista.</p>
</div>')

ON CONFLICT (period_id, tab_key) DO UPDATE
  SET content_html = EXCLUDED.content_html,
      updated_at   = NOW();

-- ────────────────────────────────────────────────────────────────────────────────
-- 10. DESTAQUES DO MÊS
-- ────────────────────────────────────────────────────────────────────────────────
INSERT INTO ifood_highlights (id, period_id, icon, title, body, sort_order) VALUES

('fev2026-hl-1', 'fev-2026', '🏆',
 'Acórdãos Favoráveis: 131,9% da Meta',
 '318 acórdãos favoráveis obtidos no acumulado, superando em 31,9% a meta anual de 241. Resultado excepcional que demonstra a excelência das peças recursais da equipe Falaw.',
 1),

('fev2026-hl-2', 'fev-2026', '📁',
 'Arquivamentos: 1.142% da Meta',
 '674 processos arquivados frente à meta de 59, resultado de esforço contínuo no saneamento do acervo e acompanhamento proativo de extinções.',
 2),

('fev2026-hl-3', 'fev-2026', '✅',
 'Nuvem com Melhor Taxa de Êxito',
 'Taxa de 56,2% de decisões favoráveis na vertical Nuvem em fevereiro — melhor desempenho entre todas as verticais no período.',
 3),

('fev2026-hl-4', 'fev-2026', '⚖️',
 'Op. Logístico: Equilíbrio nas Decisões',
 '11 decisões favoráveis e 11 desfavoráveis na Operação Logística — resultado em linha com a média histórica desta vertical de alta complexidade.',
 4),

('fev2026-hl-5', 'fev-2026', '📊',
 '47 Decisões em Fevereiro',
 'Total de 47 decisões proferidas no mês, com 22 favoráveis (46,8%) e 25 desfavoráveis (53,2%), em linha com o padrão histórico do contencioso.',
 5),

('fev2026-hl-6', 'fev-2026', '🎯',
 'Improcedência 1G: 53,7% da Meta',
 '169 decisões de improcedência em 1ª instância registradas no acumulado, com meta de 315 para o ano. Progresso consistente com o ritmo esperado.',
 6)

ON CONFLICT (id) DO UPDATE
  SET icon = EXCLUDED.icon, title = EXCLUDED.title,
      body = EXCLUDED.body, sort_order = EXCLUDED.sort_order;
