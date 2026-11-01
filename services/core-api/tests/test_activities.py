from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.deps import get_caller
from app.main import app
from app.routers.activities import router as activities_router
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
