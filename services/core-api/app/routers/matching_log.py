from fastapi import APIRouter, HTTPException, status

from app.deps import CurrentCaller
from app.schemas.matching_log import MatchingLogEntry

router = APIRouter(tags=["matching-log"])


@router.get("/matching-log", response_model=list[MatchingLogEntry])
def list_matching_log(caller: CurrentCaller):
    """Past AI match requests for your organisation, newest first. Coordinators only."""
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

    logs = (
        caller.db.table("matching_log")
        .select("request_id, requested_at, called_as, response_ms, result, fallback_shown, candidate_count, leads_shown, model_ms, dropped_count, profiles(first_name, last_name)")
        .order("requested_at", desc=True)
        .limit(100)
        .execute()
    )

    rows = []
    # Flatten the joined profile into requested_by_name 
    # (None if the staff row is gone)
    for row in logs.data:
        person = row.pop("profiles") or {}
        name = " ".join(n for n in (person.get("first_name"), person.get("last_name")) if n)

        rows.append({**row, "requested_by_name": name or None})
    return rows