-- SCRUM-85: a manual_search lead can't point to an AI match request
-- (from the SCRUM-92 review, #23). Only this half is checked here: "ai_match needs an id"
-- would clash with match_request_id being "on delete set null". The API checks both halves.
alter table public.leads
  add constraint manual_lead_has_no_match_request
  check (source = 'ai_match' or match_request_id is null);
