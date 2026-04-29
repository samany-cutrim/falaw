Falaw - Setup de Autenticacao (Supabase) + Arquivos (Cockroach)

1) Supabase para login admin
- No projeto Supabase, abra Authentication > Users.
- Crie o usuario admin (email/senha).
- No admin do site, aba Configuracoes:
  - Preencha Supabase URL
  - Preencha Supabase Anon Key
  - Preencha E-mail Admin (Supabase Auth)
  - Salve
- Na tela de login do admin, use email + senha.

2) Cockroach para arquivos (relatorios e curriculos)
- Pasta da API: cockroach-api
- Copie cockroach-api/.env.example para cockroach-api/.env
- Defina DATABASE_URL com sua URL do Cockroach
- Defina CORS_ORIGIN com o dominio do admin

Comandos da API
- cd cockroach-api
- npm install
- npm run prisma:generate
- npm run prisma:push
- npm run start

3) Conectar o admin com a API Cockroach
- No admin, em Configuracoes, preencha API URL (Cockroach/Prisma)
  Exemplo local: http://localhost:8787
- Salve

4) Validacao rapida
- Envie um relatorio de teste no painel de clientes
- Cadastre um curriculo com arquivo
- Verifique que as URLs salvas agora apontam para /api/files/<id>

Observacoes
- Se a API Cockroach estiver indisponivel, o admin ainda usa os fallbacks antigos (Supabase Storage/GitHub) para nao interromper operacao.
- Se quiser forcar 100% Cockroach sem fallback, posso ajustar no proximo passo.
