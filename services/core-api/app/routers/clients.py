from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import Caller, get_caller
from app.schemas.clients import ClientDetail, ClientSummary

router = APIRouter(tags=["clients"])

# The client columns the core form uses
CLIENT_FIELDS = (
    "client_id, preferred_name, suburb_id, birth_year, support_needed, "
    "max_physical_demand, needs_step_free, max_sensory_load, sensory_hard_limit, "
    "transport, max_cost, updated_at"
)


def to_detail(row: dict) -> dict:
    """Reshape a database row (with its linked tables) into the ClientDetail shape."""
    row["interests"] = [item["tag_id"] for item in row.pop("client_interests")]
    row["availability"] = row.pop("client_availability")
    row["transport"] = row["transport"] or []  # an empty list instead of nothing
    return row


@router.get("/clients", response_model=list[ClientSummary])
def list_clients(caller: Caller = Depends(get_caller)):
    """Clients you're allowed to see (RLS decides), A to Z."""
    res = (
        caller.db.table("clients")
        .select("client_id, preferred_name, updated_at, suburbs(name)")
        .order("preferred_name")
        .execute()
    )

    clients = []
    for row in res.data:
        suburb = row.pop("suburbs") or {}  # no suburb set yet = empty
        clients.append({**row, "suburb_name": suburb.get("name")})
    return clients


@router.get("/clients/{client_id}", response_model=ClientDetail)
def get_client(client_id: UUID, caller: Caller = Depends(get_caller)):
    """One client in full. 404 if it doesn't exist or you're not allowed to see it."""
    res = (
        caller.db.table("clients")
        .select(f"{CLIENT_FIELDS}, client_interests(tag_id), client_availability(day, slot)")
        .eq("client_id", str(client_id))
        .maybe_single()
        .execute()
    )
    row = res.data if res else None

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return to_detail(row)