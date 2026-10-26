"""Spike SCRUM-63: can Gemini Flash-Lite return valid, grounded leads?

Step 1: build a POST /match request from the B2 fixtures.
"""
import json
import uuid
from pathlib import Path

from pydantic import BaseModel, Field

# --- Step 2: response models (contract v0.3 "Response 200" and "Result") ---

class Result(BaseModel):
    """One ranked lead. Field names copied exactly from the contract."""
    # str, not UUID: an invented ID shouldn't break the whole parse.
    # Step 5 drops off-shortlist IDs and counts them in dropped_count.
    activity_id: str = Field(description="Must be an id from the shortlist")
    rank: int = Field(description="1, 2, 3... with no gaps or repeats")
    why_fits: list[str] = Field(
        description="1-3 lines: how it matches the client's goals, interests or needs, using only the fields sent")
    why_doesnt_cover: list[str] = Field(
        description="0-3 lines: needs it doesn't meet, incl. sensory load above the client's level and any support worker charge")
    why_ask: list[str] = Field(
        description="0-3 lines: unknowns (null fields) to check with the provider")


class ModelOutput(BaseModel):
    """What Gemini returns. Only the part the model can know."""
    results: list[Result]


class MatchResponse(BaseModel):
    """What POST /match returns. Built by our code, not by the model."""
    request_id: str
    results: list[Result]
    model_ms: int        # we time the Gemini call
    dropped_count: int   # we count removed results in step 5

# Where am I? This file is in services/ai-matching/spikes/
# parents[3] = SD205-Nikau (checked 26 Oct: prints the repo root)
REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES = REPO_ROOT / "fixtures"

THIS_YEAR = 2026
SHORTLIST_IDS = ["a0", "b1", "b2", "b3", "b4"]   # what the pre-filter keeps for c1 (spike only; real shortlist comes from SCRUM-66)

# Privacy boundary: ALLOW-LIST of "To AI" fields.
# Only these fields leave the Core API. Anything not named here is withheld,
# so a new column is safe by default (fails closed). A block-list (copy
# everything, then remove known private fields) fails open: on 26 Oct it
# leaked sensory_hard_limit, which the contract says is never sent.
# Source: docs/api-contract.md v0.3, "Client" and "Activity" tables.
# Follow-up (SCRUM-75): move these into ai_matching/contract.py so the
# service and the Core API share one definition.

# Contract v0.3 "Client" table, minus age_band (computed from birth_year below).
TO_AI_CLIENT_FIELDS = [
    "suburb", "travel_range_minutes", "goals", "interests",
    "participation_notes", "max_physical_demand", "physical_notes",
    "needs_step_free", "max_sensory_load", "sensory_notes",
    "transport", "support_needed", "max_cost", "availability",
]

# Contract v0.3 "Activity" table.
TO_AI_ACTIVITY_FIELDS = [
    "id", "name", "description", "tags", "suburb", "sessions", "joining",
    "cost_per_session", "min_age", "max_age", "physical_demand",
    "physical_notes", "step_free_access", "sensory_load", "sensory_notes",
    "group_size", "transport_options", "bus_routes",
    "walk_from_stop_minutes", "support_worker_policy", "staff_support",
    "staff_experience", "not_in_listing",
]


def load(name):
    """Read one fixtures file and return the list inside it."""
    with open(FIXTURES / name, encoding="utf-8") as f:
        return json.load(f)


def age_band(birth_year, this_year):
    """Contract: child 0-12, youth 13-17, adult 18+, using the YOUNGER possible age."""
    # Younger possible age: assume their birthday hasn't happened yet this year.
    age = this_year - birth_year - 1
    if age <= 12:
        return "child"
    elif age <= 17:
        return "youth"
    else:
        return "adult"


def to_ai_client(client):
    """Client fields the AI is allowed to see (allow-list, contract v0.3)."""
    # Build a NEW dict from the allow-list instead of copying and removing.
    # .get() means a missing field arrives as null ("not recorded" in the
    # contract), so every request has the same shape.
    ai_client = {field: client.get(field) for field in TO_AI_CLIENT_FIELDS}
    # birth_year is read here but never sent; only the band goes to the AI.
    ai_client["age_band"] = age_band(client["birth_year"], THIS_YEAR)
    return ai_client


def to_ai_activity(activity):
    """Activity fields the AI is allowed to see (allow-list, contract v0.3)."""
    # null = unknown; the AI turns unknowns that matter into why_ask lines.
    return {field: activity.get(field) for field in TO_AI_ACTIVITY_FIELDS}


def build_request(client, activities):
    # Only the activities whose id ends with one of SHORTLIST_IDS,
    # converted with to_ai_activity.
    shortlist = []
    for a in activities:
        if a["id"][-2:] in SHORTLIST_IDS:
            shortlist.append(to_ai_activity(a))
    return {
        "request_id": str(uuid.uuid4()),
        "limit": 5,
        "client": to_ai_client(client),
        "shortlist": shortlist,
    }


if __name__ == "__main__":
    clients = load("clients.json")
    activities = load("activities.json")
    raw_client = clients[0]   # c1 (Sport and fitness only until PR #12 adds Art and craft)
    request = build_request(raw_client, activities)

    # Privacy boundary check: what did we NOT send?
    # If something the AI needs shows up here, check the contract before adding it.
    print("client fields withheld:", sorted(set(raw_client) - set(request["client"])))
    print("activity fields withheld:", sorted(set(activities[0]) - set(request["shortlist"][0])))
    assert "sensory_hard_limit" not in request["client"]
    assert "birth_year" not in request["client"] and "id" not in request["client"]

    print(json.dumps(request, indent=2))

        # Step 2 self-test: good result passes, missing field fails
    good = {"results": [{"activity_id": "x", "rank": 1, "why_fits": ["a"],
                         "why_doesnt_cover": [], "why_ask": []}]}
    print("good:", ModelOutput.model_validate(good))
    try:
        ModelOutput.model_validate({"results": [{"activity_id": "x", "rank": 1}]})
    except Exception as e:
        print("bad rejected OK:", type(e).__name__)