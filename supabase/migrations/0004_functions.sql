-- ============================================================================
-- TrainTrack — Workflow functions (RPC)
-- These enforce the approval workflow server-side so clients can't bypass it.
-- Call from the frontend via supabase.rpc('fn_name', {...}).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Recompute a training's status from its parts (for multi-part trainings).
-- Single trainings (no parts) are driven directly by their own request flow.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_training_status(p_training uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  n_parts int;
  n_approved int;
  n_submitted int;
begin
  select count(*) into n_parts from training_parts where training_id = p_training;
  if n_parts = 0 then
    return; -- single training: status handled by request approval directly
  end if;

  select
    count(*) filter (where status = 'approved'),
    count(*) filter (where status = 'submitted')
    into n_approved, n_submitted
  from training_parts where training_id = p_training;

  update trainings set status =
    case
      when n_approved = n_parts then 'approved'
      when n_submitted > 0       then 'submitted'
      when n_approved > 0        then 'in_progress'
      else 'pending'
    end,
    completed_date = case when n_approved = n_parts then current_date else null end
  where id = p_training;
end $$;

-- ---------------------------------------------------------------------------
-- Reportee submits a completion request (whole single training OR one part).
-- Guards: caller owns the training; training_link must exist; notes + >=1 link.
-- Sets the training/part to 'submitted'.
-- ---------------------------------------------------------------------------
create or replace function public.submit_for_approval(
  p_training uuid,
  p_part     uuid,               -- null for a single training
  p_notes    text,
  p_outcome_links jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_link  text;
  v_req   uuid;
begin
  select assigned_to, training_link into v_owner, v_link
  from trainings where id = p_training;

  if v_owner is null then raise exception 'Training not found'; end if;
  if v_owner <> auth.uid() then raise exception 'Not your training'; end if;
  if coalesce(trim(v_link),'') = '' then
    raise exception 'Training material link is required before requesting completion';
  end if;
  if coalesce(trim(p_notes),'') = '' then
    raise exception 'Notes are required';
  end if;
  if p_outcome_links is null or jsonb_array_length(p_outcome_links) = 0 then
    raise exception 'At least one outcome reference link is required';
  end if;

  insert into completion_requests (training_id, part_id, requested_by, notes, outcome_links, status)
  values (p_training, p_part, auth.uid(), p_notes, p_outcome_links, 'pending')
  returning id into v_req;

  if p_part is null then
    update trainings set status = 'submitted' where id = p_training;
  else
    update training_parts set status = 'submitted' where id = p_part;
    perform recompute_training_status(p_training);
  end if;

  return v_req;
end $$;

-- ---------------------------------------------------------------------------
-- Manager approves a request. Marks the training/part approved (= completed).
-- Guards: caller manages the training's reportee.
-- ---------------------------------------------------------------------------
create or replace function public.approve_request(
  p_request uuid,
  p_remarks text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_training uuid;
  v_part uuid;
  v_owner uuid;
begin
  select cr.training_id, cr.part_id, t.assigned_to
    into v_training, v_part, v_owner
  from completion_requests cr join trainings t on t.id = cr.training_id
  where cr.id = p_request;

  if v_training is null then raise exception 'Request not found'; end if;
  if not public.manages_or_self(v_owner) then raise exception 'Not authorised'; end if;

  update completion_requests
    set status='approved', manager_remarks=p_remarks, reviewed_by=auth.uid(), reviewed_at=now()
  where id = p_request;

  if v_part is null then
    update trainings set status='approved', completed_date=current_date where id = v_training;
  else
    update training_parts set status='approved', completed_date=current_date where id = v_part;
    perform recompute_training_status(v_training);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Manager sends a request back for correction (with remarks).
-- Reportee can revise and resubmit.
-- ---------------------------------------------------------------------------
create or replace function public.send_back_request(
  p_request uuid,
  p_remarks text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_training uuid;
  v_part uuid;
  v_owner uuid;
begin
  select cr.training_id, cr.part_id, t.assigned_to
    into v_training, v_part, v_owner
  from completion_requests cr join trainings t on t.id = cr.training_id
  where cr.id = p_request;

  if v_training is null then raise exception 'Request not found'; end if;
  if not public.manages_or_self(v_owner) then raise exception 'Not authorised'; end if;
  if coalesce(trim(p_remarks),'') = '' then
    raise exception 'Remarks are required when sending back';
  end if;

  update completion_requests
    set status='sent_back', manager_remarks=p_remarks, reviewed_by=auth.uid(), reviewed_at=now()
  where id = p_request;

  if v_part is null then
    update trainings set status='sent_back' where id = v_training;
  else
    update training_parts set status='sent_back' where id = v_part;
    perform recompute_training_status(v_training);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Trigger: when a NEW auth user is created, auto-create a matching profile row.
-- Reads metadata the admin provisioning passes (full_name, role, manager_id).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, manager_id, color, must_change_password)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'reportee'),
    nullif(new.raw_user_meta_data->>'manager_id','')::uuid,
    coalesce(new.raw_user_meta_data->>'color', '#87a878'),
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, true)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Convenience view: pending approvals for the current manager
-- ---------------------------------------------------------------------------
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
  and public.manages_or_self(t.assigned_to);

comment on view public.v_pending_approvals is 'Rows a manager needs to action; RLS-safe via manages_or_self.';
