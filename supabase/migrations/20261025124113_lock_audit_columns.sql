-- SCRUM-76: lock the audit columns (follow-ups Q4, Q5, Q7 from SCRUM-61).
-- 1. updated_by is always the person making the change (clients, activities)
-- 2. reviewed_by is set only when a new review date is recorded (clients)
-- 3. activities.created_by can't be changed, same as clients.created_by
-- 4. A saved lead can only link to your own matching request

---------------------------------------------------------------------------------------------------------------
-- 1. updated_by: whatever the request sends, the database records who actually made the change.
-- Skipped when auth.uid() is empty (migrations, seed, service role).
-- Skipped inside other triggers (pg_trigger_depth() > 1), e.g. when a staff member is deleted
-- and Postgres sets their ids to NULL; overwriting that would break the clean-up.
create function public.stamp_updated_by()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1 and auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger clients_stamp_updated_by
  before insert or update on public.clients
  for each row execute function public.stamp_updated_by();

create trigger activities_stamp_updated_by
  before insert or update on public.activities
  for each row execute function public.stamp_updated_by();

---------------------------------------------------------------------------------------------------------------
-- 2. reviewed_by: only changes when last_reviewed_with_client changes.
-- Recording a new review date = you did the review. Any other edit keeps the old reviewer,
-- so nobody can change who reviewed without recording a new review.
create function public.stamp_client_reviewer()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' or new.last_reviewed_with_client is distinct from old.last_reviewed_with_client then
    -- A review date was recorded (or cleared)
    new.reviewed_by := case when new.last_reviewed_with_client is null then null else auth.uid() end;
  else
    -- No new review: keep whoever reviewed last time
    new.reviewed_by := old.reviewed_by;
  end if;
  return new;
end;
$$;

create trigger clients_stamp_reviewer
  before insert or update on public.clients
  for each row execute function public.stamp_client_reviewer();

---------------------------------------------------------------------------------------------------------------
-- 3. created_by on activities: reuse the clients rule. The function only looks at created_by,
-- so give it a general name. Renaming doesn't affect the existing clients trigger.
alter function public.keep_client_creator() rename to keep_creator;

create trigger activities_keep_creator
  before update on public.activities
  for each row execute function public.keep_creator();

---------------------------------------------------------------------------------------------------------------
-- 4. Leads: match_request_id must be empty (manual search) or one of your own AI requests.
-- The exists() runs under the matching_log policy, which only shows your own requests,
-- so someone else's request id simply isn't found.
alter policy "Staff save leads for permitted clients"
on public.leads
with check (
  public.can_see_client(client_id)
  and saved_by = auth.uid()
  and exists (select 1 from public.activities a where a.activity_id = leads.activity_id)
  and (
    match_request_id is null
    or exists (select 1 from public.matching_log m where m.request_id = leads.match_request_id)
  )
);