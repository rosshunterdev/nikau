-- SCRUM-100 tests: both save functions lock the row they edit, and the coordinator
-- check still comes before the lock. Run after `supabase db reset`. Rolled back at the end.
-- (Two saves at once can't be tested in one session; these check the lock is in place.)

begin;

-- 1. Both edit functions lock the row they load ("for update" on the select itself,
-- not just in a comment)
do $$
declare
  pair text[];
begin
  foreach pair slice 1 in array array[
    ['update_client_full', 'where client_id = p_client_id for update'],
    ['update_activity_full', 'where activity_id = p_activity_id for update']
  ] loop
    assert (
      select pg_get_functiondef(p.oid) ilike '%' || pair[2] || '%'
      from pg_proc p
      join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname = pair[1]
    ), format('1. %s does not lock the row (%s)', pair[1], pair[2]);
  end loop;
end $$;

-- Cora (coordinator)
set local role authenticated;
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

do $$
declare
  pottery constant uuid := 'e0000000-0000-0000-0000-000000000001';
  saved_name text;
begin
  -- 2. Cora can still edit an activity
  perform public.update_activity_full(pottery, '{"name": "Pottery locked edit"}');
  select name into saved_name from public.activities where activity_id = pottery;
  assert saved_name = 'Pottery locked edit', format('2. name not saved: %s', saved_name);

  -- 3. An activity that doesn't exist is still "not found"
  begin
    perform public.update_activity_full('00000000-0000-0000-0000-000000000000', '{"name": "Nope"}');
    raise exception '3. Edited an activity that does not exist';
  exception when no_data_found then
    null;
  end;
end $$;

-- Will (support worker)
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000002", "role": "authenticated"}';

do $$
begin
  -- 4. Will gets "only coordinators", not "not found", now the lock only finds editable rows
  begin
    perform public.update_activity_full('e0000000-0000-0000-0000-000000000001', '{"name": "Nope"}');
    raise exception '4. Will edited an activity';
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'SCRUM-100: all tests passed';
end $$;

rollback;
