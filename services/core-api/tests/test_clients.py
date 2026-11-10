import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.clients import ClientCreate, ClientUpdate

client = TestClient(app)

SAM_ID = "c0000000-0000-0000-0000-000000000001"

# A complete, valid new client
VALID = {
    "preferred_name": "Test",
    "support_needed": "worker_present",
    "max_physical_demand": "medium",
    "max_sensory_load": "low",
}
REQUIRED = ["preferred_name", "support_needed", "max_physical_demand", "max_sensory_load"]


# --- Sign-in: every client endpoint needs a signed-in user ---

def test_list_clients_requires_sign_in():
    assert client.get("/clients").status_code == 401


def test_get_client_requires_sign_in():
    assert client.get(f"/clients/{SAM_ID}").status_code == 401


def test_create_client_requires_sign_in():
    response = client.post("/clients", json=VALID)
    assert response.status_code == 401


def test_update_client_requires_sign_in():
    response = client.patch(f"/clients/{SAM_ID}", json={"preferred_name": "Test"})
    assert response.status_code == 401


# --- Validation: the API rejects incomplete clients, matching the form ---

def test_create_with_required_fields_passes():
    ClientCreate(**VALID)


@pytest.mark.parametrize("field", REQUIRED)
def test_create_without_a_required_field_fails(field):
    data = {k: v for k, v in VALID.items() if k != field}
    with pytest.raises(ValidationError):
        ClientCreate(**data)


def test_update_with_only_some_fields_passes():
    ClientUpdate(preferred_name="New name")


@pytest.mark.parametrize("field", REQUIRED)
def test_update_cannot_clear_a_required_field(field):
    with pytest.raises(ValidationError):
        ClientUpdate(**{field: None})


# --- Second-pass fields (SCRUM-94) ---

def test_create_with_the_second_pass_fields_passes():
    body = ClientCreate(
        **VALID,
        goals=["  Meet new people  ", "Get fitter"],
        participation_notes="Likes to watch first",
        physical_notes="Walks about 15 min",
        sensory_notes="Finds crowds hard",
        travel_range_minutes=30,
    )
    assert body.goals == ["Meet new people", "Get fitter"]  # spaces trimmed


@pytest.mark.parametrize(
    "change",
    [
        {"goals": ["1", "2", "3", "4", "5", "6"]},  # more than 5 goals
        {"goals": ["   "]},  # a blank goal
        {"goals": ["x" * 201]},  # a goal that's too long
        {"travel_range_minutes": 0},
        {"physical_notes": "x" * 1001},
    ],
)
def test_second_pass_limits(change):
    with pytest.raises(ValidationError):
        ClientCreate(**VALID, **change)
    with pytest.raises(ValidationError):
        ClientUpdate(**change)


def test_an_empty_notes_box_is_saved_as_empty():
    assert ClientUpdate(sensory_notes="   ").sensory_notes is None


def test_update_can_clear_the_second_pass_fields():
    body = ClientUpdate(goals=[], physical_notes=None, travel_range_minutes=None)
    assert body.model_dump(exclude_unset=True) == {
        "goals": [],
        "physical_notes": None,
        "travel_range_minutes": None,
    }
