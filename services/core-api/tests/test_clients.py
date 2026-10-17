from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SAM_ID = "c0000000-0000-0000-0000-000000000001"


def test_list_clients_requires_sign_in():
    assert client.get("/clients").status_code == 401


def test_get_client_requires_sign_in():
    assert client.get(f"/clients/{SAM_ID}").status_code == 401