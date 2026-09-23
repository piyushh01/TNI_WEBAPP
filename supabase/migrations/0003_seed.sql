-- ============================================================================
-- TrainTrack — Seed reference data
-- o2h training category taxonomy (from BAPM feedback)
-- ============================================================================

insert into public.training_categories (group_name, name, sort_order) values
  -- A. Business
  ('Business', 'Finance',                              10),
  ('Business', 'Market & Customer',                    11),
  ('Business', 'Strategy & Innovation',                12),
  -- B. Field & Subject
  ('Field & Subject', 'Technical Execution Skills',    20),
  ('Field & Subject', 'Productivity',                  21),
  ('Field & Subject', 'Design',                        22),
  ('Field & Subject', 'Research & Expertise',          23),
  -- C. Operations
  ('Operations', 'Project Management & Reporting',     30),
  ('Operations', 'Process & Capability Development and Culture', 31),
  ('Operations', 'Team & Learning',                    32)
on conflict (group_name, name) do nothing;
