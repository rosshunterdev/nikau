"""Shapes of activity data the API sends and receives (pass 1: the fields matching needs)."""

from datetime import date, datetime, time
from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.enums import ActivityTransport, Day, Level, SupportWorkerPolicy


class ActivitySession(BaseModel):
    """One time the activity runs, e.g. Tuesday 10:00 to 11:30."""

    day: Day
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def ends_after_start(self) -> Self:
        if self.end_time <= self.start_time:
            raise ValueError("A session must end after it starts")
        return self


class ActivitySummary(BaseModel):
    """One row in the activity list."""

    activity_id: str
    name: str
    provider_name: str
    suburb_name: str | None = None
    cost_per_session: float | None = None
    updated_at: datetime


class ActivityDetail(BaseModel):
    """One activity in full, for the edit form. Empty values mean 'not known yet'."""

    activity_id: str
    provider_id: str
    name: str
    description: str | None = None
    suburb_id: str | None = None
    physical_demand: Level | None = None
    sensory_load: Level | None = None
    step_free_access: bool | None = None
    cost_per_session: float | None = None
    min_age: int | None = None
    max_age: int | None = None
    transport_options: list[ActivityTransport] = []
    support_worker_policy: SupportWorkerPolicy | None = None
    checked_at: date | None = None
    checked_by: str | None = None  # set by the database (SCRUM-82)
    tags: list[str] = []  # tag ids
    sessions: list[ActivitySession] = []
    updated_at: datetime


class ActivityCreate(BaseModel):
    """What the 'Add an activity' form sends. Only the name and provider are required."""

    provider_id: UUID
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    suburb_id: UUID | None = None
    physical_demand: Level | None = None
    sensory_load: Level | None = None
    step_free_access: bool | None = None
    cost_per_session: float | None = Field(default=None, ge=0)
    min_age: int | None = Field(default=None, ge=0, le=120)
    max_age: int | None = Field(default=None, ge=0, le=120)
    transport_options: list[ActivityTransport] = []
    support_worker_policy: SupportWorkerPolicy | None = None
    checked_at: date | None = None
    tags: list[UUID] = []
    sessions: list[ActivitySession] = []

    @model_validator(mode="after")
    def age_range_valid(self) -> Self:
        """Same rule as the database: minimum age can't be above the maximum."""
        if self.min_age is not None and self.max_age is not None and self.min_age > self.max_age:
            raise ValueError("Minimum age can't be above the maximum age")
        return self


class ActivityUpdate(BaseModel):
    """What the edit form sends. Every field is optional: only sent fields change."""

    provider_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    suburb_id: UUID | None = None
    physical_demand: Level | None = None
    sensory_load: Level | None = None
    step_free_access: bool | None = None
    cost_per_session: float | None = Field(default=None, ge=0)
    min_age: int | None = Field(default=None, ge=0, le=120)
    max_age: int | None = Field(default=None, ge=0, le=120)
    transport_options: list[ActivityTransport] | None = None
    support_worker_policy: SupportWorkerPolicy | None = None
    checked_at: date | None = None
    tags: list[UUID] | None = None
    sessions: list[ActivitySession] | None = None

    @field_validator("provider_id", "name")
    @classmethod
    def cannot_be_cleared(cls, value):
        if value is None:
            raise ValueError("is required and can't be cleared")
        return value