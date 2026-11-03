"""The request the Core API sends to AI Matching (SCRUM-87), checked against
Ross's own contract models in services/ai-matching. If either side changes in a way
that breaks the contract, these tests fail."""

import sys
from pathlib import Path

# Make services/ai-matching importable, so the tests can use its contract models
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ai-matching"))

from ai_matching.contract import MatchRequest
from ai_matching.contract import age_band as contract_age_band

from app.matching import age_band, to_ai_request, to_prefilter_client

TAG_NAMES = {"t-art": "Art and craft", "t-sport": "Sport and fitness"}

CLIENT = to_prefilter_client({
    "client_id": "c1",
    "preferred_name": "Sam",
    "birth_year": 2001,
    "sensory_hard_limit": True,
    "suburb_id": "s1",
    "goals": ["Meet people"],
    "max_physical_demand": "medium",
    "max_sensory_load": "low",
    "needs_step_free": True,
    "support_needed": "worker_present",
    "transport": ["bus_train_with_worker"],
    "max_cost": 20,
    "client_interests": [{"tag_id": "t-art"}],
    "client_availability": [{"day": "thu", "slot": "afternoon"}],
})

ACTIVITY = {
    "activity_id": "e1",
    "name": "Pottery",
    "tags": ["t-art", "t-sport"],
    "suburbs": {"name": "Newtown"},
    "activity_sessions": [{"day": "thu", "start_time": "13:00:00", "end_time": "14:30:00"}],
    "transport_options": None,
}


def build():
    return to_ai_request("r1", CLIENT, [ACTIVITY], TAG_NAMES, "Miramar", 2026)


def test_request_passes_the_ai_matching_contract():
    # Ross's models forbid extra fields, so anything outside the contract fails here
    MatchRequest.model_validate(build())


def test_private_client_fields_are_never_sent():
    client = build()["client"]
    for field in ("preferred_name", "birth_year", "sensory_hard_limit", "client_id", "suburb_id"):
        assert field not in client


def test_ids_become_names_and_times_hhmm():
    body = build()
    assert body["client"]["interests"] == ["Art and craft"]
    assert body["client"]["suburb"] == "Miramar"
    activity = body["shortlist"][0]
    assert activity["id"] == "e1"
    assert activity["tags"] == ["Art and craft", "Sport and fitness"]
    assert activity["suburb"] == "Newtown"
    assert activity["sessions"] == [{"day": "thu", "start": "13:00", "end": "14:30"}]


def test_age_band_matches_the_contract_rule():
    for birth_year in [None, 2026, 2014, 2013, 2009, 2008, 1990]:
        assert age_band(birth_year, 2026) == contract_age_band(birth_year, 2026)
