// ============================================================
// PROJURIS — autenticação Keycloak e chamadas à API
// Endpoint correto descoberto via DevTools:
// POST /adv-service/v2/processo/consulta
// ============================================================

function obterToken() {
  var cache  = CacheService.getScriptCache();
  var cached = cache.get("projuris_token");
  if (cached) return cached;

  var props = PropertiesService.getScriptProperties();
  var email = props.getProperty("projuris_email");
  var senha = props.getProperty("projuris_senha");

  if (!email || !senha) {
    throw new Error("Configure seu email e senha do Projuris no painel (⚙️ Credenciais).");
  }

  var resp = UrlFetchApp.fetch(CFG.TOKEN_URL, {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      grant_type:    "password",
      client_id:     CFG.CLIENT_ID,
      client_secret: CFG.CLIENT_SECRET,
      username:      email,
      password:      senha,
      scope:         "openid",
    },
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error("Falha na autenticação Projuris: " + resp.getContentText().substring(0, 200));
  }

  var data  = JSON.parse(resp.getContentText());
  var token = data.access_token;
  cache.put("projuris_token", token, 240);
  return token;
}

function _headers() {
  return {
    "Authorization":  "Bearer " + obterToken(),
    "Accept":         "application/json, text/plain, */*",
    "Content-Type":   "application/json",
    "Cache-Control":  "no-cache",
    "Origin":         "https://app.projurisadv.com.br",
    "Referer":        "https://app.projurisadv.com.br/",
    "User-Agent":     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "X-Requested-With": "XMLHttpRequest",
  };
}

// ------------------------------------------------------------------
// Lista processos via POST /v2/processo/consulta
// ------------------------------------------------------------------

function listarProcessos(pagina, quantidade) {
  pagina     = pagina     || 0;
  quantidade = quantidade || 50;

  var url = CFG.API_BASE + "/v2/processo/consulta"
    + "?quan-registros=" + quantidade
    + "&pagina=" + pagina
    + "&ordenacao-chave=ORDENACAO_IDENTIFICADOR"
    + "&ordenacao-tipo=DESC";

  var body = {
    filtroGeral: "",
    flHabilitado: true,
    flEstouEnvolvido: false,
    flSouResponsavel: false,
    campoDinamicoConsultaFiltro: [],
    codigoGruposResponsaveis: [],
    codigoUsuariosResponsaveis: [],
    codigosCarteira: [],
    codigosGrupoEmpresarial: [],
    marcadores: [],
    numerosProcesso: [],
    resultados: [],
    sistemas: [],
  };

  var resp = UrlFetchApp.fetch(url, {
    method: "post",
    headers: _headers(),
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) {
    Logger.log("listarProcessos erro " + resp.getResponseCode() + ": " + resp.getContentText().substring(0, 300));
    return [];
  }

  var data = JSON.parse(resp.getContentText());
  // Projuris retorna { processoConsultaResumoWs: { total: N, processoConsultaResumoWs: [...] } }
  if (data.processoConsultaResumoWs) {
    var inner = data.processoConsultaResumoWs;
    if (Array.isArray(inner))                         return inner;
    if (inner.processoConsultaResumoWs)               return inner.processoConsultaResumoWs;
  }
  if (Array.isArray(data))          return data;
  if (data.data)                    return data.data;
  if (data.content)                 return data.content;
  if (data.processos)               return data.processos;
  if (data.resultado)               return data.resultado;
  if (data.itens)                   return data.itens;
  if (data.registros)               return data.registros;
  Logger.log("Estrutura inesperada: " + JSON.stringify(data).substring(0, 200));
  return [];
}

// ------------------------------------------------------------------
// Busca processos pelos números da planilha (em lotes de 50)
// Também busca novos processos dos clientes da planilha
// ------------------------------------------------------------------

function buscarProcessosPorNumeros(numeros, clientesDaPlanilha) {
  var todos = [];
  var numerosLimpos = numeros.map(function(n) { return n.trim(); }).filter(Boolean);

  // Lote 1: processos cujos números já estão na planilha
  var LOTE = 50;
  for (var i = 0; i < numerosLimpos.length; i += LOTE) {
    var lote = numerosLimpos.slice(i, i + LOTE);
    var url = CFG.API_BASE + "/v2/processo/consulta"
      + "?quan-registros=" + lote.length
      + "&pagina=0&ordenacao-chave=ORDENACAO_IDENTIFICADOR&ordenacao-tipo=DESC";
    var body = {
      filtroGeral: "",
      flHabilitado: true,
      flEstouEnvolvido: false,
      flSouResponsavel: false,
      campoDinamicoConsultaFiltro: [],
      codigoGruposResponsaveis: [],
      codigoUsuariosResponsaveis: [],
      codigosCarteira: [],
      codigosGrupoEmpresarial: [],
      marcadores: [],
      numerosProcesso: lote,
      resultados: [],
      sistemas: [],
    };
    try {
      var resp = UrlFetchApp.fetch(url, {
        method: "post", headers: _headers(),
        payload: JSON.stringify(body), muteHttpExceptions: true,
      });
      if (resp.getResponseCode() === 200) {
        var data = JSON.parse(resp.getContentText());
        var lista = [];
        if (data.processoConsultaResumoWs) {
          var inner = data.processoConsultaResumoWs;
          lista = Array.isArray(inner) ? inner : (inner.processoConsultaResumoWs || []);
        } else {
          lista = Array.isArray(data) ? data : (data.data || data.content || data.processos || []);
        }
        todos = todos.concat(lista);
      } else {
        Logger.log("buscarProcessosPorNumeros lote " + i + " HTTP " + resp.getResponseCode());
      }
    } catch(e) {
      Logger.log("buscarProcessosPorNumeros erro: " + e.message);
    }
  }

  // Lote 2: novos processos dos clientes (sem filtro de número — pega os últimos 500 e filtra pelo cliente)
  if (clientesDaPlanilha && clientesDaPlanilha.length > 0) {
    var urlNovos = CFG.API_BASE + "/v2/processo/consulta"
      + "?quan-registros=200&pagina=0&ordenacao-chave=ORDENACAO_IDENTIFICADOR&ordenacao-tipo=DESC";
    var bodyNovos = {
      filtroGeral: "",
      flHabilitado: true,
      flEstouEnvolvido: false,
      flSouResponsavel: false,
      campoDinamicoConsultaFiltro: [],
      codigoGruposResponsaveis: [],
      codigoUsuariosResponsaveis: [],
      codigosCarteira: [],
      codigosGrupoEmpresarial: [],
      marcadores: [],
      numerosProcesso: [],
      resultados: [],
      sistemas: [],
    };
    try {
      var respNovos = UrlFetchApp.fetch(urlNovos, {
        method: "post", headers: _headers(),
        payload: JSON.stringify(bodyNovos), muteHttpExceptions: true,
      });
      if (respNovos.getResponseCode() === 200) {
        var dataNovos = JSON.parse(respNovos.getContentText());
        var listaNovos = [];
        if (dataNovos.processoConsultaResumoWs) {
          var innerN = dataNovos.processoConsultaResumoWs;
          listaNovos = Array.isArray(innerN) ? innerN : (innerN.processoConsultaResumoWs || []);
        } else {
          listaNovos = Array.isArray(dataNovos) ? dataNovos : (dataNovos.data || dataNovos.content || []);
        }
        // Remove processos já incluídos pelo lote de números
        var numerosJaBuscados = {};
        todos.forEach(function(p) { if (p.numeroProcesso) numerosJaBuscados[p.numeroProcesso] = true; });
        listaNovos.forEach(function(p) {
          if (!numerosJaBuscados[p.numeroProcesso]) todos.push(p);
        });
      }
    } catch(e) {
      Logger.log("buscarProcessosPorNumeros novos erro: " + e.message);
    }
  }

  Logger.log("buscarProcessosPorNumeros: " + todos.length + " processos total");
  return todos;
}

// ------------------------------------------------------------------
// Andamentos de um processo
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Busca andamentos recentes de todos os processos de uma vez
// Retorna mapa { codigoProcesso: { texto, data } }
// ------------------------------------------------------------------

function buscarAndamentosRecentes(diasAtras, codigosProcesso) {
  diasAtras = diasAtras || 90;
  var agora  = new Date();
  var inicio = new Date(agora.getTime() - diasAtras * 24 * 60 * 60 * 1000);

  var body = {
    visaoEscritorio:       true,
    filtroRapidoAndamento: "TODOS",
    processo:              null,
    dataBase:              agora.toISOString(),
    dataInicioPeriodo:     inicio.toISOString(),
    dataTerminoPeriodo:    agora.toISOString(),
  };

  var mapa = {};
  var POR_PAGINA = 500;
  var pagina = 0;
  var total = null;

  // Pagina até cobrir todos os andamentos do período
  while (true) {
    var url = CFG.API_BASE + "/v2/processo-andamento/consulta"
      + "?quan-registros=" + POR_PAGINA
      + "&pagina=" + pagina
      + "&ordenacao-tipo=DESC&ordenacao-chave=ORDENACAO_DATA_ANDAMENTO";

    try {
      var resp = UrlFetchApp.fetch(url, {
        method:             "post",
        headers:            _headers(),
        payload:            JSON.stringify(body),
        muteHttpExceptions: true,
      });

      if (resp.getResponseCode() !== 200) {
        Logger.log("buscarAndamentosRecentes p" + pagina + " HTTP " + resp.getResponseCode());
        break;
      }

      var data  = JSON.parse(resp.getContentText());
      var lista = data.processoAndamentoIndicadorWs || [];
      if (total === null) total = data.totalRegistros || lista.length;

      lista.forEach(function(a) {
        var codProc = a.codigoProcesso;
        if (!codProc) return;
        // Guarda apenas o mais recente por processo (lista vem em DESC)
        if (!mapa[codProc]) {
          mapa[codProc] = {
            texto: a.descricao || "",
            data:  a.dataAndamento ? new Date(a.dataAndamento) : null,
          };
        }
      });

      Logger.log("Andamentos p" + pagina + ": " + lista.length + " itens | acumulado: " + Object.keys(mapa).length + " processos");

      // Para quando:  obtivemos todos, ou a página veio vazia, ou já cobrimos todos os processos da planilha
      var obtidos = (pagina + 1) * POR_PAGINA;
      var todosCodigosPresentes = codigosProcesso && codigosProcesso.length > 0
        && codigosProcesso.every(function(c) { return mapa[c] !== undefined; });

      if (lista.length < POR_PAGINA || obtidos >= total || todosCodigosPresentes) break;

      pagina++;
      // Segurança: máximo 10 páginas (5000 andamentos)
      if (pagina >= 10) break;

    } catch (e) {
      Logger.log("Erro buscarAndamentosRecentes p" + pagina + ": " + e.message);
      break;
    }
  }

  Logger.log("Andamentos total carregado: " + Object.keys(mapa).length + " processos (total API: " + total + ")");
  return mapa;
}

function ultimosAndamentos(processoId, qtd) {
  // Mantido para compatibilidade, mas não mais usado no fluxo principal
  return [];
}

// ------------------------------------------------------------------
// Normalização dos campos do processo
// ------------------------------------------------------------------

function normalizarProcesso(raw) {
  function pega() {
    for (var i = 0; i < arguments.length; i++) {
      var v = raw[arguments[i]];
      if (v != null && v !== "") return v;
    }
    return null;
  }

  // Acessa objetos aninhados (ex: raw.tribunal.descricao)
  function pegaNested(obj, key) {
    if (!obj) return null;
    if (typeof obj === "string") return obj;
    return obj[key] || obj.descricao || obj.nome || null;
  }

  return {
    numero_processo:       pega("numeroProcesso", "identificador"),
    parte_contraria:       pega("nomeEnvolvido", "parteContraria", "reclamante", "autor"),
    adv_contrario:         pega("nomeAdvogadoEnvolvido", "advogadoContrario"),
    parte_principal:       pega("nomeCliente", "partePrincipal", "reu", "reclamada"),
    tipo_acao:             pega("assunto", "nomeAssunto", "nomeTipoAcao"),
    fase:                  pega("nomeFase", "fase", "nomeSituacao"),
    status_atual:          pega("nomeSituacao", "situacao", "statusAtual", "status"),
    risco:                 pega("nomeRisco", "risco", "nomeClassificacaoRisco"),
    orgao:                 pega("orgaoJulgador", "orgao", "nomeOrgaoJulgador", "nomeVara"),
    instancia:             pega("instancia", "nomeInstancia", "grau"),
    cidade_uf:             pega("nomeMunicipio", "municipio", "cidade", "comarca"),
    valor_causa:           pega("valorCausa", "valor"),
    trt:                   pega("nomeTribunal", "tribunal", "siglaJustica", "trt"),
    data_distribuicao:     pega("dataDistribuicao", "dataCadastro", "dataAbertura"),
    data_ultimo_andamento: pega("dataUltimoAndamento", "dataUltimaMovimentacao", "dataUltimoEvento"),
    ultimo_andamento:      pega("descricaoUltimoAndamento", "ultimoAndamento", "descricaoUltimaMovimentacao"),
  };
}

function textoAndamento(and) {
  return and.descricao || and.texto || and.conteudo || and.movimento || "";
}

function dataAndamento(and) {
  return and.dataAndamento || and.data || and.dataCadastro || null;
}
