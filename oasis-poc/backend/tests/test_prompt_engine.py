from app.api.v1.schemas import RiskRequest
from app.services.prompt_engine import build_user_prompt


def test_build_user_prompt_includes_all_sections():
    payload = RiskRequest(
        business_type="Retail banking",
        risk_domain="Operational",
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
    assert "=== Control Tokens ===" in prompt
    assert "tone=regulatory" in prompt
    assert "=== Instruction Tuning ===" in prompt
    assert "Use short sentences" in prompt
    assert "control_mappings" in prompt
    assert "vulnerability_summaries" in prompt
