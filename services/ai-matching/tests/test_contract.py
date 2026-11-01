"""Contract models and the privacy boundary (allow-lists, extra fields rejected)."""

import pytest
from pydantic import ValidationError

from ai_matching.contract import MatchRequest, age_band, to_ai_client
from tests.helpers import THIS_YEAR, load


def test_fixture_request_is_valid(match_request):
    assert match_request.limit == 5
    assert len(match_request.shortlist) == 5
    assert match_request.client.age_band == "adult"


def test_private_client_fields_never_leave():
    c1 = load("clients.json")[0]
    sent = to_ai_client(c1, THIS_YEAR)
    for private in ("birth_year", "sensory_hard_limit", "id"):
        assert private in c1
        assert private not in sent


def test_extra_field_is_rejected(request_dict):
    # If the Core API ever leaks a field, the request fails instead of reaching Gemini
    request_dict["client"]["birth_year"] = 2001
    with pytest.raises(ValidationError):
        MatchRequest.model_validate(request_dict)


def test_duplicate_shortlist_ids_rejected(request_dict):
    request_dict["shortlist"].append(request_dict["shortlist"][0])
    with pytest.raises(ValidationError):
        MatchRequest.model_validate(request_dict)


@pytest.mark.parametrize("limit", [0, 11])
def test_limit_out_of_range_rejected(request_dict, limit):
    request_dict["limit"] = limit
    with pytest.raises(ValidationError):
        MatchRequest.model_validate(request_dict)


def test_empty_shortlist_rejected(request_dict):
    request_dict["shortlist"] = []
    with pytest.raises(ValidationError):
        MatchRequest.model_validate(request_dict)


def test_nulls_mean_not_recorded(request_dict):
    request_dict["client"]["interests"] = None
    request_dict["shortlist"][0]["tags"] = None
    parsed = MatchRequest.model_validate(request_dict)
    assert parsed.client.interests == []
    assert parsed.shortlist[0].tags == []


@pytest.mark.parametrize(
    "birth_year, band",
    [
        (2013, "child"),
        (2012, "youth"),
        (2008, "youth"),
        (2007, "adult"),
        (None, "adult"),
    ],
)
def test_age_band_uses_younger_age(birth_year, band):
    # Born 2013: 12 or 13 in 2026, younger = 12 -> child.
    # Born 2008: 17 or 18 -> youth. Born 2007: 18 or 19 -> adult.
    assert age_band(birth_year, THIS_YEAR) == band
