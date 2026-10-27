from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_me_requires_sign_in():
    """Without a sign-in token, /me must refuse with 401."""
    response = client.get("/me")
    assert response.status_code == 401
