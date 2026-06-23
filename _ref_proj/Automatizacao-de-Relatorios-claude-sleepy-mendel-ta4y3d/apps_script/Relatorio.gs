// ============================================================
// RELATÓRIO — lógica de atualização das abas da planilha
// ============================================================

function atualizarPlanilhaAtiva() {
  return atualizarPlanilha(SpreadsheetApp.getActiveSpreadsheet());
}

function atualizarPlanilha(ss) {
  const stats = { alterados: 0, novos: 0, incompletos: 0 };
  atualizarAbaPrincipal(ss, stats);
  atualizarAbaEncerrados(ss, stats);
  forcarRecalculo(ss);
  return stats;
}

// Remove sufixos como " (CNJ)", " (Outro)" do número do processo
function normalizarNumero(num) {
  return String(num || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// ------------------------------------------------------------------
// Encontra a primeira aba existente dentre uma lista de nomes possíveis
// ------------------------------------------------------------------
function encontrarAba(ss, nomes) {
  for (var i = 0; i < nomes.length; i++) {
    var aba = ss.getSheetByName(nomes[i]);
    if (aba) return aba;
  }
  return null;
}

// ------------------------------------------------------------------
// Auto-detecta a linha de cabeçalho (1-5) procurando "processo" ou "número"
// Retorna { cabecalho: N, dados: N+1 }
// ------------------------------------------------------------------
function detectarLinhas(aba) {
  var maxScan = Math.min(5, aba.getLastRow());
  var lastCol = Math.min(20, aba.getLastColumn());
  if (lastCol < 1) return { cabecalho: 2, dados: 3 };

  for (var r = 1; r <= maxScan; r++) {
    var row = aba.getRange(r, 1, 1, lastCol).getValues()[0];
    // Ignora títulos (merged cells = só 1 célula preenchida) e linhas vazias
    var nonEmpty = row.filter(function(v) { return v !== null && v !== ""; }).length;
    if (nonEmpty < 3) continue;
    var joined = row.join(" ").toLowerCase();
    if (joined.indexOf("processo") !== -1 || joined.indexOf("número") !== -1
        || joined.indexOf("numero") !== -1) {
      return { cabecalho: r, dados: r + 1 };
    }
  }
  return { cabecalho: 2, dados: 3 };
}

// ------------------------------------------------------------------
// Mapeia cabeçalhos → número de coluna (1-based), com auto-detect de linha
// ------------------------------------------------------------------
function mapearCabecalhos(aba) {
  var linhaCab = detectarLinhas(aba).cabecalho;
  var lastCol = aba.getLastColumn();
  if (lastCol < 1) return { _linhaHeader: linhaCab, _linhaDados: linhaCab + 1 };

  var vals = aba.getRange(linhaCab, 1, 1, lastCol).getValues()[0];
  var mapa = { _linhaHeader: linhaCab, _linhaDados: linhaCab + 1 };
  vals.forEach(function(v, i) {
    var nome = String(v || "").trim().toUpperCase();
    if (nome) mapa[nome] = i + 1;
  });
  return mapa;
}

// ------------------------------------------------------------------
// Resolve coluna de um campo usando HEADER_ALIASES (retorna null se não encontrado)
// ------------------------------------------------------------------
function resolverColuna(cabecalhos, campo) {
  var aliases = HEADER_ALIASES[campo] || [];
  for (var i = 0; i < aliases.length; i++) {
    var col = cabecalhos[aliases[i].trim().toUpperCase()];
    if (col) return col;
  }
  return null;
}

// ------------------------------------------------------------------
// Aba ATIVOS (ou equivalente)
// ------------------------------------------------------------------

function atualizarAbaPrincipal(ss, stats) {
  var aba = encontrarAba(ss, CFG.NOMES_ABA_ATIVOS);
  if (!aba) { Logger.log("Aba de ativos não encontrada"); return; }

  var cabecalhos   = mapearCabecalhos(aba);
  var LINHA_DADOS  = cabecalhos._linhaDados;
  var ultimaLinha  = aba.getLastRow();
  var totalColunas = aba.getLastColumn();

  if (ultimaLinha < LINHA_DADOS) return;

  // Resolve colunas pelos aliases
  var COL_NUMERO  = resolverColuna(cabecalhos, "numero_processo");
  var COL_CLIENTE = resolverColuna(cabecalhos, "parte_principal");
  if (!COL_NUMERO) { Logger.log("Coluna de número do processo não encontrada"); return; }

  // Campos que serão atualizados quando o processo já existe
  var CAMPOS_ATUALIZAR = [
    "fase", "status_atual", "risco", "orgao", "instancia",
    "valor_causa", "data_ultimo_andamento", "ultimo_andamento",
  ];

  var colsDinamicas = {};
  CAMPOS_ATUALIZAR.forEach(function(campo) {
    var col = resolverColuna(cabecalhos, campo);
    if (col) colsDinamicas[campo] = col;
  });

  // Colunas obrigatórias para validação
  var colsObrig = CAMPOS_OBRIGATORIOS.map(function(c) {
    return resolverColuna(cabecalhos, c);
  }).filter(Boolean);

  // Leitura em batch
  var totalLinhas  = ultimaLinha - LINHA_DADOS + 1;
  var todosValores = aba.getRange(LINHA_DADOS, 1, totalLinhas, totalColunas).getValues();

  // Mapa número normalizado → índice 0-based no array
  var mapaIdx = {};
  todosValores.forEach(function(row, i) {
    var v = String(row[COL_NUMERO - 1] || "").trim();
    if (!v) return;
    var norm = normalizarNumero(v);
    mapaIdx[norm] = i;
    if (v !== norm) mapaIdx[v] = i;
  });

  // Clientes da planilha (para filtrar novos processos)
  var clientesSet = {};
  if (COL_CLIENTE) {
    todosValores.forEach(function(row) {
      var v = String(row[COL_CLIENTE - 1] || "").trim().toUpperCase();
      if (v) clientesSet[v] = true;
    });
  }
  var clientesDaPlanilha = Object.keys(clientesSet);

  // Busca processos e andamentos na API
  var numerosNaPlanilha = Object.keys(mapaIdx);
  var processos = buscarProcessosPorNumeros(numerosNaPlanilha, clientesDaPlanilha);
  var codigosProcesso = processos.map(function(p) { return p.codigoProcesso; }).filter(Boolean);
  var andamentosMap = buscarAndamentosRecentes(90, codigosProcesso);

  Logger.log("Projuris: " + processos.length + " processos | " + Object.keys(andamentosMap).length + " andamentos");

  // Coleta de atualizações: { "idx,col": novoVal }
  var pendingCells  = {};
  var verdesCelulas = []; // { linha, col }
  var novasLinhas   = [];

  processos.forEach(function(raw) {
    var campos = normalizarProcesso(raw);
    var numRaw = campos.numero_processo;
    if (!numRaw) return;
    var num = normalizarNumero(numRaw);
    campos.numero_processo = num;

    // Enriquece com andamento
    var and = andamentosMap[raw.codigoProcesso];
    if (and) {
      if (and.texto) campos.ultimo_andamento      = and.texto;
      if (and.data)  campos.data_ultimo_andamento = and.data;
    }

    var idx = (mapaIdx[num] !== undefined) ? mapaIdx[num] : mapaIdx[numRaw];

    if (idx !== undefined) {
      // Processo existente — detecta células que mudaram
      var alterouAlgo = false;
      Object.keys(colsDinamicas).forEach(function(campo) {
        var novoVal = campos[campo];
        if (novoVal == null || String(novoVal).trim() === "") return;
        var col     = colsDinamicas[campo];
        var valorAt = String(todosValores[idx][col - 1] || "").trim();
        var novoStr = String(novoVal).trim();

        if (campo === "data_ultimo_andamento") {
          // Data sempre sobrescreve
          if (valorAt !== novoStr) {
            pendingCells[idx + "," + col] = novoVal;
            verdesCelulas.push({ linha: LINHA_DADOS + idx, col: col });
            alterouAlgo = true;
          }
        } else if (campo === "ultimo_andamento") {
          // Andamento: complementa sem apagar — adiciona novo texto se diferente do que já está
          if (valorAt === "" || valorAt.toUpperCase() === "N/A") {
            pendingCells[idx + "," + col] = novoStr;
            verdesCelulas.push({ linha: LINHA_DADOS + idx, col: col });
            alterouAlgo = true;
          } else if (valorAt !== novoStr && valorAt.indexOf(novoStr) === -1) {
            pendingCells[idx + "," + col] = novoStr + "\n---\n" + valorAt;
            verdesCelulas.push({ linha: LINHA_DADOS + idx, col: col });
            alterouAlgo = true;
          }
        } else {
          // Outros campos: só preenche se vazio ou N/A
          if (valorAt === "" || valorAt.toUpperCase() === "N/A") {
            pendingCells[idx + "," + col] = novoVal;
            verdesCelulas.push({ linha: LINHA_DADOS + idx, col: col });
            alterouAlgo = true;
          }
        }
      });
      if (alterouAlgo) stats.alterados++;
    } else {
      // Processo novo
      if (clientesDaPlanilha.length > 0 && !clientePertenceAPlanilha(campos.parte_principal, clientesDaPlanilha)) return;
      novasLinhas.push(campos);
      mapaIdx[num] = totalLinhas + novasLinhas.length - 1;
      stats.novos++;
    }
  });

  // Escreve células alteradas individualmente
  Object.keys(pendingCells).forEach(function(key) {
    var parts = key.split(",");
    var idx   = Number(parts[0]);
    var col   = Number(parts[1]);
    aba.getRange(LINHA_DADOS + idx, col).setValue(pendingCells[key]);
  });

  // Pinta células alteradas em verde
  verdesCelulas.forEach(function(c) {
    aba.getRange(c.linha, c.col).setBackground(CFG.COR_VERDE);
  });

  // Linhas novas
  if (novasLinhas.length > 0) {
    var proxLinha = ultimaLinha + 1;
    var blocoNovo = novasLinhas.map(function(campos) {
      var row = new Array(totalColunas).fill(null);
      Object.keys(HEADER_ALIASES).forEach(function(campo) {
        var col = resolverColuna(cabecalhos, campo);
        if (col && campos[campo] != null) row[col - 1] = campos[campo];
      });
      return row;
    });
    var rangeNovo = aba.getRange(proxLinha, 1, blocoNovo.length, totalColunas);
    rangeNovo.setValues(blocoNovo);
    rangeNovo.setBackground(CFG.COR_VERDE);
  }

  // Pinta células obrigatórias vazias em vermelho (lê valores atualizados)
  var totalLinhasAtual = aba.getLastRow() - LINHA_DADOS + 1;
  if (totalLinhasAtual > 0 && colsObrig.length > 0) {
    var valoresAtuais = aba.getRange(LINHA_DADOS, 1, totalLinhasAtual, totalColunas).getValues();
    valoresAtuais.forEach(function(row, i) {
      colsObrig.forEach(function(col) {
        var val = String(row[col - 1] || "").trim();
        if (!val || val.toUpperCase() === "N/A") {
          aba.getRange(LINHA_DADOS + i, col).setBackground(CFG.COR_VERMELHO);
          stats.incompletos++;
        }
      });
    });
  }
}

function clientePertenceAPlanilha(nomeCliente, clientesDaPlanilha) {
  if (!nomeCliente) return false;
  var nome = nomeCliente.toUpperCase();
  return clientesDaPlanilha.some(function(c) {
    return nome.indexOf(c) !== -1 || c.indexOf(nome) !== -1;
  });
}

// ------------------------------------------------------------------
// Aba ENCERRADOS (ou equivalente)
// ------------------------------------------------------------------

function atualizarAbaEncerrados(ss, stats) {
  var aba = encontrarAba(ss, CFG.NOMES_ABA_ENCERRADOS);
  if (!aba) return;

  var cabecalhos   = mapearCabecalhos(aba);
  var LINHA_DADOS  = cabecalhos._linhaDados;
  var totalCols    = aba.getLastColumn();
  var ultimaLinha  = aba.getLastRow();

  var COL_NUMERO = resolverColuna(cabecalhos, "numero_processo");
  if (!COL_NUMERO) return;

  // Processos já na aba
  var existentes = {};
  if (ultimaLinha >= LINHA_DADOS) {
    var valsEnc = aba.getRange(LINHA_DADOS, COL_NUMERO,
      ultimaLinha - LINHA_DADOS + 1, 1).getValues();
    valsEnc.forEach(function(r) {
      if (r[0]) existentes[normalizarNumero(String(r[0]))] = true;
    });
  }

  // Clientes da aba de ativos
  var abaAtivos = encontrarAba(ss, CFG.NOMES_ABA_ATIVOS);
  var clientesDaPlanilha = [];
  if (abaAtivos) {
    var cabAt   = mapearCabecalhos(abaAtivos);
    var colCliAt = resolverColuna(cabAt, "parte_principal");
    var linDadAt = cabAt._linhaDados;
    var lastRowAt = abaAtivos.getLastRow();
    if (colCliAt && lastRowAt >= linDadAt) {
      var valsAt = abaAtivos.getRange(linDadAt, colCliAt,
        lastRowAt - linDadAt + 1, 1).getValues();
      var set = {};
      valsAt.forEach(function(r) {
        var c = String(r[0] || "").trim().toUpperCase();
        if (c) set[c] = true;
      });
      clientesDaPlanilha = Object.keys(set);
    }
  }

  var processos = buscarProcessosPorNumeros([], clientesDaPlanilha);
  var novasLinhas = [];

  processos.forEach(function(raw) {
    var campos = normalizarProcesso(raw);
    var num    = normalizarNumero(campos.numero_processo || "");
    if (!num) return;

    var status = String(campos.status_atual || "").toUpperCase();
    if (!status.includes("ENCERR") && !status.includes("ARQUIV")) return;
    if (existentes[num]) return;

    if (clientesDaPlanilha.length > 0 && !clientePertenceAPlanilha(campos.parte_principal, clientesDaPlanilha)) return;

    var row = new Array(totalCols).fill(null);
    Object.keys(HEADER_ALIASES).forEach(function(campo) {
      var col = resolverColuna(cabecalhos, campo);
      if (col && campos[campo] != null) row[col - 1] = campos[campo];
    });
    novasLinhas.push(row);
    existentes[num] = true;
    stats.novos++;
  });

  if (novasLinhas.length > 0) {
    var proxLinha = Math.max(ultimaLinha + 1, LINHA_DADOS);
    var range = aba.getRange(proxLinha, 1, novasLinhas.length, totalCols);
    range.setValues(novasLinhas);
    range.setBackground(CFG.COR_VERDE);
  }
}

// ------------------------------------------------------------------
// Busca recursiva em sub-pastas
// ------------------------------------------------------------------

function listarArquivosNaPasta(pastaId) {
  var arquivos = [];
  _varrerPasta(DriveApp.getFolderById(pastaId), arquivos);
  return arquivos;
}

function _varrerPasta(pasta, lista) {
  var xlsx = pasta.getFilesByType(MimeType.MICROSOFT_EXCEL);
  while (xlsx.hasNext()) lista.push(xlsx.next());
  var sheets = pasta.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (sheets.hasNext()) lista.push(sheets.next());
  var subs = pasta.getFolders();
  while (subs.hasNext()) _varrerPasta(subs.next(), lista);
}

function forcarRecalculo(ss) {
  var aba = ss.getSheetByName("DASHBOARD");
  if (!aba) return;
  var cel = aba.getRange(2, 2);
  var txt = cel.getValue();
  if (txt) {
    var mes = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM/yyyy").toUpperCase();
    var novo = txt.toString().replace(/\w+\/\d{4}/, mes);
    if (novo !== txt) cel.setValue(novo);
  }
}
