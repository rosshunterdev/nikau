# Synthetic fixtures (SCRUM-59)

Made-up clients and activities for testing the pre-filter and `POST /match`. No real client data.

These are pre-filter input, so they include `birth_year` and `consent_given` (stored on `providers` in the database). The `/match` request is built from them: `age_band` is derived from `birth_year`, and `birth_year` and `consent_given` are dropped.

## How they're built

- Activity `a0` passes every pre-filter rule for client `c1`.
- `a1`–`a9` are copies of `a0` with one field changed, so each fails exactly one rule.
- `b1`–`b4` are edge cases that should be kept.
- `f1` (Pickleball) fails two rules (physical demand and schedule).
- Client `c2` is `c1` with `sensory_hard_limit: false`.

| Activity | Rule tested | Change from `a0` |
|---|---|---|
| a1 | Consent | `consent_given: false` |
| a2 | Physical demand | `physical_demand: high` |
| a3 | Sensory (hard limit only) | `sensory_load: high` |
| a4 | Step-free | `step_free_access: false` |
| a5 | Cost | `cost_per_session: 25` |
| a6 | Schedule | Monday morning session only |
| a7 | Age | `min_age: 60` |
| a8 | Transport | No `bus_route` |
| a9 | Support | `support_worker_policy: not_allowed` |
| b1 | Step-free, unknown | `step_free_access: null` (unknown is kept; AI asks) |
| b2 | Cost, equal | `cost_per_session: 20` (equal to `max_cost`) |
| b3 | Schedule, boundary | Starts 12:00, the first minute of afternoon |
| b4 | Age, borderline | `max_age: 24`; born 2001 is 24 or 25 in 2026 |

## Expected results ("this year" = 2026)

| Client | Kept |
|---|---|
| c1 (sensory hard limit) | a0, b1, b2, b3, b4 |
| c2 (no hard limit) | a0, a3, b1, b2, b3, b4 |

For `c2`, `a3` is kept, with the sensory mismatch flagged under "Doesn't cover".


## Notes for the pre-filter and spike

- **Time slots** are set by session start time: morning = before 12:00, afternoon = 12:00 to 16:59, evening = 17:00 or later.
- **Unknown or empty values never exclude** an activity. It's kept, and the AI lists it under "ask about".
- **Travel range is a signal, not a filter.** No travel times between suburbs are stored, so it's left to the AI and the worker.
- **Interests:** client 1 has an interest that matches the kept activities; client 2 doesn't. Client 2 is the negative case: the AI must not claim an interest fit for it.