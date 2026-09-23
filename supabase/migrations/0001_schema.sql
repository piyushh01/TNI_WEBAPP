-- ============================================================================
-- TrainTrack — Schema (Phase 1)
-- o2h Technology · BAPM Team
-- Postgres / Supabase
-- ============================================================================
-- Run order: 0001_schema.sql → 0002_rls.sql → 0003_seed.sql → 0004_functions.sql
-- ============================================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- ---------- Enums ----------
do $$ begin
  create type user_role as enum ('reporting_manager', 'reportee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type training_mode as enum ('online', 'face_to_face', 'self_paced', 'blended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type training_priority as enum ('low', 'medium', 'high', 'critical');
exception when duplicate_object then null; end $$;

-- Lifecycle of a training assignment
--  pending      : assigned, reportee not started
--  in_progress  : reportee working (some parts done, or single training started)
--  submitted    : reportee has requested approval, awaiting manager
--  approved     : manager approved → counts as complete, enters Knowledge Hub
--  sent_back    : manager returned it for correction
--  discarded    : archived at year-end
do $$ begin
  create type training_status as enum
    ('pending','in_progress','submitted','approved','sent_back','discarded');
exception when duplicate_object then null; end $$;

-- Approval-request lifecycle
do $$ begin
  create type request_status as enum ('pending','approved','sent_back');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- profiles — extends Supabase auth.users (one row per user)
-- ============================================================================
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text not null unique,
  full_name             text not null,
  role                  user_role not null default 'reportee',
  -- who this reportee reports to (null for managers / top of tree)
  manager_id            uuid references public.profiles(id) on delete set null,
  color                 text not null default '#87a878',
  -- first login must change the manager-set initial password
  must_change_password  boolean not null default true,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.profiles is 'App users; 1:1 with auth.users. Role + reporting line live here.';

create index if not exists idx_profiles_manager on public.profiles(manager_id);
create index if not exists idx_profiles_role    on public.profiles(role);

-- ============================================================================
-- training_categories — fixed o2h taxonomy (reference data, seeded)
--   group_name : Business | Field & Subject | Operations
--   name       : the sub-category
-- ============================================================================
create table if not exists public.training_categories (
  id          uuid primary key default gen_random_uuid(),
  group_name  text not null,
  name        text not null,
  sort_order  int  not null default 0,
  unique (group_name, name)
);
comment on table public.training_categories is 'Fixed 3-group o2h training taxonomy. Seeded in 0003.';

-- ============================================================================
-- trainings — one assignment of a training to one reportee
-- ============================================================================
create table if not exists public.trainings (
  id                    uuid primary key default gen_random_uuid(),

  -- who
  assigned_to           uuid not null references public.profiles(id) on delete cascade,
  assigned_by           uuid not null references public.profiles(id) on delete set null,

  -- what
  name                  text not null,
  category_id           uuid references public.training_categories(id) on delete set null,
  training_link         text not null,                         -- MANDATORY per feedback
  mode                  training_mode not null default 'online',
  trainer               text,                                  -- required only when mode = face_to_face (enforced in app + trigger)
  priority              training_priority not null default 'medium',

  -- dates
  expected_end_date     date,                                  -- "Expected Training End date"
  due_date              date,                                  -- drives overdue flags & reminders
  assigned_date         date not null default current_date,
  completed_date        date,                                  -- set when approved

  -- optional supervisor study resources for the whole training  [{url,title}]
  resources             jsonb not null default '[]'::jsonb,

  -- state
  status                training_status not null default 'pending',
  fy                    text not null,                         -- e.g. '2026-27'
  carried_from_fy       text,                                  -- set when carried over at year-end
  last_reminder_sent    date,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.trainings is 'A training assigned to a reportee, with o2h category/mode/priority and approval status.';
comment on column public.trainings.training_link is 'Mandatory training material link (feedback: required before requesting done).';
comment on column public.trainings.trainer      is 'Only used when mode = face_to_face.';

create index if not exists idx_trainings_assigned_to on public.trainings(assigned_to);
create index if not exists idx_trainings_assigned_by on public.trainings(assigned_by);
create index if not exists idx_trainings_status      on public.trainings(status);
create index if not exists idx_trainings_fy          on public.trainings(fy);
create index if not exists idx_trainings_category    on public.trainings(category_id);

-- ============================================================================
-- training_parts — modules of a multi-part training (0 rows = single training)
-- ============================================================================
create table if not exists public.training_parts (
  id             uuid primary key default gen_random_uuid(),
  training_id    uuid not null references public.trainings(id) on delete cascade,
  title          text not null,
  part_link      text,                                         -- per-part reference link (optional)
  sort_order     int  not null default 0,
  -- part-level approval state mirrors the training lifecycle but scoped to a part
  status         training_status not null default 'pending',
  completed_date date,
  created_at     timestamptz not null default now()
);
comment on table public.training_parts is 'Modules of a multi-part training; each can carry its own reference link.';
create index if not exists idx_parts_training on public.training_parts(training_id);

-- ============================================================================
-- completion_requests — the APPROVAL WORKFLOW
--   Reportee submits (for a whole single training OR one part) with notes +
--   outcome links. Manager approves (→ completed) or sends back (with remarks).
-- ============================================================================
create table if not exists public.completion_requests (
  id             uuid primary key default gen_random_uuid(),
  training_id    uuid not null references public.trainings(id) on delete cascade,
  part_id        uuid references public.training_parts(id) on delete cascade,  -- null = whole (single) training
  requested_by   uuid not null references public.profiles(id) on delete cascade,
  reviewed_by    uuid references public.profiles(id) on delete set null,

  -- reportee's submission
  notes          text not null,
  outcome_links  jsonb not null default '[]'::jsonb,           -- [{url,title}]

  -- manager's decision
  status         request_status not null default 'pending',
  manager_remarks text,

  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz
);
comment on table public.completion_requests is 'Approval requests: reportee submits notes+links, manager approves or sends back with remarks.';
create index if not exists idx_reqs_training on public.completion_requests(training_id);
create index if not exists idx_reqs_status   on public.completion_requests(status);
create index if not exists idx_reqs_reviewer on public.completion_requests(reviewed_by);

-- ============================================================================
-- app_settings — per-manager reminder cadence & current FY
-- ============================================================================
create table if not exists public.app_settings (
  manager_id              uuid primary key references public.profiles(id) on delete cascade,
  pending_reminder_days   int  not null default 7,
  overdue_reminder_days   int  not null default 3,
  current_fy              text not null,
  updated_at              timestamptz not null default now()
);

-- ---------- updated_at auto-touch ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_profiles_touch  on public.profiles;
create trigger trg_profiles_touch  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_trainings_touch on public.trainings;
create trigger trg_trainings_touch before update on public.trainings
  for each row execute function public.touch_updated_at();
