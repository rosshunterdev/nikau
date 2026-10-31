-- SCRUM-60: catalogue seeding, first batch (v0.3 attributes, SCRUM-50 doc).
-- All providers, activities and contact details are MADE UP for testing. No real organisations.
-- Contact details use example.com and 555 numbers so nothing points at a real person or business.
-- Loaded after seed.sql (see sql_paths in config.toml).
--
-- Coverage, so the pre-filter and /match have something to work with:
--   * most tags used at least once; morning, afternoon, evening and weekend sessions
--   * all four joining types; free, cheap and $25 options
--   * low / medium / high on both physical demand and sensory load
--   * unknowns (null) on step-free, support worker policy and staff experience -> the AI should ask
--   * age limits: min 16, min 18, min 50, max 25
--   * one provider WITHOUT consent (hidden from support workers)
--   * one ARCHIVED activity (pre-filter rule 0 must skip it)

---------------------------------------------------------------------------------------------------
-- Providers
insert into public.providers (provider_id, name, contact_email, contact_phone, consent_given, consent_date) values
  ('d1000000-0000-0000-0000-000000000001', 'Newtown Gentle Movement Collective', 'hello@gentlemovement.example.com', '04 555 0101', true, '2026-10-20'),
  ('d1000000-0000-0000-0000-000000000002', 'Island Bay Community Garden Trust',  'garden@ibgarden.example.com',      '04 555 0102', true, '2026-10-20'),
  ('d1000000-0000-0000-0000-000000000003', 'Te Aro Rhythm Circle',               'drum@rhythm.example.com',          null,          true, '2026-10-21'),
  ('d1000000-0000-0000-0000-000000000004', 'Eastern Suburbs Games Club',         'play@esgames.example.com',         '04 555 0104', true, '2026-10-21'),
  ('d1000000-0000-0000-0000-000000000005', 'Harbourside Community Kitchen',      'cook@hkitchen.example.com',        '04 555 0105', true, '2026-10-22'),
  ('d1000000-0000-0000-0000-000000000006', 'Southern Aquatic Inclusion Group',   'swim@saig.example.com',            '04 555 0106', true, '2026-10-22'),
  ('d1000000-0000-0000-0000-000000000007', 'Naenae Rōpū Kapa Haka',              'kiaora@naenaeropu.example.com',    null,          true, '2026-10-23'),
  ('d1000000-0000-0000-0000-000000000008', 'Karori Paws Volunteers',             'walks@karoripaws.example.com',     '04 555 0108', true, '2026-10-23'),
  ('d1000000-0000-0000-0000-000000000009', 'Johnsonville Digital Help Desk',     'help@jvilledigital.example.com',   '04 555 0109', true, '2026-10-24'),
  ('d1000000-0000-0000-0000-000000000010', 'Capital Youth Stage',                'stage@cys.example.com',            '04 555 0110', true, '2026-10-24'),
  -- No consent yet: coordinators see it ("no consent yet"), support workers don't
  ('d1000000-0000-0000-0000-000000000011', 'Miramar Clay Studio',                'clay@miramarclay.example.com',     '04 555 0111', false, null),
  ('d1000000-0000-0000-0000-000000000012', 'Lyall Bay Walkers',                  'walk@lbwalkers.example.com',       null,          true, '2026-09-01');

---------------------------------------------------------------------------------------------------
-- Activities. Suburbs are looked up by name (their ids are random, made in the reference data migration).
insert into public.activities (
  activity_id, provider_id, name, description, suburb_id, bus_routes, walk_from_stop_minutes,
  joining, group_size, support_worker_policy, staff_support, staff_experience,
  physical_demand, physical_notes, sensory_load, sensory_notes,
  cost_per_session, min_age, max_age, step_free_access, transport_options,
  not_in_listing, check_method, checked_at, archived_at
)
select v.activity_id::uuid, v.provider_id::uuid, v.name, v.description, s.suburb_id, v.bus_routes, v.walk,
       v.joining::public.joining, v.group_size::public.group_size,
       v.swp::public.support_worker_policy, v.staff::public.staff_support, v.exp::boolean,
       v.phys::public.level, v.phys_notes, v.sens::public.level, v.sens_notes,
       v.cost::numeric, v.min_age::integer, v.max_age::integer, v.step_free::boolean,
       v.transport::public.activity_transport[],
       v.not_in_listing, v.check_method::public.check_method, v.checked_at::date, v.archived_at::timestamptz
from (values
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
   'Seated yoga', 'Slow, chair-based yoga for all bodies. Beginners welcome.', 'Newtown', '1, 3', 3,
   'drop_in', 'under_10', 'attend_free', 'staff_can_assist', 'true',
   'low', 'Mostly seated, gentle stretches', 'low', 'Quiet hall, soft music',
   '5', '16', null, 'true', '{bus_route,mobility_parking}',
   'Whether mats and chairs are provided', 'provider_website', '2026-10-20', null),

  ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002',
   'Community garden working bee', 'Weeding, planting and harvesting with a friendly crew. Tea afterwards.', 'Island Bay', '1', 8,
   'drop_in', '10_to_20', 'attend_free', 'bring_own_support', null,
   'medium', 'Bending, kneeling and carrying light tools', 'low', 'Outdoors, quiet street',
   '0', null, null, 'false', '{bus_route}',
   'Whether there is a toilet on site', 'phone_call', '2026-10-20', null),

  ('e1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003',
   'Evening drumming circle', 'Hand drums and percussion, no experience needed. Drums supplied.', 'Te Aro', '1, 2, 3', 4,
   'drop_in', '10_to_20', 'attend_free', 'staff_can_assist', 'true',
   'low', 'Seated, uses arms and hands', 'high', 'Loud: many drums in one room',
   '8', '18', null, 'true', '{bus_route}',
   'Whether ear protection is available', 'email', '2026-10-21', null),

  ('e1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000004',
   'Board games afternoon', 'Casual board and card games. Hosts teach the rules.', 'Kilbirnie', '2', 2,
   'drop_in', '10_to_20', 'attend_free', 'staff_can_assist', 'false',
   'low', 'Seated at tables', 'medium', 'Chatty room, some cheering',
   '0', null, null, 'true', '{bus_route,mobility_parking}',
   'How busy it gets in school holidays', 'visited_in_person', '2026-10-21', null),

  ('e1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000005',
   'Cooking basics (8-week course)', 'Learn simple, cheap meals. Eat what you cook.', 'Petone', '81, 83', 5,
   'term_enrolment', 'under_10', 'attend_with_charge', 'staff_can_assist', 'true',
   'medium', 'Standing at benches for up to 2 hours', 'medium', 'Kitchen noise, hot stoves',
   '25', '18', null, 'true', '{bus_route,door_drop_off}',
   'Whether dietary needs are catered for', 'phone_call', '2026-10-22', null),

  ('e1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000006',
   'Inclusive swim session', 'Lane time and a pool hoist for disabled swimmers and their supporters.', 'Kilbirnie', '2, 3', 4,
   'book_ahead', '10_to_20', 'attend_free', 'staff_can_assist', 'true',
   'medium', 'Swimming or water walking at own pace', 'high', 'Echoey pool hall, bright lights',
   '6', null, null, 'true', '{bus_route,mobility_parking,door_drop_off}',
   'Whether changing rooms have a hoist', 'provider_website', '2026-10-22', null),

  ('e1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000007',
   'Community kapa haka', 'Waiata and haka practice. Everyone welcome, no te reo needed to start.', 'Naenae', '110', 6,
   'term_enrolment', 'over_20', 'attend_free', 'bring_own_support', null,
   'medium', 'Standing, actions and movement', 'high', 'Loud singing and haka',
   '0', null, null, null, '{bus_route}',
   'Whether the hall is step-free', 'email', '2026-10-23', null),

  ('e1000000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000008',
   'Volunteer dog walking', 'Walk rescue dogs on local tracks with a volunteer buddy.', 'Karori', '2', 10,
   'book_ahead', 'under_10', null, 'bring_own_support', null,
   'high', 'Hilly tracks, dogs can pull', 'low', 'Outdoors, quiet',
   '0', '16', null, 'false', '{bus_route}',
   'Whether support workers can walk alongside', 'phone_call', '2026-10-23', null),

  ('e1000000-0000-0000-0000-000000000009', 'd1000000-0000-0000-0000-000000000009',
   'Digital help drop-in', 'Help with phones, email and online forms, one-on-one with a volunteer.', 'Johnsonville', '1', 2,
   'drop_in', 'under_10', 'attend_free', 'staff_can_assist', 'false',
   'low', 'Seated', 'low', 'Library meeting room',
   '0', '50', null, 'true', '{bus_route,mobility_parking}',
   'Whether devices are available to borrow', 'provider_website', '2026-10-24', null),

  ('e1000000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000010',
   'Youth theatre workshop', 'Games, improv and short scenes for young adults.', 'Wellington Central', '1, 2, 3, 7', 3,
   'waitlist', '10_to_20', 'attend_free', 'staff_can_assist', 'true',
   'medium', 'Moving around the stage', 'medium', 'Some shouting and clapping games',
   '15', '16', '25', 'true', '{bus_route}',
   'How long the waitlist is', 'email', '2026-10-24', null),

  ('e1000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000011',
   'Pottery taster', 'Hand-building with clay in a small group.', 'Miramar', '2', 5,
   'book_ahead', 'under_10', 'attend_free', 'staff_can_assist', null,
   'low', 'Seated at a table', 'low', 'Quiet studio',
   '20', '18', null, 'true', '{bus_route,mobility_parking}',
   'Whether clay costs extra', 'provider_website', '2026-10-25', null),

  ('e1000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000012',
   'Beach walk group', 'Flat walk along the bay. Stopped running in September.', 'Lyall Bay', '3', 2,
   'drop_in', '10_to_20', 'attend_free', 'bring_own_support', null,
   'low', 'Flat path, 45 minutes', 'low', 'Outdoors, can be windy',
   '0', null, null, 'true', '{bus_route}',
   null, 'phone_call', '2026-09-15', '2026-10-01 09:00+13')
) as v(activity_id, provider_id, name, description, suburb, bus_routes, walk,
       joining, group_size, swp, staff, exp,
       phys, phys_notes, sens, sens_notes,
       cost, min_age, max_age, step_free, transport,
       not_in_listing, check_method, checked_at, archived_at)
join public.suburbs s on s.name = v.suburb;

---------------------------------------------------------------------------------------------------
-- Sessions. Slots by start time: morning before 12:00, afternoon 12:00-16:59, evening 17:00 or later.
insert into public.activity_sessions (activity_id, day, start_time, end_time) values
  ('e1000000-0000-0000-0000-000000000001', 'tue', '10:00', '11:00'),
  ('e1000000-0000-0000-0000-000000000001', 'fri', '10:00', '11:00'),
  ('e1000000-0000-0000-0000-000000000002', 'sat', '09:30', '12:00'),
  ('e1000000-0000-0000-0000-000000000003', 'wed', '18:00', '19:30'),
  ('e1000000-0000-0000-0000-000000000004', 'fri', '13:00', '15:00'),
  ('e1000000-0000-0000-0000-000000000005', 'mon', '17:30', '19:30'),
  ('e1000000-0000-0000-0000-000000000006', 'sun', '14:00', '15:00'),
  ('e1000000-0000-0000-0000-000000000006', 'wed', '11:00', '12:00'),
  ('e1000000-0000-0000-0000-000000000007', 'thu', '18:30', '20:00'),
  ('e1000000-0000-0000-0000-000000000008', 'wed', '10:00', '11:30'),
  ('e1000000-0000-0000-0000-000000000009', 'tue', '13:30', '15:00'),
  ('e1000000-0000-0000-0000-000000000010', 'sat', '10:00', '12:00'),
  ('e1000000-0000-0000-0000-000000000011', 'thu', '13:00', '15:00'),
  ('e1000000-0000-0000-0000-000000000012', 'sun', '09:00', '09:45');

---------------------------------------------------------------------------------------------------
-- Tags, looked up by name
insert into public.activity_tags (activity_id, tag_id)
select v.activity_id::uuid, t.tag_id
from (values
  ('e1000000-0000-0000-0000-000000000001', 'Sport and fitness'),
  ('e1000000-0000-0000-0000-000000000002', 'Gardening'),
  ('e1000000-0000-0000-0000-000000000002', 'Outdoors and nature'),
  ('e1000000-0000-0000-0000-000000000002', 'Volunteering'),
  ('e1000000-0000-0000-0000-000000000003', 'Music'),
  ('e1000000-0000-0000-0000-000000000004', 'Social and board games'),
  ('e1000000-0000-0000-0000-000000000005', 'Cooking'),
  ('e1000000-0000-0000-0000-000000000005', 'Learning and classes'),
  ('e1000000-0000-0000-0000-000000000006', 'Swimming and water'),
  ('e1000000-0000-0000-0000-000000000007', 'Culture and te ao Māori'),
  ('e1000000-0000-0000-0000-000000000007', 'Music'),
  ('e1000000-0000-0000-0000-000000000007', 'Dance'),
  ('e1000000-0000-0000-0000-000000000008', 'Animals'),
  ('e1000000-0000-0000-0000-000000000008', 'Walking'),
  ('e1000000-0000-0000-0000-000000000008', 'Volunteering'),
  ('e1000000-0000-0000-0000-000000000009', 'Technology'),
  ('e1000000-0000-0000-0000-000000000009', 'Learning and classes'),
  ('e1000000-0000-0000-0000-000000000010', 'Drama and performance'),
  ('e1000000-0000-0000-0000-000000000011', 'Art and craft'),
  ('e1000000-0000-0000-0000-000000000012', 'Walking'),
  ('e1000000-0000-0000-0000-000000000012', 'Outdoors and nature')
) as v(activity_id, tag_name)
join public.tags t on t.name = v.tag_name;
