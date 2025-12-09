import json
import logging
import os
from typing import Protocol
from uuid import uuid4

from app.api.v1.schemas import RiskItem, RiskRequest, RiskResponse
from app.core.config import Settings
from app.services.prompt_engine import SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger(__name__)

try:
    from openai import OpenAI  # type: ignore
except Exception:  # pragma: no cover - dependency not installed in mock mode
    OpenAI = None


class LLMProvider(Protocol):
    name: str

    def generate(
        self, request: RiskRequest, settings: Settings, trace_id: str, model_override: str | None = None
    ) -> RiskResponse: ...


def _get_env_var(name: str) -> str | None:
    """
    Read an environment variable, with a Windows registry fallback so that
    machine/user env vars are picked up even if the current shell did not load them.
    """
    value = os.getenv(name)
    if value:
        return value.strip()

    if os.name == "nt":
        try:
            import winreg  # type: ignore

            registry_locations = [
                (winreg.HKEY_CURRENT_USER, r"Environment"),
                (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"),
            ]
            for root, subkey in registry_locations:
                try:
                    with winreg.OpenKey(root, subkey) as reg_key:
                        raw_value, _ = winreg.QueryValueEx(reg_key, name)
                        if raw_value:
                            return str(raw_value).strip()
                except FileNotFoundError:
                    continue
                except OSError:
                    continue
        except Exception:
            return None

    return None


def _mock_response(trace_id: str) -> RiskResponse:
    mock_risks = [
        RiskItem(
            risk_id="R1",
            risk_title="Third-party outage",
            cause="Single cloud provider dependency for core service",
            impact="Service disruption and customer churn",
            likelihood="Medium",
            inherent_rating="High",
            residual_rating="Medium",
            controls=[
                "Vendor SLA monitoring",
                "Runbooks for failover",
            ],
            mitigations=[
                "Add secondary provider for failover",
                "Quarterly disaster recovery tests",
            ],
            kpis=[
                "Monthly uptime %",
                "MTTR for critical incidents",
            ],
            owner="Ops",
            due_date="Q3",
            assumptions=[
                "Secondary provider contract available",
            ],
        ),
        RiskItem(
            risk_id="R2",
            risk_title="Regulatory non-compliance",
            cause="Evolving data residency rules not mapped to controls",
            impact="Fines and forced remediation",
            likelihood="Medium",
            inherent_rating="High",
            residual_rating="Medium",
            controls=[
                "Policy reviews twice yearly",
                "Legal sign-off for new regions",
            ],
            mitigations=[
                "Map controls to latest guidance per region",
                "Implement data localization where required",
            ],
            kpis=[
                "Audit findings count",
                "Time to remediate compliance gaps",
            ],
            owner="Compliance",
            due_date="Q2",
            assumptions=[
                "Legal team available for guidance",
            ],
        ),
    ]
    return RiskResponse(
        trace_id=trace_id,
        summary="Initial assessment highlights dependency on a single provider and evolving regulatory obligations. Current controls reduce some exposure but gaps remain in redundancy and mapped compliance measures.",
        risks=mock_risks,
        assumptions_gaps=[
            "No confidential data used; refine with region-specific rules.",
            "Add business impact tolerances for better prioritization.",
        ],
    )


def _parse_llm_json(content: str, trace_id: str) -> RiskResponse:
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise RuntimeError(f"Failed to parse LLM JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise RuntimeError("LLM response is not a JSON object.")

    missing = [key for key in ("summary", "risks") if key not in data]
    if missing:
        raise RuntimeError(f"LLM response missing required fields: {', '.join(missing)}")

    # Normalize common model quirks (e.g., numeric risk_id returned as int).
    if isinstance(data.get("risks"), list):
        normalized_risks = []
        for idx, risk in enumerate(data["risks"], start=1):
            if not isinstance(risk, dict):
                raise RuntimeError("LLM response risks must be objects.")
            risk_copy = dict(risk)
            if "risk_id" in risk_copy and not isinstance(risk_copy["risk_id"], str):
                risk_copy["risk_id"] = str(risk_copy["risk_id"])
            if "risk_id" not in risk_copy:
                risk_copy["risk_id"] = f"R{idx}"
            normalized_risks.append(risk_copy)
        data["risks"] = normalized_risks

    try:
        return RiskResponse(trace_id=trace_id, **data)
    except Exception as exc:  # pragma: no cover - defensive against malformed model
        raise RuntimeError(f"LLM response did not match schema: {exc}") from exc


def run_llm(
    request: RiskRequest, settings: Settings, force_mock: bool | None = None, llm_model_override: str | None = None
) -> RiskResponse:
    """
    force_mock: True forces mock response; False forces live; None uses settings.mock_mode.
    """
    trace_id = str(uuid4())
    use_mock = settings.mock_mode if force_mock is None else force_mock
    request_mode = "auto" if force_mock is None else ("mock" if force_mock else "live")
    resolved_mode = "mock" if use_mock else "live"
    logger.info("risk.run_llm request_mode=%s resolved_mode=%s trace_id=%s", request_mode, resolved_mode, trace_id)
    if use_mock:
        logger.info("risk.run_llm responding_with=MOCK trace_id=%s", trace_id)
        return _mock_response(trace_id)

    provider = _get_provider(settings.llm_provider)
    return provider.generate(request=request, settings=settings, trace_id=trace_id, model_override=llm_model_override)


class OpenAIProvider:
    name = "openai"

    def __init__(self) -> None:
        self._client_cls = OpenAI

    def generate(
        self, request: RiskRequest, settings: Settings, trace_id: str, model_override: str | None = None
    ) -> RiskResponse:
        if self._client_cls is None:
            logger.error("risk.run_llm live_call_failed reason=openai_missing trace_id=%s", trace_id)
            raise RuntimeError("openai package not available; enable mock_mode or install dependency.")

        api_key = settings.openai_api_key.strip() if settings.openai_api_key else None
        if not api_key:
            api_key = _get_env_var("OPENAI_API_KEY")
        if not api_key:
            logger.error("risk.run_llm live_call_failed reason=missing_openai_api_key trace_id=%s", trace_id)
            raise RuntimeError("OPENAI_API_KEY is not set in the environment.")

        model = (model_override or settings.llm_model or "").strip()
        if not model:
            raise RuntimeError("LLM model is not configured.")

        system_prompt = SYSTEM_PROMPT
        user_prompt = build_user_prompt(request)
        client = self._client_cls(api_key=api_key)
        logger.info(
            "risk.run_llm responding_with=LIVE provider=%s model=%s trace_id=%s",
            settings.llm_provider,
            model,
            trace_id,
        )
        is_gpt5_family = model.lower().startswith("gpt-5")
        temperature_param = {} if is_gpt5_family else {"temperature": 0.2}
        base_params = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            **temperature_param,
        }
        if is_gpt5_family:
            token_param_options = [{}, {"max_tokens": 800}]
        else:
            token_param_options = [{"max_tokens": 800}, {}]

        last_exc: Exception | None = None
        for token_params in token_param_options:
            try:
                completion = client.chat.completions.create(**base_params, **token_params)
                break
            except Exception as exc:  # pragma: no cover - defensive logging for live failures
                message = str(exc).lower()
                if "unsupported_parameter" in message and "max_tokens" in message:
                    last_exc = exc
                    continue
                logger.exception("risk.run_llm live_call_failed trace_id=%s", trace_id)
                raise
        else:
            logger.exception("risk.run_llm live_call_failed trace_id=%s", trace_id, exc_info=last_exc)
            raise last_exc or RuntimeError("LLM call failed due to unsupported token parameter.")
        content = completion.choices[0].message.content or "{}"
        return _parse_llm_json(content, trace_id)


def _get_provider(name: str) -> LLMProvider:
    provider_key = (name or "").strip().lower()
    providers: dict[str, LLMProvider] = {
        "openai": OpenAIProvider(),
    }
    if provider_key not in providers:
        raise RuntimeError(f"Unsupported LLM provider '{name}'. Supported providers: {', '.join(providers)}")
    return providers[provider_key]
