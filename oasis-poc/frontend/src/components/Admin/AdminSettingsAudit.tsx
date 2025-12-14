import { useEffect, useState } from 'react';
import { AdminSettings, AuditSnapshot, getAdminAuditSnapshot, getAdminSettings } from '../../services/api';

function AdminSettingsAudit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [audit, setAudit] = useState<AuditSnapshot | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, a] = await Promise.all([getAdminSettings(), getAdminAuditSnapshot(25)]);
      setSettings(s);
      setAudit(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Settings & audit</h2>
          <button className="button secondary pill" type="button" onClick={refresh} disabled={loading}>
            Refresh
          </button>
        </div>
        {error && (
          <div className="card" role="alert" style={{ padding: 12, boxShadow: 'none', marginTop: 12 }}>
            Error: {error}
          </div>
        )}
      </div>

      {settings && (
        <section className="card grid">
          <h3 style={{ margin: 0 }}>Configuration (sanitized)</h3>
          <div className="bento-grid">
            <div className="bento-tile">
              <strong>Auth mode</strong>
              <div className="muted">{settings.auth_mode}</div>
              <div className="muted">API key configured: {settings.app_api_key_configured ? 'Yes' : 'No'}</div>
            </div>
            <div className="bento-tile">
              <strong>LLM</strong>
              <div className="muted">
                {settings.llm_provider} · {settings.llm_model} · mock_mode={String(settings.mock_mode)}
              </div>
              <div className="muted">Store: {settings.store_path}</div>
            </div>
            <div className="bento-tile bento-wide">
              <strong>Allowed origins</strong>
              <div className="muted">{settings.allowed_origins.join(', ')}</div>
            </div>
          </div>
          {(settings.jwt_issuer || settings.jwt_audience || settings.jwt_jwks_url || settings.jwt_roles_claim) && (
            <div className="card" style={{ padding: 12, boxShadow: 'none' }}>
              <strong>JWT</strong>
              <div className="muted">Issuer: {settings.jwt_issuer || '(unset)'}</div>
              <div className="muted">Audience: {settings.jwt_audience || '(unset)'}</div>
              <div className="muted">JWKS URL: {settings.jwt_jwks_url || '(derived)'}</div>
              <div className="muted">Roles claim: {settings.jwt_roles_claim || '(auto)'} </div>
            </div>
          )}
        </section>
      )}

      {audit && (
        <section className="card grid">
          <h3 style={{ margin: 0 }}>Recent activity</h3>
          <div className="bento-grid">
            <div className="bento-tile">
              <strong>Versions</strong>
              <div className="muted">{audit.recent_versions.length} recent</div>
            </div>
            <div className="bento-tile">
              <strong>Feedback</strong>
              <div className="muted">{audit.recent_feedback.length} recent</div>
            </div>
            <div className="bento-tile bento-wide">
              <strong>Recent versions</strong>
              {audit.recent_versions.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  None
                </p>
              ) : (
                <ul style={{ margin: 0 }}>
                  {audit.recent_versions.slice(0, 10).map((v, idx) => (
                    <li key={String(v.version_id || v.trace_id || v.assessment_id || idx)}>
                      {String(v.assessment_id || '')} · v{String(v.version_number || '')} · {String(v.resolved_mode || '')} ·{' '}
                      {String(v.llm_model || '')} · trace {String(v.trace_id || '')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default AdminSettingsAudit;
