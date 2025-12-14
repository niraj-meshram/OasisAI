export type Likelihood = 'Low' | 'Medium' | 'High';
export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';

export type PublicSourceType =
  | 'NIST'
  | 'ISO27001'
  | 'OWASP'
  | 'SEC'
  | 'INCIDENT_REPORT'
  | 'CVE'
  | 'DATASET'
  | 'OTHER';

export interface PublicReference {
  source_type: PublicSourceType;
  title: string;
  identifier?: string;
  url?: string;
  notes?: string;
}

export interface ControlFrameworkMapping {
  control_statement: string;
  framework: string;
  framework_control_id: string;
  framework_control_name?: string;
  mapping_rationale?: string;
  references: PublicReference[];
}

export type VulnerabilityType = 'CVE' | 'OWASP' | 'INCIDENT_REPORT' | 'DATASET' | 'OTHER';

export interface VulnerabilitySummary {
  vulnerability_type: VulnerabilityType;
  identifier?: string;
  title: string;
  summary: string;
  severity: Severity;
  cvss_v3_base_score?: number;
  references: PublicReference[];
}

export interface RiskRequest {
  business_type: string;
  risk_domain: string;
  scope?: string;
  time_horizon?: string;
  known_controls?: string[];
  rag_enabled?: boolean;
  verbosity?: 'concise' | 'standard' | 'detailed';
  language?: string;
  region?: string;
  size?: string;
  maturity?: string;
  objectives?: string;
  context?: string;
  constraints?: string;
  requested_outputs?: string;
  refinements?: string;
  control_tokens?: string[];
  instruction_tuning?: string;
}

export interface RiskItem {
  risk_id: string;
  risk_title: string;
  cause: string;
  impact: string;
  likelihood: Likelihood;
  inherent_rating: Likelihood;
  residual_rating: Likelihood;
  controls: string[];
  control_mappings: ControlFrameworkMapping[];
  mitigations: string[];
  kpis: string[];
  vulnerability_summaries: VulnerabilitySummary[];
  owner?: string;
  due_date?: string;
  assumptions: string[];
}

export interface RiskResponse {
  trace_id: string;
  summary: string;
  risks: RiskItem[];
  assumptions_gaps: string[];
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api/v1';
const APP_API_KEY = import.meta.env.VITE_APP_API_KEY;
let authToken: string | null = null;
let userRoleHeader: string | null = null;

export type Mode = 'auto' | 'mock' | 'live';
export type ResolvedMode = 'mock' | 'live';

export interface Project {
  project_id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  description?: string | null;
}

export interface AssessmentCreate {
  title: string;
  template_id?: string | null;
  payload: RiskRequest;
}

export interface Assessment {
  assessment_id: string;
  project_id: string;
  title: string;
  template_id?: string | null;
  created_at: string;
  updated_at: string;
  latest_version_id?: string | null;
  payload: RiskRequest;
}

export interface AssessmentSummary {
  assessment_id: string;
  project_id: string;
  title: string;
  template_id?: string | null;
  updated_at: string;
  latest_version_id?: string | null;
  latest_version_number?: number | null;
  latest_trace_id?: string | null;
}

export interface AssessmentVersionSummary {
  version_id: string;
  assessment_id: string;
  version_number: number;
  created_at: string;
  trace_id: string;
  mode: Mode;
  resolved_mode: ResolvedMode;
  llm_provider: string;
  llm_model: string;
  prompt_variant: string;
  rag_enabled?: boolean | null;
}

export interface AssessmentVersion extends AssessmentVersionSummary {
  system_prompt_sha256: string;
  user_prompt: string;
  request: RiskRequest;
  response: RiskResponse;
}

export interface FeedbackCreate {
  rating?: number | null;
  flags: string[];
  comment?: string | null;
  recommended_edits?: string | null;
  reviewer?: string | null;
}

export interface Feedback {
  feedback_id: string;
  assessment_id: string;
  version_id: string;
  created_at: string;
  rating?: number | null;
  flags: string[];
  comment?: string | null;
  recommended_edits?: string | null;
  reviewer?: string | null;
}

export type PromptTemplateSource = 'builtin' | 'store';

export interface PromptTemplateVersion {
  version: number;
  created_at: string;
  sha256: string;
  notes?: string | null;
}

export interface PromptTemplateSummary {
  name: string;
  source: PromptTemplateSource;
  managed: boolean;
  current_version?: number | null;
  updated_at?: string | null;
}

export interface PromptTemplateDetail extends PromptTemplateSummary {
  content: string;
  versions: PromptTemplateVersion[];
}

export interface PromptTemplateUpsert {
  name: string;
  content: string;
  notes?: string | null;
}

export interface PromptTemplateUpdate {
  content: string;
  notes?: string | null;
}

export interface PromptTemplateTestRunResponse {
  trace_id: string;
  system_prompt_sha256: string;
  user_prompt: string;
  response: RiskResponse;
}

export interface AdminSettings {
  mock_mode: boolean;
  llm_provider: string;
  llm_model: string;
  allowed_origins: string[];
  auth_mode: string;
  app_api_key_configured: boolean;
  jwt_issuer?: string | null;
  jwt_audience?: string | null;
  jwt_jwks_url?: string | null;
  jwt_roles_claim?: string | null;
  store_path: string;
}

export interface AuditSnapshot {
  recent_versions: Record<string, unknown>[];
  recent_feedback: Record<string, unknown>[];
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (APP_API_KEY) headers['x-api-key'] = APP_API_KEY;
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (userRoleHeader) headers['x-user-role'] = userRoleHeader;
  return headers;
}

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUserRoleHeader(value: string | null) {
  userRoleHeader = value;
}

async function parseError(res: Response): Promise<string> {
  const rawBody = await res.text();
  let bodyMessage = rawBody;
  try {
    const parsed = JSON.parse(rawBody) as { detail?: string };
    if (parsed && typeof parsed === 'object' && typeof parsed.detail === 'string') {
      bodyMessage = parsed.detail;
    }
  } catch {
    // ignore JSON parse errors
  }
  return (
    bodyMessage ||
    (res.status === 401
      ? 'Unauthorized: API key missing or invalid. Set VITE_APP_API_KEY to match backend APP_API_KEY.'
      : `Request failed with status ${res.status}`)
  );
}

export async function analyzeRisk(
  payload: RiskRequest,
  mode: Mode = 'auto',
  llmModel?: string,
  promptVariant?: string,
): Promise<RiskResponse> {
  const headers: Record<string, string> = { ...buildHeaders(), 'Content-Type': 'application/json' };

  const params = new URLSearchParams({ mode });
  if (mode === 'live' && llmModel) {
    params.append('llm_model', llmModel);
  }
  if (promptVariant && promptVariant !== 'default') {
    params.append('prompt_variant', promptVariant);
  }

  const res = await fetch(`${API_BASE}/risk/analyze?${params.toString()}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }

  return (await res.json()) as RiskResponse;
}

export async function listPromptVariants(): Promise<string[]> {
  const headers = buildHeaders();

  const res = await fetch(`${API_BASE}/risk/prompt-variants`, { headers });
  if (!res.ok) {
    throw new Error(`Failed to list prompt variants (${res.status})`);
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data.filter((v) => typeof v === 'string') as string[]) : [];
}

export async function listProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`, { headers: buildHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Project[];
}

export async function createProject(body: ProjectCreate): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Project;
}

export async function listAssessments(projectId: string): Promise<AssessmentSummary[]> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/assessments`, { headers: buildHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as AssessmentSummary[];
}

export async function createAssessment(projectId: string, body: AssessmentCreate): Promise<Assessment> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/assessments`, {
    method: 'POST',
    headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Assessment;
}

export async function getAssessment(assessmentId: string): Promise<Assessment> {
  const res = await fetch(`${API_BASE}/assessments/${assessmentId}`, { headers: buildHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Assessment;
}

export async function listAssessmentVersions(assessmentId: string): Promise<AssessmentVersionSummary[]> {
  const res = await fetch(`${API_BASE}/assessments/${assessmentId}/versions`, { headers: buildHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as AssessmentVersionSummary[];
}

export async function getAssessmentVersion(assessmentId: string, versionId: string): Promise<AssessmentVersion> {
  const res = await fetch(`${API_BASE}/assessments/${assessmentId}/versions/${versionId}`, { headers: buildHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as AssessmentVersion;
}

export async function runAssessment(
  assessmentId: string,
  payload: RiskRequest,
  mode: Mode = 'auto',
  llmModel?: string,
  promptVariant?: string,
  ragEnabled?: boolean,
): Promise<AssessmentVersion> {
  const params = new URLSearchParams({ mode });
  if (mode === 'live' && llmModel) params.append('llm_model', llmModel);
  if (promptVariant && promptVariant !== 'default') params.append('prompt_variant', promptVariant);
  if (typeof ragEnabled === 'boolean') params.append('rag_enabled', String(ragEnabled));

  const res = await fetch(`${API_BASE}/assessments/${assessmentId}/run?${params.toString()}`, {
    method: 'POST',
    headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as AssessmentVersion;
}

export async function submitFeedback(
  assessmentId: string,
  versionId: string,
  body: FeedbackCreate,
): Promise<Feedback> {
  const res = await fetch(`${API_BASE}/assessments/${assessmentId}/versions/${versionId}/feedback`, {
    method: 'POST',
    headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Feedback;
}

export async function listFeedback(assessmentId: string, versionId: string): Promise<Feedback[]> {
  const res = await fetch(`${API_BASE}/assessments/${assessmentId}/versions/${versionId}/feedback`, {
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Feedback[];
}

export async function downloadExport(
  assessmentId: string,
  versionId: string,
  format: 'markdown' | 'csv' | 'json',
): Promise<{ blob: Blob; filename: string }> {
  const params = new URLSearchParams({ format });
  const res = await fetch(`${API_BASE}/assessments/${assessmentId}/versions/${versionId}/export?${params.toString()}`, {
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] || `export.${format === 'markdown' ? 'md' : format}`;
  return { blob, filename };
}

export async function listAdminPromptTemplates(): Promise<PromptTemplateSummary[]> {
  const res = await fetch(`${API_BASE}/admin/prompt-templates`, { headers: buildHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as PromptTemplateSummary[];
}

export async function getAdminPromptTemplate(name: string): Promise<PromptTemplateDetail> {
  const res = await fetch(`${API_BASE}/admin/prompt-templates/${encodeURIComponent(name)}`, { headers: buildHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as PromptTemplateDetail;
}

export async function createAdminPromptTemplate(body: PromptTemplateUpsert): Promise<PromptTemplateDetail> {
  const res = await fetch(`${API_BASE}/admin/prompt-templates`, {
    method: 'POST',
    headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as PromptTemplateDetail;
}

export async function updateAdminPromptTemplate(name: string, body: PromptTemplateUpdate): Promise<PromptTemplateDetail> {
  const res = await fetch(`${API_BASE}/admin/prompt-templates/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as PromptTemplateDetail;
}

export async function testRunAdminPromptTemplate(
  name: string,
  payload: RiskRequest,
  mode: Mode = 'mock',
  llmModel?: string,
): Promise<PromptTemplateTestRunResponse> {
  const res = await fetch(`${API_BASE}/admin/prompt-templates/${encodeURIComponent(name)}/test-run`, {
    method: 'POST',
    headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, mode, llm_model: llmModel }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as PromptTemplateTestRunResponse;
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const res = await fetch(`${API_BASE}/admin/settings`, { headers: buildHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as AdminSettings;
}

export async function getAdminAuditSnapshot(limit = 50): Promise<AuditSnapshot> {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(`${API_BASE}/admin/audit?${params.toString()}`, { headers: buildHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as AuditSnapshot;
}
