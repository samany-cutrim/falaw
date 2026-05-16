/**
 * background.js — Service Worker da extensão Falaw Sync PJe
 * Orquestra a abertura silenciosa de abas PJe, scraping e envio ao Supabase.
 */

const SB_URL   = 'https://yleofidqkimeanpuothv.supabase.co';
const SB_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsZW9maWRxa2ltZWFucHVvdGh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQ3Njc1MiwiZXhwIjoyMDkwMDUyNzUyfQ.j5ORA0kTEogVuzsDHh3YvneWrZMVKqyFRCkUjo7EF1k';
const SB_TABLE = 'pauta_audiencias';

// ── TRTs + graus + TST ────────────────────────────────────────────────────────
// PJe-kz: interface unificada (mostra 1º e 2º grau na mesma pauta se o advogado tiver)
// Para TRTs que ainda usam sistema legado, adicionamos URLs separadas por grau
const TARGETS = [
  // PJe-kz (1º+2º grau na mesma tela) — maioria dos TRTs
  ...Array.from({length: 24}, (_, i) => ({
    id:   `TRT${i+1}-kz`,
    trt:  `TRT-${i+1}`,
    grau: 'pjekz',
    url:  `https://pje.trt${i+1}.jus.br/pjekz/pauta-usuarios-externos`,
  })),
  // 2º grau legado — URLs alternativas (scraper tenta, pula se redirecionar para login)
  ...Array.from({length: 24}, (_, i) => ({
    id:   `TRT${i+1}-2g`,
    trt:  `TRT-${i+1}`,
    grau: '2grau',
    url:  `https://pje.trt${i+1}.jus.br/segundograu/pauta-usuarios-externos`,
  })),
  // TST
  { id: 'TST-kz',  trt: 'TST', grau: 'pjekz', url: 'https://pje.tst.jus.br/pjekz/pauta-usuarios-externos' },
  { id: 'TST-1g',  trt: 'TST', grau: '1grau',  url: 'https://pje.tst.jus.br/primeirograu/pauta-usuarios-externos' },
];

// ── Estado da sincronização ───────────────────────────────────────────────────
let syncState = {
  running:   false,
  total:     0,
  done:      0,
  erros:     [],
  audiencias: 0,
  cancelados: 0,
  adminTabId: null,
};

// ── Listener de mensagens ─────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FALAW_START_SYNC') {
    if (syncState.running) {
      sendResponse({ ok: false, msg: 'Sincronização já em andamento…' });
      return true;
    }
    syncState.adminTabId = sender.tab?.id ?? null;
    startSync();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'FALAW_SYNC_STATUS') {
    sendResponse({ ...syncState });
    return true;
  }
  if (msg.type === 'FALAW_PAGE_DATA') {
    // Dados coletados pelo scraper content script
    handlePageData(msg.target, msg.rows, msg.authenticated);
    return true;
  }
});

// ── Alarmes (coleta automática 08h e 18h) ────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'falaw-sync-manha' || alarm.name === 'falaw-sync-tarde') {
    if (!syncState.running) startSync();
  }
});

// Configura alarmes ao instalar/ativar
chrome.runtime.onInstalled.addListener(configurarAlarmes);
chrome.runtime.onStartup.addListener(configurarAlarmes);

function configurarAlarmes() {
  // 08:00
  chrome.alarms.create('falaw-sync-manha', {
    when: proximoHorario(8, 0),
    periodInMinutes: 24 * 60,
  });
  // 18:00
  chrome.alarms.create('falaw-sync-tarde', {
    when: proximoHorario(18, 0),
    periodInMinutes: 24 * 60,
  });
}

function proximoHorario(hora, minuto) {
  const agora = new Date();
  const alvo  = new Date(agora);
  alvo.setHours(hora, minuto, 0, 0);
  if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
  return alvo.getTime();
}

// ── Orquestrador principal ────────────────────────────────────────────────────
async function startSync() {
  syncState = {
    running:    true,
    total:      TARGETS.length,
    done:       0,
    erros:      [],
    audiencias: 0,
    cancelados: 0,
    adminTabId: syncState.adminTabId,
  };
  notificarAdmin({ type: 'FALAW_SYNC_PROGRESS', state: { ...syncState, status: 'Iniciando…' } });

  // Buscar audiências ativas no Supabase para detectar cancelamentos depois
  const ativasAntes = await sbBuscarAtivas();

  const todasColetadas = [];

  for (const target of TARGETS) {
    if (!syncState.running) break;
    notificarAdmin({
      type: 'FALAW_SYNC_PROGRESS',
      state: { ...syncState, status: `${target.trt} (${target.grau})…` },
    });

    const rows = await scrapeTarget(target);
    if (rows) todasColetadas.push(...rows);
    syncState.done++;
  }

  // Upsert tudo
  if (todasColetadas.length > 0) {
    const enviados = await sbUpsert(todasColetadas);
    syncState.audiencias = enviados;
  }

  // Detectar cancelamentos
  const idsColetados = new Set(todasColetadas.map(r => r.id));
  const cancelados   = ativasAntes.filter(r => !idsColetados.has(r.id));
  if (cancelados.length > 0) {
    await sbMarcarCanceladoPje(cancelados.map(r => r.id));
    syncState.cancelados = cancelados.length;
  }

  syncState.running = false;
  notificarAdmin({
    type: 'FALAW_SYNC_DONE',
    state: {
      ...syncState,
      status: 'Concluído',
      semSessao: syncState.erros.filter(e => e.includes('sessão expirada')).map(e => e.replace(': sessão expirada','')),
    },
  });
}

// ── Scrape de um target (abre aba oculta, injeta script, coleta dados) ────────
function scrapeTarget(target) {
  return new Promise((resolve) => {
    let tabId = null;
    const timeout = setTimeout(() => {
      if (tabId) chrome.tabs.remove(tabId).catch(() => {});
      syncState.erros.push(`${target.id}: timeout`);
      resolve([]);
    }, 40000); // 40s por TRT

    // Ouvinte único para este target
    function onMessage(msg) {
      if (msg.type === 'FALAW_PAGE_DATA' && msg.targetId === target.id) {
        chrome.runtime.onMessage.removeListener(onMessage);
        clearTimeout(timeout);
        if (tabId) chrome.tabs.remove(tabId).catch(() => {});
        if (!msg.authenticated) {
          syncState.erros.push(`${target.id}: sessão expirada`);
          resolve([]);
        } else {
          resolve(msg.rows || []);
        }
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);

    // Abre aba em segundo plano (active: false = aba não fica em foco)
    chrome.tabs.create({ url: target.url, active: false }, (tab) => {
      tabId = tab.id;
      // Injeta o scraper quando a aba carregar
      chrome.tabs.onUpdated.addListener(function onUpdated(tid, info) {
        if (tid !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.scripting.executeScript({
          target: { tabId },
          func:   scraperFn,
          args:   [target.id, target.trt, target.grau],
        }).catch((e) => {
          chrome.runtime.onMessage.removeListener(onMessage);
          clearTimeout(timeout);
          chrome.tabs.remove(tabId).catch(() => {});
          syncState.erros.push(`${target.id}: ${e.message}`);
          resolve([]);
        });
      });
    });
  });
}

// ── Função injetada na aba PJe (roda no contexto da página) ──────────────────
function scraperFn(targetId, nomeTrt, grau) {
  // Verificar autenticação
  const url = location.href.toLowerCase();
  if (url.includes('login') || url.includes('token') || url.includes('acesso')) {
    chrome.runtime.sendMessage({ type: 'FALAW_PAGE_DATA', targetId, authenticated: false, rows: [] });
    return;
  }

  const MESES = {
    janeiro:1,fevereiro:2,'março':3,abril:4,maio:5,junho:6,
    julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12,
    jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12,
  };

  function parseDataHora(txt) {
    txt = (txt || '').trim();
    let m;
    m = txt.match(/(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    if (m) return [m[1], m[2]];
    m = txt.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/);
    if (m) return [`${m[3]}-${m[2]}-${m[1]}`, m[4]];
    m = txt.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\s+(\d{2}:\d{2})/i);
    if (m) {
      const mes = MESES[m[2].toLowerCase()];
      if (mes) return [`${m[3]}-${String(mes).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`, m[4]];
    }
    m = txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return [`${m[3]}-${m[2]}-${m[1]}`, ''];
    return ['', ''];
  }

  function parseTipo(txt) {
    const t = (txt || '').toUpperCase();
    let tipo = 'AUDIENCIA';
    if (t.includes('UNA') || t.includes('CONCILIA')) tipo = 'UNA';
    else if (t.includes('INSTRU')) tipo = 'INSTRUCAO';
    else if (t.includes('JULGAMENT')) tipo = 'JULGAMENTO';
    else if (t.includes('PERIC')) tipo = 'PERICIAL';
    let mod = '';
    if (t.includes('VIDEO') || t.includes('VIRTUAL') || t.includes('REMOT') || t.includes('DIGITAL')) mod = 'VIRTUAL';
    else if (t.includes('PRESENCIAL') || t.includes('FÍSIC') || t.includes('FISIC')) mod = 'PRESENCIAL';
    else if (t.includes('HÍBRID') || t.includes('HIBRID')) mod = 'HIBRIDA';
    return [tipo, mod];
  }

  function makeId(proc, data, hora) {
    const raw = `${proc}|${data}|${hora}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `pje-${h.toString(16).padStart(8,'0')}`;
  }

  function extrairLinhas() {
    const sels = [
      '.p-datatable-tbody > tr',
      'p-table .p-datatable-tbody > tr',
      'table tbody tr',
      '[class*="datatable"] tbody tr',
    ];
    let linhas = [];
    for (const sel of sels) {
      linhas = [...document.querySelectorAll(sel)];
      if (linhas.length > 0) break;
    }

    const rows = [];
    for (const tr of linhas) {
      const tds   = [...tr.querySelectorAll('td')];
      if (tds.length < 3) continue;
      const texts = tds.map(td => td.innerText.trim());
      if (!texts.some(Boolean)) continue;

      // PJe-kz: col[0]=Processo+partes, col[1]=Prioridade, col[2]=Data/Hora, col[3]=Tipo, col[4]=Vara
      // PJe legado: col[0]=Data/Hora, col[1]=Processo, col[2]=Tipo, col[3]=Vara
      let procRaw, dataHoraRaw, tipoRaw, varaRaw;
      if (location.href.includes('pjekz') || location.href.includes('pauta-usuarios-externos')) {
        procRaw     = texts[0] || '';
        dataHoraRaw = texts[2] || texts[1] || '';
        tipoRaw     = texts[3] || '';
        varaRaw     = texts[4] || '';
      } else {
        dataHoraRaw = texts[0] || '';
        procRaw     = texts[1] || '';
        tipoRaw     = texts[2] || '';
        varaRaw     = texts[3] || '';
      }

      const linhasProc = procRaw.split('\n').map(s => s.trim()).filter(Boolean);
      const processo   = linhasProc[0] || procRaw;
      const partesRaw  = linhasProc.slice(1).join(' | ');

      let reclamante = '', reclamada = '';
      if (/ [xX] /.test(partesRaw)) {
        const sp = partesRaw.split(/ [xX] /);
        reclamante = sp[0].trim(); reclamada = sp[1]?.trim() || '';
      } else if (partesRaw.includes('|')) {
        const sp = partesRaw.split('|');
        reclamante = sp[0].trim(); reclamada = sp[1]?.trim() || '';
      }

      const [data, hora] = parseDataHora(dataHoraRaw);
      const [tipo, mod]  = parseTipo(tipoRaw);
      const id           = makeId(processo, data, hora);

      if (!processo && !data) continue;

      rows.push({
        id, processo, reclamante, reclamada,
        data_audiencia: data,
        horario:        hora,
        tipo_audiencia: tipo,
        modalidade:     mod,
        vara:           varaRaw,
        grau:           grau,
        status:         'agendado',
        origem:         'pje',
        updated_at:     new Date().toISOString(),
      });
    }
    return rows;
  }

  // Aguarda tabela aparecer e percorre páginas
  async function coletar() {
    await new Promise(r => setTimeout(r, 3000));

    // Tentar expandir período (próximos 60 dias)
    try {
      const hoje = new Date();
      const fim  = new Date(hoje.getTime() + 60*24*60*60*1000);
      const fmt  = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      const inpSels = [
        ['input[placeholder*="nício"]', 'input[placeholder*="inal"]'],
        ['p-calendar:first-of-type input', 'p-calendar:last-of-type input'],
        ['#dtInicio', '#dtFim'],
      ];
      for (const [s1, s2] of inpSels) {
        const i1 = document.querySelector(s1);
        const i2 = document.querySelector(s2);
        if (i1 && i2) {
          i1.value = fmt(hoje); i1.dispatchEvent(new Event('input', {bubbles:true}));
          i2.value = fmt(fim);  i2.dispatchEvent(new Event('input', {bubbles:true}));
          const btn = document.querySelector("button[class*='pesquis' i], button[class*='filtrar' i], button[type='submit']");
          if (btn) { btn.click(); await new Promise(r => setTimeout(r, 2500)); }
          break;
        }
      }
    } catch(_) {}

    const todasLinhas = [];
    let pagina = 0;

    while (pagina < 30) {
      await new Promise(r => setTimeout(r, 1500));
      const linhas = extrairLinhas();
      if (!linhas.length) break;
      todasLinhas.push(...linhas);

      // Próxima página
      const next = document.querySelector(
        'button[aria-label="Next Page"]:not([disabled]),' +
        '.p-paginator-next:not(.p-disabled),' +
        'button.p-paginator-next:not([disabled]),' +
        'a[title*="róxima"]:not(.disabled)'
      );
      if (next && !next.disabled) { next.click(); pagina++; }
      else break;
    }

    return todasLinhas;
  }

  coletar().then(rows => {
    chrome.runtime.sendMessage({ type: 'FALAW_PAGE_DATA', targetId, authenticated: true, rows });
  }).catch(e => {
    chrome.runtime.sendMessage({ type: 'FALAW_PAGE_DATA', targetId, authenticated: true, rows: [], erro: e.message });
  });
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
function sbHeaders(extra = {}) {
  return {
    'apikey':        SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type':  'application/json',
    ...extra,
  };
}

async function sbUpsert(records) {
  let total = 0;
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${SB_TABLE}`, {
        method:  'POST',
        headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body:    JSON.stringify(batch),
      });
      if (r.ok) total += batch.length;
      else console.error('Supabase upsert', r.status, await r.text());
    } catch(e) { console.error('sbUpsert', e); }
  }
  return total;
}

async function sbBuscarAtivas() {
  try {
    const hoje = new Date().toISOString().slice(0,10);
    const r = await fetch(
      `${SB_URL}/rest/v1/${SB_TABLE}?data_audiencia=gte.${hoje}&status=neq.cancelado&status=neq.cancelado_pje&origem=eq.pje&select=id,processo,data_audiencia`,
      { headers: sbHeaders() }
    );
    if (r.ok) return await r.json();
  } catch(e) { console.error('sbBuscarAtivas', e); }
  return [];
}

async function sbMarcarCanceladoPje(ids) {
  for (const id of ids) {
    try {
      await fetch(`${SB_URL}/rest/v1/${SB_TABLE}?id=eq.${id}`, {
        method:  'PATCH',
        headers: sbHeaders({ 'Prefer': 'return=minimal' }),
        body:    JSON.stringify({ status: 'cancelado_pje', updated_at: new Date().toISOString() }),
      });
    } catch(e) { console.error('sbMarcarCancelado', e); }
  }
}

// ── Notificar aba do admin ────────────────────────────────────────────────────
function notificarAdmin(msg) {
  if (!syncState.adminTabId) return;
  chrome.tabs.sendMessage(syncState.adminTabId, msg).catch(() => {});
}
