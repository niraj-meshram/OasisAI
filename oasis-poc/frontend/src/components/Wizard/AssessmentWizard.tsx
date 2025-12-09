import { FormEvent, useState } from 'react';
import { RiskRequest } from '../../services/api';

type Props = {
  onSubmit: (payload: RiskRequest) => Promise<void> | void;
  loading: boolean;
};

const defaultForm: RiskRequest = {
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

const presets: Record<string, RiskRequest> = {
  'Digital onboarding (retail banking)': {
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
  'Cloud migration (compliance workload)': {
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
  'Fintech fraud monitoring integration': {
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
};

function AssessmentWizard({ onSubmit, loading }: Props) {
  const [form, setForm] = useState<RiskRequest>(defaultForm);

  const handleChange = (key: keyof RiskRequest, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault();
    await onSubmit(form);
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
            onClick={() => setForm(preset)}
            disabled={loading}
          >
            {label}
          </button>
        ))}
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
          onClick={() => setForm(defaultForm)}
          disabled={loading}
        >
          Reset
        </button>
      </div>
    </form>
  );
}

export default AssessmentWizard;
