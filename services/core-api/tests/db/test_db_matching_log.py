def test_coordinator_sees_org_log(api, headers):
    res = api.get("/matching-log", headers=headers("cora"))
    assert res.status_code == 200

    rows = res.json()
    will = next(r for r in rows if r["request_id"] == "90000000-0000-0000-0000-000000000001")
    assert will["requested_by_name"] is not None


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