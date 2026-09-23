-- ============================================================================
-- TrainTrack — Admin role, Training Catalog, progress tracking, write guards
-- ----------------------------------------------------------------------------
-- Fills gaps found while testing Phase 1 against the pilot feedback:
--   • Admin/HR role that manages users (creates managers & reportees,
--     changes reporting lines, activates/deactivates).
--   • Training Catalog (restored from the pilot) so managers can keep
--     trainings ready and assign them later — singly or in bulk.
--   • Reportee can START a training and record progress % before requesting
--     approval.
--   • Guards: until now RLS let a reportee update their own profile row
--     (including `role`) and their own trainings (including `status`), so
--     they could make themselves a manager or self-approve a training.
--     Triggers below close that: reportees change trainings only through the
--     workflow RPCs, and nobody but an admin changes roles/reporting lines.
-- Run after 0001-0006.
-- ============================================================================

-- ---------- Admin role ----------
-- The new enum value cannot be referenced as a literal in the same
-- transaction, so everything below compares role::text instead.
alter type user_role add value if not exists 'admin';

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role::text = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- true only if target_user reports directly to the caller (never self)
create or replace function public.is_manager_of(target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = target_user and manager_id = auth.uid());
$$;

-- Service-role calls (server functions) have no auth.uid(); workflow RPCs set
-- app.bypass_guard for their own transaction.
create or replace function public.guard_bypassed()
returns boolean language sql stable as $$
  select auth.uid() is null or coalesce(current_setting('app.bypass_guard', true), '') = 'on';
$$;

-- ---------- profiles: visibility ----------
-- self, your manager, your reportees, your teammates (same manager — needed so
-- Knowledge Hub can show who completed what), or everyone if you're an admin.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or manager_id = auth.uid()
  or id = public.my_manager_id()
  or (manager_id is not null and manager_id = public.my_manager_id())
  or public.is_admin()
);

-- ---------- profiles: write guard ----------
create or replace function public.guard_profile_update()
returns trigger language plpgsql as $$
begin
  if public.guard_bypassed() or public.is_admin() then return new; end if;

  if new.id <> old.id or new.email <> old.email or new.role <> old.role
     or new.manager_id is distinct from old.manager_id then
    raise exception 'Only an admin can change role, reporting manager or email';
  end if;
  if new.is_active <> old.is_active and not public.is_manager_of(old.id) then
    raise exception 'Only the reporting manager or an admin can activate/deactivate a user';
  end if;
  if new.must_change_password <> old.must_change_password
     and old.id <> auth.uid() and not public.is_manager_of(old.id) then
    raise exception 'Not allowed';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- trainings / parts / requests: write guards ----------
-- Reportees change trainings only via the workflow RPCs (start, progress,
-- submit). Managers edit their reportees' trainings directly.
create or replace function public.guard_training_update()
returns trigger language plpgsql as $$
begin
  if public.guard_bypassed() or public.is_admin() or public.is_manager_of(old.assigned_to) then
    return new;
  end if;
  raise exception 'Only the reporting manager can edit a training';
end $$;

drop trigger if exists trg_trainings_guard on public.trainings;
create trigger trg_trainings_guard before update on public.trainings
  for each row execute function public.guard_training_update();

create or replace function public.guard_part_write()
returns trigger language plpgsql as $$
declare v_owner uuid;
begin
  if public.guard_bypassed() or public.is_admin() then return coalesce(new, old); end if;
  select assigned_to into v_owner from public.trainings
   where id = coalesce(new.training_id, old.training_id);
  if public.is_manager_of(v_owner) then return coalesce(new, old); end if;
  raise exception 'Only the reporting manager can change training parts';
end $$;

drop trigger if exists trg_parts_guard on public.training_parts;
create trigger trg_parts_guard before insert or update or delete on public.training_parts
  for each row execute function public.guard_part_write();

-- Requests are created only through submit_for_approval().
create or replace function public.guard_request_insert()
returns trigger language plpgsql as $$
begin
  if public.guard_bypassed() then return new; end if;
  raise exception 'Use submit_for_approval() to request completion';
end $$;

drop trigger if exists trg_requests_guard on public.completion_requests;
create trigger trg_requests_guard before insert on public.completion_requests
  for each row execute function public.guard_request_insert();

-- ---------- Progress tracking ----------
alter table public.trainings
  add column if not exists progress_pct int not null default 0
  check (progress_pct between 0 and 100);

-- Reportee starts a training: pending → in_progress
create or replace function public.start_training(p_training uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_status training_status;
begin
  select assigned_to, status into v_owner, v_status from trainings where id = p_training;
  if v_owner is null then raise exception 'Training not found'; end if;
  if v_owner <> auth.uid() then raise exception 'Not your training'; end if;
  if v_status <> 'pending' then raise exception 'This training has already been started'; end if;
  perform set_config('app.bypass_guard', 'on', true);
  update trainings set status = 'in_progress' where id = p_training;
end $$;

-- Reportee records progress % on a started training
create or replace function public.update_progress(p_training uuid, p_pct int)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_status training_status;
begin
  select assigned_to, status into v_owner, v_status from trainings where id = p_training;
  if v_owner is null then raise exception 'Training not found'; end if;
  if v_owner <> auth.uid() then raise exception 'Not your training'; end if;
  if v_status not in ('in_progress', 'sent_back') then
    raise exception 'Start the training before updating progress';
  end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then raise exception 'Progress must be 0-100'; end if;
  perform set_config('app.bypass_guard', 'on', true);
  update trainings set progress_pct = p_pct where id = p_training;
end $$;

-- ---------- Workflow RPCs: same logic as 0004, plus the guard bypass ----------
create or replace function public.recompute_training_status(p_training uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  n_parts int;
  n_approved int;
  n_submitted int;
begin
  select count(*) into n_parts from training_parts where training_id = p_training;
  if n_parts = 0 then
    return;
  end if;

  select
    count(*) filter (where status = 'approved'),
    count(*) filter (where status = 'submitted')
    into n_approved, n_submitted
  from training_parts where training_id = p_training;

  perform set_config('app.bypass_guard', 'on', true);
  update trainings set status =
    case
      when n_approved = n_parts then 'approved'
      when n_submitted > 0       then 'submitted'
      when n_approved > 0        then 'in_progress'
      -- a started training stays started even if a part was sent back
      when status <> 'pending'   then 'in_progress'
      else 'pending'
    end,
    completed_date = case when n_approved = n_parts then current_date else null end
  where id = p_training;
end $$;

create or replace function public.submit_for_approval(
  p_training uuid,
  p_part     uuid,
  p_notes    text,
  p_outcome_links jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_link  text;
  v_status training_status;
  v_req   uuid;
begin
  select assigned_to, training_link, status into v_owner, v_link, v_status
  from trainings where id = p_training;

  if v_owner is null then raise exception 'Training not found'; end if;
  if v_owner <> auth.uid() then raise exception 'Not your training'; end if;
  if v_status = 'pending' then raise exception 'Start the training before requesting approval'; end if;
  if coalesce(trim(v_link),'') = '' then
    raise exception 'Training material link is required before requesting completion';
  end if;
  if coalesce(trim(p_notes),'') = '' then
    raise exception 'Notes are required';
  end if;
  if p_outcome_links is null or jsonb_array_length(p_outcome_links) = 0 then
    raise exception 'At least one outcome reference link is required';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  insert into completion_requests (training_id, part_id, requested_by, notes, outcome_links, status)
  values (p_training, p_part, auth.uid(), p_notes, p_outcome_links, 'pending')
  returning id into v_req;

  if p_part is null then
    update trainings set status = 'submitted', progress_pct = 100 where id = p_training;
  else
    update training_parts set status = 'submitted' where id = p_part;
    perform recompute_training_status(p_training);
  end if;

  return v_req;
end $$;

create or replace function public.approve_request(
  p_request uuid,
  p_remarks text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_training uuid;
  v_part uuid;
  v_owner uuid;
begin
  select cr.training_id, cr.part_id, t.assigned_to
    into v_training, v_part, v_owner
  from completion_requests cr join trainings t on t.id = cr.training_id
  where cr.id = p_request;

  if v_training is null then raise exception 'Request not found'; end if;
  if not public.is_manager_of(v_owner) then raise exception 'Not authorised'; end if;

  perform set_config('app.bypass_guard', 'on', true);
  update completion_requests
    set status='approved', manager_remarks=nullif(trim(p_remarks),''), reviewed_by=auth.uid(), reviewed_at=now()
  where id = p_request;

  if v_part is null then
    update trainings set status='approved', completed_date=current_date, progress_pct=100 where id = v_training;
  else
    update training_parts set status='approved', completed_date=current_date where id = v_part;
    perform recompute_training_status(v_training);
  end if;
end $$;

create or replace function public.send_back_request(
  p_request uuid,
  p_remarks text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_training uuid;
  v_part uuid;
  v_owner uuid;
begin
  select cr.training_id, cr.part_id, t.assigned_to
    into v_training, v_part, v_owner
  from completion_requests cr join trainings t on t.id = cr.training_id
  where cr.id = p_request;

  if v_training is null then raise exception 'Request not found'; end if;
  if not public.is_manager_of(v_owner) then raise exception 'Not authorised'; end if;
  if coalesce(trim(p_remarks),'') = '' then
    raise exception 'Remarks are required when sending back';
  end if;

  perform set_config('app.bypass_guard', 'on', true);
  update completion_requests
    set status='sent_back', manager_remarks=p_remarks, reviewed_by=auth.uid(), reviewed_at=now()
  where id = p_request;

  if v_part is null then
    update trainings set status='sent_back' where id = v_training;
  else
    update training_parts set status='sent_back' where id = v_part;
    perform recompute_training_status(v_training);
  end if;
end $$;

-- ============================================================================
-- training_catalog — reusable training templates (pilot's "Training Catalog")
--   Shared by all managers; assigning copies the fields into `trainings`.
-- ============================================================================
create table if not exists public.training_catalog (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category_id    uuid references public.training_categories(id) on delete set null,
  training_link  text not null,
  mode           training_mode not null default 'online',
  trainer        text,
  priority       training_priority not null default 'medium',
  resources      jsonb not null default '[]'::jsonb,   -- [{url,title}]
  parts          jsonb not null default '[]'::jsonb,   -- [{title,part_link}]
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.training_catalog is 'Reusable training templates managers assign from (singly or in bulk).';
create unique index if not exists uq_catalog_name on public.training_catalog (lower(name));

drop trigger if exists trg_catalog_touch on public.training_catalog;
create trigger trg_catalog_touch before update on public.training_catalog
  for each row execute function public.touch_updated_at();

alter table public.training_catalog enable row level security;

drop policy if exists catalog_select on public.training_catalog;
create policy catalog_select on public.training_catalog for select
  using (public.is_manager() or public.is_admin());

drop policy if exists catalog_write on public.training_catalog;
create policy catalog_write on public.training_catalog for all
  using (public.is_manager() or public.is_admin())
  with check (public.is_manager() or public.is_admin());

alter table public.trainings
  add column if not exists catalog_id uuid references public.training_catalog(id) on delete set null;
create index if not exists idx_trainings_catalog on public.trainings(catalog_id);
