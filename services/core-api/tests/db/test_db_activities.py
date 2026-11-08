"""Activities against the real database (SCRUM-118): who can edit and see them."""

from uuid import uuid4

CORA = "b0000000-0000-0000-0000-000000000001"
PROVIDER = "d0000000-0000-0000-0000-000000000001"  # consented provider in seed.sql
POTTERY = "e0000000-0000-0000-0000-000000000001"  # seed activity, consented provider
POTTERY_TASTER = "e1000000-0000-0000-0000-000000000011"  # provider hasn't consented


def new_activity() -> dict:
    """A unique name, so the tests can run again without a database reset."""
    return {"provider_id": PROVIDER, "name": f"Test activity {uuid4().hex[:8]}"}


def test_support_worker_cannot_add_an_activity(api, headers):
    r = api.post("/activities", json=new_activity(), headers=headers("will"))
    assert r.status_code == 403


def test_support_worker_cannot_edit_an_activity(api, headers):
    r = api.patch(f"/activities/{POTTERY}", json={"description": "Changed by Will"}, headers=headers("will"))
    assert r.status_code == 403


def test_support_worker_gets_404_for_a_non_consented_provider(api, headers):
    assert api.get(f"/activities/{POTTERY_TASTER}", headers=headers("will")).status_code == 404
    # Control: a coordinator still sees it, so the 404 is the consent rule
    assert api.get(f"/activities/{POTTERY_TASTER}", headers=headers("cora")).status_code == 200


def test_checked_by_follows_checked_at(api, headers):
    r = api.post("/activities", json=new_activity(), headers=headers("cora"))
    assert r.status_code == 201, r.text
    activity_id = r.json()["activity_id"]
    assert r.json()["checked_by"] is None  # never checked yet

    # Setting the check date records who checked: Cora
    checked = "2026-11-01"  # any date will do; a fixed one keeps the test the same every day
    r = api.patch(f"/activities/{activity_id}", json={"checked_at": checked}, headers=headers("cora"))
    assert r.status_code == 200, r.text
    assert r.json()["checked_by"] == CORA

    # Editing something else keeps the check date and the checker
    r = api.patch(f"/activities/{activity_id}", json={"description": "New text"}, headers=headers("cora"))
    assert r.status_code == 200, r.text
    assert r.json()["checked_at"] == checked
    assert r.json()["checked_by"] == CORA
