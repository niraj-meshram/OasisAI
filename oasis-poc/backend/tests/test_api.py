from fastapi.testclient import TestClient
import json

from app.main import app
from app.services.llm_adapter import _parse_llm_json

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_analyze_mock_success():
    payload = {
        "business_type": "Retail banking",
        "risk_domain": "Operational",
        "region": "North America",
        "size": "Mid",
        "maturity": "Defined",
        "objectives": "Create risk register",
        "context": "New public-facing onboarding portal",
        "constraints": "Public data only",
        "requested_outputs": "Narrative + register",
        "refinements": "Emphasize regulatory expectations",
        "control_tokens": ["tone=regulatory", "length=concise"],
        "instruction_tuning": "Favor controls mapped to public guidance; keep output JSON-only.",
    }
    resp = client.post("/api/v1/risk/analyze?mode=mock", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "trace_id" in data and data["trace_id"]
    assert "summary" in data and isinstance(data["summary"], str)
    assert isinstance(data.get("risks"), list) and len(data["risks"]) > 0
    for risk in data["risks"]:
        assert isinstance(risk.get("control_mappings"), list)
        assert isinstance(risk.get("vulnerability_summaries"), list)
    assert len(data["risks"][0]["control_mappings"]) > 0
    assert len(data["risks"][0]["vulnerability_summaries"]) > 0


def test_analyze_blocks_private_indicators():
    payload = {
        "business_type": "Retail banking",
        "risk_domain": "Operational",
        "region": "North America",
        "size": "Mid",
        "maturity": "Defined",
        "objectives": "Handle customer SSNs securely",
        "context": "Includes PII and confidential client data",
        "constraints": "None",
        "requested_outputs": "Narrative",
        "refinements": "",
    }
    resp = client.post("/api/v1/risk/analyze?mode=mock", json=payload)
    assert resp.status_code == 400
    body = resp.json()
    assert body["detail"].startswith("Input appears to include non-public or sensitive data indicators")


def test_analyze_allows_negated_private_markers():
    payload = {
        "business_type": "Retail banking",
        "risk_domain": "Operational",
        "region": "North America",
        "size": "Mid",
        "maturity": "Defined",
        "objectives": "Create risk register",
        "context": "New public-facing onboarding portal",
        "constraints": "Public data only; avoid pii and phi; no confidential or proprietary data",
        "requested_outputs": "Narrative + register",
        "refinements": "",
        "control_tokens": ["tone=regulatory"],
        "instruction_tuning": "Use concise tone.",
    }
    resp = client.post("/api/v1/risk/analyze?mode=mock", json=payload)
    assert resp.status_code == 200


def test_analyze_allows_customer_context_without_data():
    payload = {
        "business_type": "Retail banking",
        "risk_domain": "Operational",
        "region": "North America",
        "size": "Mid",
        "maturity": "Defined",
        "objectives": "Assess customer onboarding flow",
        "context": "Customer onboarding for new accounts using public data only",
        "constraints": "Public data; avoid pii; avoid phi; no confidential or proprietary data",
        "requested_outputs": "Narrative + register",
        "refinements": "",
        "control_tokens": ["tone=regulatory"],
        "instruction_tuning": "Use concise tone.",
    }
    resp = client.post("/api/v1/risk/analyze?mode=mock", json=payload)
    assert resp.status_code == 200


def test_prompt_variants_endpoint_lists_defaults():
    resp = client.get("/api/v1/risk/prompt-variants")
    assert resp.status_code == 200
    variants = resp.json()
    assert "default" in variants
    # variants shipped with repo
    assert "variant_a" in variants
    assert "variant_b" in variants


def test_analyze_rejects_unknown_prompt_variant():
    payload = {
        "business_type": "Retail banking",
        "risk_domain": "Operational",
        "objectives": "Create risk register",
        "constraints": "Public data only",
    }
    resp = client.post("/api/v1/risk/analyze?mode=mock&prompt_variant=does_not_exist", json=payload)
    assert resp.status_code == 400

def test_parse_llm_json_coerces_numeric_risk_ids():
    payload = {
        "summary": "Test summary",
        "risks": [
            {
                "risk_id": 1,
                "risk_title": "Example",
                "cause": "Cause",
                "impact": "Impact",
                "likelihood": "Low",
                "inherent_rating": "Low",
                "residual_rating": "Low",
                "controls": [],
                "mitigations": [],
                "kpis": [],
                "assumptions": [],
            }
        ],
        "assumptions_gaps": [],
    }
    parsed = _parse_llm_json(json.dumps(payload), trace_id="abc")
    assert parsed.risks[0].risk_id == "1"


def test_parse_llm_json_allows_code_fences_and_trailing_commas():
    raw = """```json
{
  "summary": "Test summary",
  "risks": [],
  "assumptions_gaps": [],
}
```"""
    parsed = _parse_llm_json(raw, trace_id="abc")
    assert parsed.summary == "Test summary"
