"""Shapes of the match endpoint's reply (SCRUM-87)."""

from typing import Literal

from pydantic import BaseModel

MatchResult = Literal["success", "no_good_fit", "no_candidates", "timeout", "error", "invalid_output"]


class MatchLead(BaseModel):
    """One AI suggestion, ready to show and to save as a lead (SCRUM-85)."""

    activity_id: str
    activity_name: str
    rank: int
    why_fits: list[str]
    why_doesnt_cover: list[str] = []
    why_ask: list[str] = []


class FindActivitiesResponse(BaseModel):
    """success: leads to show. Anything else: show message and open the catalogue
    pre-filled from the client (the fallback, SCRUM-86)."""

    request_id: str
    result: MatchResult
    message: str | None = None
    leads: list[MatchLead] = []
