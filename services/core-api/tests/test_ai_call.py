"""Calling AI Matching (SCRUM-87), with fake replies: no real service or Gemini needed.
httpx.MockTransport answers each request with whatever the handler returns."""

import httpx

from app.matching import call_ai_matching

BODY = {"request_id": "r1", "limit": 5, "client": {}, "shortlist": []}
RESULT = {"activity_id": "e1", "rank": 1, "why_fits": ["Fits"], "why_doesnt_cover": [], "why_ask": []}


def fake(handler):
    """An httpx client whose replies come from handler instead of the network."""
    return httpx.Client(transport=httpx.MockTransport(handler))


def call(handler):
    return call_ai_matching(BODY, "http://ai.test", "secret", http=fake(handler))


def test_results_mean_success():
    outcome = call(lambda r: httpx.Response(
        200, json={"request_id": "r1", "results": [RESULT], "model_ms": 900, "dropped_count": 1}
    ))
    assert outcome.result == "success"
    assert outcome.results == [RESULT]
    assert (outcome.model_ms, outcome.dropped_count) == (900, 1)


def test_empty_results_mean_no_good_fit():
    outcome = call(lambda r: httpx.Response(
        200, json={"request_id": "r1", "results": [], "model_ms": 800, "dropped_count": 0}
    ))
    assert outcome.result == "no_good_fit"
    assert outcome.results == []


def test_invalid_output_reply():
    outcome = call(lambda r: httpx.Response(
        502, json={"request_id": "r1", "error": {"code": "invalid_output", "message": "x"}}
    ))
    assert outcome.result == "invalid_output"


def test_other_error_replies_are_errors():
    for status, code in [(502, "model_error"), (401, "unauthorized"), (422, "invalid_request")]:
        outcome = call(lambda r, s=status, c=code: httpx.Response(
            s, json={"request_id": "r1", "error": {"code": c, "message": "x"}}
        ))
        assert outcome.result == "error", code


def test_no_reply_in_time_is_a_timeout():
    def slow(request):
        raise httpx.ReadTimeout("too slow", request=request)
    assert call(slow).result == "timeout"


def test_cannot_connect_is_an_error():
    def down(request):
        raise httpx.ConnectError("refused", request=request)
    assert call(down).result == "error"


def test_reply_that_is_not_json_is_an_error():
    assert call(lambda r: httpx.Response(500, text="Internal Server Error")).result == "error"


def test_sends_the_service_key_and_body():
    seen = {}

    def check(request):
        seen["auth"] = request.headers["Authorization"]
        seen["path"] = request.url.path
        return httpx.Response(200, json={"request_id": "r1", "results": [], "model_ms": 1, "dropped_count": 0})

    call(check)
    assert seen == {"auth": "Bearer secret", "path": "/match"}
