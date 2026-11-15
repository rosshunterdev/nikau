from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.deps import CurrentCaller
from app.schemas.matching_log import MatchingLogEntry

router = APIRouter(tags=["matching-log"])

LOG_FIELDS = (
    "request_id, requested_at, called_as, response_ms, result, fallback_shown, "
    "candidate_count, leads_shown, model_ms, dropped_count"
)

# Safety cap on rows in one period (SCRUM-129 fix 10)
MAX_ROWS = 5000


@router.get("/matching-log", response_model=list[MatchingLogEntry])
def list_matching_log(
    caller: CurrentCaller,
    days: Annotated[int, Query(ge=1, le=365)] = 7,
):
    """Match requests for your organisation in the last `days` days, newest first.
    Coordinators only. No client or staff details: the page is about speed and outcome."""
    res = (
        caller.db.table("profiles")
        .select("role")
        .eq("user_id", caller.user_id)
        .maybe_single()
        .execute()
    )
    profile = res.data if res else None
    if profile is None or profile["role"] != "coordinator":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only coordinators can view the matching log"
        )

    since = datetime.now(UTC) - timedelta(days=days)
    logs = (
        caller.db.table("matching_log")
        .select(LOG_FIELDS)
        .gte("requested_at", since.isoformat())
        .order("requested_at", desc=True)
        .limit(MAX_ROWS)
        .execute()
    )
    return logs.data
