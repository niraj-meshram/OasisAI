# Architecture & Security Overview

## System shape
- **Frontend (Vite/React)** — Wizard UI collects scenario inputs, calls backend via `VITE_API_BASE` (default `http://localhost:8000/api/v1`), optional `VITE_APP_API_KEY` for browser calls.
- **Backend (FastAPI)** — `POST /api/v1/risk/analyze` (mock/live) and `GET /health`.
  - **Settings** (`app/core/config.py`): env-driven; `MOCK_MODE` defaults true; `ALLOWED_ORIGINS` parsed from `*`, comma list, or JSON; `APP_API_KEY` optional.
  - **Auth** (`app/core/auth.py`): optional API key via `x-api-key`; skipped if unset.
  - **Data policy** (`app/core/data_policy.py`): keyword guardrail rejecting obvious non-public/PII inputs.
  - **LLM adapter** (`app/services/llm_adapter.py`): mock mode returns canned response; live mode uses a pluggable provider registry (default OpenAI Chat Completions JSON mode) with API key from env only.
  - **Prompting** (`app/services/prompt_engine.py`): structured system/user prompts driving LLM responses.
- **Observability** — Trace ID per request (UUID) surfaced in responses; logging avoids payload content.

## Data flow
1) Browser submits scenario via fetch to backend.
2) `verify_api_key` checks header if `APP_API_KEY` set.
3) `analyze_risk` enforces data policy, resolves mode (mock/live/auto), and delegates to `run_llm`.
4) In live mode, adapter builds prompts and calls OpenAI; in mock mode, returns canned risks.
5) Response returned to UI; frontend renders narrative/register.

## Security & compliance notes
- **Secrets**: `OPENAI_API_KEY` read from env/registry only; never stored or logged. `APP_API_KEY` optional shared secret.
- **CORS**: Controlled via `ALLOWED_ORIGINS`; defaults to `*`; supports single/comma-list/JSON array.
- **Data policy**: Rejects inputs containing markers like `pii`, `ssn`, `confidential`, `customer`, etc. Keep inputs anonymized/public.
- **Logging**: Logs mode/trace IDs; no payload/body logging to reduce leak risk.
- **Network**: Live mode reaches OpenAI; disable by keeping `MOCK_MODE=true` or omitting `OPENAI_API_KEY`.
- **Dependencies**: FastAPI + pydantic v2; OpenAI client optional; pytest for tests.

## Scalability & ops
- Stateless FastAPI service; horizontal scale via containerization (Dockerfile implied by `docker-compose.yml`).
- Use a gateway for TLS, rate limiting, and WAF rules (e.g., block obvious PII strings).
- For live mode scale: add request queueing and caching of prompts/responses per trace ID.
- Add structured logging/metrics (e.g., OpenTelemetry) and feature flags to control live rollout.

## Extension ideas
- Add persistence for audit/logs with redaction.
- Add richer DLP/PII detection before LLM calls.
- Integrate per-tenant config and stronger auth (OIDC/JWT).
- Add evaluation harness comparing responses against acceptance criteria.
