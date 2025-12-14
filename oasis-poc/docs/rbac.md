# RBAC (PoC)

Roles:
- `admin`: full access (templates + settings/audit + assessments + review)
- `analyst`: create/run assessments + export
- `reviewer`: view results/provenance + compare versions + submit feedback

## Backend enforcement

RBAC is enforced server-side via `app/core/rbac.py` and per-route role checks.

Auth modes:
- `OASIS_AUTH_MODE=disabled`: no JWT required; roles come from `OASIS_DEFAULT_ROLES` (or `x-user-role` header)
- `OASIS_AUTH_MODE=api_key`: same as disabled, typically paired with `APP_API_KEY`
- `OASIS_AUTH_MODE=jwt`: require `Authorization: Bearer <jwt>` and enforce roles from token claims

JWT settings:
- `OASIS_JWT_ISSUER`, `OASIS_JWT_AUDIENCE`
- `OASIS_JWT_JWKS_URL` (optional; otherwise uses `ISSUER/.well-known/jwks.json`)
- `OASIS_JWT_ROLES_CLAIM` (optional; defaults to checking `roles`, `groups`, `permissions`)

## Frontend UX gating

Landing page shows role-based entry tiles. This is UX only; the backend is the security boundary.

Local demo (no Auth0):
- Set `VITE_DEMO_ROLES=admin,analyst,reviewer` (comma-separated).

Auth0:
- Ensure your ID/access token includes roles/groups in a claim.
- Set `VITE_AUTH0_ROLES_CLAIM` to the claim key (example: `https://oasis.ai/roles`).

