import { createClient } from "jsr:@supabase/supabase-js@2";

const PROJURIS_BASE    = (Deno.env.get("PROJURIS_BASE_URL") ?? "https://service.projurisadv.com.br").replace(/\/$/, "");
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
    // calendario: { tarefasAgrupadasDataTipoWs: [ { tarefaConsultaWs: [...] } ] }
    if (b.tarefasAgrupadasDataTipoWs) {
      const grupos = b.tarefasAgrupadasDataTipoWs as Record<string,unknown>[];
      return grupos.flatMap(g => (g.tarefaConsultaWs ?? []) as unknown[]);
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
  const fim = new Date(hoje); fim.setDate(fim.getDate() + DIAS_BUSCA);
  const ini = fmtDate(hoje), fimStr = fmtDate(fim);

  // 1. Tenta o calendário primeiro (retorna tarefas pendentes/abertas)
  let calTarefas: unknown[] = [];
  try {
    const tsIni = new Date(ini + "T00:00:00Z").getTime();
    const tsFim = new Date(fimStr + "T23:59:59Z").getTime();
    const url = `${PROJURIS_BASE}/adv-service/v2/tarefa/calendario/consulta-sem-paginacao`;
    const resp = await fetch(url, { method:"POST", headers:authHeaders(), body:JSON.stringify({dataInicio:tsIni, dataFim:tsFim}) });
    if (resp.ok) calTarefas = extractItems(await resp.json());
    console.log("Calendario: " + calTarefas.length);
  } catch(e) { console.warn("Calendario falhou: " + e); }

  const calAud = (calTarefas as Record<string,unknown>[]).filter(isAudiencia);
  if (calAud.length > 0) {
    console.log("Audiencias do calendario: " + calAud.length);
    return calAud;
  }

  // 2. Calendário não trouxe audiências — busca paginada
  // Usa ordenação DESC para pegar tarefas mais recentes primeiro
  console.log("Buscando via paginado...");
  const ITEMS_POR_PAG = 100;
  const MAX_TOTAL_PAGS = 15; // ~1500 itens para evitar timeout
  const audiencias: unknown[] = [];
  const tiposEncontrados = new Set<string>();

  for (let pagina = 0; pagina < MAX_TOTAL_PAGS; pagina++) {
    const params = new URLSearchParams({ "quan-registros": String(ITEMS_POR_PAG), pagina: String(pagina), "ordenacao-tipo":"DESC", "ordenacao-chave":"ORDENACAO_DATA_PREVISTA" });
    const resp = await fetch(`${PROJURIS_BASE}/adv-service/tarefa/consulta-com-paginacao?${params}`, { headers: authHeaders() });
    if (!resp.ok) { console.warn("Paginado pag " + pagina + " -> " + resp.status); break; }
    const body = await resp.json();
    const items = extractItems(body) as Record<string,unknown>[];
    if (!items.length) break;
    items.forEach(t => tiposEncontrados.add(String(t.nomeTarefaTipo ?? "")));
    const aud = items.filter(isAudiencia);
    audiencias.push(...aud);
    const total = (body as Record<string,unknown>).totalRegistros as number ?? 0;
    if ((pagina + 1) * ITEMS_POR_PAG >= total) break;
  }
  console.log("Tipos encontrados:", [...tiposEncontrados].join("|"));
  console.log("Audiencias paginado: " + audiencias.length);
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
  const reclamante = str(item.reclamante ?? item.poloAtivo ?? item.polo_ativo ?? item.autor ?? item.nomeEnvolvido);
  const reclamada  = str(item.reclamada  ?? item.poloPassivo ?? item.polo_passivo ?? item.reu ?? item.nomeCliente);
  const vara       = str(item.vara ?? item.orgaoJulgador ?? item.orgao_julgador ?? item.tribunal);
  const link       = str(item.linkVideoconferencia ?? item.link_video ?? item.link ?? item.urlVideoconferencia);
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
    processo, reclamante, reclamada,
    data_audiencia: data || new Date().toISOString().slice(0,10),
    horario: hora,
    tipo_audiencia,
    modalidade,
    vara,
    status: "agendada",
    origem: "pje",   // projuris-adv — usa 'pje' por compatibilidade com constraint
    link,
    id_senha: idSenha,
    advogado,
    comentarios,
    updated_at: new Date().toISOString(),
  };
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
    const records = (raw as Record<string,unknown>[]).map(normalizar);
    const saved   = await upsertSupabase(sb, records);
    await recordSync(sb, saved);
    console.log("Salvas: " + saved);
    const debugMode = url.searchParams.get("debug") === "1";
    if (debugMode) {
      return Response.json({ ok:true, message:`${saved} audiencias sincronizadas`, saved, sample: records.slice(0,2), total_found: raw.length }, { headers:CORS });
    }
    return Response.json({ ok:true, message:`${saved} audiencias sincronizadas`, saved }, { headers:CORS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Erro:", msg);
    return Response.json({ ok:false, error:msg }, { status:500, headers:CORS });
  }
});