import json
from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    project_name: str = "oasis-poc-backend"
    api_v1_prefix: str = "/api/v1"
    mock_mode: bool = True
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o-mini"
    openai_api_key: Optional[str] = Field(default=None, env="OPENAI_API_KEY")
    app_api_key: Optional[str] = Field(default=None, env="APP_API_KEY")
    allowed_origins: list[str] = Field(default_factory=lambda: ["*"])

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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
