"""Find activities for a client (SCRUM-87): the Core API side of AI matching.

This file holds the pure steps, with no database or HTTP, so they're tested without
Supabase or Gemini. The endpoint in routers/matching.py loads the data and calls them.
Contract: docs/api-contract.md v0.4, "How a match runs".
"""

from app.prefilter import prefilter

# D2: the most activities sent to AI Matching in one request
SHORTLIST_MAX = 30


def to_prefilter_client(row: dict) -> dict:
    """A client row (with its interests and availability) in the shape the pre-filter
    and the shortlist expect: interests as tag ids, availability as {day, slot}."""
    return {
        **row,
        "interests": [i["tag_id"] for i in row.get("client_interests") or []],
        "availability": [
            {"day": a["day"], "slot": a["slot"]} for a in row.get("client_availability") or []
        ],
        "transport": row.get("transport") or [],
    }


def d2_order(client: dict, activity: dict) -> tuple:
    """Sort key for the D2 rule. Smaller sorts first:
    (1) most interest tags shared with the client,
    (2) same suburb as the client,
    (3) lower cost, with no cost listed going last,
    (4) activity id, so the cut is the same every time."""
    shared = len(set(client.get("interests") or []) & set(activity.get("tags") or []))
    client_suburb = client.get("suburb_id")
    same_suburb = client_suburb is not None and activity.get("suburb_id") == client_suburb
    cost = activity.get("cost_per_session")
    return (
        -shared,  # more shared tags first
        not same_suburb,  # False (same suburb) sorts before True
        cost is None,  # known cost before unknown
        cost if cost is not None else 0,
        activity["activity_id"],
    )


def build_shortlist(client: dict, activities: list[dict], year: int) -> list[dict]:
    """The activities AI Matching will rank: the pre-filter, then the top 30 by D2.

    client: from to_prefilter_client(). activities: from catalogue.to_prefilter_activity().
    An empty list means no activity passed the client's filters (logged as no_candidates).
    """
    kept = prefilter(client, activities, year)
    kept.sort(key=lambda a: d2_order(client, a))
    return kept[:SHORTLIST_MAX]


# --- The request for AI Matching (contract v0.4, "Request") ---

# Everything the AI request needs from an activity: the pre-filter's fields plus
# the descriptive ones the AI reads (notes, joining, group size...)
MATCH_ACTIVITY_FIELDS = (
    "activity_id, name, description, suburb_id, cost_per_session, archived_at, "
    "physical_demand, physical_notes, sensory_load, sensory_notes, step_free_access, "
    "min_age, max_age, joining, group_size, transport_options, bus_routes, "
    "walk_from_stop_minutes, support_worker_policy, staff_support, staff_experience, "
    "not_in_listing, providers(consent_given), suburbs(name), "
    "activity_sessions(day, start_time, end_time), activity_tags(tag_id)"
)

# What the AI may see about a client. Never sent: name, birth year, sensory_hard_limit,
# staff names (contract "Privacy boundary"). AI Matching rejects anything extra (422).
AI_CLIENT_FIELDS = [
    "travel_range_minutes",
    "goals",
    "participation_notes",
    "max_physical_demand",
    "physical_notes",
    "needs_step_free",
    "max_sensory_load",
    "sensory_notes",
    "transport",
    "support_needed",
    "max_cost",
]

AI_ACTIVITY_FIELDS = [
    "name",
    "description",
    "cost_per_session",
    "min_age",
    "max_age",
    "joining",
    "physical_demand",
    "physical_notes",
    "step_free_access",
    "sensory_load",
    "sensory_notes",
    "group_size",
    "transport_options",
    "bus_routes",
    "walk_from_stop_minutes",
    "support_worker_policy",
    "staff_support",
    "staff_experience",
    "not_in_listing",
]


def age_band(birth_year: int | None, year: int) -> str:
    """child 0-12, youth 13-17, adult 18+, from the YOUNGER possible age.
    Unknown birth year counts as adult. Same rule as ai_matching.contract.age_band."""
    if birth_year is None:
        return "adult"
    age = year - birth_year - 1
    if age <= 12:
        return "child"
    if age <= 17:
        return "youth"
    return "adult"


def hhmm(t: str) -> str:
    """"10:00:00" from the database → "10:00", the contract's time format."""
    return t[:5]


def to_ai_client(client: dict, tag_names: dict[str, str], suburb_name: str | None, year: int) -> dict:
    """The client as AI Matching may see it: allow-listed fields, tag names instead of
    ids, the suburb's name, and an age band instead of the birth year."""
    ai = {field: client.get(field) for field in AI_CLIENT_FIELDS}
    ai["goals"] = ai["goals"] or []
    ai["transport"] = ai["transport"] or []
    ai["age_band"] = age_band(client.get("birth_year"), year)
    ai["suburb"] = suburb_name
    ai["interests"] = sorted(tag_names[t] for t in client.get("interests") or [] if t in tag_names)
    ai["availability"] = client.get("availability") or []
    return ai


def to_ai_activity(activity: dict, tag_names: dict[str, str]) -> dict:
    """One shortlisted activity as AI Matching may see it."""
    ai = {field: activity.get(field) for field in AI_ACTIVITY_FIELDS}
    ai["id"] = activity["activity_id"]
    ai["transport_options"] = ai["transport_options"] or []
    ai["suburb"] = (activity.get("suburbs") or {}).get("name")
    ai["tags"] = sorted(tag_names[t] for t in activity.get("tags") or [] if t in tag_names)
    ai["sessions"] = [
        {"day": s["day"], "start": hhmm(s["start_time"]), "end": hhmm(s["end_time"])}
        for s in activity.get("activity_sessions") or []
    ]
    return ai


def to_ai_request(
    request_id: str,
    client: dict,
    shortlist: list[dict],
    tag_names: dict[str, str],
    suburb_name: str | None,
    year: int,
    limit: int = 5,
) -> dict:
    """The body for POST /match (contract v0.4). limit: D3, default 5."""
    return {
        "request_id": request_id,
        "limit": limit,
        "client": to_ai_client(client, tag_names, suburb_name, year),
        "shortlist": [to_ai_activity(a, tag_names) for a in shortlist],
    }
