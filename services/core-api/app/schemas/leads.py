"""Shapes of saved lead data the API sends and receives."""

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.enums import LeadSource


class LeadCreate(BaseModel):
    """Save an activity as a lead for a client.
    From the catalogue: source manual_search, nothing else.
    From AI results: source ai_match, the match request id and the AI's explanation."""

    activity_id: UUID
    source: LeadSource
    match_request_id: UUID | None = None
    why_fits: list[str] = Field(default=[], max_length=3)
    why_doesnt_cover: list[str] = Field(default=[], max_length=3)
    why_ask: list[str] = Field(default=[], max_length=3)

    @model_validator(mode="after")
    def matches_source(self) -> Self:
        has_ai_text = self.why_fits or self.why_doesnt_cover or self.why_ask
        if self.source == "manual_search":
            if has_ai_text or self.match_request_id:
                raise ValueError("A manual search lead has no AI explanation or match request")
        elif not self.match_request_id or not self.why_fits:
            raise ValueError("An AI match lead needs its match request and at least one why_fits line")
        return self


class LeadDetail(BaseModel):
    """One saved lead. activity_name is empty when the activity is no longer listed
    (e.g. the provider withdrew consent), so the screen can say so."""

    lead_id: str
    client_id: str
    activity_id: str
    activity_name: str | None = None
    provider_name: str | None = None
    source: LeadSource
    why_fits: list[str] = []
    why_doesnt_cover: list[str] = []
    why_ask: list[str] = []
    match_request_id: str | None = None
    saved_by_name: str | None = None
    saved_on: datetime


class LeadWithClient(LeadDetail):
    """A lead on the Saved leads page, which lists every client's leads."""

    client_name: str
