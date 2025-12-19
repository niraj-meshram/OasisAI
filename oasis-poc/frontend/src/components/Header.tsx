type Props = {
  title?: string;
  onBack?: () => void;
  backLabel?: string;
  isAuthenticated?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
  userName?: string;
  roles?: string[];
};

function Header({
  title = 'Oasis Risk PoC',
  onBack,
  backLabel = 'Back',
  isAuthenticated,
  onLogin,
  onLogout,
  userName,
  roles,
}: Props) {
  return (
    <header className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <h1 style={{ margin: '0 0 4px 0' }}>{title}</h1>
        <p className="muted" style={{ margin: 0 }}>
          Prompt-templated LLM for risk narratives, registers, mitigations, and KPIs.
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onBack && (
          <button className="button secondary pill" type="button" onClick={onBack}>
            {backLabel}
          </button>
        )}
        {userName && <div className="pill">Signed in as {userName}</div>}
        {roles && roles.length > 0 && <div className="pill">Roles: {roles.join(', ')}</div>}
        {!isAuthenticated && onLogin && (
          <button className="button secondary pill" type="button" onClick={onLogin}>
            Log in
          </button>
        )}
        {isAuthenticated && onLogout && (
          <button className="button secondary pill" type="button" onClick={onLogout}>
            Log out
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;
