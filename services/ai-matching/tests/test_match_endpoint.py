"""POST /match over HTTP: auth, error bodies, status codes. Gemini is faked."""

import pytest
from fastapi.testclient import TestClient
from google.genai import errors

from app.main import app, get_gemini
from tests.helpers import FakeGemini, result

KEY = "test-service-key"
AUTH = {"Authorization": f"Bearer {KEY}"}

client = TestClient(app)


@pytest.fixture(autouse=True)
def service_key(monkeypatch):
    monkeypatch.setenv("MATCHING_SERVICE_KEY", KEY)
    yield
    app.dependency_overrides.clear()


def use_fake(*replies):
    fake = FakeGemini(*replies)
    app.dependency_overrides[get_gemini] = lambda: fake
    return fake


def test_health_is_open():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["contract_version"] == "0.4"


def test_match_ok(request_dict, ids):
    use_fake({"results": [result(ids["a0"], 1)]})
    response = client.post("/match", json=request_dict, headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body["request_id"] == request_dict["request_id"]
    assert body["results"][0]["activity_id"] == ids["a0"]
    assert set(body) == {"request_id", "results", "model_ms", "dropped_count"}


def test_no_good_fit_is_200_with_empty_results(request_dict):
    use_fake({"results": []})
    response = client.post("/match", json=request_dict, headers=AUTH)
    assert response.status_code == 200
    assert response.json()["results"] == []


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}])
def test_missing_or_wrong_key_is_401(request_dict, headers):
    fake = use_fake({"results": []})
    response = client.post("/match", json=request_dict, headers=headers)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
    assert fake.calls == []  # Gemini never called


def test_invalid_request_is_422_with_request_id(request_dict):
    use_fake()
    request_dict["client"]["birth_year"] = 2001  # not allowed to be sent
    response = client.post("/match", json=request_dict, headers=AUTH)
    assert response.status_code == 422
    body = response.json()
    assert body["request_id"] == request_dict["request_id"]
    assert body["error"]["code"] == "invalid_request"
    assert "birth_year" in body["error"]["message"]


def test_model_error_is_502(request_dict):
    use_fake(errors.ServerError(500, {"error": {"code": 500, "message": "boom"}}))
    response = client.post("/match", json=request_dict, headers=AUTH)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "model_error"
    assert response.json()["request_id"] == request_dict["request_id"]


def test_invalid_output_is_502(request_dict):
    use_fake({"results": [result("made-up-id", 1)]})
    response = client.post("/match", json=request_dict, headers=AUTH)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_output"
