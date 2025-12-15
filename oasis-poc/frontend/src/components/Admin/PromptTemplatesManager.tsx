import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createAdminPromptTemplate,
  getAdminPromptTemplate,
  listAdminPromptTemplates,
  Mode,
  PromptTemplateDetail,
  PromptTemplateSummary,
  RiskRequest,
  testRunAdminPromptTemplate,
  updateAdminPromptTemplate,
} from '../../services/api';

const samplePayload: RiskRequest = {
  business_type: 'Retail banking',
  risk_domain: 'Operational',
  scope: 'Digital onboarding channel (public demo)',
  time_horizon: '0-12 months',
  known_controls: ['KYC/AML checks', 'Fraud monitoring'],
  verbosity: 'concise',
  language: 'English',
  constraints: 'Public data only; avoid pii; avoid phi; no confidential or proprietary data',
  requested_outputs: 'Narrative + register + mitigations + KPIs',
};

type Props = {
  llmModels: string[];
};

function PromptTemplatesManager({ llmModels }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<PromptTemplateSummary[]>([]);
  const [selectedName, setSelectedName] = useState<string>('');
  const [selected, setSelected] = useState<PromptTemplateDetail | null>(null);

  const [createName, setCreateName] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [createContent, setCreateContent] = useState('');

  const [editNotes, setEditNotes] = useState('');
  const [editContent, setEditContent] = useState('');

  const [testMode, setTestMode] = useState<Mode>('mock');
  const [testModel, setTestModel] = useState<string>(llmModels[0] || 'gpt-4o-mini');
  const [testOutput, setTestOutput] = useState<{ traceId: string; summary: string } | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listAdminPromptTemplates();
      setTemplates(items);
      if (!selectedName && items.length > 0) setSelectedName(items[0].name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedName) {
      setSelected(null);
      setEditNotes('');
      setEditContent('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAdminPromptTemplate(selectedName)
      .then((detail) => {
        if (cancelled) return;
        setSelected(detail);
        setEditNotes('');
        setEditContent(detail.content);
        setTestOutput(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load template');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedName]);

  const selectedMeta = useMemo(() => {
    if (!selected) return null;
    const updated = selected.updated_at ? new Date(selected.updated_at).toLocaleString() : '';
    return `${selected.source}${selected.current_version ? ` · v${selected.current_version}` : ''}${
      updated ? ` · updated ${updated}` : ''
    }`;
  }, [selected]);

  const handleCreate = async (evt: FormEvent) => {
    evt.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const created = await createAdminPromptTemplate({
        name: createName.trim(),
        notes: createNotes.trim() || null,
        content: createContent,
      });
      setCreateName('');
      setCreateNotes('');
      setCreateContent('');
      await refresh();
      setSelectedName(created.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    if (!selected.managed) {
      setError('Built-in templates cannot be edited. Create a new template instead.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const updated = await updateAdminPromptTemplate(selected.name, {
        notes: editNotes.trim() || null,
        content: editContent,
      });
      setSelected(updated);
      await refresh();
      setTestOutput(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const runTest = async () => {
    if (!selectedName) return;
    setLoading(true);
    setError(null);
    setTestOutput(null);
    try {
      const res = await testRunAdminPromptTemplate(selectedName, samplePayload, testMode, testMode === 'live' ? testModel : undefined);
      setTestOutput({ traceId: res.trace_id, summary: res.response.summary });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test run failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid two">
      <section className="card grid">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Prompt templates</h2>
          <button className="button secondary pill" type="button" onClick={refresh} disabled={loading}>
            Refresh
          </button>
        </div>
        {error && (
          <div className="card" role="alert" style={{ padding: 12, boxShadow: 'none' }}>
            Error: {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="templateSelect">Select</label>
          <select
            id="templateSelect"
            value={selectedName}
            onChange={(e) => setSelectedName(e.target.value)}
            disabled={loading || templates.length === 0}
          >
            {templates.length === 0 ? (
              <option value="">No templates</option>
            ) : (
              templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({t.source})
                </option>
              ))
            )}
          </select>
          {selectedMeta && (
            <p className="muted" style={{ margin: 0 }}>
              {selectedMeta}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="editContent">Content</label>
          <textarea
            id="editContent"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            disabled={loading || !selected}
            style={{ minHeight: 220 }}
          />
        </div>
        <div className="field">
          <label htmlFor="editNotes">Version notes</label>
          <input
            id="editNotes"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            disabled={loading || !selected || !selected.managed}
            placeholder="Optional"
          />
          <p className="muted" style={{ margin: 0 }}>
            Saving creates a new version in the audit store.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="button" type="button" onClick={handleSave} disabled={loading || !selected}>
            Save new version
          </button>
          <button className="button secondary" type="button" onClick={runTest} disabled={loading || !selectedName}>
            Test run
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label htmlFor="testMode" className="muted">
              Mode
            </label>
            <select id="testMode" value={testMode} onChange={(e) => setTestMode(e.target.value as Mode)} disabled={loading}>
              <option value="mock">mock</option>
              <option value="live">live</option>
              <option value="auto">auto</option>
            </select>
            <label htmlFor="testModel" className="muted">
              Model
            </label>
            <select
              id="testModel"
              value={testModel}
              onChange={(e) => setTestModel(e.target.value)}
              disabled={loading || testMode !== 'live'}
            >
              {llmModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
        {testOutput && (
          <div className="card" style={{ padding: 12, boxShadow: 'none' }}>
            <div>
              <strong>Trace:</strong> {testOutput.traceId}
            </div>
            <div className="muted">{testOutput.summary}</div>
          </div>
        )}
      </section>

      <section className="card grid">
        <h2 style={{ margin: 0 }}>Create template</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Create a new system prompt variant. Use a unique name (not <code>default</code>).
        </p>
        <form className="grid" onSubmit={handleCreate}>
          <div className="field">
            <label htmlFor="createName">Name</label>
            <input id="createName" value={createName} onChange={(e) => setCreateName(e.target.value)} disabled={loading} />
          </div>
          <div className="field">
            <label htmlFor="createNotes">Notes</label>
            <input id="createNotes" value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} disabled={loading} />
          </div>
          <div className="field">
            <label htmlFor="createContent">Content</label>
            <textarea
              id="createContent"
              value={createContent}
              onChange={(e) => setCreateContent(e.target.value)}
              disabled={loading}
              style={{ minHeight: 220 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="button" type="submit" disabled={loading}>
              Create
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default PromptTemplatesManager;
