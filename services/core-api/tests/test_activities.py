import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.activities import ActivityCreate, ActivitySession, ActivityUpdate

client = TestClient(app)

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