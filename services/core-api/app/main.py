# Imports
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import clients, lookups, me, providers

app = FastAPI(title="Nikau Core API")

# Let the frontend call this API from the browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(me.router)
app.include_router(lookups.router)
app.include_router(clients.router)
app.include_router(providers.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "core-api"}
