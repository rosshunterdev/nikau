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


def test_activity_detail_has_provider_and_suburb_names(api, headers):
    # SCRUM-129 fix 07: the read-only page gets names, not just ids
    r = api.get(f"/activities/{POTTERY}", headers=headers("will"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider_name"], "the seed gives Pottery a provider"
    for field in ("provider_phone", "provider_email", "provider_website", "suburb_name"):
        assert field in body
    assert "checked_by_name" in body


# --- SCRUM-129 fix 08: the rest of the activity form, and archiving ---

MORE_DETAILS = {
    "street_address": "12 Clay Street",
    "joining": "drop_in",
    "group_size": "under_10",
    "physical_notes": "Seated at tables",
    "sensory_notes": "Quiet room",
    "bus_routes": "2, 3",
    "walk_from_stop_minutes": 5,
    "staff_support": "staff_can_assist",
    "staff_experience": True,
    "not_in_listing": "Whether there's an accessible toilet on site",
    "check_method": "phone_call",
}


def test_new_activity_saves_the_extra_details(api, headers):
    r = api.post("/activities", json={**new_activity(), **MORE_DETAILS}, headers=headers("cora"))
    assert r.status_code == 201, r.text
    body = r.json()
    for field, value in MORE_DETAILS.items():
        assert body[field] == value, field


def test_editing_saves_the_extra_details_and_keeps_the_rest(api, headers):
    r = api.post("/activities", json=new_activity(), headers=headers("cora"))
    activity_id = r.json()["activity_id"]
    r = api.patch(f"/activities/{activity_id}", json=MORE_DETAILS, headers=headers("cora"))
    assert r.status_code == 200, r.text
    assert r.json()["not_in_listing"] == MORE_DETAILS["not_in_listing"]

    # Changing one field leaves the others as they were
    r = api.patch(f"/activities/{activity_id}", json={"joining": "waitlist"}, headers=headers("cora"))
    assert r.status_code == 200, r.text
    assert r.json()["joining"] == "waitlist"
    assert r.json()["check_method"] == "phone_call"


def test_support_worker_cannot_archive_an_activity(api, headers):
    r = api.post(f"/activities/{POTTERY}/archive", headers=headers("will"))
    assert r.status_code == 403


def test_coordinator_archives_an_activity(api, headers):
    r = api.post("/activities", json=new_activity(), headers=headers("cora"))
    activity_id = r.json()["activity_id"]

    assert api.post(f"/activities/{activity_id}/archive", headers=headers("cora")).status_code == 204
    # It leaves the catalogue but can still be opened (saved leads point to it)
    listed = [a["activity_id"] for a in api.get("/activities", headers=headers("cora")).json()]
    assert activity_id not in listed
    r = api.get(f"/activities/{activity_id}", headers=headers("cora"))
    assert r.json()["archived_at"] is not None
    # Archiving twice says so
    assert api.post(f"/activities/{activity_id}/archive", headers=headers("cora")).status_code == 409
