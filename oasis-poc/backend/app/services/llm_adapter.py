import json
import logging
import os
import re
from typing import Protocol
from uuid import uuid4

from app.api.v1.schemas import (
    ControlFrameworkMapping,
    PublicReference,
    RiskItem,
    RiskRequest,
    RiskResponse,
    VulnerabilitySummary,
)
from app.core.config import Settings
from app.services.prompt_engine import SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger(__name__)

RISK_RESPONSE_TOOL_NAME = "risk_response"

RISK_RESPONSE_TOOL_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "risks": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "risk_id": {"type": "string"},
                    "risk_title": {"type": "string"},
                    "cause": {"type": "string"},
                    "impact": {"type": "string"},
                    "likelihood": {"type": "string", "enum": ["Low", "Medium", "High"]},
                    "inherent_rating": {"type": "string", "enum": ["Low", "Medium", "High"]},
                    "residual_rating": {"type": "string", "enum": ["Low", "Medium", "High"]},
                    "controls": {"type": "array", "minItems": 1, "items": {"type": "string"}},
                    "control_mappings": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "control_statement": {"type": "string"},
                                "framework": {"type": "string"},
                                "framework_control_id": {"type": "string"},
                                "framework_control_name": {"type": "string"},
                                "mapping_rationale": {"type": "string"},
                                "references": {
                                    "type": "array",
                                    "minItems": 1,
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "properties": {
                                            "source_type": {
                                                "type": "string",
                                                "enum": [
                                                    "NIST",
                                                    "ISO27001",
                                                    "OWASP",
                                                    "SEC",
                                                    "INCIDENT_REPORT",
                                                    "CVE",
                                                    "DATASET",
                                                    "OTHER",
                                                ],
                                            },
                                            "title": {"type": "string"},
                                            "identifier": {"type": "string"},
                                            "url": {"type": "string"},
                                            "notes": {"type": "string"},
                                        },
                                        "required": ["source_type", "title"],
                                    },
                                },
                            },
                            "required": ["control_statement", "framework", "framework_control_id", "references"],
                        },
                    },
                    "mitigations": {"type": "array", "minItems": 1, "items": {"type": "string"}},
                    "kpis": {"type": "array", "minItems": 1, "items": {"type": "string"}},
                    "vulnerability_summaries": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "vulnerability_type": {
                                    "type": "string",
                                    "enum": ["CVE", "OWASP", "INCIDENT_REPORT", "DATASET", "OTHER"],
                                },
                                "identifier": {"type": "string"},
                                "title": {"type": "string"},
                                "summary": {"type": "string"},
                                "severity": {"type": "string", "enum": ["Low", "Medium", "High", "Critical"]},
                                "cvss_v3_base_score": {"type": "number"},
                                "references": {
                                    "type": "array",
                                    "minItems": 1,
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "properties": {
                                            "source_type": {
                                                "type": "string",
                                                "enum": [
                                                    "NIST",
                                                    "ISO27001",
                                                    "OWASP",
                                                    "SEC",
                                                    "INCIDENT_REPORT",
                                                    "CVE",
                                                    "DATASET",
                                                    "OTHER",
                                                ],
                                            },
                                            "title": {"type": "string"},
                                            "identifier": {"type": "string"},
                                            "url": {"type": "string"},
                                            "notes": {"type": "string"},
                                        },
                                        "required": ["source_type", "title"],
                                    },
                                },
                            },
                            "required": ["vulnerability_type", "title", "summary", "severity", "references"],
                        },
                    },
                    "owner": {"type": "string"},
                    "due_date": {"type": "string"},
                    "assumptions": {"type": "array", "minItems": 1, "items": {"type": "string"}},
                },
                "required": [
                    "risk_id",
                    "risk_title",
                    "cause",
                    "impact",
                    "likelihood",
                    "inherent_rating",
                    "residual_rating",
                    "controls",
                    "control_mappings",
                    "mitigations",
                    "kpis",
                    "vulnerability_summaries",
                    "assumptions",
                ],
            },
        },
        "assumptions_gaps": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "risks", "assumptions_gaps"],
}

try:
    from openai import OpenAI  # type: ignore
except Exception:  # pragma: no cover - dependency not installed in mock mode
    OpenAI = None


class LLMProvider(Protocol):
    name: str

    def generate(
        self,
        request: RiskRequest,
        settings: Settings,
        trace_id: str,
        model_override: str | None = None,
        system_prompt_override: str | None = None,
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
            control_mappings=[
                ControlFrameworkMapping(
                    control_statement="Monitor third-party service performance and SLAs; define escalation paths.",
                    framework="NIST SP 800-53 Rev. 5",
                    framework_control_id="SA-9",
                    framework_control_name="External System Services",
                    mapping_rationale="Maps vendor/SLA monitoring expectations to a recognized control baseline.",
                    references=[
                        PublicReference(
                            source_type="NIST",
                            title="NIST SP 800-53 Rev. 5 Security and Privacy Controls for Information Systems and Organizations",
                            identifier="SA-9",
                        )
                    ],
                ),
                ControlFrameworkMapping(
                    control_statement="Maintain tested continuity/failover procedures for critical services.",
                    framework="NIST SP 800-53 Rev. 5",
                    framework_control_id="CP-10",
                    framework_control_name="System Recovery and Reconstitution",
                    mapping_rationale="Connects outage/failover needs to continuity and recovery controls.",
                    references=[
                        PublicReference(
                            source_type="NIST",
                            title="NIST SP 800-53 Rev. 5 Security and Privacy Controls for Information Systems and Organizations",
                            identifier="CP-10",
                        )
                    ],
                ),
                ControlFrameworkMapping(
                    control_statement="Review and monitor supplier services; manage changes to supplier services.",
                    framework="ISO/IEC 27001:2013 (Annex A)",
                    framework_control_id="A.15.2.1",
                    framework_control_name="Monitoring and review of supplier services",
                    mapping_rationale="Aligns supplier oversight with ISO supplier relationship controls.",
                    references=[
                        PublicReference(
                            source_type="ISO27001",
                            title="ISO/IEC 27001:2013 Annex A (Supplier relationships)",
                            identifier="A.15.2.1",
                            notes="Control titles/IDs should be verified against the referenced ISO edition in use.",
                        )
                    ],
                ),
            ],
            mitigations=[
                "Add secondary provider for failover",
                "Quarterly disaster recovery tests",
            ],
            kpis=[
                "Monthly uptime %",
                "MTTR for critical incidents",
            ],
            vulnerability_summaries=[
                VulnerabilitySummary(
                    vulnerability_type="CVE",
                    identifier="CVE-2021-44228",
                    title="Log4Shell (Apache Log4j remote code execution)",
                    summary=(
                        "Example of a critical third-party component vulnerability that can cascade across "
                        "dependent services; maintain SBOM/asset inventory and patch SLAs for key libraries."
                    ),
                    severity="Critical",
                    cvss_v3_base_score=10.0,
                    references=[
                        PublicReference(source_type="CVE", title="CVE-2021-44228", identifier="CVE-2021-44228"),
                        PublicReference(
                            source_type="DATASET",
                            title="National Vulnerability Database (NVD)",
                            notes="Use NVD/CISA KEV as public sources for vulnerability prevalence and severity.",
                        ),
                    ],
                )
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
            control_mappings=[
                ControlFrameworkMapping(
                    control_statement="Identify and maintain an inventory of applicable legal/regulatory requirements.",
                    framework="ISO/IEC 27001:2013 (Annex A)",
                    framework_control_id="A.18.1.1",
                    framework_control_name="Identification of applicable legislation and contractual requirements",
                    mapping_rationale="Ties compliance tracking to a common ISMS control expectation.",
                    references=[
                        PublicReference(
                            source_type="ISO27001",
                            title="ISO/IEC 27001:2013 Annex A (Compliance)",
                            identifier="A.18.1.1",
                            notes="Control titles/IDs should be verified against the referenced ISO edition in use.",
                        )
                    ],
                ),
                ControlFrameworkMapping(
                    control_statement="Document compliance responsibilities and maintain evidence for audits.",
                    framework="NIST SP 800-53 Rev. 5",
                    framework_control_id="PL-2",
                    framework_control_name="System Security and Privacy Plan",
                    mapping_rationale="Supports formal documentation of controls and compliance evidence.",
                    references=[
                        PublicReference(
                            source_type="NIST",
                            title="NIST SP 800-53 Rev. 5 Security and Privacy Controls for Information Systems and Organizations",
                            identifier="PL-2",
                        ),
                        PublicReference(
                            source_type="SEC",
                            title="SEC Form 8-K cybersecurity disclosure requirements (public filing guidance)",
                            notes="Include when applicable to public company incident/compliance disclosures.",
                        ),
                    ],
                ),
            ],
            mitigations=[
                "Map controls to latest guidance per region",
                "Implement data localization where required",
            ],
            kpis=[
                "Audit findings count",
                "Time to remediate compliance gaps",
            ],
            vulnerability_summaries=[
                VulnerabilitySummary(
                    vulnerability_type="OWASP",
                    identifier="A05:2021",
                    title="Security Misconfiguration",
                    summary=(
                        "Common root cause for compliance and privacy failures (e.g., overly permissive access, "
                        "unintended data exposure); use baselines, hardening guides, and continuous configuration monitoring."
                    ),
                    severity="High",
                    references=[
                        PublicReference(source_type="OWASP", title="OWASP Top 10 2021", identifier="A05:2021"),
                        PublicReference(
                            source_type="INCIDENT_REPORT",
                            title="Public cybersecurity incident reports and post-incident reviews",
                            notes="Use public postmortems to validate common misconfiguration failure modes.",
                        ),
                    ],
                )
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


_CODE_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*$", flags=re.IGNORECASE)


def _strip_code_fences(text: str) -> str:
    stripped = text.strip().lstrip("\ufeff")
    if not stripped.startswith("```"):
        return stripped

    lines = stripped.splitlines()
    if lines and _CODE_FENCE_RE.match(lines[0]):
        lines = lines[1:]
    if lines and _CODE_FENCE_RE.match(lines[-1]):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _extract_first_json_object(text: str) -> str | None:
    """
    Best-effort extraction of the first balanced JSON object from a string.
    """
    start_idx: int | None = None
    depth = 0
    in_string = False
    escape = False

    for idx, ch in enumerate(text):
        if start_idx is None:
            if ch == "{":
                start_idx = idx
                depth = 1
            continue

        if in_string:
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            continue
        if ch == "{":
            depth += 1
            continue
        if ch == "}":
            depth -= 1
            if depth == 0 and start_idx is not None:
                return text[start_idx : idx + 1]
    return None


def _remove_trailing_commas(text: str) -> str:
    """
    Remove trailing commas before } or ] (common model quirk).
    """
    out: list[str] = []
    in_string = False
    escape = False
    idx = 0
    while idx < len(text):
        ch = text[idx]
        if in_string:
            out.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            idx += 1
            continue

        if ch == '"':
            in_string = True
            out.append(ch)
            idx += 1
            continue

        if ch == ",":
            lookahead = idx + 1
            while lookahead < len(text) and text[lookahead] in " \t\r\n":
                lookahead += 1
            if lookahead < len(text) and text[lookahead] in "}]":
                idx += 1
                continue

        out.append(ch)
        idx += 1
    return "".join(out)


_UNQUOTED_KEY_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def _quote_unquoted_object_keys(text: str) -> str:
    """
    Best-effort conversion of JS-style object keys (foo: "bar") into JSON ("foo": "bar").
    This is only used as a fallback when strict JSON parsing fails.
    """
    out: list[str] = []
    in_string = False
    escape = False
    idx = 0

    while idx < len(text):
        ch = text[idx]
        if in_string:
            out.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            idx += 1
            continue

        if ch == '"':
            in_string = True
            out.append(ch)
            idx += 1
            continue

        if ch in "{,":
            out.append(ch)
            idx += 1
            while idx < len(text) and text[idx] in " \t\r\n":
                out.append(text[idx])
                idx += 1
            if idx < len(text) and text[idx] == '"':
                continue
            match = _UNQUOTED_KEY_RE.match(text, idx)
            if not match:
                continue
            key = match.group(0)
            after = match.end()
            lookahead = after
            while lookahead < len(text) and text[lookahead] in " \t\r\n":
                lookahead += 1
            if lookahead < len(text) and text[lookahead] == ":":
                out.append(f'"{key}"')
                idx = after
                continue
            out.append(key)
            idx = after
            continue

        out.append(ch)
        idx += 1

    return "".join(out)


def _load_llm_json_object(content: str) -> dict:
    cleaned = _strip_code_fences(content)
    candidates: list[str] = [cleaned]
    extracted = _extract_first_json_object(cleaned)
    if extracted and extracted != cleaned:
        candidates.append(extracted)

    last_exc: json.JSONDecodeError | None = None
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as exc:
            last_exc = exc

        try:
            return json.loads(_remove_trailing_commas(candidate))
        except json.JSONDecodeError as exc:
            last_exc = exc

    for candidate in candidates:
        repaired = _remove_trailing_commas(_quote_unquoted_object_keys(candidate))
        try:
            return json.loads(repaired)
        except json.JSONDecodeError as exc:
            last_exc = exc

    raise RuntimeError(f"Failed to parse LLM JSON: {last_exc}") from last_exc


def _parse_llm_dict(data: dict, trace_id: str) -> RiskResponse:
    if not isinstance(data, dict):
        raise RuntimeError("LLM response is not a JSON object.")

    data = dict(data)
    data.pop("trace_id", None)

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
            for list_key in (
                "controls",
                "control_mappings",
                "mitigations",
                "kpis",
                "vulnerability_summaries",
                "assumptions",
            ):
                if risk_copy.get(list_key) is None:
                    risk_copy[list_key] = []
            normalized_risks.append(risk_copy)
        data["risks"] = normalized_risks

    try:
        return RiskResponse(trace_id=trace_id, **data)
    except Exception as exc:  # pragma: no cover - defensive against malformed model
        raise RuntimeError(f"LLM response did not match schema: {exc}") from exc


def _parse_llm_json(content: str, trace_id: str) -> RiskResponse:
    data = _load_llm_json_object(content)
    return _parse_llm_dict(data, trace_id)


def _missing_required_sections(response: RiskResponse) -> list[str]:
    missing: list[str] = []
    for risk in response.risks:
        if not risk.controls:
            missing.append(f"{risk.risk_id}.controls")
        if not risk.control_mappings:
            missing.append(f"{risk.risk_id}.control_mappings")
        if not risk.mitigations:
            missing.append(f"{risk.risk_id}.mitigations")
        if not risk.kpis:
            missing.append(f"{risk.risk_id}.kpis")
        if not risk.vulnerability_summaries:
            missing.append(f"{risk.risk_id}.vulnerability_summaries")
        if not risk.assumptions:
            missing.append(f"{risk.risk_id}.assumptions")
    return missing


def _to_llm_json(response: RiskResponse) -> str:
    return json.dumps(response.model_dump(exclude_none=True), ensure_ascii=False)


def _extract_tool_call_arguments(message: object, expected_name: str) -> str | None:
    tool_calls = getattr(message, "tool_calls", None)
    if not tool_calls:
        return None

    for tool_call in tool_calls:
        func = getattr(tool_call, "function", None)
        func_name = getattr(func, "name", None) if func is not None else None
        if func_name == expected_name:
            args = getattr(func, "arguments", None)
            if isinstance(args, str) and args.strip():
                return args

        if isinstance(tool_call, dict):
            function = tool_call.get("function") if isinstance(tool_call, dict) else None
            if isinstance(function, dict) and function.get("name") == expected_name:
                args = function.get("arguments")
                if isinstance(args, str) and args.strip():
                    return args

    return None


def run_llm(
    request: RiskRequest,
    settings: Settings,
    force_mock: bool | None = None,
    llm_model_override: str | None = None,
    system_prompt_override: str | None = None,
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
    return provider.generate(
        request=request,
        settings=settings,
        trace_id=trace_id,
        model_override=llm_model_override,
        system_prompt_override=system_prompt_override,
    )


class OpenAIProvider:
    name = "openai"

    def __init__(self) -> None:
        self._client_cls = OpenAI

    def generate(
        self,
        request: RiskRequest,
        settings: Settings,
        trace_id: str,
        model_override: str | None = None,
        system_prompt_override: str | None = None,
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

        system_prompt = system_prompt_override or SYSTEM_PROMPT
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
        tools = [
            {
                "type": "function",
                "function": {
                    "name": RISK_RESPONSE_TOOL_NAME,
                    "description": (
                        "Return the risk analysis as structured JSON arguments matching the provided schema. "
                        "Use only public references; do not invent URLs or identifiers."
                    ),
                    "parameters": RISK_RESPONSE_TOOL_SCHEMA,
                },
            }
        ]
        base_params = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "tools": tools,
            "tool_choice": {"type": "function", "function": {"name": RISK_RESPONSE_TOOL_NAME}},
            **temperature_param,
        }
        if is_gpt5_family:
            token_param_options = [{}, {"max_tokens": 1400}]
        else:
            token_param_options = [{"max_tokens": 1400}, {}]

        last_exc: Exception | None = None
        finish_reason: str | None = None
        for token_params in token_param_options:
            try:
                completion = client.chat.completions.create(**base_params, **token_params)
                finish_reason = completion.choices[0].finish_reason
                if finish_reason == "length" and "max_tokens" in token_params:
                    logger.warning(
                        "risk.run_llm live_call_truncated retrying_without_max_tokens trace_id=%s model=%s",
                        trace_id,
                        model,
                    )
                    last_exc = RuntimeError("LLM output truncated due to max_tokens limit.")
                    continue
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
        if finish_reason == "length":
            raise RuntimeError("LLM output was truncated. Retry or request fewer risks/details.")

        message_obj = completion.choices[0].message
        tool_args = _extract_tool_call_arguments(message_obj, expected_name=RISK_RESPONSE_TOOL_NAME)
        invalid_payload = tool_args
        if tool_args:
            try:
                parsed = _parse_llm_dict(_load_llm_json_object(tool_args), trace_id)
                missing_sections = _missing_required_sections(parsed)
                if not missing_sections:
                    return parsed
                logger.warning(
                    "risk.run_llm missing_sections trace_id=%s missing=%s",
                    trace_id,
                    missing_sections,
                )
                invalid_payload = _to_llm_json(parsed)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning(
                    "risk.run_llm tool_args_parse_failed trace_id=%s error=%s",
                    trace_id,
                    str(exc),
                )

        content = getattr(message_obj, "content", None) or "{}"
        if not invalid_payload:
            invalid_payload = content
        try:
            parsed = _parse_llm_json(content, trace_id)
            missing_sections = _missing_required_sections(parsed)
            if not missing_sections:
                return parsed
            logger.warning(
                "risk.run_llm missing_sections trace_id=%s missing=%s",
                trace_id,
                missing_sections,
            )
            invalid_payload = _to_llm_json(parsed)
        except Exception as exc:
            logger.warning("risk.run_llm content_parse_failed trace_id=%s error=%s", trace_id, str(exc))

        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": str(invalid_payload)},
                {
                    "role": "user",
                    "content": "\n".join(
                        [
                            "Your previous output did not parse as valid JSON for the required schema.",
                            "Also ensure each risk includes non-empty arrays for controls, control_mappings, mitigations, kpis, vulnerability_summaries, and assumptions.",
                            "If you are not confident about a specific CVE, use OWASP or INCIDENT_REPORT or OTHER without an identifier.",
                            "Return a corrected output by calling the function tool with valid JSON arguments only.",
                            "Do not add commentary or markdown.",
                        ]
                    ),
                },
            ],
            tools=tools,
            tool_choice={"type": "function", "function": {"name": RISK_RESPONSE_TOOL_NAME}},
            **temperature_param,
        )
        message_obj = completion.choices[0].message
        tool_args = _extract_tool_call_arguments(message_obj, expected_name=RISK_RESPONSE_TOOL_NAME)
        if not tool_args:
            raise RuntimeError("Failed to repair invalid LLM JSON: tool call missing.")
        parsed = _parse_llm_dict(_load_llm_json_object(tool_args), trace_id)
        missing_sections = _missing_required_sections(parsed)
        if missing_sections:
            raise RuntimeError(f"LLM output missing required sections after repair: {', '.join(missing_sections)}")
        return parsed


def _get_provider(name: str) -> LLMProvider:
    provider_key = (name or "").strip().lower()
    providers: dict[str, LLMProvider] = {
        "openai": OpenAIProvider(),
    }
    if provider_key not in providers:
        raise RuntimeError(f"Unsupported LLM provider '{name}'. Supported providers: {', '.join(providers)}")
    return providers[provider_key]
