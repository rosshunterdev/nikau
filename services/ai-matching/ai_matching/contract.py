"""Core API <-> AI Matching contract v0.4 (docs/api-contract.md), as Pydantic models.

Both the HTTP endpoint (app/main.py) and the direct call (service.match) use these
same models, so both paths send and receive identical data (contract, "Direct call").

Privacy boundary: the request models FORBID extra fields. If the Core API ever sends
something outside the contract (birth_year, preferred_name, sensory_hard_limit...),
the request is rejected with 422 instead of the field silently reaching Gemini.
The Core API builds requests with to_ai_client / to_ai_activity (allow-lists).
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CONTRACT_VERSION = "0.4"

Level = Literal["low", "medium", "high"]
Day = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
Slot = Literal["morning", "afternoon", "evening"]
ClientTransport = Literal[
    "bus_train_with_worker", "bus_train_alone", "worker_drives", "mobility_taxi"
]
SupportNeeded = Literal["own", "worker_present", "one_to_one"]
Joining = Literal["drop_in", "book_ahead", "term_enrolment", "waitlist"]
GroupSize = Literal["under_10", "10_to_20", "over_20"]
ActivityTransport = Literal["bus_route", "mobility_parking", "door_drop_off"]
SupportWorkerPolicy = Literal["attend_free", "attend_with_charge", "not_allowed"]
StaffSupport = Literal["staff_can_assist", "bring_own_support"]
AgeBand = Literal["child", "youth", "adult"]

DEFAULT_LIMIT = 5  # D3
MAX_LIMIT = 10  # D3
MAX_SHORTLIST = 30  # D2
MAX_LINES = 3  # each why_* list has at most 3 lines


class Strict(BaseModel):
    """Request models: unknown fields are an error (privacy boundary, fails closed)."""

    model_config = ConfigDict(extra="forbid")


# --- Request ---


class Availability(Strict):
    day: Day
    slot: Slot


class Session(Strict):
    day: Day
    start: str = Field(pattern=r"^\d{2}:\d{2}$")
    end: str = Field(pattern=r"^\d{2}:\d{2}$")


class Client(Strict):
    """Every field except age_band may be null or empty ("not recorded")."""

    age_band: AgeBand
    suburb: str | None = None
    travel_range_minutes: int | None = Field(default=None, ge=0)
    goals: list[str] = Field(default_factory=list, max_length=5)
    interests: list[str] = Field(default_factory=list)
    participation_notes: str | None = None
    max_physical_demand: Level | None = None
    physical_notes: str | None = None
    needs_step_free: bool | None = None
    max_sensory_load: Level | None = None
    sensory_notes: str | None = None
    transport: list[ClientTransport] = Field(default_factory=list)
    support_needed: SupportNeeded | None = None
    max_cost: float | None = Field(default=None, ge=0)
    availability: list[Availability] = Field(default_factory=list)

    @field_validator("goals", "interests", "transport", "availability", mode="before")
    @classmethod
    def null_list_is_empty(cls, v):
        return [] if v is None else v


class Activity(Strict):
    """null means unknown. The AI turns unknowns that matter into why_ask lines."""

    id: str
    name: str
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    suburb: str | None = None
    sessions: list[Session] = Field(default_factory=list)
    joining: Joining | None = None
    cost_per_session: float | None = Field(default=None, ge=0)
    min_age: int | None = Field(default=None, ge=0)
    max_age: int | None = Field(default=None, ge=0)
    physical_demand: Level | None = None
    physical_notes: str | None = None
    step_free_access: bool | None = None
    sensory_load: Level | None = None
    sensory_notes: str | None = None
    group_size: GroupSize | None = None
    transport_options: list[ActivityTransport] = Field(default_factory=list)
    bus_routes: str | None = None
    walk_from_stop_minutes: int | None = Field(default=None, ge=0)
    support_worker_policy: SupportWorkerPolicy | None = None
    staff_support: StaffSupport | None = None
    staff_experience: bool | None = None
    not_in_listing: str | None = None

    @field_validator("tags", "sessions", "transport_options", mode="before")
    @classmethod
    def null_list_is_empty(cls, v):
        return [] if v is None else v


class MatchRequest(Strict):
    request_id: str
    limit: int = Field(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT)
    client: Client
    shortlist: list[Activity] = Field(min_length=1, max_length=MAX_SHORTLIST)

    @field_validator("shortlist")
    @classmethod
    def unique_ids(cls, shortlist):
        ids = [a.id for a in shortlist]
        if len(ids) != len(set(ids)):
            raise ValueError("shortlist ids must be unique")
        return shortlist


# --- Response ---


class Result(BaseModel):
    """One ranked lead. Also the shape Gemini must return (structured output)."""

    # str, not UUID: an invented id shouldn't break the whole parse.
    # check_results drops off-shortlist ids and counts them in dropped_count.
    activity_id: str = Field(description="Must be an id from the shortlist")
    rank: int = Field(description="1, 2, 3... with no gaps or repeats")
    why_fits: list[str] = Field(
        description="1-3 lines: how it matches the client's goals, interests "
        "or needs, using only the fields sent"
    )
    why_doesnt_cover: list[str] = Field(
        description="0-3 lines: needs it doesn't meet, incl. sensory load above "
        "the client's level and any support worker charge"
    )
    why_ask: list[str] = Field(
        description="0-3 lines: unknowns (null fields) to check with the provider"
    )


class ModelOutput(BaseModel):
    """What Gemini returns. Only the part the model can know."""

    results: list[Result]


class MatchResponse(BaseModel):
    """What POST /match returns. Built by our code, not by the model.

    v0.4: results may be empty (0 to limit). Empty = the model found no good fit;
    the Core API logs it as no_good_fit.
    """

    request_id: str
    results: list[Result]
    model_ms: int
    dropped_count: int


# --- Errors ---

ErrorCode = Literal["unauthorized", "invalid_request", "model_error", "invalid_output"]


class MatchError(Exception):
    """Raised by the direct call; the HTTP endpoint turns it into an error body."""

    def __init__(self, code: ErrorCode, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


# --- Allow-lists, for the Core API to build a request ---
# Build a NEW dict from the allow-list instead of copying and removing, so a new
# column is withheld by default (fails closed).

TO_AI_CLIENT_FIELDS = [f for f in Client.model_fields if f != "age_band"]
TO_AI_ACTIVITY_FIELDS = list(Activity.model_fields)


def age_band(birth_year: int | None, current_year: int) -> AgeBand:
    """child 0-12, youth 13-17, adult 18+, using the YOUNGER possible age.

    Unknown birth year counts as adult (the contract requires a band).
    """
    if birth_year is None:
        return "adult"
    age = current_year - birth_year - 1
    if age <= 12:
        return "child"
    if age <= 17:
        return "youth"
    return "adult"


def to_ai_client(client: dict, current_year: int) -> dict:
    """Client fields the AI may see. birth_year is read but never sent."""
    ai_client = {field: client.get(field) for field in TO_AI_CLIENT_FIELDS}
    ai_client["age_band"] = age_band(client.get("birth_year"), current_year)
    return ai_client


def to_ai_activity(activity: dict) -> dict:
    """Activity fields the AI may see."""
    return {field: activity.get(field) for field in TO_AI_ACTIVITY_FIELDS}
