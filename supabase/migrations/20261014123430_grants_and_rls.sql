-- Grants and Row Level Security.
-- PART 1: HELPER FUNCTIONS, GRANTS, RLS ON EVERY TABLE
-- PART 2: CREATING CLIENTS, ASSIGNING WORKERS
-- PART 3: LOOKUPS, STAFF, CATALOGUE, LEADS, MATCHING LOG


-- PART 1: HELPER FUNCTIONS, GRANTS, RLS ON EVERY TABLE
---------------------------------------------------------------------------------------------------------------
-- HELPER FUNCTIONS
-- SECURITY DEFINER: the function runs with its owner's rights, so it can read
-- profiles and client_assignments even though those tables have RLS too.
-- Without this, a policy that reads a table with its own policies can loop forever.
-- search_path = '' means every name must be written in full (public.profiles), which is safer.

-- The signed-in person's organisation (NULL if they have no active profile)
create function public.my_organisation_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select organisation_id from public.profiles
  where user_id = auth.uid() and is_active;
$$;

-- Is the signed-in person an active coordinator?
create function public.is_coordinator()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and is_active and role = 'coordinator'
  );
$$;

-- Is the signed-in person assigned to this client?
create function public.is_assigned_to(p_client_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.client_assignments
    where client_id = p_client_id and user_id = auth.uid()
  );
$$;

---------------------------------------------------------------------------------------------------------------
-- GRANTS:
-- anon = not signed in. Nīkau has no public pages, so anon gets no table access at all.
revoke all on all tables in schema public from anon;
-- Also for tables added by future migrations
alter default privileges in schema public revoke all on tables from anon;
-- authenticated (signed-in staff) keeps table access. RLS decides which rows they get.

-- SWITCHING ON RLS: 
-- With RLS on and no policy, a table returns nothing. Policies open it up, rule by rule.
alter table public.organisations       enable row level security;
alter table public.profiles            enable row level security;
alter table public.suburbs             enable row level security;
alter table public.tags                enable row level security;
alter table public.providers           enable row level security;
alter table public.clients             enable row level security;
alter table public.client_assignments  enable row level security;
alter table public.client_interests    enable row level security;
alter table public.client_availability enable row level security;
alter table public.activities          enable row level security;
alter table public.activity_tags       enable row level security;
alter table public.activity_sessions   enable row level security;
alter table public.matching_log        enable row level security;
alter table public.leads               enable row level security;

---------------------------------------------------------------------------------------------------------------
-- PART 2: CREATING CLIENTS, ASSIGNING WORKERS

-- Is this staff member active and in my organisation?
create function public.is_in_my_organisation(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = p_user_id and is_active
      and organisation_id = public.my_organisation_id()
  );
$$;

-- Can I see this client? Used by the tables that hang off clients.
-- Coordinators see all clients in their organisation; other staff only their assigned clients.
-- (The creator is assigned automatically, so there's no separate creator rule.)
create function public.can_see_client(p_client_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clients c
    where c.client_id = p_client_id
      and c.organisation_id = public.my_organisation_id()
      and (public.is_coordinator() or public.is_assigned_to(c.client_id))
  );
$$;

-- Seeing clients: same organisation, AND coordinator or assigned.
-- Unassigning a worker removes their access, even if they created the client.
create policy "Staff see permitted clients"
on public.clients for select
to authenticated
using (
  organisation_id = public.my_organisation_id()
  and (public.is_coordinator() or public.is_assigned_to(client_id))
);

-- Creating clients: only in your own organisation, and recorded as created by you
create policy "Staff create clients in their organisation"
on public.clients for insert
to authenticated
with check (
  organisation_id = public.my_organisation_id()
  and created_by = auth.uid()
);

-- Editing clients: coordinators, or staff assigned to the client. It can't move to another organisation.
create policy "Staff edit permitted clients"
on public.clients for update
to authenticated
using (
  organisation_id = public.my_organisation_id()
  and (public.is_coordinator() or public.is_assigned_to(client_id))
)
with check (organisation_id = public.my_organisation_id());

-- The creator is assigned to the new client automatically
create function public.assign_client_creator()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.client_assignments (client_id, user_id, assigned_by)
    values (new.client_id, new.created_by, new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger clients_assign_creator
  after insert on public.clients
  for each row execute function public.assign_client_creator();

-- created_by can't change after the client is created.
-- RLS can't compare old and new values, so a trigger does it.
create function public.keep_client_creator()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger clients_keep_creator
  before update on public.clients
  for each row execute function public.keep_client_creator();

-- Assignments: visible alongside the client
create policy "Staff see assignments of permitted clients"
on public.client_assignments for select
to authenticated
using (public.can_see_client(client_id));

-- Assigning: coordinators only, staff from their own organisation only
create policy "Coordinators assign workers"
on public.client_assignments for insert
to authenticated
with check (
  public.is_coordinator()
  and public.can_see_client(client_id)
  and public.is_in_my_organisation(user_id)
  and assigned_by = auth.uid()
);

-- Removing an assignment: coordinators only
create policy "Coordinators remove assignments"
on public.client_assignments for delete
to authenticated
using (public.is_coordinator() and public.can_see_client(client_id));

-- Interests and availability follow the client: if you can see the client, you can manage these
create policy "Staff manage interests of permitted clients"
on public.client_interests for all
to authenticated
using (public.can_see_client(client_id))
with check (public.can_see_client(client_id));

create policy "Staff manage availability of permitted clients"
on public.client_availability for all
to authenticated
using (public.can_see_client(client_id))
with check (public.can_see_client(client_id));

---------------------------------------------------------------------------------------------------------------
-- PART 3: LOOKUPS, STAFF, CATALOGUE, LEADS, MATCHING LOG

-- Is the signed-in person active staff in any organisation?
create function public.is_active_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.my_organisation_id() is not null;
$$;

-- Lookups: any active staff member can read; changes only come through migrations
create policy "Staff read suburbs"
on public.suburbs for select to authenticated
using (public.is_active_staff());

create policy "Staff read tags"
on public.tags for select to authenticated
using (public.is_active_staff());

-- Organisations: only your own
create policy "Staff see their organisation"
on public.organisations for select to authenticated
using (organisation_id = public.my_organisation_id());

-- Profiles: yourself (even if inactive, so the app can say so), plus colleagues
create policy "Staff see themselves and colleagues"
on public.profiles for select to authenticated
using (user_id = auth.uid() or organisation_id = public.my_organisation_id());

-- Providers: coordinators see all (they follow up consent).
-- Other staff only see providers who agreed to be listed (SCRUM-50 consent gate),
-- so contact details of non-consented providers stay hidden.
create policy "Staff read consented providers"
on public.providers for select to authenticated
using (public.is_active_staff() and (public.is_coordinator() or consent_given));

create policy "Coordinators add providers"
on public.providers for insert to authenticated
with check (public.is_coordinator());

create policy "Coordinators edit providers"
on public.providers for update to authenticated
using (public.is_coordinator())
with check (public.is_coordinator());

-- Activities: coordinators see all; other staff only see activities from consented providers.
-- Coordinators add and edit. No delete policy: deleting an activity would also delete saved leads.
create policy "Staff read activities from consented providers"
on public.activities for select to authenticated
using (
  public.is_active_staff()
  and (public.is_coordinator()
       or exists (select 1 from public.providers p
                  where p.provider_id = activities.provider_id and p.consent_given))
);

-- Activity tags and sessions: visible only if you can see the activity.
-- The exists() runs under the activities policy, so the consent rule lives in one place.
create policy "Staff read tags of visible activities"
on public.activity_tags for select to authenticated
using (exists (select 1 from public.activities a where a.activity_id = activity_tags.activity_id));

-- UPDATE for SCRUM-61: coordinators can add and edit activities, but only for consented providers.
create policy "Coordinators edit activities"
on public.activities for update to authenticated
using (public.is_coordinator())
with check (public.is_coordinator());

create policy "Staff read sessions of visible activities"
on public.activity_sessions for select to authenticated
using (exists (select 1 from public.activities a where a.activity_id = activity_sessions.activity_id));

create policy "Coordinators manage activity tags"
on public.activity_tags for all to authenticated
using (public.is_coordinator())
with check (public.is_coordinator());

create policy "Staff read activity sessions"
on public.activity_sessions for select to authenticated
using (public.is_active_staff());

create policy "Coordinators manage activity sessions"
on public.activity_sessions for all to authenticated
using (public.is_coordinator())
with check (public.is_coordinator());

-- Saving a lead: you must be able to see both the client and the activity,
-- so nobody can save a hidden activity by guessing its id.
create policy "Staff save leads for permitted clients"
on public.leads for insert to authenticated
with check (
  public.can_see_client(client_id)
  and saved_by = auth.uid()
  and exists (select 1 from public.activities a where a.activity_id = leads.activity_id)
);

create policy "Staff remove leads of permitted clients"
on public.leads for delete to authenticated
using (public.can_see_client(client_id));

-- Matching log: staff log their own requests and can read them back
-- (the Core API needs the request_id back to link saved leads)
create policy "Staff log their own matching requests"
on public.matching_log for insert to authenticated
with check (organisation_id = public.my_organisation_id() and requested_by = auth.uid());

create policy "Staff read their own matching requests"
on public.matching_log for select to authenticated
using (requested_by = auth.uid());

---------------------------------------------------------------------------------------------------------------
-- FUNCTION ACCESS

-- Only signed-in staff need them: policies run as authenticated.
revoke execute on function
  public.my_organisation_id(),
  public.is_coordinator(),
  public.is_assigned_to(uuid),
  public.is_in_my_organisation(uuid),
  public.can_see_client(uuid),
  public.is_active_staff()
from public, anon;

grant execute on function
  public.my_organisation_id(),
  public.is_coordinator(),
  public.is_assigned_to(uuid),
  public.is_in_my_organisation(uuid),
  public.can_see_client(uuid),
  public.is_active_staff()
to authenticated;

-- Same for functions added by future migrations
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;