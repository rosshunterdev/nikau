"""Clients against the real database (SCRUM-118): saving, assignment and RLS."""

from uuid import uuid4

import pytest

# The four fields "Add a client" requires besides the name
REQUIRED = {
    "support_needed": "worker_present",
    "max_physical_demand": "low",
    "max_sensory_load": "medium",
}


def new_name() -> str:
    """A unique name, so the tests can run again without a database reset."""
    return f"Test client {uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def tag_ids(api, headers):
    r = api.get("/tags", headers=headers("will"))
    return [tag["tag_id"] for tag in r.json()]


def test_creator_is_assigned_and_can_see_the_client(api, headers):
    # Will is a support worker: he only sees clients he's assigned to
    r = api.post("/clients", json={**REQUIRED, "preferred_name": new_name()}, headers=headers("will"))
    assert r.status_code == 201, r.text
    client_id = r.json()["client_id"]

    assert api.get(f"/clients/{client_id}", headers=headers("will")).status_code == 200
    # Another organisation can't see it
    assert api.get(f"/clients/{client_id}", headers=headers("olive")).status_code == 404


def test_patch_replaces_interests_and_availability(api, headers, tag_ids):
    body = {
        **REQUIRED,
        "preferred_name": new_name(),
        "interests": tag_ids[:2],
        "availability": [{"day": "mon", "slot": "morning"}, {"day": "wed", "slot": "afternoon"}],
    }
    r = api.post("/clients", json=body, headers=headers("cora"))
    assert r.status_code == 201, r.text
    client_id = r.json()["client_id"]

    changes = {"interests": [tag_ids[2]], "availability": [{"day": "fri", "slot": "evening"}]}
    r = api.patch(f"/clients/{client_id}", json=changes, headers=headers("cora"))
    assert r.status_code == 200, r.text

    saved = api.get(f"/clients/{client_id}", headers=headers("cora")).json()
    # Replaced, not added to: the old interests and times are gone
    assert saved["interests"] == [tag_ids[2]]
    assert saved["availability"] == [{"day": "fri", "slot": "evening"}]


def test_unknown_tag_saves_nothing(api, headers):
    name = new_name()
    body = {**REQUIRED, "preferred_name": name, "interests": [str(uuid4())]}
    r = api.post("/clients", json=body, headers=headers("cora"))
    assert r.status_code == 400

    # All or nothing: the client row itself must not have been saved either
    names = [c["preferred_name"] for c in api.get("/clients", headers=headers("cora")).json()]
    assert name not in names
