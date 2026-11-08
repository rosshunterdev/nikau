"""Leads against the real database (SCRUM-118): RLS decides who sees and changes what."""

SAM = "c0000000-0000-0000-0000-000000000001"  # Will is assigned to Sam
ALEX = "c0000000-0000-0000-0000-000000000002"  # Test Org, not assigned to Will
POTTERY = "e0000000-0000-0000-0000-000000000001"  # already saved for Sam in the seed
GARDEN = "e1000000-0000-0000-0000-000000000002"  # catalogue seed, consented provider


def test_will_gets_404_for_alexs_leads(api, headers):
    r = api.get(f"/clients/{ALEX}/leads", headers=headers("will"))
    assert r.status_code == 404


def test_cora_can_see_alexs_leads(api, headers):
    # The same request works for a coordinator, so the 404 above is RLS, not a broken URL
    r = api.get(f"/clients/{ALEX}/leads", headers=headers("cora"))
    assert r.status_code == 200


def test_saving_the_same_activity_twice_gives_409(api, headers):
    body = {"activity_id": POTTERY, "source": "manual_search"}
    r = api.post(f"/clients/{SAM}/leads", json=body, headers=headers("will"))
    assert r.status_code == 409


def test_will_cannot_remove_alexs_lead(api, headers):
    # Cora saves a lead for Alex, so there is one to try
    body = {"activity_id": GARDEN, "source": "manual_search"}
    r = api.post(f"/clients/{ALEX}/leads", json=body, headers=headers("cora"))
    assert r.status_code == 201, r.text
    lead_id = r.json()["lead_id"]
    try:
        r = api.delete(f"/clients/{ALEX}/leads/{lead_id}", headers=headers("will"))
        assert r.status_code == 404
        # ...and the lead is still there: a 404 alone would also pass if the delete went through
        r = api.get(f"/clients/{ALEX}/leads", headers=headers("cora"))
        assert lead_id in [lead["lead_id"] for lead in r.json()]
    finally:
        # Clean up, so the test can run again without a database reset
        api.delete(f"/clients/{ALEX}/leads/{lead_id}", headers=headers("cora"))
