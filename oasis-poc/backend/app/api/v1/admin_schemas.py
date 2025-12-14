from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.api.v1.schemas import RiskRequest, RiskResponse


class PromptTemplateUpsert(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    content: str = Field(..., min_length=1, max_length=20000)
    notes: str | None = Field(default=None, max_length=2000)


class PromptTemplateUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=20000)
    notes: str | None = Field(default=None, max_length=2000)


class PromptTemplateVersion(BaseModel):
    version: int
    created_at: datetime
    sha256: str
    notes: str | None = None


class PromptTemplateSummary(BaseModel):
    name: str
    source: str = Field(..., description="builtin|store")
    managed: bool
    current_version: int | None = None
    updated_at: datetime | None = None


class PromptTemplateDetail(BaseModel):
    name: str
    source: str
    managed: bool
    current_version: int | None = None
    updated_at: datetime | None = None
    content: str
    versions: list[PromptTemplateVersion] = Field(default_factory=list)


class PromptTemplateTestRunRequest(BaseModel):
    payload: RiskRequest
    mode: str | None = Field(default="mock", description="mock|live|auto")
    llm_model: str | None = None


class PromptTemplateTestRunResponse(BaseModel):
    trace_id: str
    system_prompt_sha256: str
    user_prompt: str
    response: RiskResponse


class AdminSettings(BaseModel):
    mock_mode: bool
    llm_provider: str
    llm_model: str
    allowed_origins: list[str]
    auth_mode: str
    app_api_key_configured: bool
    jwt_issuer: str | None = None
    jwt_audience: str | None = None
    jwt_jwks_url: str | None = None
    jwt_roles_claim: str | None = None
    store_path: str


class AuditSnapshot(BaseModel):
    recent_versions: list[dict]
    recent_feedback: list[dict]

