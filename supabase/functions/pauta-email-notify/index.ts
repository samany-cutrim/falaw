/**
 * pauta-email-notify — Falaw Advogados
 *
 * Detecta audiências recém-agendadas ou canceladas e envia e-mail automático:
 *   • Para o cliente cujo processo foi afetado (lookup na tabela `clients`)
 *   • Para o escritório (ESCRITORIO_EMAIL)
 *
 * Roda após cada projuris-sync via pg_cron, ou pode ser chamado manualmente.
 *
 * Variáveis de ambiente necessárias (Edge Functions → Secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GAS_EMAIL_URL   — URL do Google Apps Script Web App de envio de e-mail
 *   GAS_EMAIL_TOKEN — Token secreto configurado no Apps Script (SECRET_TOKEN)
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL    = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GAS_URL   = Deno.env.get("GAS_EMAIL_URL") ?? "";
const GAS_TOKEN = Deno.env.get("GAS_EMAIL_TOKEN") ?? "";

const ESCRITORIO_EMAIL = "audiencia@falaw.com.br";
// O cron roda 2x/dia (após cada projuris-sync, ~8h de intervalo); uma janela de só 120min
// deixava qualquer falha de envio (GAS fora do ar, secret errada) sem chance real de retry
// — na próxima execução do cron a linha já teria saído da janela. 48h dá margem para vários
// ciclos de retry sem reprocessar o histórico inteiro na primeira ativação.
const JANELA_MIN       = 48 * 60;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtData(iso: string): string {
  // "2026-08-04" → "04/08/2026"
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtHora(h: string): string {
  // "09:42" → "09h42"
  return h ? h.replace(":", "h") : "";
}

function diaSemana(iso: string): string {
  const dias = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
  const d = new Date(iso + "T12:00:00Z");
  return dias[d.getUTCDay()];
}

// ── Busca clientes do Supabase ────────────────────────────────────────────────

async function buscarClientes(sb: ReturnType<typeof createClient>): Promise<Record<string, unknown>[]> {
  // Coluna no banco é "notify_email" (snake_case) e "aliases" é TEXT[] — selecionar
  // com o nome errado ("notifyEmail") faz o PostgREST retornar erro e a função cair
  // silenciosamente para [] em todo cliente, deixando de enviar o e-mail ao cliente.
  const { data, error } = await sb.from("clients").select("company,email,notify_email,aliases");
  if (error) { console.warn("clients:", error.message); return []; }
  return (data ?? []) as Record<string, unknown>[];
}

// Mesma normalização usada em cliente/dashboard.html (_normalizarNomeCliente/_clienteToken):
// corta o nome da empresa no primeiro sufixo jurídico/genérico e usa só a marca.
// Sem isso, tokens como "brasil", "tecnologia" ou "ltda" (todos >3 chars) batem com
// o nome de QUALQUER empresa que contenha essas palavras, mandando o e-mail errado.
function clienteToken(company: string): string {
  let s = company.toUpperCase().trim();
  s = s.replace(/\s*(\(CLIENTE\)|\(R[ÉE]\)|S\/?A\.?|S\.A\.?|LTDA\.?|EIRELI|ME\b|EPP\b|AG[EÊ]NCIA|COM[EÉ]RCIO|COM\.BR|\.COM|IND[ÚU]STRIA|SERVI[ÇC]OS|DO BRASIL|BRASIL).*$/i, "");
  s = s.split(/[/|;]/)[0].trim().replace(/[,.]+$/, "").trim();
  return s.split(/\s+/)[0] ?? "";
}

// Aliases de cliente (grupos com várias razões sociais / pessoas — ex. Grupo Dória):
// mesma lógica usada em admin.html e cliente/dashboard.html (_aliasKey/_audMatchesAliases).
function extrairClienteTag(rec: string): string {
  if (!rec) return "";
  const f = rec.split(",").find(p => p.includes("(CLIENTE)"));
  return f ? f.replace(/\s*\(CLIENTE\)/gi, "").trim() : "";
}
function aliasKey(s: string): string {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s*\(CLIENTE\)/gi, "")
    .replace(/[.,]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}
function audMatchesAliases(aud: Record<string,string>, aliasKeys: Set<string>): boolean {
  if (!aliasKeys.size) return false;
  const tagKey = aliasKey(extrairClienteTag(aud.reclamada ?? ""));
  if (tagKey && aliasKeys.has(tagKey)) return true;
  const cliKey = aliasKey(aud.cliente ?? "");
  if (cliKey && aliasKeys.has(cliKey)) return true;
  const recKey = aliasKey(aud.reclamada ?? "");
  for (const ak of aliasKeys) { if (ak && recKey.includes(ak)) return true; }
  return false;
}

// Retorna e-mail de notificação do cliente que melhor casa com a audiência
function emailDoCliente(
  aud: Record<string, string>,
  clientes: Record<string, unknown>[]
): string {
  // 1ª tentativa: grupo com várias razões sociais/pessoas cadastradas (aliases)
  for (const c of clientes) {
    const aliases = Array.isArray(c.aliases) ? (c.aliases as string[]) : [];
    if (!aliases.length) continue;
    const aliasKeys = new Set(aliases.map(aliasKey).filter(Boolean));
    if (audMatchesAliases(aud, aliasKeys)) {
      return String(c.notify_email || c.email || "").trim();
    }
  }
  // 2ª tentativa: token derivado do nome cadastrado
  const campos = [aud.cliente ?? "", aud.reclamada ?? ""].join(" ").toUpperCase();
  for (const c of clientes) {
    const token = clienteToken(String(c.company ?? ""));
    if (token.length > 2 && campos.includes(token)) {
      return String(c.notify_email || c.email || "").trim();
    }
  }
  return "";
}

// ── Templates de e-mail ───────────────────────────────────────────────────────

function htmlAgendada(aud: Record<string,string>, paraCliente: boolean): string {
  const titulo = paraCliente
    ? `Audiência agendada — ${fmtData(aud.data_audiencia)}`
    : `[PAUTA] Nova audiência — ${aud.reclamada ?? aud.cliente ?? ""} · ${fmtData(aud.data_audiencia)}`;

  const intro = paraCliente
    ? `Informamos que foi agendada uma audiência em seu processo.`
    : `Uma nova audiência foi incluída na pauta.`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f2ef;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ef;">
<tr><td align="center" style="padding:40px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <tr><td style="background:#060E1A;padding:28px 40px;border-radius:4px 4px 0 0;">
    <img src="https://falaw.com.br/assets/images/Falaw/falaw.com.br/wp-content/uploads/2024/06/fa-logo-branco-1.png"
         alt="Falaw Advogados" style="display:block;height:32px;width:auto;margin-bottom:10px;" />
    <p style="font-family:monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#4a90d9;margin:0;">
      PAUTA DE AUDIÊNCIAS
    </p>
  </td></tr>

  <tr><td style="background:#ffffff;padding:40px 40px 32px;">
    <p style="font-family:monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#2e7d32;margin:0 0 16px 0;">
      ✅ AUDIÊNCIA AGENDADA
    </p>
    <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#060E1A;margin:0 0 24px 0;line-height:1.3;">
      ${titulo}
    </h1>
    <p style="font-family:Georgia,serif;font-size:16px;line-height:1.8;color:#1a1a1a;margin:0 0 28px 0;">
      ${intro}
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e8e4df;border-radius:3px;margin-bottom:28px;">
      ${row("Data",       `${fmtData(aud.data_audiencia)} — ${diaSemana(aud.data_audiencia)}`)}
      ${row("Horário",    fmtHora(aud.horario ?? ""))}
      ${row("Tipo",       aud.tipo_audiencia ?? "")}
      ${row("Modalidade", aud.modalidade ?? "")}
      ${aud.vara       ? row("Vara / Local", aud.vara)       : ""}
      ${aud.processo   ? row("Processo",     aud.processo)   : ""}
      ${aud.reclamante ? row("Reclamante",   aud.reclamante) : ""}
      ${aud.reclamada  ? row("Reclamada",    aud.reclamada)  : ""}
      ${aud.link       ? row("Link",         `<a href="${aud.link}" style="color:#0D2B5E;">${aud.link}</a>`) : ""}
    </table>

    <p style="font-family:Georgia,serif;font-size:14px;line-height:1.7;color:#555;margin:0;">
      Em caso de dúvidas, entre em contato com o escritório.
    </p>
  </td></tr>

  <tr><td style="background:#f7f5f2;padding:20px 40px;border-radius:0 0 4px 4px;border-top:1px solid #e8e4df;">
    <p style="font-family:monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#7A7672;margin:0 0 4px 0;">FALAW ADVOGADOS</p>
    <p style="font-family:monospace;font-size:9px;color:#b0aba5;margin:0;">Av. Francisco Matarazzo, 1752 · Salas 414 e 415 · São Paulo / SP</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

function htmlCancelada(aud: Record<string,string>, paraCliente: boolean): string {
  const titulo = paraCliente
    ? `Audiência cancelada — ${fmtData(aud.data_audiencia)}`
    : `[PAUTA] Audiência cancelada — ${aud.reclamada ?? aud.cliente ?? ""} · ${fmtData(aud.data_audiencia)}`;

  const intro = paraCliente
    ? `Informamos que a audiência abaixo foi <strong>cancelada</strong>.`
    : `A audiência abaixo foi removida/cancelada no sistema.`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f2ef;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ef;">
<tr><td align="center" style="padding:40px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <tr><td style="background:#060E1A;padding:28px 40px;border-radius:4px 4px 0 0;">
    <img src="https://falaw.com.br/assets/images/Falaw/falaw.com.br/wp-content/uploads/2024/06/fa-logo-branco-1.png"
         alt="Falaw Advogados" style="display:block;height:32px;width:auto;margin-bottom:10px;" />
    <p style="font-family:monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#4a90d9;margin:0;">
      PAUTA DE AUDIÊNCIAS
    </p>
  </td></tr>

  <tr><td style="background:#ffffff;padding:40px 40px 32px;">
    <p style="font-family:monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#C62828;margin:0 0 16px 0;">
      ❌ AUDIÊNCIA CANCELADA
    </p>
    <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#060E1A;margin:0 0 24px 0;line-height:1.3;">
      ${titulo}
    </h1>
    <p style="font-family:Georgia,serif;font-size:16px;line-height:1.8;color:#1a1a1a;margin:0 0 28px 0;">
      ${intro}
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #fecaca;border-radius:3px;margin-bottom:28px;background:#fff5f5;">
      ${row("Data",       `${fmtData(aud.data_audiencia)} — ${diaSemana(aud.data_audiencia)}`)}
      ${row("Horário",    fmtHora(aud.horario ?? ""))}
      ${row("Tipo",       aud.tipo_audiencia ?? "")}
      ${row("Modalidade", aud.modalidade ?? "")}
      ${aud.vara       ? row("Vara / Local", aud.vara)       : ""}
      ${aud.processo   ? row("Processo",     aud.processo)   : ""}
      ${aud.reclamante ? row("Reclamante",   aud.reclamante) : ""}
      ${aud.reclamada  ? row("Reclamada",    aud.reclamada)  : ""}
    </table>

    <p style="font-family:Georgia,serif;font-size:14px;line-height:1.7;color:#555;margin:0;">
      Em caso de dúvidas, entre em contato com o escritório.
    </p>
  </td></tr>

  <tr><td style="background:#f7f5f2;padding:20px 40px;border-radius:0 0 4px 4px;border-top:1px solid #e8e4df;">
    <p style="font-family:monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#7A7672;margin:0 0 4px 0;">FALAW ADVOGADOS</p>
    <p style="font-family:monospace;font-size:9px;color:#b0aba5;margin:0;">Av. Francisco Matarazzo, 1752 · Salas 414 e 415 · São Paulo / SP</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

function row(label: string, value: string): string {
  if (!value || value === "—") return "";
  return `<tr>
    <td style="padding:10px 20px;font-family:monospace;font-size:11px;color:#7A7672;width:38%;border-bottom:1px solid #f0ede8;">${label}</td>
    <td style="padding:10px 20px;font-family:monospace;font-size:12px;color:#060E1A;font-weight:600;border-bottom:1px solid #f0ede8;">${value}</td>
  </tr>`;
}

// ── Envio via Google Apps Script ──────────────────────────────────────────────

async function enviarEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!GAS_URL) { console.warn("GAS_EMAIL_URL não configurado"); return false; }
  if (!to)      { console.warn("Destinatário vazio — e-mail não enviado"); return false; }
  try {
    const resp = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, html, token: GAS_TOKEN }),
    });
    const body = await resp.text();
    if (!resp.ok) { console.error(`GAS HTTP ${resp.status}: ${body.slice(0,200)}`); return false; }
    const json = JSON.parse(body);
    return json.ok === true;
  } catch (e) {
    console.error("enviarEmail:", e);
    return false;
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    if (!SB_URL || !SB_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados");

    const sb = createClient(SB_URL, SB_KEY);
    const agora = new Date();
    const janela = new Date(agora.getTime() - JANELA_MIN * 60_000).toISOString();

    const clientes = await buscarClientes(sb);

    // ── 1. Audiências recém-AGENDADAS não notificadas ──────────────────────
    const { data: novas } = await sb
      .from("pauta_audiencias")
      .select("*")
      .eq("status", "agendada")
      .is("email_agendada_notificado_at", null)
      .gte("created_at", janela)
      .order("data_audiencia", { ascending: true });

    // ── 2. Audiências recém-CANCELADAS não notificadas ─────────────────────
    const { data: canceladas } = await sb
      .from("pauta_audiencias")
      .select("*")
      .eq("status", "cancelada")
      .is("email_cancelada_notificado_at", null)
      .gte("updated_at", janela)
      .order("data_audiencia", { ascending: true });

    let enviados = 0;
    const agora_iso = agora.toISOString();

    let falhas = 0;

    // ── Processa novas ─────────────────────────────────────────────────────
    for (const aud of (novas ?? []) as Record<string,string>[]) {
      const clienteEmail = emailDoCliente(aud, clientes);
      const dataLabel    = `${fmtData(aud.data_audiencia)} ${fmtHora(aud.horario ?? "")}`;
      const empresa      = aud.reclamada ?? aud.cliente ?? "processo";
      const subject      = `Audiência agendada — ${empresa} — ${dataLabel}`;

      // E-mail ao cliente (se encontrado) — se não encontrado, não é falha, só não se aplica
      const okCliente = clienteEmail ? await enviarEmail(clienteEmail, subject, htmlAgendada(aud, true)) : true;

      // E-mail ao escritório
      const okEscritorio = await enviarEmail(
        ESCRITORIO_EMAIL,
        `[PAUTA] Nova audiência — ${empresa} — ${dataLabel}`,
        htmlAgendada(aud, false)
      );

      // Só marca como notificado se TODOS os envios esperados deram certo — uma falha
      // (GAS fora do ar, secret errada) deixa a linha elegível para retry na próxima
      // execução, em vez de ficar marcada como "enviado" sem ter enviado nada.
      if (okCliente && okEscritorio) {
        await sb.from("pauta_audiencias")
          .update({ email_agendada_notificado_at: agora_iso })
          .eq("id", aud.id);
        enviados++;
      } else {
        console.error(`Falha ao notificar agendamento de ${aud.id} (cliente=${okCliente} escritorio=${okEscritorio}) — será tentado de novo`);
        falhas++;
      }
    }

    // ── Processa canceladas ────────────────────────────────────────────────
    for (const aud of (canceladas ?? []) as Record<string,string>[]) {
      const clienteEmail = emailDoCliente(aud, clientes);
      const dataLabel    = `${fmtData(aud.data_audiencia)} ${fmtHora(aud.horario ?? "")}`;
      const empresa      = aud.reclamada ?? aud.cliente ?? "processo";
      const subject      = `Audiência cancelada — ${empresa} — ${dataLabel}`;

      const okCliente = clienteEmail ? await enviarEmail(clienteEmail, subject, htmlCancelada(aud, true)) : true;

      const okEscritorio = await enviarEmail(
        ESCRITORIO_EMAIL,
        `[PAUTA] Audiência cancelada — ${empresa} — ${dataLabel}`,
        htmlCancelada(aud, false)
      );

      if (okCliente && okEscritorio) {
        await sb.from("pauta_audiencias")
          .update({ email_cancelada_notificado_at: agora_iso })
          .eq("id", aud.id);
        enviados++;
      } else {
        console.error(`Falha ao notificar cancelamento de ${aud.id} (cliente=${okCliente} escritorio=${okEscritorio}) — será tentado de novo`);
        falhas++;
      }
    }

    const resumo = {
      ok: true,
      novas_agendadas: (novas ?? []).length,
      canceladas:      (canceladas ?? []).length,
      emails_enviados: enviados,
      falhas,
      gas_configurado: !!GAS_URL,
    };
    console.log(JSON.stringify(resumo));
    return Response.json(resumo, { headers: CORS });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("pauta-email-notify:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500, headers: CORS });
  }
});
