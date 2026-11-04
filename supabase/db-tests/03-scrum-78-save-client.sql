-- SCRUM-78 tests: run after `supabase db reset`. Rolled back at the end.
-- Checks that create_client_full and update_client_full save everything or nothing,
-- take the organisation and creator from the sign-in, and still follow RLS.

begin;

-- Will (support worker, Test Org, assigned to Sam only)
set local role authenticated;
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000002", "role": "authenticated"}';

do $$
declare
  will   constant uuid := 'b0000000-0000-0000-0000-000000000002';
  sam    constant uuid := 'c0000000-0000-0000-0000-000000000001';
  alex   constant uuid := 'c0000000-0000-0000-0000-000000000002';
  test_org  constant uuid := 'a0000000-0000-0000-0000-000000000001';
  other_org constant uuid := 'a0000000-0000-0000-0000-000000000002';
  bad_tag   constant uuid := '00000000-0000-0000-0000-000000000000';
  tag uuid;
  new_id uuid;
  n integer;
  before_count integer;
  nm text;
  org uuid;
  creator uuid;
begin
  select tag_id into tag from public.tags order by name limit 1;

  -- 1. Create: client, interest and availability saved; duplicates dropped;
  --    organisation and creator come from the sign-in, not the request
  new_id := public.create_client_full(
    jsonb_build_object(
      'preferred_name', 'Test client', 'support_needed', 'own',
      'max_physical_demand', 'low', 'max_sensory_load', 'low',
      'organisation_id', other_org, 'created_by', 'b0000000-0000-0000-0000-000000000001'),
    array[tag, tag],
    '[{"day": "mon", "slot": "morning"}, {"day": "mon", "slot": "morning"}]');
  select organisation_id, created_by into org, creator from public.clients where client_id = new_id;
  assert org = test_org, format('1. organisation should be Test Org, got %s', org);
  assert creator = will, format('1. creator should be Will, got %s', creator);
  select count(*) into n from public.client_interests where client_id = new_id;
  assert n = 1, format('1. expected 1 interest, got %s', n);
  select count(*) into n from public.client_availability where client_id = new_id;
  assert n = 1, format('1. expected 1 availability slot, got %s', n);

  -- 2. Create: the creator is assigned (so Will can see his new client)
  select count(*) into n from public.client_assignments where client_id = new_id and user_id = will;
  assert n = 1, '2. creator was not assigned';

  -- 3. Create with a bad tag: nothing saved at all
  select count(*) into before_count from public.clients;
  begin
    perform public.create_client_full(
      '{"preferred_name": "Bad", "support_needed": "own", "max_physical_demand": "low", "max_sensory_load": "low"}',
      array[bad_tag]);
    raise exception '3. a bad tag was accepted';
  exception when foreign_key_violation then
    null;  -- rejected, as expected
  end;
  select count(*) into n from public.clients;
  assert n = before_count, '3. a client was saved even though its tag was bad';

  -- 4. Edit: only the sent field changes; a faked organisation is ignored
  perform public.update_client_full(sam,
    jsonb_build_object('preferred_name', 'Sammy', 'organisation_id', other_org));
  select preferred_name, organisation_id into nm, org from public.clients where client_id = sam;
  assert nm = 'Sammy', format('4. name should be Sammy, got %s', nm);
  assert org = test_org, '4. organisation was changed';

  -- 5. Edit: sending interests replaces them and leaves availability alone
  insert into public.client_availability (client_id, day, slot) values (sam, 'tue', 'evening');
  perform public.update_client_full(sam, '{}', array[tag]);
  select count(*) into n from public.client_interests where client_id = sam;
  assert n = 1, format('5. expected 1 interest, got %s', n);
  select count(*) into n from public.client_availability where client_id = sam;
  assert n = 1, '5. availability changed when it was not sent';

  -- 6. Edit with a bad tag: the name change and the old interests are both kept as they were
  begin
    perform public.update_client_full(sam, '{"preferred_name": "Broken"}', array[bad_tag]);
    raise exception '6. a bad tag was accepted';
  exception when foreign_key_violation then
    null;
  end;
  select preferred_name into nm from public.clients where client_id = sam;
  assert nm = 'Sammy', format('6. name changed despite the failure: %s', nm);
  select count(*) into n from public.client_interests where client_id = sam;
  assert n = 1, '6. interests were lost when the edit failed';

  -- 7. Will can't edit Alex (not assigned): "not found"
  begin
    perform public.update_client_full(alex, '{"preferred_name": "Nope"}');
    raise exception '7. Will edited Alex';
  exception when no_data_found then
    null;
  end;
end $$;

-- Cora (coordinator, Test Org)
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

do $$
declare
  alex constant uuid := 'c0000000-0000-0000-0000-000000000002';
  nm text;
begin
  -- 8. Cora can edit Alex (not assigned, but she's a coordinator)
  perform public.update_client_full(alex, '{"preferred_name": "Alexa"}');
  select preferred_name into nm from public.clients where client_id = alex;
  assert nm = 'Alexa', format('8. expected Alexa, got %s', nm);
end $$;

-- Olive (coordinator, Other Org)
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000003", "role": "authenticated"}';

do $$
declare
  sam constant uuid := 'c0000000-0000-0000-0000-000000000001';
begin
  -- 9. Olive can't edit a client in another organisation: "not found"
  begin
    perform public.update_client_full(sam, '{"preferred_name": "Nope"}');
    raise exception '9. Olive edited a client in another organisation';
  exception when no_data_found then
    null;
  end;
  raise notice 'SCRUM-78: all tests passed';
end $$;

rollback;
