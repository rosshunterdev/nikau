-- NOTE: Tables, built in dependency order: a table can only reference tables created above it.

-- BATCH 1: CORE AND LOOKUP TABLES

-- Each support organisation (coordinators see all clients in their organisation)
create table public.organisations (
  organisation_id uuid primary key default gen_random_uuid(),
  name            text not null,
  created_at      timestamptz not null default now()
);

-- One profile per staff member, linked to their Supabase Auth login
create table public.profiles (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  first_name      text not null,
  last_name       text not null,
  role            public.user_role not null,
  organisation_id uuid not null references public.organisations (organisation_id) on delete restrict,
  created_at      timestamptz not null default now(),
  is_active       boolean not null default true
);

-- Suburb list, shared by clients and activities.
-- Seeded from LINZ NZ Suburbs and Localities (CC BY 4.0) in the reference_data migration.
create table public.suburbs (
  suburb_id             uuid primary key default gen_random_uuid(),
  name                  text not null,
  territorial_authority text not null,
  -- The same name can exist under different councils, but not twice under one
  constraint suburb_unique_per_council unique (name, territorial_authority)
);

-- The shared tag list: client interests and activity tags both point here
create table public.tags (
  tag_id uuid primary key default gen_random_uuid(),
  name   text not null unique
);

-- Who runs activities. Contact details and consent sit here, once per provider.
create table public.providers (
  provider_id   uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_email text,
  contact_phone text,
  website       text,
  created_at    timestamptz not null default now(),
  consent_given boolean not null default false,
  consent_date  date,
  -- A provider that has consented must have a consent date
  constraint consent_needs_date check (consent_given = false or consent_date is not null)
);

-- --------------------------------------------------------------------------------------------------------------- --
-- BATCH 2: CLIENTS

-- Reusable trigger function: stamps updated_at whenever a row is changed
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- The client profile (SCRUM-50 v0.3 client attributes)
create table public.clients (
  client_id                 uuid primary key default gen_random_uuid(),
  organisation_id           uuid not null references public.organisations (organisation_id) on delete restrict,
  preferred_name            text not null,
  suburb_id                 uuid references public.suburbs (suburb_id) on delete set null,
  travel_range_minutes      integer check (travel_range_minutes > 0),
  birth_year                integer check (birth_year between 1900 and 2100),
  max_physical_demand       public.level,
  max_sensory_load          public.level,
  support_needed            public.support_needed,
  needs_step_free           boolean,
  sensory_hard_limit        boolean not null default false,
  participation_notes       text,
  physical_notes            text,
  sensory_notes             text,
  max_cost                  numeric(8, 2) check (max_cost >= 0),
  goals                     text[] check (cardinality(goals) <= 5),
  transport                 public.client_transport[],
  contributors              public.contributor[],
  reviewed_by               uuid references public.profiles (user_id) on delete set null,
  last_reviewed_with_client date,
  created_by                uuid references public.profiles (user_id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_by                uuid references public.profiles (user_id) on delete set null,
  updated_at                timestamptz not null default now()
);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- Which workers can see which client (a client can have several workers)
create table public.client_assignments (
  client_id   uuid not null references public.clients (client_id) on delete cascade,
  user_id     uuid not null references public.profiles (user_id) on delete cascade,
  assigned_by uuid references public.profiles (user_id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

-- A client's interests, from the shared tag list
create table public.client_interests (
  client_id uuid not null references public.clients (client_id) on delete cascade,
  tag_id    uuid not null references public.tags (tag_id) on delete restrict,
  primary key (client_id, tag_id)
);

-- When a client is free: one row per day and slot
create table public.client_availability (
  client_id uuid not null references public.clients (client_id) on delete cascade,
  day       public.day_of_week not null,
  slot      public.time_slot not null,
  primary key (client_id, day, slot)
);

-- --------------------------------------------------------------------------------------------------------------- --
-- BATCH 3: ACTIVITIES (the catalogue is shared across all organisations, so no organisation_id)

-- An activity in the catalogue (SCRUM-50 v0.3 activity attributes)
create table public.activities (
  activity_id            uuid primary key default gen_random_uuid(),
  provider_id            uuid not null references public.providers (provider_id) on delete restrict,
  name                   text not null,
  description            text,
  street_address         text,
  bus_routes             text,
  suburb_id              uuid references public.suburbs (suburb_id) on delete set null,
  joining                public.joining,
  group_size             public.group_size,
  support_worker_policy  public.support_worker_policy,
  staff_support          public.staff_support,
  check_method           public.check_method,
  physical_demand        public.level,
  physical_notes         text,
  sensory_load           public.level,
  sensory_notes          text,
  cost_per_session       numeric(8, 2) check (cost_per_session >= 0),
  min_age                integer check (min_age >= 0),
  max_age                integer check (max_age >= 0),
  walk_from_stop_minutes integer check (walk_from_stop_minutes >= 0),
  step_free_access       boolean,
  staff_experience       boolean,
  transport_options      public.activity_transport[],
  not_in_listing         text,
  checked_by             uuid references public.profiles (user_id) on delete set null,
  checked_at             date,
  created_by             uuid references public.profiles (user_id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_by             uuid references public.profiles (user_id) on delete set null,
  updated_at             timestamptz not null default now(),
  -- When both ages are given, the minimum can't be above the maximum
  constraint age_range_valid check (min_age is null or max_age is null or min_age <= max_age)
);

create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

-- An activity's tags, from the shared tag list
create table public.activity_tags (
  activity_id uuid not null references public.activities (activity_id) on delete cascade,
  tag_id      uuid not null references public.tags (tag_id) on delete restrict,
  primary key (activity_id, tag_id)
);

-- When an activity runs: one row per session
create table public.activity_sessions (
  session_id  uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (activity_id) on delete cascade,
  day         public.day_of_week not null,
  start_time  time not null,
  end_time    time not null,
  constraint session_ends_after_start check (end_time > start_time)
);

-- --------------------------------------------------------------------------------------------------------------- --
-- BATCH 4: MATCHING

-- One row per AI matching request: performance and outcome only, no client details
create table public.matching_log (
  request_id      uuid primary key default gen_random_uuid(),
  requested_at    timestamptz not null default now(),
  called_as       public.match_call_type,
  response_ms     integer check (response_ms >= 0),
  result          public.match_result not null,
  fallback_shown  boolean not null default false,
  organisation_id uuid not null references public.organisations (organisation_id) on delete restrict,
  requested_by    uuid references public.profiles (user_id) on delete set null,
  candidate_count integer check (candidate_count >= 0),
  leads_shown     integer check (leads_shown >= 0),
  model_ms        integer check (model_ms >= 0),
  dropped_count   integer check (dropped_count >= 0)
);

-- A lead a worker saved for a client, keeping the AI's explanation
create table public.leads (
  lead_id          uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients (client_id) on delete cascade,
  activity_id      uuid not null references public.activities (activity_id) on delete cascade,
  saved_by         uuid references public.profiles (user_id) on delete set null,
  saved_on         timestamptz not null default now(),
  source           public.lead_source not null,
  why_fits         text,
  why_doesnt_cover text,
  why_ask          text,
  match_request_id uuid references public.matching_log (request_id) on delete set null,
  -- The same activity can only be saved once per client
  constraint lead_saved_once unique (client_id, activity_id)
);