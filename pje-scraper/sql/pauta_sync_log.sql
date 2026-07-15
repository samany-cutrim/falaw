-- Tabela de log de sincronização da pauta de audiências (Projuris → Supabase).
-- Rode este script UMA VEZ no Supabase: Dashboard → SQL Editor → New query.
--
-- O cron pauta_audiencia.py grava uma linha ao final de cada execução
-- (sucesso ou falha) e o admin exibe "Pauta atualizada em ...".

create table if not exists public.pauta_sync_log (
  id             bigint generated always as identity primary key,
  executado_em   timestamptz not null default now(),
  periodo_inicio date,
  periodo_fim    date,
  recebidas      integer not null default 0,  -- tarefas recebidas do Projuris
  salvas         integer not null default 0,  -- audiências gravadas (upsert)
  canceladas     integer not null default 0,  -- fantasmas marcados na reconciliação
  sucesso        boolean not null default true,
  erro           text
);

create index if not exists pauta_sync_log_executado_em_idx
  on public.pauta_sync_log (executado_em desc);

alter table public.pauta_sync_log enable row level security;

-- Leitura liberada (o admin mostra a última sincronização);
-- escrita apenas pela service_role key (usada pelo cron), que ignora RLS.
drop policy if exists pauta_sync_log_read on public.pauta_sync_log;
create policy pauta_sync_log_read
  on public.pauta_sync_log for select
  using (true);
