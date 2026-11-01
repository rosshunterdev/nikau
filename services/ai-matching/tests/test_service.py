"""match(): checks, v0.4 no-good-fit, retry and errors. Gemini is faked."""

import pytest
from google.genai import errors

from ai_matching import service
from ai_matching.contract import MatchError
from tests.helpers import FakeGemini, result


def server_error(code=503):
    return errors.ServerError(code, {"error": {"code": code, "message": "busy"}})


# --- Checks ---


def test_good_output_passes_through(match_request, ids):
    gemini = FakeGemini({"results": [result(ids["a0"], 1), result(ids["b2"], 2)]})
    response = service.match(match_request, gemini)
    assert [r.activity_id for r in response.results] == [ids["a0"], ids["b2"]]
    assert response.dropped_count == 0
    assert response.request_id == match_request.request_id


def test_messy_output_is_cleaned(match_request, ids):
    # Spike step 5b: invented id, duplicate, no why_fits, rank gap
    gemini = FakeGemini(
        {
            "results": [
                result(ids["a0"], 1),
                result("made-up-id", 2),
                result(ids["a0"], 3),
                result(ids["b1"], 5, why_fits=[]),
                result(ids["b2"], 6),
            ]
        }
    )
    response = service.match(match_request, gemini)
    assert [r.activity_id for r in response.results] == [ids["a0"], ids["b2"]]
    assert [r.rank for r in response.results] == [1, 2]
    # v0.4: made-up id + duplicate + empty why_fits all count
    assert response.dropped_count == 3


def test_results_cut_to_limit_and_lines_to_three(match_request, ids):
    match_request.limit = 2
    long = ["one", "two", "three", "four"]
    gemini = FakeGemini(
        {
            "results": [
                result(ids["a0"], 1, why_fits=long),
                result(ids["b1"], 2),
                result(ids["b2"], 3),
            ]
        }
    )
    response = service.match(match_request, gemini)
    assert len(response.results) == 2
    assert response.results[0].why_fits == ["one", "two", "three"]


def test_out_of_order_ranks_are_sorted(match_request, ids):
    gemini = FakeGemini({"results": [result(ids["b2"], 2), result(ids["a0"], 1)]})
    response = service.match(match_request, gemini)
    assert [r.activity_id for r in response.results] == [ids["a0"], ids["b2"]]


# --- v0.4: no good fit vs invalid output ---


def test_empty_model_output_is_no_good_fit(match_request):
    response = service.match(match_request, FakeGemini({"results": []}))
    assert response.results == []
    assert response.dropped_count == 0


def test_all_results_dropped_is_invalid_output(match_request, ids):
    gemini = FakeGemini(
        {"results": [result("made-up-id", 1), result(ids["a0"], 2, why_fits=[])]}
    )
    with pytest.raises(MatchError) as e:
        service.match(match_request, gemini)
    assert e.value.code == "invalid_output"


# --- Retry and errors ---


def test_retries_once_on_503(match_request, ids):
    gemini = FakeGemini(server_error(503), {"results": [result(ids["a0"], 1)]})
    response = service.match(match_request, gemini)
    assert len(gemini.calls) == 2
    assert response.results[0].activity_id == ids["a0"]


def test_two_503s_is_model_error(match_request):
    gemini = FakeGemini(server_error(503), server_error(503))
    with pytest.raises(MatchError) as e:
        service.match(match_request, gemini)
    assert e.value.code == "model_error"
    assert len(gemini.calls) == 2


def test_no_retry_on_other_errors(match_request):
    gemini = FakeGemini(server_error(500))
    with pytest.raises(MatchError) as e:
        service.match(match_request, gemini)
    assert e.value.code == "model_error"
    assert len(gemini.calls) == 1


def test_no_retry_when_budget_is_spent(match_request, ids, monkeypatch):
    # Pretend the first call used up the budget
    monkeypatch.setattr(service, "BUDGET_MS", 0)
    gemini = FakeGemini(server_error(503), {"results": [result(ids["a0"], 1)]})
    with pytest.raises(MatchError):
        service.match(match_request, gemini)
    assert len(gemini.calls) == 1


def test_unparseable_output_retried_then_invalid(match_request):
    gemini = FakeGemini("not json", '{"results": [{"rank": 1}]}')
    with pytest.raises(MatchError) as e:
        service.match(match_request, gemini)
    assert e.value.code == "invalid_output"
    assert len(gemini.calls) == 2


def test_unparseable_then_good_recovers(match_request, ids):
    gemini = FakeGemini("not json", {"results": [result(ids["a0"], 1)]})
    response = service.match(match_request, gemini)
    assert len(response.results) == 1


def test_every_call_gives_gemini_at_least_10s(match_request, ids):
    # Gemini returns 400 for a deadline under 10 s, so a retry must never ask for less
    gemini = FakeGemini(server_error(503), {"results": [result(ids["a0"], 1)]})
    service.match(match_request, gemini)
    for call in gemini.calls:
        assert call["config"].http_options.timeout >= service.MIN_DEADLINE_MS


# --- What reaches Gemini ---


def test_prompt_has_data_but_not_request_id(match_request):
    gemini = FakeGemini({"results": []})
    service.match(match_request, gemini)
    call = gemini.calls[0]
    assert match_request.request_id not in call["contents"]
    assert '"age_band": "adult"' in call["contents"]
    assert "birth_year" not in call["contents"]
    assert call["config"].system_instruction == service.SYSTEM_INSTRUCTION
