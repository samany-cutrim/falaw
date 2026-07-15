/**
 * whatsapp-notify — Falaw Advogados
 * Envia notificação WhatsApp (CallMeBot) para advogados internos
 * com audiências no dia seguinte, no mesmo horário da audiência.
 *
 * Lógica: roda a cada hora (pg_cron: "0 * * * *").
 * A cada execução, busca audiências de amanhã cujo horário (HH:MM)
 * bate com a hora atual em BRT — garantindo que o aviso chega
 * exatamente 24h antes da audiência.
 *
 * Variáveis necessárias (Edge Functions → Secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CALLMEBOT_URL        = "https://api.callmebot.com/whatsapp.php";
const CALLMEBOT_DELAY_MS   = 2000; // 2s entre envios (CallMeBot free: ok até ~30 msg/min)
const MAX_EXEC_MS          = 120_000; // para antes de 150s (limite Supabase free)
const BRT_OFFSET_H         = -3; // UTC-3

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Retorna a data de amanhã em BRT no formato YYYY-MM-DD */
function amanhaEmBRT(): string {
  const now = new Date();
  const brt = new Date(now.getTime() + BRT_OFFSET_H * 3600_000);
  brt.setDate(brt.getDate() + 1);
  return brt.toISOString().slice(0, 10);
}

/** Retorna a hora atual em BRT como string "HH" (ex: "08") */
function horaAtualBRT(): string {
  const now = new Date();
  const brt = new Date(now.getTime() + BRT_OFFSET_H * 3600_000);
  return String(brt.getUTCHours()).padStart(2, "0");
}

function formatarNumero(celular: string): string | null {
  const digits = celular.replace(/\D/g, "");
  if (!digits) return null;
  const full = digits.startsWith("55") ? digits : "55" + digits;
  return full.length >= 12 ? full : null;
}

function formatarData(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatarMensagem(aud: Record<string, string>, advNome: string): string {
  const data  = formatarData(aud.data_audiencia ?? aud.data ?? "");
  const hora  = aud.horario ?? aud.hora ?? "";
  const vara  = aud.vara ?? "";
  const recl  = aud.reclamada ?? "";
  const tipo  = aud.tipo_audiencia ?? aud.tipo ?? "";
  const modal = (aud.modalidade ?? "PRESENCIAL").toUpperCase();

  const linhas = [
    `*Falaw Advogados — Lembrete de Audiência*`,
    ``,
    `Olá, *${advNome}*! 👋`,
    ``,
    `Você tem uma audiência *amanhã*:`,
    ``,
    `📅 *Data:* ${data}`,
    hora  ? `🕐 *Horário:* ${hora}` : "",
    vara  ? `⚖️  *Vara:* ${vara}`   : "",
    recl  ? `🏢 *Reclamada:* ${recl}` : "",
    tipo  ? `📋 *Tipo:* ${tipo}`    : "",
    `📍 *Modalidade:* ${modal}`,
    ``,
    `_Falaw Advogados_`,
  ];
  return linhas.filter(l => l !== "").join("\n");
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Busca dados ───────────────────────────────────────────────────────────────

async function buscarAudienciasNaHora() {
  const data  = amanhaEmBRT();
  const hora  = horaAtualBRT(); // ex: "08"

  // Busca audiências de amanhã cujo horario começa com a hora atual (ex: "08:")
  const { data: rows, error } = await sb
    .from("pauta_audiencias")
    .select("id,data_audiencia,horario,vara,reclamada,tipo_audiencia,modalidade,status,advogado")
    .eq("data_audiencia", data)
    .neq("status", "cancelada")
    .like("horario", `${hora}:%`)
    .order("horario", { ascending: true });

  if (error) throw new Error(`Supabase pauta: ${error.message}`);
  return rows ?? [];
}

async function buscarEquipe(): Promise<Map<string, Record<string, string>>> {
  const { data, error } = await sb
    .from("equipe")
    .select("nome,email,celular,callmebot_apikey,sigla");
  if (error) throw new Error(`Supabase equipe: ${error.message}`);

  const mapa = new Map<string, Record<string, string>>();
  for (const r of (data ?? [])) {
    const nome = (r.nome ?? "").trim();
    const cel  = (r.celular ?? "").trim();
    if (!nome || !cel) continue;
    mapa.set(nome.toLowerCase(), r);
    for (const token of nome.toLowerCase().split(" ")) {
      if (token.length > 2 && !mapa.has(token)) mapa.set(token, r);
    }
  }
  for (const r of (data ?? [])) {
    const sigla = (r.sigla ?? "").trim().toLowerCase();
    if (sigla && (r.celular ?? "").trim()) mapa.set(sigla, r);
  }
  return mapa;
}

// ── Envio CallMeBot ───────────────────────────────────────────────────────────

async function enviarWhatsapp(numero: string, apikey: string, mensagem: string): Promise<boolean> {
  const url = new URL(CALLMEBOT_URL);
  url.searchParams.set("phone",  `+${numero}`);
  url.searchParams.set("text",   mensagem);
  url.searchParams.set("apikey", apikey);

  try {
    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
    const body = (await r.text()).toUpperCase();
    if (r.status === 200 && !body.includes("INVALID") && !body.includes("ERROR")) return true;
    console.warn(`CallMeBot ${r.status}: ${body.slice(0, 200)}`);
    return false;
  } catch (e) {
    console.error(`Erro envio WhatsApp:`, e);
    return false;
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  try {
    const horaAtual = horaAtualBRT();
    const dataAmanha = amanhaEmBRT();

    const audiencias = await buscarAudienciasNaHora();
    if (!audiencias.length) {
      return new Response(
        JSON.stringify({ ok: true, msg: `Nenhuma audiência amanhã (${dataAmanha}) às ${horaAtual}h.` }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const equipe = await buscarEquipe();
    const porNumero = new Map<string, { info: Record<string, string>; auds: typeof audiencias }>();

    for (const aud of audiencias) {
      const advRaw = (aud.advogado ?? "").trim();
      if (!advRaw) continue;

      let advInfo = equipe.get(advRaw.toLowerCase());
      if (!advInfo) {
        for (const token of advRaw.toLowerCase().split(" ")) {
          advInfo = equipe.get(token);
          if (advInfo) break;
        }
      }
      if (!advInfo?.celular) continue;
      if (!(advInfo.callmebot_apikey ?? "").trim()) continue;

      const numero = formatarNumero(advInfo.celular);
      if (!numero) continue;

      if (!porNumero.has(numero)) porNumero.set(numero, { info: advInfo, auds: [] });
      porNumero.get(numero)!.auds.push(aud);
    }

    let enviados = 0; let erros = 0; let abortado = false;
    const inicio = Date.now();
    for (const [numero, { info, auds }] of porNumero) {
      if (Date.now() - inicio > MAX_EXEC_MS) { abortado = true; break; }
      const advNome = (info.nome ?? "").split(" ")[0];
      for (const aud of auds) {
        if (Date.now() - inicio > MAX_EXEC_MS) { abortado = true; break; }
        const msg = formatarMensagem(aud as Record<string, string>, advNome);
        const ok  = await enviarWhatsapp(numero, info.callmebot_apikey, msg);
        ok ? enviados++ : erros++;
        await sleep(CALLMEBOT_DELAY_MS);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, hora_brt: `${horaAtual}h`, data_amanha: dataAmanha, enviados, erros, abortado, total_audiencias: audiencias.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("whatsapp-notify error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});


import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CALLMEBOT_URL        = "https://api.callmebot.com/whatsapp.php";
const CALLMEBOT_DELAY_MS   = 5000; // pausa entre envios (API gratuita tem rate limit)

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────

function amanha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatarNumero(celular: string): string | null {
  const digits = celular.replace(/\D/g, "");
  if (!digits) return null;
  const full = digits.startsWith("55") ? digits : "55" + digits;
  return full.length >= 12 ? full : null;
}

function formatarData(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatarMensagem(aud: Record<string, string>, advNome: string): string {
  const data  = formatarData(aud.data_audiencia ?? aud.data ?? "");
  const hora  = aud.horario ?? aud.hora ?? "";
  const vara  = aud.vara ?? "";
  const recl  = aud.reclamada ?? "";
  const tipo  = aud.tipo_audiencia ?? aud.tipo ?? "";
  const modal = (aud.modalidade ?? "PRESENCIAL").toUpperCase();

  const linhas = [
    `*Falaw Advogados — Lembrete de Audiência*`,
    ``,
    `Olá, *${advNome}*! 👋`,
    ``,
    `Você tem uma audiência *amanhã*:`,
    ``,
    `📅 *Data:* ${data}`,
    hora  ? `🕐 *Horário:* ${hora}` : "",
    vara  ? `⚖️  *Vara:* ${vara}`   : "",
    recl  ? `🏢 *Reclamada:* ${recl}` : "",
    tipo  ? `📋 *Tipo:* ${tipo}`    : "",
    `📍 *Modalidade:* ${modal}`,
    ``,
    `_Falaw Advogados_`,
  ];
  return linhas.filter(l => l !== "").join("\n");
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Busca dados ───────────────────────────────────────────────────────────────

async function buscarAudienciasAmanha() {
  const { data, error } = await sb
    .from("pauta_audiencias")
    .select("id,data_audiencia,horario,vara,reclamada,tipo_audiencia,modalidade,status,advogado")
    .eq("data_audiencia", amanha())
    .neq("status", "cancelada")
    .order("horario", { ascending: true });
  if (error) throw new Error(`Supabase pauta: ${error.message}`);
  return data ?? [];
}

async function buscarEquipe(): Promise<Map<string, Record<string, string>>> {
  const { data, error } = await sb
    .from("equipe")
    .select("nome,email,celular,callmebot_apikey,sigla");
  if (error) throw new Error(`Supabase equipe: ${error.message}`);

  const mapa = new Map<string, Record<string, string>>();
  for (const r of (data ?? [])) {
    const nome = (r.nome ?? "").trim();
    const cel  = (r.celular ?? "").trim();
    if (!nome || !cel) continue;
    mapa.set(nome.toLowerCase(), r);
    for (const token of nome.toLowerCase().split(" ")) {
      if (token.length > 2 && !mapa.has(token)) mapa.set(token, r);
    }
  }
  // Siglas têm prioridade — sobrescrevem entradas anteriores
  for (const r of (data ?? [])) {
    const sigla = (r.sigla ?? "").trim().toLowerCase();
    if (sigla && (r.celular ?? "").trim()) mapa.set(sigla, r);
  }
  return mapa;
}

// ── Envio CallMeBot ───────────────────────────────────────────────────────────

async function enviarWhatsapp(numero: string, apikey: string, mensagem: string): Promise<boolean> {
  const url = new URL(CALLMEBOT_URL);
  url.searchParams.set("phone",  `+${numero}`);
  url.searchParams.set("text",   mensagem);
  url.searchParams.set("apikey", apikey);

  try {
    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
    const body = (await r.text()).toUpperCase();
    if (r.status === 200 && !body.includes("INVALID") && !body.includes("ERROR")) return true;
    console.warn(`CallMeBot ${r.status}: ${body.slice(0, 200)}`);
    return false;
  } catch (e) {
    console.error(`Erro envio WhatsApp ${numero}:`, e);
    return false;
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  try {
    const audiencias = await buscarAudienciasAmanha();
    if (!audiencias.length) {
      return new Response(JSON.stringify({ ok: true, msg: "Nenhuma audiência amanhã." }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const equipe = await buscarEquipe();

    // Agrupa por número para evitar duplicatas
    const porNumero = new Map<string, { info: Record<string, string>; auds: typeof audiencias }>();

    for (const aud of audiencias) {
      const advRaw = (aud.advogado ?? "").trim();
      if (!advRaw) continue;

      let advInfo = equipe.get(advRaw.toLowerCase());
      if (!advInfo) {
        for (const token of advRaw.toLowerCase().split(" ")) {
          advInfo = equipe.get(token);
          if (advInfo) break;
        }
      }
      if (!advInfo?.celular) continue;
      if (!(advInfo.callmebot_apikey ?? "").trim()) continue;

      const numero = formatarNumero(advInfo.celular);
      if (!numero) continue;

      if (!porNumero.has(numero)) porNumero.set(numero, { info: advInfo, auds: [] });
      porNumero.get(numero)!.auds.push(aud);
    }

    let enviados = 0; let erros = 0;
    for (const [numero, { info, auds }] of porNumero) {
      const advNome = (info.nome ?? "").split(" ")[0];
      // Envia uma mensagem por audiência
      for (const aud of auds) {
        const msg = formatarMensagem(aud as Record<string, string>, advNome);
        const ok  = await enviarWhatsapp(numero, info.callmebot_apikey, msg);
        ok ? enviados++ : erros++;
        await sleep(CALLMEBOT_DELAY_MS);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, enviados, erros, total_audiencias: audiencias.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("whatsapp-notify error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
