# Oasis Risk PoC

PoC for an AI-driven risk-management assistant using a structured prompt template and LLM. Demonstrates feasibility and usability; not production-ready.

## Why this PoC
- Validate LLM + prompt template produce accurate, actionable risk content across business types.
- Capture functional/non-functional requirements for a future AI risk solution.
- Design a scalable architecture that can expand later.
- Deliver a working PoC UI to demo the AI interface.

## Scope & constraints
- PoC only: no persistence, no production hardening, minimal CI.
- Data policy: public/industry knowledge only; no corporate data, no PII/PHI; refuse tasks requiring them.
- Modes: Mock (offline canned data), Live (LLM), Auto (backend default).
- Default mock_mode true so demos work without keys.
- Security: optional API key (`APP_API_KEY`) via `x-api-key` (frontend supports `VITE_APP_API_KEY`).
- Token efficiency: concise prompts/responses; JSON schema enforced.

## Solution outline
- Backend FastAPI service with `POST /api/v1/risk/analyze` and `GET /health` (`backend/app/api/v1/routes.py`).
- Schema and prompt template in `backend/app/api/v1/schemas.py` and `backend/app/services/prompt_engine.py`.
- LLM adapter supports mock and OpenAI JSON mode (`backend/app/services/llm_adapter.py`).
- Frontend Vite/React wizard + results viewer with mode toggle (`frontend/src`).
- Trace ID returned for basic observability; no DB layer (placeholder in `backend/app/db`).
- Data policy guardrail blocks obvious non-public/PII markers before calling the LLM (`backend/app/core/data_policy.py`).

## Development & testing approach
- Integrate LLM via structured prompt; validate accuracy/usefulness manually.
- Use mock responses for offline/local testing; live mode only when `OPENAI_API_KEY` is present.
- Only public data allowed during development, testing, and operation.
- Wireframes/UX flows documented in `docs/wireframes.md` (Figma guidance, paths/states).
- CI: backend bytecode compile; frontend build (`.github/workflows/ci.yml`).

## Project layout
- `.github/workflows/ci.yml` - CI placeholder
- `backend/` - FastAPI service and LLM orchestration
- `frontend/` - React/Vite UI
- `docs/` - wireframe guidance for Figma, architecture and evaluation notes
- `docker-compose.yml` - run backend locally
- `.env.example` - sample environment variables

## Backend (FastAPI)
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate   # PowerShell
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Configuration
Copy `.env.example` to `.env` and adjust:
- `MOCK_MODE=true` keeps responses offline with canned data.
- `OPENAI_API_KEY` (env-only) and `LLM_MODEL` enable live calls (requires network access).
- `APP_API_KEY` protects the API; send it via `x-api-key` header (frontend env `VITE_APP_API_KEY` can match).
- `ALLOWED_ORIGINS` controls CORS; accepts `*`, a single origin, comma-separated list (e.g., `https://a.com,https://b.com`), or a JSON array; defaults to `*` when blank.
- Data policy guardrail rejects inputs containing markers like `pii`, `ssn`, `confidential`, `customer`, etc. Provide public/anonymized context only.
- Per-request override: `POST /api/v1/risk/analyze?mode=mock|live|auto` (auto uses backend default).

### API
- `POST /api/v1/risk/analyze` - Request body matches `RiskRequest` in `backend/app/api/v1/schemas.py`. Returns `RiskResponse`.
- `GET /health` - basic health check.
- Example request:
```bash
curl -X POST "http://localhost:8000/api/v1/risk/analyze?mode=auto" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $APP_API_KEY" \
  -d '{
    "business_type": "Retail banking",
    "risk_domain": "Operational",
    "region": "North America",
    "size": "Mid",
    "maturity": "Defined",
    "objectives": "Create risk register",
    "context": "Launching new digital onboarding channel",
    "constraints": "Avoid storing PII",
    "requested_outputs": "Narrative + register + mitigations",
    "refinements": "Emphasize regulatory expectations"
  }'
```

## Frontend (Vite/React)
```bash
cd frontend
npm install
npm run dev
```
Configure `VITE_API_BASE` in `frontend/.env` (defaults to `http://localhost:8000/api/v1`). Optional: set `VITE_APP_API_KEY` to align with backend `APP_API_KEY` so browser requests include the header. Mode toggle: Mock / Live / Auto.

### Authentication
- Landing header shows Log in until authenticated; once signed in it switches to Log out and calls the configured Auth0/logout handler (`VITE_AUTH0_LOGOUT_URI` if set). Get started is available in both states.
- To avoid Auth0 consent prompts in local dev, mark the SPA as First-Party and allow skipping consent for the API, or remove the audience when not needed.
- Quick-start scenario buttons cover three contexts: digital onboarding (retail banking), cloud migration (compliance workload), and fintech fraud monitoring integration.
- Results view includes a simple evaluation matrix that flags structure/coverage issues (summary, risks, mitigations, KPIs, assumptions).

## Docker
```bash
docker-compose up --build
```

## Tests
```bash
cd backend
pytest
```
Tests cover health, mock analyze flow, and data-policy guardrail.

## Notes
- PoC only; no persistence. Keep data non-confidential/public.
- Prompt and schema live in `backend/app/services/prompt_engine.py` and `backend/app/api/v1/schemas.py`.
