import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from postgrest.exceptions import APIError
from postgrest.types import ReturnMethod

from app.catalogue import nz_year
from app.config import settings
from app.deps import CurrentCaller
from app.matching import (
    CLIENT_MATCH_FIELDS,
    MATCH_ACTIVITY_FIELDS,
    call_ai_matching,
    run_match,
)
from app.schemas.matching import FindActivitiesResponse

router = APIRouter(tags=["matching"])
log = logging.getLogger(__name__)


@router.post("/clients/{client_id}/match", response_model=FindActivitiesResponse)
def find_activities(client_id: UUID, caller: CurrentCaller):
    """Find activities for a client with AI matching (SCRUM-87).
    Anyone who can see the client can run it. Every call is logged in matching_log."""

    # 1. The client (404 if you can't see it)
    res = (
        caller.db.table("clients")
        .select(CLIENT_MATCH_FIELDS)
        .eq("client_id", str(client_id))
        .maybe_single()
        .execute()
    )
    client_row = res.data if res else None
    if client_row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")

    # 2. The catalogue and the tag names (RLS already hides what you can't see)
    activity_rows = (
        caller.db.table("activities")
        .select(MATCH_ACTIVITY_FIELDS)
        .is_("archived_at", "null")
        .execute()
        .data
    )
    tag_rows = caller.db.table("tags").select("tag_id, name").execute().data

    # 3. Shortlist, ask AI Matching, prepare the log row and the reply
    log_row, reply = run_match(
        client_row,
        activity_rows,
        tag_rows,
        caller.user_id,
        nz_year(),
        call=lambda body: call_ai_matching(
            body, settings.ai_matching_url, settings.matching_service_key
        ),
    )

    # 4. Log it for RQ1. If logging fails, still give the worker their results.
    try:
        caller.db.table("matching_log").insert(log_row, returning=ReturnMethod.minimal).execute()
    except APIError as e:
        log.warning("matching_log insert failed for %s: %s", log_row["request_id"], e)

    return reply
