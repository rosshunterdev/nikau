"""A whole match (SCRUM-87) with a fake AI Matching: what gets logged, what's returned."""

from app.matching import MatchOutcome, run_match

CLIENT = {
    "client_id": "c1",
    "organisation_id": "org1",
    "suburb_id": None,
    "suburbs": None,
    "client_interests": [{"tag_id": "t-art"}],
    "client_availability": [],
}


def activity(activity_id, **fields):
    row = {
        "activity_id": activity_id,
        "name": f"Activity {activity_id}",
        "archived_at": None,
        "providers": {"consent_given": True},
        "activity_sessions": [],
        "activity_tags": [{"tag_id": "t-art"}],
    }
    row.update(fields)
    return row


TAGS = [{"tag_id": "t-art", "name": "Art and craft"}]
LEAD = {"activity_id": "e1", "rank": 1, "why_fits": ["Fits"], "why_doesnt_cover": [], "why_ask": []}


def run(activities, outcome):
    sent = []

    def fake_call(body):
        sent.append(body)
        return outcome

    log, reply = run_match(CLIENT, activities, TAGS, "user1", 2026, fake_call)
    return log, reply, sent


def test_success_logs_and_returns_leads():
    log, reply, sent = run([activity("e1")], MatchOutcome("success", 1200, [LEAD], 900, 0))
    assert reply["result"] == "success"
    assert reply["message"] is None
    assert reply["leads"] == [{**LEAD, "activity_name": "Activity e1"}]
    assert log["result"] == "success"
    assert log["fallback_shown"] is False
    assert (log["candidate_count"], log["leads_shown"]) == (1, 1)
    assert (log["requested_by"], log["organisation_id"]) == ("user1", "org1")
    assert log["request_id"] == reply["request_id"] == sent[0]["request_id"]


def test_empty_shortlist_never_calls_the_ai():
    log, reply, sent = run([activity("e1", providers={"consent_given": False})], None)
    assert sent == []
    assert reply["result"] == log["result"] == "no_candidates"
    assert reply["message"] == "No activities passed this client's filters."
    assert log["fallback_shown"] is True


def test_no_good_fit_falls_back_with_its_own_message():
    log, reply, _ = run([activity("e1")], MatchOutcome("no_good_fit", 800, [], 700, 0))
    assert reply["result"] == "no_good_fit"
    assert "good fit" in reply["message"]
    assert log["fallback_shown"] is True
    assert log["leads_shown"] == 0


def test_failures_fall_back_and_are_logged():
    for result in ("timeout", "error", "invalid_output"):
        log, reply, _ = run([activity("e1")], MatchOutcome(result, 15000))
        assert reply["result"] == log["result"] == result
        assert reply["message"] == "Matching is unavailable right now. Try the catalogue."
        assert log["fallback_shown"] is True


def test_leads_not_on_the_shortlist_are_dropped():
    stray = {**LEAD, "activity_id": "not-sent"}
    _, reply, _ = run([activity("e1")], MatchOutcome("success", 1000, [LEAD, stray], 900, 0))
    assert [lead["activity_id"] for lead in reply["leads"]] == ["e1"]
