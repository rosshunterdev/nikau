from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from postgrest.exceptions import APIError

from app.deps import Caller, CurrentCaller
from app.schemas.leads import LeadCreate, LeadDetail, LeadWithClient

router = APIRouter(tags=["leads"])

# The lead, plus the activity and provider names and who saved it.
# If RLS hides the activity (consent withdrawn), "activities" comes back empty.
LEAD_FIELDS = (
    "lead_id, client_id, activity_id, source, why_fits, why_doesnt_cover, why_ask, "
    "match_request_id, saved_on, activities(name, providers(name)), "
    "profiles(first_name, last_name)"
)

# Postgres error codes from saving a lead, turned into clear responses
ALREADY_SAVED = "23505"  # lead_saved_once: this activity is already saved for this client
NOT_ALLOWED = "42501"  # RLS: activity not visible to you, or a match request that isn't yours
BAD_LINK = "23503"  # an activity or match request id that doesn't exist


def lines(text: str | None) -> list[str]:
    """The AI's explanation is stored as one text, one line per item (contract D6)."""
    return text.split("\n") if text else []


def to_lead(row: dict) -> dict:
    """Reshape a database row (with its linked tables) into the LeadDetail shape."""
    activity = row.pop("activities") or {}  # empty = no longer listed
    provider = activity.get("providers") or {}
    saver = row.pop("profiles") or {}
    saved_by = " ".join(n for n in (saver.get("first_name"), saver.get("last_name")) if n)
    return {
        **row,
        "activity_name": activity.get("name"),
        "provider_name": provider.get("name"),
        "saved_by_name": saved_by or None,
        "why_fits": lines(row["why_fits"]),
        "why_doesnt_cover": lines(row["why_doesnt_cover"]),
        "why_ask": lines(row["why_ask"]),
    }


def require_client(caller: Caller, client_id: UUID) -> None:
    """404 if the client doesn't exist or you're not allowed to see it."""
    res = (
        caller.db.table("clients")
        .select("client_id")
        .eq("client_id", str(client_id))
        .maybe_single()
        .execute()
    )
    if res is None or res.data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")


def get_lead(caller: Caller, lead_id: str) -> dict:
    res = caller.db.table("leads").select(LEAD_FIELDS).eq("lead_id", lead_id).single().execute()
    return to_lead(res.data)


@router.get("/leads", response_model=list[LeadWithClient])
def list_all_leads(caller: CurrentCaller):
    """Every lead you're allowed to see (RLS decides), newest first. For the Saved leads page."""
    res = (
        caller.db.table("leads")
        .select(f"{LEAD_FIELDS}, clients(preferred_name)")
        .order("saved_on", desc=True)
        .execute()
    )
    leads = []
    for row in res.data:
        client = row.pop("clients") or {}
        leads.append({**to_lead(row), "client_name": client.get("preferred_name")})
    return leads


@router.get("/clients/{client_id}/leads", response_model=list[LeadDetail])
def list_client_leads(client_id: UUID, caller: CurrentCaller):
    """One client's saved leads, newest first. 404 if you can't see the client."""
    require_client(caller, client_id)
    res = (
        caller.db.table("leads")
        .select(LEAD_FIELDS)
        .eq("client_id", str(client_id))
        .order("saved_on", desc=True)
        .execute()
    )
    return [to_lead(row) for row in res.data]


@router.post(
    "/clients/{client_id}/leads",
    response_model=LeadDetail,
    status_code=status.HTTP_201_CREATED,
)
def save_lead(client_id: UUID, body: LeadCreate, caller: CurrentCaller):
    """Save an activity as a lead for this client. Leads are a snapshot: no edit."""
    require_client(caller, client_id)

    row = {
        "client_id": str(client_id),
        "activity_id": str(body.activity_id),
        "source": body.source,
        "saved_by": caller.user_id,  # the insert policy requires it to be you
        "match_request_id": str(body.match_request_id) if body.match_request_id else None,
        "why_fits": "\n".join(body.why_fits) or None,
        "why_doesnt_cover": "\n".join(body.why_doesnt_cover) or None,
        "why_ask": "\n".join(body.why_ask) or None,
    }

    try:
        res = caller.db.table("leads").insert(row).execute()
    except APIError as e:
        if e.code == ALREADY_SAVED:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "This activity is already saved for this client"
            )
        if e.code in (NOT_ALLOWED, BAD_LINK):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "This activity can't be saved for this client"
            )
        # Anything else is unexpected: our fault, not the user's
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not save lead")

    return get_lead(caller, res.data[0]["lead_id"])


@router.delete(
    "/clients/{client_id}/leads/{lead_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_lead(client_id: UUID, lead_id: UUID, caller: CurrentCaller):
    """Remove a saved lead. 404 if it doesn't exist or you can't see its client."""
    res = (
        caller.db.table("leads")
        .delete()
        .eq("lead_id", str(lead_id))
        .eq("client_id", str(client_id))
        .execute()
    )
    if not res.data:  # nothing deleted: not found, or RLS hid it
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
