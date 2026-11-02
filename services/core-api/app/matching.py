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
