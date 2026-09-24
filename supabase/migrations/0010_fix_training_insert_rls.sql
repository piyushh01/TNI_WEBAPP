-- ============================================================================
-- Skillgo — fix "new row violates row-level security policy for table trainings"
-- ----------------------------------------------------------------------------
-- Assigning a training does INSERT … RETURNING, so Postgres also checks the
-- SELECT policy against the new row. trainings_select (0005/0008) called
-- can_view_training(id), which looks the training up in the table — but a
-- STABLE function runs on the statement's snapshot, where the row being
-- inserted doesn't exist yet. The check returned false and every assignment
-- was rejected.
--
-- The policy now evaluates the row's own columns directly. Who can see what
-- is unchanged:
--   • the reportee, the assigning manager, the reportee's manager, admins
--   • teammates (same manager) — approved trainings only (Knowledge Hub)
-- Run after 0001-0009.
-- ============================================================================

-- true if target_user shares the caller's manager (a teammate)
create or replace function public.is_teammate(target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles owner
    where owner.id = target_user
      and owner.manager_id is not null
      and owner.manager_id = public.my_manager_id()
  );
$$;

drop policy if exists trainings_select on public.trainings;
create policy trainings_select on public.trainings for select using (
  assigned_to = auth.uid()
  or assigned_by = auth.uid()
  or public.is_manager_of(assigned_to)
  or public.is_admin()
  or (status = 'approved' and public.is_teammate(assigned_to))
);
