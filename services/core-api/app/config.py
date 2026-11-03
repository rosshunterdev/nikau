from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings. Values come from environment variables or the .env file."""

    supabase_url: str = "http://127.0.0.1:54321"
    supabase_publishable_key: str = ""
    cors_origins: list[str] = ["http://localhost:5173"]
    
    # AI Matching service (SCRUM-87). The key must match the one AI Matching expects (D1).
    ai_matching_url: str = "http://127.0.0.1:8001"
    matching_service_key: str = ""

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
