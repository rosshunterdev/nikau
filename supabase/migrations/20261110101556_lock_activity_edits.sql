-- SCRUM-100: lock the activity row while it's being edited (the same fix SCRUM-94 made
-- for clients). Without the lock, two coordinators saving the same activity at the same
-- moment could mix their changes. Only update_activity_full changes; the rest is as in
-- 20261102000000_save_activity_functions.sql.
-- "create or replace" keeps the function's existing grants.

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
