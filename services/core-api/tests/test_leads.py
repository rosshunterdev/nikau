import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.leads import LeadCreate

client = TestClient(app)

SAM_ID = "c0000000-0000-0000-0000-000000000001"
LEAD_ID = "80000000-0000-0000-0000-000000000001"
POTTERY_ID = "e0000000-0000-0000-0000-000000000001"
REQUEST_ID = "90000000-0000-0000-0000-000000000001"

MANUAL = {"activity_id": POTTERY_ID, "source": "manual_search"}
AI = {
    "activity_id": POTTERY_ID,
    "source": "ai_match",
    "match_request_id": REQUEST_ID,
    "why_fits": ["Sam enjoys art and craft"],
}


# --- Sign-in: every lead endpoint needs a signed-in user ---

def test_list_all_leads_requires_sign_in():
    assert client.get("/leads").status_code == 401


def test_list_client_leads_requires_sign_in():
    assert client.get(f"/clients/{SAM_ID}/leads").status_code == 401


def test_save_lead_requires_sign_in():
    assert client.post(f"/clients/{SAM_ID}/leads", json=MANUAL).status_code == 401


def test_remove_lead_requires_sign_in():
    assert client.delete(f"/clients/{SAM_ID}/leads/{LEAD_ID}").status_code == 401


# --- Validation: what each source must and mustn't carry ---

def test_manual_lead_passes():
    LeadCreate(**MANUAL)


def test_ai_lead_passes():
    LeadCreate(**AI)


@pytest.mark.parametrize(
    "extra",
    [{"why_fits": ["Fits well"]}, {"match_request_id": REQUEST_ID}],
)
def test_manual_lead_cannot_carry_ai_details(extra):
    with pytest.raises(ValidationError):
        LeadCreate(**MANUAL, **extra)


@pytest.mark.parametrize("missing", ["match_request_id", "why_fits"])
def test_ai_lead_needs_request_and_why_fits(missing):
    body = {k: v for k, v in AI.items() if k != missing}
    with pytest.raises(ValidationError):
        LeadCreate(**body)


def test_ai_lead_has_at_most_three_why_fits():
    with pytest.raises(ValidationError):
        LeadCreate(**{**AI, "why_fits": ["a", "b", "c", "d"]})
