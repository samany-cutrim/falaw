import { createClient } from "jsr:@supabase/supabase-js@2";

const PROJURIS_BASE      = (Deno.env.get("PROJURIS_BASE_URL") ?? "https://service.projurisadv.com.br").replace(/\/$/, "");
const PROJURIS_API_URL   = (Deno.env.get("PROJURIS_API_URL")  ?? "").replace(/\/$/, ""); // URL do endpoint /audiencias (Python script)
const PROJURIS_TOKEN_URL = Deno.env.get("PROJURIS_TOKEN_URL") ?? "https://login.projurisadv.com.br/realms/projurisadv-realm/protocol/openid-connect/token";
const PROJURIS_CLIENT_ID = Deno.env.get("PROJURIS_CLIENT_ID") ?? "";
const PROJURIS_SECRET    = Deno.env.get("PROJURIS_CLIENT_SECRET") ?? "";
const PROJURIS_USERNAME  = Deno.env.get("PROJURIS_USERNAME") ?? "";
const PROJURIS_PASSWORD  = Deno.env.get("PROJURIS_PASSWORD") ?? "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DIAS_BUSCA           = parseInt(Deno.env.get("DIAS_PAUTA") ?? "365", 10);
const SB_TABLE   = "pauta_audiencias";
const SB_SYNCLOG = "sync_log";

// Endpoint de diagnóstico — testa auth e uma chamada de API
async function diagnosticarAuth(): Promise<Record<string, string>> {
  const authUrls = [
    PROJURIS_TOKEN_URL,
    `${PROJURIS_BASE}/adv-service/oauth/token`,
    `${PROJURIS_BASE}/adv-service/oauth2/token`,
  ];
  const resultado: Record<string, string> = {};

  // Testa auth — testa client_credentials E password grant
  let tokenObtido = "";
  // 1) password grant
  if (PROJURIS_USERNAME && PROJURIS_PASSWORD) {
    try {
      const resp = await fetch(PROJURIS_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "password", client_id: PROJURIS_CLIENT_ID, client_secret: PROJURIS_SECRET, username: PROJURIS_USERNAME, password: PROJURIS_PASSWORD, scope: "openid" }),
      });
      const txt = await resp.text();
      resultado["auth:password"] = `${resp.status}: ${txt.slice(0, 300)}`;
      if (resp.ok) {
        const body = JSON.parse(txt);
        tokenObtido = body.access_token ?? "";
        resultado["auth_ok"] = "password grant";
      }
    } catch (e) { resultado["auth:password"] = `ERRO: ${e}`; }
  }
  // 2) client_credentials fallback
  if (!tokenObtido) {
    try {
      const resp = await fetch(PROJURIS_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: PROJURIS_CLIENT_ID, client_secret: PROJURIS_SECRET }),
      });
      const txt = await resp.text();
      resultado["auth:client_cred"] = `${resp.status}: ${txt.slice(0, 200)}`;
      if (resp.ok) {
        const body = JSON.parse(txt);
        tokenObtido = body.access_token ?? "";
        resultado["auth_ok"] = "client_credentials";
      }
    } catch (e) { resultado["auth:client_cred"] = `ERRO: ${e}`; }
  }

  // Decode JWT claims
  if (tokenObtido) {
    try {
      const parts = tokenObtido.split(".");
      const pad = parts[1].length % 4;
      const b64 = parts[1] + (pad ? "=".repeat(4-pad) : "");
      const claims = JSON.parse(atob(b64));
      resultado["jwt_sub"]   = claims.sub ?? "";
      resultado["jwt_scope"] = claims.scope ?? "";
      resultado["jwt_roles"] = JSON.stringify(claims.realm_access?.roles ?? []);
      resultado["jwt_aud"]   = JSON.stringify(claims.aud ?? "");
    } catch(e) { resultado["jwt_decode"] = String(e); }

    const hoje = new Date().toISOString().slice(0, 10);
    const fim  = new Date(Date.now() + 30*86400000).toISOString().slice(0, 10);
    const tsIni = new Date(hoje+"T00:00:00Z").getTime();
    const tsFim = new Date(fim+"T23:59:59Z").getTime();
    // Usa os mesmos headers que a função principal (com Origin/Referer de browser)
    const browserHdrs = {
      "Authorization":   `Bearer ${tokenObtido}`,
      "Content-Type":    "application/json",
      "Accept":          "application/json, text/plain, */*",
      "Origin":          "https://app.projurisadv.com.br",
      "Referer":         "https://app.projurisadv.com.br/",
      "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9",
      "X-Requested-With":"XMLHttpRequest",
    };
    const processoBody = JSON.stringify({ filtroGeral:"", flHabilitado:true, flEstouEnvolvido:false, flSouResponsavel:false, campoDinamicoConsultaFiltro:[], codigoGruposResponsaveis:[], codigoUsuariosResponsaveis:[], codigosCarteira:[], codigosGrupoEmpresarial:[], marcadores:[], numerosProcesso:[], resultados:[], sistemas:[] });
    const apiTests: Array<{label:string; url:string; method:string; body?:string}> = [
      // Calendário com diferentes formatos de data
      { label:"cal-ts", url:`${PROJURIS_BASE}/adv-service/v2/tarefa/calendario/consulta-sem-paginacao`, method:"POST", body: JSON.stringify({dataInicio:tsIni, dataFim:tsFim}) },
      { label:"cal-str", url:`${PROJURIS_BASE}/adv-service/v2/tarefa/calendario/consulta-sem-paginacao`, method:"POST", body: JSON.stringify({dataInicio:hoje, dataFim:fim}) },
      { label:"cal-qs", url:`${PROJURIS_BASE}/adv-service/v2/tarefa/calendario/consulta-sem-paginacao?dataInicio=${tsIni}&dataFim=${tsFim}`, method:"POST", body: "{}" },
      // Paginado com filtro de data
      { label:"pag-date", url:`${PROJURIS_BASE}/adv-service/tarefa/consulta-com-paginacao?quan-registros=5&pagina=0&ordenacao-tipo=ASC&ordenacao-chave=ORDENACAO_DATA_PREVISTA&dataInicio=${tsIni}&dataFim=${tsFim}`, method:"GET" },
      { label:"pag-nodate", url:`${PROJURIS_BASE}/adv-service/tarefa/consulta-com-paginacao?quan-registros=5&pagina=0&ordenacao-tipo=DESC&ordenacao-chave=ORDENACAO_DATA_PREVISTA`, method:"GET" },
      // Endpoint de audiências dedicado?
      { label:"audiencia", url:`${PROJURIS_BASE}/adv-service/audiencia/consulta-com-paginacao?quan-registros=5&pagina=0&ordenacao-tipo=ASC&ordenacao-chave=ORDENACAO_DATA_PREVISTA`, method:"GET" },
      ...(PROJURIS_API_URL ? [
        { label:"api-audiencias", url:`${PROJURIS_API_URL}/audiencias?dataInicio=${hoje}&dataFim=${fim}&tipo=audiencia&page=0&size=5`, method:"GET" },
        { label:"api-base", url:`${PROJURIS_API_URL}`, method:"GET" },
      ] : []),
      { label:"audiencia-v2", url:`${PROJURIS_BASE}/adv-service/v2/audiencia/consulta?quan-registros=5&pagina=0`, method:"GET" },
      { label:"compromisso", url:`${PROJURIS_BASE}/adv-service/compromisso/consulta-com-paginacao?quan-registros=5&pagina=0`, method:"GET" },
    ];
    for (const t of apiTests) {
      try {
        const opts: RequestInit = { method: t.method, headers: browserHdrs };
        if (t.body) opts.body = t.body;
        const r = await fetch(t.url, opts);
        const body = await r.text();
        const hdrsStr = [...r.headers.entries()].map(([k,v])=>`${k}:${v}`).join("|");
        resultado[`api:${t.label}`] = `${r.status} hdrs=${hdrsStr.slice(0,150)} body=${body.slice(0,300)}`;
      } catch (e) { resultado[`api:${t.label}`] = `ERR: ${e}`; }
    }
  } else {
    resultado["api"] = "Token não obtido — auth falhou em todos os endpoints";
  }

  return resultado;
}

let _tokenCache = { access_token: "", expires_at: 0 };

// username/password passados no body da requisição (sobrescrevem os secrets)
let _runtimeUser = "";
let _runtimePass = "";

async function getToken(): Promise<string> {
  const now = Date.now() / 1000;
  if (_tokenCache.access_token && now < _tokenCache.expires_at - 60) return _tokenCache.access_token;

  const user = _runtimeUser || PROJURIS_USERNAME;
  const pass = _runtimePass || PROJURIS_PASSWORD;

  // Tenta password grant (com credenciais de usuário)
  if (user && pass) {
    const resp = await fetch(PROJURIS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password", client_id: PROJURIS_CLIENT_ID, client_secret: PROJURIS_SECRET, username: user, password: pass, scope: "openid" }),
    });
    const bodyText = await resp.text();
    console.log(`Auth password ${resp.status}: ${bodyText.slice(0,100)}`);
    if (resp.ok) {
      const body = JSON.parse(bodyText);
      const token = body.access_token ?? "";
      if (token) {
        _tokenCache = { access_token: token, expires_at: now + parseInt(body.expires_in ?? "3600", 10) };
        return token;
      }
    } else {
      throw new Error(`Auth falhou (${resp.status}): ${bodyText.slice(0,200)}`);
    }
  }

  // Fallback: client_credentials
  const resp2 = await fetch(PROJURIS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: PROJURIS_CLIENT_ID, client_secret: PROJURIS_SECRET }),
  });
  const body2Text = await resp2.text();
  if (resp2.ok) {
    const body2 = JSON.parse(body2Text);
    const token2 = body2.access_token ?? "";
    if (token2) {
      _tokenCache = { access_token: token2, expires_at: now + parseInt(body2.expires_in ?? "3600", 10) };
      return token2;
    }
  }
  throw new Error("Falha ao autenticar no Projuris ADV");
}

// Headers que imitam o browser — necessários para o Projuris aceitar a requisição
function authHeaders(): Record<string, string> {
  return {
    "Authorization":   `Bearer ${_tokenCache.access_token}`,
    "Content-Type":    "application/json",
    "Accept":          "application/json, text/plain, */*",
    "Origin":          "https://app.projurisadv.com.br",
    "Referer":         "https://app.projurisadv.com.br/",
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "X-Requested-With":"XMLHttpRequest",
  };
}

async function getLastSyncAt(sb: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    const { data } = await sb.from(SB_SYNCLOG).select("synced_at").eq("source","projuris-adv").order("synced_at",{ascending:false}).limit(1).single();
    return (data as { synced_at: string }|null)?.synced_at ?? null;
  } catch { return null; }
}

async function recordSync(sb: ReturnType<typeof createClient>, count: number): Promise<void> {
  try { await sb.from(SB_SYNCLOG).insert({ source:"projuris-adv", synced_at: new Date().toISOString(), count }); } catch { /* ok */ }
}

function extractItems(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    // calendario: { tarefasAgrupadasDataTipoWs: [ { data: ts, tarefaConsultaWs: [...] } ] }
    // Propaga a data do grupo (campo "data") para cada item como "_grupoData"
    if (b.tarefasAgrupadasDataTipoWs) {
      const grupos = b.tarefasAgrupadasDataTipoWs as Record<string,unknown>[];
      const result: Record<string,unknown>[] = [];
      for (const g of grupos) {
        const grupoData = g.data;
        for (const raw of ((g.tarefaConsultaWs ?? []) as Record<string,unknown>[])) {
          result.push({ _grupoData: grupoData, ...raw });
        }
      }
      return result;
    }
    // paginado: { tarefaConsultaWs: [...] }
    if (b.tarefaConsultaWs) return b.tarefaConsultaWs as unknown[];
    return (b.content ?? b.data ?? b.tarefas ?? b.items ?? []) as unknown[];
  }
  return [];
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

async function fetchCalendario(ini: string, fim: string): Promise<unknown[]> {
  const url = `${PROJURIS_BASE}/adv-service/v2/tarefa/calendario/consulta-sem-paginacao`;
  // Projuris espera timestamps em milissegundos, não strings de data
  const tsIni = new Date(ini + "T00:00:00Z").getTime();
  const tsFim = new Date(fim + "T23:59:59Z").getTime();
  console.log("Calendario POST: " + ini + " -> " + fim + " ts=" + tsIni + "~" + tsFim);
  const resp = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ dataInicio: tsIni, dataFim: tsFim }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Calendario ${resp.status}: ${body.slice(0,300)}`);
  }
  return extractItems(await resp.json());
}

async function fetchPaginado(ini: string, fim: string): Promise<unknown[]> {
  const all: unknown[] = [];
  let pagina = 0;
  const baseUrl = `${PROJURIS_BASE}/adv-service/tarefa/consulta-com-paginacao`;
  // Busca até 60 páginas (6000 itens) para capturar audiências
  // A API não filtra por data, então buscamos e filtramos localmente
  const MAX_PAGINAS = 60;
  while (pagina < MAX_PAGINAS) {
    const params = new URLSearchParams({ "quan-registros":"100", pagina: String(pagina), "ordenacao-tipo":"ASC", "ordenacao-chave":"ORDENACAO_DATA_PREVISTA" });
    const resp = await fetch(`${baseUrl}?${params}`, { headers: authHeaders() });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Paginado ${resp.status}: ${body.slice(0,300)}`);
    }
    const body = await resp.json();
    const items = extractItems(body);
    if (!items.length) break;
    all.push(...items);
    const total = (body as Record<string,unknown>).totalRegistros as number ?? 0;
    if (all.length >= total) break;
    pagina++;
  }
  return all;
}

const TIPOS_AUD = ["audiencia","julgamento","conciliacao","instrucao","sessao","pauta","aud.","audi"];
function isAudiencia(item: Record<string,unknown>): boolean {
  const tipo = String(item.nomeTarefaTipo ?? item.tipoTarefa ?? item.tipo_tarefa ?? item.tipoEvento ?? item.tipo ?? "")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  return TIPOS_AUD.some(t => tipo.includes(t));
}

async function fetchAudiencias(): Promise<unknown[]> {
  await getToken();
  const hoje = new Date();
  const hojeStr = fmtDate(hoje);
  const fim = new Date(hoje); fim.setDate(fim.getDate() + DIAS_BUSCA);
  const fimStr = fmtDate(fim);
  const tsIni = new Date(hojeStr + "T00:00:00Z").getTime();
  const tsFim = new Date(fimStr  + "T23:59:59Z").getTime();

  // 0. Endpoint dedicado /audiencias (PROJURIS_API_URL — mesmo que o Python usava)
  if (PROJURIS_API_URL) {
    console.log("Tentando PROJURIS_API_URL/audiencias: " + PROJURIS_API_URL);
    const allItems: unknown[] = [];
    let page = 0;
    const MAX_PAGES = 60;
    while (page < MAX_PAGES) {
      try {
        const params = new URLSearchParams({
          dataInicio: hojeStr, dataFim: fimStr,
          tipo: "audiencia", page: String(page), size: "200",
        });
        const resp = await fetch(`${PROJURIS_API_URL}/audiencias?${params}`, { headers: authHeaders() });
        if (!resp.ok) {
          console.warn("/audiencias status: " + resp.status);
          break;
        }
        const body = await resp.json();
        const items = Array.isArray(body) ? body
          : ((body as Record<string,unknown>).content
          ?? (body as Record<string,unknown>).data
          ?? (body as Record<string,unknown>).audiencias
          ?? (body as Record<string,unknown>).items
          ?? []) as unknown[];
        if (!items.length) break;
        allItems.push(...items);
        console.log("  /audiencias pág " + page + ": " + items.length + " itens (total: " + allItems.length + ")");
        const totalPages = (body as Record<string,unknown>).totalPages
          ?? (body as Record<string,unknown>).total_pages;
        if (typeof totalPages === "number" && page + 1 >= totalPages) break;
        if ((items as unknown[]).length < 200) break;
        page++;
      } catch(e) { console.warn("/audiencias erro pág " + page + ":", e); break; }
    }
    if (allItems.length > 0) {
      console.log("PROJURIS_API_URL total: " + allItems.length);
      return allItems;
    }
  }

  // 1. Calendário — filtra somente audiências FUTURAS (data >= hoje)
  let calAudFuturas: unknown[] = [];
  try {
    const url = `${PROJURIS_BASE}/adv-service/v2/tarefa/calendario/consulta-sem-paginacao`;
    const resp = await fetch(url, { method:"POST", headers:authHeaders(), body:JSON.stringify({dataInicio:tsIni, dataFim:tsFim}) });    if (resp.ok) {
      const todos = extractItems(await resp.json()) as Record<string,unknown>[];
      const audTodos = todos.filter(isAudiencia);
      // Só retorna itens com data >= hoje (ignora tarefas atrasadas do passado)
      calAudFuturas = audTodos.filter(item => {
        // Usa _grupoData (data do grupo do calendário) ou campos padrão de data
        const DATAS = ["dataPrevista","data_prevista","dataAudiencia","data_audiencia","dataInicio","data","dtEvento","_grupoData"];
        const rawVal = DATAS.map(k => item[k]).find(v => v != null && v !== "" && v !== 0);
        if (rawVal == null) return false; // sem data alguma — exclui
        const d = typeof rawVal === "number" ? new Date(rawVal) : new Date(String(rawVal));
        return !isNaN(d.getTime()) && fmtDate(d) >= hojeStr;
      });
      console.log(`Calendario: ${todos.length} tarefas, ${audTodos.length} audiências, ${calAudFuturas.length} futuras`);
    }
  } catch(e) { console.warn("Calendario falhou: " + e); }

  if (calAudFuturas.length > 0) return calAudFuturas;

  // 2. Paginado DESC — 10 páginas para diagnóstico
  console.log("Buscando paginado DESC...");
  const ITEMS_POR_PAG = 100;
  const rawItems: unknown[] = [];

  for (let pagina = 0; pagina < 10; pagina++) {
    const params = new URLSearchParams({
      "quan-registros": String(ITEMS_POR_PAG),
      pagina: String(pagina),
      "ordenacao-tipo": "DESC",
      "ordenacao-chave": "ORDENACAO_DATA_PREVISTA",
    });
    const resp = await fetch(`${PROJURIS_BASE}/adv-service/tarefa/consulta-com-paginacao?${params}`, { headers: authHeaders() });
    if (!resp.ok) { console.warn("Paginado pag " + pagina + " status=" + resp.status); break; }
    const body = await resp.json();
    const items = extractItems(body) as Record<string,unknown>[];
    if (!items.length) break;
    rawItems.push(...items.filter(isAudiencia));
    const total = (body as Record<string,unknown>).totalRegistros as number ?? 0;
    if ((pagina + 1) * ITEMS_POR_PAG >= total) break;
  }
  console.log("Audiencias brutas paginado: " + rawItems.length);

  // Filtra por data >= hoje usando campos de data do Projuris
  const audiencias: unknown[] = [];
  for (const item of rawItems) {
    const r = item as Record<string,unknown>;
    const DATAS = ["dataPrevista","data_prevista","dataAudiencia","data_audiencia","dataInicio","dataLimite","dtEvento","_grupoData"];
    const rawVal = DATAS.map(k => r[k]).find(v => v != null && v !== "" && v !== 0);
    if (rawVal == null) continue;
    const d = typeof rawVal === "number" ? new Date(rawVal) : new Date(String(rawVal));
    if (!isNaN(d.getTime()) && fmtDate(d) >= hojeStr) audiencias.push(item);
  }
  console.log("Audiencias futuras paginado: " + audiencias.length);

  // 3. Endpoint dedicado de audiências (fallback adicional)
  if (!audiencias.length) {
    console.log("Tentando endpoint dedicado /audiencia...");
    try {
      const params = new URLSearchParams({
        "quan-registros": "200", pagina: "0",
        "ordenacao-tipo": "ASC", "ordenacao-chave": "ORDENACAO_DATA_PREVISTA",
      });
      const resp = await fetch(`${PROJURIS_BASE}/adv-service/audiencia/consulta-com-paginacao?${params}`, { headers: authHeaders() });
      if (resp.ok) {
        const items = extractItems(await resp.json()) as Record<string,unknown>[];
        const futuras = items.filter(item => {
          const DATAS = ["dataPrevista","dataAudiencia","dataInicio","data"];
          const rawVal = DATAS.map(k => item[k]).find(v => v);
          if (!rawVal) return true;
          const d = typeof rawVal === "number" ? new Date(rawVal) : new Date(String(rawVal));
          return !isNaN(d.getTime()) && fmtDate(d) >= hojeStr;
        });
        console.log("Endpoint /audiencia: " + futuras.length + " futuras");
        if (futuras.length) return futuras;
      }
    } catch(e) { console.warn("/audiencia endpoint falhou:", e); }
  }

  return audiencias;
}

function makeId(p: string, d: string, h: string): string {
  const raw = `projuris-adv|${p}|${d}|${h}`;
  let hh = 0x811c9dc5;
  for (const c of new TextEncoder().encode(raw)) { hh ^= c; hh = (hh * 0x01000193) >>> 0; }
  return "adv-" + hh.toString(16).padStart(8,"0");
}

function parseData(raw: string): { data: string; hora: string } {
  if (!raw) return { data:"", hora:"" };
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/) ?? raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return { data: m[1], hora: m[2] ?? "" };
  const dm = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}:\d{2})?/);
  if (dm) return { data: `${dm[3]}-${dm[2]}-${dm[1]}`, hora: dm[4] ?? "" };
  return { data:"", hora:"" };
}

function str(v: unknown): string { return v == null ? "" : String(v).trim(); }

function normalizar(item: Record<string,unknown>): Record<string,unknown> {
  const DATAS = ["dataPrevista","data_prevista","dataAudiencia","data_audiencia","dataInicio","dataLimite","data","dtEvento"];
  const HORAS = ["horaPrevista","hora_prevista","horaAudiencia","hora_audiencia","horaInicio","horaLimite","hora","horario"];
  // dataPrevista e horaLimite em Projuris ADV são timestamps em ms
  const dataRawVal = DATAS.map(k=>item[k]).find(v=>v);
  let dataRaw = "";
  if (typeof dataRawVal === "number") {
    // Timestamp ms → YYYY-MM-DD
    const d = new Date(dataRawVal);
    dataRaw = d.getUTCFullYear() + "-" + String(d.getUTCMonth()+1).padStart(2,"0") + "-" + String(d.getUTCDate()).padStart(2,"0");
  } else dataRaw = str(dataRawVal);
  const horaRawVal = HORAS.map(k=>item[k]).find(v=>v);
  let horaRaw = "";
  if (typeof horaRawVal === "number") {
    const d = new Date(horaRawVal);
    horaRaw = String(d.getUTCHours()).padStart(2,"0") + ":" + String(d.getUTCMinutes()).padStart(2,"0");
  } else horaRaw = str(horaRawVal);
  const { data, hora: horaFb } = parseData(dataRaw);
  const hora = horaRaw ? horaRaw.slice(0,5) : horaFb;

  const processo   = str(item.numeroProcesso ?? item.numero_processo ?? item.processo ?? item.nrProcesso);
  const reclamante = str(item.reclamante ?? item.parteAtiva ?? item.poloAtivo ?? item.polo_ativo ?? item.autor ?? item.nomeEnvolvido);
  const reclamada  = str(item.reclamada  ?? item.partePassiva ?? item.poloPassivo ?? item.polo_passivo ?? item.reu ?? item.nomeCliente);
  const vara       = str(item.vara ?? item.orgaoJulgador ?? item.orgao_julgador ?? item.tribunal);
  const link       = str(item.linkVideoconferencia ?? item.link_video ?? item.link ?? item.urlVideoconferencia);

  // ── Marcadores (etiquetas/tags do Projuris) ─────────────────────────────────
  const marcadoresRaw = item.marcadores ?? item.etiquetas ?? item.tags ?? item.labels ?? [];
  const marcadores: string[] = [];
  if (Array.isArray(marcadoresRaw)) {
    for (const m of marcadoresRaw as unknown[]) {
      if (typeof m === "string") marcadores.push(m.toUpperCase().trim());
      else if (m && typeof m === "object") {
        const label = str(
          (m as Record<string,unknown>).descricao ??
          (m as Record<string,unknown>).nome ??
          (m as Record<string,unknown>).label ??
          (m as Record<string,unknown>).name ?? ""
        );
        if (label) marcadores.push(label.toUpperCase().trim());
      }
    }
  } else if (typeof marcadoresRaw === "string" && marcadoresRaw) {
    marcadores.push(...(marcadoresRaw as string).toUpperCase().split(",").map(s => s.trim()).filter(Boolean));
  }

  // ── Conta empresas no polo passivo (reclamada) ──────────────────────────────
  // Se poloPassivo veio como array, usa o tamanho; senão conta vírgulas na string
  const poloPassivoArr = item.poloPassivo ?? item.polo_passivo;
  let numReclamadas = 0;
  if (Array.isArray(poloPassivoArr)) {
    numReclamadas = (poloPassivoArr as unknown[]).length;
  } else if (reclamada) {
    numReclamadas = reclamada.split(",").filter(p => p.trim().length > 2).length;
  }
  if (numReclamadas === 0) numReclamadas = 1;

  // ── Tipo de Responsabilidade automático pelos marcadores e polo ─────────────
  const isIfood = reclamada.toLowerCase().includes("ifood") ||
                  str(item.cliente ?? item.nomeCliente ?? "").toLowerCase().includes("ifood");
  const temExFoodlover = marcadores.some(m =>
    m.includes("EX-FOODLOVER") || m.includes("EXFOODLOVER") || m.includes("EX_FOODLOVER")
  );
  let tipo_responsabilidade = "";
  if (isIfood) {
    if (temExFoodlover)     tipo_responsabilidade = "EX-FOODLOVER";
    else if (numReclamadas > 1) tipo_responsabilidade = "OL-SUBSIDIÁRIA";
    else                    tipo_responsabilidade = "NUVEM";
  } else if (reclamada) {
    tipo_responsabilidade = numReclamadas > 1 ? "SUBSIDIÁRIA" : "EX-FUNCIONÁRIO";
  }
  const advogado = (() => {
    if (item.usuarioResponsaveis && Array.isArray(item.usuarioResponsaveis)) {
      const u = (item.usuarioResponsaveis as Record<string,unknown>[])[0];
      if (u && u.nomeUsuario) return str(u.nomeUsuario);
    }
    if (item.responsavel && typeof item.responsavel === "object") {
      return str((item.responsavel as Record<string,unknown>).nome ?? (item.responsavel as Record<string,unknown>).name ?? "");
    }
    return str(item.responsavel ?? item.advogadoResponsavel ?? item.advogado ?? "");
  })();
  const mid   = str(item.meetingId ?? item.meeting_id ?? item.idReuniao);
  const senha = str(item.senha ?? item.password ?? item.codigoAcesso);
  const idSenha = [mid && `ID: ${mid}`, senha && `Senha: ${senha}`].filter(Boolean).join(" | ");

  // Normaliza tipo_audiencia para os valores permitidos pela tabela
  const tipoRaw = str(item.nomeTarefaTipo ?? item.tipoAudiencia ?? item.tipo_audiencia ?? item.tipoEvento ?? "")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  let tipo_audiencia = "";
  if (tipoRaw.includes("instruc") || tipoRaw.includes("instrução")) tipo_audiencia = "INSTRUÇÃO";
  else if (tipoRaw.includes("conciliac") || tipoRaw.includes("conciliação")) tipo_audiencia = "CONCILIAÇÃO";
  else if (tipoRaw.includes("una")) tipo_audiencia = "UNA";
  else if (tipoRaw.includes("inicial")) tipo_audiencia = "INICIAL";
  else if (tipoRaw.includes("peric") || tipoRaw.includes("perícia") || tipoRaw.includes("pericia")) tipo_audiencia = "PERÍCIA";
  // else deixa vazio — encaixa no CHECK constraint ''

  // Modalidade
  const modalRaw = str(item.modalidade ?? item.tipoSessao ?? item.tipo_sessao ?? "")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  let modalidade = "";
  if (modalRaw.includes("virtual") || modalRaw.includes("remot") || modalRaw.includes("online")) modalidade = "VIRTUAL";
  else if (modalRaw.includes("presencial")) modalidade = "PRESENCIAL";
  else if (modalRaw.includes("hibrida") || modalRaw.includes("misto")) modalidade = "HÍBRIDA";

  // descricao/titulo como comentários
  const comentarios = str(item.descricao ?? item.titulo ?? item.title ?? "");

  return {
    id: makeId(processo, data, hora),
    processo:              processo   || "",
    reclamante:            reclamante || "",
    reclamada:             reclamada  || "",
    data_audiencia:        data || new Date().toISOString().slice(0,10),
    horario:               hora       || "",
    tipo_audiencia:        tipo_audiencia        || "",
    modalidade:            modalidade            || "",
    vara:                  vara                  || "",
    status:                "agendada",
    origem:                "pje",
    link:                  link                  || "",
    id_senha:              idSenha               || "",
    advogado:              advogado              || "",
    tipo_responsabilidade: tipo_responsabilidade || "",
    comentarios:           comentarios           || "",
    updated_at:            new Date().toISOString(),
  };
}

/** Classifica tipo_responsabilidade pelos marcadores e polo passivo */
/** Busca marcadores dos processos na API do Projuris — retorna Map<numeroProcesso, marcadores[]> */
async function fetchMarcadoresPorProcesso(numeros: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  if (!numeros.length) return mapa;

  // Tenta endpoint de processo com filtro por número (lotes de 20)
  for (let i = 0; i < numeros.length; i += 20) {
    const batch = numeros.slice(i, i + 20);
    try {
      const resp = await fetch(
        `${PROJURIS_BASE}/adv-service/processo/consulta-com-paginacao?quan-registros=20&pagina=0`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            filtroGeral: "", flHabilitado: true,
            numerosProcesso: batch,
            marcadores: [], resultados: [], sistemas: [],
            campoDinamicoConsultaFiltro: [], codigoGruposResponsaveis: [],
            codigoUsuariosResponsaveis: [], codigosCarteira: [], codigosGrupoEmpresarial: [],
          }),
        }
      );
      if (!resp.ok) { console.warn("fetchMarcadores lote " + i + " -> " + resp.status); continue; }
      const body = await resp.json();
      const items = ((body as Record<string,unknown>).content
        ?? (body as Record<string,unknown>).data
        ?? (body as Record<string,unknown>).processoConsultaWs
        ?? []) as Record<string,unknown>[];

      for (const proc of items) {
        const num = str(proc.numeroProcesso ?? proc.numero_processo ?? proc.processo ?? "");
        const marcRaw = proc.marcadores ?? proc.etiquetas ?? proc.tags ?? [];
        const marcadores: string[] = [];
        if (Array.isArray(marcRaw)) {
          for (const m of marcRaw as unknown[]) {
            if (typeof m === "string") marcadores.push(m.toUpperCase().trim());
            else if (m && typeof m === "object") {
              const label = str(
                (m as Record<string,unknown>).descricao ??
                (m as Record<string,unknown>).nome ??
                (m as Record<string,unknown>).label ??
                (m as Record<string,unknown>).name ?? ""
              );
              if (label) marcadores.push(label.toUpperCase().trim());
            }
          }
        }
        if (num) mapa.set(num, marcadores);
      }
    } catch(e) { console.warn("fetchMarcadores erro:", e); }
  }
  console.log("Marcadores carregados para " + mapa.size + " processos");
  return mapa;
}

function calcularResponsabilidade(reclamada: string, marcadoresStr: string): string {
  const marcadores = marcadoresStr ? marcadoresStr.toUpperCase().split(",").map(s => s.trim()).filter(Boolean) : [];

  // Marcadores do Projuris têm prioridade absoluta (mapeamento direto)
  const TIPOS_VALIDOS = ["EX-FOODLOVER", "NUVEM", "TERCEIRIZAÇÃO", "OL-SUBSIDIÁRIA", "SUBSIDIÁRIA", "EX-FUNCIONÁRIO"];
  for (const tipo of TIPOS_VALIDOS) {
    if (marcadores.includes(tipo)) return tipo;
  }

  // Sem marcadores reconhecidos: fallback por posição no polo passivo
  if (!reclamada) return "";
  const partes = reclamada.split(",").map(p => p.trim()).filter(p => p.length > 0);
  const idxCliente = partes.findIndex(p => p.toUpperCase().includes("(CLIENTE)"));
  const clienteEhPrimeiro = idxCliente <= 0; // 0 = primeiro; -1 = sem tag, assume primeiro

  const isIfood = reclamada.toLowerCase().includes("ifood");
  if (isIfood) {
    return clienteEhPrimeiro ? "NUVEM" : "OL-SUBSIDIÁRIA";
  }
  return clienteEhPrimeiro ? "EX-FUNCIONÁRIO" : "SUBSIDIÁRIA";
}

/** Busca parteAtiva/partePassiva no endpoint de processos do Projuris e preenche registros sem reclamante */
async function completarPartesAusentes(sb: ReturnType<typeof createClient>): Promise<number> {
  const { data, error } = await sb
    .from("pauta_audiencias")
    .select("id,processo")
    .or("reclamante.is.null,reclamante.eq.")
    .not("processo", "is", null)
    .neq("processo", "");
  if (error || !data?.length) return 0;

  const numeros = [...new Set((data as {processo:string}[]).map(r => r.processo).filter(Boolean))];
  if (!numeros.length) return 0;

  // Busca dados do processo (parteAtiva/partePassiva + marcadores)
  const processoMap = new Map<string, { reclamante: string; reclamada: string; cliente: string; tipo_responsabilidade: string }>();

  for (let i = 0; i < numeros.length; i += 20) {
    const batch = numeros.slice(i, i + 20);
    try {
      const resp = await fetch(
        `${PROJURIS_BASE}/adv-service/processo/consulta-com-paginacao?quan-registros=20&pagina=0`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            filtroGeral: "", flHabilitado: true,
            numerosProcesso: batch,
            marcadores: [], resultados: [], sistemas: [],
            campoDinamicoConsultaFiltro: [], codigoGruposResponsaveis: [],
            codigoUsuariosResponsaveis: [], codigosCarteira: [], codigosGrupoEmpresarial: [],
          }),
        }
      );
      if (!resp.ok) continue;
      const body = await resp.json() as Record<string,unknown>;
      const items = ((body.content ?? body.data ?? body.processoConsultaWs ?? []) as Record<string,unknown>[]);

      for (const proc of items) {
        const num = str(proc.numeroProcesso ?? proc.numero_processo ?? proc.processo ?? "");
        if (!num) continue;

        // Extrai reclamante (polo ativo)
        const reclamante = str(
          proc.parteAtiva ?? proc.poloAtivo ?? proc.polo_ativo ?? proc.autor ??
          (Array.isArray(proc.partesAtivas) ? (proc.partesAtivas as Record<string,unknown>[])[0]?.nome ?? "" : "") ?? ""
        );
        // Extrai reclamada (polo passivo) — pode ser array
        let reclamada = "";
        if (Array.isArray(proc.partesPassivas)) {
          reclamada = (proc.partesPassivas as Record<string,unknown>[])
            .map(p => str(p.nome ?? p.name ?? p.razaoSocial ?? "")).filter(Boolean).join(",");
        } else {
          reclamada = str(proc.partePassiva ?? proc.poloPassivo ?? proc.polo_passivo ?? proc.reu ?? "");
        }
        // Extrai cliente (parte com "(CLIENTE)")
        const clienteTag = reclamada.split(",").find(p => p.toUpperCase().includes("(CLIENTE)"));
        const cliente = clienteTag
          ? clienteTag.replace(/\s*\(CLIENTE\)\s*/i, "").trim()
          : str(proc.cliente ?? proc.nomeCliente ?? "");

        // Marcadores para tipo_responsabilidade
        const marcRaw = proc.marcadores ?? proc.etiquetas ?? proc.tags ?? [];
        const marcadores: string[] = [];
        if (Array.isArray(marcRaw)) {
          for (const m of marcRaw as unknown[]) {
            const label = typeof m === "string" ? m : str((m as Record<string,unknown>).descricao ?? (m as Record<string,unknown>).nome ?? "");
            if (label) marcadores.push(label.toUpperCase().trim());
          }
        }
        const tipo_responsabilidade = calcularResponsabilidade(reclamada, marcadores.join(","));

        if (reclamante || reclamada) {
          processoMap.set(num, { reclamante, reclamada, cliente, tipo_responsabilidade });
        }
      }
    } catch(e) { console.warn("completarPartes lote " + i + ":", e); }
  }

  if (!processoMap.size) return 0;

  let atualizados = 0;
  for (const row of data as {id:string; processo:string}[]) {
    const partes = processoMap.get(row.processo);
    if (!partes) continue;
    const upd: Record<string,string> = {};
    if (partes.reclamante) upd.reclamante = partes.reclamante;
    if (partes.reclamada)  upd.reclamada  = partes.reclamada;
    if (partes.cliente)    upd.cliente    = partes.cliente;
    if (partes.tipo_responsabilidade) upd.tipo_responsabilidade = partes.tipo_responsabilidade;
    if (Object.keys(upd).length) {
      await sb.from("pauta_audiencias").update(upd).eq("id", row.id);
      atualizados++;
    }
  }
  console.log("Partes completadas: " + atualizados);
  return atualizados;
}

/** Classifica registros já no banco que têm reclamada mas tipo_responsabilidade vazio */
async function classificarExistentes(sb: ReturnType<typeof createClient>): Promise<number> {
  const { data, error } = await sb
    .from("pauta_audiencias")
    .select("id,processo,reclamada,tipo_responsabilidade")
    .neq("reclamada", "")
    .eq("tipo_responsabilidade", "");
  if (error || !data?.length) return 0;

  // Busca marcadores dos processos existentes no banco
  const numerosProcesso = [...new Set((data as {processo:string}[]).map(r => r.processo ?? "").filter(Boolean))];
  const marcadoresMap = await fetchMarcadoresPorProcesso(numerosProcesso);

  let atualizados = 0;
  for (const row of data as {id:string; processo:string; reclamada:string}[]) {
    const marcadores = (marcadoresMap.get(row.processo ?? "") ?? []).join(",");
    const resp = calcularResponsabilidade(row.reclamada ?? "", marcadores);
    if (resp) {
      await sb.from("pauta_audiencias").update({ tipo_responsabilidade: resp }).eq("id", row.id);
      atualizados++;
    }
  }
  return atualizados;
}

async function upsertSupabase(sb: ReturnType<typeof createClient>, records: Record<string,unknown>[]): Promise<number> {
  if (!records.length) return 0;
  let saved = 0;
  for (let i = 0; i < records.length; i += 50) {
    const { error } = await sb.from(SB_TABLE).upsert(records.slice(i,i+50), { onConflict:"id" });
    if (error) {
      console.error("Upsert erro:", error.message, "Detalhes:", error.details, "Hint:", error.hint);
      throw new Error(`Upsert falhou: ${error.message} | ${error.details ?? ""}`);
    }
    saved += Math.min(50, records.length - i);
  }
  return saved;
}

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // Modo diagnóstico: GET ?diag=1
  const url = new URL(req.url);
  if (url.searchParams.get("diag") === "1") {
    const resultado = await diagnosticarAuth();
    return Response.json({ diag: resultado }, { headers: CORS });
  }

  // Modo re-classificação total: POST ?reclassify=1
  if (url.searchParams.get("reclassify") === "1") {
    try {
      await getToken();
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      // Busca TODOS os registros com reclamada preenchida
      const { data, error } = await sb
        .from("pauta_audiencias")
        .select("id,processo,reclamada")
        .neq("reclamada", "")
        .not("reclamada", "is", null);
      if (error || !data?.length) return Response.json({ ok:false, error: error?.message ?? "Nenhum registro" }, { headers:CORS });

      const numeros = [...new Set((data as {processo:string}[]).map(r => r.processo).filter(Boolean))];
      const marcadoresMap = await fetchMarcadoresPorProcesso(numeros);

      let atualizados = 0;
      for (const row of data as {id:string; processo:string; reclamada:string}[]) {
        const marcadores = (marcadoresMap.get(row.processo ?? "") ?? []).join(",");
        const resp = calcularResponsabilidade(row.reclamada ?? "", marcadores);
        if (resp) {
          await sb.from("pauta_audiencias").update({ tipo_responsabilidade: resp }).eq("id", row.id);
          atualizados++;
        }
      }
      return Response.json({ ok:true, message:`${atualizados} registros reclassificados`, total: data.length, atualizados }, { headers:CORS });
    } catch(e) {
      return Response.json({ ok:false, error: String(e) }, { status:500, headers:CORS });
    }
  }

  try {
    console.log("=== Projuris ADV Sync " + new Date().toISOString() + " ===");
    if (!PROJURIS_CLIENT_ID || !PROJURIS_SECRET) return Response.json({ ok:false, error:"PROJURIS_CLIENT_ID/SECRET nao configurados" }, { status:500, headers:CORS });
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Aceita credenciais do usuário passadas no body
    let bodyData: Record<string,unknown> = {};
    try { bodyData = await req.json(); } catch { /* sem body */ }
    _runtimeUser = (typeof bodyData.projuris_usuario === "string" ? bodyData.projuris_usuario.trim() : "") || PROJURIS_USERNAME;
    _runtimePass = (typeof bodyData.projuris_senha   === "string" ? bodyData.projuris_senha.trim()   : "") || PROJURIS_PASSWORD;
    // Reseta cache se credenciais novas chegaram
    if (bodyData.projuris_usuario || bodyData.projuris_senha) _tokenCache = { access_token: "", expires_at: 0 };

    const raw = await fetchAudiencias();
    console.log("Total: " + raw.length);
    if (!raw.length) {
      // Debug: retorna informação sobre o que foi encontrado
      const debug = url.searchParams.get("debug") === "1";
      if (debug) {
        await getToken();
        const hoje = fmtDate(new Date());
        const fimD = fmtDate(new Date(Date.now() + DIAS_BUSCA*86400000));
        const calBody = JSON.stringify({ dataInicio: new Date(hoje+"T00:00:00Z").getTime(), dataFim: new Date(fimD+"T23:59:59Z").getTime() });
        const calResp = await fetch(`${PROJURIS_BASE}/adv-service/v2/tarefa/calendario/consulta-sem-paginacao`, { method:"POST", headers:authHeaders(), body:calBody });
        const calText = await calResp.text();
        return Response.json({ ok:true, message:"debug", periodo:`${hoje}~${fimD}`, calendario_status:calResp.status, calendario_body:calText.slice(0,2000) }, { headers:CORS });
      }
      await recordSync(sb,0); return Response.json({ ok:true, message:"Nenhuma audiencia encontrada", saved:0 }, { headers:CORS });
    }

    // Busca marcadores dos processos para enriquecer a classificação
    const numerosProcesso = [...new Set(
      (raw as Record<string,unknown>[])
        .map(r => str(r.numeroProcesso ?? r.numero_processo ?? r.processo ?? ""))
        .filter(Boolean)
    )];
    const marcadoresMap = await fetchMarcadoresPorProcesso(numerosProcesso);

    // Enriquece cada item com os marcadores do processo antes de normalizar
    const enriched = (raw as Record<string,unknown>[]).map(item => {
      const num = str(item.numeroProcesso ?? item.numero_processo ?? item.processo ?? "");
      const marcadores = marcadoresMap.get(num) ?? [];
      return marcadores.length ? { ...item, marcadores } : item;
    });

    const allRecords = enriched.map(normalizar);
    // Deduplica por ID (mesmo processo+data+hora pode gerar duplicatas no paginado)
    const seenIds = new Set<string>();
    const records = allRecords.filter(r => {
      const id = String(r.id);
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
    const saved   = await upsertSupabase(sb, records);
    const partesCompletadas = await completarPartesAusentes(sb);
    const classificados = await classificarExistentes(sb);
    await recordSync(sb, saved);
    console.log("Salvas: " + saved + " | Partes completadas: " + partesCompletadas + " | Classificadas: " + classificados);
    const debugMode = url.searchParams.get("debug") === "1";
    if (debugMode) {
      return Response.json({ ok:true, message:`${saved} audiencias sincronizadas`, saved, partesCompletadas, classificados, sample: records.slice(0,2), total_found: raw.length }, { headers:CORS });
    }
    return Response.json({ ok:true, message:`${saved} audiencias sincronizadas`, saved, partesCompletadas, classificados }, { headers:CORS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Erro:", msg);
    return Response.json({ ok:false, error:msg }, { status:500, headers:CORS });
  }
});