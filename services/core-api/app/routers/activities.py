from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status
from postgrest.exceptions import APIError
from postgrest.types import ReturnMethod

from app.deps import Caller, CurrentCaller
from app.routers.clients import check_tags_exist
from app.schemas.activities import (
    ActivityCreate,
    ActivityDetail,
    ActivitySession,
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
BAD_LINK = "23503"  # a provider, suburb or tag id that doesn't exist


def require_coordinator(caller: Caller) -> None:
    """403 unless you're an active coordinator. Asks the database the same question RLS asks."""
    if not caller.db.rpc("is_coordinator").execute().data:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only coordinators can add or edit activities"
        )


def save_error(e: APIError) -> HTTPException:
    """Turn a database error into a clear message for the form."""
    if e.code == NOT_ALLOWED:
        return HTTPException(status.HTTP_403_FORBIDDEN, "Only coordinators can add or edit activities")
    if e.code == CHECK_FAILED:
        return HTTPException(status.HTTP_400_BAD_REQUEST, "Minimum age can't be above the maximum age")
    if e.code == BAD_LINK:
        return HTTPException(status.HTTP_400_BAD_REQUEST, "Check the provider and suburb")
    return HTTPException(status.HTTP_400_BAD_REQUEST, "Could not save activity")


def replace_tags(caller: Caller, activity_id: str, tag_ids: set[str]) -> None:
    caller.db.table("activity_tags").delete().eq("activity_id", activity_id).execute()
    rows = [{"activity_id": activity_id, "tag_id": t} for t in tag_ids]
    if rows:
        caller.db.table("activity_tags").insert(rows).execute()


def replace_sessions(caller: Caller, activity_id: str, sessions: list[ActivitySession]) -> None:
    caller.db.table("activity_sessions").delete().eq("activity_id", activity_id).execute()
    # The same day and times twice counts once
    unique = {(s.day, s.start_time, s.end_time) for s in sessions}
    rows = [
        {"activity_id": activity_id, "day": d, "start_time": st.isoformat(), "end_time": et.isoformat()}
        for d, st, et in unique
    ]
    if rows:
        caller.db.table("activity_sessions").insert(rows).execute()


@router.post(
    "/activities", response_model=ActivityDetail, status_code=status.HTTP_201_CREATED
)
def create_activity(body: ActivityCreate, caller: CurrentCaller):
    """Add an activity to the shared catalogue. Coordinators only."""
    require_coordinator(caller)

    # Check tags BEFORE saving anything (no half-saved activities)
    tag_ids = {str(t) for t in body.tags}
    check_tags_exist(caller, tag_ids)

    row = body.model_dump(mode="json", exclude={"tags", "sessions"})
    activity_id = str(uuid4())
    row["activity_id"] = activity_id
    row["created_by"] = caller.user_id  # the insert policy requires it to be you

    try:
        caller.db.table("activities").insert(row, returning=ReturnMethod.minimal).execute()
        replace_tags(caller, activity_id, tag_ids)
        replace_sessions(caller, activity_id, body.sessions)
    except APIError as e:
        raise save_error(e)

    return get_activity(UUID(activity_id), caller)


@router.patch("/activities/{activity_id}", response_model=ActivityDetail)
def update_activity(activity_id: UUID, body: ActivityUpdate, caller: CurrentCaller):
    """Edit an activity. Only the fields you send change. Coordinators only."""
    get_activity(activity_id, caller)  # 404 if you can't see it
    require_coordinator(caller)

    changes = body.model_dump(mode="json", exclude_unset=True, exclude={"tags", "sessions"})

    tag_ids = None
    if body.tags is not None:
        tag_ids = {str(t) for t in body.tags}
        check_tags_exist(caller, tag_ids)

    try:
        if changes:
            caller.db.table("activities").update(changes).eq(
                "activity_id", str(activity_id)
            ).execute()
        if tag_ids is not None:
            replace_tags(caller, str(activity_id), tag_ids)
        if body.sessions is not None:
            replace_sessions(caller, str(activity_id), body.sessions)
    except APIError as e:
        raise save_error(e)

    return get_activity(activity_id, caller)