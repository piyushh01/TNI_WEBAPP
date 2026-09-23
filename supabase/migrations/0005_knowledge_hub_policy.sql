-- ============================================================================
-- TrainTrack — Knowledge Hub visibility (added during frontend integration)
-- ----------------------------------------------------------------------------
-- The pilot's Knowledge Hub is a TEAM-WIDE shared library of completed
-- trainings: a reportee should be able to browse what their teammates
-- (people reporting to the same manager) learned once a training is
-- approved — not just their own.
--
-- 0002_rls.sql's `manages_or_self()` only grants visibility to yourself or
-- your own manager/reportees, so a reportee could not see a teammate's
-- trainings under that policy. This migration adds one narrowly-scoped extra
-- rule: an APPROVED training (and its parts / completion request, for the
-- notes + outcome links Knowledge Hub displays) is also visible to anyone
-- who shares the same manager as the training's owner.
-- Run after 0001-0004.
-- ============================================================================

create or replace function public.can_view_training(t_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.trainings t
    join public.profiles owner on owner.id = t.assigned_to
    left join public.profiles me on me.id = auth.uid()
    where t.id = t_id
      and (
        t.assigned_to = auth.uid()
        or t.assigned_by = auth.uid()
        or public.manages_or_self(t.assigned_to)
        or (
          t.status = 'approved'
          and me.id is not null
          and owner.manager_id is not null
          and owner.manager_id = me.manager_id
        )
      )
  );
$$;

drop policy if exists trainings_select on public.trainings;
create policy trainings_select on public.trainings for select using (
  public.can_view_training(id)
);

drop policy if exists parts_select on public.training_parts;
create policy parts_select on public.training_parts for select using (
  public.can_view_training(training_id)
);

drop policy if exists reqs_select on public.completion_requests;
create policy reqs_select on public.completion_requests for select using (
  requested_by = auth.uid()
  or public.can_view_training(training_id)
);
