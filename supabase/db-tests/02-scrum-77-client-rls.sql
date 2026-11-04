-- SCRUM-77 tests: run after `supabase db reset`. Rolled back at the end.
-- Checks the clients policies: coordinators see and edit their whole organisation,
-- support workers only their assigned clients, and nobody sees another organisation.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
do $$
declare
  n integer;
begin
  -- 1. Both clients policies now use the shared helper
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'clients'
    and policyname in ('Staff see permitted clients', 'Staff edit permitted clients')
    and qual like '%can_see_client%';
  assert n = 2, format('1. expected 2 policies using can_see_client, found %s', n);

  -- 2. Cora sees Sam and Alex, not Kiri
  select count(*) into n from public.clients;
  assert n = 2, format('2. Cora should see 2 clients, saw %s', n);

  -- 3. Cora can edit Alex (not assigned, but she is a coordinator)
  update public.clients set preferred_name = 'Alexa' where client_id = 'c0000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 1, format('3. Cora should edit Alex, changed %s row(s)', n);

  -- 4. Cora can't edit Kiri (other organisation)
  update public.clients set preferred_name = 'Nope' where client_id = 'c0000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  assert n = 0, format('4. Cora changed %s client(s) in another organisation', n);

  -- 5. Cora can't move Alex to another organisation (with check)
  begin
    update public.clients set organisation_id = 'a0000000-0000-0000-0000-000000000002'
    where client_id = 'c0000000-0000-0000-0000-000000000002';
    raise exception '5. Alex was moved to another organisation';
  exception when insufficient_privilege then
    null;  -- blocked, as expected
  end;
end $$;
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000002", "role": "authenticated"}';
do $$
declare
  n integer;
begin
  -- 6. Will sees only Sam
  select count(*) into n from public.clients;
  assert n = 1, format('6. Will should see 1 client, saw %s', n);
  -- 7. Will can edit Sam
  update public.clients set preferred_name = 'Sammy' where client_id = 'c0000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 1, format('7. Will should edit Sam, changed %s row(s)', n);
  -- 8. Will can't edit Alex
  update public.clients set preferred_name = 'Nope' where client_id = 'c0000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, format('8. Will changed Alex (%s row(s))', n);
end $$;
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000003", "role": "authenticated"}';
do $$
declare
  n integer;
begin
  -- 9. Olive sees only Kiri
  select count(*) into n from public.clients;
  assert n = 1, format('9. Olive should see 1 client, saw %s', n);
  raise notice 'SCRUM-77: all tests passed';
end $$;
rollback;
