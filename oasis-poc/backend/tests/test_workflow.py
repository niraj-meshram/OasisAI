from fastapi.testclient import TestClient


def test_workflow_end_to_end(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_API_KEY", "")
    monkeypatch.setenv("OASIS_STORE_PATH", str(tmp_path / "oasis_store.json"))
    monkeypatch.setenv("OASIS_AUTH_MODE", "disabled")

    from app.core.config import get_settings
    from app.main import create_app

    get_settings.cache_clear()
    app = create_app()
    client = TestClient(app)

    analyst_headers = {"x-user-role": "analyst"}
    reviewer_headers = {"x-user-role": "reviewer"}
    admin_headers = {"x-user-role": "admin"}

    project_resp = client.post(
        "/api/v1/projects",
        json={"name": "Test Project", "description": "PoC"},
        headers=analyst_headers,
    )
    assert project_resp.status_code == 201
    project_id = project_resp.json()["project_id"]

    payload = {
        "business_type": "Retail banking",
        "risk_domain": "Operational",
        "scope": "Digital onboarding channel",
        "time_horizon": "0-12 months",
        "known_controls": ["KYC/AML checks"],
        "verbosity": "concise",
        "language": "English",
        "constraints": "Public data only; avoid pii; avoid phi; no confidential data",
        "requested_outputs": "Narrative + register + mitigations + KPIs",
    }
    assessment_resp = client.post(
        f"/api/v1/projects/{project_id}/assessments",
        json={"title": "Onboarding assessment", "template_id": "operational", "payload": payload},
        headers=analyst_headers,
    )
    assert assessment_resp.status_code == 201
    assessment_id = assessment_resp.json()["assessment_id"]

    run_resp = client.post(
        f"/api/v1/assessments/{assessment_id}/run?mode=mock",
        json=payload,
        headers=analyst_headers,
    )
    assert run_resp.status_code == 200
    version = run_resp.json()
    assert version["version_number"] == 1
    assert version["trace_id"]
    assert version["response"]["trace_id"] == version["trace_id"]
    assert "user_prompt" in version and "=== Context ===" in version["user_prompt"]

    versions_resp = client.get(f"/api/v1/assessments/{assessment_id}/versions", headers=reviewer_headers)
    assert versions_resp.status_code == 200
    versions = versions_resp.json()
    assert len(versions) == 1
    assert versions[0]["version_number"] == 1

    version_id = version["version_id"]
    version_resp = client.get(f"/api/v1/assessments/{assessment_id}/versions/{version_id}", headers=reviewer_headers)
    assert version_resp.status_code == 200
    assert version_resp.json()["version_id"] == version_id

    export_md = client.get(
        f"/api/v1/assessments/{assessment_id}/versions/{version_id}/export?format=markdown",
        headers=reviewer_headers,
    )
    assert export_md.status_code == 200
    assert export_md.headers["content-type"].startswith("text/markdown")
    assert "Trace ID" in export_md.text

    denied_run = client.post(
        f"/api/v1/assessments/{assessment_id}/run?mode=mock",
        json=payload,
        headers=reviewer_headers,
    )
    assert denied_run.status_code == 403

    denied_feedback = client.post(
        f"/api/v1/assessments/{assessment_id}/versions/{version_id}/feedback",
        json={"rating": 4, "flags": ["Needs SME review"], "comment": "Should be blocked for analyst."},
        headers=analyst_headers,
    )
    assert denied_feedback.status_code == 403

    feedback_resp = client.post(
        f"/api/v1/assessments/{assessment_id}/versions/{version_id}/feedback",
        json={"rating": 4, "flags": ["Needs SME review"], "comment": "Looks reasonable for PoC."},
        headers=reviewer_headers,
    )
    assert feedback_resp.status_code == 201
    feedback_id = feedback_resp.json()["feedback_id"]

    feedback_list = client.get(
        f"/api/v1/assessments/{assessment_id}/versions/{version_id}/feedback",
        headers=reviewer_headers,
    )
    assert feedback_list.status_code == 200
    assert any(item["feedback_id"] == feedback_id for item in feedback_list.json())

    denied_admin = client.get("/api/v1/admin/settings", headers=reviewer_headers)
    assert denied_admin.status_code == 403
    allowed_admin = client.get("/api/v1/admin/settings", headers=admin_headers)
    assert allowed_admin.status_code == 200

    get_settings.cache_clear()
