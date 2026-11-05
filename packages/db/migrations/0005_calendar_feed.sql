-- JARVIS · calendario suscrito (iPhone, Google Calendar…).
-- Cada usuario tiene un enlace privado con un token largo; quien no lo tenga no ve nada.
-- Es solo lectura: el calendario del móvil descarga los eventos, nunca escribe.

create table if not exists private.calendar_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

create or replace function public.jarvis_calendar_token()
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); tok text;
begin
  if uid is null then raise exception 'no_session' using errcode = '42501'; end if;
  insert into private.calendar_tokens (user_id) values (uid) on conflict (user_id) do nothing;
  select c.token into tok from private.calendar_tokens c where c.user_id = uid;
  return tok;
end $$;

create or replace function public.jarvis_calendar_feed(tok text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select s.data from public.app_state s join private.calendar_tokens c on c.user_id = s.user_id
  where tok is not null and length(tok) >= 32 and c.token = tok;
$$;

revoke execute on function public.jarvis_calendar_token() from public, anon;
grant execute on function public.jarvis_calendar_token() to authenticated;
revoke execute on function public.jarvis_calendar_feed(text) from public, authenticated;
grant execute on function public.jarvis_calendar_feed(text) to anon, service_role;
