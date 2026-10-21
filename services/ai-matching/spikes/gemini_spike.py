"""Spike SCRUM-63: can Gemini Flash-Lite return valid, grounded leads?

Step 1: build a POST /match request from the B2 fixtures.
"""
import json
import uuid
from pathlib import Path

# Where am I? This file is in services/ai-matching/spikes/
REPO_ROOT = Path(__file__).resolve().parents[3]   # TODO: check this points at SD205-Nikau
FIXTURES = REPO_ROOT / "fixtures"

THIS_YEAR = 2026
SHORTLIST_IDS = ["a0", "b1", "b2", "b3", "b4"]   # what the pre-filter keeps for c1


def load(name):
    """Read one fixtures file and return the list inside it."""
    # TODO: open FIXTURES / name and return json.load(...)
    with open(FIXTURES / name, encoding="utf-8") as f:
        return json.load(f)
    ...


def age_band(birth_year, this_year):
    """Contract: child 0-12, youth 13-17, adult 18+, using the YOUNGER possible age."""
    # TODO: work out the younger possible age, then return "child", "youth" or "adult"
    
    age = this_year - birth_year - 1
    if age <= 12:
        return "child"
    elif age <= 17:
        return "youth"
    else:
        return "adult"
    ...


def to_ai_client(client):
    """Client fields the AI is allowed to see."""
    # TODO: copy the client, remove "id" and "birth_year", add "age_band"


    ai_client = dict(client)
    ai_client.pop("id", None)
    birth_year = ai_client.pop("birth_year")
    ai_client["age_band"] = age_band(birth_year, THIS_YEAR)
    return ai_client
    ...


def to_ai_activity(activity):
    """Activity fields the AI is allowed to see."""
    # TODO: copy the activity, remove "consent_given"
    ai_activity = dict(activity)
    ai_activity.pop("consent_given", None)
    return ai_activity
    ...


def build_request(client, activities):
    shortlist = []
    for a in activities:
        if a["id"][-2:] in SHORTLIST_IDS:
            shortlist.append(to_ai_activity(a))
    return {
        "request_id": str(uuid.uuid4()),
        "limit": 5,
        "client": to_ai_client(client),
        "shortlist": shortlist,
        # only the activities whose id ends with one of SHORTLIST_IDS, converted with to_ai_activity
       
    }


if __name__ == "__main__":
    print(REPO_ROOT)
    print(FIXTURES.exists())
    clients = load("clients.json")
    activities = load("activities.json")
    request = build_request(clients[0], activities)   # c1
    print(json.dumps(request, indent=2))

