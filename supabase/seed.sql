-- LOCAL TEST DATA ONLY. Runs automatically on `supabase db reset`.
-- Never pushed to the hosted project. All people and passwords are fake.

-- Two organisations, to prove they can't see each other's clients
insert into public.organisations (organisation_id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Test Org'),
  ('a0000000-0000-0000-0000-000000000002', 'Other Org');

-- Three login accounts (password for all: password123)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from (values
  ('b0000000-0000-0000-0000-000000000001'::uuid, 'cora@test.nikau'),
  ('b0000000-0000-0000-0000-000000000002'::uuid, 'will@test.nikau'),
  ('b0000000-0000-0000-0000-000000000003'::uuid, 'olive@other.nikau')
) as u (id, email);

-- Email sign-in also needs an identity row per user
insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now()
from auth.users u;

-- Their staff profiles: role and organisation
insert into public.profiles (user_id, first_name, last_name, role, organisation_id) values
  ('b0000000-0000-0000-0000-000000000001', 'Cora',  'Coordinator', 'coordinator',    'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'Will',  'Worker',      'support_worker', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000003', 'Olive', 'Other',       'coordinator',    'a0000000-0000-0000-0000-000000000002');

-- Three clients
insert into public.clients (client_id, organisation_id, preferred_name, created_by) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Sam',  'b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Alex', 'b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Kiri', 'b0000000-0000-0000-0000-000000000003');

-- Only Sam is assigned to Will
insert into public.client_assignments (client_id, user_id, assigned_by) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001');

-- One provider and one activity in the shared catalogue
insert into public.providers (provider_id, name, consent_given, consent_date) values
  ('d0000000-0000-0000-0000-000000000001', 'Wellington Community Arts', true, '2026-10-01');

insert into public.activities (provider_id, name, physical_demand, cost_per_session) values
  ('d0000000-0000-0000-0000-000000000001', 'Pottery for beginners', 'low', 15.00);