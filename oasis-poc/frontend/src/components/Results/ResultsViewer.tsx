import { RiskResponse } from '../../services/api';

type Props = {
  result: RiskResponse | null;
  loading: boolean;
};

type EvalStatus = {
  name: string;
  status: 'Pass' | 'Review';
  details: string;
};

function evaluateResult(result: RiskResponse): EvalStatus[] {
  const hasSummary = Boolean(result.summary && result.summary.trim().length > 0);
  const summaryLengthOk = result.summary.length <= 1000; // guard against runaway output
  const hasRisks = Array.isArray(result.risks) && result.risks.length > 0;
  const hasAssumptions = Array.isArray(result.assumptions_gaps) && result.assumptions_gaps.length > 0;
  const mitigationsCoverage = result.risks.every((r) => r.mitigations && r.mitigations.length > 0);
  const kpiCoverage = result.risks.every((r) => r.kpis && r.kpis.length > 0);

  return [
    {
      name: 'Summary present',
      status: hasSummary ? 'Pass' : 'Review',
      details: hasSummary ? 'Summary provided' : 'Missing summary text',
    },
    {
      name: 'Summary length',
      status: summaryLengthOk ? 'Pass' : 'Review',
      details: summaryLengthOk ? 'Within reasonable bound' : 'Too long; tighten response',
    },
    {
      name: 'Risk register',
      status: hasRisks ? 'Pass' : 'Review',
      details: hasRisks ? `${result.risks.length} risks returned` : 'No risks returned',
    },
    {
      name: 'Mitigations per risk',
      status: mitigationsCoverage ? 'Pass' : 'Review',
      details: mitigationsCoverage ? 'All risks have mitigations' : 'Some risks missing mitigations',
    },
    {
      name: 'KPIs per risk',
      status: kpiCoverage ? 'Pass' : 'Review',
      details: kpiCoverage ? 'All risks have KPIs' : 'Some risks missing KPIs',
    },
    {
      name: 'Assumptions & gaps',
      status: hasAssumptions ? 'Pass' : 'Review',
      details: hasAssumptions ? 'Assumptions/gaps provided' : 'Missing assumptions/gaps',
    },
  ];
}

function ResultsViewer({ result, loading }: Props) {
  if (loading) {
    return (
      <section className="card">
        <h2 style={{ margin: 0 }}>Results</h2>
        <p className="muted">Generating analysis...</p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="card">
        <h2 style={{ margin: 0 }}>Results</h2>
        <p className="muted">No results yet. Submit an assessment to see output.</p>
      </section>
    );
  }

  const evaluations = evaluateResult(result);

  return (
    <section className="card grid">
      <h2 style={{ margin: 0 }}>Results</h2>
      <div>
        <h3 style={{ marginBottom: 4 }}>Narrative</h3>
        <p className="narrative">{result.summary}</p>
      </div>
      <div>
        <h3 style={{ marginBottom: 8 }}>Risk Register</h3>
        <div className="table-container">
          <table className="risks-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Likelihood</th>
                <th>Inherent</th>
                <th>Residual</th>
                <th>Controls</th>
                <th>Mitigations</th>
                <th>KPIs</th>
              </tr>
            </thead>
            <tbody>
              {result.risks.map((risk) => (
                <tr key={risk.risk_id}>
                  <td>{risk.risk_id}</td>
                  <td>{risk.risk_title}</td>
                  <td>{risk.likelihood}</td>
                  <td>{risk.inherent_rating}</td>
                  <td>{risk.residual_rating}</td>
                  <td>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {risk.controls.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {risk.mitigations.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {risk.kpis.map((k) => (
                        <li key={k}>{k}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3 style={{ marginBottom: 4 }}>Assumptions & Gaps</h3>
        <ul>
          {result.assumptions_gaps.map((gap, idx) => (
            <li key={`${idx}-${gap}`}>{gap}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3 style={{ marginBottom: 4 }}>Evaluation</h3>
        <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
          Quick check against PoC acceptance criteria (structure, mitigations, KPIs, assumptions).
        </p>
        <div className="table-container">
          <table className="eval-table">
            <thead>
              <tr>
                <th>Criteria</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.map((item) => (
                <tr key={item.name}>
                  <td>{item.name}</td>
                  <td>
                    <span className={`status-pill ${item.status === 'Pass' ? 'pass' : 'review'}`}>{item.status}</span>
                  </td>
                  <td>{item.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default ResultsViewer;
