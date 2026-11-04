-- JARVIS · initial schema (Supabase / Postgres 15+)
-- Every row belongs to one user and is protected by Row Level Security.

-- gen_random_uuid() is built into Postgres 13+; no extension needed.

-- Helper: standard owner policy for a table with a user_id column.
create or replace function public.jarvis_owner_policies(tbl regclass) returns void
language plpgsql as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('create policy "owner_select" on %s for select using (user_id = auth.uid())', tbl);
  execute format('create policy "owner_insert" on %s for insert with check (user_id = auth.uid())', tbl);
  execute format('create policy "owner_update" on %s for update using (user_id = auth.uid())', tbl);
  execute format('create policy "owner_delete" on %s for delete using (user_id = auth.uid())', tbl);
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────── Goals hierarchy ─────────────
create type goal_area as enum ('academico', 'cambridge', 'universidad', 'personal');
create type goal_status as enum ('activo', 'en_riesgo', 'al_dia', 'completado', 'pausado');

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  description text not null default '',
  area goal_area not null,
  target_date date,
  priority smallint not null default 2 check (priority between 1 and 3),
  status goal_status not null default 'activo',
  review_every_days int not null default 7,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id uuid not null references goals on delete cascade,
  title text not null,
  resources text not null default '',
  next_action text not null default '',
  status goal_status not null default 'activo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references projects on delete cascade,
  title text not null,
  success_criterion text not null default '',
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id uuid not null references goals on delete cascade,
  label text not null,
  unit text not null default '',
  target numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table metric_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  metric_id uuid not null references metrics on delete cascade,
  value numeric not null,
  measured_at timestamptz not null default now(),
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────── Academic ─────────────
create table subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  short text not null,
  teacher text,
  color text not null default 'c1',
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  importance smallint not null default 2 check (importance between 1 and 3),
  school_year text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  subject_id uuid not null references subjects on delete cascade,
  name text not null,
  mastery numeric(4,3) not null default 0.3 check (mastery between 0 and 1),
  easiness numeric(4,2) not null default 2.5 check (easiness >= 1.3),
  interval_days int not null default 0,
  repetitions int not null default 0,
  next_review timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type item_kind as enum ('examen', 'tarea', 'material', 'aviso');
create type item_source as enum ('evagd', 'notion', 'gcal', 'email', 'manual', 'jarvis');

create table source_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source item_source not null,
  external_id text not null,
  content_hash text not null,
  raw jsonb not null,
  processed_at timestamptz,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, external_id, content_hash)
);

create table academic_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  subject_id uuid references subjects on delete set null,
  source_record_id uuid references source_records on delete set null,
  kind item_kind not null,
  title text not null,
  due timestamptz,
  effort_minutes int not null default 60,
  done_minutes int not null default 0,
  source item_source not null,
  external_id text,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create table academic_item_topics (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_id uuid not null references academic_items on delete cascade,
  topic_id uuid not null references topics on delete cascade,
  primary key (item_id, topic_id)
);

create table grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  subject_id uuid not null references subjects on delete cascade,
  item_id uuid references academic_items on delete set null,
  grade numeric(4,2) not null check (grade between 0 and 10),
  weight numeric(4,2) not null default 1,
  term smallint,
  graded_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────── Planning ─────────────
create table planner_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  generated_at timestamptz not null default now(),
  horizon_days int not null,
  trigger text not null, -- 'schedule' | 'new_item' | 'user_request' | ...
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type block_kind as enum ('examen', 'tarea', 'repaso', 'cambridge');
create type session_outcome as enum ('pendiente', 'hecho', 'parcial', 'no_hecho');

create table study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_id uuid references plans on delete set null,
  block_key text not null,
  subject_id uuid references subjects on delete set null,
  item_id uuid references academic_items on delete set null,
  topic_id uuid references topics on delete set null,
  kind block_kind not null,
  technique text not null,
  title text not null,
  reason text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  google_event_id text,
  outcome session_outcome not null default 'pendiente',
  difficulty smallint check (difficulty between 1 and 5),
  recall_quality smallint check (recall_quality between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on study_sessions (user_id, starts_at);

create type change_status as enum ('propuesto', 'aceptado', 'rechazado', 'aplicado');
create table plan_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_id uuid not null references plans on delete cascade,
  change_type text not null,
  block jsonb not null,
  previous jsonb,
  explanation text not null,
  status change_status not null default 'propuesto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────── System ─────────────
create table findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  agent text not null,
  type text not null,
  severity smallint not null check (severity between 1 and 3),
  title text not null,
  detail text not null,
  status text not null default 'abierto', -- abierto | visto | resuelto | descartado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create type memory_kind as enum ('personal', 'academica', 'proyectos', 'operativa', 'decisiones');
create table memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind memory_kind not null,
  content text not null,
  source text not null,
  confidence numeric(3,2) not null default 1 check (confidence between 0 and 1),
  confirmed boolean not null default false,
  expires_at timestamptz,
  search tsvector generated always as (to_tsvector('spanish', content)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on memories using gin (search);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  what text not null,
  why text not null,
  decided_by text not null, -- 'jarvis' | 'user'
  user_response text,
  related jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type permission_category as enum ('automatica', 'autorizacion_inicial', 'por_accion');
create type action_status as enum ('pendiente', 'aprobada', 'rechazada', 'ejecutada', 'fallida', 'caducada', 'rechazada_por_politica');
create table actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  category permission_category not null,
  params jsonb not null,
  requested_by text not null,
  reason text not null,
  status action_status not null,
  dry_run boolean not null default false,
  error text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on actions (user_id, created_at desc);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  provider text not null, -- google | notion | gmail | evagd_ical | push
  scopes text[] not null default '{}',
  status text not null default 'pendiente',
  dry_run_until timestamptz,
  last_sync_at timestamptz,
  cursor jsonb not null default '{}', -- syncToken, channel ids, etc. (no secrets)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- OAuth tokens live in Supabase Vault (or an encrypted column); this table only stores the reference.
create table integration_secrets (
  integration_id uuid primary key references integrations on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  vault_secret_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  channel text not null default 'push',
  priority smallint not null default 2 check (priority between 1 and 3),
  title text not null,
  body text not null,
  url text,
  sent_at timestamptz,
  read_at timestamptz,
  action_taken text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table job_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  error text,
  stats jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS + updated_at triggers on every user table.
do $$
declare t text;
begin
  foreach t in array array[
    'goals','projects','milestones','metrics','metric_values','subjects','topics','source_records',
    'academic_items','academic_item_topics','grades','planner_settings','plans','study_sessions','plan_changes',
    'findings','memories','decisions','actions','integrations','integration_secrets','push_subscriptions',
    'notifications','job_runs'
  ] loop
    perform public.jarvis_owner_policies(t::regclass);
  end loop;
  foreach t in array array[
    'goals','projects','milestones','metrics','metric_values','subjects','topics','source_records',
    'academic_items','grades','planner_settings','plans','study_sessions','plan_changes','findings','memories',
    'decisions','actions','integrations','integration_secrets','push_subscriptions','notifications','job_runs'
  ] loop
    execute format('create trigger touch before update on %I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Secrets are never readable from the browser, even by their owner.
drop policy "owner_select" on integration_secrets;
