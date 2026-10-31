"""Pre-filter (SCRUM-66): the hard rules that build the shortlist before AI Matching.

Rule 0 (archived) plus the nine filter rules from the SCRUM-50 v0.3 doc. An activity
is removed only when BOTH values in a rule are known. Unknown or empty values never
remove an activity: it's kept, and the AI turns the gap into a "why_ask" line.

Pure functions, no database: they take the client and activities in the fixtures
shape (fixtures/README.md), so they can be tested without Supabase. The Core API
maps its rows into this shape before calling them.
"""

LEVELS = {"low": 0, "medium": 1, "high": 2}

# Client transport values that mean "only bus or train"
BUS_OR_TRAIN = {"bus_train_with_worker", "bus_train_alone"}

# Client support levels that need a support worker in the room
NEEDS_WORKER = {"worker_present", "one_to_one"}


def time_slot(start: str) -> str:
    """Slot from a start time "HH:MM".

    morning = before 12:00, afternoon = 12:00 to 16:59, evening = 17:00 or later.
    """
    hour = int(start.split(":")[0])
    if hour < 12:
        return "morning"
    if hour < 17:
        return "afternoon"
    return "evening"


def above(level: str | None, limit: str | None) -> bool:
    """True if level is higher than limit. False if either is unknown."""
    if level is None or limit is None:
        return False
    return LEVELS[level] > LEVELS[limit]


def excluded_by(client: dict, activity: dict, current_year: int) -> str | None:
    """The first rule that removes this activity for this client, or None if kept."""

    # 0. Archived: no longer in the catalogue
    if activity.get("archived_at"):
        return "archived"

    # 1. Consent: always hidden until the provider consents (null counts as no)
    if not activity.get("consent_given"):
        return "consent"

    # 2. Physical demand above the client's maximum
    if above(activity.get("physical_demand"), client.get("max_physical_demand")):
        return "physical"

    # 3. Sensory load above the client's maximum, only with a hard limit
    if client.get("sensory_hard_limit") and above(
        activity.get("sensory_load"), client.get("max_sensory_load")
    ):
        return "sensory"

    # 4. Step-free: client needs it and the activity is known NOT to have it
    needs_step_free = client.get("needs_step_free") is True
    if needs_step_free and activity.get("step_free_access") is False:
        return "step_free"

    # 5. Cost above the client's maximum (equal is fine)
    cost, max_cost = activity.get("cost_per_session"), client.get("max_cost")
    if cost is not None and max_cost is not None and cost > max_cost:
        return "cost"

    # 6. Schedule: no session starts in a day + slot the client is available
    availability = {(a["day"], a["slot"]) for a in client.get("availability") or []}
    sessions = activity.get("sessions") or []
    if (
        availability
        and sessions
        and not any((s["day"], time_slot(s["start"])) in availability for s in sessions)
    ):
        return "schedule"

    # 7. Age: removed only if EVERY age the client could be this year is outside
    # the range. Born in birth_year, they're current_year - birth_year - 1 (birthday
    # not yet) or current_year - birth_year (birthday passed).
    birth_year = client.get("birth_year")
    if birth_year is not None:
        youngest = current_year - birth_year - 1
        oldest = current_year - birth_year
        min_age, max_age = activity.get("min_age"), activity.get("max_age")
        if min_age is not None and oldest < min_age:
            return "age"
        if max_age is not None and youngest > max_age:
            return "age"

    # 8. Transport: client only travels by bus or train, and it isn't on a bus route
    transport = set(client.get("transport") or [])
    options = activity.get("transport_options") or []
    bus_only = bool(transport) and transport <= BUS_OR_TRAIN
    if bus_only and options and "bus_route" not in options:
        return "transport"

    # 9. Support: client needs a worker present and support workers aren't allowed
    if (
        client.get("support_needed") in NEEDS_WORKER
        and activity.get("support_worker_policy") == "not_allowed"
    ):
        return "support"

    return None


def prefilter(client: dict, activities: list[dict], current_year: int) -> list[dict]:
    """Activities that pass every rule for this client, in their original order."""
    return [a for a in activities if excluded_by(client, a, current_year) is None]
