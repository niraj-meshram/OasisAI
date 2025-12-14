from __future__ import annotations

import hashlib
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.v1.admin_schemas import (
    AdminSettings,
    AuditSnapshot,
    PromptTemplateDetail,
    PromptTemplateTestRunRequest,
    PromptTemplateTestRunResponse,
    PromptTemplateUpdate,
    PromptTemplateUpsert,
    PromptTemplateSummary,
    PromptTemplateVersion,
)
from app.core.auth import verify_api_key
from app.core.config import Settings, get_settings
from app.core.rbac import require_roles
from app.db.store import OasisStore, get_store
from app.services.llm_adapter import run_llm
from app.services.prompt_engine import build_user_prompt
from app.services.prompt_variants import get_system_prompt, list_prompt_variant_names, load_prompt_variants

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(verify_api_key), Depends(require_roles("admin"))])


_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")


def _validate_template_name(name: str) -> str:
    candidate = name.strip()
    if candidate == "default":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot overwrite 'default' prompt.")
    if not _NAME_PATTERN.match(candidate):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid template name. Use letters/numbers and . _ - (max 80 chars).",
        )
    return candidate


def _to_summary(name: str, store_record: dict | None) -> PromptTemplateSummary:
    if store_record:
        return PromptTemplateSummary.model_validate(
            {
                "name": name,
                "source": "store",
                "managed": True,
                "current_version": store_record.get("current_version"),
                "updated_at": store_record.get("updated_at"),
            }
        )
    return PromptTemplateSummary.model_validate(
        {
            "name": name,
            "source": "builtin",
            "managed": False,
            "current_version": None,
            "updated_at": None,
        }
    )


def _build_detail(name: str, store: OasisStore) -> PromptTemplateDetail:
    store_record = store.get_prompt_template(name)
    if store_record:
        versions = store_record.get("versions") or []
        latest = versions[-1] if versions else {}
        return PromptTemplateDetail.model_validate(
            {
                "name": store_record.get("name"),
                "source": "store",
                "managed": True,
                "current_version": store_record.get("current_version"),
                "updated_at": store_record.get("updated_at"),
                "content": latest.get("content") or "",
                "versions": [
                    PromptTemplateVersion.model_validate(
                        {
                            "version": v.get("version"),
                            "created_at": v.get("created_at"),
                            "sha256": v.get("sha256"),
                            "notes": v.get("notes"),
                        }
                    )
                    for v in versions
                    if isinstance(v, dict)
                ],
            }
        )

    content = get_system_prompt(name)
    sha = hashlib.sha256(content.encode("utf-8")).hexdigest()
    return PromptTemplateDetail.model_validate(
        {
            "name": name,
            "source": "builtin",
            "managed": False,
            "content": content,
            "versions": [
                {
                    "version": 1,
                    "created_at": "1970-01-01T00:00:00+00:00",
                    "sha256": sha,
                    "notes": "Built-in (not versioned in store).",
                }
            ],
        }
    )


@router.get("/prompt-templates", response_model=list[PromptTemplateSummary])
def list_prompt_templates(
    store: OasisStore = Depends(get_store),
) -> list[PromptTemplateSummary]:
    store_templates = {t.get("name"): t for t in store.list_prompt_templates() if t.get("name")}
    all_names = set(list_prompt_variant_names()) | set(store_templates.keys())
    return [_to_summary(name, store_templates.get(name)) for name in sorted(all_names)]


@router.get("/prompt-templates/{name}", response_model=PromptTemplateDetail)
def get_prompt_template(
    name: str,
    store: OasisStore = Depends(get_store),
) -> PromptTemplateDetail:
    try:
        return _build_detail(name, store)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/prompt-templates", response_model=PromptTemplateDetail, status_code=status.HTTP_201_CREATED)
def create_prompt_template(
    body: PromptTemplateUpsert,
    store: OasisStore = Depends(get_store),
) -> PromptTemplateDetail:
    name = _validate_template_name(body.name)
    record = store.get_prompt_template(name)
    if record:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Template already exists.")

    store_record = store.upsert_prompt_template(name, content=body.content, notes=body.notes)
    load_prompt_variants.cache_clear()
    return _build_detail(store_record.get("name") or name, store)


@router.put("/prompt-templates/{name}", response_model=PromptTemplateDetail)
def update_prompt_template(
    name: str,
    body: PromptTemplateUpdate,
    store: OasisStore = Depends(get_store),
) -> PromptTemplateDetail:
    name = _validate_template_name(name)
    if not store.get_prompt_template(name):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found.")

    store.upsert_prompt_template(name, content=body.content, notes=body.notes)
    load_prompt_variants.cache_clear()
    return _build_detail(name, store)


@router.post("/prompt-templates/{name}/test-run", response_model=PromptTemplateTestRunResponse)
def test_run_prompt_template(
    name: str,
    body: PromptTemplateTestRunRequest,
    settings: Settings = Depends(get_settings),
) -> PromptTemplateTestRunResponse:
    variant_name = name.strip() or "default"
    system_prompt = get_system_prompt(variant_name)
    system_prompt_sha256 = hashlib.sha256(system_prompt.encode("utf-8")).hexdigest()
    user_prompt = build_user_prompt(body.payload)
    system_prompt_override = None if variant_name == "default" else system_prompt

    mode = (body.mode or "mock").strip().lower()
    force_mock = None
    if mode == "mock":
        force_mock = True
    elif mode == "live":
        force_mock = False

    response = run_llm(
        body.payload,
        settings,
        force_mock=force_mock,
        llm_model_override=body.llm_model if mode == "live" else None,
        system_prompt_override=system_prompt_override,
    )
    return PromptTemplateTestRunResponse.model_validate(
        {
            "trace_id": response.trace_id,
            "system_prompt_sha256": system_prompt_sha256,
            "user_prompt": user_prompt,
            "response": response,
        }
    )


@router.get("/settings", response_model=AdminSettings)
def get_admin_settings(
    settings: Settings = Depends(get_settings),
) -> AdminSettings:
    return AdminSettings.model_validate(
        {
            "mock_mode": settings.mock_mode,
            "llm_provider": settings.llm_provider,
            "llm_model": settings.llm_model,
            "allowed_origins": settings.allowed_origins,
            "auth_mode": settings.auth_mode,
            "app_api_key_configured": settings.app_api_key is not None,
            "jwt_issuer": settings.jwt_issuer,
            "jwt_audience": settings.jwt_audience,
            "jwt_jwks_url": settings.jwt_jwks_url,
            "jwt_roles_claim": settings.jwt_roles_claim,
            "store_path": settings.store_path,
        }
    )


@router.get("/audit", response_model=AuditSnapshot)
def get_audit_snapshot(
    limit: int = Query(default=50, ge=1, le=200),
    store: OasisStore = Depends(get_store),
) -> AuditSnapshot:
    return AuditSnapshot.model_validate(
        {
            "recent_versions": store.list_recent_versions(limit),
            "recent_feedback": store.list_recent_feedback(limit),
        }
    )
