import { useEffect, useMemo, useState } from 'react';
import scenariosData from '../../eval_scenarios.json';
import { Mode, analyzeRisk, listPromptVariants, RiskRequest, RiskResponse } from '../../services/api';

type Props = {
  onBack: () => void;
};

type EvalScenario = {
  id: string;
  name: string;
  expect_refusal: boolean;
  payload: RiskRequest;
};

type RunRecord = {
  scenarioId: string;
  scenarioName: string;
  variant: string;
  sessionId: string;
  run: number;
  expectRefusal: boolean;
  refused: boolean;
  refusalOk: boolean;
  schemaOk: boolean;
  coverageOk: boolean;
  coverageMissing: string[];
  riskTitles: string[];
  traceId?: string;
  result?: RiskResponse;
  error?: string;
};

type Metrics = {
  schemaValidRate: number;
  coverageRate: number;
  refusalPassRate: number;
  avgTopRiskJaccard: number;
  perScenarioConsistency: Record<string, number>;
};

type HallucinationFlag = 'Yes' | 'No';

type SmeScore = {
  factualSoundness?: number;
  completeness?: number;
  prioritizationLogic?: number;
  clarity?: number;
  alignmentConstraints?: number;
  safety?: number;
  hallucinationPresent?: HallucinationFlag;
  notes?: string;
};

const openAiModels = [
  'gpt-5',
  'gpt-5-mini',
  'gpt-5.1',
  'gpt-5.1-mini',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-3.5-turbo',
];

function coverageMissing(result: RiskResponse): string[] {
  const missing: string[] = [];
  result.risks.forEach((risk) => {
    if (!risk.cause?.trim()) missing.push(`${risk.risk_id}:cause`);
    if (!risk.impact?.trim()) missing.push(`${risk.risk_id}:impact`);
    if (!risk.controls || risk.controls.length === 0) missing.push(`${risk.risk_id}:controls`);
    if (!risk.control_mappings || risk.control_mappings.length === 0) missing.push(`${risk.risk_id}:control_mappings`);
    if (!risk.mitigations || risk.mitigations.length === 0) missing.push(`${risk.risk_id}:mitigations`);
    if (!risk.kpis || risk.kpis.length === 0) missing.push(`${risk.risk_id}:kpis`);
    if (!risk.vulnerability_summaries || risk.vulnerability_summaries.length === 0) {
      missing.push(`${risk.risk_id}:vulnerability_summaries`);
    }
  });
  return missing;
}

function normalizeTitles(result: RiskResponse): string[] {
  return result.risks
    .map((r) => (r.risk_title || '').trim().toLowerCase())
    .filter(Boolean);
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  sa.forEach((v) => {
    if (sb.has(v)) intersection += 1;
  });
  return intersection / (sa.size + sb.size - intersection);
}

function averagePairwiseSimilarity(titleRuns: string[][]): number {
  if (titleRuns.length < 2) return 1;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < titleRuns.length; i += 1) {
    for (let j = i + 1; j < titleRuns.length; j += 1) {
      sum += jaccard(titleRuns[i], titleRuns[j]);
      count += 1;
    }
  }
  return count ? sum / count : 1;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function EvalPage({ onBack }: Props) {
  const scenarios = useMemo(() => scenariosData as EvalScenario[], []);
  const [mode, setMode] = useState<Mode>('mock');
  const [llmModel, setLlmModel] = useState<string>('gpt-4o-mini');
  const [availableVariants, setAvailableVariants] = useState<string[]>(['default', 'variant_a', 'variant_b']);
  const [promptVariantA, setPromptVariantA] = useState<string>('default');
  const [promptVariantB, setPromptVariantB] = useState<string>('variant_a');
  const [runsPerScenario, setRunsPerScenario] = useState<number>(3);
  const [running, setRunning] = useState(false);
  const [records, setRecords] = useState<RunRecord[]>([]);
  const [metricsByVariant, setMetricsByVariant] = useState<Record<string, Metrics> | null>(null);
  const [smeScoresByKey, setSmeScoresByKey] = useState<Record<string, SmeScore>>({});
  const [evalSessionId, setEvalSessionId] = useState<string>('');

  useEffect(() => {
    listPromptVariants()
      .then((variants) => {
        if (variants.length > 0) setAvailableVariants(variants);
      })
      .catch(() => {
        // fallback to default list
      });
  }, []);

  const computeMetrics = (variantRecords: RunRecord[]): Metrics => {
    const positiveRuns = variantRecords.filter((r) => !r.expectRefusal);
    const negativeRuns = variantRecords.filter((r) => r.expectRefusal);

    const schemaValidRate = positiveRuns.length
      ? positiveRuns.filter((r) => r.schemaOk).length / positiveRuns.length
      : 0;
    const coverageRate = positiveRuns.length
      ? positiveRuns.filter((r) => r.coverageOk).length / positiveRuns.length
      : 0;
    const refusalPassRate = negativeRuns.length
      ? negativeRuns.filter((r) => r.refusalOk).length / negativeRuns.length
      : 1;

    const perScenarioConsistency: Record<string, number> = {};
    scenarios
      .filter((s) => !s.expect_refusal)
      .forEach((s) => {
        const titleRuns = positiveRuns
          .filter((r) => r.scenarioId === s.id && r.schemaOk)
          .map((r) => r.riskTitles);
        perScenarioConsistency[s.id] = averagePairwiseSimilarity(titleRuns);
      });

    const consistencyValues = Object.values(perScenarioConsistency);
    const avgTopRiskJaccard = consistencyValues.length
      ? consistencyValues.reduce((a, b) => a + b, 0) / consistencyValues.length
      : 1;

    return {
      schemaValidRate,
      coverageRate,
      refusalPassRate,
      avgTopRiskJaccard,
      perScenarioConsistency,
    };
  };

  const recordKey = (record: RunRecord) =>
    `${record.sessionId}:${record.variant}:${record.scenarioId}:${record.run}`;

  const updateSmeScore = (key: string, patch: Partial<SmeScore>) => {
    setSmeScoresByKey((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), ...patch },
    }));
  };

  const downloadSmeCsv = () => {
    const headers = [
      'scenario_id',
      'scenario_name',
      'variant',
      'model',
      'mode',
      'run',
      'trace_id',
      'factual_soundness_1_5',
      'completeness_1_5',
      'prioritization_logic_1_5',
      'clarity_1_5',
      'alignment_constraints_1_5',
      'safety_1_5',
      'hallucination_present_yes_no',
      'notes',
    ];

    const rows = records
      .filter((r) => !r.expectRefusal && r.schemaOk)
      .map((r) => {
        const key = recordKey(r);
        const s = smeScoresByKey[key] || {};
        return {
          scenario_id: r.scenarioId,
          scenario_name: r.scenarioName,
          variant: r.variant,
          model: mode === 'live' ? llmModel : '',
          mode,
          run: String(r.run),
          trace_id: r.traceId || '',
          factual_soundness_1_5: s.factualSoundness?.toString() || '',
          completeness_1_5: s.completeness?.toString() || '',
          prioritization_logic_1_5: s.prioritizationLogic?.toString() || '',
          clarity_1_5: s.clarity?.toString() || '',
          alignment_constraints_1_5: s.alignmentConstraints?.toString() || '',
          safety_1_5: s.safety?.toString() || '',
          hallucination_present_yes_no: s.hallucinationPresent || '',
          notes: s.notes || '',
        };
      });

    const csvLines = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => csvEscape((row as Record<string, string>)[h] || '')).join(',')),
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sme_scores_${evalSessionId || 'session'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const runEvals = async () => {
    setRunning(true);
    setRecords([]);
    setMetricsByVariant(null);
    setSmeScoresByKey({});
    const sessionId = new Date().toISOString().replace(/[:.]/g, '-');
    setEvalSessionId(sessionId);
    const newRecords: RunRecord[] = [];
    const defaultScores: Record<string, SmeScore> = {};

    const variantsToRun = Array.from(new Set([promptVariantA, promptVariantB].filter(Boolean)));

    for (const variant of variantsToRun) {
      for (const scenario of scenarios) {
        for (let run = 1; run <= runsPerScenario; run += 1) {
          const baseRecord: RunRecord = {
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            variant,
            sessionId,
            run,
            expectRefusal: scenario.expect_refusal,
            refused: false,
            refusalOk: false,
            schemaOk: false,
            coverageOk: false,
            coverageMissing: [],
            riskTitles: [],
          };

          try {
            const res = await analyzeRisk(
              scenario.payload,
              mode,
              mode === 'live' ? llmModel : undefined,
              variant,
            );

            if (scenario.expect_refusal) {
              newRecords.push({
                ...baseRecord,
                schemaOk: true,
                refusalOk: false,
                traceId: res.trace_id,
                result: res,
                riskTitles: normalizeTitles(res),
              });
            } else {
              const missing = coverageMissing(res);
              const recordForKey: RunRecord = {
                ...baseRecord,
                schemaOk: true,
                coverageOk: missing.length === 0,
                coverageMissing: missing,
                traceId: res.trace_id,
                result: res,
                riskTitles: normalizeTitles(res),
              };
              defaultScores[`${sessionId}:${variant}:${scenario.id}:${run}`] = {
                completeness: missing.length === 0 ? 5 : 3,
                safety: 5,
              };
              newRecords.push({
                ...recordForKey,
              });
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Request failed';
            const refusalOk =
              scenario.expect_refusal && /non-public|sensitive|policy/i.test(message);
            newRecords.push({
              ...baseRecord,
              refused: true,
              refusalOk,
              error: message,
            });
          }

          setRecords([...newRecords]);
        }
      }
    }

    const metricsPerVariant: Record<string, Metrics> = {};
    variantsToRun.forEach((variant) => {
      const variantRecords = newRecords.filter((r) => r.variant === variant);
      metricsPerVariant[variant] = computeMetrics(variantRecords);
    });
    setMetricsByVariant(metricsPerVariant);
    setSmeScoresByKey(defaultScores);
    setRunning(false);
  };

  const recordsByScenarioVariant = useMemo(() => {
    const map: Record<string, Record<string, RunRecord[]>> = {};
    records.forEach((r) => {
      map[r.scenarioId] = map[r.scenarioId] || {};
      map[r.scenarioId][r.variant] = map[r.scenarioId][r.variant] || [];
      map[r.scenarioId][r.variant].push(r);
    });
    return map;
  }, [records]);

  return (
    <section className="grid">
      <div className="card grid">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Evaluation Runner</h2>
          <button className="button secondary" type="button" onClick={onBack} disabled={running}>
            Back to landing
          </button>
        </div>

        <div className="grid two">
          <div className="field">
            <label htmlFor="runsPerScenario">Runs per scenario</label>
            <input
              id="runsPerScenario"
              type="number"
              min={1}
              max={10}
              value={runsPerScenario}
              onChange={(e) => setRunsPerScenario(Number(e.target.value))}
              disabled={running}
            />
            <p className="muted" style={{ margin: 0 }}>
              Repeat runs to measure consistency.
            </p>
          </div>

          <div className="field">
            <label>Mode</label>
            <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`button ${mode === 'mock' ? '' : 'secondary'}`}
                onClick={() => setMode('mock')}
                disabled={running}
              >
                Mock
              </button>
              <button
                type="button"
                className={`button ${mode === 'live' ? '' : 'secondary'}`}
                onClick={() => setMode('live')}
                disabled={running}
              >
                Live
              </button>
              <button
                type="button"
                className={`button ${mode === 'auto' ? '' : 'secondary'}`}
                onClick={() => setMode('auto')}
                disabled={running}
              >
                Auto
              </button>
            </div>
          </div>
        </div>

        {mode === 'live' && (
          <div className="field">
            <label htmlFor="llmModel">Model</label>
            <select
              id="llmModel"
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              disabled={running}
            >
              {openAiModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid two">
          <div className="field">
            <label htmlFor="promptVariantA">Prompt variant A</label>
            <select
              id="promptVariantA"
              value={promptVariantA}
              onChange={(e) => setPromptVariantA(e.target.value)}
              disabled={running}
            >
              {availableVariants.map((variant) => (
                <option key={variant} value={variant}>
                  {variant}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="promptVariantB">Prompt variant B</label>
            <select
              id="promptVariantB"
              value={promptVariantB}
              onChange={(e) => setPromptVariantB(e.target.value)}
              disabled={running}
            >
              {availableVariants.map((variant) => (
                <option key={variant} value={variant}>
                  {variant}
                </option>
              ))}
            </select>
            <p className="muted" style={{ margin: 0 }}>
              Set B = A to run a single variant.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="button" type="button" onClick={runEvals} disabled={running}>
            {running ? 'Running...' : 'Run evals'}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={downloadSmeCsv}
            disabled={running || records.length === 0}
          >
            Download SME CSV
          </button>
          <span className="muted" style={{ alignSelf: 'center' }}>
            Scenarios: {scenarios.length}
          </span>
        </div>
      </div>

      {metricsByVariant && (
        <div className="card grid">
          <h3 style={{ margin: 0 }}>Metrics</h3>
          <div className="grid two">
            {Object.entries(metricsByVariant).map(([variant, metrics]) => (
              <div key={variant} className="card" style={{ padding: 12 }}>
                <strong>{variant}</strong>
                <div style={{ marginTop: 6 }}>
                  Schema valid: {(metrics.schemaValidRate * 100).toFixed(1)}%
                </div>
                <div>Coverage: {(metrics.coverageRate * 100).toFixed(1)}%</div>
                <div>Refusal pass: {(metrics.refusalPassRate * 100).toFixed(1)}%</div>
                <div>Top‑risk consistency: {metrics.avgTopRiskJaccard.toFixed(2)}</div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Compare to thresholds in docs/evaluation.md.
          </p>
        </div>
      )}

      <div className="grid">
        {scenarios.map((scenario) => {
          const variantMap = recordsByScenarioVariant[scenario.id] || {};
          const scenarioVariants = Object.keys(variantMap);
          const allPass = scenarioVariants.length > 0 && scenarioVariants.every((variant) => {
            const scenarioRecords = variantMap[variant] || [];
            return scenario.expect_refusal
              ? scenarioRecords.every((r) => r.refusalOk)
              : scenarioRecords.every((r) => r.schemaOk && r.coverageOk);
          });

          return (
            <details key={scenario.id} className="card" open={false}>
              <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <strong>{scenario.id}</strong> — {scenario.name}
                </span>
                {scenarioVariants.length > 0 && (
                  <span className="pill" style={{ background: allPass ? '#ecfdf3' : '#fef3c7', color: '#111827' }}>
                    {allPass ? 'Pass' : 'Review'}
                  </span>
                )}
              </summary>

              {scenarioVariants.length === 0 && (
                <p className="muted" style={{ marginTop: 8 }}>
                  Not run yet.
                </p>
              )}

              {scenarioVariants.map((variant) => {
                const scenarioRecords = variantMap[variant] || [];
                const variantMetrics = metricsByVariant?.[variant];

                return (
                  <div key={`${scenario.id}-${variant}`} className="grid" style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>Variant: {variant}</strong>
                      {variantMetrics?.perScenarioConsistency[scenario.id] !== undefined && (
                        <span className="muted">
                          Consistency: {variantMetrics.perScenarioConsistency[scenario.id].toFixed(2)}
                        </span>
                      )}
                    </div>

                    {scenario.expect_refusal && (
                      <ul style={{ marginTop: 0 }}>
                        {scenarioRecords.map((r) => (
                          <li key={`${r.scenarioId}-${variant}-${r.run}`}>
                            Run {r.run}:{' '}
                            {r.refusalOk
                              ? 'Refused as expected'
                              : `Unexpected success/error: ${r.error || 'ok'}`}
                          </li>
                        ))}
                      </ul>
                    )}

                    {!scenario.expect_refusal && (
                      <div className="grid">
                        {scenarioRecords.map((r) => (
                          <div key={`${r.scenarioId}-${variant}-${r.run}`} className="card" style={{ padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <strong>Run {r.run}</strong>
                              <span className="muted">Trace: {r.traceId || 'n/a'}</span>
                            </div>
                            {!r.schemaOk && <div className="muted">Error: {r.error}</div>}
                            {r.schemaOk && (
                              <>
                                <div className="muted" style={{ marginTop: 4 }}>
                                  Risks: {r.riskTitles.length}
                                </div>
                                <div style={{ marginTop: 4 }}>
                                  <strong>Top risks:</strong> {r.riskTitles.slice(0, 8).join('; ') || 'none'}
                                </div>
                                {r.coverageOk ? (
                                  <div className="muted" style={{ marginTop: 4 }}>
                                    Coverage: OK
                                  </div>
                                ) : (
                                  <div className="muted" style={{ marginTop: 4 }}>
                                    Missing fields: {r.coverageMissing.join(', ')}
                                  </div>
                                )}

                                <div className="card grid" style={{ marginTop: 10, padding: 12 }}>
                                  <strong>SME scoring (manual)</strong>
                                  <div className="grid two">
                                    {(
                                      [
                                        ['Factual soundness', 'factualSoundness'],
                                        ['Completeness', 'completeness'],
                                        ['Prioritization logic', 'prioritizationLogic'],
                                        ['Clarity', 'clarity'],
                                        ['Alignment to constraints', 'alignmentConstraints'],
                                        ['Safety', 'safety'],
                                      ] as const
                                    ).map(([label, field]) => {
                                      const key = recordKey(r);
                                      const current = smeScoresByKey[key] || {};
                                      const value = current[field];
                                      return (
                                        <div key={field} className="field">
                                          <label>{label} (1–5)</label>
                                          <select
                                            value={value ? String(value) : ''}
                                            onChange={(e) => {
                                              const next = e.target.value ? Number(e.target.value) : undefined;
                                              updateSmeScore(key, { [field]: next } as Partial<SmeScore>);
                                            }}
                                            disabled={running}
                                          >
                                            <option value="">(blank)</option>
                                            {[1, 2, 3, 4, 5].map((n) => (
                                              <option key={n} value={n}>
                                                {n}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div className="grid two">
                                    <div className="field">
                                      <label>Hallucination present?</label>
                                      <select
                                        value={smeScoresByKey[recordKey(r)]?.hallucinationPresent || ''}
                                        onChange={(e) =>
                                          updateSmeScore(recordKey(r), {
                                            hallucinationPresent: e.target.value
                                              ? (e.target.value as HallucinationFlag)
                                              : undefined,
                                          })
                                        }
                                        disabled={running}
                                      >
                                        <option value="">(blank)</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                      </select>
                                    </div>
                                    <div className="field">
                                      <label>Notes</label>
                                      <textarea
                                        value={smeScoresByKey[recordKey(r)]?.notes || ''}
                                        onChange={(e) => updateSmeScore(recordKey(r), { notes: e.target.value })}
                                        disabled={running}
                                        placeholder="Key gaps, hallucinations, suggested prompt tweaks..."
                                      />
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </details>
          );
        })}
      </div>
    </section>
  );
}

export default EvalPage;
