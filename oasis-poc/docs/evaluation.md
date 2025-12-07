# Evaluation & Test Matrix

Purpose: demonstrate the PoC produces structured, context-relevant risk content using the controlled prompt. Results below assume **mock mode** (deterministic). Rerun in **live mode** for qualitative review when `OPENAI_API_KEY` is available.

## Quick run commands
- Mock: `curl -X POST "http://localhost:8000/api/v1/risk/analyze?mode=mock" -H "Content-Type: application/json" -d @payload.json`
- Live: `OPENAI_API_KEY=... curl -X POST "http://localhost:8000/api/v1/risk/analyze?mode=live" ...`

## Scenarios (covering three business contexts)
| Scenario | Input focus | Mode | Expected outcome |
| --- | --- | --- | --- |
| Digital onboarding (retail banking) | Operational + regulatory (KYC), channel availability | mock/live | Narrative plus register items for onboarding outages, KYC failures, fraud; mitigations include redundancy and controls for identity proofing. |
| Cloud migration for compliance workload | Regulatory/operational, data residency | mock/live | Risks around residency, access controls, misconfigurations; mitigations for encryption, policy mapping, change control. |
| Fintech fraud monitoring integration | Fraud/operational, third-party | mock/live | Third-party dependency and fraud detection efficacy; mitigations for SLAs, monitoring, model drift/threshold tuning. |

## Acceptance criteria
- Response is valid `RiskResponse` JSON (narrative + list of risks + assumptions_gaps).
- Risks include titles, causes, impacts, likelihoods, inherent/residual ratings, and actionable mitigations/KPIs.
- Content references only public/anonymized context; no proprietary data.

## Observations (mock mode)
- Deterministic mock response returned with trace ID, two sample risks, and assumptions/gaps.
- Guardrail blocks inputs containing markers like `pii`, `ssn`, `confidential`, etc., returning HTTP 400 with guidance.

## Next evaluation steps (live mode)
- Compare live outputs against a checklist per scenario (accuracy, actionability, regulatory coverage).
- Rate each risk item for relevance (1-5) and completeness (1-5); capture gaps for prompt tuning.
- Log trace IDs per run for reproducibility; redact any sensitive text before storage.
