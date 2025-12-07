# Repository Guidelines

## Project Structure & Module Organization
- `backend/` FastAPI service; `app/` holds `api` (routes/schemas), `services` (prompt/LLM), `core` (config/data policy), and `db/` placeholder; `tests/` for pytest.
- `frontend/` Vite + React/TypeScript UI; `src/` for wizard/results, `public/` for static assets, `dist/` as build output.
- `docs/` contains wireframes and architecture notes; `.env.example` documents local settings; `docker-compose.yml` orchestrates backend + frontend.

## Build, Test, and Development Commands
- Backend setup: `cd backend && python -m venv .venv && .\.venv\Scripts\activate && pip install -r requirements.txt`.
- Run API locally: `uvicorn app.main:app --reload` (respects `.env`; default `MOCK_MODE=true`).
- Backend tests: `cd backend && pytest` (covers health, mock flow, data-policy guardrail).
- Frontend dev: `cd frontend && npm install && npm run dev`; build: `npm run build`; preview: `npm run preview`.
- Docker: `docker-compose up --build` to launch API + frontend together.
- Auth UX: landing header shows Log in until authenticated; once signed in it switches to Log out and calls the configured logout handler (Auth0 return URL via `VITE_AUTH0_LOGOUT_URI` if set). Get started stays available in both states.

## Coding Style & Naming Conventions
- Python: follow PEP8 with 4-space indent; module/file names snake_case; functions/methods verb_noun; prefer type hints on request/response models and service boundaries; keep FastAPI responses concise JSON.
- Tests: place under `backend/tests`, name `test_*.py` with descriptive function names.
- React/TS: 2-space indent; components PascalCase; hooks/state camelCase; keep JSX lean and typed. `npm run lint` is currently a placeholder; format with your editor's Prettier/TypeScript defaults.

## Testing Guidelines
- Extend pytest coverage when adding routes, data-policy checks, or service behavior; include both happy-path and rejection cases (e.g., sensitive-data blocking).
- Use FastAPI TestClient for API tests; seed mock inputs similar to `test_api.py`.
- No frontend automated tests yet; smoke-test the wizard flows (mock/live/auto toggle) and confirm trace ID + results render.

## Commit & Pull Request Guidelines
- Favor small, focused commits with imperative subject lines (e.g., "Add mock risk presets", "Harden data policy").
- PRs should describe scope, testing performed (`pytest`, `npm run build`, manual UI checks), required env vars, and any screenshots for UI changes.
- Reference related tickets/issues; note whether changes affect Docker or example env files.

## Security & Configuration Tips
- Keep secrets out of the repo; copy `.env.example` to `.env` and set `OPENAI_API_KEY`, `APP_API_KEY`, `ALLOWED_ORIGINS`, `VITE_API_BASE`, `VITE_APP_API_KEY` as needed.
- Default mock mode avoids network calls; confirm before enabling live mode. Do not send PII/PHI or non-public data through prompts or tests.
