import { useEffect, useMemo, useState } from 'react';
import { AssessmentVersion, AssessmentVersionSummary } from '../services/api';

type Props = {
  assessmentId: string | null;
  versions: AssessmentVersionSummary[];
  loading: boolean;
  fetchVersion: (assessmentId: string, versionId: string) => Promise<AssessmentVersion>;
};

function ComparePanel({ assessmentId, versions, loading, fetchVersion }: Props) {
  const [aId, setAId] = useState<string>('');
  const [bId, setBId] = useState<string>('');
  const [comparing, setComparing] = useState(false);
  const [aVersion, setAVersion] = useState<AssessmentVersion | null>(null);
  const [bVersion, setBVersion] = useState<AssessmentVersion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedVersions = useMemo(() => versions.slice().sort((x, y) => y.version_number - x.version_number), [versions]);

  useEffect(() => {
    if (!assessmentId) return;
    if (sortedVersions.length < 2) return;
    if (!aId) setAId(sortedVersions[1].version_id);
    if (!bId) setBId(sortedVersions[0].version_id);
  }, [assessmentId, sortedVersions, aId, bId]);

  const diff = useMemo(() => {
    if (!aVersion || !bVersion) return null;
    const aTitles = new Set(aVersion.response.risks.map((r) => `${r.risk_id}: ${r.risk_title}`));
    const bTitles = new Set(bVersion.response.risks.map((r) => `${r.risk_id}: ${r.risk_title}`));
    const added: string[] = [];
    const removed: string[] = [];
    aTitles.forEach((t) => {
      if (!bTitles.has(t)) removed.push(t);
    });
    bTitles.forEach((t) => {
      if (!aTitles.has(t)) added.push(t);
    });
    return {
      added: added.sort(),
      removed: removed.sort(),
    };
  }, [aVersion, bVersion]);

  const runCompare = async () => {
    if (!assessmentId || !aId || !bId) return;
    setComparing(true);
    setError(null);
    try {
      const [a, b] = await Promise.all([fetchVersion(assessmentId, aId), fetchVersion(assessmentId, bId)]);
      setAVersion(a);
      setBVersion(b);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compare failed');
    } finally {
      setComparing(false);
    }
  };

  if (!assessmentId) {
    return (
      <section className="card">
        <h2 style={{ margin: 0 }}>Compare versions</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          Select an assessment to compare versions.
        </p>
      </section>
    );
  }

  if (versions.length < 2) {
    return (
      <section className="card">
        <h2 style={{ margin: 0 }}>Compare versions</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          Need at least two versions to compare.
        </p>
      </section>
    );
  }

  return (
    <section className="card grid">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Compare versions</h2>
        <button className="button secondary pill" type="button" onClick={runCompare} disabled={loading || comparing}>
          {comparing ? 'Comparing…' : 'Compare'}
        </button>
      </div>

      <div className="grid two" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="compareA">Baseline (A)</label>
          <select id="compareA" value={aId} onChange={(e) => setAId(e.target.value)} disabled={loading || comparing}>
            <option value="">Select version</option>
            {sortedVersions.map((v) => (
              <option key={v.version_id} value={v.version_id}>
                v{v.version_number} · {v.resolved_mode} · {v.llm_model}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="compareB">Candidate (B)</label>
          <select id="compareB" value={bId} onChange={(e) => setBId(e.target.value)} disabled={loading || comparing}>
            <option value="">Select version</option>
            {sortedVersions.map((v) => (
              <option key={v.version_id} value={v.version_id}>
                v{v.version_number} · {v.resolved_mode} · {v.llm_model}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="card" role="alert" style={{ padding: 12, boxShadow: 'none' }}>
          Error: {error}
        </div>
      )}

      {aVersion && bVersion && (
        <div className="bento-grid">
          <div className="bento-tile">
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Metadata</h3>
            <div className="muted">A: v{aVersion.version_number} · {aVersion.llm_model} · {aVersion.prompt_variant}</div>
            <div className="muted">B: v{bVersion.version_number} · {bVersion.llm_model} · {bVersion.prompt_variant}</div>
          </div>
          <div className="bento-tile">
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Risk title delta</h3>
            <div className="muted">Added: {diff?.added.length || 0}</div>
            <div className="muted">Removed: {diff?.removed.length || 0}</div>
          </div>
          <div className="bento-tile bento-wide">
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Added (B \\ A)</h3>
            {diff && diff.added.length > 0 ? (
              <ul style={{ margin: 0 }}>
                {diff.added.map((t) => (
                  <li key={`added-${t}`}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                None
              </p>
            )}
          </div>
          <div className="bento-tile bento-wide">
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Removed (A \\ B)</h3>
            {diff && diff.removed.length > 0 ? (
              <ul style={{ margin: 0 }}>
                {diff.removed.map((t) => (
                  <li key={`removed-${t}`}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                None
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default ComparePanel;
