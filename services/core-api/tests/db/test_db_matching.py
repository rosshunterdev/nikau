"""Find activities against the real database (SCRUM-122).

AI Matching is faked (no Gemini in tests); the client, catalogue and RLS are real.
"""

from uuid import uuid4

import pytest
from postgrest.exceptions import APIError

from app.matching import MatchOutcome
from app.routers import matching

SAM = "c0000000-0000-0000-0000-000000000001"


def fake_ai_matching(body, *args, **kwargs):
    """Pretend AI Matching: always suggests the first activity on the shortlist."""
    first = body["shortlist"][0]["id"]
    lead = {"activity_id": first, "rank": 1, "why_fits": ["Fits"], "why_doesnt_cover": [], "why_ask": []}
    return MatchOutcome("success", 900, [lead])


def log_fails(db, row):
    """Pretend the matching_log insert was refused."""
    raise APIError({"message": "log insert refused", "code": "XX000"})


@pytest.fixture
def fake_ai(monkeypatch):
    monkeypatch.setattr(matching, "call_ai_matching", fake_ai_matching)


def test_leads_are_shown_when_the_log_is_saved(api, headers, fake_ai):
    # Control: with the receipt saved, the worker gets the AI's lead
    r = api.post(f"/clients/{SAM}/match", headers=headers("cora"))
    assert r.status_code == 200, r.text
    assert r.json()["result"] == "success"
    assert len(r.json()["leads"]) == 1


def test_fallback_when_the_log_cant_be_saved(api, headers, fake_ai, monkeypatch):
    monkeypatch.setattr(matching, "save_match_log", log_fails)

    r = api.post(f"/clients/{SAM}/match", headers=headers("cora"))
    assert r.status_code == 200, r.text
    # Leads without a receipt couldn't be saved, so none are shown
    assert r.json()["result"] == "error"
    assert r.json()["leads"] == []


def must_not_run(*args, **kwargs):
    raise AssertionError("matching ran for a client with nothing to match on")


def test_client_with_no_interests_or_goals_is_refused(api, headers, monkeypatch):
    # SCRUM-125: no AI call and no log row, just a clear message
    monkeypatch.setattr(matching, "call_ai_matching", must_not_run)
    monkeypatch.setattr(matching, "save_match_log", must_not_run)

    body = {
        "preferred_name": f"No interests {uuid4().hex[:8]}",
        "support_needed": "worker_present",
        "max_physical_demand": "low",
        "max_sensory_load": "medium",
    }
    r = api.post("/clients", json=body, headers=headers("cora"))
    assert r.status_code == 201, r.text

    r = api.post(f"/clients/{r.json()['client_id']}/match", headers=headers("cora"))
    assert r.status_code == 400, r.text
    assert "interests or goals" in r.json()["detail"]
