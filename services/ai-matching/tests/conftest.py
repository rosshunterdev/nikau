"""Shared fixtures: a valid /match request built from the B2 fixtures (client c1)."""

import uuid

import pytest

from ai_matching.contract import MatchRequest, to_ai_activity, to_ai_client
from tests.helpers import C1_SHORTLIST, THIS_YEAR, load


@pytest.fixture
def request_dict():
    """A valid /match request body for client c1 and its shortlist."""
    c1 = load("clients.json")[0]
    activities = load("activities.json")
    shortlist = [to_ai_activity(a) for a in activities if a["id"][-2:] in C1_SHORTLIST]
    return {
        "request_id": str(uuid.uuid4()),
        "limit": 5,
        "client": to_ai_client(c1, THIS_YEAR),
        "shortlist": shortlist,
    }


@pytest.fixture
def match_request(request_dict):
    return MatchRequest.model_validate(request_dict)


@pytest.fixture
def ids(request_dict):
    """Short code -> full id, e.g. ids["a0"]."""
    return {a["id"][-2:]: a["id"] for a in request_dict["shortlist"]}
