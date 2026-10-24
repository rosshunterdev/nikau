from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_suburbs_requires_sign_in():
    assert client.get("/suburbs").status_code == 401


def test_tags_requires_sign_in():
    assert client.get("/tags").status_code == 401
