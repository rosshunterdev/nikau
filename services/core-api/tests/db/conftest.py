"""Tests against the local Supabase test database (SCRUM-118).

These sign in as the seed users and call the real API, so RLS and the database
functions run for real. Start the database first, from the repo root:
    supabase start        (or `supabase db reset` for fresh seed data)
Without it these tests are skipped. In CI (NIKAU_DB_TESTS=1) they fail instead,
so a broken database setup can't pass as "skipped".
"""

import os
from urllib.parse import urlparse

import httpx
import pytest
from fastapi.testclient import TestClient
from supabase import create_client

from app.config import settings
from app.main import app

# Seed users from supabase/seed.sql. Local test logins only, never real accounts.
PASSWORD = "password123"
EMAILS = {
    "cora": "cora@test.nikau",  # coordinator, Test Org
    "will": "will@test.nikau",  # support worker, Test Org, assigned to Sam
    "olive": "olive@other.nikau",  # coordinator, Other Org
}


def database_is_up() -> bool:
    try:
        httpx.get(f"{settings.supabase_url}/auth/v1/health", timeout=2)
        return True
    except httpx.HTTPError:
        return False


@pytest.fixture(scope="session", autouse=True)
def test_database():
    """Run only against a local database: these tests create and delete rows."""
    if urlparse(settings.supabase_url).hostname not in ("127.0.0.1", "localhost"):
        pytest.fail(f"Database tests only run against local Supabase, not {settings.supabase_url}")
    if not database_is_up():
        if os.environ.get("NIKAU_DB_TESTS") == "1":
            pytest.fail("NIKAU_DB_TESTS=1 but local Supabase isn't running")
        pytest.skip("Local Supabase isn't running: start it with `supabase start`")


@pytest.fixture(scope="session")
def api():
    return TestClient(app)


@pytest.fixture(scope="session")
def headers():
    """headers("will") signs in as Will once, then reuses his token."""
    tokens = {}

    def sign_in(name: str) -> dict:
        if name not in tokens:
            db = create_client(settings.supabase_url, settings.supabase_publishable_key)
            session = db.auth.sign_in_with_password(
                {"email": EMAILS[name], "password": PASSWORD}
            ).session
            tokens[name] = session.access_token
        return {"Authorization": f"Bearer {tokens[name]}"}

    return sign_in
