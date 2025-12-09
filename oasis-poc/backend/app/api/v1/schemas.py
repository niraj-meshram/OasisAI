from typing import List, Literal, Optional

from pydantic import BaseModel, Field


Likelihood = Literal["Low", "Medium", "High"]


class RiskRequest(BaseModel):
    business_type: str = Field(..., example="Retail banking")
    risk_domain: str = Field(..., example="Operational")
    region: Optional[str] = Field(default=None, example="North America")
    size: Optional[str] = Field(default=None, example="Mid")
    maturity: Optional[str] = Field(default=None, example="Defined")
    objectives: Optional[str] = Field(default=None, example="Create risk register")
    context: Optional[str] = Field(default=None, example="New digital onboarding channel")
    constraints: Optional[str] = Field(default=None, example="Avoid storing PII")
    requested_outputs: Optional[str] = Field(default=None, example="Narrative + register + mitigations")
    refinements: Optional[str] = Field(default=None, example="Emphasize regulatory expectations")
    control_tokens: List[str] = Field(
        default_factory=list,
        example=["tone=regulatory", "length=concise", "format=numbered"],
        description="Optional control tokens to steer the response (e.g., tone=regulatory, length=concise).",
    )
    instruction_tuning: Optional[str] = Field(
        default=None,
        example="Use short sentences, cite public frameworks, avoid speculative claims.",
        description="Additional steering instructions or constraints to guide the model output.",
    )


class RiskItem(BaseModel):
    risk_id: str = Field(..., example="R1")
    risk_title: str = Field(..., example="Third-party outage")
    cause: str
    impact: str
    likelihood: Likelihood
    inherent_rating: Likelihood
    residual_rating: Likelihood
    controls: List[str] = Field(default_factory=list)
    mitigations: List[str] = Field(default_factory=list)
    kpis: List[str] = Field(default_factory=list)
    owner: Optional[str] = None
    due_date: Optional[str] = None
    assumptions: List[str] = Field(default_factory=list)


class RiskResponse(BaseModel):
    trace_id: str
    summary: str
    risks: List[RiskItem]
    assumptions_gaps: List[str] = Field(default_factory=list)
