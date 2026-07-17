/**
 * whatsapp-notify — Falaw Advogados
 * Envia notificação WhatsApp (CallMeBot) para advogados internos.
 *
 * Roda a cada hora (pg_cron: "0 * * * *"). A cada execução envia para:
 *   1. Audiências do próximo dia útil cujo horário (HH) == hora atual em BRT
 *      → aviso chega ~24h antes (ou na sexta para segunda-feira)
 *   2. Audiências do próximo dia útil cadastradas/atualizadas na última hora
 *      que ainda NÃO foram notificadas (whatsapp_notificado_at IS NULL)
 *      → cobre urgências adicionadas fora do horário normal
 *
 * Regra de dia útil:
 *   - Sexta-feira → notifica audiências de segunda-feira (pula sáb/dom)
 *   - Sábado / Domingo → não envia nada
 *   - Demais dias → notifica audiências de amanhã
 *
 * Após envio, marca whatsapp_notificado_at para evitar reenvio.
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

/**
 * Retorna { data, skip } onde:
 *  - data: próximo dia útil a notificar (YYYY-MM-DD)
 *  - skip: true se hoje for sábado ou domingo
 * Sexta-feira → segunda-feira (+3); Sáb/Dom → skip; demais → amanhã (+1)
 */
function proximoDiaUtilBRT(): { data: string; skip: boolean } {
  const now = new Date();
  const brt = new Date(now.getTime() + BRT_OFFSET_H * 3600_000);
  const diaSemana = brt.getUTCDay(); // 0=Dom, 1=Seg … 5=Sex, 6=Sáb

  if (diaSemana === 0 || diaSemana === 6) {
    return { data: "", skip: true };
  }

  const diasAFrente = diaSemana === 5 ? 3 : 1; // Sexta → +3 (segunda); demais → +1
  brt.setUTCDate(brt.getUTCDate() + diasAFrente);
  return { data: brt.toISOString().slice(0, 10), skip: false };
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

function formatarMensagem(aud: Record<string, string>, advNome: string, dataAlvo: string): string {
  const data  = formatarData(aud.data_audiencia ?? aud.data ?? "");
  const hora  = aud.horario ?? aud.hora ?? "";
  const vara  = aud.vara ?? "";
  const recl  = aud.reclamada ?? "";
  const recl2 = aud.reclamante ?? "";
  const proc  = aud.processo ?? "";
  const tipo  = aud.tipo_audiencia ?? aud.tipo ?? "";
  const resp  = aud.tipo_responsabilidade ?? "";
  const modal = (aud.modalidade ?? "PRESENCIAL").toUpperCase();
  const link  = aud.link ?? "";
  const senha = aud.id_senha ?? "";

  // Determina o texto do prazo: "amanhã" ou "na segunda-feira"
  const hoje = new Date();
  const brt  = new Date(hoje.getTime() + BRT_OFFSET_H * 3600_000);
  const diaSemana = brt.getUTCDay();
  const prazoTexto = diaSemana === 5 ? "segunda-feira" : "amanhã";

  const linhas = [
    `🚨*Lembrete de Audiência*`,
    ``,
    `Olá, *${advNome}*! 👋`,
    ``,
    `Você tem uma audiência ${diaSemana === 5 ? "na *segunda-feira*" : "*amanhã*"}:`,
    ``,
    `📅 *Data:* ${data}`,
    hora  ? `🕐 *Horário:* ${hora}` : "",
    proc  ? `📁 *Processo:* ${proc}` : "",
    recl2 ? `👤 *Reclamante:* ${recl2}` : "",
    vara  ? `⚖️  *Vara:* ${vara}` : "",
    recl  ? `🏢 *Reclamada:* ${recl}` : "",
    tipo  ? `📋 *Tipo:* ${tipo}` : "",
    resp  ? `🔖 *Responsabilidade:* ${resp}` : "",
    `📍 *Modalidade:* ${modal}`,
    link  ? `🔗 *Link:* ${link}` : "",
    senha ? `🔑 *ID/Senha:* ${senha}` : "",
    ``,
    `_*Falaw Advogados*_`,
  ];
  return linhas.filter(l => l !== "").join("\n");
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Busca dados ───────────────────────────────────────────────────────────────

const COLS = "id,data_audiencia,horario,vara,reclamada,reclamante,processo,tipo_audiencia,modalidade,tipo_responsabilidade,link,id_senha,status,advogado";

/** Audiências do próximo dia útil cujo horário bate com a hora atual (seg-qui) */
async function buscarAudienciasNaHora(dataAlvo: string, sexta: boolean) {
  const hora = horaAtualBRT();

  let query = sb
    .from("pauta_audiencias")
    .select(COLS)
    .eq("data_audiencia", dataAlvo)
    .neq("status", "cancelada")
    .is("whatsapp_notificado_at", null)
    .order("horario", { ascending: true });

  // Na sexta envia todas (sem filtro de hora); nos demais dias filtra pela hora atual
  if (!sexta) {
    query = query.like("horario", `${hora}:%`);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`Supabase pauta (hora): ${error.message}`);
  return rows ?? [];
}

/** Audiências do próximo dia útil cadastradas/atualizadas na última hora e ainda não notificadas */
async function buscarAudienciasUrgentes(dataAlvo: string) {
  const ha1hora = new Date(Date.now() - 3600_000).toISOString();

  const { data: rows, error } = await sb
    .from("pauta_audiencias")
    .select(COLS)
    .eq("data_audiencia", dataAlvo)
    .neq("status", "cancelada")
    .is("whatsapp_notificado_at", null)
    .or(`created_at.gte.${ha1hora},updated_at.gte.${ha1hora}`)
    .order("horario", { ascending: true });

  if (error) throw new Error(`Supabase pauta (urgentes): ${error.message}`);
  return rows ?? [];
}

/** Marca audiências como notificadas */
async function marcarNotificadas(ids: string[]) {
  if (!ids.length) return;
  await sb
    .from("pauta_audiencias")
    .update({ whatsapp_notificado_at: new Date().toISOString() })
    .in("id", ids);
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
    const { data: dataAlvo, skip } = proximoDiaUtilBRT();

    if (skip) {
      return new Response(
        JSON.stringify({ ok: true, msg: `Fim de semana — sem envios.` }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const hoje = new Date();
    const brt  = new Date(hoje.getTime() + BRT_OFFSET_H * 3600_000);
    const sexta = brt.getUTCDay() === 5;

    // Busca as duas listas e une sem duplicatas
    const [porHora, urgentes] = await Promise.all([
      buscarAudienciasNaHora(dataAlvo, sexta),
      buscarAudienciasUrgentes(dataAlvo),
    ]);
    const idsVistos = new Set(porHora.map((a: {id: string}) => a.id));
    const audiencias = [...porHora, ...urgentes.filter((a: {id: string}) => !idsVistos.has(a.id))];

    if (!audiencias.length) {
      return new Response(
        JSON.stringify({ ok: true, msg: `Nenhuma audiência pendente para ${dataAlvo} às ${horaAtual}h.` }),
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
    const idsNotificados: string[] = [];

    for (const [numero, { info, auds }] of porNumero) {
      if (Date.now() - inicio > MAX_EXEC_MS) { abortado = true; break; }
      const advNome = (info.nome ?? "").split(" ")[0];
      for (const aud of auds) {
        if (Date.now() - inicio > MAX_EXEC_MS) { abortado = true; break; }
        const msg = formatarMensagem(aud as Record<string, string>, advNome, dataAlvo);
        const ok  = await enviarWhatsapp(numero, info.callmebot_apikey, msg);
        if (ok) { enviados++; idsNotificados.push(aud.id); } else erros++;
        await sleep(CALLMEBOT_DELAY_MS);
      }
    }

    await marcarNotificadas(idsNotificados);

    return new Response(
      JSON.stringify({ ok: true, hora_brt: `${horaAtual}h`, data_alvo: dataAlvo, enviados, erros, abortado, urgentes: urgentes.length, total_audiencias: audiencias.length }),
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
