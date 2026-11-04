-- SCRUM-88 tests: run after `supabase db reset`. Rolled back at the end.
-- Checks that create_activity_full and update_activity_full save everything or nothing,
-- take the creator from the sign-in, keep the SCRUM-82 checker rule, and follow RLS.

begin;

-- Cora (coordinator)
set local role authenticated;
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

do $$
declare
  cora     constant uuid := 'b0000000-0000-0000-0000-000000000001';
  will     constant uuid := 'b0000000-0000-0000-0000-000000000002';
  provider constant uuid := 'd0000000-0000-0000-0000-000000000001';
  pottery  constant uuid := 'e0000000-0000-0000-0000-000000000001';
  bad_tag  constant uuid := '00000000-0000-0000-0000-000000000000';
  tag uuid;
  new_id uuid;
  n integer;
  before_count integer;
  nm text;
  creator uuid;
  checker uuid;
begin
  select tag_id into tag from public.tags order by name limit 1;

  -- 1. Create: activity, tag and session saved; duplicates dropped;
  --    creator from the sign-in, and checked_by set by the SCRUM-82 trigger
  new_id := public.create_activity_full(
    jsonb_build_object('provider_id', provider, 'name', 'Test swim',
                       'checked_at', current_date, 'created_by', will, 'checked_by', will),
    array[tag, tag],
    '[{"day": "wed", "start_time": "10:00", "end_time": "11:00"},
      {"day": "wed", "start_time": "10:00", "end_time": "11:00"}]');
  select created_by, checked_by into creator, checker from public.activities where activity_id = new_id;
  assert creator = cora, format('1. creator should be Cora, got %s', creator);
  assert checker = cora, format('1. checker should be Cora, got %s', checker);
  select count(*) into n from public.activity_tags where activity_id = new_id;
  assert n = 1, format('1. expected 1 tag, got %s', n);
  select count(*) into n from public.activity_sessions where activity_id = new_id;
  assert n = 1, format('1. expected 1 session, got %s', n);

  -- 2. Create with a bad tag: nothing saved at all
  select count(*) into before_count from public.activities;
  begin
    perform public.create_activity_full(
      jsonb_build_object('provider_id', provider, 'name', 'Bad'), array[bad_tag]);
    raise exception '2. a bad tag was accepted';
  exception when foreign_key_violation then
    null;
  end;
  select count(*) into n from public.activities;
  assert n = before_count, '2. an activity was saved even though its tag was bad';

  -- 3. Create with a session that ends before it starts: nothing saved
  begin
    perform public.create_activity_full(
      jsonb_build_object('provider_id', provider, 'name', 'Bad times'), '{}',
      '[{"day": "mon", "start_time": "11:00", "end_time": "10:00"}]');
    raise exception '3. a backwards session was accepted';
  exception when check_violation then
    null;
  end;
  select count(*) into n from public.activities;
  assert n = before_count, '3. an activity was saved even though its session was invalid';

  -- 4. Edit: only the sent field changes
  perform public.update_activity_full(pottery, '{"name": "Pottery 101"}');
  select name into nm from public.activities where activity_id = pottery;
  assert nm = 'Pottery 101', format('4. name should be Pottery 101, got %s', nm);
  select count(*) into n from public.activity_sessions where activity_id = pottery;
  assert n = 1, '4. sessions changed when they were not sent';

  -- 5. Edit: sending sessions replaces them and leaves tags alone
  perform public.update_activity_full(pottery, '{}', null,
    '[{"day": "sat", "start_time": "09:00", "end_time": "10:00"},
      {"day": "sun", "start_time": "09:00", "end_time": "10:00"}]');
  select count(*) into n from public.activity_sessions where activity_id = pottery;
  assert n = 2, format('5. expected 2 sessions, got %s', n);
  select count(*) into n from public.activity_tags where activity_id = pottery;
  assert n = 1, '5. tags changed when they were not sent';

  -- 6. Edit with a bad tag: the name change and the old tags are both kept
  begin
    perform public.update_activity_full(pottery, '{"name": "Broken"}', array[bad_tag]);
    raise exception '6. a bad tag was accepted';
  exception when foreign_key_violation then
    null;
  end;
  select name into nm from public.activities where activity_id = pottery;
  assert nm = 'Pottery 101', format('6. name changed despite the failure: %s', nm);
  select count(*) into n from public.activity_tags where activity_id = pottery;
  assert n = 1, '6. tags were lost when the edit failed';
end $$;

-- Will (support worker)
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000002", "role": "authenticated"}';

do $$
declare
  provider constant uuid := 'd0000000-0000-0000-0000-000000000001';
  pottery  constant uuid := 'e0000000-0000-0000-0000-000000000001';
  n integer;
begin
  -- 7. Will can't create an activity (RLS)
  begin
    perform public.create_activity_full(jsonb_build_object('provider_id', provider, 'name', 'Nope'));
    raise exception '7. Will created an activity';
  exception when insufficient_privilege then
    null;
  end;

  -- 8. Will can see Pottery but can't edit it
  begin
    perform public.update_activity_full(pottery, '{"name": "Nope"}');
    raise exception '8. Will edited an activity';
  exception when insufficient_privilege then
    null;
  end;

  -- 9. Will can't wipe Pottery's tags by sending only tags
  begin
    perform public.update_activity_full(pottery, '{}', '{}');
  exception when insufficient_privilege then
    null;  -- blocked outright is fine too
  end;
  select count(*) into n from public.activity_tags where activity_id = pottery;
  assert n = 1, format('9. Will removed tags (now %s)', n);

  raise notice 'SCRUM-88: all tests passed';
end $$;

rollback;
