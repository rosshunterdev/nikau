"""Shapes of client data sent by the API (core fields only for now)."""

from datetime import datetime

from pydantic import BaseModel

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