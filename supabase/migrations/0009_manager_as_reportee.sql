-- ============================================================================
-- TrainTrack — a Reporting Manager can also be someone's reportee
-- ----------------------------------------------------------------------------
-- A manager with a manager_id (their own senior) gets trainings assigned by
-- that senior and goes through the same approval flow. Several rules used
-- manages_or_self(), which is also true for your OWN rows — fine while
-- managers never had trainings, but now it would let a manager assign,
-- delete or approve their own training. Those rules now use is_manager_of()
-- (direct reportees only, never self).
--   • reqs_update also let a reportee edit their own request (e.g. mark it
--     approved) — closed by the same change.
-- Run after 0001-0008.
-- ============================================================================

-- only managers create assignments, and only for their direct reportees
drop policy if exists trainings_insert on public.trainings;
create policy trainings_insert on public.trainings for insert with check (
  public.is_manager()
  and assigned_by = auth.uid()
  and public.is_manager_of(assigned_to)
);

-- only the reportee's manager can delete their training
drop policy if exists trainings_delete on public.trainings;
create policy trainings_delete on public.trainings for delete using (
  public.is_manager_of(assigned_to)
);

-- manager-side updates of requests are for the reportee's manager only
-- (approve/send back normally go through the RPCs anyway)
drop policy if exists reqs_update on public.completion_requests;
create policy reqs_update on public.completion_requests for update using (
  exists (select 1 from public.trainings t where t.id = training_id and public.is_manager_of(t.assigned_to))
);

-- pending approvals: only requests from your direct reportees, not your own
create or replace view public.v_pending_approvals as
select
  cr.id            as request_id,
  cr.training_id,
  cr.part_id,
  cr.notes,
  cr.outcome_links,
  cr.created_at,
  t.name           as training_name,
  tp.title         as part_title,
  p.full_name      as reportee_name,
  p.id             as reportee_id
from completion_requests cr
join trainings t   on t.id = cr.training_id
left join training_parts tp on tp.id = cr.part_id
join profiles p    on p.id = cr.requested_by
where cr.status = 'pending'
  and public.is_manager_of(t.assigned_to);
