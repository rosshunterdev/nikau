from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from postgrest.exceptions import APIError

from app.deps import CurrentCaller
from app.schemas.providers import Provider, ProviderCreate, ProviderUpdate

router = APIRouter(tags=["providers"])

PROVIDER_FIELDS = (
    "provider_id, name, contact_email, contact_phone, website, "
    "consent_given, consent_date, created_at"
)

# Postgres error codes we turn into clear messages
NOT_ALLOWED = "42501"  # RLS blocked it
CHECK_FAILED = "23514"  # a table rule (check constraint) failed


@router.get("/providers", response_model=list[Provider])
def list_providers(caller: CurrentCaller):
    """Providers you're allowed to see, A to Z.
    Coordinators see all; other staff only providers who gave consent (RLS)."""
    res = caller.db.table("providers").select(PROVIDER_FIELDS).order("name").execute()
    return res.data


@router.get("/providers/{provider_id}", response_model=Provider)
def get_provider(provider_id: UUID, caller: CurrentCaller):
    """One provider. 404 if it doesn't exist or you're not allowed to see it."""
    res = (
        caller.db.table("providers")
        .select(PROVIDER_FIELDS)
        .eq("provider_id", str(provider_id))
        .maybe_single()
        .execute()
    )
    row = res.data if res else None
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider not found")
    return row


@router.post(
    "/providers", response_model=Provider, status_code=status.HTTP_201_CREATED
)
def create_provider(body: ProviderCreate, caller: CurrentCaller):
    """Add a provider. Coordinators only (RLS)."""
    try:
        res = (
            caller.db.table("providers")
            .insert(body.model_dump(mode="json"))
            .execute()
        )
    except APIError as e:
        if e.code == NOT_ALLOWED:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Only coordinators can add providers"
            )
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not save provider")
    return res.data[0]


@router.patch("/providers/{provider_id}", response_model=Provider)
def update_provider(provider_id: UUID, body: ProviderUpdate, caller: CurrentCaller):
    """Edit a provider. Only the fields you send change. Coordinators only (RLS)."""

    # 0. Must be a provider you can see (404 if not)
    get_provider(provider_id, caller)

    changes = body.model_dump(mode="json", exclude_unset=True)
    if not changes:
        return get_provider(provider_id, caller)  # nothing to change

    try:
        res = (
            caller.db.table("providers")
            .update(changes)
            .eq("provider_id", str(provider_id))
            .execute()
        )
    except APIError as e:
        if e.code == CHECK_FAILED:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Add the date the provider gave consent"
            )
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not save provider")

    if not res.data:  # RLS let you see it, but not edit it
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only coordinators can edit providers")
    return res.data[0]