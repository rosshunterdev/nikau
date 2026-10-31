"""Catalogue rows from the database, in the shape the pre-filter expects.

Shared by the catalogue search (SCRUM-86) and the match endpoint (SCRUM-87),
so both judge an activity with exactly the same rules (app/prefilter.py).
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.prefilter import prefilter

# Everything the pre-filter rules read, plus what the activity list shows
PREFILTER_FIELDS = (
    "activity_id, name, suburb_id, cost_per_session, updated_at, archived_at, "
    "physical_demand, sensory_load, step_free_access, min_age, max_age, "
    "transport_options, support_worker_policy, "
    "providers(name, consent_given), suburbs(name), "
    "activity_sessions(day, start_time), activity_tags(tag_id)"
)


def to_prefilter_activity(row: dict) -> dict:
    """Add what the pre-filter expects to a database row:
    consent_given from the provider, and sessions as {"day", "start"}."""
    provider = row.get("providers") or {}
    return {
        **row,
        "consent_given": provider.get("consent_given"),
        "sessions": [
            {"day": s["day"], "start": s["start_time"]}
            for s in row.get("activity_sessions") or []
        ],
        "tags": [t["tag_id"] for t in row.get("activity_tags") or []],
    }


def nz_year() -> int:
    """This year in New Zealand. The server runs on UTC, which is still
    last year until 1 pm on 1 January in NZ."""
    return datetime.now(ZoneInfo("Pacific/Auckland")).year

def search_catalogue(
    rows: list[dict],
    needs: dict,
    year: int,
    q: str | None = None,
    suburb_id: str | None = None,
    tags: list[str] | None = None,
) -> list[dict]:
    """Catalogue activities that fit the given needs, then the extra filters.

    needs uses the client's field names (max_physical_demand, availability...),
    so the same pre-filter rules apply, and unknown values never exclude.
    """
    activities = [to_prefilter_activity(row) for row in rows]
    kept = prefilter(needs, activities, year)

    # Name contains the search text, ignoring capitals
    if q:
        text = q.casefold()
        kept = [a for a in kept if text in a["name"].casefold()]

    # In the chosen suburb, or suburb not known yet
    if suburb_id:
        kept = [a for a in kept if a.get("suburb_id") in (suburb_id, None)]

    # Shares at least one chosen tag, or has no tags yet
    if tags:
        wanted = set(tags)
        kept = [a for a in kept if not a["tags"] or wanted & set(a["tags"])]

    return kept