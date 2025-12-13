import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Header from './components/Header';
import Landing from './components/Landing';
import ProjectDashboard from './components/ProjectDashboard';
import AssessmentWizard from './components/Wizard/AssessmentWizard';
import ResultsViewer from './components/Results/ResultsViewer';
import EvalPage from './components/Eval/EvalPage';
import { Mode, analyzeRisk, RiskRequest, RiskResponse } from './services/api';

type AuthContext = {
  isAuthenticated: boolean;
  isLoading: boolean;
  userName?: string;
  login: () => void;
  signUp?: () => void;
  logout?: () => void;
  authDisabled?: boolean;
};

type AppShellProps = {
  auth: AuthContext;
};

type View = 'landing' | 'demo' | 'eval';

function AppShell({ auth }: AppShellProps) {
  const [result, setResult] = useState<RiskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('auto');
  const [llmModel, setLlmModel] = useState<string>('gpt-4o-mini');
  const [view, setView] = useState<View>('landing');
  const openAiModels = [
    'gpt-5',
    'gpt-5-mini',
    'gpt-5.1',
    'gpt-5.1-mini',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-3.5-turbo',
  ];

  const { isAuthenticated, isLoading, login, signUp, logout, userName, authDisabled } = auth;
  const displayName = userName || 'User';

  const resetResults = () => {
    setResult(null);
    setError(null);
  };

  useEffect(() => {
    const handlePopState = () => setView('landing');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (view !== 'landing') {
      window.history.pushState({ view }, '', window.location.href);
    }
  }, [view]);

  const startDemoOrLogin = () => {
    if (isAuthenticated || authDisabled) {
      resetResults();
      setView('demo');
    } else {
      login();
    }
  };

  const startEvalOrLogin = () => {
    if (isAuthenticated || authDisabled) {
      setView('eval');
    } else {
      login();
    }
  };

  const handleSubmit = async (payload: RiskRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await analyzeRisk(payload, mode, mode === 'live' ? llmModel : undefined);
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

  const handleHeaderStart = () => startDemoOrLogin();
  const handleBodyStart = () => startDemoOrLogin();
  const handleEvalStart = () => startEvalOrLogin();

  const handleLogout = () => {
    setView('landing');
    if (!authDisabled && logout) {
      logout();
    }
  };

  if (view === 'landing') {
    return (
      <Landing
        onHeaderStart={handleHeaderStart}
        onBodyStart={handleBodyStart}
        onEvalStart={handleEvalStart}
        onLogin={isAuthenticated || authDisabled ? handleHeaderStart : () => login()}
        onSignup={
          isAuthenticated || authDisabled
            ? undefined
            : () => (signUp ? signUp() : login())
        }
        onLogout={isAuthenticated && !authDisabled ? handleLogout : undefined}
        isAuthenticated={isAuthenticated || authDisabled}
        userName={isAuthenticated || authDisabled ? displayName : undefined}
      />
    );
  }

  if (view === 'eval') {
    return (
      <div className="app-shell">
        <Header
          title="Eval - Oasis Risk PoC"
          isAuthenticated={isAuthenticated || authDisabled}
          onLogin={!isAuthenticated && !authDisabled ? () => login() : undefined}
          userName={displayName}
          onLogout={isAuthenticated && !authDisabled ? handleLogout : undefined}
        />
        <EvalPage onBack={() => setView('landing')} />
      </div>
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <strong>Mode:</strong>
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
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={() => setView('landing')}
            disabled={loading}
            style={{ whiteSpace: 'nowrap' }}
          >
            Back to landing
          </button>
        </div>
        {mode === 'live' && (
          <div style={{ marginTop: 12 }}>
            <label htmlFor="llmModel">
              <strong style={{ marginRight: 8 }}>Model:</strong>
            </label>
            <select
              id="llmModel"
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              disabled={loading}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db' }}
            >
              {openAiModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Mock uses canned responses; Live calls the configured LLM; Auto defers to backend setting.
        </p>
      </div>
      <div className="grid two">
        <div className="grid">
          <ProjectDashboard result={result} loading={loading} />
          <AssessmentWizard onSubmit={handleSubmit} onReset={resetResults} loading={loading} />
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
  const connection = import.meta.env.VITE_AUTH0_CONNECTION;
  const loginParams = connection ? { authorizationParams: { connection } } : undefined;
  const auth: AuthContext = {
    isAuthenticated,
    isLoading,
    userName: user?.name || user?.email || 'User',
    login: () => loginWithRedirect(loginParams),
    signUp: () =>
      loginWithRedirect({
        authorizationParams: {
          ...(connection ? { connection } : {}),
          screen_hint: 'signup',
          prompt: 'login',
        },
      }),
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
    signUp: () => {},
    logout: undefined,
    authDisabled: true,
  };
  return <AppShell auth={auth} />;
}

export { AppNoAuth, AppWithAuth0 };
export default AppWithAuth0;
