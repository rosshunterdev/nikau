-- Enums: fixed lists of allowed values, used by the table columns.
-- Values follow SCRUM-50 v0.3. Empty (NULL) means "unknown", so there is no 'unknown' value.

-- Who a staff member is
create type public.user_role as enum ('support_worker', 'coordinator');

-- Shared scale for physical demand and sensory load.
-- Declared in order, so 'low' < 'medium' < 'high' works in comparisons.
create type public.level as enum ('low', 'medium', 'high');

-- Schedules and availability (declared in order, so they sort correctly)
create type public.day_of_week as enum ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
create type public.time_slot   as enum ('morning', 'afternoon', 'evening');

-- Client fields
create type public.support_needed as enum ('independent', 'worker_present', 'one_to_one');
create type public.client_transport as enum ('public_transport_with_worker', 'public_transport_alone', 'worker_drives', 'mobility_taxi');
create type public.contributor as enum ('client', 'family_whanau', 'support_worker', 'coordinator');

-- Activity fields
create type public.joining as enum ('drop_in', 'book_ahead', 'term_enrolment', 'waitlist');
create type public.group_size as enum ('under_10', '10_to_20', 'over_20');
create type public.activity_transport as enum ('bus_route', 'mobility_parking', 'door_drop_off');
create type public.support_worker_policy as enum ('attend_free', 'attend_with_charge', 'not_allowed');
create type public.staff_support as enum ('staff_can_assist', 'bring_own_support');
create type public.check_method as enum ('provider_website', 'phone_call', 'email', 'visited_in_person');

-- Leads and the matching log
create type public.lead_source as enum ('ai_match', 'manual_search');
create type public.match_call_type as enum ('http', 'direct');
create type public.match_result as enum ('success', 'timeout', 'error', 'invalid_output', 'no_candidates');