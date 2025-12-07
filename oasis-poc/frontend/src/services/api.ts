export type Likelihood = 'Low' | 'Medium' | 'High';

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
  mitigations: string[];
  kpis: string[];
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

export async function analyzeRisk(payload: RiskRequest, mode: Mode = 'auto'): Promise<RiskResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (APP_API_KEY) {
    headers['x-api-key'] = APP_API_KEY;
  }

  const res = await fetch(`${API_BASE}/risk/analyze?mode=${mode}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    const message =
      res.status === 401
        ? body || 'Unauthorized: API key missing or invalid. Set VITE_APP_API_KEY to match backend APP_API_KEY.'
        : body || `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  return (await res.json()) as RiskResponse;
}
