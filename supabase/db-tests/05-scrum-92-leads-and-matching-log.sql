-- SCRUM-92 / SCRUM-85 tests: run after `supabase db reset`. Rolled back at the end.
-- Checks who can read matching requests, and that a saved lead can only point to
-- a matching request you made yourself (or to none, for a manual search).
-- Seed: Will's request 9000...0001 (Test Org). Cora logs her own request 9000...0099 below.

begin;

-- Cora (coordinator, Test Org)
set local role authenticated;
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

do $$
declare
  cora constant uuid := 'b0000000-0000-0000-0000-000000000001';
  test_org constant uuid := 'a0000000-0000-0000-0000-000000000001';
  wills_request constant uuid := '90000000-0000-0000-0000-000000000001';
  coras_request constant uuid := '90000000-0000-0000-0000-000000000099';
  alex constant uuid := 'c0000000-0000-0000-0000-000000000002';
  n integer;
begin
  -- 1. Cora reads Will's request: coordinators see their whole organisation's history
  select count(*) into n from public.matching_log where request_id = wills_request;
  assert n = 1, format('1. Cora should see Will''s request, saw %s', n);

  -- 2. Cora logs a request of her own
  insert into public.matching_log (request_id, result, organisation_id, requested_by)
  values (coras_request, 'success', test_org, cora);
  select count(*) into n from public.matching_log;
  assert n = 2, format('2. Cora should now see 2 requests, saw %s', n);

  -- 3. Cora can't link a lead to Will's request, even though she can read it
  begin
    insert into public.leads (client_id, activity_id, saved_by, source, match_request_id)
    values (alex, 'e1000000-0000-0000-0000-000000000001', cora, 'ai_match', wills_request);
    raise exception '3. Cora linked a lead to Will''s request';
  exception when insufficient_privilege then
    null;  -- blocked, as expected
  end;

  -- 4. Cora can link a lead to her own request
  insert into public.leads (client_id, activity_id, saved_by, source, match_request_id)
  values (alex, 'e1000000-0000-0000-0000-000000000001', cora, 'ai_match', coras_request);

  -- 5. A manual search lead with no request is fine
  insert into public.leads (client_id, activity_id, saved_by, source, match_request_id)
  values (alex, 'e1000000-0000-0000-0000-000000000002', cora, 'manual_search', null);

  -- 6. A made-up request id is blocked
  begin
    insert into public.leads (client_id, activity_id, saved_by, source, match_request_id)
    values (alex, 'e1000000-0000-0000-0000-000000000003', cora, 'ai_match', gen_random_uuid());
    raise exception '6. Cora linked a lead to a request that doesn''t exist';
  exception when insufficient_privilege then
    null;
  end;

  -- 7. A manual search lead can't point to a request (SCRUM-85 check constraint)
  begin
    insert into public.leads (client_id, activity_id, saved_by, source, match_request_id)
    values (alex, 'e1000000-0000-0000-0000-000000000003', cora, 'manual_search', coras_request);
    raise exception '7. A manual_search lead was linked to a request';
  exception when check_violation then
    null;
  end;
end $$;

-- Will (support worker, Test Org, assigned to Sam)
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000002", "role": "authenticated"}';

do $$
declare
  will constant uuid := 'b0000000-0000-0000-0000-000000000002';
  wills_request constant uuid := '90000000-0000-0000-0000-000000000001';
  coras_request constant uuid := '90000000-0000-0000-0000-000000000099';
  sam constant uuid := 'c0000000-0000-0000-0000-000000000001';
  n integer;
begin
  -- 8. Will only sees his own request, not Cora's
  select count(*) into n from public.matching_log;
  assert n = 1, format('8. Will should see 1 request, saw %s', n);
  select count(*) into n from public.matching_log where request_id = coras_request;
  assert n = 0, format('8. Will can see Cora''s request');

  -- 9. Will can link a lead to his own request
  insert into public.leads (client_id, activity_id, saved_by, source, match_request_id)
  values (sam, 'e1000000-0000-0000-0000-000000000001', will, 'ai_match', wills_request);

  -- 10. Will can't link a lead to Cora's request
  begin
    insert into public.leads (client_id, activity_id, saved_by, source, match_request_id)
    values (sam, 'e1000000-0000-0000-0000-000000000002', will, 'ai_match', coras_request);
    raise exception '10. Will linked a lead to Cora''s request';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- Olive (coordinator, Other Org)
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000003", "role": "authenticated"}';

do $$
declare
  olive constant uuid := 'b0000000-0000-0000-0000-000000000003';
  wills_request constant uuid := '90000000-0000-0000-0000-000000000001';
  kiri constant uuid := 'c0000000-0000-0000-0000-000000000003';
  n integer;
begin
  -- 11. Olive sees no matching requests from Test Org
  select count(*) into n from public.matching_log;
  assert n = 0, format('11. Olive should see 0 requests, saw %s', n);

  -- 12. Olive can't link a lead to another organisation's request
  begin
    insert into public.leads (client_id, activity_id, saved_by, source, match_request_id)
    values (kiri, 'e1000000-0000-0000-0000-000000000001', olive, 'ai_match', wills_request);
    raise exception '12. Olive linked a lead to another organisation''s request';
  exception when insufficient_privilege then
    null;
  end;

  -- 13. Olive can't log a request for another organisation
  begin
    insert into public.matching_log (result, organisation_id, requested_by)
    values ('success', 'a0000000-0000-0000-0000-000000000001', olive);
    raise exception '13. Olive logged a request for another organisation';
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'SCRUM-92: all tests passed';
end $$;

rollback;
