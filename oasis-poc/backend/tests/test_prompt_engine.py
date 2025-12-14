from app.api.v1.schemas import RiskRequest
from app.services.prompt_engine import build_user_prompt


def test_build_user_prompt_includes_all_sections():
    payload = RiskRequest(
        business_type="Retail banking",
        risk_domain="Operational",
        scope="Digital onboarding channel",
        time_horizon="0-12 months",
        known_controls=["KYC/AML checks"],
        verbosity="concise",
        language="English",
        region="NA",
        size="Mid",
        maturity="Defined",
        objectives="Create register",
        context="New onboarding channel",
        constraints="Public data only; avoid pii and phi",
        requested_outputs="Narrative + register",
        refinements="Emphasize resilience",
        control_tokens=["tone=regulatory", "length=concise"],
        instruction_tuning="Use short sentences; cite public frameworks only.",
    )
    prompt = build_user_prompt(payload)
    assert "=== Constraints ===" in prompt
    assert "Public data only" in prompt
    assert "Scope:" in prompt
    assert "Digital onboarding channel" in prompt
    assert "Time Horizon:" in prompt
    assert "Known Controls:" in prompt
    assert "=== Control Tokens ===" in prompt
    assert "tone=regulatory" in prompt
    assert "=== Instruction Tuning ===" in prompt
    assert "Use short sentences" in prompt
    assert "control_mappings" in prompt
    assert "vulnerability_summaries" in prompt
