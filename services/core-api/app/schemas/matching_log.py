from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.enums import MatchCallType, MatchResult


class MatchingLogEntry(BaseModel):
    """One row on the Matching log page."""

    request_id: UUID
    requested_at: datetime
    called_as: MatchCallType | None
    # | None because the database column can be NULL; 
    # plain int would 500 on a null row
    response_ms: int | None
    result: MatchResult
    fallback_shown: bool
    candidate_count: int | None
    leads_shown: int | None
    model_ms: int | None
    dropped_count: int | None
    requested_by_name: str | None = None


