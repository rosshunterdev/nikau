"""Helpers that run before routes. Here: check who is signed in."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client
from supabase_auth.errors import AuthError

from app.config import settings

# Reads the "Authorization: Bearer <token>" header sent by the frontend
bearer = HTTPBearer(auto_error=False)


@dataclass
class Caller:
    """Who is making the request, plus a database connection acting as them."""

    user_id: str
    db: Client


def get_caller(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Caller:
    """Check the sign-in token. Routes that use this are protected automatically."""

    # No token at all: not signed in
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")

    token = creds.credentials
    db = create_client(settings.supabase_url, settings.supabase_publishable_key)

    # Ask Supabase if the token is real and not expired
    try:
        result = db.auth.get_user(token)
    except AuthError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired sign-in")
    if result is None or result.user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired sign-in")

    # Database queries now run as this user, so our RLS rules apply
    db.postgrest.auth(token)
    return Caller(user_id=result.user.id, db=db)


# Shortcut for routes: "caller: CurrentCaller" means "must be signed in"
CurrentCaller = Annotated[Caller, Depends(get_caller)]
