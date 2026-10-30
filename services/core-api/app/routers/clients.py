from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from postgrest.exceptions import APIError

from app.deps import Caller, CurrentCaller
from app.schemas.clients import ClientCreate, ClientDetail, ClientSummary, ClientUpdate

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
def list_clients(caller: CurrentCaller):
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
def get_client(client_id: UUID, caller: CurrentCaller):
    """One client in full. 404 if it doesn't exist or you're not allowed to see it."""
    res = (
        caller.db.table("clients")
        .select(
            f"{CLIENT_FIELDS}, client_interests(tag_id), client_availability(day, slot)"
        )
        .eq("client_id", str(client_id))
        .maybe_single()
        .execute()
    )
    row = res.data if res else None

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return to_detail(row)


def check_tags_exist(caller: Caller, tag_ids: set[str]) -> None:
    """400 if any interest tag id isn't real. Run this BEFORE saving anything."""
    if not tag_ids:
        return
    found = (
        caller.db.table("tags").select("tag_id").in_("tag_id", list(tag_ids)).execute()
    )
    if len(found.data) != len(tag_ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown interest tag")


# Postgres error codes from the save functions, turned into clear responses
NOT_FOUND = "P0002"  # the client doesn't exist, or you can't see it
NOT_ALLOWED = "42501"  # you can see it but can't edit it (RLS)
BAD_LINK = "23503"  # a suburb or interest tag that doesn't exist


def save_error(e: APIError) -> HTTPException:
    """Turn a database error into a clear message for the form."""
    if e.code == NOT_FOUND:
        return HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    if e.code == NOT_ALLOWED:
        return HTTPException(status.HTTP_403_FORBIDDEN, "You can't edit this client")
    if e.code == BAD_LINK:
        return HTTPException(
            status.HTTP_400_BAD_REQUEST, "Check the suburb and interests"
        )
    return HTTPException(status.HTTP_400_BAD_REQUEST, "Could not save client")


@router.post(
    "/clients", response_model=ClientDetail, status_code=status.HTTP_201_CREATED
)
def create_client(body: ClientCreate, caller: CurrentCaller):
    """Add a client with its interests and availability, all or nothing (SCRUM-78).
    The database sets the organisation and creator from your sign-in."""
    data = body.model_dump(mode="json")
    interests = data.pop("interests")
    availability = data.pop("availability")

    try:
        res = caller.db.rpc(
            "create_client_full",
            {"p_client": data, "p_interests": interests, "p_availability": availability},
        ).execute()
    except APIError as e:
        raise save_error(e)

    # Send back the saved client, in the same shape as GET /clients/{id}
    return get_client(UUID(res.data), caller)


@router.patch("/clients/{client_id}", response_model=ClientDetail)
def update_client(client_id: UUID, body: ClientUpdate, caller: CurrentCaller):
    """Edit a client, all or nothing (SCRUM-78). Only the fields you send change.
    Sending interests or availability replaces the whole list."""
    # Only the fields actually sent; interests and availability go separately
    data = body.model_dump(mode="json", exclude_unset=True)
    interests = data.pop("interests", None)  # None = not sent, leave them alone
    availability = data.pop("availability", None)

    try:
        caller.db.rpc(
            "update_client_full",
            {
                "p_client_id": str(client_id),
                "p_changes": data,
                "p_interests": interests,
                "p_availability": availability,
            },
        ).execute()
    except APIError as e:
        raise save_error(e)

    return get_client(client_id, caller)