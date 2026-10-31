from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from postgrest.exceptions import APIError

from app.deps import Caller, CurrentCaller
from app.schemas.activities import (
    ActivityCreate,
    ActivityDetail,
    ActivitySummary,
    ActivityUpdate,
)

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
        return HTTPException(
            status.HTTP_400_BAD_REQUEST, "Check the ages and session times"
        )
    if e.code == BAD_LINK:
        return HTTPException(
            status.HTTP_400_BAD_REQUEST, "Check the provider, suburb and interests"
        )
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
