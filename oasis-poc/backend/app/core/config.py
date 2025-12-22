import json
from functools import lru_cache
from pathlib import Path
from tempfile import gettempdir
from typing import Literal, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    project_name: str = "oasis-poc-backend"
    api_v1_prefix: str = "/api/v1"
    mock_mode: bool = True
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o-mini"
    openai_api_key: Optional[str] = Field(default=None, validation_alias="OPENAI_API_KEY")
    app_api_key: Optional[str] = Field(default=None, validation_alias="APP_API_KEY")
    store_path: str = Field(
        default=str(Path(gettempdir()) / "oasis_store.json"),
        validation_alias="OASIS_STORE_PATH",
    )

    auth_mode: Literal["disabled", "api_key", "jwt"] = Field(default="disabled", validation_alias="OASIS_AUTH_MODE")
    default_roles: list[str] = Field(default_factory=lambda: ["analyst"], validation_alias="OASIS_DEFAULT_ROLES")
    jwt_issuer: Optional[str] = Field(default=None, validation_alias="OASIS_JWT_ISSUER")
    jwt_audience: Optional[str] = Field(default=None, validation_alias="OASIS_JWT_AUDIENCE")
    jwt_secret: Optional[str] = Field(default=None, validation_alias="OASIS_JWT_SECRET")
    jwt_jwks_url: Optional[str] = Field(default=None, validation_alias="OASIS_JWT_JWKS_URL")
    jwt_roles_claim: Optional[str] = Field(default=None, validation_alias="OASIS_JWT_ROLES_CLAIM")
    allowed_origins: list[str] = Field(default_factory=lambda: ["*"])
    cors_allow_credentials: bool = Field(default=False, validation_alias="CORS_ALLOW_CREDENTIALS")
    serve_frontend: bool = Field(default=True, validation_alias="SERVE_FRONTEND")
    frontend_dist_path: Optional[str] = Field(default=None, validation_alias="FRONTEND_DIST_PATH")

    @field_validator("app_api_key", "openai_api_key", mode="before")
    @classmethod
    def strip_blank(cls, value: object) -> object:
        """
        Normalize secrets so blank strings are treated as unset.
        """
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: object) -> list[str] | object:
        """
        Accept plain strings (e.g. "*" or comma-separated URLs) in addition to JSON lists.
        """
        if value is None or value == "":
            return ["*"]

        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return ["*"]

            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    return parsed
            except ValueError:
                pass

            if stripped == "*":
                return ["*"]

            return [item for item in (v.strip() for v in stripped.split(",")) if item]

        return value

    @field_validator("default_roles", mode="before")
    @classmethod
    def parse_default_roles(cls, value: object) -> list[str] | object:
        """
        Accept comma-separated strings or JSON arrays for default roles.
        """
        if value is None or value == "":
            return ["analyst"]

        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return ["analyst"]
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    return parsed
            except ValueError:
                pass
            return [item for item in (v.strip() for v in stripped.split(",")) if item]

        return value

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def resolved_frontend_dist_path(self) -> Path:
        """
        Determine where the built SPA assets live. Allows overriding so the backend can
        avoid bundling the UI when a CDN serves it instead.
        """
        if self.frontend_dist_path:
            return Path(self.frontend_dist_path)
        return Path(__file__).resolve().parent.parent / "frontend_dist"


@lru_cache
def get_settings() -> Settings:
    return Settings()
