import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Header from './components/Header';
import Landing from './components/Landing';
import ProjectDashboard from './components/ProjectDashboard';
import AssessmentWizard from './components/Wizard/AssessmentWizard';
import PromptTemplatesManager from './components/Admin/PromptTemplatesManager';
import AdminSettingsAudit from './components/Admin/AdminSettingsAudit';
import ReviewPanel from './components/ReviewPanel';
import ComparePanel from './components/ComparePanel';
import ResultsViewer from './components/Results/ResultsViewer';
import EvalPage from './components/Eval/EvalPage';
import {
  Assessment,
  AssessmentSummary,
  AssessmentVersion,
  AssessmentVersionSummary,
  createAssessment,
  createProject,
  getAssessment,
  getAssessmentVersion,
  listAssessments,
  listAssessmentVersions,
  listProjects,
  listPromptVariants,
  Mode,
  Project,
  RiskRequest,
  runAssessment,
  setAuthToken,
  setUserRoleHeader,
} from './services/api';

type AuthContext = {
  isAuthenticated: boolean;
  isLoading: boolean;
  userName?: string;
  roles: string[];
  authError?: string | null;
  login: () => Promise<void> | void;
  signUp?: () => Promise<void> | void;
  logout?: () => void;
  getToken?: () => Promise<string | null>;
  authDisabled?: boolean;
};

type AppShellProps = {
  auth: AuthContext;
};

type View = 'landing' | 'analyst' | 'reviewer' | 'adminTemplates' | 'adminSettings' | 'eval';

function AppShell({ auth }: AppShellProps) {
  const POLICY_ACK_KEY = 'oasis_public_data_ack_v1';
  const [policyAck, setPolicyAck] = useState<boolean>(() => {
    try {
      return localStorage.getItem(POLICY_ACK_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authProviderError, setAuthProviderError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('auto');
  const [llmModel, setLlmModel] = useState<string>('gpt-4o-mini');
  const [availablePromptVariants, setAvailablePromptVariants] = useState<string[]>(['default']);
  const [promptVariant, setPromptVariant] = useState<string>('default');
  const [view, setView] = useState<View>('landing');

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [versions, setVersions] = useState<AssessmentVersionSummary[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<AssessmentVersion | null>(null);
  const [creatingNewAssessment, setCreatingNewAssessment] = useState(false);
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

  const { isAuthenticated, isLoading, login, signUp, logout, userName, authDisabled, roles, getToken, authError } =
    auth;
  const displayName = userName || 'User';
  const displayedError = error || authProviderError;

  const normalizeRole = (value: string): 'admin' | 'analyst' | 'reviewer' | null => {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
    if (!normalized) return null;
    if (['admin', 'administrator', 'governance'].includes(normalized) || normalized.includes('admin')) return 'admin';
    if (['analyst', 'riskanalyst'].includes(normalized) || normalized.includes('analyst')) return 'analyst';
    if (['reviewer', 'qc'].includes(normalized) || normalized.includes('review') || normalized.includes('qc')) return 'reviewer';
    return null;
  };

  const roleSet = new Set((roles || []).map(normalizeRole).filter(Boolean) as Array<'admin' | 'analyst' | 'reviewer'>);
  const isAdmin = roleSet.has('admin');
  const isAnalyst = isAdmin || roleSet.has('analyst');
  const isReviewer = isAdmin || roleSet.has('reviewer');
  const canCreateProject = isAnalyst;
  const canCreateAssessment = isAnalyst;
  const canRunAssessment = isAnalyst;
  const canSubmitFeedback = isReviewer;
  const canViewAdmin = isAdmin;

  useEffect(() => {
    setUserRoleHeader(Array.from(roleSet).join(','));
  }, [Array.from(roleSet).sort().join(',')]);

  useEffect(() => {
    if (authError) {
      setAuthProviderError(authError);
    } else {
      setAuthProviderError(null);
    }
  }, [authError]);

  const handleLogin = () => {
    setError(null);
    setAuthProviderError(null);
    if (import.meta.env.DEV) {
      console.info('Login clicked', { isAuthenticated, authDisabled });
    }
    try {
      void Promise.resolve(login()).catch((err) => {
        setError(err instanceof Error ? err.message : 'Login failed.');
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    }
  };

  const handleSignup = () => {
    setError(null);
    setAuthProviderError(null);
    if (import.meta.env.DEV) {
      console.info('Signup clicked', { isAuthenticated, authDisabled });
    }
    if (!signUp) {
      handleLogin();
      return;
    }
    try {
      void Promise.resolve(signUp()).catch((err) => {
        setError(err instanceof Error ? err.message : 'Signup failed.');
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed.');
    }
  };

  const withAuth = async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (!authDisabled && getToken) {
      try {
        const token = await getToken();
        setAuthToken(token);
      } catch {
        setAuthToken(null);
      }
    } else {
      setAuthToken(null);
    }
    return fn();
  };

  useEffect(() => {
    if (authDisabled || !getToken) {
      setAuthToken(null);
      return;
    }
    if (view === 'landing') {
      setAuthToken(null);
      return;
    }

    let cancelled = false;
    getToken()
      .then((token) => {
        if (!cancelled) setAuthToken(token);
      })
      .catch(() => {
        if (!cancelled) setAuthToken(null);
      });
    return () => {
      cancelled = true;
    };
  }, [view, authDisabled, getToken]);

  const resetWorkspaceSelection = () => {
    setError(null);
    setAuthProviderError(null);
    setSelectedAssessmentId(null);
    setSelectedAssessment(null);
    setVersions([]);
    setSelectedVersionId(null);
    setSelectedVersion(null);
    setCreatingNewAssessment(true);
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

  useEffect(() => {
    const isWorkspaceView = view === 'analyst' || view === 'reviewer';
    if (!isWorkspaceView) return;
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const variants = await withAuth(() => listPromptVariants()).catch(() => ['default']);
        if (!cancelled && variants.length > 0) {
          setAvailablePromptVariants(variants);
          if (!variants.includes(promptVariant)) setPromptVariant('default');
        }

        let ps = await withAuth(() => listProjects());
        if (ps.length === 0) {
          if (canCreateProject) {
            const created = await withAuth(() =>
              createProject({
                name: 'Default Project',
                description: 'Persisted PoC workspace (public data only).',
              }),
            );
            ps = [created];
          } else {
            throw new Error('No projects available for your role.');
          }
        }

        if (cancelled) return;
        setProjects(ps);
        setSelectedProjectId((prev) => (prev && ps.some((p) => p.project_id === prev) ? prev : ps[0].project_id));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialize demo data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, canCreateProject]);

  useEffect(() => {
    const isWorkspaceView = view === 'analyst' || view === 'reviewer';
    if (!isWorkspaceView || !selectedProjectId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const items = await withAuth(() => listAssessments(selectedProjectId));
        if (!cancelled) setAssessments(items);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load assessments.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [view, selectedProjectId]);

  useEffect(() => {
    const isWorkspaceView = view === 'analyst' || view === 'reviewer';
    if (!isWorkspaceView) return;
    if (creatingNewAssessment) return;
    if (selectedAssessmentId && assessments.some((a) => a.assessment_id === selectedAssessmentId)) return;
    if (assessments.length > 0) setSelectedAssessmentId(assessments[0].assessment_id);
  }, [view, creatingNewAssessment, selectedAssessmentId, assessments]);

  useEffect(() => {
    const isWorkspaceView = view === 'analyst' || view === 'reviewer';
    if (!isWorkspaceView) return;
    if (!selectedAssessmentId) {
      setSelectedAssessment(null);
      setVersions([]);
      setSelectedVersionId(null);
      setSelectedVersion(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [a, vs] = await Promise.all([
          withAuth(() => getAssessment(selectedAssessmentId)),
          withAuth(() => listAssessmentVersions(selectedAssessmentId)),
        ]);
        if (cancelled) return;
        setSelectedAssessment(a);
        setVersions(vs);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load assessment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [view, selectedAssessmentId]);

  useEffect(() => {
    const isWorkspaceView = view === 'analyst' || view === 'reviewer';
    if (!isWorkspaceView) return;
    if (!selectedAssessmentId) return;
    if (selectedVersionId && versions.some((v) => v.version_id === selectedVersionId)) return;
    if (versions.length > 0) setSelectedVersionId(versions[0].version_id);
  }, [view, selectedAssessmentId, selectedVersionId, versions]);

  useEffect(() => {
    const isWorkspaceView = view === 'analyst' || view === 'reviewer';
    if (!isWorkspaceView) return;
    if (!selectedAssessmentId || !selectedVersionId) return;
    if (selectedVersion && selectedVersion.version_id === selectedVersionId) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const v = await withAuth(() => getAssessmentVersion(selectedAssessmentId, selectedVersionId));
        if (!cancelled) setSelectedVersion(v);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load version.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [view, selectedAssessmentId, selectedVersionId, selectedVersion]);

  const goToAnalyst = () => {
    if (isAuthenticated || authDisabled) {
      resetWorkspaceSelection();
      if (isAnalyst) {
        setView('analyst');
      } else if (isReviewer) {
        setCreatingNewAssessment(false);
        setView('reviewer');
      } else if (canViewAdmin) {
        setView('adminSettings');
      } else {
        setError('No role assigned for this user.');
        setView('landing');
      }
    } else {
      handleLogin();
    }
  };

  const goToReviewer = () => {
    if (isAuthenticated || authDisabled) {
      resetWorkspaceSelection();
      setCreatingNewAssessment(false);
      setView('reviewer');
    } else {
      handleLogin();
    }
  };

  const goToAdminTemplates = () => {
    if (!canViewAdmin) return;
    if (isAuthenticated || authDisabled) {
      setView('adminTemplates');
    } else {
      handleLogin();
    }
  };

  const goToAdminSettings = () => {
    if (!canViewAdmin) return;
    if (isAuthenticated || authDisabled) {
      setView('adminSettings');
    } else {
      handleLogin();
    }
  };

  const startEvalOrLogin = () => {
    if (isAuthenticated || authDisabled) {
      setView('eval');
    } else {
      handleLogin();
    }
  };

  const handleSubmit = async (payload: RiskRequest, templateId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      if (!selectedProjectId) {
        throw new Error('No project selected.');
      }
      if (!canRunAssessment) {
        throw new Error('Your role cannot generate assessments.');
      }

      let assessmentId = selectedAssessmentId;
      if (!assessmentId || creatingNewAssessment) {
        if (!canCreateAssessment) {
          throw new Error('Your role cannot create new assessments.');
        }
        const derivedTitle = `${payload.risk_domain}: ${payload.business_type}`.slice(0, 200);
        const created = await withAuth(() =>
          createAssessment(selectedProjectId, {
            title: derivedTitle,
            template_id: templateId,
            payload,
          }),
        );
        assessmentId = created.assessment_id;
        setSelectedAssessmentId(assessmentId);
        setCreatingNewAssessment(false);
      }

      const version = await withAuth(() =>
        runAssessment(
          assessmentId,
          payload,
          mode,
          mode === 'live' ? llmModel : undefined,
          promptVariant,
          payload.rag_enabled,
        ),
      );
      setSelectedVersion(version);
      setSelectedVersionId(version.version_id);

      const [updatedAssessments, updatedVersions] = await Promise.all([
        withAuth(() => listAssessments(selectedProjectId)),
        withAuth(() => listAssessmentVersions(assessmentId)),
      ]);
      setAssessments(updatedAssessments);
      setVersions(updatedVersions);
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

  const handleEvalStart = () => startEvalOrLogin();

  const handleLogout = () => {
    setView('landing');
    setAuthToken(null);
    setError(null);
    setAuthProviderError(null);
    if (!authDisabled && logout) {
      logout();
    }
  };

  if (view === 'landing') {
    return (
      <Landing
        onOpenAnalyst={goToAnalyst}
        onOpenReviewer={goToReviewer}
        onOpenAdminTemplates={goToAdminTemplates}
        onOpenAdminSettings={goToAdminSettings}
        onEvalStart={handleEvalStart}
        canAnalyst={isAnalyst}
        canReviewer={isReviewer || isAnalyst}
        canAdmin={canViewAdmin}
        onLogin={isAuthenticated || authDisabled ? goToAnalyst : handleLogin}
        onSignup={isAuthenticated || authDisabled ? undefined : handleSignup}
        onLogout={isAuthenticated && !authDisabled ? handleLogout : undefined}
        isAuthenticated={isAuthenticated || authDisabled}
        userName={isAuthenticated || authDisabled ? displayName : undefined}
        roles={isAuthenticated || authDisabled ? roles : undefined}
        error={displayedError}
        onDismissError={() => {
          setError(null);
          setAuthProviderError(null);
        }}
      />
    );
  }

  if (view === 'eval') {
    return (
      <div className="app-shell">
        <Header
          title="Eval - Oasis Risk PoC"
          isAuthenticated={isAuthenticated || authDisabled}
          onLogin={!isAuthenticated && !authDisabled ? handleLogin : undefined}
          userName={displayName}
          roles={isAuthenticated || authDisabled ? roles : undefined}
          onLogout={isAuthenticated && !authDisabled ? handleLogout : undefined}
        />
        <EvalPage onBack={() => setView('landing')} />
      </div>
    );
  }

  if (view === 'adminTemplates') {
    return (
      <div className="app-shell">
        <Header
          title="Admin - Prompt Templates"
          onBack={() => setView('landing')}
          backLabel="Home"
          isAuthenticated={isAuthenticated || authDisabled}
          onLogin={!isAuthenticated && !authDisabled ? handleLogin : undefined}
          userName={displayName}
          roles={isAuthenticated || authDisabled ? roles : undefined}
          onLogout={isAuthenticated && !authDisabled ? handleLogout : undefined}
        />
        {!canViewAdmin ? (
          <div className="card" role="alert">
            Not authorized for admin pages.
          </div>
        ) : (
          <PromptTemplatesManager llmModels={openAiModels} />
        )}
      </div>
    );
  }

  if (view === 'adminSettings') {
    return (
      <div className="app-shell">
        <Header
          title="Admin - Settings & Audit Logs"
          onBack={() => setView('landing')}
          backLabel="Home"
          isAuthenticated={isAuthenticated || authDisabled}
          onLogin={!isAuthenticated && !authDisabled ? handleLogin : undefined}
          userName={displayName}
          roles={isAuthenticated || authDisabled ? roles : undefined}
          onLogout={isAuthenticated && !authDisabled ? handleLogout : undefined}
        />
        {!canViewAdmin ? (
          <div className="card" role="alert">
            Not authorized for admin pages.
          </div>
        ) : (
          <AdminSettingsAudit />
        )}
      </div>
    );
  }

  const workspaceTitle = view === 'reviewer' ? 'Reviewer - Oasis Risk PoC' : 'Risk Analyst - Oasis Risk PoC';

  return (
    <div className="app-shell">
      <Header
        title={workspaceTitle}
        onBack={() => setView('landing')}
        backLabel="Home"
        isAuthenticated={isAuthenticated || authDisabled}
        onLogin={!isAuthenticated && !authDisabled ? handleLogin : undefined}
        userName={displayName}
        roles={isAuthenticated || authDisabled ? roles : undefined}
        onLogout={isAuthenticated && !authDisabled ? handleLogout : undefined}
      />
      {!policyAck && (view === 'analyst' || view === 'reviewer') && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Public data acknowledgment">
          <div className="modal-panel">
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Public data only</h2>
              <span className="pill">Required</span>
            </div>
            <div className="modal-body">
              <p className="muted" style={{ marginTop: 0 }}>
                This PoC is restricted to public/industry knowledge. Do not enter corporate data, confidential
                information, or PII/PHI. The backend blocks obvious sensitive markers, but you remain responsible for
                the data you paste.
              </p>
              <ul style={{ marginTop: 0 }}>
                <li>Use anonymized, public context only</li>
                <li>No customer identifiers, account numbers, SSNs, or employee data</li>
                <li>No internal incident details or non-public controls/architecture</li>
              </ul>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.setItem(POLICY_ACK_KEY, 'true');
                    } catch {
                      // ignore storage failures
                    }
                    setPolicyAck(true);
                  }}
                >
                  I acknowledge
                </button>
                <button className="button secondary" type="button" onClick={() => setView('landing')}>
                  Back to landing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {view === 'analyst' && (
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
        <div style={{ marginTop: 12 }}>
          <label htmlFor="promptVariant">
            <strong style={{ marginRight: 8 }}>Prompt:</strong>
          </label>
          <select
            id="promptVariant"
            value={promptVariant}
            onChange={(e) => setPromptVariant(e.target.value)}
            disabled={loading}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db' }}
          >
            {availablePromptVariants.map((variant) => (
              <option key={variant} value={variant}>
                {variant}
              </option>
            ))}
          </select>
        </div>
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Mock uses canned responses; Live calls the configured LLM; Auto defers to backend setting.
        </p>
      </div>
      )}
      <div className="grid two">
        <div className="grid">
          <ProjectDashboard
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={(projectId) => {
              setSelectedProjectId(projectId);
              setError(null);
              setCreatingNewAssessment(false);
              setSelectedAssessmentId(null);
              setSelectedAssessment(null);
              setVersions([]);
              setSelectedVersionId(null);
              setSelectedVersion(null);
            }}
            assessments={assessments}
            selectedAssessmentId={selectedAssessmentId}
            onSelectAssessment={(assessmentId) => {
              setError(null);
              setCreatingNewAssessment(false);
              setSelectedAssessmentId(assessmentId);
              setSelectedVersionId(null);
              setSelectedVersion(null);
            }}
            onNewAssessment={() => resetWorkspaceSelection()}
            canCreateAssessment={canCreateAssessment}
            versions={versions}
            selectedVersionId={selectedVersionId}
            onSelectVersion={(versionId) => {
              setError(null);
              setSelectedVersionId(versionId);
            }}
            loading={loading}
          />
          {view === 'analyst' && (
            <AssessmentWizard
              onSubmit={handleSubmit}
              onReset={() => resetWorkspaceSelection()}
              loading={loading || !policyAck}
              initialForm={selectedAssessment?.payload}
              initialTemplateId={selectedAssessment?.template_id ?? null}
            />
          )}
          {displayedError && <div className="card" role="alert">Error: {displayedError}</div>}
        </div>
        <div className="grid">
          {view === 'reviewer' && (
            <ComparePanel
              assessmentId={selectedAssessmentId}
              versions={versions}
              loading={loading}
              fetchVersion={(assessmentId, versionId) => withAuth(() => getAssessmentVersion(assessmentId, versionId))}
            />
          )}
          <ReviewPanel
            assessmentId={selectedAssessmentId}
            version={selectedVersion}
            loading={loading}
            canSubmitFeedback={canSubmitFeedback}
          />
          <ResultsViewer result={selectedVersion ? selectedVersion.response : null} loading={loading} />
        </div>
      </div>
    </div>
  );
}

function AppWithAuth0() {
  const { isAuthenticated, isLoading, loginWithRedirect, logout, user, getAccessTokenSilently, error: auth0Error } =
    useAuth0();
  const logoutReturnTo = import.meta.env.VITE_AUTH0_LOGOUT_URI || window.location.origin;
  const connection = import.meta.env.VITE_AUTH0_CONNECTION;
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined;
  const redirectUri = import.meta.env.VITE_AUTH0_REDIRECT_URI || window.location.origin;
  const forcePromptLogin = import.meta.env.VITE_AUTH0_FORCE_PROMPT_LOGIN === 'true';

  const baseAuthorizationParams: Record<string, string> = {
    redirect_uri: redirectUri,
    ...(audience ? { audience } : {}),
    ...(connection ? { connection } : {}),
    ...(forcePromptLogin ? { prompt: 'login' } : {}),
  };
  const rolesClaim = import.meta.env.VITE_AUTH0_ROLES_CLAIM as string | undefined;
  const fallbackRole = (import.meta.env.VITE_DEFAULT_ROLE as string | undefined) || 'analyst';

  const rawUser = (user ?? undefined) as Record<string, unknown> | undefined;

  const coerceStringList = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      const result: string[] = [];
      for (const item of value) {
        if (typeof item === 'string') {
          result.push(item);
          continue;
        }
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          const name = record.name ?? record.role ?? record.value;
          if (typeof name === 'string') result.push(name);
        }
      }
      return result.map((v) => v.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const nested = coerceStringList(record.roles) || [];
      if (nested.length > 0) return nested;
      const groups = coerceStringList(record.groups) || [];
      if (groups.length > 0) return groups;
      const permissions = coerceStringList(record.permissions) || [];
      if (permissions.length > 0) return permissions;
    }
    return [];
  };

  const extractRolesFromClaims = (claims: Record<string, unknown>): string[] => {
    const candidates: unknown[] = [];
    if (rolesClaim) {
      const key = rolesClaim.trim();
      if (key) {
        candidates.push(claims[key]);

        const namespace = key.replace(/\/+$/, '');
        if (namespace) {
          candidates.push(claims[`${namespace}/roles`], claims[`${namespace}/groups`], claims[`${namespace}/permissions`]);
        }
      }
    }
    candidates.push(claims['https://oasis.ai/roles'], claims.roles, claims.groups, claims.permissions);

    // As a last resort, scan for common namespaced claim keys (Auth0 custom claims).
    for (const [k, v] of Object.entries(claims)) {
      if (k.endsWith('/roles') || k.endsWith('/groups') || k.endsWith('/permissions')) {
        candidates.push(v);
      }
    }

    for (const candidate of candidates) {
      const roles = coerceStringList(candidate);
      if (roles.length > 0) return roles;
    }
    return [];
  };

  const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const pad = '='.repeat((4 - (payload.length % 4)) % 4);
    const normalized = (payload + pad).replace(/-/g, '+').replace(/_/g, '/');

    try {
      const raw = atob(normalized);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) {
        bytes[i] = raw.charCodeAt(i);
      }
      const json = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(json) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  const [roles, setRoles] = useState<string[]>(() => {
    const extracted = rawUser ? extractRolesFromClaims(rawUser) : [];
    return extracted.length > 0 ? extracted : [fallbackRole];
  });

  useEffect(() => {
    const extractedFromUser = rawUser ? extractRolesFromClaims(rawUser) : [];
    if (extractedFromUser.length > 0) {
      if (import.meta.env.DEV) {
        console.info('Auth0 roles extracted from user claims', extractedFromUser);
      }
      setRoles(extractedFromUser);
      return;
    }

    if (!isAuthenticated || isLoading) {
      setRoles([fallbackRole]);
      return;
    }

    let cancelled = false;
    getAccessTokenSilently()
      .then((token) => {
        if (cancelled) return;
        const claims = decodeJwtPayload(token);
        const extracted = claims ? extractRolesFromClaims(claims) : [];
        if (extracted.length > 0) {
          if (import.meta.env.DEV) {
            console.info('Auth0 roles extracted from access token', extracted);
          }
          setRoles(extracted);
          return;
        }
        console.warn(
          `Auth0 roles claim not found (user+access token). Falling back to role='${fallbackRole}'. ` +
            'Set VITE_AUTH0_AUDIENCE and VITE_AUTH0_ROLES_CLAIM (and configure Auth0 to emit roles in the token).',
        );
        setRoles([fallbackRole]);
      })
      .catch(() => {
        if (!cancelled) setRoles([fallbackRole]);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, getAccessTokenSilently, user, rolesClaim, fallbackRole]);
  const auth: AuthContext = {
    isAuthenticated,
    isLoading,
    userName: user?.name || user?.email || 'User',
    roles,
    authError: auth0Error ? auth0Error.message : null,
    login: () => loginWithRedirect({ authorizationParams: baseAuthorizationParams }),
    signUp: () =>
      loginWithRedirect({
        authorizationParams: {
          ...baseAuthorizationParams,
          screen_hint: 'signup',
          prompt: 'login',
        },
      }),
    logout: () => logout({ logoutParams: { returnTo: logoutReturnTo } }),
    getToken: async () => {
      try {
        return await getAccessTokenSilently();
      } catch {
        return null;
      }
    },
  };
  return <AppShell auth={auth} />;
}

function AppNoAuth() {
  const demoRolesRaw = import.meta.env.VITE_DEMO_ROLES as string | undefined;
  const roles = demoRolesRaw
    ? demoRolesRaw
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : ['analyst'];
  const auth: AuthContext = {
    isAuthenticated: true,
    isLoading: false,
    userName: 'Demo user',
    roles,
    login: () => {},
    signUp: () => {},
    logout: undefined,
    authDisabled: true,
  };
  return <AppShell auth={auth} />;
}

export { AppNoAuth, AppWithAuth0 };
export default AppWithAuth0;
