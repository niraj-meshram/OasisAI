import { FormEvent, useEffect, useState } from 'react';
import { RiskRequest } from '../../services/api';

type Props = {
  onSubmit: (payload: RiskRequest, templateId: string | null) => Promise<void> | void;
  onReset?: () => void;
  loading: boolean;
  initialForm?: RiskRequest;
  initialTemplateId?: string | null;
};

const defaultForm: RiskRequest = {
  scope: '',
  time_horizon: '',
  known_controls: [],
  rag_enabled: false,
  verbosity: 'concise',
  language: 'English',
  business_type: 'Retail banking',
  risk_domain: 'Operational',
  region: '',
  size: 'Mid',
  maturity: 'Defined',
  objectives: 'Create risk register and mitigations',
  context: '',
  constraints: 'No confidential data, public sources only',
  requested_outputs: 'Narrative + register + mitigations + KPIs',
  refinements: '',
  control_tokens: ['tone=regulatory', 'length=concise'],
  instruction_tuning: 'Use public frameworks only; keep sentences short; avoid speculative claims.',
};

type Preset = {
  templateId: string;
  payload: RiskRequest;
};

const presets: Record<string, Preset> = {
  'Digital onboarding (retail banking)': {
    templateId: 'operational',
    payload: {
      scope: 'Digital onboarding channel (new accounts)',
      time_horizon: '0-12 months',
      known_controls: ['KYC/AML checks', 'Fraud monitoring', 'Customer identity verification'],
      rag_enabled: false,
      verbosity: 'concise',
      language: 'English',
      business_type: 'Retail banking',
      risk_domain: 'Operational',
      region: 'North America',
      size: 'Mid',
      maturity: 'Defined',
      objectives: 'Assess onboarding reliability and fraud controls',
      context: 'Launching digital onboarding for new customers',
      constraints: 'Public data only; no customer PII; use public regs',
      requested_outputs: 'Narrative + register + mitigations + KPIs',
      refinements: 'Emphasize KYC/AML expectations',
      control_tokens: ['tone=regulatory', 'length=concise'],
      instruction_tuning: 'Highlight operational resilience and KYC controls.',
    },
  },
  'Cloud migration (compliance workload)': {
    templateId: 'regulatory-compliance',
    payload: {
      scope: 'Regulated workloads migrating to public cloud',
      time_horizon: '6-18 months',
      known_controls: ['Change management', 'Access control', 'Data classification'],
      rag_enabled: false,
      verbosity: 'standard',
      language: 'English',
      business_type: 'Financial services',
      risk_domain: 'Regulatory',
      region: 'EU',
      size: 'Large',
      maturity: 'Managed',
      objectives: 'Evaluate compliance posture for cloud migration',
      context: 'Moving regulated workloads to cloud across regions',
      constraints: 'No proprietary data; reference public standards (e.g., ISO, NIST)',
      requested_outputs: 'Controls, mitigations, KPIs for residency and access',
      refinements: 'Highlight data residency and change control',
      control_tokens: ['tone=assurance', 'length=concise', 'format=numbered'],
      instruction_tuning: 'Emphasize residency, access control, and change management.',
    },
  },
  'Fintech fraud monitoring integration': {
    templateId: 'operational',
    payload: {
      scope: 'Third-party fraud monitoring integration',
      time_horizon: '0-6 months',
      known_controls: ['Vendor due diligence', 'SLA monitoring', 'Model performance monitoring'],
      rag_enabled: false,
      verbosity: 'concise',
      language: 'English',
      business_type: 'Payments/Fintech',
      risk_domain: 'Fraud',
      region: 'Global',
      size: 'Mid',
      maturity: 'Emerging',
      objectives: 'Assess fraud monitoring integration with partner',
      context: 'Integrating third-party fraud scoring for card-not-present traffic',
      constraints: 'No customer data; rely on public patterns and controls',
      requested_outputs: 'Narrative + register + mitigations + KPIs',
      refinements: 'Cover SLA risks and model drift monitoring',
      control_tokens: ['tone=practical', 'length=concise'],
      instruction_tuning: 'Call out third-party SLAs and model drift monitoring.',
    },
  },
};

const templateDefaults: Record<string, Partial<RiskRequest>> = {
  operational: {
    risk_domain: 'Operational',
    instruction_tuning:
      'Use public frameworks only; keep sentences short; avoid speculative claims; emphasize operational resilience and controls.',
    control_tokens: ['tone=regulatory', 'length=concise'],
  },
  cybersecurity: {
    risk_domain: 'Cyber',
    instruction_tuning:
      'Use public frameworks only; keep sentences short; avoid speculative claims; emphasize cybersecurity controls and monitoring.',
    control_tokens: ['tone=technical', 'length=concise', 'format=numbered'],
  },
  'regulatory-compliance': {
    risk_domain: 'Regulatory',
    instruction_tuning:
      'Use public frameworks only; keep sentences short; avoid speculative claims; emphasize regulatory expectations and evidence-based controls.',
    control_tokens: ['tone=assurance', 'length=concise', 'format=numbered'],
  },
};

function AssessmentWizard({ onSubmit, onReset, loading, initialForm, initialTemplateId }: Props) {
  const [form, setForm] = useState<RiskRequest>(initialForm || defaultForm);
  const [templateId, setTemplateId] = useState<string>(initialTemplateId || 'operational');

  useEffect(() => {
    setForm(initialForm || defaultForm);
  }, [initialForm]);

  useEffect(() => {
    setTemplateId(initialTemplateId || 'operational');
  }, [initialTemplateId]);

  useEffect(() => {
    const patch = templateDefaults[templateId];
    if (!patch) return;
    setForm((prev) => ({
      ...prev,
      risk_domain: patch.risk_domain || prev.risk_domain,
      instruction_tuning: patch.instruction_tuning || prev.instruction_tuning,
      control_tokens: patch.control_tokens || prev.control_tokens,
    }));
  }, [templateId]);

  const handleChange = (key: keyof RiskRequest, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault();
    await onSubmit(form, templateId);
  };

  return (
    <form className="card grid" onSubmit={handleSubmit}>
      <h2 style={{ margin: 0 }}>Assessment Wizard</h2>
      <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span>Quick scenarios:</span>
        {Object.entries(presets).map(([label, preset]) => (
          <button
            key={label}
            type="button"
            className="button pill secondary"
            onClick={() => {
              setTemplateId(preset.templateId);
              setForm(preset.payload);
            }}
            disabled={loading}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid two">
        <div className="field">
          <label htmlFor="template_id">Use Case Template</label>
          <select
            id="template_id"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={loading}
          >
            <option value="operational">Operational</option>
            <option value="cybersecurity">Cybersecurity</option>
            <option value="regulatory-compliance">Regulatory-Compliance</option>
          </select>
          <p className="muted" style={{ margin: 0 }}>
            Template pre-fills tone and guidance; edit any field before submitting.
          </p>
        </div>
        <div className="field">
          <label htmlFor="verbosity">Verbosity</label>
          <select
            id="verbosity"
            value={form.verbosity || 'concise'}
            onChange={(e) => handleChange('verbosity', e.target.value)}
            disabled={loading}
          >
            <option value="concise">Concise</option>
            <option value="standard">Standard</option>
            <option value="detailed">Detailed</option>
          </select>
        </div>
      </div>
      <div className="grid two">
        <div className="field">
          <label htmlFor="language">Language</label>
          <input
            id="language"
            value={form.language ?? ''}
            onChange={(e) => handleChange('language', e.target.value)}
            disabled={loading}
            placeholder="English"
          />
        </div>
        <div className="field" style={{ alignContent: 'start' }}>
          <label htmlFor="rag_enabled">RAG (public references)</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              id="rag_enabled"
              type="checkbox"
              checked={Boolean(form.rag_enabled)}
              onChange={(e) => setForm((prev) => ({ ...prev, rag_enabled: e.target.checked }))}
              disabled={loading}
            />
            <span className="muted">PoC placeholder (metadata only)</span>
          </div>
        </div>
      </div>
      <div className="grid two">
        <div className="field">
          <label htmlFor="scope">Scope</label>
          <input
            id="scope"
            value={form.scope ?? ''}
            onChange={(e) => handleChange('scope', e.target.value)}
            disabled={loading}
            placeholder="Process/system in scope, business units, channels"
          />
        </div>
        <div className="field">
          <label htmlFor="time_horizon">Time Horizon</label>
          <input
            id="time_horizon"
            value={form.time_horizon ?? ''}
            onChange={(e) => handleChange('time_horizon', e.target.value)}
            disabled={loading}
            placeholder="e.g., 0-6 months, 6-18 months"
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="known_controls">Known Controls (one per line)</label>
        <textarea
          id="known_controls"
          value={(form.known_controls || []).join('\n')}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              known_controls: e.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            }))
          }
          disabled={loading}
          placeholder="KYC/AML checks&#10;Vendor due diligence&#10;Change control"
        />
      </div>
      <div className="grid two">
        <div className="field">
          <label htmlFor="business_type">Business Type</label>
          <input
            id="business_type"
            value={form.business_type}
            onChange={(e) => handleChange('business_type', e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="risk_domain">Risk Domain</label>
          <select
            id="risk_domain"
            value={form.risk_domain}
            onChange={(e) => handleChange('risk_domain', e.target.value)}
          >
            <option>Operational</option>
            <option>Regulatory</option>
            <option>Cyber</option>
            <option>Fraud</option>
          </select>
        </div>
      </div>
      <div className="grid two">
        <div className="field">
          <label htmlFor="region">Region</label>
          <input id="region" value={form.region ?? ''} onChange={(e) => handleChange('region', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="size">Org Size</label>
          <input id="size" value={form.size ?? ''} onChange={(e) => handleChange('size', e.target.value)} />
        </div>
      </div>
      <div className="grid two">
        <div className="field">
          <label htmlFor="maturity">Control Maturity</label>
          <input id="maturity" value={form.maturity ?? ''} onChange={(e) => handleChange('maturity', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="objectives">Objectives</label>
          <input
            id="objectives"
            value={form.objectives ?? ''}
            onChange={(e) => handleChange('objectives', e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="context">Context</label>
        <textarea id="context" value={form.context ?? ''} onChange={(e) => handleChange('context', e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="constraints">Constraints</label>
        <textarea
          id="constraints"
          value={form.constraints ?? ''}
          onChange={(e) => handleChange('constraints', e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="control_tokens">Control Tokens (comma-separated)</label>
        <input
          id="control_tokens"
          value={(form.control_tokens || []).join(', ')}
          onChange={(e) =>
            handleChange(
              'control_tokens',
              e.target.value
                .split(',')
                .map((token) => token.trim())
                .filter(Boolean),
            )
          }
          placeholder="tone=regulatory, length=concise, format=numbered"
        />
        <p className="muted" style={{ margin: 0 }}>
          Optional steering tokens (tone, length, format, focus). Leave blank for defaults.
        </p>
      </div>
      <div className="field">
        <label htmlFor="requested_outputs">Requested Outputs</label>
        <input
          id="requested_outputs"
          value={form.requested_outputs ?? ''}
          onChange={(e) => handleChange('requested_outputs', e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="instruction_tuning">Instruction Tuning</label>
        <textarea
          id="instruction_tuning"
          value={form.instruction_tuning ?? ''}
          onChange={(e) => handleChange('instruction_tuning', e.target.value)}
          placeholder="Add extra steering such as tone guidance or constraints."
        />
      </div>
      <div className="field">
        <label htmlFor="refinements">Follow-up Instructions</label>
        <textarea
          id="refinements"
          value={form.refinements ?? ''}
          onChange={(e) => handleChange('refinements', e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="button" type="submit" disabled={loading}>
          {loading ? 'Generating...' : 'Generate'}
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setTemplateId('operational');
            setForm(defaultForm);
            onReset?.();
          }}
          disabled={loading}
        >
          Reset
        </button>
      </div>
    </form>
  );
}

export default AssessmentWizard;
