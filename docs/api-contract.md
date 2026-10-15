# Core API ↔ AI Matching contract

**Ticket:** SCRUM-58 (B1) · **Version:** 0.2 draft, 16 Oct 2026 · **Owner:** Ross · **Reviewer:** Jove

This is the request and response between the Core API and the AI Matching service. Both sides build and test against it independently. Field names follow *SCRUM-50 Client and activity attributes v0.3* (with `birth_year` in place of `age_band`, as approved in the ERD).

## Open decisions

Settle these with Jove before this doc is approved. Each has a proposed value used in the rest of the doc.

| # | Decision | Proposed |
|---|---|---|
| D1 | Service auth | Shared secret in `Authorization: Bearer <MATCHING_SERVICE_KEY>`, stored as a Vercel environment variable on both services |
| D2 | Shortlist maximum, and which activities to keep when the pre-filter returns more | 30. If the pre-filter returns more, the Core API keeps the top 30 by: (1) most interest tags shared with the client, (2) same suburb as the client, (3) lower `cost_per_session`, (4) `id`, so the cut is repeatable. The Core API also logs the pre-cap count. *Pending Jove's agreement* |
| D3 | Result limit | Default 5, maximum 10 |
| D4 | Timeout on the Core API side | 15 s |
| D5 | Enum codes | The snake_case codes below follow SCRUM-50 v0.3. Jove is aligning the SCRUM-61 migrations to them (his migration had drifted from v0.3). If a code ever differs, the migrations win and this doc is updated. Each `(D5)` field is checked against the migrations once his fix lands |
| D6 | `why_*` storage | Lists of strings here; if the `leads` columns are `text`, the Core API joins them with newlines |

## How a match runs

1. The worker clicks **Find activities**.
2. The Core API runs the nine v0.3 filter rules in plain code to build the shortlist. If more than 30 activities pass, it keeps 30 using the D2 selection rule.
3. If the shortlist is empty, the Core API logs `no_candidates` and does **not** call AI Matching.
4. The Core API sends the client's "To AI" fields and the shortlist to `POST /match`.
5. AI Matching ranks the shortlist and explains each result, removes any activity that isn't on the shortlist, and returns at most `limit` results.
6. The Core API logs the call in `matching_log` and returns the results to the frontend. On any failure it returns the fallback instead (see Errors).

## Privacy boundary

Only the fields listed under Request leave the Core API.

**Never sent:** client name or `preferred_name`, client ID, `birth_year`, contact details, street addresses (client or activity), staff names, organisation, provider name and contact details, consent fields, `sensory_hard_limit`, `last_reviewed_with_client`, `contributors`, `check_method`, `checked_at`, `checked_by`.

Free-text fields (`goals`, `participation_notes`, `physical_notes`, `sensory_notes`) describe needs, not diagnoses, and contain no names or places. AI Matching doesn't store request bodies.

## Auth

`POST /match` requires `Authorization: Bearer <MATCHING_SERVICE_KEY>` (D1). A missing or wrong key returns `401`. `GET /health` is open.

The direct call (below) doesn't use auth, because it runs inside the Core API process.

## `POST /match`

### Request

| Field | Type | Required | Rules |
|---|---|---|---|
| `request_id` | uuid | yes | Created by the Core API; becomes `matching_log.request_id` and `leads.match_request_id` |
| `limit` | integer | no | 1–10, default 5 (D3) |
| `client` | object | yes | See Client |
| `shortlist` | array of Activity | yes | 1–30 items (D2), unique `id`s |

#### Client

Every field except `age_band` may be `null` or empty, meaning "no limit" or "not recorded".

| Field | Type | Allowed values |
|---|---|---|
| `age_band` | string | `child` (0–12), `youth` (13–17), `adult` (18+). Worked out by the Core API from `birth_year`, using the younger possible age |
| `suburb` | string | a suburb name from the suburbs table |
| `travel_range_minutes` | integer | minutes |
| `goals` | string[] | 0–5 items, in the client's own words, in priority order |
| `interests` | string[] | tag names from the shared tag list |
| `participation_notes` | string | |
| `max_physical_demand` | string | `low`, `medium`, `high` |
| `physical_notes` | string | |
| `needs_step_free` | boolean | |
| `max_sensory_load` | string | `low`, `medium`, `high` |
| `sensory_notes` | string | |
| `transport` | string[] | `bus_train_with_worker`, `bus_train_alone`, `worker_drives`, `mobility_taxi` (D5) |
| `support_needed` | string | `own`, `worker_present`, `one_to_one` (D5) |
| `max_cost` | number | NZD per session |
| `availability` | object[] | `{ "day": "mon"…"sun", "slot": "morning" \| "afternoon" \| "evening" }` |

#### Activity

`null` means unknown. AI Matching turns any unknown that matters for this client into a `why_ask` line.

| Field | Type | Allowed values |
|---|---|---|
| `id` | uuid | `activities.id`; required |
| `name` | string | required |
| `description` | string | |
| `tags` | string[] | tag names from the shared tag list |
| `suburb` | string | a suburb name |
| `sessions` | object[] | `{ "day": "mon"…"sun", "start": "HH:MM", "end": "HH:MM" }` |
| `joining` | string | `drop_in`, `book_ahead`, `term_enrolment`, `waitlist` (D5) |
| `cost_per_session` | number | NZD, 0 = free |
| `min_age`, `max_age` | integer | years |
| `physical_demand` | string | `low`, `medium`, `high` |
| `physical_notes` | string | |
| `step_free_access` | boolean | |
| `sensory_load` | string | `low`, `medium`, `high` |
| `sensory_notes` | string | |
| `group_size` | string | `under_10`, `10_to_20`, `over_20` (D5) |
| `transport_options` | string[] | `bus_route`, `mobility_parking`, `door_drop_off` (D5) |
| `bus_routes` | string | e.g. `"2, 3"` |
| `walk_from_stop_minutes` | integer | minutes |
| `support_worker_policy` | string | `attend_free`, `attend_with_charge`, `not_allowed` (D5) |
| `staff_support` | string | `staff_can_assist`, `bring_own_support` (D5) |
| `staff_experience` | boolean | |
| `not_in_listing` | string | what couldn't be confirmed |

### Response `200`

| Field | Type | Rules |
|---|---|---|
| `request_id` | uuid | Same as the request |
| `results` | Result[] | 1 to `limit` items, ordered by `rank` |
| `model_ms` | integer | Time spent waiting for Gemini, in ms |
| `dropped_count` | integer | Activities the model returned that weren't on the shortlist (or were duplicates), removed before responding |

#### Result

| Field | Type | Rules |
|---|---|---|
| `activity_id` | uuid | Must be an `id` from the request's `shortlist` |
| `rank` | integer | 1, 2, 3… with no gaps or repeats |
| `why_fits` | string[] | 1–3 items; how it matches the client's goals, interests or needs |
| `why_doesnt_cover` | string[] | 0–3 items; needs it doesn't meet, including a sensory load above the client's level and any support worker charge |
| `why_ask` | string[] | 0–3 items; unknowns to check with the provider |

The Core API works out `candidate_count` (shortlist length) and `leads_shown` (results length) itself.

### Rules AI Matching guarantees

1. Every `activity_id` is on the shortlist. Anything else is removed and counted in `dropped_count`.
2. No activity appears twice.
3. `results` never has more than `limit` items, or more items than the shortlist.
4. Every result has at least one `why_fits` line.
5. Explanations use only the fields sent. They don't invent facts about an activity; unknowns become `why_ask` lines.
6. If nothing valid is left after these checks, the service returns `invalid_output` instead of an empty list.

## Errors

Every error response has this body:

```json
{
  "request_id": "6f1c2a9e-3b7d-4e21-9a55-0c8d4f2b1e77",
  "error": { "code": "invalid_output", "message": "No valid results after removing off-shortlist activities" }
}
```

| HTTP | `error.code` | When | `matching_log.result` |
|---|---|---|---|
| 401 | `unauthorized` | Missing or wrong service key | `error` |
| 422 | `invalid_request` | Request breaks the rules above | `error` |
| 502 | `model_error` | Gemini call failed | `error` |
| 502 | `invalid_output` | Model output failed validation after one retry, or nothing valid was left | `invalid_output` |
| — | — | No response within 15 s (D4); the Core API stops waiting | `timeout` |
| — | — | Empty shortlist; AI Matching isn't called | `no_candidates` |

A `200` is logged as `success`.

**Fallback:** on any result other than `success`, the Core API tells the frontend matching is unavailable, and the frontend opens the catalogue search with the client's needs pre-filled. For `no_candidates`, the message says no activities passed the client's filters, rather than that matching is down.

## `GET /health`

No auth. Returns `200` when the service is up:

```json
{ "status": "ok", "contract_version": "0.2" }
```

It doesn't call Gemini, so it shows the service is running, not that the model is reachable.

## Direct call (RQ1)

For the RQ1 comparison, the Core API can call matching in-process instead of over HTTP:

```python
from ai_matching.contract import MatchRequest, MatchResponse
from ai_matching.service import match

response: MatchResponse = match(request)  # request: MatchRequest
```

- The HTTP endpoint and the direct call use the **same Pydantic models** (`MatchRequest`, `MatchResponse`), so both paths send and receive identical data.
- The direct call raises `MatchError(code, message)` with the same codes as the HTTP errors.
- The Core API logs `called_as` as `http` or `direct`.

## Example

A made-up client and two made-up activities. No real data.

### Request

```json
{
  "request_id": "6f1c2a9e-3b7d-4e21-9a55-0c8d4f2b1e77",
  "limit": 2,
  "client": {
    "age_band": "adult",
    "suburb": "Newtown",
    "travel_range_minutes": 30,
    "goals": ["Meet people who like making things", "Get out of the house twice a week"],
    "interests": ["Art and craft", "Gardening"],
    "participation_notes": "Engages best hands-on; loses interest in long seated talks",
    "max_physical_demand": "medium",
    "physical_notes": "Walks about 15 min, needs to sit regularly",
    "needs_step_free": false,
    "max_sensory_load": "medium",
    "sensory_notes": "Finds crowds and loud venues hard",
    "transport": ["bus_train_with_worker"],
    "support_needed": "worker_present",
    "max_cost": 15,
    "availability": [
      { "day": "tue", "slot": "morning" },
      { "day": "thu", "slot": "afternoon" }
    ]
  },
  "shortlist": [
    {
      "id": "a1f0c3e2-5b4d-4c6a-8e9f-1a2b3c4d5e6f",
      "name": "Thursday Community Garden Crew",
      "description": "Volunteers plant, weed and harvest the community beds, then share morning tea.",
      "tags": ["Gardening", "Volunteering", "Outdoors and nature"],
      "suburb": "Newtown",
      "sessions": [{ "day": "thu", "start": "13:00", "end": "15:00" }],
      "joining": "drop_in",
      "cost_per_session": 0,
      "min_age": 16,
      "max_age": null,
      "physical_demand": "medium",
      "physical_notes": "Kneeling and light lifting; benches by the beds",
      "step_free_access": true,
      "sensory_load": "low",
      "sensory_notes": "Outdoors, quiet street",
      "group_size": "under_10",
      "transport_options": ["bus_route"],
      "bus_routes": "1, 3",
      "walk_from_stop_minutes": 5,
      "support_worker_policy": "attend_free",
      "staff_support": "bring_own_support",
      "staff_experience": null,
      "not_in_listing": "Whether they run in heavy rain"
    },
    {
      "id": "b2e1d4f3-6c5e-4d7b-9fa0-2b3c4d5e6f70",
      "name": "Open Studio Craft Morning",
      "description": "A drop-in studio session with paints, clay and fabric. A tutor helps with a weekly project.",
      "tags": ["Art and craft", "Learning and classes"],
      "suburb": "Kilbirnie",
      "sessions": [{ "day": "tue", "start": "10:00", "end": "12:00" }],
      "joining": "book_ahead",
      "cost_per_session": 12,
      "min_age": 18,
      "max_age": null,
      "physical_demand": "low",
      "physical_notes": "Seated at tables",
      "step_free_access": true,
      "sensory_load": "medium",
      "sensory_notes": null,
      "group_size": "10_to_20",
      "transport_options": ["bus_route", "mobility_parking"],
      "bus_routes": "2",
      "walk_from_stop_minutes": 3,
      "support_worker_policy": "attend_with_charge",
      "staff_support": "staff_can_assist",
      "staff_experience": true,
      "not_in_listing": null
    }
  ]
}
```

### Response

```json
{
  "request_id": "6f1c2a9e-3b7d-4e21-9a55-0c8d4f2b1e77",
  "results": [
    {
      "activity_id": "a1f0c3e2-5b4d-4c6a-8e9f-1a2b3c4d5e6f",
      "rank": 1,
      "why_fits": [
        "Hands-on gardening in a small group matches their interests and how they like to take part",
        "Thursday afternoon fits their availability, and it's free and in their own suburb"
      ],
      "why_doesnt_cover": [],
      "why_ask": [
        "Whether the leaders have supported people with disabilities before",
        "Whether it runs in heavy rain"
      ]
    },
    {
      "activity_id": "b2e1d4f3-6c5e-4d7b-9fa0-2b3c4d5e6f70",
      "rank": 2,
      "why_fits": [
        "A guided craft project each week suits their wish to make things with other people",
        "Seated work suits their need to sit regularly"
      ],
      "why_doesnt_cover": [
        "Support workers are charged to attend, on top of the $12 session cost"
      ],
      "why_ask": [
        "How noisy the studio gets with 10 to 20 people, given they find crowds hard"
      ]
    }
  ],
  "model_ms": 1840,
  "dropped_count": 0
}
```

## Changes

| Version | Date | Change |
|---|---|---|
| 0.1 | 14 Oct 2026 | First draft for review |
| 0.2 | 16 Oct 2026 | Review changes: D2 selection rule proposed (and the Core API logs the pre-cap count); D5 reworded now that the SCRUM-61 migrations are being aligned to v0.3 |
