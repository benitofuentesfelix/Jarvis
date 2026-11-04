-- JARVIS · trabajo 24/7. La base de datos llama cada 5 minutos a /api/cron/tick.
-- El token lo genera Postgres y no sale nunca de aquí: el servidor lo comprueba
-- llamando a jarvis_cron_token_ok() con la clave secreta de Supabase.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.cron_token (
  id int primary key default 1 check (id = 1),
  token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);
insert into private.cron_token default values on conflict do nothing;

create or replace function public.jarvis_cron_token_ok(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.cron_token where token = t);
$$;
revoke execute on function public.jarvis_cron_token_ok(text) from public, anon, authenticated;
grant execute on function public.jarvis_cron_token_ok(text) to service_role;

select cron.schedule(
  'jarvis-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://jarvis-sandy-eight-87.vercel.app/api/cron/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select token from private.cron_token where id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
