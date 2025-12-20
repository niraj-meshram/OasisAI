import { AssessmentSummary, AssessmentVersionSummary, Project } from '../services/api';

type Props = {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  assessments: AssessmentSummary[];
  selectedAssessmentId: string | null;
  onSelectAssessment: (assessmentId: string) => void;
  onNewAssessment: () => void;
  canCreateAssessment: boolean;
  versions: AssessmentVersionSummary[];
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
  loading: boolean;
};

function ProjectDashboard({
  projects,
  selectedProjectId,
  onSelectProject,
  assessments,
  selectedAssessmentId,
  onSelectAssessment,
  onNewAssessment,
  canCreateAssessment,
  versions,
  selectedVersionId,
  onSelectVersion,
  loading,
}: Props) {
  const selectedVersion = versions.find((v) => v.version_id === selectedVersionId) || null;
  const projectOptions = projects.length ? projects : [];
  const selectedProject = projectOptions.find((p) => p.project_id === selectedProjectId) || null;

  return (
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Project Dashboard</h2>
        <span className="pill">{loading ? 'Running' : selectedVersion ? 'Complete' : 'Idle'}</span>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Persisted projects, assessments, and versioned runs with provenance. Mock mode works offline.
      </p>

      <div className="grid" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="projectSelect">Project</label>
          <select
            id="projectSelect"
            value={selectedProjectId ?? ''}
            onChange={(e) => onSelectProject(e.target.value)}
            disabled={loading || projectOptions.length === 0}
          >
            {projectOptions.length === 0 ? (
              <option value="">No projects</option>
            ) : (
              <>
                {!selectedProjectId && <option value="">Select a project</option>}
                {projectOptions.map((p) => (
                  <option key={p.project_id} value={p.project_id}>
                    {p.name}
                  </option>
                ))}
              </>
            )}
          </select>
          {selectedProject?.description && (
            <p className="muted" style={{ margin: 0 }}>
              {selectedProject.description}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <strong>Assessments</strong>
          {canCreateAssessment ? (
            <button className="button secondary pill" type="button" onClick={onNewAssessment} disabled={loading}>
              New Assessment
            </button>
          ) : (
            <span className="pill">Read-only</span>
          )}
        </div>

        {assessments.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No assessments yet. Create one to start an audit trail.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {assessments.slice(0, 6).map((a) => {
              const isSelected = a.assessment_id === selectedAssessmentId;
              const subtitleParts = [
                a.latest_version_number ? `v${a.latest_version_number}` : 'new',
                a.latest_trace_id ? `trace ${a.latest_trace_id}` : null,
              ].filter(Boolean);
              return (
                <button
                  key={a.assessment_id}
                  type="button"
                  className={`button ${isSelected ? '' : 'secondary'}`}
                  onClick={() => onSelectAssessment(a.assessment_id)}
                  disabled={loading}
                  style={{ justifyContent: 'space-between' }}
                >
                  <span style={{ textAlign: 'left' }}>{a.title}</span>
                  <span className="pill" style={{ whiteSpace: 'nowrap' }}>
                    {subtitleParts.join(' | ')}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {selectedAssessmentId && versions.length > 0 && (
          <div className="field">
            <label htmlFor="versionSelect">Version</label>
            <select
              id="versionSelect"
              value={selectedVersionId || ''}
              onChange={(e) => onSelectVersion(e.target.value)}
              disabled={loading}
            >
              {versions.map((v) => (
                <option key={v.version_id} value={v.version_id}>
                  v{v.version_number} | {v.resolved_mode} | {v.llm_model}
                </option>
              ))}
            </select>
            {selectedVersion && (
              <p className="muted" style={{ margin: 0 }}>
                Trace {selectedVersion.trace_id} | Prompt {selectedVersion.prompt_variant} |{' '}
                {new Date(selectedVersion.created_at).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default ProjectDashboard;
