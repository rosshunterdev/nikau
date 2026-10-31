"""SCRUM-66: pre-filter against the B2 fixtures; see fixtures/README.md."""

import json
from pathlib import Path

import pytest

from app.prefilter import excluded_by, prefilter, time_slot

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
THIS_YEAR = 2026  # the fixtures README's "this year"


def load(name):
    with open(FIXTURES / name, encoding="utf-8") as f:
        return json.load(f)


ACTIVITIES = load("activities.json")
C1, C2 = load("clients.json")


def short(activity):
    """Short code like a0, from the end of the id."""
    return activity["id"][-2:]


def by_short(code):
    return next(a for a in ACTIVITIES if short(a) == code)


# --- The README's "Expected results" table ---


def test_c1_keeps_expected():
    kept = [short(a) for a in prefilter(C1, ACTIVITIES, THIS_YEAR)]
    assert kept == ["a0", "b1", "b2", "b3", "b4"]


def test_c2_keeps_expected():
    kept = [short(a) for a in prefilter(C2, ACTIVITIES, THIS_YEAR)]
    assert kept == ["a0", "a3", "b1", "b2", "b3", "b4"]


# --- Each of a1-a9 fails exactly the rule it was built for (README table) ---


@pytest.mark.parametrize(
    "code, rule",
    [
        ("a1", "consent"),
        ("a2", "physical"),
        ("a3", "sensory"),
        ("a4", "step_free"),
        ("a5", "cost"),
        ("a6", "schedule"),
        ("a7", "age"),
        ("a8", "transport"),
        ("a9", "support"),
    ],
)
def test_each_rule(code, rule):
    assert excluded_by(C1, by_short(code), THIS_YEAR) == rule


def test_pickleball_fails_physical_first():
    # f1 fails physical AND schedule; the first rule hit is reported
    assert excluded_by(C1, by_short("f1"), THIS_YEAR) == "physical"


# --- Rule 0 and edge cases ---


def test_archived_is_removed():
    archived = {**by_short("a0"), "archived_at": "2026-10-01T09:00:00+13:00"}
    assert excluded_by(C1, archived, THIS_YEAR) == "archived"


def test_unknowns_never_remove():
    a0 = by_short("a0")
    unknown = {
        **a0,
        "physical_demand": None,
        "sensory_load": None,
        "step_free_access": None,
        "cost_per_session": None,
        "sessions": [],
        "min_age": None,
        "max_age": None,
        "transport_options": [],
        "support_worker_policy": None,
    }
    assert excluded_by(C1, unknown, THIS_YEAR) is None


def test_client_unknowns_never_remove():
    blank = {
        **C1,
        "max_physical_demand": None,
        "max_cost": None,
        "availability": [],
        "birth_year": None,
        "transport": [],
    }
    assert excluded_by(blank, by_short("a2"), THIS_YEAR) is None  # high demand, no max
    assert excluded_by(blank, by_short("a5"), THIS_YEAR) is None  # $25, no max
    assert excluded_by(blank, by_short("a6"), THIS_YEAR) is None  # Monday only
    assert excluded_by(blank, by_short("a7"), THIS_YEAR) is None  # 60+
    assert excluded_by(blank, by_short("a8"), THIS_YEAR) is None  # no bus route


def test_transport_with_other_option_is_kept():
    # Client can also be driven, so "no bus route" doesn't remove it
    driven = {**C1, "transport": ["bus_train_with_worker", "worker_drives"]}
    assert excluded_by(driven, by_short("a8"), THIS_YEAR) is None


def test_support_own_is_kept():
    alone = {**C1, "support_needed": "own"}
    assert excluded_by(alone, by_short("a9"), THIS_YEAR) is None


@pytest.mark.parametrize(
    "start, slot",
    [
        ("11:59", "morning"),
        ("12:00", "afternoon"),
        ("16:59", "afternoon"),
        ("17:00", "evening"),
    ],
)
def test_time_slot_boundaries(start, slot):
    assert time_slot(start) == slot
