# Wireframes (Figma Guidance)

Use these frames in Figma to visualize the PoC. Keep typography clean (e.g., Inter), high-contrast neutrals, and card-based layout. Aim for desktop-first with responsive adjustments for tablet/mobile.

## Frames
- **Landing / New Assessment**
  - Header: title, PoC pill, short description, optional API key status chip.
  - Two-column grid on desktop:
    - Left: “Assessment Wizard” card with form fields (business type, risk domain, region, size, maturity, objectives, context, constraints, requested outputs, follow-up instructions). Primary button: Generate. Secondary: Reset.
    - Right: “Analysis Status” card (idle/processing/complete), Trace ID placeholder, short helper text. Below: empty-state “Results” card with muted prompt text.
  - Mobile/tablet: stack cards vertically; buttons full-width.

- **Results View (post-submit)**
  - Keep header and wizard visible. Right column becomes results stack:
    - Summary cards row (Key Risks count, Domains covered, Mock/Live indicator).
    - Narrative card: brief paragraph.
    - Risk Register card: table with columns (ID, Title, Likelihood, Inherent, Residual, Controls, Mitigations, KPIs). Scrollable on small screens.
    - Assumptions & Gaps card: bulleted list.
    - Actions row: Copy JSON, Download JSON, “Refine” text input with submit button.

- **Iteration / Follow-up**
  - “Refine” bar pinned at bottom of results column; on submit, append a chat-like thread:
    - Each turn shows user refinement text and system response timestamp + Trace ID reuse.
    - Results panels refresh with latest content.

- **Empty / Error States**
  - Empty Results: “No results yet. Submit an assessment.”
  - Loading: skeletons or spinner in Results card with “Generating analysis…”.
  - Error: inline alert card with retry button.

## Navigation & Interactions
- Primary CTA: Generate (triggers POST /api/v1/risk/analyze).
- Secondary: Reset (clears form).
- Actions: Copy/Download use current JSON payload; show small toast on success.
- Refine bar: sends prior form context + refinement text; show appended turn.
- Mock/Live indicator: badge showing mode from settings; tooltip explains data policy.

## Layout Tokens (suggested)
- Spacing: 16px base; cards radius 12px; gutters 16–24px.
- Colors: background `#f8fafc`, card `#ffffff`, border `#e5e7eb`, primary `#111827`, accent `#3730a3` for pills.
- Typography: Inter 16px body, 20–24px headings; muted text `#6b7280`.

## Assets / Components
- Reuseable: Header, StatusCard, WizardForm, ResultsPanel, RiskTable, AssumptionsList, ActionBar, Toast.
- Icons: minimal (spinner, copy/download, info tooltip for modes).

## Notes
- No confidential data; remind users in the wizard helper text.
- Keep content within 1200px container on desktop; use stacked layout under 900px.
- Ensure table supports horizontal scroll on small screens.
