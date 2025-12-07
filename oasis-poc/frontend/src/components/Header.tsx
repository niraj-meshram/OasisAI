type Props = {
  isAuthenticated?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
  userName?: string;
};

function Header({ isAuthenticated, onLogin, onLogout, userName }: Props) {
  return (
    <header className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <h1 style={{ margin: '0 0 4px 0' }}>Oasis Risk PoC</h1>
        <p className="muted" style={{ margin: 0 }}>
          Prompt-templated LLM for risk narratives, registers, mitigations, and KPIs.
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {userName && <div className="pill">Signed in as {userName}</div>}
        <div className="pill">PoC</div>
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
