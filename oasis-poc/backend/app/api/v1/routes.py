import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.v1.schemas import RiskRequest, RiskResponse
from app.core.auth import verify_api_key
from app.core.config import Settings, get_settings
from app.core.data_policy import find_private_indicators
from app.services.llm_adapter import run_llm

router = APIRouter(prefix="/risk", tags=["risk"])
logger = logging.getLogger(__name__)


@router.post("/analyze", response_model=RiskResponse, dependencies=[Depends(verify_api_key)])
async def analyze_risk(
    payload: RiskRequest,
    mode: str = Query("auto", enum=["auto", "mock", "live"]),
    llm_model: str | None = Query(
        default=None,
        description="Optional LLM model override (only used in live mode).",
        examples=["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
    ),
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
        return run_llm(payload, settings, force_mock=force_mock, llm_model_override=llm_model if mode == "live" else None)
    except Exception as exc:
        logger.exception(
            "risk.analyze failed mode_param=%s settings.mock_mode=%s resolved_mode=%s",
            mode.upper(),
            settings.mock_mode,
            resolved_mode.upper(),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
