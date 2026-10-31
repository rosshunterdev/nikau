import hmac
import os
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from ai_matching.contract import (
    CONTRACT_VERSION,
    MatchError,
    MatchRequest,
    MatchResponse,
)
from ai_matching.service import make_gemini, match

# Local runs: GEMINI_API_KEY and MATCHING_SERVICE_KEY from the repo-root .env
# (never committed). On Vercel they are environment variables instead.
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

app = FastAPI(title="Nikau AI Matching")

STATUS = {"unauthorized": 401, "invalid_request": 422}  # anything else is 502


def error_body(request_id, code: str, message: str) -> dict:
    """Every error has this body (contract, "Errors")."""
    return {"request_id": request_id, "error": {"code": code, "message": message}}


class Unauthorized(Exception):
    pass


@app.exception_handler(Unauthorized)
def unauthorized(request: Request, exc: Unauthorized):
    body = error_body(None, "unauthorized", "Missing or wrong service key")
    return JSONResponse(status_code=401, content=body)


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError):
    # Echo request_id back if the body had one
    try:
        request_id = (await request.json()).get("request_id")
    except Exception:  # noqa: BLE001 - body may not be JSON at all
        request_id = None
    first = exc.errors()[0]
    where = ".".join(str(p) for p in first["loc"] if p != "body")
    body = error_body(request_id, "invalid_request", f"{where}: {first['msg']}")
    return JSONResponse(status_code=422, content=body)


def check_service_key(request: Request) -> None:
    """D1: Authorization: Bearer <MATCHING_SERVICE_KEY>."""
    expected = os.environ.get("MATCHING_SERVICE_KEY", "")
    sent = request.headers.get("authorization", "")
    # compare_digest: same time whether the key is nearly right or totally wrong
    if not expected or not hmac.compare_digest(sent, f"Bearer {expected}"):
        raise Unauthorized()


def get_gemini():
    """The Gemini client. Tests replace this with a fake (no API key, no network)."""
    return make_gemini()


@app.get("/health")
def health():
    """Open. Doesn't call Gemini: shows the service is up, not that the model is."""
    return {
        "status": "ok",
        "service": "ai-matching",
        "contract_version": CONTRACT_VERSION,
    }


@app.post(
    "/match",
    response_model=MatchResponse,
    dependencies=[Depends(check_service_key)],
)
def post_match(body: MatchRequest, gemini: Annotated[object, Depends(get_gemini)]):
    try:
        return match(body, gemini)
    except MatchError as e:
        return JSONResponse(
            status_code=STATUS.get(e.code, 502),
            content=error_body(body.request_id, e.code, e.message),
        )
