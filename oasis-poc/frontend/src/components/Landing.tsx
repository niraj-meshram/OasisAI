type Props = {
  onHeaderStart: () => void;
  onBodyStart: () => void;
  onLogin?: () => void;
  onLogout?: () => void;
  isAuthenticated?: boolean;
  userName?: string;
};

function Landing({ onHeaderStart, onBodyStart, onLogin, onLogout, isAuthenticated, userName }: Props) {
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
                <button className="rw-cta ghost" type="button" onClick={onLogin || onHeaderStart}>
                  Log in
                </button>
              )}
              <button className="rw-cta solid" type="button" onClick={onHeaderStart}>
                Get started
              </button>
              <div
                className="runway-menu"
                role="button"
                tabIndex={0}
                aria-label={isAuthenticated ? 'Continue to app' : 'Open menu'}
                onClick={onHeaderStart}
              >
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
        <button className="button" type="button" onClick={onBodyStart}>
          Demo
        </button>
      </div>
    </div>
  );
}

export default Landing;
