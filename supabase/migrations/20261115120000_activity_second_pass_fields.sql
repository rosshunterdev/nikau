-- SCRUM-129 fix 08 (hi-fi 11): save the rest of the activity fields.
-- These columns have been on public.activities since the first migration, and AI
-- Matching already reads them, but the save functions copy each field by name and
-- these weren't on the list, so the app couldn't fill them in: street_address,
-- joining, group_size, physical_notes, sensory_notes, bus_routes,
-- walk_from_stop_minutes, staff_support, staff_experience, not_in_listing,
-- check_method. Same pattern as 20261109081509_second_pass_fields.sql (clients).
-- Same inputs as before; update_activity_full keeps the SCRUM-100 row lock.
-- No table changes. The grants are repeated at the end, per our README rule.

---------------------------------------------------------------------------------------------------------------
-- 1. Create
create or replace function public.create_activity_full(
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
  -- Only coordinators add to the catalogue (RLS blocks it too; this gives a clear error)
  if not public.is_coordinator() then
    raise exception 'Only coordinators can add activities' using errcode = '42501';
  end if;

  -- Turn the JSON into a typed activities row; keys we don't copy below are ignored
  a := jsonb_populate_record(null::public.activities, p_activity);

  -- created_by comes from the sign-in. checked_by is set by the SCRUM-82 trigger.
  insert into public.activities (
    activity_id, created_by,
    provider_id, name, description, suburb_id,
    physical_demand, sensory_load, step_free_access, cost_per_session,
    min_age, max_age, transport_options, support_worker_policy, checked_at,
    street_address, joining, group_size, physical_notes, sensory_notes,
    bus_routes, walk_from_stop_minutes, staff_support, staff_experience,
    not_in_listing, check_method
  )
  values (
    v_activity_id, auth.uid(),
    a.provider_id, a.name, a.description, a.suburb_id,
    a.physical_demand, a.sensory_load, a.step_free_access, a.cost_per_session,
    a.min_age, a.max_age, coalesce(a.transport_options, '{}'), a.support_worker_policy, a.checked_at,
    a.street_address, a.joining, a.group_size, a.physical_notes, a.sensory_notes,
    a.bus_routes, a.walk_from_stop_minutes, a.staff_support, a.staff_experience,
    a.not_in_listing, a.check_method
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

---------------------------------------------------------------------------------------------------------------
-- 2. Edit (only the fields sent change; tags and sessions are replaced only when sent)
create or replace function public.update_activity_full(
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
  -- Only coordinators edit the catalogue. RLS already blocks the row update, but a
  -- tag- or session-only edit would otherwise do nothing and still succeed.
  -- This check now comes first: "for update" below only finds rows you're allowed
  -- to edit, so a support worker would otherwise get "not found" instead.
  if not public.is_coordinator() then
    raise exception 'Only coordinators can edit activities' using errcode = '42501';
  end if;

  -- Load the activity as it is now. RLS hides ones you can't see, so they're "not found".
  -- "for update" locks the row until this save finishes, so two saves at the same
  -- moment can't overwrite each other's changes (SCRUM-100).
  select * into a from public.activities where activity_id = p_activity_id for update;
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
      checked_at            = a.checked_at,
      -- SCRUM-129 fix 08: the rest of the form (hi-fi 11)
      street_address         = a.street_address,
      joining                = a.joining,
      group_size             = a.group_size,
      physical_notes         = a.physical_notes,
      sensory_notes          = a.sensory_notes,
      bus_routes             = a.bus_routes,
      walk_from_stop_minutes = a.walk_from_stop_minutes,
      staff_support          = a.staff_support,
      staff_experience       = a.staff_experience,
      not_in_listing         = a.not_in_listing,
      check_method           = a.check_method
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

-- Our rule (README, "Writing migrations"): say who can run every function the app calls
revoke execute on function public.create_activity_full(jsonb, uuid[], jsonb) from public, anon;
grant execute on function public.create_activity_full(jsonb, uuid[], jsonb) to authenticated;
revoke execute on function public.update_activity_full(uuid, jsonb, uuid[], jsonb) from public, anon;
grant execute on function public.update_activity_full(uuid, jsonb, uuid[], jsonb) to authenticated;
