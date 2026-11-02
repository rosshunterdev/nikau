-- SCRUM-87: contract v0.4 (D7) adds "nothing fits well".
-- AI Matching returns 200 with no results when nothing on the shortlist is a good fit,
-- and the Core API logs it as no_good_fit (different from invalid_output, which is bad output).
alter type public.match_result add value if not exists 'no_good_fit' after 'no_candidates';
