from typing import List, Literal, Optional

from pydantic import BaseModel, Field


Likelihood = Literal["Low", "Medium", "High"]
Severity = Literal["Low", "Medium", "High", "Critical"]


PublicSourceType = Literal[
    "NIST",
    "ISO27001",
    "OWASP",
    "SEC",
    "INCIDENT_REPORT",
    "CVE",
    "DATASET",
    "OTHER",
]


class PublicReference(BaseModel):
    source_type: PublicSourceType
    title: str
    identifier: Optional[str] = None
    url: Optional[str] = None
    notes: Optional[str] = None


class ControlFrameworkMapping(BaseModel):
    control_statement: str
    framework: str = Field(
        ...,
        json_schema_extra={
            "example": "NIST SP 800-53 Rev. 5",
        },
    )
    framework_control_id: str = Field(
        ...,
        json_schema_extra={"example": "SA-9"},
    )
    framework_control_name: Optional[str] = Field(
        default=None,
        json_schema_extra={"example": "External System Services"},
    )
    mapping_rationale: Optional[str] = None
    references: List[PublicReference] = Field(default_factory=list)


VulnerabilityType = Literal["CVE", "OWASP", "INCIDENT_REPORT", "DATASET", "OTHER"]


class VulnerabilitySummary(BaseModel):
    vulnerability_type: VulnerabilityType
    identifier: Optional[str] = Field(
        default=None,
        description="Optional identifier such as CVE ID or OWASP category (e.g., CVE-2021-44228, A01:2021).",
    )
    title: str
    summary: str
    severity: Severity
    cvss_v3_base_score: Optional[float] = Field(
        default=None,
        ge=0,
        le=10,
        description="Optional CVSS v3 base score (0.0-10.0) when applicable.",
    )
    references: List[PublicReference] = Field(default_factory=list)


class RiskRequest(BaseModel):
    business_type: str = Field(..., json_schema_extra={"example": "Retail banking"})
    risk_domain: str = Field(..., json_schema_extra={"example": "Operational"})
    region: Optional[str] = Field(default=None, json_schema_extra={"example": "North America"})
    size: Optional[str] = Field(default=None, json_schema_extra={"example": "Mid"})
    maturity: Optional[str] = Field(default=None, json_schema_extra={"example": "Defined"})
    objectives: Optional[str] = Field(default=None, json_schema_extra={"example": "Create risk register"})
    context: Optional[str] = Field(default=None, json_schema_extra={"example": "New digital onboarding channel"})
    constraints: Optional[str] = Field(default=None, json_schema_extra={"example": "Avoid storing PII"})
    requested_outputs: Optional[str] = Field(
        default=None, json_schema_extra={"example": "Narrative + register + mitigations"}
    )
    refinements: Optional[str] = Field(
        default=None, json_schema_extra={"example": "Emphasize regulatory expectations"}
    )
    control_tokens: List[str] = Field(
        default_factory=list,
        json_schema_extra={"example": ["tone=regulatory", "length=concise", "format=numbered"]},
        description="Optional control tokens to steer the response (e.g., tone=regulatory, length=concise).",
    )
    instruction_tuning: Optional[str] = Field(
        default=None,
        json_schema_extra={
            "example": "Use short sentences, cite public frameworks, avoid speculative claims."
        },
        description="Additional steering instructions or constraints to guide the model output.",
    )


class RiskItem(BaseModel):
    risk_id: str = Field(..., json_schema_extra={"example": "R1"})
    risk_title: str = Field(..., json_schema_extra={"example": "Third-party outage"})
    cause: str
    impact: str
    likelihood: Likelihood
    inherent_rating: Likelihood
    residual_rating: Likelihood
    controls: List[str] = Field(default_factory=list)
    control_mappings: List[ControlFrameworkMapping] = Field(default_factory=list)
    mitigations: List[str] = Field(default_factory=list)
    kpis: List[str] = Field(default_factory=list)
    vulnerability_summaries: List[VulnerabilitySummary] = Field(default_factory=list)
    owner: Optional[str] = None
    due_date: Optional[str] = None
    assumptions: List[str] = Field(default_factory=list)


class RiskResponse(BaseModel):
    trace_id: str
    summary: str
    risks: List[RiskItem]
    assumptions_gaps: List[str] = Field(default_factory=list)
