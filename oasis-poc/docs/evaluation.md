# Evaluation Framework

Purpose: validate that a controlled prompt‑template + LLM can generate **structured, relevant, actionable, and safe** risk‑management content across business types. The evaluation uses only public/anonymized inputs.

## 1) Success criteria (“what good looks like”)
We track both automated gates and SME scoring:

- **Schema compliance**: output is valid JSON and matches `RiskResponse` schema.
- **Contextual relevance**: risks align to industry/region/maturity and scenario context.
- **Risk coverage**: each risk has cause, impact, controls, mitigations, KPIs, assumptions.
- **Usefulness/actionability**: mitigations and KPIs are implementable and specific.
- **Consistency**: repeated runs yield stable “top risks” (low variance).
- **Safety**: no PII/non‑public data; sensitive prompts are refused.

## 2) Evaluation set (representative test suite)
Scenarios live in `docs/eval_scenarios.json` (20+ cases), covering:

- Business types: banking, pharma, SaaS, manufacturing, public sector, etc.
- Regions/regulatory flavors: US, EU, APAC.
- Sizes/maturity: startup → enterprise, emerging → managed controls.
- Domains: cyber, operational, third‑party, privacy, fraud, regulatory.
- Edge cases (minimal context).
- Negative prompts designed to trigger refusal.

Add new scenarios by appending to the JSON list. Keep inputs public/anonymized.

## 3) SME rubric
SMEs score each non‑refused run 1–5 using `docs/eval_rubric.md`. The runner emits a scoring sheet:

- `backend/eval_outputs/<timestamp>/sme_rubric_template.csv`

## 4) Controlled experiments (repeat runs + A/B)
Use the evaluation runner to repeat runs and compare variants.

Mock/offline (deterministic):
```bash
python backend/tools/eval_runner.py --scenarios docs/eval_scenarios.json --mode mock --runs 3
```
Live (requires `OPENAI_API_KEY`):
```bash
python backend/tools/eval_runner.py --scenarios docs/eval_scenarios.json --mode live --runs 5 --models gpt-4o-mini gpt-4o
```
Prompt A/B (system prompt variants):
```bash
python backend/tools/eval_runner.py --mode live --runs 5 --system-prompt-file docs/prompt_variant_a.txt docs/prompt_variant_b.txt
```
Outputs:
- `runs.jsonl`: raw per‑run records with trace IDs and JSON.
- `summary.json`: aggregated metrics and per‑scenario consistency.

## 5) Metrics + thresholds (pass/fail gates)
Suggested gates to declare success:

- **Schema‑valid rate ≥ 95%** (positive scenarios).
- **Coverage rate ≥ 90%** (risks have cause/impact/controls/mitigations/KPIs).
- **Output safety rate ≥ 99%** (no policy markers in outputs).
- **Sensitive prompt refusal = 100%** (negative scenarios).
- **Consistency**: average top‑risk Jaccard similarity high (target ≥ 0.6); SMEs confirm stability.
- **Avg SME score ≥ 4/5** overall with hallucination flags ≈ 0.

## 6) Iterate until stable for 2 rounds
After prompt/model changes:
1. Re‑run the same evaluation set.
2. Compare metrics and SME scores to prior round.
3. Stop only when thresholds hold for **two consecutive rounds**.
