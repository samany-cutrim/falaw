-- API key pessoal do CallMeBot por advogado (notificações de audiência via WhatsApp).
-- Rode este script UMA VEZ no Supabase: Dashboard → SQL Editor → New query.
--
-- Como cada advogado obtém a própria key (uma vez só):
--   1. Adicionar o número do CallMeBot aos contatos:
--      +34 644 51 95 23 (conferir em https://www.callmebot.com/blog/free-api-whatsapp-messages/)
--   2. Enviar pelo WhatsApp: "I allow callmebot to send me messages"
--   3. O bot responde com a API key (ex: "Your APIKEY is 123456")
--   4. Cadastrar no admin (Equipe → editar membro → "API key CallMeBot")

alter table public.equipe
  add column if not exists callmebot_apikey text;
