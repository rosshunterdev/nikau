"""Shapes of client data the API sends and receives."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.schemas.enums import ClientTransport, Day, Level, Slot, SupportNeeded

# Second-pass fields (SCRUM-94). Limits match the database: up to 5 goals,
# travel range above 0. Notes describe needs, not diagnoses (contract "Privacy boundary").
Goal = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
NOTES_FIELDS = ("participation_notes", "physical_notes", "sensory_notes")


def blank_to_none(value):
    """An empty notes box means 'no notes', so it's saved as empty, not as ''."""
    if isinstance(value, str) and not value.strip():
        return None
    return value


class AvailabilitySlot(BaseModel):
    """One time the client is free, e.g. Monday morning."""

    day: Day
    slot: Slot


class ClientSummary(BaseModel):
    """One row in the client list."""

    client_id: str
    preferred_name: str
    suburb_name: str | None = None
    updated_at: datetime


class ClientDetail(BaseModel):
    """One client in full, for the edit form. Empty values mean 'not known yet'."""

    client_id: str
    preferred_name: str
    suburb_id: str | None = None
    birth_year: int | None = None
    support_needed: SupportNeeded | None = None
    max_physical_demand: Level | None = None
    needs_step_free: bool | None = None
    max_sensory_load: Level | None = None
    sensory_hard_limit: bool = False
    transport: list[ClientTransport] = []
    max_cost: float | None = None
    goals: list[str] = []
    participation_notes: str | None = None
    physical_notes: str | None = None
    sensory_notes: str | None = None
    travel_range_minutes: int | None = None
    interests: list[str] = []  # tag ids
    availability: list[AvailabilitySlot] = []
    updated_at: datetime


class ClientCreate(BaseModel):
    """What the 'Add a client' form sends.
    Name, support needed and both levels are required (matches the form)."""

    preferred_name: str = Field(min_length=1, max_length=100)
    suburb_id: UUID | None = None
    birth_year: int | None = Field(default=None, ge=1900, le=2100)
    support_needed: SupportNeeded
    max_physical_demand: Level
    needs_step_free: bool | None = None
    max_sensory_load: Level
    sensory_hard_limit: bool = False
    transport: list[ClientTransport] = []
    max_cost: float | None = Field(default=None, ge=0)
    goals: list[Goal] = Field(default=[], max_length=5)
    participation_notes: Notes | None = None
    physical_notes: Notes | None = None
    sensory_notes: Notes | None = None
    travel_range_minutes: int | None = Field(default=None, gt=0)
    interests: list[UUID] = []  # tag ids
    availability: list[AvailabilitySlot] = []

    _blank_notes = field_validator(*NOTES_FIELDS, mode="before")(blank_to_none)


class ClientUpdate(BaseModel):
    """Edit a client. Only the fields you send are changed.
    Sending interests or availability replaces the whole list.
    Required fields can be left out, but not cleared with null."""

    preferred_name: str | None = Field(None, min_length=1, max_length=100)
    suburb_id: UUID | None = None
    birth_year: int | None = Field(None, ge=1900, le=2100)
    support_needed: SupportNeeded | None = None
    max_physical_demand: Level | None = None
    needs_step_free: bool | None = None
    max_sensory_load: Level | None = None
    sensory_hard_limit: bool | None = None
    transport: list[ClientTransport] | None = None
    max_cost: float | None = Field(None, ge=0)
    goals: list[Goal] | None = Field(None, max_length=5)
    participation_notes: Notes | None = None
    physical_notes: Notes | None = None
    sensory_notes: Notes | None = None
    travel_range_minutes: int | None = Field(None, gt=0)
    interests: list[UUID] | None = None
    availability: list[AvailabilitySlot] | None = None

    _blank_notes = field_validator(*NOTES_FIELDS, mode="before")(blank_to_none)

    @field_validator(
        "preferred_name", "support_needed", "max_physical_demand", "max_sensory_load"
    )
    @classmethod
    def cannot_be_cleared(cls, value):
        if value is None:
            raise ValueError("is required and can't be cleared")
        return value
