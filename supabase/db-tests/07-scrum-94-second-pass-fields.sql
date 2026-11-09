-- SCRUM-94 tests: the second-pass fields are saved with the client, and edited like the rest.
-- Run after `supabase db reset`. Rolled back at the end.

begin;

-- Cora (coordinator, Test Org)
set local role authenticated;
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

do $$
declare
  new_client uuid;
  saved public.clients;
begin
  -- 1. Creating a client keeps all five fields
  new_client := public.create_client_full(
    '{"preferred_name": "Second pass test", "support_needed": "own", "max_physical_demand": "low",
      "max_sensory_load": "low", "goals": ["Meet new people", "Get fitter"],
      "participation_notes": "Likes to watch first", "physical_notes": "Walks about 15 min",
      "sensory_notes": "Finds crowds hard", "travel_range_minutes": 30}'
  );
  select * into saved from public.clients where client_id = new_client;
  assert saved.goals = array['Meet new people', 'Get fitter'], format('1. goals: %s', saved.goals);
  assert saved.participation_notes = 'Likes to watch first', '1. participation_notes not saved';
  assert saved.physical_notes = 'Walks about 15 min', '1. physical_notes not saved';
  assert saved.sensory_notes = 'Finds crowds hard', '1. sensory_notes not saved';
  assert saved.travel_range_minutes = 30, format('1. travel range: %s', saved.travel_range_minutes);

  -- 2. Editing another field leaves them alone
  perform public.update_client_full(new_client, '{"max_cost": 10}');
  select * into saved from public.clients where client_id = new_client;
  assert saved.goals = array['Meet new people', 'Get fitter'], format('2. goals changed: %s', saved.goals);
  assert saved.sensory_notes = 'Finds crowds hard', '2. sensory_notes changed';
  assert saved.travel_range_minutes = 30, '2. travel range changed';

  -- 3. Sending goals replaces the whole list; other fields can be changed too
  perform public.update_client_full(new_client, '{"goals": ["Learn to cook"], "travel_range_minutes": 45}');
  select * into saved from public.clients where client_id = new_client;
  assert saved.goals = array['Learn to cook'], format('3. goals not replaced: %s', saved.goals);
  assert saved.travel_range_minutes = 45, '3. travel range not changed';

  -- 4. Sending null clears a field; an empty list removes all goals
  perform public.update_client_full(new_client, '{"sensory_notes": null, "travel_range_minutes": null, "goals": []}');
  select * into saved from public.clients where client_id = new_client;
  assert saved.sensory_notes is null, '4. sensory_notes not cleared';
  assert saved.travel_range_minutes is null, '4. travel range not cleared';
  assert cardinality(saved.goals) = 0, format('4. goals not removed: %s', saved.goals);

  -- 5. The table's limits still apply: more than 5 goals, or a travel range of 0
  begin
    perform public.update_client_full(new_client, '{"goals": ["1", "2", "3", "4", "5", "6"]}');
    raise exception '5. six goals were saved';
  exception when check_violation then
    null;
  end;
  begin
    perform public.update_client_full(new_client, '{"travel_range_minutes": 0}');
    raise exception '5. a travel range of 0 was saved';
  exception when check_violation then
    null;
  end;

  raise notice 'SCRUM-94: all tests passed';
end $$;

rollback;
