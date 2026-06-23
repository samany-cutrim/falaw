// ============================================================
// INTERFACE — Google Workspace Add-on (100% Card Service)
// Sem SpreadsheetApp.getUi() — não é permitido em add-ons
// ============================================================

function onHomepage(e) { return painelPrincipal(); }
function onOpen(e)     { return painelPrincipal(); }
function onInstall(e)  { return painelPrincipal(); }

// ------------------------------------------------------------------
// Painel principal
// ------------------------------------------------------------------

function painelPrincipal() {
  const props  = PropertiesService.getScriptProperties();
  const quando = props.getProperty("ultima_atualizacao") || "Nunca";
  const resumo = props.getProperty("ultimo_resumo")      || "—";

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle("Relatório Jurídico")
      .setSubtitle("Atualização via Projuris")
      .setImageUrl("https://fonts.gstatic.com/s/i/googlematerialicons/description/v6/white-24dp/1x/gm_description_white_24dp.png"))
    .addSection(CardService.newCardSection()
      .setHeader("🔄 Atualizar")
      .addWidget(CardService.newTextButton()
        .setText("Atualizar esta planilha")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor("#1a73e8")
        .setOnClickAction(CardService.newAction()
          .setFunctionName("acaoAtualizarAtual")))
      .addWidget(CardService.newDivider())
      .addWidget(CardService.newTextButton()
        .setText("📂  Escolher relatórios da pasta")
        .setOnClickAction(CardService.newAction()
          .setFunctionName("abrirSelecaoRelatorios"))))
    .addSection(CardService.newCardSection()
      .setHeader("📊 Última atualização")
      .addWidget(CardService.newDecoratedText()
        .setTopLabel("Data / hora")
        .setText(quando))
      .addWidget(CardService.newDecoratedText()
        .setTopLabel("Resultado")
        .setText(resumo)
        .setWrapText(true)))
    .addSection(CardService.newCardSection()
      .setHeader("🔍 Diagnóstico")
      .addWidget(CardService.newTextButton()
        .setText("Testar conexão Projuris")
        .setOnClickAction(CardService.newAction()
          .setFunctionName("acaoDiagnostico"))))
    .addSection(CardService.newCardSection()
      .setHeader("🔑 Credenciais Projuris")
      .addWidget(CardService.newTextButton()
        .setText("Configurar email e senha")
        .setOnClickAction(CardService.newAction()
          .setFunctionName("abrirCredenciais"))))
    .addSection(CardService.newCardSection()
      .setHeader("⚙️ Automático")
      .addWidget(CardService.newTextButton()
        .setText("Configurar atualização semanal")
        .setOnClickAction(CardService.newAction()
          .setFunctionName("abrirConfigurarAuto")))
      .addWidget(CardService.newTextButton()
        .setText("Remover atualização automática")
        .setOnClickAction(CardService.newAction()
          .setFunctionName("acaoRemoverAuto"))))
    .build();
}

// ------------------------------------------------------------------
// Ação: Atualizar planilha atual
// ------------------------------------------------------------------

function acaoAtualizarAtual(e) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const stats = atualizarPlanilha(ss);
    salvarResumo(stats);
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText(
        "✅ Concluído! " + stats.alterados + " alterados · " +
        stats.novos + " novos · " + stats.incompletos + " incompletos"))
      .setStateChanged(true)
      .setNavigation(CardService.newNavigation().updateCard(painelPrincipal()))
      .build();
  } catch (err) {
    return erroCard(err.message);
  }
}

// ------------------------------------------------------------------
// Tela: Selecionar relatórios da pasta (Card com checkboxes)
// ------------------------------------------------------------------

function abrirSelecaoRelatorios(e) {
  var arquivos;
  try {
    arquivos = listarArquivosNaPasta(CFG.PASTA_ID);
  } catch (err) {
    return erroCard(err.message);
  }

  if (!arquivos || arquivos.length === 0) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
        .setText("Nenhum relatório encontrado na pasta."))
      .build();
  }

  const selecao = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.CHECK_BOX)
    .setFieldName("ids_selecionados")
    .setTitle("Marque os relatórios que deseja atualizar:");

  arquivos.forEach(function(f) {
    selecao.addItem(
      f.getName() + "  📁 " + (f.getParents().hasNext() ? f.getParents().next().getName() : ""),
      f.getId(),
      false
    );
  });

  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle("Selecionar relatórios")
      .setSubtitle("Escolha quais deseja atualizar"))
    .addSection(CardService.newCardSection()
      .addWidget(selecao)
      .addWidget(CardService.newTextButton()
        .setText("✅  Atualizar selecionados")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor("#1a73e8")
        .setOnClickAction(CardService.newAction()
          .setFunctionName("acaoAtualizarSelecionados")))
      .addWidget(CardService.newTextButton()
        .setText("← Voltar")
        .setOnClickAction(CardService.newAction()
          .setFunctionName("voltarPainel"))))
    .build();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

function acaoAtualizarSelecionados(e) {
  const ids = e.commonEventObject.formInputs["ids_selecionados"];
  if (!ids || ids.stringInputs.value.length === 0) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
        .setText("Selecione ao menos um relatório."))
      .build();
  }

  const totais = { alterados: 0, novos: 0, incompletos: 0 };
  const erros  = [];

  ids.stringInputs.value.forEach(function(id) {
    try {
      const ss    = SpreadsheetApp.openById(id);
      const stats = atualizarPlanilha(ss);
      totais.alterados   += stats.alterados;
      totais.novos       += stats.novos;
      totais.incompletos += stats.incompletos;
    } catch (err) {
      erros.push(id + ": " + err.message);
      Logger.log(err.message);
    }
  });

  salvarResumo(totais);

  const msg = "✅ " + ids.stringInputs.value.length + " atualizados · " +
              totais.alterados + " alterados · " + totais.novos + " novos · " +
              totais.incompletos + " incompletos" +
              (erros.length > 0 ? " | ⚠️ " + erros.length + " erro(s)" : "");

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(msg))
    .setNavigation(CardService.newNavigation()
      .popCard()
      .updateCard(painelPrincipal()))
    .build();
}

// ------------------------------------------------------------------
// Tela: Configurar atualização automática
// ------------------------------------------------------------------

function abrirConfigurarAuto(e) {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle("Atualização automática"))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.RADIO_BUTTON)
        .setFieldName("dia_semana")
        .setTitle("Dia da semana para atualização automática (às 08h):")
        .addItem("Segunda-feira", "2", true)
        .addItem("Terça-feira",   "3", false)
        .addItem("Quarta-feira",  "4", false)
        .addItem("Quinta-feira",  "5", false)
        .addItem("Sexta-feira",   "6", false))
      .addWidget(CardService.newTextButton()
        .setText("✅  Salvar configuração")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor("#1a73e8")
        .setOnClickAction(CardService.newAction()
          .setFunctionName("acaoSalvarAuto")))
      .addWidget(CardService.newTextButton()
        .setText("← Voltar")
        .setOnClickAction(CardService.newAction()
          .setFunctionName("voltarPainel"))))
    .build();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

function acaoSalvarAuto(e) {
  const dia = parseInt(
    e.commonEventObject.formInputs["dia_semana"].stringInputs.value[0], 10);

  removerGatilhos_();
  ScriptApp.newTrigger("atualizarPorAgendamento")
    .timeBased()
    .onWeekDay(dia)
    .atHour(8)
    .create();

  const dias = ["","Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification()
      .setText("✅ Atualização automática toda " + dias[dia] + " às 08h configurada!"))
    .setNavigation(CardService.newNavigation().popCard())
    .build();
}

// ------------------------------------------------------------------
// Ação: Remover automático
// ------------------------------------------------------------------

function acaoRemoverAuto(e) {
  removerGatilhos_();
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification()
      .setText("Atualização automática removida."))
    .build();
}

// ------------------------------------------------------------------
// Gatilho agendado
// ------------------------------------------------------------------

function atualizarPorAgendamento() {
  try {
    const arquivos = listarArquivosNaPasta(CFG.PASTA_ID);
    const totais   = { alterados: 0, novos: 0, incompletos: 0 };
    arquivos.forEach(function(f) {
      try {
        const stats = atualizarPlanilha(SpreadsheetApp.open(f));
        totais.alterados   += stats.alterados;
        totais.novos       += stats.novos;
        totais.incompletos += stats.incompletos;
      } catch (err) {
        Logger.log("Erro em " + f.getName() + ": " + err.message);
      }
    });
    salvarResumo(totais);
  } catch (err) {
    Logger.log("Erro no agendamento: " + err.message);
    MailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      "❌ Erro na atualização automática — Relatório Jurídico",
      err.message + "\n\n" + err.stack
    );
  }
}

// ------------------------------------------------------------------
// Utilitários
// ------------------------------------------------------------------

function acaoDiagnostico(e) {
  var linhas = [];
  var token;
  try {
    token = obterToken();
    linhas.push("✅ Token Keycloak OK");
  } catch (err) {
    linhas.push("❌ Token: " + err.message);
    return _cartaoDiagnostico(linhas);
  }

  // Endpoint correto confirmado via DevTools
  var url = CFG.API_BASE + "/v2/processo/consulta"
    + "?quan-registros=3&pagina=0"
    + "&ordenacao-chave=ORDENACAO_IDENTIFICADOR&ordenacao-tipo=DESC";

  try {
    var resp = UrlFetchApp.fetch(url, {
      method: "post",
      headers: {
        "Authorization": "Bearer " + token,
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      payload: JSON.stringify({filtroGeral:"",flHabilitado:true,flEstouEnvolvido:false,flSouResponsavel:false,campoDinamicoConsultaFiltro:[],codigoGruposResponsaveis:[],codigoUsuariosResponsaveis:[],codigosCarteira:[],codigosGrupoEmpresarial:[],marcadores:[],numerosProcesso:[],resultados:[],sistemas:[]}),
      muteHttpExceptions: true,
    });

    var code = resp.getResponseCode();
    var body = resp.getContentText();
    linhas.push("📡 POST /v2/processo/consulta → HTTP " + code);

    if (code >= 500) {
      linhas.push("❌ Erro servidor: " + body.substring(0, 300));
    } else if (code === 200) {
      var data = JSON.parse(body);
      var lista = [];
      if (data.processoConsultaResumoWs) {
        var inner = data.processoConsultaResumoWs;
        lista = Array.isArray(inner) ? inner : (inner.processoConsultaResumoWs || []);
      } else {
        lista = Array.isArray(data) ? data : (data.data || data.content || data.processos || []);
      }
      linhas.push("✅ " + lista.length + " processo(s) retornados");
      if (lista.length > 0) {
        linhas.push("Chaves do 1º processo:");
        linhas.push(Object.keys(lista[0]).join(", ").substring(0, 300));
        linhas.push("Valores:");
        linhas.push(JSON.stringify(lista[0]).substring(0, 300));
      } else {
        linhas.push("Estrutura da resposta:");
        linhas.push(Object.keys(data).join(", "));
        linhas.push(body.substring(0, 300));
      }
    } else {
      linhas.push("❌ HTTP " + code + ": " + body.substring(0, 300));
    }
  } catch (err) {
    linhas.push("💥 " + err.message);
  }

  // Campos de andamento do processo (já na resposta de /processo/consulta?)
  try {
    var urlProc3 = CFG.API_BASE + "/v2/processo/consulta"
      + "?quan-registros=1&pagina=0&ordenacao-chave=ORDENACAO_IDENTIFICADOR&ordenacao-tipo=DESC";
    var respProc3 = UrlFetchApp.fetch(urlProc3, {
      method: "post",
      headers: {
        "Authorization": "Bearer " + token,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      payload: JSON.stringify({filtroGeral:"",flHabilitado:true,flEstouEnvolvido:false,flSouResponsavel:false,campoDinamicoConsultaFiltro:[],codigoGruposResponsaveis:[],codigoUsuariosResponsaveis:[],codigosCarteira:[],codigosGrupoEmpresarial:[],marcadores:[],numerosProcesso:[],resultados:[],sistemas:[]}),
      muteHttpExceptions: true,
    });
    if (respProc3.getResponseCode() === 200) {
      var dp3 = JSON.parse(respProc3.getContentText());
      var lp3 = [];
      if (dp3.processoConsultaResumoWs) {
        var ip3 = dp3.processoConsultaResumoWs;
        lp3 = Array.isArray(ip3) ? ip3 : (ip3.processoConsultaResumoWs || []);
      }
      if (lp3.length > 0) {
        var proc1 = lp3[0];
        // Mostra campos relacionados a andamento no processo
        var camposAnd = Object.keys(proc1).filter(function(k){
          return k.toLowerCase().indexOf("andamento") !== -1
              || k.toLowerCase().indexOf("ultimo") !== -1
              || k.toLowerCase().indexOf("última") !== -1
              || k.toLowerCase().indexOf("movim") !== -1;
        });
        linhas.push("🔍 Campos andamento no processo:");
        if (camposAnd.length > 0) {
          camposAnd.forEach(function(k){ linhas.push("  " + k + " = " + JSON.stringify(proc1[k])); });
        } else {
          linhas.push("  (nenhum campo com 'andamento'/'ultimo' encontrado)");
          linhas.push("  Todas as chaves: " + Object.keys(proc1).join(", ").substring(0, 400));
        }
      }
    }
  } catch(ep3) {
    linhas.push("❌ Processo campos: " + ep3.message);
  }

  // Testa endpoint real da lista de andamentos com conteúdo
  try {
    var agora2  = new Date();
    var inicio2 = new Date(agora2.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Testa as duas variações do endpoint
    var endpointsAnd = [
      CFG.API_BASE + "/v2/processo-andamento/indicador"
        + "?quan-registros=3&pagina=0&ordenacao-tipo=DESC&ordenacao-chave=ORDENACAO_DATA_ANDAMENTO",
      CFG.API_BASE + "/v2/processo-andamento/consulta"
        + "?quan-registros=3&pagina=0&ordenacao-tipo=DESC&ordenacao-chave=ORDENACAO_DATA_ANDAMENTO",
    ];

    var bodyAnd = JSON.stringify({
      visaoEscritorio:       true,
      filtroRapidoAndamento: "TODOS",
      processo:              null,
      dataBase:              agora2.toISOString(),
      dataInicioPeriodo:     inicio2.toISOString(),
      dataTerminoPeriodo:    agora2.toISOString(),
    });

    endpointsAnd.forEach(function(urlAnd) {
      var path = urlAnd.replace(CFG.API_BASE, "");
      try {
        var r = UrlFetchApp.fetch(urlAnd, {
          method: "post",
          headers: {
            "Authorization": "Bearer " + token,
            "Accept":        "application/json, text/plain, */*",
            "Content-Type":  "application/json",
            "Origin":        "https://app.projurisadv.com.br",
            "Referer":       "https://app.projurisadv.com.br/",
          },
          payload: bodyAnd,
          muteHttpExceptions: true,
        });
        var code = r.getResponseCode();
        var body = r.getContentText();
        linhas.push("📋 " + path.split("?")[0] + " → HTTP " + code);
        if (code === 200) {
          var d = JSON.parse(body);
          linhas.push("Chaves raiz: " + Object.keys(d).join(", ").substring(0, 300));
          // Tenta extrair lista
          var lista = d.processoAndamentoIndicadorWs || d.processoAndamentoConsultaCodigosWs || d.data || d.content || d.itens || d.andamentos || [];
          if (!Array.isArray(lista) && typeof lista === "object") {
            lista = lista.processoAndamentoIndicadorWs || lista.processoAndamentoConsultaCodigosWs || [];
          }
          linhas.push("Qtd itens: " + lista.length);
          if (lista.length > 0) {
            var a0 = lista[0];
            linhas.push("✅ Chaves item: " + Object.keys(a0).join(", ").substring(0, 200));
            linhas.push("descricao: " + String(a0.descricao || a0.texto || "(vazio)").substring(0, 100));
            linhas.push("codigoProcesso: " + (a0.codigoProcesso || "(ausente)"));
          } else {
            linhas.push("Resposta: " + body.substring(0, 200));
          }
        } else {
          linhas.push(body.substring(0, 150));
        }
      } catch(ex) {
        linhas.push("❌ " + path.split("?")[0] + ": " + ex.message);
      }
    });
  } catch(eAnd) {
    linhas.push("❌ Andamentos: " + eAnd.message);
  }

  return _cartaoDiagnostico(linhas);
}

function _cartaoDiagnostico(linhas) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Diagnóstico Projuris"))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText(linhas.join("\n")))
      .addWidget(CardService.newTextButton()
        .setText("← Voltar")
        .setOnClickAction(CardService.newAction().setFunctionName("voltarPainel"))))
    .build();
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

function voltarPainel(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popCard())
    .build();
}

function salvarResumo(stats) {
  const props = PropertiesService.getScriptProperties();
  const tz    = Session.getScriptTimeZone();
  props.setProperty("ultima_atualizacao",
    Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm"));
  props.setProperty("ultimo_resumo",
    "🟡 Alterados: " + stats.alterados + "  🆕 Novos: " + stats.novos +
    "  🔴 Incompletos: " + stats.incompletos);
}

function removerGatilhos_() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === "atualizarPorAgendamento"; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
}

function erroCard(msg) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification()
      .setText("❌ Erro: " + msg))
    .build();
}

// ------------------------------------------------------------------
// Tela: Credenciais Projuris
// ------------------------------------------------------------------

function abrirCredenciais(e) {
  var props = PropertiesService.getScriptProperties();
  var emailAtual = props.getProperty("projuris_email") || "";

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle("Credenciais Projuris")
      .setSubtitle("Email e senha do seu login no Projuris"))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextInput()
        .setFieldName("proj_email")
        .setTitle("Email")
        .setValue(emailAtual)
        .setHint("ex: samany@falaw.com.br"))
      .addWidget(CardService.newTextInput()
        .setFieldName("proj_senha")
        .setTitle("Senha")
        .setValue("")
        .setHint("Sua senha do Projuris"))
      .addWidget(CardService.newTextButton()
        .setText("✅ Salvar credenciais")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor("#1a73e8")
        .setOnClickAction(CardService.newAction()
          .setFunctionName("acaoSalvarCredenciais")))
      .addWidget(CardService.newTextButton()
        .setText("← Voltar")
        .setOnClickAction(CardService.newAction()
          .setFunctionName("voltarPainel"))))
    .build();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

function acaoSalvarCredenciais(e) {
  var inputs = e.commonEventObject.formInputs;
  var email  = inputs["proj_email"].stringInputs.value[0].trim();
  var senha  = inputs["proj_senha"].stringInputs.value[0];

  if (!email || !senha) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
        .setText("Preencha email e senha."))
      .build();
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty("projuris_email", email);
  props.setProperty("projuris_senha", senha);
  CacheService.getScriptCache().remove("projuris_token");

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification()
      .setText("✅ Credenciais salvas! Teste a conexão agora."))
    .setNavigation(CardService.newNavigation().popCard())
    .build();
}
