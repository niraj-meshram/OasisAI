import { useEffect, useState } from 'react';
import { RiskResponse } from '../../services/api';

type Props = {
  result: RiskResponse | null;
  loading: boolean;
};

type PopoutSection = 'riskRegister' | 'evaluation';

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
  const controlMappingCoverage = result.risks.every((r) => r.control_mappings && r.control_mappings.length > 0);
  const vulnerabilityCoverage = result.risks.every(
    (r) => r.vulnerability_summaries && r.vulnerability_summaries.length > 0,
  );

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
      name: 'Control mappings per risk',
      status: controlMappingCoverage ? 'Pass' : 'Review',
      details: controlMappingCoverage ? 'All risks have framework mappings' : 'Some risks missing control mappings',
    },
    {
      name: 'Vulnerability summaries per risk',
      status: vulnerabilityCoverage ? 'Pass' : 'Review',
      details: vulnerabilityCoverage ? 'All risks have vulnerability summaries' : 'Some risks missing vulnerability summaries',
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
  const [popoutSection, setPopoutSection] = useState<PopoutSection | null>(null);

  useEffect(() => {
    if (!popoutSection) return;

    const handleKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') setPopoutSection(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [popoutSection]);

  useEffect(() => {
    if (!popoutSection) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [popoutSection]);

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
      <div className="bento-grid">
        <div className="bento-tile">
          <h3 style={{ marginBottom: 4 }}>Narrative</h3>
          <p className="narrative">{result.summary}</p>
        </div>

        <div className="bento-tile">
          <h3 style={{ marginBottom: 4 }}>Assumptions & Gaps</h3>
          <ul style={{ margin: 0 }}>
            {result.assumptions_gaps.map((gap, idx) => (
              <li key={`${idx}-${gap}`}>{gap}</li>
            ))}
          </ul>
        </div>

        <div className="bento-tile bento-wide">
          <div className="bento-tile-header" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Risk Register</h3>
            <button
              className="button secondary pill"
              type="button"
              onClick={() => setPopoutSection('riskRegister')}
            >
              Pop out
            </button>
          </div>
          <div className="table-container">
            <table className="risks-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Cause</th>
                  <th>Impact</th>
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
                    <td>{risk.cause}</td>
                    <td>{risk.impact}</td>
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

        <div className="bento-tile bento-wide">
          <h3 style={{ marginBottom: 4 }}>Control Framework Mappings</h3>
          <div className="grid">
            {result.risks.map((risk) => (
              <div key={`${risk.risk_id}-control-mappings`}>
                <strong>
                  {risk.risk_id}: {risk.risk_title}
                </strong>
                {risk.control_mappings.length === 0 ? (
                  <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
                    No control mappings provided.
                  </p>
                ) : (
                  <ul style={{ marginTop: 8, marginBottom: 0 }}>
                    {risk.control_mappings.map((mapping, idx) => (
                      <li key={`${risk.risk_id}-cm-${idx}`}>
                        <div>
                          <strong>
                            {mapping.framework} {mapping.framework_control_id}
                          </strong>
                          {mapping.framework_control_name ? ` - ${mapping.framework_control_name}` : ''}
                        </div>
                        <div className="muted">{mapping.control_statement}</div>
                        {mapping.mapping_rationale && (
                          <div className="muted">Rationale: {mapping.mapping_rationale}</div>
                        )}
                        {mapping.references.length > 0 && (
                          <div className="muted">
                            Refs:{' '}
                            {mapping.references
                              .map(
                                (ref) =>
                                  `${ref.source_type}: ${ref.identifier ? `${ref.identifier} ` : ''}${ref.title}`,
                              )
                              .join(' | ')}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bento-tile bento-wide">
          <h3 style={{ marginBottom: 4 }}>Vulnerability Summaries</h3>
          <div className="grid">
            {result.risks.map((risk) => (
              <div key={`${risk.risk_id}-vulnerability-summaries`}>
                <strong>
                  {risk.risk_id}: {risk.risk_title}
                </strong>
                {risk.vulnerability_summaries.length === 0 ? (
                  <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
                    No vulnerability summaries provided.
                  </p>
                ) : (
                  <ul style={{ marginTop: 8, marginBottom: 0 }}>
                    {risk.vulnerability_summaries.map((vuln, idx) => (
                      <li key={`${risk.risk_id}-vs-${idx}`}>
                        <div>
                          <strong>
                            {vuln.vulnerability_type}
                            {vuln.identifier ? ` ${vuln.identifier}` : ''} - {vuln.severity}
                            {typeof vuln.cvss_v3_base_score === 'number'
                              ? ` (CVSS ${vuln.cvss_v3_base_score})`
                              : ''}
                          </strong>
                        </div>
                        <div>{vuln.title}</div>
                        <div className="muted">{vuln.summary}</div>
                        {vuln.references.length > 0 && (
                          <div className="muted">
                            Refs:{' '}
                            {vuln.references
                              .map(
                                (ref) =>
                                  `${ref.source_type}: ${ref.identifier ? `${ref.identifier} ` : ''}${ref.title}`,
                              )
                              .join(' | ')}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bento-tile bento-wide">
          <div className="bento-tile-header" style={{ marginBottom: 4 }}>
            <h3 style={{ margin: 0 }}>Evaluation</h3>
            <button
              className="button secondary pill"
              type="button"
              onClick={() => setPopoutSection('evaluation')}
            >
              Pop out
            </button>
          </div>
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
                      <span className={`status-pill ${item.status === 'Pass' ? 'pass' : 'review'}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>{item.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {popoutSection && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setPopoutSection(null)}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label={popoutSection === 'riskRegister' ? 'Risk Register' : 'Evaluation'}
            onClick={(evt) => evt.stopPropagation()}
          >
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>
                {popoutSection === 'riskRegister' ? 'Risk Register' : 'Evaluation'}
              </h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button secondary" type="button" onClick={() => setPopoutSection(null)}>
                  Close
                </button>
              </div>
            </div>

            <div className="modal-body">
              {popoutSection === 'riskRegister' ? (
                <div className="table-container popout">
                  <table className="risks-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Title</th>
                        <th>Cause</th>
                        <th>Impact</th>
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
                        <tr key={`${risk.risk_id}-popout`}>
                          <td>{risk.risk_id}</td>
                          <td>{risk.risk_title}</td>
                          <td>{risk.cause}</td>
                          <td>{risk.impact}</td>
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
              ) : (
                <div className="table-container popout">
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
                        <tr key={`${item.name}-popout`}>
                          <td>{item.name}</td>
                          <td>
                            <span className={`status-pill ${item.status === 'Pass' ? 'pass' : 'review'}`}>
                              {item.status}
                            </span>
                          </td>
                          <td>{item.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ResultsViewer;
