-- Demo organisation and staff profiles for the HOSTED project (SCRUM-95).
-- Not run automatically: someone runs it once, by hand, in the dashboard's SQL editor.
--
-- Before running it:
--   1. `supabase db push` has created the tables.
--   2. Two logins exist: Authentication > Users > Add user > Create new user,
--      "Auto Confirm User" ticked, with exactly these emails and strong passwords
--      kept in a password manager:
--        demo.coordinator@example.com
--        demo.worker@example.com
--
-- No passwords in this file: Supabase Auth keeps them.
-- All or nothing: if either login is missing, nothing is created.

do $$
declare
  demo_org uuid;
  created integer;
begin
  insert into public.organisations (name)
  values ('Nīkau Demo')
  returning organisation_id into demo_org;

  insert into public.profiles (user_id, first_name, last_name, role, organisation_id)
  select u.id, p.first_name, p.last_name, p.role::public.user_role, demo_org
  from (values
    ('demo.coordinator@example.com', 'Demo', 'Coordinator', 'coordinator'),
    ('demo.worker@example.com',      'Demo', 'Worker',      'support_worker')
  ) as p (email, first_name, last_name, role)
  join auth.users u on lower(u.email) = p.email;

  get diagnostics created = row_count;
  if created <> 2 then
    raise exception 'Found % of the 2 demo logins. Create both in Authentication first, with exactly these emails.', created;
  end if;

  raise notice 'Created the Nīkau Demo organisation with a coordinator and a support worker';
end $$;
