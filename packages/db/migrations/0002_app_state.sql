-- JARVIS · estado de la app y acceso de un solo usuario.
-- La app guarda hoy su estado como un documento (el mismo que antes vivía en el navegador).
-- Las tablas normalizadas de 0001 se irán llenando a medida que los trabajos del servidor las usen.

create table public.app_state (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  rev bigint not null default 1,
  device text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.jarvis_owner_policies('public.app_state'::regclass);
create trigger touch before update on public.app_state for each row execute function public.touch_updated_at();

-- Copia semanal: la escribe el servidor, el dueño solo puede leerla.
create table public.state_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.state_backups (user_id, created_at desc);
alter table public.state_backups enable row level security;
create policy "owner_select" on public.state_backups for select to authenticated using (user_id = (select auth.uid()));

-- Cada aviso se manda una sola vez: el trabajo del servidor reserva la clave antes de enviarlo.
alter table public.notifications add column dedupe_key text;
alter table public.notifications add constraint notifications_dedupe unique (user_id, dedupe_key);

-- Solo los correos de esta lista pueden crear cuenta. La lista se rellena desde el panel,
-- nunca desde el código, y no es legible desde el navegador.
create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;

create or replace function public.jarvis_only_allowed_signups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.allowed_emails a where a.email = lower(new.email)) then
    raise exception 'JARVIS es privado: este correo no tiene acceso';
  end if;
  return new;
end $$;
revoke execute on function public.jarvis_only_allowed_signups() from public, anon, authenticated;

create trigger jarvis_only_allowed_signups before insert on auth.users
for each row execute function public.jarvis_only_allowed_signups();

-- Las funciones auxiliares no deben poder llamarse desde la API.
revoke execute on function public.jarvis_owner_policies(regclass) from public, anon, authenticated;
