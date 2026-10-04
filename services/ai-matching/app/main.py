from fastapi import FastAPI

app = FastAPI(title="Nikau AI Matching")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-matching"}