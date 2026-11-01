from app.catalogue import nz_year, search_catalogue, to_prefilter_activity
from app.prefilter import excluded_by

ROW = {
    "activity_id": "x",
    "name": "Swim club",
    "archived_at": None,
    "physical_demand": "medium",
    "providers": {"name": "Pool", "consent_given": True},
    "activity_sessions": [{"day": "wed", "start_time": "10:00:00"}],
    "activity_tags": [{"tag_id": "t1"}],
}


def test_consent_comes_from_the_provider():
    assert to_prefilter_activity(ROW)["consent_given"] is True


def test_no_provider_means_no_consent():
    row = {**ROW, "providers": None}
    assert to_prefilter_activity(row)["consent_given"] is None


def test_sessions_use_the_prefilter_shape():
    assert to_prefilter_activity(ROW)["sessions"] == [{"day": "wed", "start": "10:00:00"}]


def test_tags_become_a_list_of_ids():
    assert to_prefilter_activity(ROW)["tags"] == ["t1"]


def test_a_mapped_row_works_with_the_prefilter():
    client = {"availability": [{"day": "wed", "slot": "morning"}], "max_physical_demand": "high"}
    assert excluded_by(client, to_prefilter_activity(ROW), 2026) is None


def test_a_mapped_row_is_excluded_by_its_schedule():
    client = {"availability": [{"day": "wed", "slot": "evening"}]}
    assert excluded_by(client, to_prefilter_activity(ROW), 2026) == "schedule"


def test_nz_year_is_a_plausible_year():
    assert 2026 <= nz_year() <= 2100

    # --- search_catalogue ---

def make_row(name, **fields):
    row = {
        "activity_id": name,
        "name": name,
        "suburb_id": None,
        "archived_at": None,
        "providers": {"name": "P", "consent_given": True},
        "activity_sessions": [],
        "activity_tags": [],
    }
    row.update(fields)
    return row


ROWS = [
    make_row("Pottery", physical_demand="low", suburb_id="s1", activity_tags=[{"tag_id": "art"}]),
    make_row("Gym class", physical_demand="high", suburb_id="s2", activity_tags=[{"tag_id": "sport"}]),
    make_row("Mystery club"),  # everything unknown
    make_row("Hidden", providers={"name": "P", "consent_given": False}),
    make_row("Old walk", archived_at="2026-10-01T00:00:00Z"),
]


def names(result):
    return sorted(a["name"] for a in result)


def test_no_filters_keeps_consented_active_activities():
    assert names(search_catalogue(ROWS, {}, 2026)) == ["Gym class", "Mystery club", "Pottery"]


def test_needs_use_the_prefilter_rules():
    kept = search_catalogue(ROWS, {"max_physical_demand": "medium"}, 2026)
    assert names(kept) == ["Mystery club", "Pottery"]  # unknown demand is kept


def test_name_search_ignores_capitals():
    assert names(search_catalogue(ROWS, {}, 2026, q="POT")) == ["Pottery"]


def test_suburb_keeps_unknown_suburbs():
    assert names(search_catalogue(ROWS, {}, 2026, suburb_id="s1")) == ["Mystery club", "Pottery"]


def test_tags_keep_activities_without_tags():
    assert names(search_catalogue(ROWS, {}, 2026, tags=["art"])) == ["Mystery club", "Pottery"]
