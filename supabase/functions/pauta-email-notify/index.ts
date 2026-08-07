/**
 * pauta-email-notify — Falaw Advogados
 *
 * Notifica audiências AGENDADAS que acabaram de entrar na pauta (created_at
 * recente) ou CANCELADAS que acabaram de ser reconciliadas (updated_at
 * recente) — nunca o histórico já existente — cuja DATA cai entre hoje e o
 * último dia do mês atual (ex.: hoje 07/08, cobre até 31/08 — uma audiência
 * de 01/08, já passada, não entra mesmo sendo "mês atual"). Uma REMARCAÇÃO
 * (a mesma audiência do processo, mesmo tipo, com nova data) é detectada
 * cruzando cada cancelamento com uma possível substituta agendada e gera um
 * único e-mail de "remarcada" (data antiga → nova data) em vez de um aviso de
 * cancelamento avulso — mesmo que a nova data caia fora da janela do mês.
 * Envia e-mail automático:
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

const ESCRITORIO_EMAIL = "contencioso@falaw.com.br";
// projuris-sync re-sincroniza TODAS as audiências em aberto a cada execução (não só as
// que mudaram), então "updated_at" de uma linha ainda agendada é sempre ~agora — não serve
// como sinal de "isso é novo". "created_at" só é setado no INSERT (primeira vez que aquele
// id aparece no banco), esse sim reflete "entrou na pauta agora". Para canceladas, quem
// bate status→'cancelada' é só a reconciliação (audiência que sumiu do Projuris), então
// updated_at ali É confiável como "acabou de ser cancelada". 48h dá margem para vários
// ciclos de retry (cron roda a cada ~8h) sem deixar a janela de detecção fechar cedo demais.
const JANELA_DETECCAO_MIN = 48 * 60;

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

// Intervalo [hoje, último dia do mês atual], em horário de Brasília — só audiências
// com data dentro desse intervalo geram e-mail automático (ex.: em 07/08, notifica
// agendamentos/cancelamentos de audiências de hoje até 31/08; uma audiência de 01 ou
// 02/08 — já passada, mesmo sendo "mês atual" — NÃO entra, porque já não é mais relevante
// avisar sobre algo que já aconteceu; e uma audiência marcada para setembro só entra na
// notificação quando o calendário chegar em setembro).
function janelaNotificacao(): { inicio: string; fim: string } {
  const BRASILIA_OFFSET_MS = -3 * 60 * 60 * 1000;
  const brasilia = new Date(Date.now() + BRASILIA_OFFSET_MS);
  const ano = brasilia.getUTCFullYear();
  const mes = brasilia.getUTCMonth(); // 0-indexado
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    inicio: fmt(brasilia), // hoje (data de Brasília), não o dia 1 do mês
    fim:    fmt(new Date(Date.UTC(ano, mes + 1, 0))), // dia 0 do mês+1 = último dia do mês atual
  };
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

// Nome limpo da empresa/cliente para assunto e título do e-mail — nunca o campo
// "reclamada" cru, que pode trazer várias partes coladas por vírgula com a tag
// "(CLIENTE)" (ex.: "BUSER BRASIL TECNOLOGIA LTDA. (CLIENTE),JUNDIAI TRANSPORTADORA...").
function empresaLimpa(aud: Record<string,string>): string {
  return extrairClienteTag(aud.reclamada ?? "") || aud.cliente || "processo";
}

// Assunto/título — uma audiência usa o formato detalhado de sempre; mais de uma (agrupadas
// para o mesmo destinatário) usa um resumo com a contagem, já que cada uma pode ter uma
// empresa/data/hora diferente e não cabe tudo numa linha só de assunto.
function tituloEvento(auds: Record<string,string>[], cancelada: boolean): string {
  if (auds.length === 1) {
    const label = cancelada ? "AUDIÊNCIA CANCELADA" : "NOVA AUDIÊNCIA NA PAUTA";
    const dataLabel = `${fmtData(auds[0].data_audiencia)} ${fmtHora(auds[0].horario ?? "")}`.trim();
    return `${label} — ${empresaLimpa(auds[0])} — ${dataLabel}`;
  }
  const label = cancelada ? "AUDIÊNCIAS CANCELADAS" : "NOVAS AUDIÊNCIAS NA PAUTA";
  return `${auds.length} ${label}`;
}

function wrapperEmail(opts: {
  badgeColor: string; badgeText: string; titulo: string; intro: string; conteudo: string;
}): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f2ef;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ef;">
<tr><td align="center" style="padding:40px 16px;">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

  <tr><td style="background:#060E1A;padding:28px 40px;border-radius:4px 4px 0 0;">
    <img src="https://falaw.com.br/assets/images/Falaw/falaw.com.br/wp-content/uploads/2024/06/fa-logo-branco-1.png"
         alt="Falaw Advogados" style="display:block;height:32px;width:auto;margin-bottom:10px;" />
    <p style="font-family:monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#4a90d9;margin:0;">
      PAUTA DE AUDIÊNCIAS
    </p>
  </td></tr>

  <tr><td style="background:#ffffff;padding:40px 40px 32px;">
    <p style="font-family:monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${opts.badgeColor};margin:0 0 16px 0;">
      ${opts.badgeText}
    </p>
    <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#060E1A;margin:0 0 24px 0;line-height:1.3;">
      ${opts.titulo}
    </h1>
    <p style="font-family:Georgia,serif;font-size:16px;line-height:1.8;color:#1a1a1a;margin:0 0 28px 0;">
      ${opts.intro}
    </p>

    ${opts.conteudo}

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

// Tabela de detalhes (rótulo: valor) — usada quando o e-mail cobre uma única audiência.
function tabelaUnica(aud: Record<string,string>, corBorda: string, fundo: string, comLink: boolean): string {
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid ${corBorda};border-radius:3px;margin-bottom:28px;background:${fundo};">
      ${row("Data",       `${fmtData(aud.data_audiencia)} — ${diaSemana(aud.data_audiencia)}`)}
      ${row("Horário",    fmtHora(aud.horario ?? ""))}
      ${row("Tipo",       aud.tipo_audiencia ?? "")}
      ${row("Modalidade", aud.modalidade ?? "")}
      ${aud.vara       ? row("Vara / Local", aud.vara)       : ""}
      ${aud.processo   ? row("Processo",     aud.processo)   : ""}
      ${aud.reclamante ? row("Reclamante",   aud.reclamante) : ""}
      ${comLink && aud.link ? row("Link", `<a href="${aud.link}" style="color:#0D2B5E;">${aud.link}</a>`) : ""}
    </table>`;
}

// Tabela em lista (uma linha por audiência) — usada quando o e-mail agrupa mais de uma
// audiência para o mesmo destinatário, evitando um e-mail por audiência.
function tabelaMultipla(auds: Record<string,string>[], corBorda: string): string {
  const linhas = auds.map(aud => `<tr style="border-bottom:1px solid ${corBorda};">
      <td style="padding:10px 12px;font-family:monospace;font-size:12px;white-space:nowrap;color:#060E1A;">${fmtData(aud.data_audiencia)}</td>
      <td style="padding:10px 12px;font-family:monospace;font-size:13px;font-weight:700;color:#060E1A;">${fmtHora(aud.horario ?? "")}</td>
      <td style="padding:10px 12px;font-size:11px;color:#060E1A;">${aud.tipo_audiencia ?? ""}</td>
      <td style="padding:10px 12px;font-family:monospace;font-size:11px;color:#060E1A;">${aud.processo ?? "—"}</td>
      <td style="padding:10px 12px;font-size:12px;color:#060E1A;">${empresaLimpa(aud)}</td>
      <td style="padding:10px 12px;font-size:12px;color:#060E1A;">${aud.reclamante ?? ""}</td>
    </tr>`).join("");
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:28px;font-size:11px;">
      <thead><tr style="background:#f4f2ef;">
        <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#7A7672;">Data</th>
        <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#7A7672;">Horário</th>
        <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#7A7672;">Tipo</th>
        <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#7A7672;">Processo</th>
        <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#7A7672;">Empresa</th>
        <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#7A7672;">Reclamante</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

function htmlAgendada(auds: Record<string,string>[], paraCliente: boolean): string {
  const titulo = tituloEvento(auds, false);
  const multipla = auds.length > 1;

  const intro = paraCliente
    ? (multipla ? `Informamos que foram agendadas ${auds.length} audiências em seus processos.` : `Informamos que foi agendada uma audiência em seu processo.`)
    : (multipla ? `${auds.length} novas audiências foram incluídas na pauta.` : `Uma nova audiência foi incluída na pauta.`);

  const conteudo = multipla
    ? tabelaMultipla(auds, "#e8e4df")
    : tabelaUnica(auds[0], "#e8e4df", "#ffffff", true);

  return wrapperEmail({
    badgeColor: "#2e7d32",
    badgeText: multipla ? "✅ AUDIÊNCIAS AGENDADAS" : "✅ AUDIÊNCIA AGENDADA",
    titulo, intro, conteudo,
  });
}

function htmlCancelada(auds: Record<string,string>[], paraCliente: boolean): string {
  const titulo = tituloEvento(auds, true);
  const multipla = auds.length > 1;

  const intro = paraCliente
    ? (multipla ? `Informamos que ${auds.length} audiências abaixo foram <strong>canceladas</strong>.` : `Informamos que a audiência abaixo foi <strong>cancelada</strong>.`)
    : (multipla ? `As audiências abaixo foram removidas/canceladas no sistema.` : `A audiência abaixo foi removida/cancelada no sistema.`);

  const conteudo = multipla
    ? tabelaMultipla(auds, "#fecaca")
    : tabelaUnica(auds[0], "#fecaca", "#fff5f5", false);

  return wrapperEmail({
    badgeColor: "#C62828",
    badgeText: multipla ? "❌ AUDIÊNCIAS CANCELADAS" : "❌ AUDIÊNCIA CANCELADA",
    titulo, intro, conteudo,
  });
}

// ── Remarcação (cancelada + substituta agendada) ──────────────────────────────

type Remarcacao = { velha: Record<string,string>; nova: Record<string,string> };

function tituloRemarcada(pares: Remarcacao[]): string {
  if (pares.length === 1) {
    const { nova } = pares[0];
    const dataLabel = `${fmtData(nova.data_audiencia)} ${fmtHora(nova.horario ?? "")}`.trim();
    return `AUDIÊNCIA REMARCADA — ${empresaLimpa(nova)} — ${dataLabel}`;
  }
  return `${pares.length} AUDIÊNCIAS REMARCADAS`;
}

function tabelaRemarcadaUnica(par: Remarcacao, corBorda: string, fundo: string): string {
  const { velha, nova } = par;
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid ${corBorda};border-radius:3px;margin-bottom:28px;background:${fundo};">
      ${row("Data anterior (cancelada)", `${fmtData(velha.data_audiencia)} ${fmtHora(velha.horario ?? "")}`.trim())}
      ${row("Nova data",     `${fmtData(nova.data_audiencia)} — ${diaSemana(nova.data_audiencia)} ${fmtHora(nova.horario ?? "")}`.trim())}
      ${row("Tipo",       nova.tipo_audiencia ?? "")}
      ${row("Modalidade", nova.modalidade ?? "")}
      ${nova.vara       ? row("Vara / Local", nova.vara)       : ""}
      ${nova.processo   ? row("Processo",     nova.processo)   : ""}
      ${nova.reclamante ? row("Reclamante",   nova.reclamante) : ""}
      ${nova.link ? row("Link", `<a href="${nova.link}" style="color:#0D2B5E;">${nova.link}</a>`) : ""}
    </table>`;
}

function tabelaRemarcadaMultipla(pares: Remarcacao[], corBorda: string): string {
  const linhas = pares.map(({ velha, nova }) => `<tr style="border-bottom:1px solid ${corBorda};">
      <td style="padding:10px 12px;font-family:monospace;font-size:11px;white-space:nowrap;color:#060E1A;">${fmtData(velha.data_audiencia)} → ${fmtData(nova.data_audiencia)}</td>
      <td style="padding:10px 12px;font-family:monospace;font-size:13px;font-weight:700;color:#060E1A;">${fmtHora(nova.horario ?? "")}</td>
      <td style="padding:10px 12px;font-size:11px;color:#060E1A;">${nova.tipo_audiencia ?? ""}</td>
      <td style="padding:10px 12px;font-family:monospace;font-size:11px;color:#060E1A;">${nova.processo ?? "—"}</td>
      <td style="padding:10px 12px;font-size:12px;color:#060E1A;">${empresaLimpa(nova)}</td>
      <td style="padding:10px 12px;font-size:12px;color:#060E1A;">${nova.reclamante ?? ""}</td>
    </tr>`).join("");
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:28px;font-size:11px;">
      <thead><tr style="background:#f4f2ef;">
        <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#7A7672;">Data (antiga → nova)</th>
        <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#7A7672;">Horário</th>
        <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#7A7672;">Tipo</th>
        <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#7A7672;">Processo</th>
        <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#7A7672;">Empresa</th>
        <th style="padding:8px 12px;text-align:left;font-family:monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#7A7672;">Reclamante</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

function htmlRemarcada(pares: Remarcacao[], paraCliente: boolean): string {
  const titulo = tituloRemarcada(pares);
  const multipla = pares.length > 1;

  const intro = paraCliente
    ? (multipla ? `Informamos que ${pares.length} audiências abaixo foram <strong>canceladas e remarcadas</strong> para nova data.` : `Informamos que a audiência abaixo foi <strong>cancelada e remarcada</strong> para nova data.`)
    : (multipla ? `As audiências abaixo foram canceladas e remarcadas para nova data no sistema.` : `A audiência abaixo foi cancelada e remarcada para nova data no sistema.`);

  const conteudo = multipla
    ? tabelaRemarcadaMultipla(pares, "#fde68a")
    : tabelaRemarcadaUnica(pares[0], "#fde68a", "#fffbeb");

  return wrapperEmail({
    badgeColor: "#B45309",
    badgeText: multipla ? "🔄 AUDIÊNCIAS REMARCADAS" : "🔄 AUDIÊNCIA REMARCADA",
    titulo, intro, conteudo,
  });
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

// ── Envio agrupado ────────────────────────────────────────────────────────────

// Agrupa as audiências de um lote (novas OU canceladas) por destinatário e manda UM
// e-mail por cliente cobrindo todas as audiências dele, em vez de um e-mail por
// audiência — e um único e-mail ao escritório cobrindo o lote inteiro. Só marca
// email_..._notificado_at das audiências cujo(s) envio(s) necessário(s) (o do cliente,
// quando há match, e o do escritório, sempre) tiverem dado certo — falha em qualquer um
// deixa aquelas audiências elegíveis para retry na próxima execução.
async function processarLote(
  auds: Record<string,string>[],
  clientes: Record<string,unknown>[],
  cancelada: boolean,
  sb: ReturnType<typeof createClient>,
  campoNotificado: string,
  agoraIso: string,
): Promise<{ enviados: number; falhas: number }> {
  if (!auds.length) return { enviados: 0, falhas: 0 };
  const htmlFn = cancelada ? htmlCancelada : htmlAgendada;

  const porCliente = new Map<string, Record<string,string>[]>();
  const semCliente: Record<string,string>[] = [];
  for (const aud of auds) {
    const email = emailDoCliente(aud, clientes);
    if (email) {
      if (!porCliente.has(email)) porCliente.set(email, []);
      porCliente.get(email)!.push(aud);
    } else {
      semCliente.push(aud);
    }
  }

  // Um único e-mail ao escritório cobrindo todo o lote (não um por audiência nem por cliente)
  const okEscritorio = await enviarEmail(ESCRITORIO_EMAIL, tituloEvento(auds, cancelada), htmlFn(auds, false));

  let enviados = 0, falhas = 0;
  const idsNotificados: string[] = [];

  for (const [email, grupo] of porCliente) {
    const okCliente = await enviarEmail(email, tituloEvento(grupo, cancelada), htmlFn(grupo, true));
    if (okCliente && okEscritorio) {
      grupo.forEach(a => idsNotificados.push(a.id));
      enviados += grupo.length;
    } else {
      falhas += grupo.length;
      console.error(`Falha ao notificar grupo de ${email} (${grupo.length} audiência(s), cancelada=${cancelada}) — cliente=${okCliente} escritorio=${okEscritorio}`);
    }
  }

  // Audiências sem cliente casado não têm envio próprio — dependem só do escritório
  if (semCliente.length) {
    if (okEscritorio) { semCliente.forEach(a => idsNotificados.push(a.id)); enviados += semCliente.length; }
    else falhas += semCliente.length;
  }

  if (idsNotificados.length) {
    await sb.from("pauta_audiencias").update({ [campoNotificado]: agoraIso }).in("id", idsNotificados);
  }

  return { enviados, falhas };
}

// Mesmo padrão de agrupamento por cliente do processarLote, mas para pares
// {velha, nova} de remarcação — marca email_cancelada_notificado_at na linha
// antiga e email_agendada_notificado_at na nova, só quando o envio (cliente,
// quando há match, e escritório, sempre) tiver dado certo.
async function processarRemarcadas(
  pares: Remarcacao[],
  clientes: Record<string,unknown>[],
  sb: ReturnType<typeof createClient>,
  agoraIso: string,
): Promise<{ enviados: number; falhas: number }> {
  if (!pares.length) return { enviados: 0, falhas: 0 };

  const porCliente = new Map<string, Remarcacao[]>();
  const semCliente: Remarcacao[] = [];
  for (const par of pares) {
    const email = emailDoCliente(par.nova, clientes);
    if (email) {
      if (!porCliente.has(email)) porCliente.set(email, []);
      porCliente.get(email)!.push(par);
    } else {
      semCliente.push(par);
    }
  }

  const okEscritorio = await enviarEmail(ESCRITORIO_EMAIL, tituloRemarcada(pares), htmlRemarcada(pares, false));

  let enviados = 0, falhas = 0;
  const idsVelhas: string[] = [];
  const idsNovas: string[] = [];

  for (const [email, grupo] of porCliente) {
    const okCliente = await enviarEmail(email, tituloRemarcada(grupo), htmlRemarcada(grupo, true));
    if (okCliente && okEscritorio) {
      grupo.forEach(p => { idsVelhas.push(p.velha.id); idsNovas.push(p.nova.id); });
      enviados += grupo.length;
    } else {
      falhas += grupo.length;
      console.error(`Falha ao notificar remarcação de ${email} (${grupo.length}) — cliente=${okCliente} escritorio=${okEscritorio}`);
    }
  }

  if (semCliente.length) {
    if (okEscritorio) {
      semCliente.forEach(p => { idsVelhas.push(p.velha.id); idsNovas.push(p.nova.id); });
      enviados += semCliente.length;
    } else falhas += semCliente.length;
  }

  if (idsVelhas.length) await sb.from("pauta_audiencias").update({ email_cancelada_notificado_at: agoraIso }).in("id", idsVelhas);
  if (idsNovas.length)  await sb.from("pauta_audiencias").update({ email_agendada_notificado_at: agoraIso }).in("id", idsNovas);

  return { enviados, falhas };
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    if (!SB_URL || !SB_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados");

    const sb = createClient(SB_URL, SB_KEY);
    const agora = new Date();
    const { inicio: janelaInicio, fim: janelaFim } = janelaNotificacao();
    const deteccaoDesde = new Date(agora.getTime() - JANELA_DETECCAO_MIN * 60_000).toISOString();

    const clientes = await buscarClientes(sb);

    // ── 1. Audiências AGENDADAS que entraram na pauta agora, e cuja data é relevante ─
    // Duas condições, as duas precisam valer: (a) a linha foi CRIADA recentemente
    // (created_at — sinal confiável de "isso é novo", diferente de updated_at que muda
    // toda vez que o sync roda mesmo sem nada ter mudado); (b) a data da audiência cai
    // entre hoje e o fim do mês seguinte (não notifica algo que já passou nem algo tão
    // distante que ainda não é relevante).
    //
    // Sem checar `error` aqui, uma coluna ausente (migration não rodada) ou
    // qualquer outro erro de query fica indistinguível de "nada a notificar" —
    // a função reportava 0 candidatos silenciosamente em vez de sinalizar o problema.
    const { data: novas, error: errNovas } = await sb
      .from("pauta_audiencias")
      .select("*")
      .eq("status", "agendada")
      .is("email_agendada_notificado_at", null)
      // Não duplica aviso de uma audiência que o destinatário já recebeu por um
      // envio manual de pauta (botão "Enviar Pauta" no admin).
      .is("pauta_manual_enviada_at", null)
      .gte("created_at", deteccaoDesde)
      .gte("data_audiencia", janelaInicio)
      .lte("data_audiencia", janelaFim)
      .order("data_audiencia", { ascending: true });
    if (errNovas) throw new Error(`Consulta de audiências agendadas falhou: ${errNovas.message}`);

    // ── 2. Audiências CANCELADAS agora (reconciliação), com data relevante ─────
    const { data: canceladas, error: errCanceladas } = await sb
      .from("pauta_audiencias")
      .select("*")
      .eq("status", "cancelada")
      .is("email_cancelada_notificado_at", null)
      .is("pauta_manual_enviada_at", null)
      .gte("updated_at", deteccaoDesde)
      .gte("data_audiencia", janelaInicio)
      .lte("data_audiencia", janelaFim)
      .order("data_audiencia", { ascending: true });
    if (errCanceladas) throw new Error(`Consulta de audiências canceladas falhou: ${errCanceladas.message}`);

    // ── 3. Separa REMARCAÇÕES: para cada cancelada, busca uma substituta (mesmo
    // processo + mesmo tipo, ainda agendada, ainda não notificada) — sem limitar por
    // data, porque a remarcação pode empurrar a audiência pra fora da janela do mês
    // (é justamente quando mais precisa avisar, senão o cliente só vê "cancelada" e
    // nunca fica sabendo que foi remarcada em vez de simplesmente sumir da pauta).
    const remarcadas: Remarcacao[] = [];
    const canceladasPuras: Record<string,string>[] = [];
    for (const c of (canceladas ?? []) as Record<string,string>[]) {
      const { data: substitutas } = await sb
        .from("pauta_audiencias")
        .select("*")
        .eq("processo", c.processo)
        .eq("tipo_audiencia", c.tipo_audiencia)
        .eq("status", "agendada")
        .is("email_agendada_notificado_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      const nova = (substitutas ?? [])[0] as Record<string,string> | undefined;
      if (nova) remarcadas.push({ velha: c, nova });
      else canceladasPuras.push(c);
    }
    // Quem já vai sair no e-mail de remarcação não sai de novo como "nova audiência"
    const idsCobertosPorRemarcacao = new Set(remarcadas.map(r => r.nova.id));
    const novasFiltradas = ((novas ?? []) as Record<string,string>[]).filter(n => !idsCobertosPorRemarcacao.has(n.id));

    const agora_iso = agora.toISOString();

    // Agrupa por cliente — quando um mesmo destinatário tem mais de uma audiência no
    // lote, vai tudo num e-mail só, em vez de um e-mail por audiência.
    const [resNovas, resCanceladas, resRemarcadas] = await Promise.all([
      processarLote(novasFiltradas, clientes, false, sb, "email_agendada_notificado_at", agora_iso),
      processarLote(canceladasPuras, clientes, true, sb, "email_cancelada_notificado_at", agora_iso),
      processarRemarcadas(remarcadas, clientes, sb, agora_iso),
    ]);
    const enviados = resNovas.enviados + resCanceladas.enviados + resRemarcadas.enviados;
    const falhas   = resNovas.falhas + resCanceladas.falhas + resRemarcadas.falhas;

    const resumo = {
      ok: true,
      periodo: `${janelaInicio} a ${janelaFim}`,
      novas_agendadas: novasFiltradas.length,
      canceladas:      canceladasPuras.length,
      remarcadas:      remarcadas.length,
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
