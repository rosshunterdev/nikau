"""Catalogue search against the real database (SCRUM-118): what is never shown."""

import pytest

GARDEN = "e1000000-0000-0000-0000-000000000002"  # consented and running
POTTERY_TASTER = "e1000000-0000-0000-0000-000000000011"  # provider hasn't consented
BEACH_WALK = "e1000000-0000-0000-0000-000000000012"  # archived in October


def search(api, headers, who: str) -> list[str]:
    """The ids a plain search (no filters) returns."""
    r = api.get("/activities/search", headers=headers(who))
    assert r.status_code == 200, r.text
    return [a["activity_id"] for a in r.json()]


@pytest.mark.parametrize("who", ["will", "cora"])
def test_search_leaves_out_archived_and_non_consented(api, headers, who):
    found = search(api, headers, who)
    assert GARDEN in found  # control: the search does return activities
    assert POTTERY_TASTER not in found
    assert BEACH_WALK not in found
