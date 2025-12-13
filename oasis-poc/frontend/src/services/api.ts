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

export type Mode = 'auto' | 'mock' | 'live';

export async function analyzeRisk(
  payload: RiskRequest,
  mode: Mode = 'auto',
  llmModel?: string,
  promptVariant?: string,
): Promise<RiskResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (APP_API_KEY) {
    headers['x-api-key'] = APP_API_KEY;
  }

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
    const message =
      res.status === 401
        ? bodyMessage ||
          'Unauthorized: API key missing or invalid. Set VITE_APP_API_KEY to match backend APP_API_KEY.'
        : bodyMessage || `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  return (await res.json()) as RiskResponse;
}

export async function listPromptVariants(): Promise<string[]> {
  const headers: Record<string, string> = {};
  if (APP_API_KEY) {
    headers['x-api-key'] = APP_API_KEY;
  }

  const res = await fetch(`${API_BASE}/risk/prompt-variants`, { headers });
  if (!res.ok) {
    throw new Error(`Failed to list prompt variants (${res.status})`);
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data.filter((v) => typeof v === 'string') as string[]) : [];
}
