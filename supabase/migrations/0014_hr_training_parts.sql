-- ============================================================================
-- Skillgo — let HR/Admin save the parts of trainings they assign
-- ----------------------------------------------------------------------------
-- 0012 allowed HR to assign trainings, but the training_parts policy (0002)
-- still only allowed the reportee or their manager, so assigning a catalog
-- training that has parts failed with "new row violates row-level security
-- policy for table training_parts". The parts guard trigger already allowed
-- admins; this aligns the RLS policy with it.
-- Run after 0001-0013.
-- ============================================================================

drop policy if exists parts_cud on public.training_parts;
create policy parts_cud on public.training_parts for all using (
  public.is_admin() or exists (
    select 1 from public.trainings t where t.id = training_id
      and (t.assigned_to = auth.uid() or public.manages_or_self(t.assigned_to)))
) with check (
  public.is_admin() or exists (
    select 1 from public.trainings t where t.id = training_id
      and (t.assigned_to = auth.uid() or public.manages_or_self(t.assigned_to)))
);
