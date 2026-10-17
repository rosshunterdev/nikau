from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import me

app = FastAPI(title="Nikau Core API")

# Let the frontend call this API from the browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(me.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "core-api"}
