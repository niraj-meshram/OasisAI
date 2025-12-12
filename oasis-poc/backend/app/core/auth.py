import logging
import secrets

from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings


logger = logging.getLogger(__name__)


async def verify_api_key(
    x_api_key: str | None = Header(default=None, alias="x-api-key"),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = settings.app_api_key
    if expected is None:
        logger.debug("API key verification skipped: APP_API_KEY not configured")
        return
    if not (x_api_key and secrets.compare_digest(x_api_key, expected)):
        logger.warning("API key verification failed: missing or invalid x-api-key header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )
