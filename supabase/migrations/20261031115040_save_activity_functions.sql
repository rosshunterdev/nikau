-- SCRUM-88: save an activity in one database function (same pattern as SCRUM-78 for clients).
-- Follow-up from the SCRUM-65 review (#15, point 2): the activity, its tags and its
-- sessions are saved in one transaction, so a failure partway leaves nothing behind.
-- Both functions run as the signed-in user (security invoker), so RLS still applies:
-- only coordinators can add or edit activities, tags and sessions.

---------------------------------------------------------------------------------------------------------------
-- 1. Create: the activity, its tags and its sessions, all or nothing.
create function public.create_activity_full(
  p_activity jsonb,
  p_tags     uuid[] default '{}',
  p_sessions jsonb  default '[]'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  a             public.activities;
  v_activity_id uuid := gen_random_uuid();
begin
  -- Turn the JSON into a typed activities row; keys we don't copy below are ignored
  a := jsonb_populate_record(null::public.activities, p_activity);

  -- created_by comes from the sign-in. checked_by is set by the SCRUM-82 trigger.
  insert into public.activities (
    activity_id, created_by,
    provider_id, name, description, suburb_id,
    physical_demand, sensory_load, step_free_access, cost_per_session,
    min_age, max_age, transport_options, support_worker_policy, checked_at
  )
  values (
    v_activity_id, auth.uid(),
    a.provider_id, a.name, a.description, a.suburb_id,
    a.physical_demand, a.sensory_load, a.step_free_access, a.cost_per_session,
    a.min_age, a.max_age, coalesce(a.transport_options, '{}'), a.support_worker_policy, a.checked_at
  );

  -- Tags: a tag id that doesn't exist fails here and undoes the whole function
  insert into public.activity_tags (activity_id, tag_id)
  select distinct v_activity_id, t
  from unnest(p_tags) as t;

  -- Sessions: a list like [{"day": "wed", "start_time": "10:00", "end_time": "11:00"}]
  insert into public.activity_sessions (activity_id, day, start_time, end_time)
  select distinct v_activity_id,
         (s ->> 'day')::public.day_of_week,
         (s ->> 'start_time')::time,
         (s ->> 'end_time')::time
  from jsonb_array_elements(p_sessions) as s;

  return v_activity_id;
end;
$$;

revoke execute on function public.create_activity_full(jsonb, uuid[], jsonb) from public, anon;
grant execute on function public.create_activity_full(jsonb, uuid[], jsonb) to authenticated;

---------------------------------------------------------------------------------------------------------------
-- 2. Edit: only the fields sent change. Tags and sessions are replaced only when sent
-- (null = leave them alone; an empty list = remove them all).
create function public.update_activity_full(
  p_activity_id uuid,
  p_changes     jsonb  default '{}',
  p_tags        uuid[] default null,
  p_sessions    jsonb  default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  a public.activities;
  n integer;
begin
  -- Load the activity as it is now. RLS hides ones you can't see, so they're "not found".
  select * into a from public.activities where activity_id = p_activity_id;
  if not found then
    raise exception 'Activity not found' using errcode = 'P0002';
  end if;

  if p_changes <> '{}'::jsonb then
    -- Start from the saved row and lay the sent fields over it
    a := jsonb_populate_record(a, p_changes);

    -- Only the form's fields: created_by, checked_by, archived_at and the audit
    -- columns are left out, so a request can't change them
    update public.activities set
      provider_id           = a.provider_id,
      name                  = a.name,
      description           = a.description,
      suburb_id             = a.suburb_id,
      physical_demand       = a.physical_demand,
      sensory_load          = a.sensory_load,
      step_free_access      = a.step_free_access,
      cost_per_session      = a.cost_per_session,
      min_age               = a.min_age,
      max_age               = a.max_age,
      transport_options     = coalesce(a.transport_options, '{}'),
      support_worker_policy = a.support_worker_policy,
      checked_at            = a.checked_at
    where activity_id = p_activity_id;

    -- RLS let you see it, but not edit it (support workers)
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'Only coordinators can edit activities' using errcode = '42501';
    end if;
  end if;

  if p_tags is not null then
    delete from public.activity_tags where activity_id = p_activity_id;
    insert into public.activity_tags (activity_id, tag_id)
    select distinct p_activity_id, t from unnest(p_tags) as t;
  end if;

  if p_sessions is not null then
    delete from public.activity_sessions where activity_id = p_activity_id;
    insert into public.activity_sessions (activity_id, day, start_time, end_time)
    select distinct p_activity_id,
           (s ->> 'day')::public.day_of_week,
           (s ->> 'start_time')::time,
           (s ->> 'end_time')::time
    from jsonb_array_elements(p_sessions) as s;
  end if;

  return p_activity_id;
end;
$$;

revoke execute on function public.update_activity_full(uuid, jsonb, uuid[], jsonb) from public, anon;
grant execute on function public.update_activity_full(uuid, jsonb, uuid[], jsonb) to authenticated;
