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


def my_organisation_id(caller: Caller) -> str:
    """The signed-in person's organisation, from their profile."""

    res = (
        caller.db.table("profiles")
        .select("organisation_id")
        .eq("user_id", caller.user_id)
        .maybe_single()
        .execute()
    )
    if not res or not res.data:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account inactive")
    return res.data["organisation_id"]


def check_tags_exist(caller: Caller, tag_ids: set[str]) -> None:
    """400 if any interest tag id isn't real. Run this BEFORE saving anything."""
    if not tag_ids:
        return
    found = (
        caller.db.table("tags").select("tag_id").in_("tag_id", list(tag_ids)).execute()
    )
    if len(found.data) != len(tag_ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown interest tag")


@router.post(
    "/clients", response_model=ClientDetail, status_code=status.HTTP_201_CREATED
)
def create_client(body: ClientCreate, caller: CurrentCaller):
    """Add a client. Organisation and creator come from your sign-in, not the form."""

    # 0. Check tags BEFORE saving anything (no half-saved clients)
    tag_ids = {str(t) for t in body.interests}
    check_tags_exist(caller, tag_ids)
    if tag_ids:
        found = (
            caller.db.table("tags")
            .select("tag_id")
            .in_("tag_id", list(tag_ids))
            .execute()
        )
        if len(found.data) != len(tag_ids):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown interest tag")

    # 1. The client row (interests and availability live in their own tables)
    row = body.model_dump(mode="json", exclude={"interests", "availability"})
    row["organisation_id"] = my_organisation_id(caller)
    row["created_by"] = caller.user_id

    try:
        res = caller.db.table("clients").insert(row).execute()
        client_id = res.data[0]["client_id"]

        # 2. Interests (tag_ids is already a set, so no duplicates)
        tags = [{"client_id": client_id, "tag_id": t} for t in tag_ids]
        if tags:
            caller.db.table("client_interests").insert(tags).execute()

        # 3. Availability (duplicates dropped the same way)
        times = {(a.day, a.slot) for a in body.availability}
        slots = [{"client_id": client_id, "day": d, "slot": s} for d, s in times]
        if slots:
            caller.db.table("client_availability").insert(slots).execute()

    except APIError:
        # e.g. a suburb id that doesn't exist
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Could not save client. Check the suburb and interests.",
        )

    # Send back the saved client, in the same shape as GET /clients/{id}
    return get_client(UUID(client_id), caller)


@router.patch("/clients/{client_id}", response_model=ClientDetail)
def update_client(client_id: UUID, body: ClientUpdate, caller: CurrentCaller):
    """Edit a client. Only the fields you send change. 404 if you can't see it."""

    # 0. Must be a client you can see (get_client raises 404 if not)
    get_client(client_id, caller)

    # Only the fields actually sent (exclude_unset skips the ones left out)
    changes = body.model_dump(
        mode="json", exclude_unset=True, exclude={"interests", "availability"}
    )

    # Check tags BEFORE saving anything
    tag_ids = None
    if body.interests is not None:
        tag_ids = {str(t) for t in body.interests}
        check_tags_exist(caller, tag_ids)

    try:
        # 1. The client row, only if any of its fields were sent
        if changes:
            res = (
                caller.db.table("clients")
                .update(changes)
                .eq("client_id", str(client_id))
                .execute()
            )
            if not res.data:  # RLS let you see it, but not edit it
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN, "You can't edit this client"
                )

        # 2. Interests: if sent, replace the whole list
        if tag_ids is not None:
            caller.db.table("client_interests").delete().eq(
                "client_id", str(client_id)
            ).execute()
            tags = [{"client_id": str(client_id), "tag_id": t} for t in tag_ids]
            if tags:
                caller.db.table("client_interests").insert(tags).execute()

        # 3. Availability: if sent, replace the whole list
        if body.availability is not None:
            caller.db.table("client_availability").delete().eq(
                "client_id", str(client_id)
            ).execute()
            times = {(a.day, a.slot) for a in body.availability}
            slots = [
                {"client_id": str(client_id), "day": d, "slot": s} for d, s in times
            ]
            if slots:
                caller.db.table("client_availability").insert(slots).execute()

    except APIError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Could not save client. Check the suburb and interests.",
        )

    # Send back the updated client
    return get_client(client_id, caller)
