import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Header from './components/Header';
import Landing from './components/Landing';
import ProjectDashboard from './components/ProjectDashboard';
import AssessmentWizard from './components/Wizard/AssessmentWizard';
import ResultsViewer from './components/Results/ResultsViewer';
import { Mode, analyzeRisk, RiskRequest, RiskResponse } from './services/api';

type AuthContext = {
  isAuthenticated: boolean;
  isLoading: boolean;
  userName?: string;
  login: () => void;
  logout?: () => void;
  authDisabled?: boolean;
};

type AppShellProps = {
  auth: AuthContext;
};

function AppShell({ auth }: AppShellProps) {
  const [result, setResult] = useState<RiskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('auto');
  const [hasStarted, setHasStarted] = useState(false);

  const { isAuthenticated, isLoading, login, logout, userName, authDisabled } = auth;
  const displayName = userName || 'User';

  useEffect(() => {
    const handlePopState = () => setHasStarted(false);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (hasStarted) {
      window.history.pushState({ hasStarted: true }, '', window.location.href);
    }
  }, [hasStarted]);

  const startOrLogin = () => {
    if (isAuthenticated || authDisabled) {
      setHasStarted(true);
    } else {
      login();
    }
  };

  const handleSubmit = async (payload: RiskRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await analyzeRisk(payload, mode);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="landing">
        <div className="landing-shell flex min-h-screen items-center justify-center">
          <div className="card" style={{ minWidth: 260, textAlign: 'center' }}>
            <p style={{ margin: 0 }}>Checking login...</p>
          </div>
        </div>
      </div>
    );
  }

  const handleHeaderStart = () => startOrLogin();
  const handleBodyStart = () => setHasStarted(true);

  const handleLogout = () => {
    setHasStarted(false);
    if (!authDisabled && logout) {
      logout();
    }
  };

  if (!hasStarted) {
    return (
      <Landing
        onHeaderStart={handleHeaderStart}
        onBodyStart={handleBodyStart}
        onLogin={isAuthenticated || authDisabled ? handleHeaderStart : () => login()}
        onLogout={isAuthenticated && !authDisabled ? handleLogout : undefined}
        isAuthenticated={isAuthenticated || authDisabled}
        userName={isAuthenticated || authDisabled ? displayName : undefined}
      />
    );
  }

  return (
    <div className="app-shell">
      <Header
        isAuthenticated={isAuthenticated || authDisabled}
        onLogin={!isAuthenticated && !authDisabled ? () => login() : undefined}
        userName={displayName}
        onLogout={isAuthenticated && !authDisabled ? handleLogout : undefined}
      />
      <div className="card" style={{ margin: '16px 0' }}>
        <strong style={{ marginRight: 12 }}>Mode:</strong>
        <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`button ${mode === 'mock' ? '' : 'secondary'}`}
            onClick={() => setMode('mock')}
            disabled={loading}
          >
            Mock (offline)
          </button>
          <button
            type="button"
            className={`button ${mode === 'live' ? '' : 'secondary'}`}
            onClick={() => setMode('live')}
            disabled={loading}
          >
            Live LLM
          </button>
          <button
            type="button"
            className={`button ${mode === 'auto' ? '' : 'secondary'}`}
            onClick={() => setMode('auto')}
            disabled={loading}
          >
            Auto (backend default)
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Mock uses canned responses; Live calls the configured LLM; Auto defers to backend setting.
        </p>
      </div>
      <div className="grid two">
        <div className="grid">
          <ProjectDashboard result={result} loading={loading} />
          <AssessmentWizard onSubmit={handleSubmit} loading={loading} />
          {error && <div className="card" role="alert">Error: {error}</div>}
        </div>
        <ResultsViewer result={result} loading={loading} />
      </div>
    </div>
  );
}

function AppWithAuth0() {
  const { isAuthenticated, isLoading, loginWithRedirect, logout, user } = useAuth0();
  const logoutReturnTo = import.meta.env.VITE_AUTH0_LOGOUT_URI || window.location.origin;
  const auth: AuthContext = {
    isAuthenticated,
    isLoading,
    userName: user?.name || user?.email || 'User',
    login: () => loginWithRedirect(),
    logout: () => logout({ logoutParams: { returnTo: logoutReturnTo } }),
  };
  return <AppShell auth={auth} />;
}

function AppNoAuth() {
  const auth: AuthContext = {
    isAuthenticated: true,
    isLoading: false,
    userName: 'Demo user',
    login: () => {},
    logout: undefined,
    authDisabled: true,
  };
  return <AppShell auth={auth} />;
}

export { AppNoAuth, AppWithAuth0 };
export default AppWithAuth0;
