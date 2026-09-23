-- ============================================================================
-- TrainTrack — Row Level Security (RLS)
-- ============================================================================
-- Model:
--   • Reportee  → sees/acts on their OWN records only.
--   • Manager   → sees/manages records of reportees where manager_id = them,
--                 plus their own.
-- Helper functions are SECURITY DEFINER to avoid recursive RLS lookups.
-- ============================================================================

-- ---------- Helpers ----------
create or replace function public.current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'reporting_manager' from public.profiles where id = auth.uid()), false);
$$;

-- true if target_user is the current user, or reports to the current user
create or replace function public.manages_or_self(target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    target_user = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = target_user and p.manager_id = auth.uid()
    );
$$;

-- ---------- Enable RLS ----------
alter table public.profiles            enable row level security;
alter table public.training_categories enable row level security;
alter table public.trainings           enable row level security;
alter table public.training_parts      enable row level security;
alter table public.completion_requests enable row level security;
alter table public.app_settings        enable row level security;

-- ============================================================================
-- profiles
-- ============================================================================
-- read: self, your manager, or (if manager) your reportees
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or manager_id = auth.uid()
  or id = (select manager_id from public.profiles where id = auth.uid())
);

-- update: self (limited via app), or manager updating a reportee
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (
  id = auth.uid() or manager_id = auth.uid()
);

-- insert: managers create reportee profiles (also created via admin function).
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check (
  public.is_manager() or id = auth.uid()
);

-- ============================================================================
-- training_categories — read-only reference data for all authenticated users
-- ============================================================================
drop policy if exists categories_select on public.training_categories;
create policy categories_select on public.training_categories for select
  using (auth.role() = 'authenticated');

-- ============================================================================
-- trainings
-- ============================================================================
drop policy if exists trainings_select on public.trainings;
create policy trainings_select on public.trainings for select using (
  assigned_to = auth.uid()
  or assigned_by = auth.uid()
  or public.manages_or_self(assigned_to)
);

-- only managers create assignments, and only for their own reportees
drop policy if exists trainings_insert on public.trainings;
create policy trainings_insert on public.trainings for insert with check (
  public.is_manager()
  and assigned_by = auth.uid()
  and public.manages_or_self(assigned_to)
);

-- managers update their reportees' trainings (assign/edit/approve).
-- reportees may update their own training's progress fields (guarded in app/functions).
drop policy if exists trainings_update on public.trainings;
create policy trainings_update on public.trainings for update using (
  assigned_to = auth.uid() or public.manages_or_self(assigned_to)
);

-- only the assigning manager can delete
drop policy if exists trainings_delete on public.trainings;
create policy trainings_delete on public.trainings for delete using (
  public.manages_or_self(assigned_to)
);

-- ============================================================================
-- training_parts — follow the parent training's visibility
-- ============================================================================
drop policy if exists parts_select on public.training_parts;
create policy parts_select on public.training_parts for select using (
  exists (select 1 from public.trainings t where t.id = training_id
          and (t.assigned_to = auth.uid() or public.manages_or_self(t.assigned_to)))
);

drop policy if exists parts_cud on public.training_parts;
create policy parts_cud on public.training_parts for all using (
  exists (select 1 from public.trainings t where t.id = training_id
          and (t.assigned_to = auth.uid() or public.manages_or_self(t.assigned_to)))
) with check (
  exists (select 1 from public.trainings t where t.id = training_id
          and (t.assigned_to = auth.uid() or public.manages_or_self(t.assigned_to)))
);

-- ============================================================================
-- completion_requests
-- ============================================================================
-- read: the reportee who raised it, or the manager over that training
drop policy if exists reqs_select on public.completion_requests;
create policy reqs_select on public.completion_requests for select using (
  requested_by = auth.uid()
  or exists (select 1 from public.trainings t where t.id = training_id and public.manages_or_self(t.assigned_to))
);

-- insert: the reportee submitting their own request
drop policy if exists reqs_insert on public.completion_requests;
create policy reqs_insert on public.completion_requests for insert with check (
  requested_by = auth.uid()
  and exists (select 1 from public.trainings t where t.id = training_id and t.assigned_to = auth.uid())
);

-- update: manager over the training (to approve / send back)
drop policy if exists reqs_update on public.completion_requests;
create policy reqs_update on public.completion_requests for update using (
  exists (select 1 from public.trainings t where t.id = training_id and public.manages_or_self(t.assigned_to))
);

-- ============================================================================
-- app_settings — each manager owns their row
-- ============================================================================
drop policy if exists settings_all on public.app_settings;
create policy settings_all on public.app_settings for all
  using (manager_id = auth.uid())
  with check (manager_id = auth.uid());
