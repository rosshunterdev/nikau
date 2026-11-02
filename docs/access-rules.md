# Access rules

Who can see and change what in Nīkau. These rules are enforced in the database by
Supabase row-level security (RLS) policies and database functions in
`supabase/migrations/`, not just hidden in the UI. A request that breaks a rule gets
no rows back, or an error, whichever app or API it comes from.

## Roles

- **Support worker** (`support_worker`): works directly with clients. Sees only the
  clients they're assigned to, and only activities from providers who have consented
  to be listed.
- **Coordinator** (`coordinator`): oversees an organisation's clients and catalogue.
  Sees all clients in their organisation, assigns workers to clients, and manages
  providers and activities, including ones still waiting on consent.

Everyone only sees their own organisation's data. Staff whose profile is inactive
see nothing, and signed-out visitors have no access to any table.

## Who can do what

| Data | Support worker | Coordinator |
|---|---|---|
| Clients: view | Assigned to them | All in their organisation |
| Clients: add | Yes (their organisation) | Yes (their organisation) |
| Clients: edit | Assigned to them | All in their organisation |
| Clients: delete | No one | No one |
| Client interests and availability | For clients they can see | For clients they can see |
| Assign / unassign workers | No | Yes (staff in their organisation) |
| Providers: view | Consented only | All |
| Providers: add / edit | No | Yes |
| Providers: delete | No one | No one |
| Activities: view | From consented providers | All (to manage consent) |
| Activities: add / edit | No | Yes |
| Activities: delete | No one (would delete saved leads) | No one |
| Matching log: add | Their own requests | Their own requests |
| Matching log: view | Their own requests | Their organisation's requests |
| Saved leads: view / remove | For clients they can see | For clients they can see |
| Saved leads: save from AI match | Own requests only | Own requests only |
| Saved leads: save from catalogue | For clients they can see | For clients they can see |
| Saved leads: edit | No one (a lead is a snapshot) | No one |

A worker who creates a client is assigned to them automatically, so they can see the
client straight away.

## Decisions

- **Coordinators can't save leads from a worker's match.** AI suggestions are only
  shown to whoever ran the match, and aren't stored unless that person saves one as a
  lead. The matching log only holds analytics (timings, result, counts). Allowing it
  would mean storing match results in a new table (a privacy decision) and loosening
  the leads policy, so it's a post-MVP backlog item. Coordinators see every lead for
  their organisation's clients on the Saved leads page, remove them from the client's
  profile, and can run their own match for any client. This also keeps
  RQ2 clean: "leads saved out of leads shown" stays one person's decisions per request.
- **Leads can't be edited.** A lead is a snapshot of what the AI said at the time, so
  there's no update policy (since SCRUM-61). To change one, remove it and save again.
- **Catalogue leads can't link to an AI match.** A `manual_search` lead must have no
  match request (database constraint, SCRUM-85). The API also checks that an `ai_match`
  lead has one; the database can't, because the link is cleared if the log entry is deleted.
- **Activities and providers can't be deleted.** Deleting an activity would also delete
  every lead saved for it.
- **Coordinators see activities from non-consented providers** so they can follow up
  consent. Workers only see consented ones (SCRUM-50 consent gate).
- **The consent gate is under review (SCRUM-104).** Provider details are usually public,
  and needing consent before an activity can be recommended won't scale. The proposal is
  to replace consented / not consented with confirmed / not confirmed: everyone sees every
  activity, with unconfirmed ones labelled. To be agreed at Sprint 6 planning. Until then,
  the rules above apply.

## Known edge cases

- If a provider withdraws consent after a lead is saved, the worker still sees the lead
  but not the activity details, because the activity is now hidden from them. The saved
  leads screens show it as "No longer listed".
- Coordinators can save a lead for a non-consented activity. The catalogue hides the
  button, but the database allows it, because the save rule only checks that you can see
  the activity. Workers then see that lead with its details hidden, and the "No longer
  listed" wording is wrong for it. Left as is while the consent gate is under review (SCRUM-104).
- AI-match leads store the explanation the browser sends. The API doesn't check that the
  activity or the text came from that match, because match results aren't stored. A known
  limit for RQ2 ("leads saved out of leads shown") until SCRUM-87 (SCRUM-106).
- If a matching log entry is deleted, saved leads keep their details but lose the link
  to the request (`match_request_id` is set to null).

## Where the rules live

| Migration | What it sets |
|---|---|
| `20261014123430_grants_and_rls.sql` | Turns on RLS for every table, removes signed-out access, adds the helper functions (`my_organisation_id`, `is_coordinator`, `is_assigned_to`, `can_see_client`) and the original policies |
| `20261025124113_lock_audit_columns.sql` | Saving a lead from an AI match must use a match request you can see |
| `20261026144850_rls_tidy_ups.sql` | Viewing and editing clients go through `can_see_client`, so the rule lives in one place |
| `20261030135700_save_client_functions.sql` | `create_client_full` and `update_client_full` RPCs, which run under the same client rules |
| `20261101092451_coordinators_read_matching_log.sql` | Coordinators read their organisation's matching log; saving from an AI match is limited to your own requests |
| `20261102000000_save_activity_functions.sql` | `create_activity_full` and `update_activity_full` RPCs check the caller is a coordinator |
| `20261102100000_leads_manual_has_no_match_request.sql` | A catalogue (`manual_search`) lead can't have a match request |
