-- SCRUM-77: RLS tidy-ups (follow-ups Q6, Q8 from the SCRUM-61 review).
-- 1. The clients select and edit policies call can_see_client(client_id), so the
--    "coordinator or assigned" rule lives in one place, as it does for the tables
--    that hang off clients.
-- 2. A note for future functions: they need an explicit grant to authenticated.

---------------------------------------------------------------------------------------------------------------
-- 1a. Seeing clients: same rule as before, now from the shared helper.
alter policy "Staff see permitted clients"
on public.clients
using (public.can_see_client(client_id));

-- 1b. Editing clients: who can edit now comes from the shared helper.
-- with check stays as it was. It tests the row after the change, but can_see_client
-- looks the client up in the table, so it would see the row from before the change.
-- The organisation check on the new row is what stops a client moving organisation.
alter policy "Staff edit permitted clients"
on public.clients
using (public.can_see_client(client_id))
with check (organisation_id = public.my_organisation_id());

---------------------------------------------------------------------------------------------------------------
-- 2. Note for future migrations (Q8): new functions are not runnable by default.
-- SCRUM-61 revoked execute on new functions from public and anon (alter default privileges
-- in 20261014123430_grants_and_rls.sql). Supabase still grants authenticated by default,
-- but don't rely on it: any new RPC the app calls (e.g. SCRUM-78, save client) should say
-- explicitly who can run it:
--   revoke execute on function public.<name>(<args>) from public, anon;
--   grant execute on function public.<name>(<args>) to authenticated;

