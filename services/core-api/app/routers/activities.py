from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from postgrest.exceptions import APIError
from pydantic import StringConstraints

from app.catalogue import PREFILTER_FIELDS, nz_year, search_catalogue
from app.deps import Caller, CurrentCaller
from app.schemas.activities import (
    ActivityCreate,
    ActivityDetail,
    ActivitySummary,
    ActivityUpdate,
)
from app.schemas.enums import ClientTransport, Level, SupportNeeded

router = APIRouter(tags=["activities"])

# The activity columns the pass-1 form uses
ACTIVITY_FIELDS = (
    "activity_id, provider_id, name, description, suburb_id, physical_demand, "
    "sensory_load, step_free_access, cost_per_session, min_age, max_age, "
    "transport_options, support_worker_policy, checked_at, checked_by, updated_at"
)

# Days in week order, so sessions sort Monday first (not alphabetically)
DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def to_detail(row: dict) -> dict:
    """Reshape a database row (with its linked tables) into the ActivityDetail shape."""
    row["tags"] = [item["tag_id"] for item in row.pop("activity_tags")]
    sessions = row.pop("activity_sessions")
    row["sessions"] = sorted(
        sessions, key=lambda s: (DAY_ORDER.index(s["day"]), s["start_time"])
    )
    row["transport_options"] = row["transport_options"] or []
    return row


@router.get("/activities", response_model=list[ActivitySummary])
def list_activities(caller: CurrentCaller):
    """Activities in the catalogue, A to Z. Archived ones are left out.
    Coordinators see all; other staff only activities from consented providers (RLS)."""
    res = (
        caller.db.table("activities")
        .select("activity_id, name, cost_per_session, updated_at, providers(name), suburbs(name)")
        .is_("archived_at", "null")
        .order("name")
        .execute()
    )

    activities = []
    for row in res.data:
        provider = row.pop("providers") or {}
        suburb = row.pop("suburbs") or {}
        activities.append(
            {**row, "provider_name": provider.get("name"), "suburb_name": suburb.get("name")}
        )
    return activities

# "mon-morning", "sat-evening"...: one day and time the client is free
AVAILABLE_PATTERN = r"^(mon|tue|wed|thu|fri|sat|sun)-(morning|afternoon|evening)$"

# The pattern applies to each item in the list, not to the list itself
Available = Annotated[str, StringConstraints(pattern=AVAILABLE_PATTERN)]


# Declared before /activities/{activity_id}, or FastAPI would read "search" as an id
@router.get("/activities/search", response_model=list[ActivitySummary])
def search_activities(
    caller: CurrentCaller,
    q: Annotated[str | None, Query(max_length=100)] = None,
    suburb_id: UUID | None = None,
    tags: Annotated[list[UUID] | None, Query()] = None,
    max_physical_demand: Level | None = None,
    max_sensory_load: Level | None = None,
    sensory_hard_limit: bool = False,
    needs_step_free: bool = False,
    max_cost: Annotated[float | None, Query(ge=0)] = None,
    birth_year: Annotated[int | None, Query(ge=1900, le=2100)] = None,
    transport: Annotated[list[ClientTransport] | None, Query()] = None,
    support_needed: SupportNeeded | None = None,
    available: Annotated[list[Available] | None, Query()] = None,
):
    """The catalogue search, also the fallback when AI matching is unavailable (SCRUM-86).

    The needs filters use the client's field names, so a client's needs can be passed
    straight in, and the same pre-filter rules apply as for AI matching (SCRUM-66).
    Unknown values never exclude an activity. Archived activities, and activities
    whose provider hasn't consented, are always left out.
    """
    res = (
        caller.db.table("activities")
        .select(PREFILTER_FIELDS)
        .is_("archived_at", "null")
        .order("name")
        .execute()
    )

    # The search filters, shaped like a client
    needs = {
        "max_physical_demand": max_physical_demand,
        "max_sensory_load": max_sensory_load,
        "sensory_hard_limit": sensory_hard_limit,
        "needs_step_free": needs_step_free,
        "max_cost": max_cost,
        "birth_year": birth_year,
        "transport": transport or [],
        "support_needed": support_needed,
        "availability": [
            {"day": day, "slot": slot}
            for day, slot in (item.split("-") for item in available or [])
        ],
    }

    kept = search_catalogue(
        res.data,
        needs,
        nz_year(),
        q=q,
        suburb_id=str(suburb_id) if suburb_id else None,
        tags=[str(t) for t in tags or []],
    )

    return [
        {
            **a,
            "provider_name": (a.get("providers") or {}).get("name"),
            "suburb_name": (a.get("suburbs") or {}).get("name"),
        }
        for a in kept
    ]


@router.get("/activities/{activity_id}", response_model=ActivityDetail)
def get_activity(activity_id: UUID, caller: CurrentCaller):
    """One activity in full. 404 if it doesn't exist or you're not allowed to see it."""
    res = (
        caller.db.table("activities")
        .select(
            f"{ACTIVITY_FIELDS}, activity_tags(tag_id), "
            "activity_sessions(day, start_time, end_time)"
        )
        .eq("activity_id", str(activity_id))
        .maybe_single()
        .execute()
    )
    row = res.data if res else None
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activity not found")
    return to_detail(row)

# Postgres error codes we turn into clear messages
NOT_ALLOWED = "42501"  # RLS blocked it
CHECK_FAILED = "23514"  # a table rule failed, e.g. min age above max age
NOT_FOUND = "P0002"  # the activity doesn't exist, or you can't see it
BAD_LINK = "23503"  # a provider, suburb or tag id that doesn't exist


def require_coordinator(caller: Caller) -> None:
    """403 unless you're an active coordinator. Asks the database the same question RLS asks."""
    if not caller.db.rpc("is_coordinator").execute().data:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only coordinators can add or edit activities"
        )

def save_error(e: APIError) -> HTTPException:
    """Turn a database error from the save functions into a clear message for the form."""
    if e.code == NOT_FOUND:
        return HTTPException(status.HTTP_404_NOT_FOUND, "Activity not found")
    if e.code == NOT_ALLOWED:
        return HTTPException(status.HTTP_403_FORBIDDEN, "Only coordinators can add or edit activities")
    if e.code == CHECK_FAILED:
        if "session_ends_after_start" in (e.message or ""):
            return HTTPException(status.HTTP_400_BAD_REQUEST, "A session must end after it starts")
        return HTTPException(
            status.HTTP_400_BAD_REQUEST, "Minimum age can't be above the maximum age"
        )
    if e.code == BAD_LINK:
        text = e.message or ""
        if "tag_id" in text:
            return HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown interest tag")
        if "suburb_id" in text:
            return HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown suburb")
        return HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown provider")
    return HTTPException(status.HTTP_400_BAD_REQUEST, "Could not save activity")

@router.post(
    "/activities", response_model=ActivityDetail, status_code=status.HTTP_201_CREATED
)
def create_activity(body: ActivityCreate, caller: CurrentCaller):
    """Add an activity with its tags and sessions, all or nothing (SCRUM-88).
    Coordinators only. The database sets the creator from your sign-in."""
    require_coordinator(caller)

    data = body.model_dump(mode="json")
    tags = data.pop("tags")
    sessions = data.pop("sessions")

    try:
        res = caller.db.rpc(
            "create_activity_full",
            {"p_activity": data, "p_tags": tags, "p_sessions": sessions},
        ).execute()
    except APIError as e:
        raise save_error(e)

    return get_activity(UUID(res.data), caller)


@router.patch("/activities/{activity_id}", response_model=ActivityDetail)
def update_activity(activity_id: UUID, body: ActivityUpdate, caller: CurrentCaller):
    """Edit an activity, all or nothing (SCRUM-88). Only the fields you send change.
    Sending tags or sessions replaces the whole list. Coordinators only."""
    get_activity(activity_id, caller)  # 404 if you can't see it
    require_coordinator(caller)

    data = body.model_dump(mode="json", exclude_unset=True)
    tags = data.pop("tags", None)  # None = not sent, leave them alone
    sessions = data.pop("sessions", None)

    try:
        caller.db.rpc(
            "update_activity_full",
            {
                "p_activity_id": str(activity_id),
                "p_changes": data,
                "p_tags": tags,
                "p_sessions": sessions,
            },
        ).execute()
    except APIError as e:
        raise save_error(e)

    return get_activity(activity_id, caller)
