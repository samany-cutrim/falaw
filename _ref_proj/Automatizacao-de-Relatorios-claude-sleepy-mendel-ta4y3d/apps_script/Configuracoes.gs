// ============================================================
// CONFIGURAÇÕES — ajuste apenas estas constantes
// ============================================================

const CFG = {
  // Projuris / Keycloak
  CLIENT_ID:     "api_cliente_codigo_122785",
  CLIENT_SECRET: "kQFgDRJwUTRoQ8woZTckkMOrOvu2BaQE",
  TOKEN_URL:     "https://login.projurisadv.com.br/realms/projurisadv-realm/protocol/openid-connect/token",
  API_BASE: "https://service.projurisadv.com.br/adv-service",

  // Google Drive — ID da pasta "05. RELATÓRIOS"
  PASTA_ID: "18vYaBqiqxgV4dl_Ky_SCw83gwvNSc0WU",

  // Cores por célula (não mais por linha inteira)
  COR_VERDE:    "#C6EFCE",  // célula com valor atualizado
  COR_VERMELHO: "#FFC7CE",  // célula obrigatória vazia
  COR_LIMPA:    null,

  // Nomes possíveis da aba de processos ativos (tenta na ordem)
  NOMES_ABA_ATIVOS: [
    "ATIVOS", "TRABALHISTA", "Judiciais",
    "Relatório - Processos Ativos", "PROCESSOS ATIVOS",
  ],

  // Nomes possíveis da aba de processos encerrados
  NOMES_ABA_ENCERRADOS: [
    "ENCERRADOS", "ARQUIVADOS", "Arquivados",
    "Processos arquivados", "ARQUIVADOS ",
  ],
};

// Aliases de nomes de cabeçalho por campo (tentados na ordem, case-insensitive)
const HEADER_ALIASES = {
  numero_processo: [
    "NÚMERO DO PROCESSO", "PROCESSO Nº", "Número do processo",
    "NUMERO DO PROCESSO", "PROCESSO N°",
  ],
  parte_contraria: [
    "PARTE CONTRÁRIA", "PARTES ENVOLVIDAS", "Reclamante",
    "Parte(s) Contrária(s)", "POLO ATIVO", "PARTE CONTRARIA",
  ],
  parte_principal: [
    "PARTE PRINCIPAL", "Polo passivo", "EMPRESA DO GRUPO",
    "Empresa do Grupo", "RECLAMADA",
  ],
  tipo_acao: [
    "TIPO DE AÇÃO", "Tipo de ação", "Identificação interna do caso",
    "TIPO DE ACAO",
  ],
  fase: [
    "FASE", "Fase Atual do Processo", "FASE ATUAL",
  ],
  status_atual: [
    "STATUS ATUAL", "Status atual", "STATUS ", "STATUS",
  ],
  risco: [
    "RISCO", "RISCO DE PERDA",
    "Risco de perda do valor em risco (provável, possível, remoto)",
    "RISCO DE PERDA DO VALOR EM RISCO (PROVÁVEL, POSSÍVEL, REMOTO)",
  ],
  orgao: [
    "ÓRGÃO", "JUÍZO", "Vara", "VARA", "Vara/Foro", "ORGAO",
  ],
  instancia: [
    "INSTÂNCIA", "Instância", "INSTANCIA",
  ],
  valor_causa: [
    "VALOR DA CAUSA", "Valor da Causa", "VALOR ", "VALOR",
  ],
  data_ultimo_andamento: [
    "DATA DO ÚLTIMO ANDAMENTO", "DATA DO ANDAMENTO",
    "DATA DO ULTIMO ANDAMENTO",
  ],
  ultimo_andamento: [
    "ANDAMENTO", "STATUS MENSAL", "Principais andamentos",
    "Ultimo andamento", "MOVIMENTO PROCESSUAL",
    "ÚLTIMOS ANDAMENTOS", "ULTIMO ANDAMENTO",
  ],
  // campos usados apenas em novas linhas
  data_distribuicao: [
    "DATA DA DISTRIBUIÇÃO", "Data da distribuição", "DATA DE INSTAURAÇÃO",
    "DATA DA DISTRIBUICAO",
  ],
  trt: ["TRT", "UF", "Juízo"],
  adv_contrario: ["ADV. CONTRÁRIO", "ADV. CONTRARIO"],
  cidade_uf: ["CIDADE/UF", "Comarca", "COMARCA", "CIDADE"],
};

// Campos obrigatórios (por alias — basta um match)
const CAMPOS_OBRIGATORIOS = [
  "numero_processo", "parte_contraria", "status_atual",
  "risco", "ultimo_andamento",
];
