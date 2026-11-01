-- SCRUM-92: coordinators read their organisation's matching history (follow-up from PR #10).
-- 1. Leads: a lead can only link to your OWN matching request, checked directly.
-- 2. Matching log: coordinators can read every request in their organisation.
-- Part 1 comes first: the leads check used to rely on "you only see your own requests",
-- which part 2 changes for coordinators.

---------------------------------------------------------------------------------------------------------------
-- 1. Leads: match_request_id must be empty (manual search) or a request you made yourself.
-- Before, someone else's request was simply hidden by the matching_log policy. Coordinators
-- can now see their org's requests, so requested_by = auth.uid() is checked here directly.
alter policy "Staff save leads for permitted clients"
on public.leads
with check (
  public.can_see_client(client_id)
  and saved_by = auth.uid()
  and exists (select 1 from public.activities a where a.activity_id = leads.activity_id)
  and (
    match_request_id is null
    or exists (
      select 1 from public.matching_log m
      where m.request_id = leads.match_request_id
        and m.requested_by = auth.uid()
    )
  )
);

---------------------------------------------------------------------------------------------------------------
-- 2. Matching log: coordinators see all requests in their own organisation
-- (they already see all its clients). Support workers still see only their own,
-- through the existing "Staff read their own matching requests" policy.
create policy "Coordinators read their organisation's matching requests"
on public.matching_log for select to authenticated
using (public.is_coordinator() and organisation_id = public.my_organisation_id());
