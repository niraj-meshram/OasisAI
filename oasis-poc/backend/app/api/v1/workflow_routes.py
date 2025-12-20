from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.api.v1.schemas import RiskRequest
from app.api.v1.workflow_schemas import (
    Assessment,
    AssessmentCreate,
    AssessmentSummary,
    AssessmentVersion,
    AssessmentVersionSummary,
    Feedback,
    FeedbackCreate,
    Project,
    ProjectCreate,
)
from app.core.auth import verify_api_key
from app.core.config import Settings, get_settings
from app.core.data_policy import find_private_indicators
from app.core.rbac import UserPrincipal, require_roles
from app.db.store import OasisStore, get_store
from app.services.llm_adapter import run_llm
from app.services.prompt_engine import build_user_prompt
from app.services.prompt_variants import get_system_prompt


logger = logging.getLogger(__name__)

router = APIRouter(tags=["workflow"], dependencies=[Depends(verify_api_key)])


def _policy_hits_from_risk_request(payload: RiskRequest) -> list[str]:
    return find_private_indicators(
        [
            payload.business_type,
            payload.risk_domain,
            payload.scope,
            payload.time_horizon,
            " ".join(payload.known_controls) if payload.known_controls else None,
            payload.verbosity,
            payload.language,
            payload.region,
            payload.size,
            payload.maturity,
            payload.objectives,
            payload.context,
            payload.constraints,
            payload.requested_outputs,
            payload.refinements,
            " ".join(payload.control_tokens) if payload.control_tokens else None,
            payload.instruction_tuning,
        ]
    )


@router.get("/projects", response_model=list[Project])
def list_projects(
    store: OasisStore = Depends(get_store),
    _: UserPrincipal = Depends(require_roles("analyst", "reviewer")),
) -> list[Project]:
    return [Project.model_validate(p) for p in store.list_projects()]


@router.post("/projects", response_model=Project, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    store: OasisStore = Depends(get_store),
    _: UserPrincipal = Depends(require_roles("analyst")),
) -> Project:
    record = store.create_project(name=body.name, description=body.description)
    return Project.model_validate(record)


@router.get("/projects/{project_id}", response_model=Project)
def get_project(
    project_id: str,
    store: OasisStore = Depends(get_store),
    _: UserPrincipal = Depends(require_roles("analyst", "reviewer")),
) -> Project:
    record = store.get_project(project_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return Project.model_validate(record)


@router.get("/projects/{project_id}/assessments", response_model=list[AssessmentSummary])
def list_assessments(
    project_id: str,
    store: OasisStore = Depends(get_store),
    _: UserPrincipal = Depends(require_roles("analyst", "reviewer")),
) -> list[AssessmentSummary]:
    if not store.get_project(project_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    summaries: list[AssessmentSummary] = []
    for assessment in store.list_assessments(project_id):
        latest_version_id = assessment.get("latest_version_id")
        latest_version_number: int | None = None
        latest_trace_id: str | None = None
        if latest_version_id:
            version = store.get_version(latest_version_id) or {}
            latest_version_number = int(version.get("version_number") or 0) or None
            latest_trace_id = version.get("trace_id")
        summaries.append(
            AssessmentSummary.model_validate(
                {
                    "assessment_id": assessment.get("assessment_id"),
                    "project_id": assessment.get("project_id"),
                    "title": assessment.get("title"),
                    "template_id": assessment.get("template_id"),
                    "updated_at": assessment.get("updated_at"),
                    "latest_version_id": latest_version_id,
                    "latest_version_number": latest_version_number,
                    "latest_trace_id": latest_trace_id,
                }
            )
        )
    return summaries


@router.post(
    "/projects/{project_id}/assessments",
    response_model=Assessment,
    status_code=status.HTTP_201_CREATED,
)
def create_assessment(
    project_id: str,
    body: AssessmentCreate,
    store: OasisStore = Depends(get_store),
    _: UserPrincipal = Depends(require_roles("analyst")),
) -> Assessment:
    if not store.get_project(project_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    policy_hits = _policy_hits_from_risk_request(body.payload)
    if policy_hits:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Input appears to include non-public or sensitive data indicators "
                f"({', '.join(policy_hits)}). Provide public/anonymized context only."
            ),
        )

    try:
        record = store.create_assessment(
            project_id=project_id,
            title=body.title,
            template_id=body.template_id,
            payload=body.payload.model_dump(exclude_none=True),
        )
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return Assessment.model_validate(record)


@router.get("/assessments/{assessment_id}", response_model=Assessment)
def get_assessment(
    assessment_id: str,
    store: OasisStore = Depends(get_store),
    _: UserPrincipal = Depends(require_roles("analyst", "reviewer")),
) -> Assessment:
    record = store.get_assessment(assessment_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")
    return Assessment.model_validate(record)


@router.get("/assessments/{assessment_id}/versions", response_model=list[AssessmentVersionSummary])
def list_versions(
    assessment_id: str,
    store: OasisStore = Depends(get_store),
    _: UserPrincipal = Depends(require_roles("analyst", "reviewer")),
) -> list[AssessmentVersionSummary]:
    try:
        versions = store.list_versions(assessment_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")
    return [AssessmentVersionSummary.model_validate(v) for v in versions]


@router.get("/assessments/{assessment_id}/versions/{version_id}", response_model=AssessmentVersion)
def get_version(
    assessment_id: str,
    version_id: str,
    store: OasisStore = Depends(get_store),
    _: UserPrincipal = Depends(require_roles("analyst", "reviewer")),
) -> AssessmentVersion:
    record = store.get_version(version_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")
    if record.get("assessment_id") != assessment_id:
        logger.warning(
            "version lookup received mismatched assessment_id (got %s, expected %s)",
            assessment_id,
            record.get("assessment_id"),
        )
    return AssessmentVersion.model_validate(record)


@router.post("/assessments/{assessment_id}/run", response_model=AssessmentVersion)
def run_assessment(
    assessment_id: str,
    payload: RiskRequest,
    mode: Literal["auto", "mock", "live"] = Query("auto"),
    llm_model: str | None = Query(default=None),
    prompt_variant: str | None = Query(default=None),
    rag_enabled: bool | None = Query(
        default=None,
        description="PoC placeholder. When true, indicates RAG would be used for public references.",
    ),
    settings: Settings = Depends(get_settings),
    store: OasisStore = Depends(get_store),
    _: UserPrincipal = Depends(require_roles("analyst")),
) -> AssessmentVersion:
    assessment = store.get_assessment(assessment_id)
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    policy_hits = _policy_hits_from_risk_request(payload)
    if policy_hits:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Input appears to include non-public or sensitive data indicators "
                f"({', '.join(policy_hits)}). Provide public/anonymized context only."
            ),
        )

    force_mock: bool | None = None
    if mode == "mock":
        force_mock = True
    elif mode == "live":
        force_mock = False
    use_mock = settings.mock_mode if force_mock is None else force_mock
    resolved_mode: Literal["mock", "live"] = "mock" if use_mock else "live"
    model_override = llm_model if mode == "live" else None
    resolved_model = "mock" if resolved_mode == "mock" else ((model_override or settings.llm_model) or "unknown")

    variant_name = (prompt_variant or "default").strip() or "default"
    try:
        system_prompt = get_system_prompt(variant_name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    system_prompt_sha256 = hashlib.sha256(system_prompt.encode("utf-8")).hexdigest()
    user_prompt = build_user_prompt(payload)
    system_prompt_override = None if variant_name == "default" else system_prompt

    try:
        response = run_llm(
            payload,
            settings,
            force_mock=force_mock,
            llm_model_override=model_override,
            system_prompt_override=system_prompt_override,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("workflow.run failed assessment_id=%s mode=%s", assessment_id, mode)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Assessment run failed. Check backend logs for details.",
        ) from exc

    record = store.create_version(
        assessment_id=assessment_id,
        request_payload=payload.model_dump(exclude_none=True),
        response_payload=response.model_dump(exclude_none=True),
        trace_id=response.trace_id,
        mode=mode,
        resolved_mode=resolved_mode,
        llm_provider=settings.llm_provider,
        llm_model=resolved_model,
        prompt_variant=variant_name,
        system_prompt_sha256=system_prompt_sha256,
        user_prompt=user_prompt,
        rag_enabled=rag_enabled if rag_enabled is not None else payload.rag_enabled,
    )
    return AssessmentVersion.model_validate(record)


@router.post(
    "/assessments/{assessment_id}/versions/{version_id}/feedback",
    response_model=Feedback,
    status_code=status.HTTP_201_CREATED,
)
def create_feedback(
    assessment_id: str,
    version_id: str,
    body: FeedbackCreate,
    store: OasisStore = Depends(get_store),
    _: UserPrincipal = Depends(require_roles("reviewer")),
) -> Feedback:
    try:
        record = store.create_feedback(
            assessment_id,
            version_id,
            rating=body.rating,
            flags=body.flags,
            comment=body.comment,
            recommended_edits=body.recommended_edits,
            reviewer=body.reviewer,
        )
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")
    return Feedback.model_validate(record)


@router.get("/assessments/{assessment_id}/versions/{version_id}/feedback", response_model=list[Feedback])
def list_feedback(
    assessment_id: str,
    version_id: str,
    store: OasisStore = Depends(get_store),
    _: UserPrincipal = Depends(require_roles("analyst", "reviewer")),
) -> list[Feedback]:
    try:
        items = store.list_feedback(assessment_id, version_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")
    return [Feedback.model_validate(item) for item in items]


def _safe_filename(value: str) -> str:
    value = value.strip() or "export"
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value)
    return value[:80].strip("_") or "export"


def _markdown_export(assessment_title: str, version: dict) -> str:
    response = version.get("response") or {}
    risks = response.get("risks") or []
    lines: list[str] = []
    lines.append(f"# {assessment_title} (v{version.get('version_number')})")
    lines.append("")
    lines.append(f"- Generated: {version.get('created_at')}")
    lines.append(f"- Trace ID: {version.get('trace_id')}")
    lines.append(f"- Mode: {version.get('resolved_mode')} (requested: {version.get('mode')})")
    lines.append(f"- Model: {version.get('llm_model')}")
    lines.append(f"- Prompt variant: {version.get('prompt_variant')}")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(str(response.get("summary") or "").strip())
    lines.append("")
    lines.append("## Assumptions & Gaps")
    lines.append("")
    for gap in response.get("assumptions_gaps") or []:
        lines.append(f"- {gap}")
    if not (response.get("assumptions_gaps") or []):
        lines.append("- (none)")
    lines.append("")
    lines.append("## Risks")
    lines.append("")
    for risk in risks:
        rid = risk.get("risk_id") or ""
        title = risk.get("risk_title") or ""
        lines.append(f"### {rid}: {title}".strip())
        lines.append("")
        lines.append(f"- Likelihood: {risk.get('likelihood')}")
        lines.append(f"- Inherent: {risk.get('inherent_rating')}")
        lines.append(f"- Residual: {risk.get('residual_rating')}")
        if risk.get("cause"):
            lines.append(f"- Cause: {risk.get('cause')}")
        if risk.get("impact"):
            lines.append(f"- Impact: {risk.get('impact')}")
        lines.append("")
        lines.append("**Controls**")
        for item in risk.get("controls") or []:
            lines.append(f"- {item}")
        lines.append("")
        lines.append("**Mitigations**")
        for item in risk.get("mitigations") or []:
            lines.append(f"- {item}")
        lines.append("")
        lines.append("**KPIs**")
        for item in risk.get("kpis") or []:
            lines.append(f"- {item}")
        lines.append("")
        lines.append("**Control mappings**")
        for mapping in risk.get("control_mappings") or []:
            framework = mapping.get("framework") or ""
            cid = mapping.get("framework_control_id") or ""
            name = mapping.get("framework_control_name") or ""
            header = f"- {framework} {cid}".strip()
            if name:
                header = f"{header} - {name}"
            lines.append(header)
            statement = mapping.get("control_statement")
            if statement:
                lines.append(f"  - {statement}")
            refs = mapping.get("references") or []
            if refs:
                lines.append("  - Refs: " + " | ".join(f"{r.get('source_type')}: {r.get('title')}" for r in refs))
        lines.append("")
        lines.append("**Vulnerability summaries**")
        for vuln in risk.get("vulnerability_summaries") or []:
            vtype = vuln.get("vulnerability_type") or ""
            vid = vuln.get("identifier") or ""
            vtitle = vuln.get("title") or ""
            severity = vuln.get("severity") or ""
            label = f"- {vtype} {vid}".strip()
            if vtitle:
                label = f"{label}: {vtitle}" if label else vtitle
            lines.append(f"{label} ({severity})".strip())
            summary = vuln.get("summary")
            if summary:
                lines.append(f"  - {summary}")
            refs = vuln.get("references") or []
            if refs:
                lines.append("  - Refs: " + " | ".join(f"{r.get('source_type')}: {r.get('title')}" for r in refs))
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def _csv_escape(value: str) -> str:
    if any(ch in value for ch in [",", "\"", "\n"]):
        return '"' + value.replace('"', '""') + '"'
    return value


def _csv_export(version: dict) -> str:
    response = version.get("response") or {}
    rows = response.get("risks") or []
    headers = [
        "risk_id",
        "risk_title",
        "cause",
        "impact",
        "likelihood",
        "inherent_rating",
        "residual_rating",
        "controls",
        "mitigations",
        "kpis",
        "assumptions",
    ]
    out_lines = [",".join(headers)]
    for risk in rows:
        row = {
            "risk_id": str(risk.get("risk_id") or ""),
            "risk_title": str(risk.get("risk_title") or ""),
            "cause": str(risk.get("cause") or ""),
            "impact": str(risk.get("impact") or ""),
            "likelihood": str(risk.get("likelihood") or ""),
            "inherent_rating": str(risk.get("inherent_rating") or ""),
            "residual_rating": str(risk.get("residual_rating") or ""),
            "controls": "; ".join(risk.get("controls") or []),
            "mitigations": "; ".join(risk.get("mitigations") or []),
            "kpis": "; ".join(risk.get("kpis") or []),
            "assumptions": "; ".join(risk.get("assumptions") or []),
        }
        out_lines.append(",".join(_csv_escape(row[h]) for h in headers))
    return "\n".join(out_lines).strip() + "\n"


@router.get("/assessments/{assessment_id}/versions/{version_id}/export")
def export_version(
    assessment_id: str,
    version_id: str,
    format: Literal["markdown", "csv", "json"] = Query("markdown"),
    store: OasisStore = Depends(get_store),
    _: UserPrincipal = Depends(require_roles("analyst", "reviewer")),
) -> Response:
    assessment = store.get_assessment(assessment_id)
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    version = store.get_version(version_id)
    if not version or version.get("assessment_id") != assessment_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")

    title = assessment.get("title") or "assessment"
    base = _safe_filename(f"{title}_v{version.get('version_number')}")
    if format == "json":
        payload = json.dumps(version.get("response") or {}, ensure_ascii=False, indent=2)
        return Response(
            content=payload,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{base}.json"'},
        )
    if format == "csv":
        payload = _csv_export(version)
        return Response(
            content=payload,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{base}.csv"'},
        )
    payload = _markdown_export(title, version)
    return Response(
        content=payload,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{base}.md"'},
    )
