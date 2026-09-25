-- ============================================================================
-- Skillgo — fix submitting / approving a part of a multi-part training
-- ----------------------------------------------------------------------------
-- recompute_training_status() set trainings.status from a CASE of plain text
-- literals, which Postgres types as text, so every part submission failed
-- with: column "status" is of type training_status but expression is of
-- type text. Same logic, with the result cast to the enum.
-- Run after 0001-0014.
-- ============================================================================

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
    (case
      when n_approved = n_parts then 'approved'
      when n_submitted > 0       then 'submitted'
      when n_approved > 0        then 'in_progress'
      -- a started training stays started even if a part was sent back
      when status <> 'pending'   then 'in_progress'
      else 'pending'
    end)::training_status,
    completed_date = case when n_approved = n_parts then current_date else null end
  where id = p_training;
end $$;
