from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.deps import get_caller
from app.main import app
from app.routers.activities import router as activities_router
from app.routers.activities import to_detail, to_summary
from app.schemas.activities import ActivityCreate, ActivitySession, ActivityUpdate

client = TestClient(app)

class EmptyQuery:
    """Stands in for a Supabase query: every call returns itself, and it finds nothing."""

    def __getattr__(self, name):
        return lambda *args, **kwargs: self

    def execute(self):
        return SimpleNamespace(data=[])


def fake_caller():
    """A signed-in caller whose database is empty, so tests don't need Supabase."""
    return SimpleNamespace(user_id="test", db=SimpleNamespace(table=lambda name: EmptyQuery()))

POTTERY_ID = "e0000000-0000-0000-0000-000000000001"
PROVIDER_ID = "d0000000-0000-0000-0000-000000000001"
VALID = {"provider_id": PROVIDER_ID, "name": "Swim club"}


# --- Sign-in ---

def test_list_activities_requires_sign_in():
    assert client.get("/activities").status_code == 401


def test_get_activity_requires_sign_in():
    assert client.get(f"/activities/{POTTERY_ID}").status_code == 401


def test_create_activity_requires_sign_in():
    assert client.post("/activities", json=VALID).status_code == 401


def test_update_activity_requires_sign_in():
    assert client.patch(f"/activities/{POTTERY_ID}", json={"name": "Test"}).status_code == 401


# --- Validation ---

def test_create_with_name_and_provider_passes():
    ActivityCreate(**VALID)


@pytest.mark.parametrize("field", ["provider_id", "name"])
def test_create_without_a_required_field_fails(field):
    data = {k: v for k, v in VALID.items() if k != field}
    with pytest.raises(ValidationError):
        ActivityCreate(**data)


def test_session_must_end_after_it_starts():
    with pytest.raises(ValidationError, match="end after it starts"):
        ActivitySession(day="mon", start_time="11:00", end_time="10:00")


def test_session_cannot_end_when_it_starts():
    with pytest.raises(ValidationError):
        ActivitySession(day="mon", start_time="10:00", end_time="10:00")


def test_ages_backwards_fail():
    with pytest.raises(ValidationError, match="Minimum age"):
        ActivityCreate(**VALID, min_age=60, max_age=18)


def test_equal_ages_pass():
    ActivityCreate(**VALID, min_age=18, max_age=18)


def test_unknown_day_fails():
    with pytest.raises(ValidationError):
        ActivitySession(day="someday", start_time="10:00", end_time="11:00")


def test_update_with_only_some_fields_passes():
    ActivityUpdate(cost_per_session=0)

def test_update_cannot_clear_the_name():
    with pytest.raises(ValidationError):
        ActivityUpdate(name=None)

def test_search_activities_requires_sign_in():
    assert client.get("/activities/search").status_code == 401


def test_search_is_not_read_as_an_activity_id():
    # /activities/search must match the search route, not /activities/{activity_id}
    paths = [route.path for route in activities_router.routes]
    assert paths.index("/activities/search") < paths.index("/activities/{activity_id}")

def test_search_checks_each_available_item():
    """A bad day-and-slot is a 422, not a 500 (the pattern applies to each item)."""
    app.dependency_overrides[get_caller] = fake_caller
    try:
        good = client.get("/activities/search?available=sat-morning")
        bad = client.get("/activities/search?available=funday-night")
    finally:
        app.dependency_overrides.clear()
    assert good.status_code == 200
    assert bad.status_code == 422

def test_find_activities_requires_sign_in():
    assert client.post(f"/clients/{POTTERY_ID}/match").status_code == 401


# --- SCRUM-129 fix 06: what a catalogue row shows ---

def test_catalogue_row_has_names_levels_and_sessions_in_week_order():
    row = to_summary(
        {
            "activity_id": POTTERY_ID,
            "name": "Pottery for beginners",
            "providers": {"name": "Wellington Community Arts", "consent_given": True},
            "suburbs": {"name": "Wellington Central"},
            "physical_demand": "low",
            "transport_options": None,
            "activity_sessions": [
                {"day": "thu", "start_time": "13:00:00", "end_time": "14:30:00"},
                {"day": "mon", "start_time": "10:00:00", "end_time": "11:00:00"},
            ],
        }
    )
    assert (row["provider_name"], row["suburb_name"]) == (
        "Wellington Community Arts",
        "Wellington Central",
    )
    assert row["consent_given"] is True
    assert row["physical_demand"] == "low"
    assert row["transport_options"] == []
    assert [s["day"] for s in row["sessions"]] == ["mon", "thu"]
    assert row["sessions"][1] == {"day": "thu", "start_time": "13:00", "end_time": "14:30"}


def test_catalogue_row_without_provider_means_no_consent():
    row = to_summary({"activity_id": POTTERY_ID, "name": "Pottery", "providers": None})
    assert row["consent_given"] is False
    assert row["sessions"] == []


# --- SCRUM-129 fix 07: what the Activity detail page shows ---

def test_detail_has_provider_contacts_suburb_and_checker_name():
    row = to_detail(
        {
            "activity_id": POTTERY_ID,
            "transport_options": None,
            "activity_tags": [{"tag_id": "t1"}],
            "activity_sessions": [],
            "providers": {
                "name": "Wellington Community Arts",
                "contact_phone": "04 555 0110",
                "contact_email": "hello@example.com",
                "website": "https://example.com",
            },
            "suburbs": {"name": "Wellington Central"},
            "checker": {"first_name": "Cora", "last_name": "Coordinator"},
        }
    )
    assert row["provider_name"] == "Wellington Community Arts"
    assert (row["provider_phone"], row["provider_email"]) == ("04 555 0110", "hello@example.com")
    assert row["provider_website"] == "https://example.com"
    assert row["suburb_name"] == "Wellington Central"
    assert row["checked_by_name"] == "Cora Coordinator"
    assert "providers" not in row and "checker" not in row


def test_detail_without_checker_or_provider_has_empty_names():
    row = to_detail(
        {
            "activity_id": POTTERY_ID,
            "transport_options": [],
            "activity_tags": [],
            "activity_sessions": [],
            "providers": None,
            "suburbs": None,
            "checker": None,
        }
    )
    assert (row["provider_name"], row["suburb_name"], row["checked_by_name"]) == (None, None, None)


# --- SCRUM-129 fix 08: the extra form fields are checked before they reach the database ---

def test_unknown_check_method_is_rejected():
    import pytest
    from pydantic import ValidationError

    from app.schemas.activities import ActivityUpdate

    with pytest.raises(ValidationError):
        ActivityUpdate(check_method="carrier_pigeon")
    with pytest.raises(ValidationError):
        ActivityUpdate(walk_from_stop_minutes=-1)
    assert ActivityUpdate(joining="drop_in", group_size="10_to_20").joining == "drop_in"
