"""Shapes of client data the API sends and receives (core fields only for now)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.enums import ClientTransport, Day, Level, Slot, SupportNeeded


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
    interests: list[str] = []  # tag ids
    availability: list[AvailabilitySlot] = []
    updated_at: datetime


class ClientCreate(BaseModel):
    """What the 'Add a client' form sends. Only the name is required."""

    preferred_name: str = Field(min_length=1, max_length=100)
    suburb_id: UUID | None = None
    birth_year: int | None = Field(default=None, ge=1900, le=2100)
    support_needed: SupportNeeded | None = None
    max_physical_demand: Level | None = None
    needs_step_free: bool | None = None
    max_sensory_load: Level | None = None
    sensory_hard_limit: bool = False
    transport: list[ClientTransport] = []
    max_cost: float | None = Field(default=None, ge=0)
    interests: list[UUID] = []  # tag ids
    availability: list[AvailabilitySlot] = []


class ClientUpdate(BaseModel):
    """Edit a client. Only the fields you send are changed.
    Sending interests or availability replaces the whole list."""

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
    interests: list[UUID] | None = None
    availability: list[AvailabilitySlot] | None = None
