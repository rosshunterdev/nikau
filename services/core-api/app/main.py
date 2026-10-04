from fastapi import FastAPI

app = FastAPI(title="Nikau Core API")


@app.get("/health")
def health():
    return {"status": "ok", "service": "core-api"}