import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.v1.schemas import RiskRequest, RiskResponse
from app.api.v1.admin_routes import router as admin_router
from app.api.v1.workflow_routes import router as workflow_router
from app.core.auth import verify_api_key
from app.core.config import Settings, get_settings
from app.core.data_policy import find_private_indicators
from app.core.rbac import UserPrincipal, require_roles
from app.services.llm_adapter import run_llm
from app.services.prompt_variants import get_system_prompt, list_prompt_variant_names

risk_router = APIRouter(prefix="/risk", tags=["risk"])
router = APIRouter()
logger = logging.getLogger(__name__)


@risk_router.get("/prompt-variants", response_model=list[str])
def list_prompt_variants() -> list[str]:
    """
    Return available system prompt variant names.
    """
    return list_prompt_variant_names()


@risk_router.post("/analyze", response_model=RiskResponse, dependencies=[Depends(verify_api_key)])
def analyze_risk(
    payload: RiskRequest,
    mode: Literal["auto", "mock", "live"] = Query("auto"),
    llm_model: str | None = Query(
        default=None,
        description="Optional LLM model override (only used in live mode).",
        examples=["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
    ),
    prompt_variant: str | None = Query(
        default=None,
        description="Optional system prompt variant name (e.g., default, variant_a, variant_b).",
    ),
    _: UserPrincipal = Depends(require_roles("analyst")),
    settings: Settings = Depends(get_settings),
) -> RiskResponse:
    """
    mode:
      - mock: force mock response
      - live: force LLM call
      - auto: use backend default (settings.mock_mode)
    """
    force_mock = None
    if mode == "mock":
        force_mock = True
    elif mode == "live":
        force_mock = False

    resolved_mode = "mock" if force_mock is True or (force_mock is None and settings.mock_mode) else "live"
    logger.info(
        "risk.analyze backend_call mode_param=%s settings.mock_mode=%s resolved_mode=%s",
        mode.upper(),
        settings.mock_mode,
        resolved_mode.upper(),
    )
    policy_hits = find_private_indicators(
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
    if policy_hits:
        logger.warning("risk.analyze blocked due to policy hits=%s", policy_hits)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Input appears to include non-public or sensitive data indicators "
                f"({', '.join(policy_hits)}). Provide public/anonymized context only."
            ),
        )

    try:
        try:
            system_prompt_override = get_system_prompt(prompt_variant)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        return run_llm(
            payload,
            settings,
            force_mock=force_mock,
            llm_model_override=llm_model if mode == "live" else None,
            system_prompt_override=system_prompt_override if prompt_variant else None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "risk.analyze failed mode_param=%s settings.mock_mode=%s resolved_mode=%s",
            mode.upper(),
            settings.mock_mode,
            resolved_mode.upper(),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Risk analysis failed. Check backend logs for details.",
        ) from exc


router.include_router(risk_router)
router.include_router(workflow_router)
router.include_router(admin_router)
