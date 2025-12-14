import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AssessmentVersion,
  downloadExport,
  Feedback,
  listFeedback,
  submitFeedback,
} from '../services/api';

type Props = {
  assessmentId: string | null;
  version: AssessmentVersion | null;
  loading: boolean;
  canSubmitFeedback: boolean;
};

type ExportFormat = 'markdown' | 'csv' | 'json';

const FLAG_OPTIONS = [
  'Missing citations',
  'Potential hallucination',
  'Incorrect mapping',
  'Missing controls/mitigations',
  'Needs SME review',
  'Other',
] as const;

function ReviewPanel({ assessmentId, version, loading, canSubmitFeedback }: Props) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showProvenance, setShowProvenance] = useState(false);

  const [rating, setRating] = useState<number | ''>('');
  const [flags, setFlags] = useState<string[]>([]);
  const [comment, setComment] = useState<string>('');
  const [recommendedEdits, setRecommendedEdits] = useState<string>('');
  const [reviewer, setReviewer] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackItems, setFeedbackItems] = useState<Feedback[]>([]);

  const versionId = version?.version_id || null;

  useEffect(() => {
    if (!assessmentId || !versionId) {
      setFeedbackItems([]);
      return;
    }
    let cancelled = false;
    listFeedback(assessmentId, versionId)
      .then((items) => {
        if (!cancelled) setFeedbackItems(items);
      })
      .catch(() => {
        // ignore feedback history failures
      });
    return () => {
      cancelled = true;
    };
  }, [assessmentId, versionId]);

  const createdAt = useMemo(() => {
    if (!version?.created_at) return '';
    try {
      return new Date(version.created_at).toLocaleString();
    } catch {
      return version.created_at;
    }
  }, [version?.created_at]);

  const toggleFlag = (flag: string) => {
    setFlags((prev) => (prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]));
  };

  const download = async (format: ExportFormat) => {
    if (!assessmentId || !versionId) return;
    setActionError(null);
    setExporting(format);
    try {
      const { blob, filename } = await downloadExport(assessmentId, versionId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault();
    if (!assessmentId || !versionId) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await submitFeedback(assessmentId, versionId, {
        rating: rating === '' ? null : rating,
        flags,
        comment: comment.trim() ? comment : null,
        recommended_edits: recommendedEdits.trim() ? recommendedEdits : null,
        reviewer: reviewer.trim() ? reviewer : null,
      });
      const items = await listFeedback(assessmentId, versionId);
      setFeedbackItems(items);
      setRating('');
      setFlags([]);
      setComment('');
      setRecommendedEdits('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Feedback submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!version) {
    return (
      <section className="card">
        <h2 style={{ margin: 0 }}>Review & Export</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          Select an assessment version to view provenance, export artifacts, and submit reviewer feedback.
        </p>
      </section>
    );
  }

  return (
    <section className="card grid">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Review & Export</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="button secondary pill"
            type="button"
            onClick={() => setShowProvenance(true)}
            disabled={loading}
          >
            View provenance
          </button>
          <button
            className="button secondary pill"
            type="button"
            onClick={() => download('markdown')}
            disabled={loading || exporting !== null}
          >
            {exporting === 'markdown' ? 'Exporting…' : 'Export MD'}
          </button>
          <button
            className="button secondary pill"
            type="button"
            onClick={() => download('csv')}
            disabled={loading || exporting !== null}
          >
            {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            className="button secondary pill"
            type="button"
            onClick={() => download('json')}
            disabled={loading || exporting !== null}
          >
            {exporting === 'json' ? 'Exporting…' : 'Export JSON'}
          </button>
        </div>
      </div>

      <div className="bento-grid">
        <div className="bento-tile">
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Metadata</h3>
          <div className="muted">Trace: {version.trace_id}</div>
          <div className="muted">Created: {createdAt}</div>
          <div className="muted">
            Mode: {version.resolved_mode} (requested: {version.mode})
          </div>
          <div className="muted">Model: {version.llm_model}</div>
          <div className="muted">Prompt: {version.prompt_variant}</div>
          {typeof version.rag_enabled === 'boolean' && <div className="muted">RAG: {version.rag_enabled ? 'On' : 'Off'}</div>}
        </div>

        <div className="bento-tile">
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Reviewer Feedback</h3>
          {!canSubmitFeedback ? (
            <p className="muted" style={{ margin: 0 }}>
              Feedback submission is restricted to the Reviewer role.
            </p>
          ) : (
            <form className="grid" onSubmit={handleSubmit} style={{ gap: 12 }}>
              <div className="grid two" style={{ gap: 12 }}>
                <div className="field">
                  <label htmlFor="rating">Rating (1-5)</label>
                  <select
                    id="rating"
                    value={rating === '' ? '' : String(rating)}
                    onChange={(e) => setRating(e.target.value ? Number(e.target.value) : '')}
                    disabled={loading || submitting}
                  >
                    <option value="">(none)</option>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <option key={v} value={String(v)}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="reviewer">Reviewer</label>
                  <input
                    id="reviewer"
                    value={reviewer}
                    onChange={(e) => setReviewer(e.target.value)}
                    disabled={loading || submitting}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="field">
                <label>Flags</label>
                <div style={{ display: 'grid', gap: 6 }}>
                  {FLAG_OPTIONS.map((flag) => (
                    <label key={flag} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={flags.includes(flag)}
                        onChange={() => toggleFlag(flag)}
                        disabled={loading || submitting}
                      />
                      <span>{flag}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor="comment">Comments</label>
                <textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={loading || submitting}
                  placeholder="What looks off? What would you change?"
                />
              </div>

              <div className="field">
                <label htmlFor="recommendedEdits">Recommended edits</label>
                <textarea
                  id="recommendedEdits"
                  value={recommendedEdits}
                  onChange={(e) => setRecommendedEdits(e.target.value)}
                  disabled={loading || submitting}
                  placeholder="Concrete edits or guidance for the next iteration"
                />
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button className="button" type="submit" disabled={loading || submitting}>
                  {submitting ? 'Saving…' : 'Save feedback'}
                </button>
                {actionError && (
                  <div className="pill" role="alert">
                    {actionError}
                  </div>
                )}
              </div>
            </form>
          )}
        </div>

        <div className="bento-tile bento-wide">
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Feedback history</h3>
          {feedbackItems.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No feedback recorded for this version.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {feedbackItems.slice(0, 5).map((f) => (
                <div key={f.feedback_id} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <strong>{f.reviewer || 'Reviewer'}</strong>
                    <span className="pill">
                      {f.rating ? `Rating ${f.rating}` : 'No rating'} · {new Date(f.created_at).toLocaleString()}
                    </span>
                  </div>
                  {f.flags.length > 0 && (
                    <div className="muted" style={{ marginTop: 6 }}>
                      Flags: {f.flags.join(', ')}
                    </div>
                  )}
                  {f.comment && <div style={{ marginTop: 6 }}>{f.comment}</div>}
                  {f.recommended_edits && (
                    <div className="muted" style={{ marginTop: 6 }}>
                      Recommended edits: {f.recommended_edits}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showProvenance && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Provenance">
          <div className="modal-panel">
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Provenance</h3>
              <button className="button secondary pill" type="button" onClick={() => setShowProvenance(false)}>
                Close
              </button>
            </div>
            <div className="modal-body grid">
              <div>
                <strong>System prompt hash:</strong> {version.system_prompt_sha256}
              </div>
              <div>
                <strong>User prompt:</strong>
                <pre style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{version.user_prompt}</pre>
              </div>
              <div>
                <strong>Request JSON:</strong>
                <pre style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                  {JSON.stringify(version.request, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ReviewPanel;
