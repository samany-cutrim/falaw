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
const DIAS_PASSADO         = parseInt(Deno.env.get("DIAS_PASSADO") ?? "180", 10); // quantos dias no passado incluir na busca
const AUDIENCIA_TIPO_CODIGO = 6125449; // código real do tipo "Audiência" no Projuris ADV
// Código do tipo "Perícia" no Projuris ADV — confirmado via DevTools do Projuris
// (GET /adv-service/tarefa-tipo/6125450 ao abrir uma tarefa do tipo Perícia; 6125449 é o
// mesmo endpoint para Audiência, catálogo sequencial de tipos de tarefa, não IDs de
// instância). Secret PERICIA_TIPO_CODIGO sobrescreve esse padrão se o código mudar.
const PERICIA_TIPO_CODIGO = parseInt(Deno.env.get("PERICIA_TIPO_CODIGO") ?? "", 10) || 6125450;
// Outros códigos de tarefa extras, separados por vírgula (ex.: "123,456"), para o caso de
// mais de um tipo de perícia/tarefa precisar ser sincronizado no futuro sem novo deploy.
const TIPOS_TAREFA_EXTRAS = (Deno.env.get("TIPOS_TAREFA_EXTRAS") ?? "")
  .split(",").map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);
const TIPOS_TAREFA_CODIGOS = [
  AUDIENCIA_TIPO_CODIGO,
  ...(PERICIA_TIPO_CODIGO ? [PERICIA_TIPO_CODIGO] : []),
  ...TIPOS_TAREFA_EXTRAS,
];
const BRASILIA_OFFSET_MS = -3 * 60 * 60 * 1000; // UTC-3 fixo (Brasil não tem mais horário de verão)
const CACHE_TTL_HORAS = 24 * 7; // reaproveita dados de processo (marcadores/partes) por 7 dias
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
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function agoraBrasilia(): Date {
  return new Date(Date.now() + BRASILIA_OFFSET_MS);
}

function brasiliaDiaParaISO(dataStr: string, finalDoDia: boolean): string {
  // Projuris aceita ISO com Z — usa meia-noite UTC como início/fim do dia
  return finalDoDia ? `${dataStr}T23:59:59.999Z` : `${dataStr}T00:00:00.000Z`;
}

function janelaBusca(): { hojeStr: string; fimStr: string; iniISO: string; fimISO: string } {
  const hoje = agoraBrasilia();
  const hojeStr = fmtDate(hoje);
  const ini = new Date(hoje);
  ini.setUTCDate(ini.getUTCDate() - DIAS_PASSADO); // inclui audiências passadas
  const iniStr = fmtDate(ini);
  const fim = new Date(hoje);
  fim.setUTCDate(fim.getUTCDate() + DIAS_BUSCA);
  const fimStr = fmtDate(fim);
  return { hojeStr, fimStr, iniISO: brasiliaDiaParaISO(iniStr, false), fimISO: brasiliaDiaParaISO(fimStr, true) };
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

async function fetchComRetry(url: string, opts: RequestInit, tentativas = 3): Promise<Response> {
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      const resp = await fetch(url, opts);
      if (resp.ok || (resp.status < 500 && resp.status !== 429)) return resp;
      ultimoErro = new Error(`HTTP ${resp.status}`);
    } catch (e) { ultimoErro = e; }
    if (i < tentativas - 1) {
      const espera = 500 * Math.pow(2, i);
      console.warn(`Tentativa ${i + 1}/${tentativas} falhou, aguardando ${espera}ms...`, ultimoErro);
      await new Promise(r => setTimeout(r, espera));
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
}

async function fetchAudienciasKeyset(iniISO: string, fimISO: string): Promise<{ itens: Record<string, unknown>[]; parcial: boolean }> {
  const url = `${PROJURIS_BASE}/adv-service/v2/tarefa/consulta-keyset`;
  const TAM_PAGINA = 50;  // limite máximo aceito pelo endpoint keyset
  const MAX_PAGINAS = 400; // 400 x 50 = 20.000 registros de margem de segurança
  let cursor: string | undefined;
  let pagina = 0;
  let total = 0;
  let parcial = false;
  const acumulado: Record<string, unknown>[] = [];

  while (pagina < MAX_PAGINAS) {
    const params = new URLSearchParams({
      "quan-registros": String(TAM_PAGINA),
      pagina: String(pagina),
      "ordenacao-tipo": "ASC",
      "ordenacao-chave": "ORDENACAO_DATA_PREVISTA",
    });
    if (cursor) params.set("cursor", cursor);

    const body = {
      filtroGeral: "", tipoFiltroTarefaConsulta: "TODOS", unidadeOrganizacional: null, tituloCompromisso: "",
      codigosTarefaTipo: TIPOS_TAREFA_CODIGOS, usuariosResponsaveis: [], concluidaPor: [], gruposResponsaveis: [],
      marcadores: [], tarefaTipoData: "DATA_PREVISTA_CONCLUSAO", dataTarefaInicio: iniISO, dataTarefaFim: fimISO,
      flagDadosCompletosResponsaveis: true, numeroProcesso: null, nomePessoaEnvolvido: null, assuntoVinculo: "",
      moduloTarefa: null, codigoRegistroVinculo: null, flagVinculoPrincipal: true,
      tipoInformacaoExclusao: "NAO_EXIBIR_EXCLUIDOS", identificadorAndamento: "", flagCompromisso: false,
      flagClassificacaoAudiencia: false, flagClassificacaoTarefa: false,
    };

    let resp: Response;
    try {
      resp = await fetchComRetry(`${url}?${params}`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
    } catch (e) {
      console.error(`Falha na p\u00e1gina ${pagina} \u2014 mantendo ${acumulado.length} j\u00e1 coletados:`, e);
      parcial = true;
      break;
    }
    if (!resp.ok) {
      const errTxt = await resp.text();
      console.error(`consulta-keyset ${resp.status} na página ${pagina}: ${errTxt.slice(0, 300)} — mantendo ${acumulado.length} já coletados`);
      parcial = true;
      break;
    }

    const json = await resp.json() as Record<string, unknown>;
    total = (json.totalRegistros as number) ?? total;
    const itens = (json.tarefaConsultaWs as Record<string, unknown>[]) ?? [];
    acumulado.push(...itens);
    console.log(`consulta-keyset pág ${pagina}: status=${resp.status} total=${total} itens=${itens.length} acumulado=${acumulado.length} cursor=${String(json.proximoCursor).slice(0,20)}`);

    const proximoCursor = json.proximoCursor as string | undefined;
    if (!itens.length || !proximoCursor || acumulado.length >= total) break;
    cursor = proximoCursor;
    pagina++;
  }
  if (acumulado.length < total) {
    console.warn(`Coleta incompleta: ${acumulado.length}/${total} — aumente MAX_PAGINAS se isso persistir`);
    parcial = true;
  }
  return { itens: acumulado, parcial };
}

async function fetchAudiencias(janela: { hojeStr: string; fimStr: string; iniISO: string; fimISO: string }): Promise<{ itens: unknown[]; parcial: boolean }> {
  await getToken();
  console.log(`Buscando audiências (tipos ${TIPOS_TAREFA_CODIGOS.join(",")}) de ${janela.hojeStr} a ${janela.fimStr}...`);
  const { itens: brutos, parcial } = await fetchAudienciasKeyset(janela.iniISO, janela.fimISO);
  console.log(`Total bruto retornado pela API: ${brutos.length}${parcial ? " (PARCIAL — houve falha em alguma página)" : ""}`);
  const pendentes = brutos.filter(raw => {
    const situacao = str((raw as Record<string, unknown>).situacao).toLowerCase();
    // Exclui apenas as explicitamente canceladas no Projuris
    if (situacao.includes("cancelad") || situacao.includes("cancelada")) return false;
    return true;
  });
  console.log(`Audiências pendentes (não canceladas/concluídas): ${pendentes.length}`);
  return { itens: pendentes, parcial };
}

/** Busca o código interno de cada marcador de tipo-responsabilidade no Projuris */
async function buscarCodigosMarcadores(sb: ReturnType<typeof createClient>): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  const TIPOS_VALIDOS = ["EX-FOODLOVER", "NUVEM", "TERCEIRIZAÇÃO", "OL-SUBSIDIÁRIA", "SUBSIDIÁRIA", "EX-FUNCIONÁRIO"];
  try {
    const { data: cacheRow } = await sb
      .from("projuris_processo_cache")
      .select("codigo_processo")
      .not("codigo_processo", "is", null)
      .limit(1)
      .single();
    const rawCod = (cacheRow as Record<string, unknown> | null)?.codigo_processo;
    const codProcesso = rawCod ? Number(rawCod) : 0;
    if (!codProcesso) { console.log("buscarCodigosMarcadores: sem codigoProcesso no cache"); return mapa; }

    // Busca cada marcador de interesse individualmente via filtro-geral
    for (const tipo of TIPOS_VALIDOS) {
      try {
        const filtro = encodeURIComponent(tipo);
        const resp = await fetch(
          `${PROJURIS_BASE}/adv-service/marcador/consulta?quan-registros=10&pagina=0&filtro-geral=${filtro}&codigo-processo=${codProcesso}`,
          { method: "GET", headers: authHeaders() }
        );
        if (!resp.ok) continue;
        const body = await resp.json() as Record<string, unknown>;
        const marcadores = (body.marcadorWs ?? body.content ?? body.data ?? []) as Record<string, unknown>[];
        for (const m of marcadores) {
          const nome = str(m.nomeMarcador ?? m.nome ?? m.descricao ?? "").toUpperCase().trim();
          const codigo = typeof m.codigoMarcador === "number" ? m.codigoMarcador : 0;
          if (codigo && nome === tipo) {
            mapa.set(nome, codigo);
            console.log(`Marcador encontrado: ${nome} → código ${codigo}`);
            break;
          }
        }
      } catch(_) { /* ignora erro individual */ }
    }
    console.log(`buscarCodigosMarcadores: ${mapa.size}/${TIPOS_VALIDOS.length} marcadores de interesse encontrados`);
  } catch(e) { console.warn("buscarCodigosMarcadores:", e); }
  return mapa;
}

/** Atualiza tipo_responsabilidade buscando os marcadores reais de cada processo no Projuris */
async function sincronizarMarcadoresProcessos(sb: ReturnType<typeof createClient>): Promise<number> {
  // Busca processos que podem ter marcadores de tipo-responsabilidade
  const { data, error } = await sb
    .from("pauta_audiencias")
    .select("processo")
    .neq("reclamada", "")
    .in("tipo_responsabilidade", ["NUVEM", "OL-SUBSIDIÁRIA", "SUBSIDIÁRIA", ""])
    .limit(2000);
  if (error || !data?.length) return 0;

  // Processos únicos com codigoProcesso no cache
  const processosUnicos = [...new Set((data as {processo:string}[]).map(r => r.processo).filter(Boolean))];

  // Busca todos os processos candidatos do cache
  const { data: todosCache } = await sb
    .from("projuris_processo_cache")
    .select("numero_processo,codigo_processo,marcadores")
    .in("numero_processo", processosUnicos)
    .not("codigo_processo", "is", null);

  if (!todosCache?.length) return 0;

  // null = ainda não verificado via API; [] = verificado mas sem marcadores relevantes
  const naoVerificados = (todosCache as Record<string,unknown>[]).filter(r => r.marcadores === null);
  const verificados    = (todosCache as Record<string,unknown>[]).filter(r => r.marcadores !== null);
  const cacheRows = [...naoVerificados, ...verificados];

  let atualizados = 0;
  // Para cada processo com codigoProcesso, busca os marcadores via GET /processo/{codigoProcesso}
  for (const row of (cacheRows as Record<string,unknown>[]).slice(0, 50)) { // máx 50 por sync
    const num = str(row.numero_processo);
    const rawCod = row.codigo_processo;
    const codProcesso = rawCod ? Number(rawCod) : 0;
    if (!codProcesso) continue;

    const marcadoresCached = row.marcadores as string[] | null;

    // null = ainda não verificado via API
    // [] ou array com valores = já verificado
    if (marcadoresCached !== null) {
      // Já verificado: aplica classificação se houver marcador reconhecido no cache
      const tipo = identificarTipoPorMarcadores(marcadoresCached);
      if (tipo) {
        const { data: updated, error: upErr } = await sb.from("pauta_audiencias")
          .update({ tipo_responsabilidade: tipo })
          .eq("processo", num)
          .neq("tipo_responsabilidade", tipo) // só atualiza se mudou
          .select("id");
        if (!upErr && updated?.length) { atualizados++; console.log(`Marcador override (cache): ${num} → ${tipo}`); }
      }
      continue; // marcadores já verificados, não chama API novamente
    }

    // Cache sem marcadores → busca via detalhe do processo
    try {
      const r = await fetch(`${PROJURIS_BASE}/adv-service/processo/${codProcesso}`, { method: "GET", headers: authHeaders() });
      if (!r.ok) continue;
      const body = await r.json() as Record<string,unknown>;
      const marcWs = (body.marcadorWs ?? []) as Record<string,unknown>[];
      const marcadores = marcWs.map(m => str(m.nomeMarcador ?? m.nome ?? "").toUpperCase().trim()).filter(Boolean);

      // Salva marcadores no cache: [] = verificado sem marcadores relevantes (não null, não buscará novamente)
      await sb.from("projuris_processo_cache")
        .update({ marcadores, updated_at: new Date().toISOString() })
        .eq("numero_processo", num);

      // Aplica classificação com base nos marcadores reais encontrados
      const tipo = identificarTipoPorMarcadores(marcadores);
      if (tipo) {
        const { data: updated, error: upErr } = await sb.from("pauta_audiencias")
          .update({ tipo_responsabilidade: tipo })
          .eq("processo", num)
          .neq("tipo_responsabilidade", tipo)
          .select("id");
        if (!upErr && updated?.length) { atualizados++; console.log(`Marcador override (API): ${num} → ${tipo}`); }
      }
    } catch(_) { /* ignora */ }
  }
  console.log(`sincronizarMarcadoresProcessos: ${atualizados} overrides aplicados, ${naoVerificados.length} não verificados restantes`);
  // Retorna > 0 enquanto ainda há processos não verificados (para o loop continuar)
  return atualizados + Math.min(naoVerificados.length, 1);
}

async function reconciliarCanceladas(
  sb: ReturnType<typeof createClient>,
  idsAtuais: string[],
  hojeStr: string,
  fimStr: string
): Promise<number> {
  const { data, error } = await sb
    .from(SB_TABLE)
    .select("id")
    .eq("origem", "pje")
    .eq("status", "agendada")
    .gte("data_audiencia", hojeStr)
    .lte("data_audiencia", fimStr);
  if (error || !data?.length) return 0;

  const setAtuais = new Set(idsAtuais);
  const orfaos = (data as { id: string }[]).map(r => r.id).filter(id => !setAtuais.has(id));
  if (!orfaos.length) return 0;

  for (let i = 0; i < orfaos.length; i += 100) {
    const lote = orfaos.slice(i, i + 100);
    await sb.from(SB_TABLE).update({ status: "cancelada", updated_at: new Date().toISOString() }).in("id", lote);
  }
  console.log(`Reconciliação: ${orfaos.length} audiência(s) marcada(s) como cancelada`);
  return orfaos.length;
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
  const DATAS = ["dataConclusaoPrevista","dataPrevista","data_prevista","dataAudiencia","data_audiencia","dataInicio","dataLimite","data","dtEvento"];
  // "Hora prevista" é o campo canônico da hora real da perícia/audiência no Projuris —
  // preenchido junto com "Data prevista" na tela da tarefa — e tem prioridade sobre
  // qualquer outro campo de hora, como horaLimite (que é a hora da "Data Fatal", o prazo
  // da tarefa, não o horário do compromisso, e por isso não deve ser usada aqui).
  const HORAS_PREVISTA = ["horaPrevista","hora_prevista"];
  const HORAS_OUTRAS = ["horaLimite","horaAudiencia","hora_audiencia","horaInicio","hora","horario"];
  // Esses campos em Projuris ADV são timestamps ms em UTC, mas representam horário de
  // Brasília + 3h (ex.: campo cru = 11:50Z para audiência marcada às 08:50 BRT). É preciso
  // subtrair BRASILIA_OFFSET_MS ANTES de extrair hora/data via getUTC*.
  const dataRawVal = DATAS.map(k=>item[k]).find(v=>v);
  let dataRaw = "", horaFromData = "";
  if (typeof dataRawVal === "number") {
    const d = new Date(dataRawVal + BRASILIA_OFFSET_MS);
    dataRaw = d.getUTCFullYear() + "-" + String(d.getUTCMonth()+1).padStart(2,"0") + "-" + String(d.getUTCDate()).padStart(2,"0");
    // "dataConclusaoPrevista" às vezes já traz a hora real embutida (ex.: "25/08/2026 -
    // 8:45"); em outros casos é só a data com hora zerada (meia-noite em BRT) — por isso
    // 00:00 é tratado como "sem horário real" para não competir com Hora prevista/texto.
    const hh = String(d.getUTCHours()).padStart(2,"0") + ":" + String(d.getUTCMinutes()).padStart(2,"0");
    horaFromData = hh === "00:00" ? "" : hh;
  } else dataRaw = str(dataRawVal);
  const horaPrevistaVal = HORAS_PREVISTA.map(k=>item[k]).find(v=>v);
  let horaPrevista = "";
  if (typeof horaPrevistaVal === "number") {
    const d = new Date(horaPrevistaVal + BRASILIA_OFFSET_MS);
    horaPrevista = String(d.getUTCHours()).padStart(2,"0") + ":" + String(d.getUTCMinutes()).padStart(2,"0");
  } else horaPrevista = str(horaPrevistaVal).slice(0,5);
  const horaRawVal = HORAS_OUTRAS.map(k=>item[k]).find(v=>v);
  let horaRaw = "";
  if (typeof horaRawVal === "number") {
    const d = new Date(horaRawVal + BRASILIA_OFFSET_MS);
    horaRaw = String(d.getUTCHours()).padStart(2,"0") + ":" + String(d.getUTCMinutes()).padStart(2,"0");
  } else horaRaw = str(horaRawVal);
  const { data, hora: horaFb } = parseData(dataRaw);
  const hora = horaPrevista || horaFromData || (horaRaw ? horaRaw.slice(0,5) : "") || horaFb;

  const processo = str(item.numeroProcesso ?? item.numero_processo ?? item.processo ?? item.nrProcesso);
  const reclamante = str(item.parteAtiva ?? item.reclamante ?? item.poloAtivo ?? item.polo_ativo ?? item.autor ?? item.nomeEnvolvido);
  const reclamada = str(item.partePassiva ?? item.reclamada ?? item.poloPassivo ?? item.polo_passivo ?? item.reu);
  // Valor do campo "Órgão julgador" do processo no Projuris (API: vara.valor via
  // fetchProcessoDetalhes) — usado só como FALLBACK, nunca como prioridade.
  const varaOrgaoJulgador = str(item.vara ?? item.orgaoJulgador ?? item.orgao_julgador ?? item.tribunal);
  const link = str(item.linkVideoconferencia ?? item.link_video ?? item.link ?? item.urlVideoconferencia);

  // Cliente final — Projuris retorna array "clientes"
  const clientesArr = item.clientes;
  const cliente = Array.isArray(clientesArr) && (clientesArr as unknown[]).length
    ? (clientesArr as unknown[]).map(c => str(c)).filter(Boolean).join(", ")
    : str(item.nomeCliente ?? item.cliente ?? "");

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

  // ── Conta empresas no polo passivo ─────────────────────────────────────────
  const poloPassivoArr = item.poloPassivo ?? item.polo_passivo;
  let numReclamadas = 0;
  if (Array.isArray(poloPassivoArr)) {
    numReclamadas = (poloPassivoArr as unknown[]).length;
  } else if (reclamada) {
    numReclamadas = reclamada.split(",").filter(p => p.trim().length > 2).length;
  }
  if (numReclamadas === 0) numReclamadas = 1;
  const advogado = "";
  const mid = str(item.meetingId ?? item.meeting_id ?? item.idReuniao);
  const senha = str(item.senha ?? item.password ?? item.codigoAcesso);
  const idSenha = [mid && `ID: ${mid}`, senha && `Senha: ${senha}`].filter(Boolean).join(" | ");

  // Normaliza tipo_audiencia para os valores permitidos pela tabela
  const tipoRaw = str(item.nomeTarefaTipo ?? item.tipoAudiencia ?? item.tipo_audiencia ?? item.tipoEvento ?? "")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  let tipo_audiencia = "";
  if (tipoRaw.includes("encerramento") && tipoRaw.includes("instruc")) tipo_audiencia = "ENCERRAMENTO DE INSTRUÇÃO";
  else if (tipoRaw.includes("instruc") || tipoRaw.includes("instrução")) tipo_audiencia = "INSTRUÇÃO";
  else if (tipoRaw.includes("conciliac") || tipoRaw.includes("conciliação")) tipo_audiencia = "CONCILIAÇÃO";
  else if (tipoRaw.includes("una")) tipo_audiencia = "UNA";
  else if (tipoRaw.includes("inicial")) tipo_audiencia = "INICIAL";
  else if (tipoRaw.includes("peric") || tipoRaw.includes("perícia") || tipoRaw.includes("pericia")) tipo_audiencia = "PERÍCIA";

  // Modalidade
  const modalRaw = str(item.modalidade ?? item.tipoSessao ?? item.tipo_sessao ?? "")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  let modalidade = "";
  if (modalRaw.includes("virtual") || modalRaw.includes("remot") || modalRaw.includes("online")) modalidade = "VIRTUAL";
  else if (modalRaw.includes("presencial")) modalidade = "PRESENCIAL";
  else if (modalRaw.includes("hibrida") || modalRaw.includes("misto")) modalidade = "HÍBRIDA";

  // O texto com data/hora/vara entre parênteses pode estar em "titulo" OU "descricao" —
  // depende do tipo de tarefa. Não dá pra assumir sempre o mesmo campo.
  const textoTitulo = str(item.titulo ?? item.title ?? "");
  const textoDescricao = str(item.descricao ?? "");
  const REGEX_PARENTESES = /\((\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})\s+([^)]+?)\s*\)/;
  // Formato alternativo sem parêntese de abertura:
  // "designada para dia DD/MM/YYYY às HH:MMh - VARA)"
  const REGEX_SEM_PAREN  = /\bdia\s+(\d{2})\/(\d{2})\/(\d{4})\D+(\d{2}:\d{2})\w*\s*[-–]\s*([^)\n.]+)/i;
  // "comentarios" (salvo/exibido) = o texto que contém o padrão, senão o não-vazio
  const comentarios = REGEX_PARENTESES.test(textoTitulo) ? textoTitulo
    : REGEX_PARENTESES.test(textoDescricao) ? textoDescricao
    : (textoTitulo || textoDescricao);

  // ── Extrai campos faltantes do texto ────────────────────────────────────────
  let dataFinal = data, horaFinal = hora, varaFinal = "", tipoFinal = tipo_audiencia, modalFinal = modalidade;
  if (comentarios) {
    const dNorm = comentarios.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    if (!tipoFinal) {
      if (dNorm.includes("encerramento") && dNorm.includes("instruc")) tipoFinal = "ENCERRAMENTO DE INSTRUÇÃO";
      else if (dNorm.includes("instruc")) tipoFinal = "INSTRUÇÃO";
      else if (dNorm.includes("conciliac")) tipoFinal = "CONCILIAÇÃO";
      else if (dNorm.includes("pericia") || dNorm.includes("peric")) tipoFinal = "PERÍCIA";
      else if (dNorm.includes(" una ") || dNorm.startsWith("una ") || dNorm.includes("audiencia una")) tipoFinal = "UNA";
      else if (dNorm.includes("inicial")) tipoFinal = "INICIAL";
    }
    if (!modalFinal) {
      if (dNorm.includes("videoconfer") || dNorm.includes("telepresencial") || dNorm.includes("virtual") || dNorm.includes("remot")) modalFinal = "VIRTUAL";
      else if (dNorm.includes("presencial")) modalFinal = "PRESENCIAL";
    }
  }
  // 1º) a hora vem do timestamp "Data de conclusão prevista" da tarefa (campo canônico
  // com o dia e horário em que a perícia/audiência efetivamente acontecerá). O texto do
  // comentário só é usado como FALLBACK quando o timestamp não trouxe horário — nunca
  // sobrescreve um horário já obtido do timestamp, pois esse texto é editável no Projuris
  // e uma mudança de redação (sem mudar o horário real) mudava horaFinal, e por tabela o
  // id (hash de processo+data+hora), fazendo o sync tratar a linha como cancelada e criar
  // uma linha nova vazia, perdendo dados já preenchidos no admin (preposto, testemunhas etc).
  // A vara sempre vem do comentário/descrição, pois não há campo de vara na tarefa.
  const mParen = textoTitulo.match(REGEX_PARENTESES) ?? textoDescricao.match(REGEX_PARENTESES);
  const mAlt   = mParen ? null : (textoTitulo.match(REGEX_SEM_PAREN) ?? textoDescricao.match(REGEX_SEM_PAREN));
  const mMatch = mParen ?? mAlt;
  if (mMatch) {
    if (!dataFinal) dataFinal = `${mMatch[3]}-${mMatch[2]}-${mMatch[1]}`;
    if (!horaFinal) horaFinal = mMatch[4];  // só usa hora do comentário se o timestamp não tiver
    varaFinal = mMatch[5].trim()
      .replace(/^-\s*/, "")
      .replace(/\s*-\s*(Facultad|Acesso|Sen|Link|ID|Zoom|Meet|Teams).*/i, "")
      .trim();
  }
  // 2º) fallback: Órgão julgador cadastrado no processo (Projuris)
  if (!varaFinal) varaFinal = varaOrgaoJulgador;

  return {
    id: makeId(processo, dataFinal || data, horaFinal || hora),
    processo:              processo   || "",
    reclamante:            reclamante || "",
    reclamada:             reclamada  || "",
    cliente:               cliente    || "",
    data_audiencia:        dataFinal  || data || new Date().toISOString().slice(0,10),
    horario:               horaFinal  || hora || "",
    tipo_audiencia:        tipoFinal  || "",
    modalidade:            modalFinal || "",
    vara:                  varaFinal  || "",
    status:                "agendada",
    origem:                "pje",
    link:                  link       || "",
    id_senha:              idSenha    || "",
    advogado:              advogado,  // sempre "" — preenchido manualmente no site
    tipo_responsabilidade: "",  // classificado por sincronizarMarcadoresProcessos via marcadores do processo
    comentarios:           comentarios || "",
    updated_at:            new Date().toISOString(),
  };
}

/** Busca marcadores + partes dos processos na API do Projuris */
interface ProcessoDetalhes {
  marcadores: string[];
  parteAtiva: string;
  partePassiva: string;
  cliente: string;
  vara: string;
}

function _extrairDetalhesDeProc(proc: Record<string,unknown>): ProcessoDetalhes & { codigoProcesso?: number } {
  // ── Marcadores ────────────────────────────────────────────────────────────
  const marcRaw = proc.marcadorWs          // campo real no detalhe de processo
    ?? proc.marcadores ?? proc.etiquetas ?? proc.tags
    ?? proc.marcadorProcessoWs ?? proc.marcadorProcesso ?? proc.marcadoresProcesso ?? [];
  const marcadores: string[] = [];
  if (Array.isArray(marcRaw)) {
    for (const m of marcRaw as unknown[]) {
      if (typeof m === "string") marcadores.push(m.toUpperCase().trim());
      else if (m && typeof m === "object") {
        const label = str(
          (m as Record<string,unknown>).nomeMarcador ??  // campo real da API Projuris
          (m as Record<string,unknown>).descricao ?? (m as Record<string,unknown>).nome ??
          (m as Record<string,unknown>).label     ?? (m as Record<string,unknown>).name ?? ""
        );
        if (label) marcadores.push(label.toUpperCase().trim());
      }
    }
  }
  // ── Partes ────────────────────────────────────────────────────────────────
  let parteAtiva = str(proc.parteAtiva ?? proc.poloAtivo ?? proc.polo_ativo ?? proc.autor ?? "");
  if (!parteAtiva && Array.isArray(proc.partesAtivas))
    parteAtiva = str((proc.partesAtivas as Record<string,unknown>[])[0]?.nome ?? "");
  if (!parteAtiva && Array.isArray(proc.envolvidos)) {
    const autor = (proc.envolvidos as Record<string,unknown>[]).find(e =>
      str(e.papel ?? e.role ?? "").toUpperCase().match(/AUTOR|RECLAMANTE/)
    );
    if (autor) parteAtiva = str(autor.nome ?? autor.name ?? autor.nomeEnvolvido ?? "");
  }

  let partePassiva = "";
  if (Array.isArray(proc.partesPassivas)) {
    partePassiva = (proc.partesPassivas as Record<string,unknown>[])
      .map(p => str(p.nome ?? p.name ?? p.razaoSocial ?? "")).filter(Boolean).join(",");
  } else {
    partePassiva = str(proc.partePassiva ?? proc.poloPassivo ?? proc.polo_passivo ?? proc.reu ?? "");
  }
  if (!partePassiva && Array.isArray(proc.envolvidos)) {
    const reus = (proc.envolvidos as Record<string,unknown>[]).filter(e =>
      str(e.papel ?? e.role ?? "").toUpperCase().match(/REU|RECLAMAD/)
    );
    if (reus.length) partePassiva = reus.map(e => str(e.nome ?? e.name ?? e.nomeEnvolvido ?? "")).filter(Boolean).join(",");
  }

  const clienteTag = partePassiva.split(",").find(p => p.toUpperCase().includes("(CLIENTE)"));
  const cliente = clienteTag
    ? clienteTag.replace(/\s*\(CLIENTE\)\s*/i, "").trim()
    : str(proc.cliente ?? proc.nomeCliente ?? "");

  const codigoProcesso = typeof proc.codigoProcesso === "number" ? proc.codigoProcesso
    : typeof proc.codigo === "number" ? proc.codigo : undefined;

  // ── Vara/Turma — campo "Órgão" na tela do Projuris ──────────────────────────
  const varaRaw = proc.vara;
  const vara = varaRaw && typeof varaRaw === "object"
    ? str((varaRaw as Record<string,unknown>).valor)
    : str(varaRaw ?? "");

  return { marcadores, parteAtiva, partePassiva, cliente, vara, codigoProcesso };
}

async function fetchProcessoDetalhes(
  sb: ReturnType<typeof createClient>,
  numeros: string[],
  codigoMap: Map<string, number> = new Map()
): Promise<Map<string, ProcessoDetalhes>> {
  const mapa = new Map<string, ProcessoDetalhes>();
  const codigoFromApi = new Map<string, number>();
  if (!numeros.length) return mapa;

  // ── Passo 0: reaproveita o que já está em cache e ainda é válido ──────────
  const { data: cacheRows } = await sb
    .from("projuris_processo_cache")
    .select("numero_processo,marcadores,parte_ativa,parte_passiva,cliente,vara,codigo_processo,updated_at")
    .in("numero_processo", numeros);

  const agora = Date.now();
  const validos = new Set<string>();
  for (const row of (cacheRows ?? []) as Record<string, unknown>[]) {
    const atualizadoEm = new Date(str(row.updated_at)).getTime();
    const horasDesde = (agora - atualizadoEm) / 3600000;
    const num = str(row.numero_processo);
    if (horasDesde <= CACHE_TTL_HORAS) {
      mapa.set(num, {
        marcadores: (row.marcadores as string[]) ?? [],
        parteAtiva: str(row.parte_ativa),
        partePassiva: str(row.parte_passiva),
        cliente: str(row.cliente),
        vara: str(row.vara),
      });
      validos.add(num);
      if (row.codigo_processo) codigoFromApi.set(num, row.codigo_processo as number);
    }
  }
  const faltantes = numeros.filter(n => !validos.has(n));
  console.log(`Cache de processos: ${validos.size} reaproveitados, ${faltantes.length} a buscar na API`);
  if (!faltantes.length) return mapa;

  // ── Passo 1: busca em lote por número CNJ (só os que faltam) ──────────────
  for (let i = 0; i < faltantes.length; i += 20) {
    const batch = faltantes.slice(i, i + 20);
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
      if (!resp.ok) { console.warn("fetchProcessoDetalhes lote " + i + " -> " + resp.status); continue; }
      const body = await resp.json() as Record<string,unknown>;
      const items = ((body.content ?? body.data ?? body.processoConsultaWs ?? []) as Record<string,unknown>[]);
      for (const proc of items) {
        const num = str(proc.numeroProcesso ?? proc.numero_processo ?? proc.processo ?? "");
        if (!num) continue;
        const det = _extrairDetalhesDeProc(proc);
        mapa.set(num, det);
        // Guarda codigoProcesso da API para uso nas tentativas individuais
        if (det.codigoProcesso) codigoFromApi.set(num, det.codigoProcesso);
      }
    } catch(e) { console.warn("fetchProcessoDetalhes lote " + i + ":", e); }
  }

  // ── Passo 2: busca individual (marcadores e/ou vara) para quem ainda não tem ──
  const semDetalhes = faltantes.filter(n => {
    const atual = mapa.get(n);
    return (!atual?.marcadores.length || !atual?.vara) && (codigoMap.has(n) || codigoFromApi.has(n));
  });
  const alvo = semDetalhes.slice(0, 30);
  for (let i = 0; i < alvo.length; i += 5) {
    const lote = alvo.slice(i, i + 5);
    await Promise.all(lote.map(async num => {
      const codProcesso = codigoFromApi.get(num) ?? codigoMap.get(num)!;
      const existing = mapa.get(num);
      let marcadores = existing?.marcadores ?? [];
      let vara = existing?.vara ?? "";

      // 1ª tentativa: detalhe completo do processo — traz marcadorWs E vara
      try {
        const r = await fetch(`${PROJURIS_BASE}/adv-service/processo/${codProcesso}`, { method: "GET", headers: authHeaders() });
        if (r.ok) {
          const body = await r.json() as Record<string,unknown>;
          const det = _extrairDetalhesDeProc(body);
          if (!marcadores.length && det.marcadores.length) marcadores = det.marcadores;
          if (!vara && det.vara) vara = det.vara;
        }
      } catch(_) { /* ignora */ }

      // 2ª/3ª tentativas: só para marcadores, se ainda não encontrados
      if (!marcadores.length) {
        const tentativasMarcador = [
          `${PROJURIS_BASE}/adv-service/processo/${codProcesso}/marcador`,
          `${PROJURIS_BASE}/adv-service/marcador?codigoProcesso=${codProcesso}&quan-registros=50&pagina=0`,
        ];
        for (const url of tentativasMarcador) {
          try {
            const r = await fetch(url, { method: "GET", headers: authHeaders() });
            if (!r.ok) continue;
            const body = await r.json() as Record<string,unknown>;
            if (Array.isArray(body)) {
              marcadores = (body as Record<string,unknown>[]).map(m =>
                str(m.nomeMarcador ?? m.descricao ?? m.nome ?? m.label ?? m.name ?? "").toUpperCase().trim()
              ).filter(Boolean);
            }
            if (!marcadores.length) {
              const list = (body.marcadorWs ?? body.marcadorConsultaWs ?? body.content ?? body.data ?? []) as Record<string,unknown>[];
              if (Array.isArray(list)) {
                marcadores = list.map(m => str(m.nomeMarcador ?? m.descricao ?? m.nome ?? "").toUpperCase().trim()).filter(Boolean);
              }
            }
            if (marcadores.length) break;
          } catch(_) { /* ignora */ }
        }
      }

      if (marcadores.length || vara) {
        mapa.set(num, {
          marcadores,
          parteAtiva:   existing?.parteAtiva   || "",
          partePassiva: existing?.partePassiva  || "",
          cliente:      existing?.cliente       || "",
          vara,
        });
        console.log("Detalhes individuais: " + num + " [cod=" + codProcesso + "] marcadores=" + marcadores.join(",") + " vara=" + vara);
      }
    }));
  }

  console.log("Detalhes de processos carregados para " + mapa.size + " processos (individuais: " + semDetalhes.length + " tentados)");

  // ── Passo 3: grava/atualiza o cache com o que acabou de buscar ──────────────────
  // Salva TODOS os faltantes (inclusive sem dados da API) para garantir que
  // codigo_processo (do codigoMap keyset) fique registrado e o sincronizarMarcadoresProcessos
  // consiga buscá-los individualmente nas próximas rodadas.
  const upsertsCache = faltantes.map(n => {
      const det = mapa.get(n);
      return {
        numero_processo: n,
        marcadores: det ? det.marcadores : null,  // null = não verificado pelo sincronizarMarcadoresProcessos ainda
        parte_ativa: det?.parteAtiva ?? "",
        parte_passiva: det?.partePassiva ?? "",
        cliente: det?.cliente ?? "",
        vara: det?.vara ?? "",
        codigo_processo: codigoFromApi.get(n) ?? codigoMap.get(n) ?? null,
        updated_at: new Date().toISOString(),
      };
    });
  if (upsertsCache.length) {
    const { error: cacheErr } = await sb.from("projuris_processo_cache").upsert(upsertsCache, { onConflict: "numero_processo" });
    if (cacheErr) console.warn("Erro ao gravar cache de processos:", cacheErr.message);
  }

  // ── Passo 4: atualiza codigo_processo em entradas de cache que ainda não o têm ──
  const semCodigo = [...validos].filter(n => !codigoFromApi.has(n) && codigoMap.has(n));
  for (const n of semCodigo) {
    try {
      await sb.from("projuris_processo_cache")
        .update({ codigo_processo: codigoMap.get(n) })
        .eq("numero_processo", n)
        .is("codigo_processo", null);
    } catch(_) { /* ignora */ }
  }
  if (semCodigo.length) console.log(`Cache: ${semCodigo.length} entradas atualizadas com codigo_processo`);

  return mapa;
}

async function fetchMarcadoresPorProcesso(sb: ReturnType<typeof createClient>, numeros: string[]): Promise<Map<string, string[]>> {
  const detalhes = await fetchProcessoDetalhes(sb, numeros);
  const mapa = new Map<string, string[]>();
  detalhes.forEach((v, k) => mapa.set(k, v.marcadores));
  return mapa;
}

/**
 * Mapeia os marcadores (etiquetas) reais do processo no Projuris para o tipo_responsabilidade.
 * Só classifica com base em marcador real do Projuris — sem fallback por posição no polo
 * passivo ou nome "ifood". Se nada bater, retorna "" (fica em branco p/ preenchimento manual).
 */
function identificarTipoPorMarcadores(marcadoresOriginais: string[]): string {
  const semAcento = (s: string) =>
    s.toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  for (const original of marcadoresOriginais) {
    const nome = str(original).toUpperCase().trim();
    const norm = semAcento(nome);

    // OL SUBS/SOLI, OL SUBSIDIÁRIA ou qualquer marcador que comece com "OL"
    if (norm.startsWith("OL")) return "OL-SUBSIDIÁRIA";

    // RESPONSABILIDADE SUBSIDIÁRIA ou só SUBSIDIÁRIA
    if (norm === "RESPONSABILIDADE SUBSIDIARIA" || norm === "SUBSIDIARIA") return "SUBSIDIÁRIA";

    // TERCERIZAÇÃO (grafia como está no Projuris) ou TERCEIRIZAÇÃO
    if (norm === "TERCEIRIZACAO" || norm === "TERCERIZACAO") return "TERCEIRIZAÇÃO";

    // EX-FUNCIONÁRIO ou EX-FUNCIONÁRIO(A)
    if (norm === "EX-FUNCIONARIO" || norm === "EX-FUNCIONARIO(A)") return "EX-FUNCIONÁRIO(A)";

    // EX-FOODLOVER / EXFOODLOVER
    if (norm === "EX-FOODLOVER" || norm === "EXFOODLOVER") return "EX-FOODLOVER";

    // FRANQUIA ou FRANQUIA/ENTREGO
    if (norm.startsWith("FRANQUIA")) return "FRANQUIA";

    // MARKETPLACE
    if (norm === "MARKETPLACE") return "MARKETPLACE";

    // NUVEM ou NUVEM/ZATTAR — mantém o nome real do Projuris, sem unificar
    if (norm.startsWith("NUVEM")) return nome;
  }

  return "";
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
        const tipo_responsabilidade = identificarTipoPorMarcadores(marcadores);

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
  const marcadoresMap = await fetchMarcadoresPorProcesso(sb, numerosProcesso);

  let atualizados = 0;
  for (const row of data as {id:string; processo:string; reclamada:string}[]) {
    const marcadores = marcadoresMap.get(row.processo ?? "") ?? [];
    const resp = identificarTipoPorMarcadores(marcadores);
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
    const lote = records.slice(i, i + 50);
    // Usa função PostgreSQL que faz COALESCE: não sobrescreve campos preenchidos com string vazia
    for (const rec of lote) {
      const { error } = await sb.rpc("upsert_pauta_audiencia", { p: rec });
      if (error) {
        console.error("upsert_pauta_audiencia erro:", error.message);
        throw new Error(`Upsert falhou: ${error.message} | ${error.details ?? ""}`);
      }
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

  // Descobre os códigos de tipo de tarefa cadastrados (ex.: para achar o código de
  // "Perícia" e configurar a secret PERICIA_TIPO_CODIGO): GET ?listar-tipos-tarefa=1
  const url = new URL(req.url);
  if (url.searchParams.get("listar-tipos-tarefa") === "1") {
    try {
      await getToken();
      const hoje = new Date();
      const ini = new Date(hoje.getTime() - 60*86400000).toISOString().slice(0,10) + "T00:00:00Z";
      const fim = new Date(hoje.getTime() + 60*86400000).toISOString().slice(0,10) + "T23:59:59Z";
      const kurl = `${PROJURIS_BASE}/adv-service/v2/tarefa/consulta-keyset?quan-registros=200&pagina=0&ordenacao-tipo=ASC&ordenacao-chave=ORDENACAO_DATA_PREVISTA`;
      const body = {
        filtroGeral: "", tipoFiltroTarefaConsulta: "TODOS", unidadeOrganizacional: null, tituloCompromisso: "",
        codigosTarefaTipo: [], usuariosResponsaveis: [], concluidaPor: [], gruposResponsaveis: [],
        marcadores: [], tarefaTipoData: "DATA_PREVISTA_CONCLUSAO", dataTarefaInicio: ini, dataTarefaFim: fim,
        flagDadosCompletosResponsaveis: true, numeroProcesso: null, nomePessoaEnvolvido: null, assuntoVinculo: "",
        moduloTarefa: null, codigoRegistroVinculo: null, flagVinculoPrincipal: true,
        tipoInformacaoExclusao: "NAO_EXIBIR_EXCLUIDOS", identificadorAndamento: "", flagCompromisso: false,
        flagClassificacaoAudiencia: false, flagClassificacaoTarefa: false,
      };
      const r = await fetch(kurl, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      const txt = await r.text();
      if (!r.ok) return Response.json({ status: r.status, preview: txt.slice(0, 500) }, { headers: CORS });
      const json = JSON.parse(txt) as Record<string, unknown>;
      const itens = (json.tarefaConsultaWs as Record<string, unknown>[]) ?? [];
      // Agrupa por qualquer campo que pareça identificar o tipo/código da tarefa —
      // não sabemos de antemão o nome exato do campo numérico, então coletamos os
      // candidatos mais prováveis lado a lado.
      interface TipoInfo {
        nome: string;
        codigoTarefaTipo: unknown;
        codigoTipoTarefa: unknown;
        tarefaTipo: unknown;
        ocorrencias: number;
      }
      const porTipo = new Map<string, TipoInfo>();
      for (const it of itens) {
        const nome = String(it.nomeTarefaTipo ?? it.tipoTarefa ?? it.tipo_tarefa ?? "(sem nome)");
        const atual = porTipo.get(nome) ?? {
          nome,
          codigoTarefaTipo: it.codigoTarefaTipo ?? null,
          codigoTipoTarefa: it.codigoTipoTarefa ?? null,
          tarefaTipo: it.tarefaTipo ?? null,
          ocorrencias: 0,
        };
        atual.ocorrencias++;
        porTipo.set(nome, atual);
      }
      return Response.json({
        total: itens.length,
        janela: { ini, fim },
        tipos: [...porTipo.values()],
        amostraCrua: itens[0] ?? null,
      }, { headers: CORS });
    } catch(e) { return Response.json({ error: String(e) }, { status: 500, headers: CORS }); }
  }

    // Varre o catálogo de tipos de tarefa por código sequencial, um a um, via
  // GET /adv-service/tarefa-tipo/{codigo} — usar quando ?listar-tipos-tarefa=1 falhar
  // (a consulta-keyset com codigosTarefaTipo:[] pode dar 500 no Projuris).
  // GET ?listar-tipos-tarefa=2[&de=6125400&ate=6125470]
  if (url.searchParams.get("listar-tipos-tarefa") === "2") {
    try {
      await getToken();
      const de  = parseInt(url.searchParams.get("de")  ?? "", 10) || (AUDIENCIA_TIPO_CODIGO - 30);
      const ate = parseInt(url.searchParams.get("ate") ?? "", 10) || (AUDIENCIA_TIPO_CODIGO + 30);
      const resultados: Record<string, unknown>[] = [];
      for (let cod = de; cod <= ate; cod++) {
        try {
          const r = await fetch(`${PROJURIS_BASE}/adv-service/tarefa-tipo/${cod}`, { headers: authHeaders() });
          if (!r.ok) { resultados.push({ codigo: cod, status: r.status }); continue; }
          const txt = await r.text();
          let dado: unknown;
          try { dado = JSON.parse(txt); } catch { dado = txt.slice(0, 200); }
          resultados.push({ codigo: cod, dado });
        } catch (e) {
          resultados.push({ codigo: cod, erro: String(e) });
        }
      }
      return Response.json({ intervalo: { de, ate }, resultados }, { headers: CORS });
    } catch(e) { return Response.json({ error: String(e) }, { status: 500, headers: CORS }); }
  }

  // Modo diagnóstico: GET ?diag=1
  if (url.searchParams.get("diag") === "1") {
    const resultado = await diagnosticarAuth();
    return Response.json({ diag: resultado }, { headers: CORS });
  }

  // Lista todos os marcadores do Projuris: GET ?debug-marcadores-lista=1
  if (url.searchParams.get("debug-marcadores-lista") === "1") {
    try {
      await getToken();
      const sb2 = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: cr } = await sb2.from("projuris_processo_cache").select("codigo_processo").not("codigo_processo","is",null).limit(1).single();
      const rawCod = (cr as Record<string,unknown> | null)?.codigo_processo;
      const cod = rawCod ? Number(rawCod) : 0;
      if (!cod) return Response.json({ error: "Sem codigoProcesso no cache" }, { headers: CORS });
      const resp = await fetch(`${PROJURIS_BASE}/adv-service/marcador/consulta?quan-registros=50&pagina=0&codigo-processo=${cod}`, { method: "GET", headers: authHeaders() });
      const txt = await resp.text();
      if (!resp.ok) return Response.json({ status: resp.status, cod, preview: txt.slice(0,300) }, { headers: CORS });
      const body = JSON.parse(txt) as Record<string, unknown>;
      const lista = (body.marcadorWs ?? body.content ?? body.data ?? []) as Record<string, unknown>[];
      const nomes = lista.map(m => `${m.codigoMarcador}:${m.nomeMarcador}`).join(", ");
      return Response.json({ status: resp.status, total: lista.length, codigoUsado: cod, marcadores: nomes.slice(0, 3000) }, { headers: CORS });
    } catch(e) { return Response.json({ error: String(e) }, { status: 500, headers: CORS }); }
  }

  // Endpoint: POST ?set-marcador=1  body: { processo: "...", tipo_responsabilidade: "..." }
  // Cria/confirma marcador no Projuris correspondente ao tipo_responsabilidade salvo no site
  if (url.searchParams.get("set-marcador") === "1") {
    try {
      await getToken();
      const sb2 = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      let body2: Record<string,unknown> = {};
      try { body2 = await req.json(); } catch { /* sem body */ }
      const processo = str(body2.processo);
      const tipo = str(body2.tipo_responsabilidade).trim();
      if (!processo || !tipo) return Response.json({ ok: false, error: "processo e tipo_responsabilidade são obrigatórios" }, { status: 400, headers: CORS });

      // Mapa tipo_responsabilidade → {codigoMarcador, nomeMarcador} real no Projuris
      const MAPA_MARCADORES: Record<string, { codigoMarcador: number; nomeMarcador: string; extra?: {codigoMarcador: number; nomeMarcador: string} }> = {
        "EX-FOODLOVER":          { codigoMarcador: 1756633, nomeMarcador: "EX-FOODLOVER" },
        "EX-FUNCIONÁRIO(A)":     { codigoMarcador: 1686384, nomeMarcador: "EX-FUNCIONÁRIO(A)" },
        "FRANQUIA":              { codigoMarcador: 1798674, nomeMarcador: "FRANQUIA/ENTREGO" },
        "MARKETPLACE":           { codigoMarcador: 1798682, nomeMarcador: "Marketplace" },
        "NUVEM":                 { codigoMarcador: 1710723, nomeMarcador: "NUVEM" },
        "NUVEM/ZATTAR":          { codigoMarcador: 1686364, nomeMarcador: "Nuvem/Zattar" },
        "NUVEM - ESTRATÉGICO":   { codigoMarcador: 1710723, nomeMarcador: "NUVEM", extra: { codigoMarcador: 1687122, nomeMarcador: "ESTRATÉGICO" } },
        "OL-SUBSIDIÁRIA":        { codigoMarcador: 1686393, nomeMarcador: "OL SUBS/SOLI" },
        "SUBSIDIÁRIA":           { codigoMarcador: 1710736, nomeMarcador: "RESPONSABILIDADE SUBSIDIÁRIA" },
        "TERCEIRIZAÇÃO":         { codigoMarcador: 1686410, nomeMarcador: "TERCEIRIZAÇÃO" },
      };

      const marcadorInfo = MAPA_MARCADORES[tipo.toUpperCase()] ?? MAPA_MARCADORES[tipo];
      if (!marcadorInfo) return Response.json({ ok: false, error: `Tipo '${tipo}' não mapeado para marcador Projuris`, mapeados: Object.keys(MAPA_MARCADORES) }, { status: 400, headers: CORS });

      // Busca o codigoProcesso no cache
      const { data: cacheRow } = await sb2.from("projuris_processo_cache")
        .select("codigo_processo")
        .eq("numero_processo", processo)
        .not("codigo_processo", "is", null)
        .single();
      if (!cacheRow) return Response.json({ ok: false, error: `Processo ${processo} não encontrado no cache ou sem codigoProcesso` }, { status: 404, headers: CORS });
      const codProcesso = Number((cacheRow as Record<string,unknown>).codigo_processo);

      // Cria o(s) marcador(es) no Projuris
      const resp = await fetch(`${PROJURIS_BASE}/adv-service/processo/${codProcesso}/marcador`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ codigoMarcador: marcadorInfo.codigoMarcador, nomeMarcador: marcadorInfo.nomeMarcador }),
      });
      const respTxt = await resp.text();
      if (!resp.ok && resp.status !== 409) {
        return Response.json({ ok: false, error: `Projuris retornou ${resp.status}`, detalhe: respTxt.slice(0, 200) }, { status: 500, headers: CORS });
      }
      // Se houver marcador extra (ex: NUVEM - ESTRATÉGICO), cria também
      if (marcadorInfo.extra) {
        await fetch(`${PROJURIS_BASE}/adv-service/processo/${codProcesso}/marcador`, {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ codigoMarcador: marcadorInfo.extra.codigoMarcador, nomeMarcador: marcadorInfo.extra.nomeMarcador }),
        });
      }

      // Atualiza o cache local com o marcador confirmado
      const { data: cacheAtual } = await sb2.from("projuris_processo_cache")
        .select("marcadores")
        .eq("numero_processo", processo)
        .single();
      const marcadoresAtuais = ((cacheAtual as Record<string,unknown>)?.marcadores as string[] | null) ?? [];
      if (!marcadoresAtuais.includes(marcadorInfo.nomeMarcador.toUpperCase())) {
        await sb2.from("projuris_processo_cache")
          .update({ marcadores: [...marcadoresAtuais, marcadorInfo.nomeMarcador.toUpperCase()], updated_at: new Date().toISOString() })
          .eq("numero_processo", processo);
      }

      return Response.json({ ok: true, processo, tipo, codigoProcesso: codProcesso, marcador: marcadorInfo, projurisStatus: resp.status }, { headers: CORS });
    } catch(e) { return Response.json({ ok: false, error: String(e) }, { status: 500, headers: CORS }); }
  }

  // Modo debug de keyset: GET ?debug-keyset=1
  if (url.searchParams.get("debug-keyset") === "1") {
    try {
      await getToken();
      const janela = janelaBusca();
      const kurl = `${PROJURIS_BASE}/adv-service/v2/tarefa/consulta-keyset?quan-registros=200&pagina=0&ordenacao-tipo=ASC&ordenacao-chave=ORDENACAO_DATA_PREVISTA`;
      const body = {
        filtroGeral: "", tipoFiltroTarefaConsulta: "TODOS", unidadeOrganizacional: null, tituloCompromisso: "",
        codigosTarefaTipo: TIPOS_TAREFA_CODIGOS, usuariosResponsaveis: [], concluidaPor: [], gruposResponsaveis: [],
        marcadores: [], tarefaTipoData: "DATA_PREVISTA_CONCLUSAO", dataTarefaInicio: janela.iniISO, dataTarefaFim: janela.fimISO,
        flagDadosCompletosResponsaveis: true, numeroProcesso: null, nomePessoaEnvolvido: null, assuntoVinculo: "",
        moduloTarefa: null, codigoRegistroVinculo: null, flagVinculoPrincipal: true,
        tipoInformacaoExclusao: "NAO_EXIBIR_EXCLUIDOS", identificadorAndamento: "", flagCompromisso: false,
        flagClassificacaoAudiencia: false, flagClassificacaoTarefa: false,
      };
      const r = await fetch(kurl, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      const txt = await r.text();
      return Response.json({ status: r.status, janela, body_preview: txt.slice(0, 500) }, { headers: CORS });
    } catch(e) { return Response.json({ error: String(e) }, { status: 500, headers: CORS }); }
  }

  // Modo debug de marcadores: GET ?debug-marcadores=1&codigo={codigoProcesso}
  if (url.searchParams.get("debug-marcadores") === "1") {
    try {
      await getToken();
      const cod = url.searchParams.get("codigo") || "24995302";
      const resultados: Record<string, string> = {};
      const tentativas = [
        `GET /adv-service/processo/${cod}`,
        `GET /adv-service/processo/${cod}/marcador`,
        `GET /adv-service/processo/${cod}/marcadores`,
        `GET /adv-service/marcador?codigoProcesso=${cod}&quan-registros=50&pagina=0`,
        `GET /adv-service/marcador/consulta?quan-registros=50&pagina=0&codigo-processo=${cod}`,
        `GET /adv-service/marcador/processo?codigoProcesso=${cod}`,
        `GET /adv-service/processo/detalhe?codigoProcesso=${cod}`,
        `POST /adv-service/processo/detalhe`,
      ];
      for (const t of tentativas) {
        const [method, path] = t.split(" ");
        const fullUrl = `${PROJURIS_BASE}/adv-service${path.replace("/adv-service","").replace("/adv-service","") }`;
        try {
          const opts: RequestInit = { method, headers: authHeaders() };
          if (method === "POST") opts.body = JSON.stringify({ codigoProcesso: parseInt(cod) });
          const r = await fetch(fullUrl, opts);
          const body = await r.text();
          resultados[t] = `${r.status} | ${body.slice(0, 800)}`;
        } catch(e) { resultados[t] = `ERR: ${e}`; }
      }
      return Response.json({ debug: "marcadores", codigo: cod, resultados }, { headers: CORS });
    } catch(e) { return Response.json({ error: String(e) }, { status: 500, headers: CORS }); }
  }
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
      const marcadoresMap = await fetchMarcadoresPorProcesso(sb, numeros);

      let atualizados = 0;
      for (const row of data as {id:string; processo:string; reclamada:string}[]) {
        const marcadores = marcadoresMap.get(row.processo ?? "") ?? [];
        const resp = identificarTipoPorMarcadores(marcadores);
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

    const janela = janelaBusca();
    const { itens: raw, parcial } = await fetchAudiencias(janela);
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

    // Busca detalhes (marcadores + partes) dos processos para enriquecer os tasks
    const numerosProcesso = [...new Set(
      (raw as Record<string,unknown>[])
        .map(r => str(r.numeroProcesso ?? r.numero_processo ?? r.processo ?? ""))
        .filter(Boolean)
    )];
    // Mapa de número CNJ → codigoProcesso interno do Projuris (modulo.chave)
    const codigoMap = new Map<string, number>();
    (raw as Record<string,unknown>[]).forEach(item => {
      const num = str(item.numeroProcesso ?? item.numero_processo ?? item.processo ?? "");
      const cod = (item.modulo as Record<string,unknown>)?.chave;
      if (num && typeof cod === "number" && cod > 0) codigoMap.set(num, cod);
    });
    const processoMap = await fetchProcessoDetalhes(sb, numerosProcesso, codigoMap);

    // Enriquece cada item com dados do processo (marcadores + partes faltantes)
    const enriched = (raw as Record<string,unknown>[]).map(item => {
      const num = str(item.numeroProcesso ?? item.numero_processo ?? item.processo ?? "");
      const det = processoMap.get(num);
      if (!det) return item;
      const enrichedItem: Record<string,unknown> = { ...item };
      // Marcadores: usa do processo se o task não trouxer
      if (det.marcadores.length && !(Array.isArray(item.marcadores) && (item.marcadores as unknown[]).length)) {
        enrichedItem.marcadores = det.marcadores;
      }
      // Partes: usa do processo se o task veio sem parteAtiva/partePassiva
      if (!str(item.parteAtiva ?? "") && det.parteAtiva)   enrichedItem.parteAtiva   = det.parteAtiva;
      if (!str(item.partePassiva ?? "") && det.partePassiva) enrichedItem.partePassiva = det.partePassiva;
      if (!str(item.nomeCliente ?? "") && det.cliente)     enrichedItem.nomeCliente  = det.cliente;
      if (!str(item.vara ?? "") && det.vara)               enrichedItem.vara         = det.vara;
      return enrichedItem;
    });

    const allRecords = enriched.map(normalizar);
    // Deduplica por processo+data+hora — a mesma audiência pode aparecer duas vezes
    // na API do Projuris (ex: tarefa regular + OL-SUBSIDIÁRIA) com campos de hora
    // vindos de fontes distintas, gerando IDs diferentes mas mesmo conteúdo.
    // Mantém o registro com mais campos preenchidos (maior string total).
    const seenNatural = new Map<string, Record<string,unknown>>();
    for (const rec of allRecords) {
      const natKey = `${rec.processo}|${rec.data_audiencia}|${rec.horario}`;
      const existing = seenNatural.get(natKey);
      if (!existing) {
        seenNatural.set(natKey, rec);
      } else {
        // Prefere o registro com mais conteúdo (tipo_audiencia, vara, etc.)
        const scoreNew = [rec.tipo_audiencia, rec.vara, rec.modalidade, rec.reclamante, rec.reclamada].filter(Boolean).join("").length;
        const scoreOld = [existing.tipo_audiencia, existing.vara, existing.modalidade, existing.reclamante, existing.reclamada].filter(Boolean).join("").length;
        if (scoreNew > scoreOld) seenNatural.set(natKey, rec);
      }
    }
    const records = [...seenNatural.values()];
    const saved   = await upsertSupabase(sb, records);
    const idsAtuais = records.map(r => String(r.id));
    // Pula reconciliação se a coleta foi parcial: evita marcar como canceladas
    // audiências que simplesmente não vieram por falha de paginação
    const canceladas = parcial
      ? (console.warn("Reconciliação pulada: coleta parcial — não seria seguro inferir cancelamentos"), 0)
      : await reconciliarCanceladas(sb, idsAtuais, janela.hojeStr, janela.fimStr);
    const marcadoresSync = await sincronizarMarcadoresProcessos(sb);
    const partesCompletadas = await completarPartesAusentes(sb);
    const classificados = await classificarExistentes(sb);
    await recordSync(sb, saved);
    console.log(`Salvas: ${saved} | Canceladas: ${canceladas} | Marcadores: ${marcadoresSync} | Partes: ${partesCompletadas} | Classificados: ${classificados}${parcial ? " | AVISO: coleta parcial" : ""}`);
    const debugMode = url.searchParams.get("debug") === "1";
    if (debugMode) {
      return Response.json({ ok:true, message:`${saved} audiencias sincronizadas`, saved, canceladas, marcadoresSync, partesCompletadas, classificados, parcial, sample: records.slice(0,2), total_found: raw.length }, { headers:CORS });
    }
    return Response.json({ ok:true, message:`${saved} audiencias sincronizadas`, saved, canceladas, marcadoresSync, partesCompletadas, classificados, parcial }, { headers:CORS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Erro:", msg);
    return Response.json({ ok:false, error:msg }, { status:500, headers:CORS });
  }
});
