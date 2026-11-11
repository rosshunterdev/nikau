import pytest

from app.matching import (
    SHORTLIST_MAX,
    build_shortlist,
    d2_order,
    has_something_to_match,
    to_prefilter_client,
)


def activity(activity_id, **fields):
    """A catalogue activity in the pre-filter shape, consented and active."""
    a = {
        "activity_id": activity_id,
        "consent_given": True,
        "archived_at": None,
        "tags": [],
        "suburb_id": None,
        "cost_per_session": None,
        "sessions": [],
    }
    a.update(fields)
    return a


def ids(activities):
    return [a["activity_id"] for a in activities]


# --- to_prefilter_client ---

def test_client_row_becomes_the_prefilter_shape():
    row = {
        "client_id": "c1",
        "transport": None,
        "client_interests": [{"tag_id": "art"}],
        "client_availability": [{"day": "mon", "slot": "morning"}],
    }
    client = to_prefilter_client(row)
    assert client["interests"] == ["art"]
    assert client["availability"] == [{"day": "mon", "slot": "morning"}]
    assert client["transport"] == []


# --- D2 order ---

CLIENT = {"interests": ["art", "music"], "suburb_id": "s1"}


def test_more_shared_tags_come_first():
    a = activity("a", tags=["art"])
    b = activity("b", tags=["art", "music"])
    assert ids(sorted([a, b], key=lambda x: d2_order(CLIENT, x))) == ["b", "a"]


def test_same_suburb_breaks_a_tie_on_tags():
    a = activity("a", suburb_id="s2")
    b = activity("b", suburb_id="s1")
    assert ids(sorted([a, b], key=lambda x: d2_order(CLIENT, x))) == ["b", "a"]


def test_cheaper_first_and_unknown_cost_last():
    a = activity("a", cost_per_session=None)
    b = activity("b", cost_per_session=20)
    c = activity("c", cost_per_session=0)
    assert ids(sorted([a, b, c], key=lambda x: d2_order(CLIENT, x))) == ["c", "b", "a"]


def test_id_makes_the_order_repeatable():
    a = activity("b-id")
    b = activity("a-id")
    assert ids(sorted([a, b], key=lambda x: d2_order(CLIENT, x))) == ["a-id", "b-id"]


def test_client_without_suburb_matches_no_suburb():
    client = {"interests": [], "suburb_id": None}
    a = activity("a", suburb_id=None)
    assert d2_order(client, a)[1] is True  # unknown suburbs don't count as "same"


# --- build_shortlist ---

def test_shortlist_runs_the_prefilter_first():
    hidden = activity("hidden", consent_given=False)
    shown = activity("shown")
    assert ids(build_shortlist(CLIENT, [hidden, shown], 2026)) == ["shown"]


def test_shortlist_keeps_at_most_30():
    many = [activity(f"a{n:02d}") for n in range(40)]
    result = build_shortlist(CLIENT, many, 2026)
    assert len(result) == SHORTLIST_MAX == 30
    assert ids(result)[0] == "a00"


def test_shortlist_keeps_the_best_30():
    plain = [activity(f"a{n:02d}") for n in range(30)]
    best = activity("z-best", tags=["art"])  # last by id, first by shared tags
    assert "z-best" in ids(build_shortlist(CLIENT, [*plain, best], 2026))


def test_empty_shortlist_when_nothing_passes():
    assert build_shortlist(CLIENT, [activity("x", consent_given=False)], 2026) == []
  

# --- has_something_to_match (SCRUM-125) ---

@pytest.mark.parametrize(
    ("interests", "goals", "expected"),
    [
        ([{"tag_id": "art"}], [], True),  # interests only
        ([], ["Meet new people"], True),  # goals only
        ([{"tag_id": "art"}], ["Meet new people"], True),  # both
        ([], [], False),  # neither
        ([], None, False),  # goals never saved
    ],
)
def test_client_needs_an_interest_or_a_goal(interests, goals, expected):
    row = {"client_interests": interests, "goals": goals}
    assert has_something_to_match(row) is expected
