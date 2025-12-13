import { RiskResponse } from '../services/api';

type Props = {
  result: RiskResponse | null;
  loading: boolean;
};

function ProjectDashboard({ result, loading }: Props) {
  return (
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Analysis Status</h2>
        <span className="pill">{loading ? 'Running' : result ? 'Complete' : 'Idle'}</span>
      </div>
      <p className="muted">
        Submit a scenario to generate a narrative, risk register, mitigations, monitoring KPIs, control mappings, and vulnerability summaries. Mock mode works without keys.
      </p>
      {result && (
        <div>
          <strong>Trace ID:</strong> {result.trace_id}
        </div>
      )}
    </section>
  );
}

export default ProjectDashboard;
