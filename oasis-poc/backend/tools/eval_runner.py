"""
Evaluation runner for validating the LLM + prompt-template risk analysis.

Usage (from repo root):
  python backend/tools/eval_runner.py --scenarios docs/eval_scenarios.json --mode mock --runs 3
  python backend/tools/eval_runner.py --scenarios docs/eval_scenarios.json --mode live --runs 5 --models gpt-4o-mini gpt-4o

The runner writes:
  - runs.jsonl: one record per run
  - summary.json: aggregated metrics
  - sme_rubric_template.csv: SME scoring sheet
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Literal

# Ensure `backend/` is on sys.path when running from repo root.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.v1.schemas import RiskRequest, RiskResponse  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.data_policy import find_private_indicators  # noqa: E402
from app.services import prompt_engine  # noqa: E402
from app.services.llm_adapter import run_llm  # noqa: E402


Mode = Literal["auto", "mock", "live"]


@dataclass(frozen=True)
class PromptVariant:
    name: str
    system_prompt: str


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def load_scenarios(path: Path) -> list[dict[str, Any]]:
    raw = _load_json(path)
    if not isinstance(raw, list):
        raise ValueError("Scenarios file must be a JSON list.")
    scenarios: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("Each scenario must be an object.")
        if "id" not in item or "payload" not in item:
            raise ValueError("Scenario missing required keys: id, payload.")
        scenarios.append(item)
    return scenarios


def load_prompt_variants(files: list[Path]) -> list[PromptVariant]:
    variants: list[PromptVariant] = [PromptVariant(name="default", system_prompt=prompt_engine.SYSTEM_PROMPT)]
    for file_path in files:
        text = file_path.read_text(encoding="utf-8").strip()
        if not text:
            raise ValueError(f"Prompt variant file is empty: {file_path}")
        variants.append(PromptVariant(name=file_path.stem, system_prompt=text))
    return variants


def resolve_force_mock(mode: Mode) -> bool | None:
    if mode == "mock":
        return True
    if mode == "live":
        return False
    return None


def input_policy_hits(payload: RiskRequest) -> list[str]:
    return find_private_indicators(
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


def output_policy_hits(response: RiskResponse) -> list[str]:
    values: list[str | None] = [response.summary]
    for risk in response.risks:
        values.extend(
            [
                risk.risk_title,
                risk.cause,
                risk.impact,
                " ".join(risk.controls),
                " ".join(risk.mitigations),
                " ".join(risk.kpis),
                " ".join(risk.assumptions),
            ]
        )
        for mapping in risk.control_mappings:
            values.extend(
                [
                    mapping.control_statement,
                    mapping.framework,
                    mapping.framework_control_id,
                    mapping.framework_control_name,
                    mapping.mapping_rationale,
                ]
            )
            for ref in mapping.references:
                values.extend([ref.source_type, ref.title, ref.identifier, ref.url, ref.notes])

        for vuln in risk.vulnerability_summaries:
            values.extend(
                [
                    vuln.vulnerability_type,
                    vuln.identifier,
                    vuln.title,
                    vuln.summary,
                    vuln.severity,
                ]
            )
            for ref in vuln.references:
                values.extend([ref.source_type, ref.title, ref.identifier, ref.url, ref.notes])
    return find_private_indicators(values)


def coverage_missing(response: RiskResponse) -> list[dict[str, Any]]:
    missing: list[dict[str, Any]] = []
    for risk in response.risks:
        fields: list[str] = []
        if not risk.cause.strip():
            fields.append("cause")
        if not risk.impact.strip():
            fields.append("impact")
        if not risk.controls:
            fields.append("controls")
        if not risk.control_mappings:
            fields.append("control_mappings")
        if not risk.mitigations:
            fields.append("mitigations")
        if not risk.kpis:
            fields.append("kpis")
        if not risk.vulnerability_summaries:
            fields.append("vulnerability_summaries")
        if fields:
            missing.append({"risk_id": risk.risk_id, "missing": fields})
    return missing


def normalize_titles(response: RiskResponse) -> list[str]:
    titles = []
    for risk in response.risks:
        title = (risk.risk_title or "").strip().lower()
        if title:
            titles.append(title)
    return titles


def jaccard(a: Iterable[str], b: Iterable[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def average_pairwise_similarity(title_runs: list[list[str]]) -> float:
    if len(title_runs) < 2:
        return 1.0
    sims: list[float] = []
    for i in range(len(title_runs)):
        for j in range(i + 1, len(title_runs)):
            sims.append(jaccard(title_runs[i], title_runs[j]))
    return statistics.fmean(sims) if sims else 1.0


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def write_sme_template(path: Path, records: list[dict[str, Any]]) -> None:
    fieldnames = [
        "scenario_id",
        "scenario_name",
        "variant",
        "model",
        "run",
        "trace_id",
        "factual_soundness_1_5",
        "completeness_1_5",
        "prioritization_logic_1_5",
        "clarity_1_5",
        "alignment_constraints_1_5",
        "safety_1_5",
        "hallucination_present_yes_no",
        "notes",
    ]
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for record in records:
            if record.get("refused"):
                continue
            writer.writerow(
                {
                    "scenario_id": record["scenario_id"],
                    "scenario_name": record["scenario_name"],
                    "variant": record["variant"],
                    "model": record["model"],
                    "run": record["run"],
                    "trace_id": record.get("trace_id", ""),
                }
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run PoC evaluation scenarios.")
    parser.add_argument("--scenarios", type=Path, default=Path("docs/eval_scenarios.json"))
    parser.add_argument("--mode", choices=["auto", "mock", "live"], default="auto")
    parser.add_argument("--runs", type=int, default=3, help="Repeat runs per scenario.")
    parser.add_argument(
        "--models",
        nargs="*",
        default=None,
        help="Optional list of models for A/B; only used in live mode.",
    )
    parser.add_argument(
        "--system-prompt-file",
        nargs="*",
        default=[],
        type=Path,
        help="Optional system prompt variant files (one per A/B variant).",
    )
    parser.add_argument("--out-dir", type=Path, default=Path("backend/eval_outputs"))
    args = parser.parse_args()

    scenarios = load_scenarios(args.scenarios)
    settings = get_settings()
    mode: Mode = args.mode
    force_mock = resolve_force_mock(mode)
    models = args.models or [settings.llm_model]
    prompt_variants = load_prompt_variants(args.system_prompt_file)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = args.out_dir / timestamp
    out_dir.mkdir(parents=True, exist_ok=True)

    run_records: list[dict[str, Any]] = []
    similarity_by_key: dict[tuple[str, str, str], list[list[str]]] = {}

    original_system_prompt = prompt_engine.SYSTEM_PROMPT
    try:
        for scenario in scenarios:
            scenario_id = scenario.get("id", "unknown")
            scenario_name = scenario.get("name", scenario_id)
            expect_refusal = bool(scenario.get("expect_refusal"))
            payload = RiskRequest(**scenario["payload"])
            hits = input_policy_hits(payload)
            refused = bool(hits)

            for variant in prompt_variants:
                prompt_engine.SYSTEM_PROMPT = variant.system_prompt
                for model in models:
                    title_runs: list[list[str]] = []
                    for run_idx in range(1, args.runs + 1):
                        record: dict[str, Any] = {
                            "scenario_id": scenario_id,
                            "scenario_name": scenario_name,
                            "variant": variant.name,
                            "model": model,
                            "run": run_idx,
                            "expect_refusal": expect_refusal,
                            "input_policy_hits": hits,
                            "refused": refused,
                            "schema_ok": False,
                            "coverage_ok": False,
                            "output_safe": True,
                        }

                        if refused:
                            record["refusal_ok"] = expect_refusal
                            run_records.append(record)
                            continue

                        try:
                            response = run_llm(
                                payload,
                                settings,
                                force_mock=force_mock,
                                llm_model_override=model if mode == "live" else None,
                            )
                            record["schema_ok"] = True
                            record["trace_id"] = response.trace_id
                            record["response"] = response.model_dump()

                            missing = coverage_missing(response)
                            record["coverage_missing"] = missing
                            record["coverage_ok"] = len(missing) == 0

                            titles = normalize_titles(response)
                            record["risk_titles"] = titles
                            title_runs.append(titles)

                            out_hits = output_policy_hits(response)
                            record["output_policy_hits"] = out_hits
                            record["output_safe"] = len(out_hits) == 0

                            record["refusal_ok"] = not expect_refusal
                        except Exception as exc:  # pragma: no cover - eval harness
                            record["error"] = str(exc)
                            record["refusal_ok"] = False

                        run_records.append(record)

                    similarity_key = (scenario_id, variant.name, model)
                    similarity_by_key[similarity_key] = title_runs
    finally:
        prompt_engine.SYSTEM_PROMPT = original_system_prompt

    # Aggregation
    positive_runs = [r for r in run_records if not r.get("expect_refusal")]
    negative_runs = [r for r in run_records if r.get("expect_refusal")]
    schema_valid_rate = (
        sum(1 for r in positive_runs if r.get("schema_ok")) / len(positive_runs) if positive_runs else 0.0
    )
    coverage_rate = (
        sum(1 for r in positive_runs if r.get("coverage_ok")) / len(positive_runs) if positive_runs else 0.0
    )
    output_safe_rate = (
        sum(1 for r in positive_runs if r.get("output_safe")) / len(positive_runs) if positive_runs else 0.0
    )
    refusal_pass_rate = (
        sum(1 for r in negative_runs if r.get("refusal_ok")) / len(negative_runs) if negative_runs else 1.0
    )

    per_scenario_similarity: dict[str, float] = {}
    for (scenario_id, variant_name, model), title_runs in similarity_by_key.items():
        key_name = f"{scenario_id}:{variant_name}:{model}"
        per_scenario_similarity[key_name] = average_pairwise_similarity(title_runs)

    avg_similarity = statistics.fmean(per_scenario_similarity.values()) if per_scenario_similarity else 1.0

    summary = {
        "timestamp": timestamp,
        "mode": mode,
        "runs_per_scenario": args.runs,
        "models": models,
        "prompt_variants": [v.name for v in prompt_variants],
        "counts": {
            "total_runs": len(run_records),
            "positive_runs": len(positive_runs),
            "negative_runs": len(negative_runs),
        },
        "metrics": {
            "schema_valid_rate": schema_valid_rate,
            "coverage_rate": coverage_rate,
            "output_safe_rate": output_safe_rate,
            "refusal_pass_rate": refusal_pass_rate,
            "avg_top_risk_jaccard": avg_similarity,
        },
        "per_scenario_consistency": per_scenario_similarity,
    }

    write_jsonl(out_dir / "runs.jsonl", run_records)
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    write_sme_template(out_dir / "sme_rubric_template.csv", run_records)

    print(json.dumps(summary["metrics"], indent=2))
    print(f"Wrote outputs to: {out_dir}")


if __name__ == "__main__":
    main()
