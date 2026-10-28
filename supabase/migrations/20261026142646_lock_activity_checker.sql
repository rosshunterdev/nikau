-- SCRUM-82: lock activities.checked_by (follow-up from the SCRUM-76 review, PR #11).
-- checked_by / checked_at record who last checked an activity's details with the provider.
-- Same rule as reviewed_by on clients: recording a new check date = you did the check.
-- Any other edit keeps the previous checker.

create function public.stamp_activity_checker()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- Skipped when auth.uid() is empty (migrations, seed, service role).
  -- Skipped inside other triggers, e.g. when a staff member is deleted and
  -- Postgres sets their ids to NULL; overwriting that would break the clean-up.
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return new;
  end if;
    if tg_op = 'INSERT' or new.checked_at is distinct from old.checked_at then
        -- A check date was recorded (or cleared)
        new.checked_by := case when new.checked_at is null then null else auth.uid() end;
    else
        -- No new check: keep whoever checked last time
        new.checked_by := old.checked_by;
    end if;
  return new;
end;
$$;

create trigger activities_stamp_checker
  before insert or update on public.activities
  for each row execute function public.stamp_activity_checker();