Falaw Cockroach API

Objetivo
- Guardar arquivos (relatorios e curriculos) no CockroachDB via Prisma.
- Servir esses arquivos por URL publica da propria API.
- Guardar metadados dos relatorios de clientes e dados do dashboard iFood fora do Supabase.

Requisitos
- Node.js 20+
- Banco CockroachDB com DATABASE_URL valida

Configuracao
1. Copie .env.example para .env
2. Preencha DATABASE_URL
3. Ajuste CORS_ORIGIN para o dominio do admin (pode usar * em ambiente de teste)

Comandos
- npm install
- npm run prisma:generate
- npm run prisma:push
- npm run start

Healthcheck
- GET /health

Endpoints
- POST /api/files
  Body JSON:
  {
    "kind": "report" | "curriculo",
    "ownerId": "id-logico-do-registro",
    "fileName": "arquivo.pdf",
    "dataUrl": "data:application/pdf;base64,...."
  }
  Resposta:
  {
    "id": "uuid",
    "url": "https://seu-backend/api/files/<id>",
    "sizeBytes": 12345
  }

- GET /api/files/:id
  Retorna o arquivo binario

- DELETE /api/files/:id
  Exclui o arquivo

- GET /api/reports/:clientId
  Lista relatorios do cliente

- POST /api/reports
  Cria/atualiza metadados de relatorio

- DELETE /api/reports/:id
  Exclui metadados de um relatorio

- DELETE /api/reports/by-client/:clientId
  Exclui metadados de todos os relatorios do cliente

- GET /api/ifood/periods
- POST /api/ifood/periods
- POST /api/ifood/periods/:id/activate
- POST /api/ifood/periods/:id/clear-text
- DELETE /api/ifood/periods/:id

- GET /api/ifood/kpis?periodId=<id>[&tabKey=<tab>]
- POST /api/ifood/kpis
- POST /api/ifood/kpis/bulk
- DELETE /api/ifood/kpis/:id
- DELETE /api/ifood/kpis/by-period/:periodId

- GET /api/ifood/content?periodId=<id>[&tabKey=<tab>]
- POST /api/ifood/content
- DELETE /api/ifood/content/by-period/:periodId

- GET /api/ifood/highlights?periodId=<id>
- POST /api/ifood/highlights
- POST /api/ifood/highlights/replace
- DELETE /api/ifood/highlights/:id
- DELETE /api/ifood/highlights/by-period/:periodId

- POST /api/ifood/raw-data
  Salva metadados tecnicos do processamento de planilha

Integracao com admin
- No admin, abra Configuracoes
- Preencha API URL (Cockroach/Prisma), por exemplo http://localhost:8787
- Salve

Obs
- A autenticacao do admin continua no Supabase (Auth email/senha).
- Supabase deve ficar apenas para autenticacao/acessos, newsletter, contato e cadastro de curriculos.
- Documentos de curriculo e arquivos de relatorios/iFood devem ficar no Cockroach.
