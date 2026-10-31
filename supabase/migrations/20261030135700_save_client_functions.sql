-- SCRUM-78: save a client in one database function (follow-up Q8 from SCRUM-61).
-- Each function runs as one transaction: if any step fails, nothing is saved.
-- They run as the signed-in user (security invoker), so RLS still applies to every insert.

---------------------------------------------------------------------------------------------------------------
-- 1. Create: the client, its interests and its availability, all or nothing.
-- The creator is assigned by the existing clients_assign_creator trigger.
create function public.create_client_full(
  p_client       jsonb,
  p_interests    uuid[] default '{}',
  p_availability jsonb  default '[]'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  c           public.clients;
  v_client_id uuid := gen_random_uuid();
begin
  -- Turn the JSON into a typed clients row (text to enums, numbers, arrays).
  -- Keys we don't use below, like organisation_id, are simply ignored.
  c := jsonb_populate_record(null::public.clients, p_client);

  -- Organisation and creator come from the sign-in, never from the request
  insert into public.clients (
    client_id, organisation_id, created_by,
    preferred_name, suburb_id, birth_year, support_needed,
    max_physical_demand, needs_step_free, max_sensory_load,
    sensory_hard_limit, transport, max_cost
  )
  values (
    v_client_id, public.my_organisation_id(), auth.uid(),
    c.preferred_name, c.suburb_id, c.birth_year, c.support_needed,
    c.max_physical_demand, c.needs_step_free, c.max_sensory_load,
    coalesce(c.sensory_hard_limit, false), coalesce(c.transport, '{}'), c.max_cost
  );

  -- Interests (distinct drops duplicates). A tag id that doesn't exist fails here,
  -- and the whole function is undone, so there's no need to check tags first.
  insert into public.client_interests (client_id, tag_id)
  select distinct v_client_id, t
  from unnest(p_interests) as t;

  -- Availability: a list like [{"day": "mon", "slot": "morning"}]
  insert into public.client_availability (client_id, day, slot)
  select distinct v_client_id,
         (a ->> 'day')::public.day_of_week,
         (a ->> 'slot')::public.time_slot
  from jsonb_array_elements(p_availability) as a;

  return v_client_id;
end;
$$;

-- Only signed-in staff can run it (see the SCRUM-77 note on new functions)
revoke execute on function public.create_client_full(jsonb, uuid[], jsonb) from public, anon;
grant execute on function public.create_client_full(jsonb, uuid[], jsonb) to authenticated;

---------------------------------------------------------------------------------------------------------------
-- 2. Edit: only the fields sent change. Interests and availability are replaced
-- only when sent (null = leave them alone; an empty list = remove them all).
create function public.update_client_full(
  p_client_id    uuid,
  p_changes      jsonb  default '{}',
  p_interests    uuid[] default null,
  p_availability jsonb  default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  c public.clients;
  n integer;
begin
  -- Load the client as it is now. RLS hides clients you can't see, so they're "not found".
  select * into c from public.clients where client_id = p_client_id;
  if not found then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  if p_changes <> '{}'::jsonb then
    -- Start from the saved row and lay the sent fields over it.
    -- A key that isn't sent keeps its saved value; a key sent as null clears it.
    c := jsonb_populate_record(c, p_changes);

    -- Only the form's fields. organisation_id, created_by and the audit columns
    -- are left out, so a request can't change them.
    update public.clients set
      preferred_name      = c.preferred_name,
      suburb_id           = c.suburb_id,
      birth_year          = c.birth_year,
      support_needed      = c.support_needed,
      max_physical_demand = c.max_physical_demand,
      needs_step_free     = c.needs_step_free,
      max_sensory_load    = c.max_sensory_load,
      sensory_hard_limit  = coalesce(c.sensory_hard_limit, false),
      transport           = coalesce(c.transport, '{}'),
      max_cost            = c.max_cost
    where client_id = p_client_id;

    -- RLS let you see it, but not edit it
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'You can''t edit this client' using errcode = '42501';
    end if;
  end if;

  if p_interests is not null then
    delete from public.client_interests where client_id = p_client_id;
    insert into public.client_interests (client_id, tag_id)
    select distinct p_client_id, t from unnest(p_interests) as t;
  end if;

  if p_availability is not null then
    delete from public.client_availability where client_id = p_client_id;
    insert into public.client_availability (client_id, day, slot)
    select distinct p_client_id,
           (a ->> 'day')::public.day_of_week,
           (a ->> 'slot')::public.time_slot
    from jsonb_array_elements(p_availability) as a;
  end if;

  return p_client_id;
end;
$$;

revoke execute on function public.update_client_full(uuid, jsonb, uuid[], jsonb) from public, anon;
grant execute on function public.update_client_full(uuid, jsonb, uuid[], jsonb) to authenticated;