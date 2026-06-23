/**
 * Supabase Edge Function — projuris-sync
 *
 * Modos de disparo:
 *  1. Cron automático (pg_cron no Supabase) — agendado via supabase-setup.sql
 *  2. Chamada manual — GET/POST para a URL no painel do Supabase
 *
 * Autenticação: OAuth2 client_credentials (Client ID + Secret do Projuris ADV)
 * Endpoints usados:
 *   Calendário : /adv-service/v2/tarefa/calendario/consulta-sem-paginacao
 *   Fallback   : /adv-service/tarefa/consulta-com-paginacao
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const PROJURIS_BASE    = (Deno.env.get("PROJURIS_BASE_URL") ?? "https://service.projurisadv.com.br").replace(/\/$/, "");
const PROJURIS_TOKEN_URL = Deno.env.get("PROJURIS_TOKEN_URL")
  ?? "https://identity.projurisadv.com.br/connect/token";
const PROJURIS_CLIENT_ID = Deno.env.get("PROJURIS_CLIENT_ID") ?? "";
const PROJURIS_SECRET    = Deno.env.get("PROJURIS_CLIENT_SECRET") ?? "";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DIAS_BUSCA           = parseInt(Deno.env.get("DIAS_PAUTA") ?? "365", 10);

const SB_TABLE   = "pauta_audiencias";
const SB_SYNCLOG = "sync_log";

// ── OAuth2 token cache ────────────────────────────────────────────────────────

let _tokenCache = { access_token: "", expires_at: 0 };

async function getToken(): Promise<string> {
  const now = Date.now() / 1000;
  if (_tokenCache.access_token && now < _tokenCache.expires_at - 60) {
    return _tokenCache.access_token;
  }

  // Tenta os endpoints de auth conhecidos do Projuris ADV
  const authUrls = [
    PROJURIS_TOKEN_URL,
    `${PROJURIS_BASE}/adv-service/oauth/token`,
    `${PROJURIS_BASE}/adv-service/auth/token`,
  ];

  for (const url of authUrls) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "client_credentials",
        client_id:     PROJURIS_CLIENT_ID,
        client_secret: PROJURIS_SECRET,
      }),
    });

    if (resp.ok) {
      const body = await resp.json();
      const access_token = body.access_token ?? body.token ?? "";
      const expires_in   = parseInt(body.expires_in ?? "3600", 10);
      if (!access_token) continue;
      _tokenCache = { access_token, expires_at: now + expires_in };
      console.log(`Token Projuris obtido via ${url}`);
      return access_token;
    }
  }

  throw new Error("Falha ao autenticar no Projuris ADV — verifique PROJURIS_CLIENT_ID e PROJURIS_CLIENT_SECRET");
}

function authHeaders(): Record<string, string> {
  return {
    "Authorization": `Bearer ${_tokenCache.access_token}`,
    "Content-Type":  "application/json",
    "Accept":        "application/json",
  };
}

// ── Último sync registrado ────────────────────────────────────────────────────

async function getLastSyncAt(sb: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    const { data } = await sb
      .from(SB_SYNCLOG)
      .select("synced_at")
      .eq("source", "projuris-adv")
      .order("synced_at", { ascending: false })
      .limit(1)
      .single();
    return (data as { synced_at: string } | null)?.synced_at ?? null;
  } catch { return null; }
}

async function recordSync(sb: ReturnType<typeof createClient>, count: number): Promise<void> {
  try {
    await sb.from(SB_SYNCLOG).insert({ source: "projuris-adv", synced_at: new Date().toISOString(), count });
  } catch { /* tabela pode não existir ainda */ }
}

// ── Busca de tarefas do Projuris ADV ─────────────────────────────────────────

function extractItems(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    return (b.content ?? b.data ?? b.tarefas ?? b.items ?? []) as unknown[];
  }
  return [];
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function fetchCalendario(dataInicio: string, dataFim: string): Promise<unknown[]> {
  const url = `${PROJURIS_BASE}/adv-service/v2/tarefa/calendario/consulta-sem-paginacao`;
  console.log(`  Calendário: ${dataInicio} → ${dataFim}`);
  const resp = await fetch(`${url}?dataInicio=${dataInicio}&dataFim=${dataFim}`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`Calendário ${resp.status}: ${await resp.text()}`);
  return extractItems(await resp.json());
}

async function fetchPaginado(dataInicio: string, dataFim: string): Promise<unknown[]> {
  const url = `${PROJURIS_BASE}/adv-service/tarefa/consulta-com-paginacao`;
  const all: unknown[] = [];
  let pagina = 0;

  while (true) {
    const params = new URLSearchParams({
      "quan-registros":  "100",
      "pagina":          String(pagina),
      "ordenacao-tipo":  "ASC",
      "ordenacao-chave": "ORDENACAO_DATA_PREVISTA",
      "dataInicio":      dataInicio,
      "dataFim":         dataFim,
    });
    console.log(`  Paginado página ${pagina}`);
    const resp = await fetch(`${url}?${params}`, { headers: authHeaders() });
    if (!resp.ok) throw new Error(`Paginado ${resp.status}: ${await resp.text()}`);
    const body  = await resp.json();
    const items = extractItems(body);
    all.push(...items);
    if (!items.length || items.length < 100) break;
    const total = (body as Record<string, unknown>).totalPages as number ?? 1;
    if (pagina + 1 >= total) break;
    pagina++;
  }
  return all;
}

const _TIPOS_AUDIENCIA = ["audiencia", "julgamento", "conciliacao", "instrucao", "sessao", "pauta"];

function isAudiencia(item: Record<string, unknown>): boolean {
  const tipo = String(item.tipoTarefa ?? item.tipo_tarefa ?? item.tipoEvento ?? item.tipo ?? "").toLowerCase();
  // Normaliza acentos
  const norm = tipo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return _TIPOS_AUDIENCIA.some(t => norm.includes(t));
}

async function fetchAudiencias(): Promise<unknown[]> {
  await getToken();

  const hoje = new Date();
  const fim  = new Date(hoje);
  fim.setDate(fim.getDate() + DIAS_BUSCA);
  const dataInicio = fmtDate(hoje);
  const dataFim    = fmtDate(fim);

  let tarefas: unknown[] = [];
  try {
    tarefas = await fetchCalendario(dataInicio, dataFim);
    console.log(`  Calendário: ${tarefas.length} tarefas`);
  } catch (e) {
    console.warn(`  Calendário falhou (${e}) — usando paginado`);
  }

  if (!tarefas.length) {
    tarefas = await fetchPaginado(dataInicio, dataFim);
    console.log(`  Paginado: ${tarefas.length} tarefas`);
  }

  const audiencias = (tarefas as Record<string, unknown>[]).filter(isAudiencia);
  console.log(`  Audiências filtradas: ${audiencias.length} de ${tarefas.length}`);
  return audiencias;
}

// ── Normalização ──────────────────────────────────────────────────────────────

function makeId(processo: string, data: string, hora: string): string {
  const raw = `projuris-adv|${processo}|${data}|${hora}`;
  let h = 0x811c9dc5;
  for (const c of new TextEncoder().encode(raw)) {
    h ^= c;
    h = (h * 0x01000193) >>> 0;
  }
  return `adv-${h.toString(16).padStart(8, "0")}`;
}

function parseData(raw: string): { data: string; hora: string } {
  if (!raw) return { data: "", hora: "" };
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
         ?? raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return { data: m[1], hora: m[2] ?? "" };
  const dm = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}:\d{2})?/);
  if (dm) return { data: `${dm[3]}-${dm[2]}-${dm[1]}`, hora: dm[4] ?? "" };
  return { data: "", hora: "" };
}

function str(v: unknown): string { return v == null ? "" : String(v).trim(); }

function normalizar(item: Record<string, unknown>): Record<string, unknown> {
  const _datas = ["dataPrevista", "data_prevista", "dataAudiencia", "data_audiencia", "dataInicio", "data", "dtEvento"];
  const _horas = ["horaPrevista", "hora_prevista", "horaAudiencia", "hora_audiencia", "horaInicio", "hora", "horario"];
  const dataRaw = str(_datas.map(k => item[k]).find(v => v));
  const horaRaw = str(_horas.map(k => item[k]).find(v => v));
  const { data, hora: horaFallback } = parseData(dataRaw);
  const hora = horaRaw ? horaRaw.slice(0, 5) : horaFallback;

  const processo   = str(item.numeroProcesso ?? item.numero_processo ?? item.processo ?? item.nrProcesso);
  const reclamante = str(item.reclamante ?? item.poloAtivo ?? item.polo_ativo ?? item.autor);
  const reclamada  = str(item.reclamada  ?? item.poloPassivo ?? item.polo_passivo ?? item.reu);
  const tipo       = str(item.tipoAudiencia ?? item.tipo_audiencia ?? item.tipoEvento ?? item.tipo ?? "AUDIÊNCIA").toUpperCase().slice(0, 30);
  const modalidade = str(item.modalidade ?? item.tipoSessao ?? item.tipo_sessao).toUpperCase().slice(0, 20);
  const vara       = str(item.vara ?? item.orgaoJulgador ?? item.orgao_julgador ?? item.tribunal);
  const link       = str(item.linkVideoconferencia ?? item.link_video ?? item.link ?? item.urlVideoconferencia);
  let   responsavel = item.responsavel ?? item.advogadoResponsavel ?? item.advogado ?? "";
  if (typeof responsavel === "object" && responsavel !== null)
    responsavel = (responsavel as Record<string, unknown>).nome ?? (responsavel as Record<string, unknown>).name ?? "";

  const mid   = str(item.meetingId ?? item.meeting_id ?? item.idReuniao);
  const senha = str(item.senha ?? item.password ?? item.codigoAcesso);
  const idSenha = [mid && `ID: ${mid}`, senha && `Senha: ${senha}`].filter(Boolean).join(" | ");

  return {
    id: makeId(processo, data, hora),
    processo, reclamante, reclamada,
    data_audiencia: data, horario: hora,
    tipo_audiencia: tipo, modalidade, vara,
    status:     "agendada",
    origem:     "projuris-adv",
    link,       id_senha: idSenha,
    responsavel: str(responsavel),
    updated_at: new Date().toISOString(),
  };
}

// ── Upsert Supabase ───────────────────────────────────────────────────────────

async function upsertSupabase(
  sb: ReturnType<typeof createClient>,
  records: Record<string, unknown>[],
): Promise<number> {
  if (!records.length) return 0;
  let saved = 0;
  for (let i = 0; i < records.length; i += 50) {
    const { error } = await sb
      .from(SB_TABLE)
      .upsert(records.slice(i, i + 50), { onConflict: "id" });
    if (error) console.error(`Upsert erro (batch ${i / 50}):`, error.message);
    else saved += Math.min(50, records.length - i);
  }
  return saved;
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
  try {
    console.log(`=== Projuris ADV Sync — ${new Date().toISOString()} ===`);

    if (!PROJURIS_CLIENT_ID || !PROJURIS_SECRET) {
      return Response.json({ ok: false, error: "PROJURIS_CLIENT_ID / PROJURIS_CLIENT_SECRET não configurados" }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const lastSyncAt = await getLastSyncAt(sb);
    if (lastSyncAt) console.log(`  Último sync: ${lastSyncAt}`);
    else            console.log("  Primeiro sync — fetch completo");

    const raw     = await fetchAudiencias();
    console.log(`Total recebido: ${raw.length}`);

    if (!raw.length) {
      await recordSync(sb, 0);
      return Response.json({ ok: true, message: "Nenhuma audiência encontrada", saved: 0 });
    }

    const records = (raw as Record<string, unknown>[]).map(normalizar);
    const saved   = await upsertSupabase(sb, records);
    await recordSync(sb, saved);

    console.log(`Salvas/atualizadas: ${saved} | === Concluído ===`);
    return Response.json({ ok: true, message: `${saved} audiências sincronizadas`, saved });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Erro:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});

 * Estratégia de eficiência:
 *  - Registra cada execução em `sync_log` (tabela leve no Supabase)
 *  - Na próxima execução, tenta buscar só registros modificados desde o último sync
 *    via parâmetro `updatedSince` (ajuste o nome conforme doc do Projuris)
 *  - Fallback automático para fetch completo se o Projuris não aceitar o parâmetro
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const PROJURIS_API_URL     = Deno.env.get("PROJURIS_API_URL")         ?? "";
const PROJURIS_TOKEN_URL   = Deno.env.get("PROJURIS_TOKEN_URL")
  ?? "https://login.projurisadv.com.br/realms/projurisadv-realm/protocol/openid-connect/token";
const PROJURIS_CLIENT_ID   = Deno.env.get("PROJURIS_CLIENT_ID")       ?? "";
const PROJURIS_SECRET      = Deno.env.get("PROJURIS_CLIENT_SECRET")   ?? "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")             ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DIAS_BUSCA           = parseInt(Deno.env.get("DIAS_BUSCA") ?? "365", 10);

const SB_TABLE   = "pauta_audiencias";
const SB_SYNCLOG = "sync_log";

// ── OAuth2 token cache ────────────────────────────────────────────────────────

let _tokenCache = { access_token: "", expires_at: 0 };

async function getToken(): Promise<string> {
  const now = Date.now() / 1000;
  if (_tokenCache.access_token && now < _tokenCache.expires_at - 60) {
    return _tokenCache.access_token;
  }

  const resp = await fetch(PROJURIS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     PROJURIS_CLIENT_ID,
      client_secret: PROJURIS_SECRET,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Projuris auth falhou: ${resp.status} ${await resp.text()}`);
  }

  const body = await resp.json();
  const access_token = body.access_token ?? body.token ?? "";
  const expires_in   = parseInt(body.expires_in ?? "3600", 10);

  if (!access_token) throw new Error(`Token vazio na resposta: ${JSON.stringify(body)}`);

  _tokenCache = { access_token, expires_at: now + expires_in };
  return access_token;
}

function authHeaders(): Record<string, string> {
  return {
    "Authorization": `Bearer ${_tokenCache.access_token}`,
    "Content-Type":  "application/json",
    "Accept":        "application/json",
  };
}

// ── Último sync registrado ────────────────────────────────────────────────────

async function getLastSyncAt(sb: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    const { data } = await sb
      .from(SB_SYNCLOG)
      .select("synced_at")
      .eq("source", "projuris")
      .order("synced_at", { ascending: false })
      .limit(1)
      .single();
    return (data as { synced_at: string } | null)?.synced_at ?? null;
  } catch { return null; }
}

async function recordSync(sb: ReturnType<typeof createClient>, count: number): Promise<void> {
  try {
    await sb.from(SB_SYNCLOG).insert({ source: "projuris", synced_at: new Date().toISOString(), count });
  } catch { /* tabela pode não existir ainda */ }
}

// ── Busca de audiências (delta ou completa) ───────────────────────────────────

function extractItems(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    return (b.content ?? b.data ?? b.audiencias ?? b.items ?? []) as unknown[];
  }
  return [];
}

async function fetchAudiencias(lastSyncAt: string | null): Promise<unknown[]> {
  await getToken();

  const hoje = new Date();
  const fim  = new Date(hoje);
  fim.setDate(fim.getDate() + DIAS_BUSCA);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const allItems: unknown[] = [];
  let page = 0;
  let useDelta = !!lastSyncAt;

  while (true) {
    const params: Record<string, string> = {
      dataInicio: fmt(hoje),
      dataFim:    fmt(fim),
      tipo:       "audiencia",
      page:       String(page),
      size:       "200",
    };
    // Busca delta: só registros alterados desde o último sync
    // Ajuste o nome do parâmetro conforme documentação do Projuris:
    // candidatos: updatedSince, dataAtualizacao, modifiedAfter, updated_after
    if (useDelta && lastSyncAt) params["updatedSince"] = lastSyncAt;

    const resp = await fetch(
      `${PROJURIS_API_URL}/audiencias?${new URLSearchParams(params)}`,
      { headers: authHeaders() },
    );

    // Se Projuris não aceitar updatedSince, cai em fetch completo
    if (resp.status === 400 && useDelta) {
      console.log("  Projuris não suporta delta — fazendo fetch completo");
      useDelta = false;
      continue;
    }
    if (resp.status === 404) {
      console.warn("Endpoint /audiencias retornou 404 — verifique PROJURIS_API_URL");
      break;
    }
    if (!resp.ok) throw new Error(`Projuris /audiencias ${resp.status}: ${await resp.text()}`);

    const body = await resp.json();
    const items = extractItems(body);

    if (!items.length) break;
    allItems.push(...items);
    console.log(`  ${useDelta ? "Delta" : "Completo"} — página ${page}: ${items.length} (total: ${allItems.length})`);

    const totalPages: number = (body as Record<string, unknown>).totalPages as number
      ?? (body as Record<string, unknown>).total_pages as number ?? 1;
    if (page + 1 >= totalPages || items.length < 200) break;
    page++;
  }

  return allItems;
}

// ── Normalização ──────────────────────────────────────────────────────────────

function makeId(processo: string, data: string, hora: string): string {
  const raw = `projuris|${processo}|${data}|${hora}`;
  let h = 0x811c9dc5;
  for (const c of new TextEncoder().encode(raw)) {
    h ^= c;
    h = (h * 0x01000193) >>> 0;
  }
  return `prj-${h.toString(16).padStart(8, "0")}`;
}

function parseData(raw: string): { data: string; hora: string } {
  if (!raw) return { data: "", hora: "" };
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
         ?? raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return { data: m[1], hora: m[2] ?? "" };
  const dm = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}:\d{2})?/);
  if (dm) return { data: `${dm[3]}-${dm[2]}-${dm[1]}`, hora: dm[4] ?? "" };
  return { data: "", hora: "" };
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function normalizar(item: Record<string, unknown>): Record<string, unknown> {
  const dataRaw = str(item.dataAudiencia ?? item.data_audiencia ?? item.data ?? item.dtAudiencia);
  const horaRaw = str(item.horaAudiencia ?? item.hora_audiencia ?? item.hora ?? item.horario);
  const { data, hora: horaFallback } = parseData(dataRaw);
  const hora = horaRaw ? horaRaw.slice(0, 5) : horaFallback;

  const processo   = str(item.numeroProcesso ?? item.numero_processo ?? item.processo ?? item.nrProcesso);
  const reclamante = str(item.reclamante ?? item.polo_ativo ?? item.poloAtivo ?? item.autor);
  const reclamada  = str(item.reclamada  ?? item.polo_passivo ?? item.poloPassivo ?? item.reu);
  const tipo       = str(item.tipoAudiencia ?? item.tipo_audiencia ?? item.tipo ?? "AUDIENCIA").toUpperCase().slice(0, 30);
  const modalidade = str(item.modalidade ?? item.tipoSessao ?? item.tipo_sessao).toUpperCase().slice(0, 20);
  const vara       = str(item.vara ?? item.orgaoJulgador ?? item.orgao_julgador ?? item.tribunal);
  const link       = str(item.linkVideoconferencia ?? item.link_video ?? item.link ?? item.urlVideoconferencia);

  const meetingId = str(item.meetingId ?? item.meeting_id ?? item.idReuniao);
  const senha     = str(item.senha ?? item.password ?? item.codigoAcesso);
  const idSenhaParts: string[] = [];
  if (meetingId) idSenhaParts.push(`ID: ${meetingId}`);
  if (senha)     idSenhaParts.push(`Senha: ${senha}`);

  return {
    id: makeId(processo, data, hora),
    processo, reclamante, reclamada,
    data_audiencia: data, horario: hora,
    tipo_audiencia: tipo, modalidade, vara,
    status:   "agendada",
    origem:   "projuris",
    link,
    id_senha: idSenhaParts.join(" | "),
    updated_at: new Date().toISOString(),
  };
}

// ── Upsert Supabase ───────────────────────────────────────────────────────────

async function upsertSupabase(
  sb: ReturnType<typeof createClient>,
  records: Record<string, unknown>[],
): Promise<number> {
  if (!records.length) return 0;
  let saved = 0;
  for (let i = 0; i < records.length; i += 50) {
    const { error } = await sb
      .from(SB_TABLE)
      .upsert(records.slice(i, i + 50), { onConflict: "id" });
    if (error) console.error(`Upsert erro (batch ${i / 50}):`, error.message);
    else saved += Math.min(50, records.length - i);
  }
  return saved;
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
    console.log(`=== Projuris Sync — ${new Date().toISOString()} ===`);

    if (!PROJURIS_API_URL) {
      return Response.json({ ok: false, error: "PROJURIS_API_URL não configurada" }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Suporte a webhook: se o Projuris enviou os dados no body, usa-os diretamente
    let rawFromWebhook: unknown[] | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        const items = Array.isArray(body) ? body : extractItems(body);
        if (items.length > 0) {
          rawFromWebhook = items;
          console.log(`  Webhook recebido com ${items.length} item(s)`);
        }
      } catch { /* body vazio ou não-JSON — faz fetch normal */ }
    }

    const lastSyncAt = rawFromWebhook ? null : await getLastSyncAt(sb);
    if (lastSyncAt) console.log(`  Último sync: ${lastSyncAt} — tentando busca delta`);
    else            console.log("  Primeiro sync ou webhook — fetch completo");

    const raw     = rawFromWebhook ?? await fetchAudiencias(lastSyncAt);
    console.log(`Total recebido: ${raw.length}`);

    if (!raw.length) {
      await recordSync(sb, 0);
      return Response.json({ ok: true, message: "Nenhuma audiência nova/alterada", saved: 0 });
    }

    const records = (raw as Record<string, unknown>[]).map(normalizar);
    const saved   = await upsertSupabase(sb, records);
    await recordSync(sb, saved);

    console.log(`Salvas/atualizadas: ${saved} | === Concluído ===`);
    return Response.json({ ok: true, message: `${saved} audiências sincronizadas`, saved });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Erro:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
