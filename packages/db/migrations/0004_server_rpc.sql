-- JARVIS · funciones del servidor sin clave secreta.
-- El trabajo 24/7 entra con el token que solo conoce pg_cron (private.cron_token).
-- El enlace privado de EVAGD se guarda cifrado en Supabase Vault, nunca en tablas ni en código.

create or replace function private.check_cron(t text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if t is null or not exists (select 1 from private.cron_token where token = t) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
end $$;

-- ── Estado ──────────────────────────────────────────────
create or replace function public.jarvis_cron_states(t text)
returns table (user_id uuid, data jsonb, updated_at timestamptz, evagd_url text)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_cron(t);
  return query
    select s.user_id, s.data, s.updated_at,
           (select d.decrypted_secret from vault.decrypted_secrets d where d.name = 'evagd_url:' || s.user_id::text limit 1)
    from public.app_state s;
end $$;

create or replace function public.jarvis_cron_save_state(t text, uid uuid, d jsonb, expected timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_cron(t);
  update public.app_state set data = d, device = 'servidor' where user_id = uid and updated_at = expected;
  return found;
end $$;

-- ── Avisos ──────────────────────────────────────────────
create or replace function public.jarvis_cron_sent_keys(t text, uid uuid, since timestamptz)
returns text[] language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_cron(t);
  return coalesce((select array_agg(n.dedupe_key) from public.notifications n where n.user_id = uid and n.created_at >= since and n.dedupe_key is not null), '{}');
end $$;

create or replace function public.jarvis_cron_claim(t text, uid uuid, k text, prio smallint, ttl text, bdy text, u text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare nid uuid;
begin
  perform private.check_cron(t);
  insert into public.notifications (user_id, dedupe_key, priority, title, body, url)
  values (uid, k, prio, ttl, bdy, u)
  on conflict (user_id, dedupe_key) do nothing
  returning id into nid;
  return nid;
end $$;

create or replace function public.jarvis_cron_mark_sent(t text, nid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_cron(t);
  update public.notifications set sent_at = now() where id = nid;
end $$;

create or replace function public.jarvis_cron_subs(t text, uid uuid)
returns table (id uuid, endpoint text, keys jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_cron(t);
  return query select p.id, p.endpoint, p.keys from public.push_subscriptions p where p.user_id = uid;
end $$;

create or replace function public.jarvis_cron_drop_sub(t text, sid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_cron(t);
  delete from public.push_subscriptions where id = sid;
end $$;

-- ── Copia semanal (se guardan 8) y registro ─────────────
create or replace function public.jarvis_cron_backup(t text, uid uuid, d jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_cron(t);
  if exists (select 1 from public.state_backups b where b.user_id = uid and b.created_at > now() - interval '7 days') then
    return false;
  end if;
  insert into public.state_backups (user_id, data) values (uid, d);
  delete from public.state_backups b where b.user_id = uid and b.id not in (
    select b2.id from public.state_backups b2 where b2.user_id = uid order by b2.created_at desc limit 8
  );
  return true;
end $$;

create or replace function public.jarvis_cron_log(t text, uid uuid, started timestamptz, ok boolean, err text, st jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_cron(t);
  insert into public.job_runs (user_id, job, started_at, finished_at, ok, error, stats) values (uid, 'tick', started, now(), ok, err, coalesce(st, '{}'));
  delete from public.job_runs where created_at < now() - interval '14 days';
end $$;

-- ── Enlace de EVAGD del propio usuario ──────────────────
create or replace function public.jarvis_set_evagd_url(url text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); sid uuid; nm text;
begin
  if uid is null then raise exception 'no_session' using errcode = '42501'; end if;
  if url is null or url !~ '^https://[^ ]+export_execute\.php\?' then
    raise exception 'El enlace no parece una exportación de calendario de EVAGD' using errcode = '22023';
  end if;
  nm := 'evagd_url:' || uid::text;
  select s.id into sid from vault.secrets s where s.name = nm;
  if sid is null then
    perform vault.create_secret(url, nm, 'Enlace privado de exportación de EVAGD');
  else
    perform vault.update_secret(sid, url);
  end if;
end $$;

create or replace function public.jarvis_has_evagd_url()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.secrets s where s.name = 'evagd_url:' || auth.uid()::text);
$$;

-- Solo para la ruta del servidor /api/evagd, con la sesión del propio usuario.
create or replace function public.jarvis_my_evagd_url()
returns text language sql stable security definer set search_path = '' as $$
  select d.decrypted_secret from vault.decrypted_secrets d where d.name = 'evagd_url:' || auth.uid()::text limit 1;
$$;

-- ── Permisos ────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'jarvis_cron_states(text)', 'jarvis_cron_save_state(text,uuid,jsonb,timestamptz)', 'jarvis_cron_sent_keys(text,uuid,timestamptz)',
    'jarvis_cron_claim(text,uuid,text,smallint,text,text,text)', 'jarvis_cron_mark_sent(text,uuid)', 'jarvis_cron_subs(text,uuid)',
    'jarvis_cron_drop_sub(text,uuid)', 'jarvis_cron_backup(text,uuid,jsonb)', 'jarvis_cron_log(text,uuid,timestamptz,boolean,text,jsonb)'
  ] loop
    execute format('revoke execute on function public.%s from public, authenticated', f);
    execute format('grant execute on function public.%s to anon, service_role', f);
  end loop;
  foreach f in array array['jarvis_set_evagd_url(text)', 'jarvis_has_evagd_url()', 'jarvis_my_evagd_url()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function private.check_cron(text) from public, anon, authenticated;
