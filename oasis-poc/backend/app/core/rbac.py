from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from dataclasses import dataclass
from threading import Lock
from typing import Any, Literal, cast

import httpx
from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

Role = Literal["admin", "analyst", "reviewer"]


ROLE_ALIASES: dict[str, Role] = {
    "admin": "admin",
    "administrator": "admin",
    "governance": "admin",
    "riskanalyst": "analyst",
    "analyst": "analyst",
    "risk_analyst": "analyst",
    "risk-analyst": "analyst",
    "reviewer": "reviewer",
    "qc": "reviewer",
}


@dataclass(frozen=True)
class UserPrincipal:
    sub: str
    email: str | None
    roles: set[Role]
    raw_claims: dict[str, Any]


def _b64url_decode(data: str) -> bytes:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8"))


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _normalize_role(value: str) -> Role | None:
    normalized = "".join(ch for ch in value.strip().lower() if ch.isalnum() or ch in {"_", "-"})
    normalized = normalized.replace("-", "").replace("_", "")
    role = ROLE_ALIASES.get(normalized)
    if role:
        return role
    if "admin" in normalized:
        return "admin"
    if "analyst" in normalized:
        return "analyst"
    if "review" in normalized or "qc" in normalized:
        return "reviewer"
    return None


def _extract_roles(claims: dict[str, Any], settings: Settings) -> set[Role]:
    role_sources: list[object] = []
    if settings.jwt_roles_claim:
        role_sources.append(claims.get(settings.jwt_roles_claim))
    else:
        # common claims for roles/groups/permissions in PoCs
        role_sources.extend(
            [
                claims.get("roles"),
                claims.get("groups"),
                claims.get("permissions"),
                claims.get("https://oasis.ai/roles"),
            ]
        )
        # Auth0-style custom claim keys (e.g., https://myapp.example.com/roles).
        role_sources.extend(
            [
                value
                for key, value in claims.items()
                if isinstance(key, str) and key.endswith(("/roles", "/groups", "/permissions"))
            ]
        )

    roles: set[Role] = set()
    for source in role_sources:
        if not source:
            continue
        if isinstance(source, str):
            for part in (p.strip() for p in source.split(",")):
                role = _normalize_role(part)
                if role:
                    roles.add(role)
            continue
        if isinstance(source, list):
            for item in source:
                if isinstance(item, str):
                    role = _normalize_role(item)
                    if role:
                        roles.add(role)
            continue
        if isinstance(source, dict):
            for nested_key in ("roles", "groups", "permissions"):
                nested_source = source.get(nested_key)
                if isinstance(nested_source, str):
                    for part in (p.strip() for p in nested_source.split(",")):
                        role = _normalize_role(part)
                        if role:
                            roles.add(role)
                elif isinstance(nested_source, list):
                    for item in nested_source:
                        if isinstance(item, str):
                            role = _normalize_role(item)
                            if role:
                                roles.add(role)
            continue
    return roles


def _validate_standard_claims(claims: dict[str, Any], settings: Settings) -> None:
    now = int(time.time())

    exp = claims.get("exp")
    if isinstance(exp, (int, float)) and int(exp) < now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired.")

    nbf = claims.get("nbf")
    if isinstance(nbf, (int, float)) and int(nbf) > now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token not yet valid.")

    if settings.jwt_issuer:
        iss = claims.get("iss")
        if isinstance(iss, str) and iss.rstrip("/") != settings.jwt_issuer.rstrip("/"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token issuer.")

    if settings.jwt_audience:
        aud = claims.get("aud")
        ok = False
        if isinstance(aud, str):
            ok = aud == settings.jwt_audience
        elif isinstance(aud, list):
            ok = settings.jwt_audience in [a for a in aud if isinstance(a, str)]
        if not ok:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token audience.")


def _decode_hs256(token: str, settings: Settings) -> dict[str, Any]:
    if not settings.jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OASIS_JWT_SECRET must be configured for HS256 validation.",
        )
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format.")

    header_b64, payload_b64, signature_b64 = parts
    try:
        header = json.loads(_b64url_decode(header_b64))
        payload = json.loads(_b64url_decode(payload_b64))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token encoding.") from exc

    alg = header.get("alg")
    if alg != "HS256":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unsupported token algorithm.")

    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    expected_sig = hmac.new(settings.jwt_secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    expected_b64 = _b64url_encode(expected_sig)
    if not hmac.compare_digest(expected_b64, signature_b64):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature.")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token claims.")

    _validate_standard_claims(payload, settings)
    return cast(dict[str, Any], payload)


_JWKS_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_JWKS_LOCK = Lock()
_JWKS_TTL_SECONDS = 3600


def _jwks_url(settings: Settings) -> str:
    if settings.jwt_jwks_url:
        return settings.jwt_jwks_url
    if not settings.jwt_issuer:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OASIS_JWT_ISSUER must be configured (or provide OASIS_JWT_JWKS_URL).",
        )
    issuer = settings.jwt_issuer.rstrip("/")
    return f"{issuer}/.well-known/jwks.json"


def _get_jwks(settings: Settings) -> dict[str, Any]:
    url = _jwks_url(settings)
    with _JWKS_LOCK:
        cached = _JWKS_CACHE.get(url)
        if cached and (time.time() - cached[0]) < _JWKS_TTL_SECONDS:
            return cached[1]

    try:
        res = httpx.get(url, timeout=5.0)
        res.raise_for_status()
        jwks = res.json()
    except Exception as exc:
        logger.warning("rbac.jwks_fetch_failed url=%s error=%s", url, str(exc))
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="JWKS fetch failed.") from exc

    if not isinstance(jwks, dict) or "keys" not in jwks:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Invalid JWKS payload.")

    with _JWKS_LOCK:
        _JWKS_CACHE[url] = (time.time(), jwks)
    return jwks


def _decode_rs256(token: str, settings: Settings) -> dict[str, Any]:
    try:
        from jose import jwt  # type: ignore
    except Exception as exc:  # pragma: no cover - optional dependency
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="RS256 JWT validation requires python-jose. Install python-jose[cryptography].",
        ) from exc

    try:
        unverified_header = jwt.get_unverified_header(token)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token header.") from exc

    kid = unverified_header.get("kid")
    if not isinstance(kid, str) or not kid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token key id (kid).")

    jwks = _get_jwks(settings)
    rsa_key: dict[str, Any] | None = None
    for key in jwks.get("keys", []):
        if isinstance(key, dict) and key.get("kid") == kid:
            rsa_key = key
            break
    if rsa_key is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown token key id (kid).")

    try:
        claims = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=settings.jwt_audience or None,
            issuer=settings.jwt_issuer or None,
            options={
                "verify_aud": bool(settings.jwt_audience),
                "verify_iss": bool(settings.jwt_issuer),
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token validation failed.") from exc

    if not isinstance(claims, dict):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token claims.")
    return cast(dict[str, Any], claims)


def _decode_and_verify(token: str, settings: Settings) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format.")
    header_b64 = parts[0]
    try:
        header = json.loads(_b64url_decode(header_b64))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token header.") from exc

    alg = header.get("alg")
    if alg == "HS256":
        return _decode_hs256(token, settings)
    if alg == "RS256":
        return _decode_rs256(token, settings)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unsupported token algorithm.")


def get_current_user(
    authorization: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None, alias="x-user-role"),
    settings: Settings = Depends(get_settings),
) -> UserPrincipal:
    """
    Role-based identity for PoC.

    - OASIS_AUTH_MODE=disabled: assigns roles from OASIS_DEFAULT_ROLES (default: analyst)
    - OASIS_AUTH_MODE=api_key: same as disabled, but intended for API-key protected environments
    - OASIS_AUTH_MODE=jwt: validates Bearer JWT and extracts roles/groups claim
    """
    if settings.auth_mode in {"disabled", "api_key"}:
        roles: set[Role] = set()
        if x_user_role:
            for part in (p.strip() for p in x_user_role.split(",")):
                role = _normalize_role(part)
                if role:
                    roles.add(role)
        if not roles:
            for r in settings.default_roles:
                role = _normalize_role(r)
                if role:
                    roles.add(role)
        if not roles:
            roles = {"analyst"}
        return UserPrincipal(sub="demo", email=None, roles=roles, raw_claims={})

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token.")

    claims = _decode_and_verify(token, settings)
    roles = _extract_roles(claims, settings)
    if not roles:
        # keep behavior explicit; roles should come from IdP
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User has no assigned roles.")

    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject (sub).")
    email = claims.get("email")
    if not isinstance(email, str):
        email = None
    return UserPrincipal(sub=sub, email=email, roles=roles, raw_claims=claims)


def require_roles(*allowed: Role):
    allowed_set = set(allowed)

    def _dep(user: UserPrincipal = Depends(get_current_user)) -> UserPrincipal:
        if "admin" in user.roles:
            return user
        if not user.roles.intersection(allowed_set):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role for this action.")
        return user

    return _dep
