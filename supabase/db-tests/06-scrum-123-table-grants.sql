-- SCRUM-123 tests: signed-in staff can use every table (RLS then decides which rows),
-- signed-out visitors can't, and nobody can TRUNCATE (which would skip RLS).
-- Read-only checks; rolled back anyway.

begin;

do $$
declare
  t text;
  p text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    -- RLS must be on, because the grants below open every table
    assert (select rowsecurity from pg_tables where schemaname = 'public' and tablename = t),
      format('%s has RLS turned off', t);

    -- One privilege at a time: with a list, has_table_privilege is true if ANY of them is held
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      assert has_table_privilege('authenticated', format('public.%I', t), p),
        format('authenticated is missing %s on %s', upper(p), t);
    end loop;
    assert not has_table_privilege('authenticated', format('public.%I', t), 'truncate'),
      format('authenticated can TRUNCATE %s', t);
    assert not has_table_privilege('anon', format('public.%I', t), 'select, insert, update, delete, truncate'),
      format('anon has access to %s', t);
  end loop;

  raise notice 'SCRUM-123: all tests passed';
end $$;

rollback;
