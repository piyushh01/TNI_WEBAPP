-- ============================================================================
-- TrainTrack — HR overview access, company-template import, taxonomy fix
-- ----------------------------------------------------------------------------
--   • Admin/HR can READ every training, part and approval request so they
--     can see organisation-wide progress (writes stay with managers).
--   • Catalog entries imported from company sheets (New Joiner plan, TNI)
--     often have no material link yet, so the catalog link is optional; the
--     link is still mandatory on every assigned training (trainings.
--     training_link stays NOT NULL, submit_for_approval() still checks it).
--   • "Training details" / "Detail/Comment" from those sheets → description.
--   • Category taxonomy aligned with the official o2h TNI template
--     (9 sub-categories): Design, Research & Expertise is one category, and
--     Operations is Project Management & Reporting / Process & Capability
--     Development / Culture, Team & Learning.
-- Run after 0001-0007.
-- ============================================================================

-- ---------- HR read access ----------
drop policy if exists trainings_select on public.trainings;
create policy trainings_select on public.trainings for select using (
  public.can_view_training(id) or public.is_admin()
);

drop policy if exists parts_select on public.training_parts;
create policy parts_select on public.training_parts for select using (
  public.can_view_training(training_id) or public.is_admin()
);

drop policy if exists reqs_select on public.completion_requests;
create policy reqs_select on public.completion_requests for select using (
  requested_by = auth.uid()
  or public.can_view_training(training_id)
  or public.is_admin()
);

-- ---------- Catalog: optional link, descriptions ----------
alter table public.training_catalog alter column training_link drop not null;
alter table public.training_catalog add column if not exists description text;
alter table public.trainings        add column if not exists description text;

-- ---------- Taxonomy fix (match the official TNI template) ----------
do $$
declare
  v_design uuid; v_research uuid; v_proc uuid; v_team uuid;
begin
  select id into v_design   from training_categories where group_name='Field & Subject' and name='Design';
  select id into v_research from training_categories where group_name='Field & Subject' and name='Research & Expertise';
  if v_design is not null then
    update training_categories set name='Design, Research & Expertise', sort_order=22 where id=v_design;
    if v_research is not null then
      update trainings        set category_id=v_design where category_id=v_research;
      update training_catalog set category_id=v_design where category_id=v_research;
      delete from training_categories where id=v_research;
    end if;
  end if;

  select id into v_proc from training_categories where group_name='Operations' and name='Process & Capability Development and Culture';
  if v_proc is not null then
    update training_categories set name='Process & Capability Development', sort_order=31 where id=v_proc;
  end if;

  select id into v_team from training_categories where group_name='Operations' and name='Team & Learning';
  if v_team is not null then
    update training_categories set name='Culture, Team & Learning', sort_order=32 where id=v_team;
  end if;
end $$;

insert into public.training_categories (group_name, name, sort_order) values
  ('Business', 'Finance',                              10),
  ('Business', 'Market & Customer',                    11),
  ('Business', 'Strategy & Innovation',                12),
  ('Field & Subject', 'Technical Execution Skills',    20),
  ('Field & Subject', 'Productivity',                  21),
  ('Field & Subject', 'Design, Research & Expertise',  22),
  ('Operations', 'Project Management & Reporting',     30),
  ('Operations', 'Process & Capability Development',   31),
  ('Operations', 'Culture, Team & Learning',           32)
on conflict (group_name, name) do nothing;
