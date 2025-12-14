from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.api.v1.schemas import RiskRequest, RiskResponse


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class Project(BaseModel):
    project_id: str
    name: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime


class AssessmentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    template_id: str | None = Field(default=None, max_length=200)
    payload: RiskRequest


class Assessment(BaseModel):
    assessment_id: str
    project_id: str
    title: str
    template_id: str | None = None
    created_at: datetime
    updated_at: datetime
    latest_version_id: str | None = None
    payload: RiskRequest


class AssessmentSummary(BaseModel):
    assessment_id: str
    project_id: str
    title: str
    template_id: str | None = None
    updated_at: datetime
    latest_version_id: str | None = None
    latest_version_number: int | None = None
    latest_trace_id: str | None = None


class AssessmentVersionSummary(BaseModel):
    version_id: str
    assessment_id: str
    version_number: int
    created_at: datetime
    trace_id: str
    mode: Literal["auto", "mock", "live"]
    resolved_mode: Literal["mock", "live"]
    llm_provider: str
    llm_model: str
    prompt_variant: str
    rag_enabled: bool | None = None


class AssessmentVersion(BaseModel):
    version_id: str
    assessment_id: str
    version_number: int
    created_at: datetime
    trace_id: str
    mode: Literal["auto", "mock", "live"]
    resolved_mode: Literal["mock", "live"]
    llm_provider: str
    llm_model: str
    prompt_variant: str
    system_prompt_sha256: str
    user_prompt: str
    rag_enabled: bool | None = None
    request: RiskRequest
    response: RiskResponse


class FeedbackCreate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    flags: list[str] = Field(default_factory=list, max_length=20)
    comment: str | None = Field(default=None, max_length=4000)
    recommended_edits: str | None = Field(default=None, max_length=4000)
    reviewer: str | None = Field(default=None, max_length=200)


class Feedback(BaseModel):
    feedback_id: str
    assessment_id: str
    version_id: str
    created_at: datetime
    rating: int | None = None
    flags: list[str] = Field(default_factory=list)
    comment: str | None = None
    recommended_edits: str | None = None
    reviewer: str | None = None
