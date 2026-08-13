from functools import lru_cache

from pydantic import Field, HttpUrl, SecretStr, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: HttpUrl
    supabase_secret_key: SecretStr
    calibration_signing_secret: SecretStr = Field(min_length=32)
    allowed_origins: str = "http://localhost:3000"
    jwt_audience: str = "authenticated"
    model_version: str = "rfdetr-large-coco-v1"
    gemini_fallback_enabled: bool = False
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-3.6-flash"
    face_landmarker_path: str = "/models/face_landmarker.task"
    max_body_bytes: int = 1_572_864
    sentry_dsn: SecretStr | None = None
    environment: str = "development"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def jwt_issuer(self) -> str:
        return f"{str(self.supabase_url).rstrip('/')}/auth/v1"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def jwks_url(self) -> str:
        return f"{self.jwt_issuer}/.well-known/jwks.json"

    @property
    def cors_origins(self) -> list[str]:
        return [item.strip() for item in self.allowed_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
