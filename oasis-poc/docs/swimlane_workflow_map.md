# OASIS AI Risk Management PoC — Swimlane Workflow Map

LANES:  `[Admin]` · `[Risk Analyst]` · `[Reviewer]` · `[System]`

## (0) Access & Guardrails
| Admin | Risk Analyst | Reviewer | System |
|---|---|---|---|
| | | | Display SSO login |
| | Sign in via SSO | | |
| | Acknowledge "public data only / no corporate data" | | |

## (1) Start / Locate Work
| Admin | Risk Analyst | Reviewer | System |
|---|---|---|---|
| | Open Project Dashboard | | |
| | View projects & recent assessments | | |

## (2) Create New Assessment (Wizard)
| Admin | Risk Analyst | Reviewer | System |
|---|---|---|---|
| | Click "New Assessment" | | |
| | Select Use Case Template (Operational / Cybersecurity / Regulatory-Compliance) | | |
| | Enter Context Fields (business type, scope, time horizon, known controls) | | |
| | Choose Options (RAG on/off, verbosity, language) | | |
| | Review & Submit | | |

## (3) Generate Outputs (LLM + Traceability)
| Admin | Risk Analyst | Reviewer | System |
|---|---|---|---|
| | | | Render prompt from template + inputs |
| | | | (Optional) Retrieve public references (RAG) |
| | | | Call public LLM endpoint via adapter |
| | | | Produce structured output (JSON) |
| | | | Attach citations + model/prompt metadata |
| | | | Store versioned result in audit trail |
| | Generated results ready | | |

## (4) Review Results & Provide Feedback
| Admin | Risk Analyst | Reviewer | System |
|---|---|---|---|
| | Open Results Viewer | | |
| | | Review report + JSON | |
| | | Inspect provenance (citations, prompt, model metadata) | |
| | | Rate / Flag issues | |
| | | Recommend edits | Save feedback for prompt tuning |

## (5) Iterate (Optional Loop)
| Admin | Risk Analyst | Reviewer | System |
|---|---|---|---|
| | Update context / options based on feedback | | |
| | Re-run Generate | | Store new version (audit trail) |
| | | Compare versions | |

## (6) Export / Handoff
| Admin | Risk Analyst | Reviewer | System |
|---|---|---|---|
| | Export results (PDF/Markdown report, CSV) | | Generate export artifact |
| | Download / share | | |

## (7) Administration & Governance (Ongoing)
| Admin | Risk Analyst | Reviewer | System |
|---|---|---|---|
| Manage prompt templates (create/version/test templates) | | | |
| Manage settings & audit logs (RBAC, key mgmt, prompt logs) | | | |

