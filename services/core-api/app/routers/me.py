from fastapi import APIRouter, HTTPException, status

from app.deps import CurrentCaller

router = APIRouter(tags=["me"])  # "tags" groups this route on the /docs page


@router.get("/me")
def read_me(caller: CurrentCaller):
    """The signed-in staff member's profile: name, role and organisation."""

    # Get this user's own profile (RLS also allows it)
    res = (
        caller.db.table("profiles")
        .select("user_id, first_name, last_name, role, organisation_id, is_active")
        .eq("user_id", caller.user_id)
        .maybe_single()  # expect one row, or none
        .execute()
    )
    profile = res.data if res else None

    # No profile, or account switched off: block access
    if profile is None or not profile["is_active"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account inactive")
    return profile
