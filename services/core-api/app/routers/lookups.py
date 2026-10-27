from fastapi import APIRouter

from app.deps import CurrentCaller
from app.schemas.lookups import Suburb, Tag

router = APIRouter(tags=["lookups"])


@router.get("/suburbs", response_model=list[Suburb])
def list_suburbs(caller: CurrentCaller):
    """All suburbs for the form's suburb dropdown, A to Z."""
    res = (
        caller.db.table("suburbs")
        .select("suburb_id, name, territorial_authority")
        .order("name")
        .execute()
    )
    return res.data


@router.get("/tags", response_model=list[Tag])
def list_tags(caller: CurrentCaller):
    """All interest tags for the form's interest chips, A to Z."""
    res = caller.db.table("tags").select("tag_id, name").order("name").execute()
    return res.data
