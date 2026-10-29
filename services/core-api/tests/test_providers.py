import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.providers import ProviderCreate, ProviderUpdate

client = TestClient(app)

PROVIDER_ID = "d0000000-0000-0000-0000-000000000001"


# --- Sign-in: every provider endpoint needs a signed-in user ---

def test_list_providers_requires_sign_in():
    assert client.get("/providers").status_code == 401


def test_get_provider_requires_sign_in():
    assert client.get(f"/providers/{PROVIDER_ID}").status_code == 401


def test_create_provider_requires_sign_in():
    assert client.post("/providers", json={"name": "Test"}).status_code == 401


def test_update_provider_requires_sign_in():
    assert client.patch(f"/providers/{PROVIDER_ID}", json={"name": "Test"}).status_code == 401


# --- Validation ---

def test_create_with_only_a_name_passes():
    ProviderCreate(name="Swim club")


def test_create_without_a_name_fails():
    with pytest.raises(ValidationError):
        ProviderCreate(name="")


def test_consent_without_a_date_fails():
    with pytest.raises(ValidationError, match="Add the date"):
        ProviderCreate(name="Swim club", consent_given=True)


def test_consent_with_a_date_passes():
    ProviderCreate(name="Swim club", consent_given=True, consent_date="2026-10-27")


def test_update_with_only_some_fields_passes():
    ProviderUpdate(website="https://example.nz")

def test_update_cannot_clear_the_name():
    with pytest.raises(ValidationError):
        ProviderUpdate(name=None)