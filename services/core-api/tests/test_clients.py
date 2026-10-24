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