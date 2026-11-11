import logging
from uuid import UUID

import httpx
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
    has_something_to_match,
    reply_when_log_failed,
    run_match,
)
from app.schemas.matching import FindActivitiesResponse

router = APIRouter(tags=["matching"])
log = logging.getLogger(__name__)


def save_match_log(db, row: dict) -> None:
    """Save the matching_log row. A function of its own so tests can make it fail (SCRUM-122)."""
    db.table("matching_log").insert(row, returning=ReturnMethod.minimal).execute()


@router.post("/clients/{client_id}/match", response_model=FindActivitiesResponse)
def find_activities(client_id: UUID, caller: CurrentCaller):
    """Find activities for a client with AI matching (SCRUM-87).
    Anyone who can see the client can run it. Every match that runs is logged in matching_log."""

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

    # 2. Nothing to match on: stop before the AI call and the log (SCRUM-125).
    # The app already hides the button; this also covers direct API calls.
    if not has_something_to_match(client_row):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Add interests or goals to this client's profile to get suggestions.",
        )
    
    # 3. The catalogue and the tag names (RLS already hides what you can't see)
    activity_rows = (
        caller.db.table("activities")
        .select(MATCH_ACTIVITY_FIELDS)
        .is_("archived_at", "null")
        .execute()
        .data
    )
    tag_rows = caller.db.table("tags").select("tag_id, name").execute().data

    # 4. Shortlist, ask AI Matching, prepare the log row and the reply
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

    # 5. Log it for RQ1. Saved leads point to this row, so if it isn't saved
    # the leads couldn't be saved either: show the fallback instead (SCRUM-106).
    try:
        save_match_log(caller.db, log_row)
    except (APIError, httpx.HTTPError) as e:
        log.warning("matching_log insert failed for %s: %s", log_row["request_id"], e)
        reply = reply_when_log_failed(reply)

    return reply
