-- ============================================================================
-- Skillgo — self-assign from catalog, HR delete, link validation
-- ----------------------------------------------------------------------------
--   • A reportee can assign catalog trainings to THEMSELVES (not create new
--     ones): insert allowed when assigned_to = assigned_by = caller, the row
--     comes from the catalog and starts as pending. Completion still needs
--     the manager's approval (unchanged workflow).
--   • Everyone signed in can read the Training Catalog (to pick from it).
--   • HR/Admin can delete assigned trainings (managers already could).
--   • Fix: deleting a multi-part training cascaded into training_parts, whose
--     guard looked up the (already deleted) parent and raised — now allowed.
--   • submit_for_approval() rejects outcome links that aren't real URLs.
-- Run after 0001-0010.
-- ============================================================================

-- ---------- Self-assign ----------
drop policy if exists trainings_insert on public.trainings;
create policy trainings_insert on public.trainings for insert with check (
  (public.is_manager() and assigned_by = auth.uid() and public.is_manager_of(assigned_to))
  or (assigned_to = auth.uid() and assigned_by = auth.uid() and catalog_id is not null and status = 'pending')
);

-- ---------- Delete: reportee's manager or HR/Admin ----------
drop policy if exists trainings_delete on public.trainings;
create policy trainings_delete on public.trainings for delete using (
  public.is_manager_of(assigned_to) or public.is_admin()
);

-- ---------- Parts guard: cascade deletes + parts of a fresh self-assignment ----------
create or replace function public.guard_part_write()
returns trigger language plpgsql as $$
declare v_owner uuid; v_by uuid; v_status training_status;
begin
  if public.guard_bypassed() or public.is_admin() then return coalesce(new, old); end if;
  select assigned_to, assigned_by, status into v_owner, v_by, v_status
    from public.trainings where id = coalesce(new.training_id, old.training_id);
  -- parent already gone: this is the cascade from deleting the training
  if tg_op = 'DELETE' and v_owner is null then return old; end if;
  if public.is_manager_of(v_owner) then return coalesce(new, old); end if;
  -- parts copied from the catalog when someone assigns a training to themselves
  if tg_op = 'INSERT' and v_owner = auth.uid() and v_by = auth.uid() and v_status = 'pending' then return new; end if;
  raise exception 'Only the reporting manager can change training parts';
end $$;

-- ---------- Catalog readable by every signed-in user ----------
drop policy if exists catalog_select on public.training_catalog;
create policy catalog_select on public.training_catalog for select
  using (auth.role() = 'authenticated');

-- ---------- Outcome links must be real URLs ----------
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
