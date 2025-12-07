from fastapi.testclient import TestClient

from app.main import app

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
    }
    resp = client.post("/api/v1/risk/analyze?mode=mock", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "trace_id" in data and data["trace_id"]
    assert "summary" in data and isinstance(data["summary"], str)
    assert isinstance(data.get("risks"), list) and len(data["risks"]) > 0


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
