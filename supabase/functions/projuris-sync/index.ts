import { createClient } from "jsr:@supabase/supabase-js@2";

const PROJURIS_BASE    = (Deno.env.get("PROJURIS_BASE_URL") ?? "https://service.projurisadv.com.br").replace(/\/$/, "");
const PROJURIS_TOKEN_URL = Deno.env.get("PROJURIS_TOKEN_URL") ?? "https://identity.projurisadv.com.br/connect/token";
const PROJURIS_CLIENT_ID = Deno.env.get("PROJURIS_CLIENT_ID") ?? "";
const PROJURIS_SECRET    = Deno.env.get("PROJURIS_CLIENT_SECRET") ?? "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DIAS_BUSCA           = parseInt(Deno.env.get("DIAS_PAUTA") ?? "365", 10);
const SB_TABLE   = "pauta_audiencias";
const SB_SYNCLOG = "sync_log";

let _tokenCache = { access_token: "", expires_at: 0 };

async function getToken(): Promise<string> {
  const now = Date.now() / 1000;
  if (_tokenCache.access_token && now < _tokenCache.expires_at - 60) return _tokenCache.access_token;
  const urls = [PROJURIS_TOKEN_URL, `${PROJURIS_BASE}/adv-service/oauth/token`, `${PROJURIS_BASE}/adv-service/auth/token`];
  for (const url of urls) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: PROJURIS_CLIENT_ID, client_secret: PROJURIS_SECRET }),
    });
    if (resp.ok) {
      const body = await resp.json();
      const token = body.access_token ?? body.token ?? "";
      if (!token) continue;
      _tokenCache = { access_token: token, expires_at: now + parseInt(body.expires_in ?? "3600", 10) };
      console.log("Token obtido via " + url);
      return token;
    }
  }
  throw new Error("Falha ao autenticar no Projuris ADV");
}

function authHeaders(): Record<string, string> {
  return { "Authorization": `Bearer ${_tokenCache.access_token}`, "Content-Type": "application/json", "Accept": "application/json" };
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
    return (b.content ?? b.data ?? b.tarefas ?? b.items ?? []) as unknown[];
  }
  return [];
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

async function fetchCalendario(ini: string, fim: string): Promise<unknown[]> {
  const url = `${PROJURIS_BASE}/adv-service/v2/tarefa/calendario/consulta-sem-paginacao?dataInicio=${ini}&dataFim=${fim}`;
  console.log("Calendario: " + ini + " -> " + fim);
  const resp = await fetch(url, { headers: authHeaders() });
  if (!resp.ok) throw new Error("Calendario " + resp.status + ": " + await resp.text());
  return extractItems(await resp.json());
}

async function fetchPaginado(ini: string, fim: string): Promise<unknown[]> {
  const all: unknown[] = [];
  let pagina = 0;
  while (true) {
    const params = new URLSearchParams({ "quan-registros":"100", pagina: String(pagina), "ordenacao-tipo":"ASC", "ordenacao-chave":"ORDENACAO_DATA_PREVISTA", dataInicio:ini, dataFim:fim });
    const resp = await fetch(`${PROJURIS_BASE}/adv-service/tarefa/consulta-com-paginacao?${params}`, { headers: authHeaders() });
    if (!resp.ok) throw new Error("Paginado " + resp.status);
    const body = await resp.json();
    const items = extractItems(body);
    all.push(...items);
    if (!items.length || items.length < 100) break;
    const total = (body as Record<string,unknown>).totalPages as number ?? 1;
    if (pagina + 1 >= total) break;
    pagina++;
  }
  return all;
}

const TIPOS_AUD = ["audiencia","julgamento","conciliacao","instrucao","sessao","pauta"];
function isAudiencia(item: Record<string,unknown>): boolean {
  const tipo = String(item.tipoTarefa ?? item.tipo_tarefa ?? item.tipoEvento ?? item.tipo ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  return TIPOS_AUD.some(t => tipo.includes(t));
}

async function fetchAudiencias(): Promise<unknown[]> {
  await getToken();
  const hoje = new Date();
  const fim = new Date(hoje); fim.setDate(fim.getDate() + DIAS_BUSCA);
  const ini = fmtDate(hoje), fimStr = fmtDate(fim);
  let tarefas: unknown[] = [];
  try { tarefas = await fetchCalendario(ini, fimStr); console.log("Calendario: " + tarefas.length); }
  catch (e) { console.warn("Calendario falhou: " + e); }
  if (!tarefas.length) { tarefas = await fetchPaginado(ini, fimStr); console.log("Paginado: " + tarefas.length); }
  const aud = (tarefas as Record<string,unknown>[]).filter(isAudiencia);
  console.log("Audiencias filtradas: " + aud.length + " de " + tarefas.length);
  return aud;
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
  const DATAS = ["dataPrevista","data_prevista","dataAudiencia","data_audiencia","dataInicio","data","dtEvento"];
  const HORAS = ["horaPrevista","hora_prevista","horaAudiencia","hora_audiencia","horaInicio","hora","horario"];
  const dataRaw = str(DATAS.map(k=>item[k]).find(v=>v));
  const horaRaw = str(HORAS.map(k=>item[k]).find(v=>v));
  const { data, hora: horaFb } = parseData(dataRaw);
  const hora = horaRaw ? horaRaw.slice(0,5) : horaFb;
  const processo   = str(item.numeroProcesso ?? item.numero_processo ?? item.processo ?? item.nrProcesso);
  const reclamante = str(item.reclamante ?? item.poloAtivo ?? item.polo_ativo ?? item.autor);
  const reclamada  = str(item.reclamada  ?? item.poloPassivo ?? item.polo_passivo ?? item.reu);
  const tipo       = str(item.tipoAudiencia ?? item.tipo_audiencia ?? item.tipoEvento ?? item.tipo ?? "AUDIENCIA").toUpperCase().slice(0,30);
  const modalidade = str(item.modalidade ?? item.tipoSessao ?? item.tipo_sessao).toUpperCase().slice(0,20);
  const vara       = str(item.vara ?? item.orgaoJulgador ?? item.orgao_julgador ?? item.tribunal);
  const link       = str(item.linkVideoconferencia ?? item.link_video ?? item.link ?? item.urlVideoconferencia);
  let resp: unknown = item.responsavel ?? item.advogadoResponsavel ?? item.advogado ?? "";
  if (typeof resp === "object" && resp !== null) resp = (resp as Record<string,unknown>).nome ?? (resp as Record<string,unknown>).name ?? "";
  const mid = str(item.meetingId ?? item.meeting_id ?? item.idReuniao);
  const senha = str(item.senha ?? item.password ?? item.codigoAcesso);
  const idSenha = [mid && `ID: ${mid}`, senha && `Senha: ${senha}`].filter(Boolean).join(" | ");
  return { id: makeId(processo,data,hora), processo, reclamante, reclamada, data_audiencia:data, horario:hora, tipo_audiencia:tipo, modalidade, vara, status:"agendada", origem:"projuris-adv", link, id_senha:idSenha, responsavel:str(resp), updated_at: new Date().toISOString() };
}

async function upsertSupabase(sb: ReturnType<typeof createClient>, records: Record<string,unknown>[]): Promise<number> {
  if (!records.length) return 0;
  let saved = 0;
  for (let i = 0; i < records.length; i += 50) {
    const { error } = await sb.from(SB_TABLE).upsert(records.slice(i,i+50), { onConflict:"id" });
    if (error) console.error("Upsert erro:", error.message);
    else saved += Math.min(50, records.length - i);
  }
  return saved;
}

Deno.serve(async (_req: Request) => {
  try {
    console.log("=== Projuris ADV Sync " + new Date().toISOString() + " ===");
    if (!PROJURIS_CLIENT_ID || !PROJURIS_SECRET) return Response.json({ ok:false, error:"PROJURIS_CLIENT_ID/SECRET nao configurados" }, { status:500 });
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const raw = await fetchAudiencias();
    console.log("Total: " + raw.length);
    if (!raw.length) { await recordSync(sb,0); return Response.json({ ok:true, message:"Nenhuma audiencia encontrada", saved:0 }); }
    const records = (raw as Record<string,unknown>[]).map(normalizar);
    const saved   = await upsertSupabase(sb, records);
    await recordSync(sb, saved);
    console.log("Salvas: " + saved);
    return Response.json({ ok:true, message:`${saved} audiencias sincronizadas`, saved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Erro:", msg);
    return Response.json({ ok:false, error:msg }, { status:500 });
  }
});