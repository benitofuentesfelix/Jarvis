-- JARVIS · trabajo 24/7. La base de datos llama cada 5 minutos a /api/cron/tick.
-- La URL y el secreto viven en Supabase Vault (nombres jarvis_tick_url y jarvis_cron_secret),
-- se crean aparte y nunca están en el código.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'jarvis-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'jarvis_tick_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jarvis_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
