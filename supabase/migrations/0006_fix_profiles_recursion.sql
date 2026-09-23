-- ============================================================================
-- TrainTrack — fix infinite recursion in profiles_select (42P17)
-- ----------------------------------------------------------------------------
-- 0002's profiles_select looked up the caller's manager_id with a subquery on
-- public.profiles itself, which re-applies the same policy → recursion, so no
-- signed-in user could read their own profile. Move that lookup into a
-- SECURITY DEFINER helper (same pattern as is_manager()), which bypasses RLS.
-- Run after 0001-0005.
-- ============================================================================

create or replace function public.my_manager_id()
returns uuid language sql stable security definer set search_path = public as $$
  select manager_id from public.profiles where id = auth.uid();
$$;

-- read: self, your manager, or (if manager) your reportees
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or manager_id = auth.uid()
  or id = public.my_manager_id()
);
