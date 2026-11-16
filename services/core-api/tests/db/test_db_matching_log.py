def test_coordinator_sees_org_log(api, headers):
    res = api.get("/matching-log", headers=headers("cora"))
    assert res.status_code == 200

    rows = res.json()
    will = next(r for r in rows if r["request_id"] == "90000000-0000-0000-0000-000000000001")
    # SCRUM-129 fix 10: no staff names on the log, only speed and outcome
    assert "requested_by_name" not in will


def test_worker_gets_blocked(api, headers):
    res = api.get("/matching-log", headers=headers("will"))
    assert res.status_code == 403

    control = api.get("/matching-log", headers=headers("cora"))
    assert control.status_code == 200


def test_other_org_sees_nothing(api, headers):
    res = api.get("/matching-log", headers=headers("olive"))
    assert res.status_code == 200

    ids = [r["request_id"] for r in res.json()]
    assert "90000000-0000-0000-0000-000000000001" not in ids

def test_period_must_be_1_to_365_days(api, headers):
    """SCRUM-129 fix 10: ?days= sets the period; out of range is rejected."""
    assert api.get("/matching-log?days=30", headers=headers("cora")).status_code == 200
    assert api.get("/matching-log?days=0", headers=headers("cora")).status_code == 422
    assert api.get("/matching-log?days=366", headers=headers("cora")).status_code == 422
