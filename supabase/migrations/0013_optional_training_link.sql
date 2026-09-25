-- ============================================================================
-- Skillgo — training material link optional
-- ----------------------------------------------------------------------------
-- Clarified by the product owner: managers/HR may assign a training without a
-- material link. The reportee's flow is unchanged — completing a training
-- still requires their key learnings (notes) and at least one valid outcome
-- link showing where they did it; the training's own material link is no
-- longer required for that.
--   • trainings.training_link nullable
--   • submit_for_approval() no longer checks the training's material link
--     (notes + outcome-link checks from 0011 are kept)
-- Run after 0001-0012.
-- ============================================================================

alter table public.trainings alter column training_link drop not null;

create or replace function public.submit_for_approval(
  p_training uuid,
  p_part     uuid,
  p_notes    text,
  p_outcome_links jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_status training_status;
  v_req   uuid;
begin
  select assigned_to, status into v_owner, v_status
  from trainings where id = p_training;

  if v_owner is null then raise exception 'Training not found'; end if;
  if v_owner <> auth.uid() then raise exception 'Not your training'; end if;
  if v_status = 'pending' then raise exception 'Start the training before requesting approval'; end if;
  if coalesce(trim(p_notes),'') = '' then
    raise exception 'Notes are required';
  end if;
  if p_outcome_links is null or jsonb_array_length(p_outcome_links) = 0 then
    raise exception 'At least one outcome reference link is required';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_outcome_links) e
    where coalesce(e->>'url', '') !~* '^https?://[^[:space:]/]+\.[^[:space:]]+$'
  ) then
    raise exception 'Outcome reference links must be valid web links (https://…)';
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
