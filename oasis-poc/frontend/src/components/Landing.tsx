type Props = {
  onOpenAnalyst: () => void;
  onOpenReviewer: () => void;
  onOpenAdminTemplates: () => void;
  onOpenAdminSettings: () => void;
  onEvalStart: () => void;
  canAnalyst: boolean;
  canReviewer: boolean;
  canAdmin: boolean;
  onLogin?: () => void;
  onSignup?: () => void;
  onLogout?: () => void;
  isAuthenticated?: boolean;
  userName?: string;
  roles?: string[];
  error?: string | null;
  onDismissError?: () => void;
};

function Landing({
  onOpenAnalyst,
  onOpenReviewer,
  onOpenAdminTemplates,
  onOpenAdminSettings,
  onEvalStart,
  canAnalyst,
  canReviewer,
  canAdmin,
  onLogin,
  onSignup,
  onLogout,
  isAuthenticated,
  userName,
  roles,
  error,
  onDismissError,
}: Props) {
  return (
    <div className="landing">
      <div className="bg-layer sky" />
      <div className="bg-layer aurora" />
      <div className="bg-layer ridge" />
      <div className="bg-layer canyon" />
      <div className="bg-layer buffalo" />
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="landing-shell flex min-h-screen items-center justify-center">
        <div className="landing-topbar">
          <div className="runway-header">
            <div className="logo-lockup">
              <span className="logo-glyph" aria-hidden />
              <span className="logo-text">oasis.ai</span>
              {isAuthenticated && userName && <span className="pill">Signed in as {userName}</span>}
              {isAuthenticated && roles && roles.length > 0 && <span className="pill">Roles: {roles.join(', ')}</span>}
            </div>
            <nav className="runway-nav" aria-label="Primary">
              <a className="rw-eyebrow" href="#research">
                Research
              </a>
              <a className="rw-eyebrow" href="#product">
                Product
              </a>
              <a className="rw-eyebrow" href="#studios">
                Studios
              </a>
              <a className="rw-eyebrow" href="#company">
                Company
              </a>
            </nav>
            <div className="runway-actions">
              {isAuthenticated && onLogout ? (
                <button className="rw-cta" type="button" onClick={onLogout}>
                  Log out
                </button>
              ) : (
                <>
                  <button className="rw-cta ghost" type="button" onClick={onLogin || onOpenAnalyst}>
                    Log in
                  </button>
                  <button className="rw-cta ghost" type="button" onClick={onSignup || onOpenAnalyst}>
                    Sign up
                  </button>
                </>
              )}
              <button className="rw-cta solid" type="button" onClick={onOpenAnalyst}>
                Get started
              </button>
              <div
                className="runway-menu"
                role="button"
                tabIndex={0}
                aria-label={isAuthenticated ? 'Continue to app' : 'Open menu'}
                onClick={onOpenAnalyst}
              >
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
        <div className="card ai-wizard-card" style={{ width: 'min(1280px, 100%)' }}>
          {error && (
            <div className="card" role="alert" style={{ padding: 12, boxShadow: 'none', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>Error: {error}</div>
                {onDismissError && (
                  <button className="button secondary pill" type="button" onClick={onDismissError}>
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="ai-wizard-header">
            <h2>🧙 AI Wizard 🪄</h2>
          </div>
          <div className="bento-grid">
            <button className="bento-tile" type="button" onClick={onOpenAnalyst} disabled={!canAnalyst}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>New Assessment Wizard</h3>
                <span className="pill">Risk Analyst</span>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                Create assessments, generate outputs, and export artifacts.
              </p>
            </button>

            <button className="bento-tile" type="button" onClick={onOpenReviewer} disabled={!canReviewer}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Results Viewer</h3>
                <span className="pill">Reviewer</span>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                Inspect provenance, compare versions, and provide feedback.
              </p>
            </button>

            <button className="bento-tile" type="button" onClick={onOpenAdminTemplates} disabled={!canAdmin}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Prompt Templates Manager</h3>
                <span className="pill">Admin</span>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                Create/version/test system prompt variants.
              </p>
            </button>

            <button className="bento-tile" type="button" onClick={onOpenAdminSettings} disabled={!canAdmin}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Settings & Audit Logs</h3>
                <span className="pill">Admin</span>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                View sanitized settings plus recent versions/feedback.
              </p>
            </button>

            <button className="bento-tile bento-wide" type="button" onClick={onEvalStart}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Evaluation Harness</h3>
                <span className="pill">PoC</span>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                Run scenario-based evals (mock/live) and download SME scorecards.
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Landing;
