-- SCRUM-82 tests: run against the local database after `supabase db reset`.
-- Everything runs in one transaction and is rolled back, so the seed data is untouched.
-- Each check raises an error if it fails; if you reach the end you'll see "SCRUM-82: all tests passed".

begin;

-- Pretend to be Cora (coordinator)
set local role authenticated;
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

do $$
declare
  cora constant uuid := 'b0000000-0000-0000-0000-000000000001';
  will constant uuid := 'b0000000-0000-0000-0000-000000000002';
  pottery constant uuid := 'e0000000-0000-0000-0000-000000000001';
  who uuid;
begin
  -- 1. Setting checked_at records Cora
  update public.activities set checked_at = current_date where activity_id = pottery;
  select checked_by into who from public.activities where activity_id = pottery;
  assert who = cora, format('1. expected Cora as checker, got %s', who);

  -- 2. Editing anything else keeps the previous checker
  update public.activities set description = 'Wheel and hand building' where activity_id = pottery;
  select checked_by into who from public.activities where activity_id = pottery;
  assert who = cora, format('2. checker changed on an unrelated edit: %s', who);

  -- 3. Setting checked_by to Will is ignored
  update public.activities set checked_by = will where activity_id = pottery;
  select checked_by into who from public.activities where activity_id = pottery;
  assert who = cora, format('3. checked_by was overwritten with %s', who);

  -- 4. Sending Will together with a new date still records Cora
  update public.activities set checked_at = current_date - 1, checked_by = will where activity_id = pottery;
  select checked_by into who from public.activities where activity_id = pottery;
  assert who = cora, format('4. expected Cora with a new date, got %s', who);

  -- 5. Clearing checked_at clears checked_by
  update public.activities set checked_at = null where activity_id = pottery;
  select checked_by into who from public.activities where activity_id = pottery;
  assert who is null, format('5. expected no checker after clearing the date, got %s', who);

  -- 6. A new activity with a check date records the creator, whatever checked_by says
  insert into public.activities (provider_id, name, created_by, checked_at, checked_by)
  values ('d0000000-0000-0000-0000-000000000001', 'SCRUM-82 test activity', cora, current_date, will)
  returning checked_by into who;
  assert who = cora, format('6. new activity checker should be Cora, got %s', who);

  -- Leave a known checker on the pottery class for the Will tests
  update public.activities set checked_at = current_date where activity_id = pottery;
end $$;

-- Now pretend to be Will (support worker)
set local request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000002", "role": "authenticated"}';

do $$
declare
  cora constant uuid := 'b0000000-0000-0000-0000-000000000001';
  will constant uuid := 'b0000000-0000-0000-0000-000000000002';
  pottery constant uuid := 'e0000000-0000-0000-0000-000000000001';
  who uuid;
  n integer;
begin
  -- 7. Will can't record a check at all: workers don't edit activities (RLS), so 0 rows change
  update public.activities set checked_at = current_date + 1, checked_by = will where activity_id = pottery;
  get diagnostics n = row_count;
  assert n = 0, format('7. Will updated %s activity row(s)', n);

  -- 8. Will still sees the activity, and the checker is still Cora
  select checked_by into who from public.activities where activity_id = pottery;
  assert who = cora, format('8. expected Cora as checker, got %s', who);
end $$;

-- 9. Nobody signed in (seed, migrations, service role): the trigger stays out of the way
reset role;
set local request.jwt.claims = '';

do $$
declare
  will constant uuid := 'b0000000-0000-0000-0000-000000000002';
  pottery constant uuid := 'e0000000-0000-0000-0000-000000000001';
  who uuid;
begin
  update public.activities set checked_by = will where activity_id = pottery;
  select checked_by into who from public.activities where activity_id = pottery;
  assert who = will, format('9. with nobody signed in checked_by should be left as sent, got %s', who);
  raise notice 'SCRUM-82: all tests passed';
end $$;

rollback;
