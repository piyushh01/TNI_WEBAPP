-- ============================================================================
-- Skillgo — assign from the catalog, initiate later with dates
-- ----------------------------------------------------------------------------
-- New flow (from user feedback): when a training is added to the catalog (or
-- bulk-imported) it can be assigned straight away to chosen people, without
-- dates. Later the person — or their manager — picks a training and
-- INITIATES it, setting its start and expected end dates.
--   • trainings.start_date
--   • start_training(p_training, p_start, p_end): reportee initiates their
--     own training with dates (end required, not before start)
--   • HR/Admin may also assign trainings (e.g. while adding them to the
--     catalog); approval stays with the person's reporting manager.
-- Run after 0001-0011.
-- ============================================================================

alter table public.trainings add column if not exists start_date date;

-- HR/Admin can assign too
drop policy if exists trainings_insert on public.trainings;
create policy trainings_insert on public.trainings for insert with check (
  (public.is_manager() and assigned_by = auth.uid() and public.is_manager_of(assigned_to))
  or (public.is_admin() and assigned_by = auth.uid())
  or (assigned_to = auth.uid() and assigned_by = auth.uid() and catalog_id is not null and status = 'pending')
);

-- Initiate: pending → in_progress with a start and expected end date
drop function if exists public.start_training(uuid);
create or replace function public.start_training(p_training uuid, p_start date, p_end date)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_status training_status;
begin
  select assigned_to, status into v_owner, v_status from trainings where id = p_training;
  if v_owner is null then raise exception 'Training not found'; end if;
  if v_owner <> auth.uid() then raise exception 'Not your training'; end if;
  if v_status <> 'pending' then raise exception 'This training has already been started'; end if;
  if p_start is null or p_end is null then raise exception 'Start date and end date are required'; end if;
  if p_end < p_start then raise exception 'End date can''t be before the start date'; end if;
  perform set_config('app.bypass_guard', 'on', true);
  update trainings
     set status = 'in_progress', start_date = p_start, expected_end_date = p_end
   where id = p_training;
end $$;
