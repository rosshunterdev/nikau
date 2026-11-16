"""Providers list against the local database (SCRUM-129 fix 09)."""


def test_providers_list_has_activity_counts(api, headers):
    providers = api.get("/providers", headers=headers("cora")).json()
    assert providers, "the seed data has providers"
    assert all(isinstance(p["activity_count"], int) for p in providers)


def test_activity_counts_match_the_catalogue(api, headers):
    """Coordinators see every activity, so the counts add up to the catalogue."""
    providers = api.get("/providers", headers=headers("cora")).json()
    activities = api.get("/activities", headers=headers("cora")).json()
    assert sum(p["activity_count"] for p in providers) == len(activities)
