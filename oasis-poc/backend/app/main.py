import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.routes import router as api_router
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.project_name, version="0.1.0")

    allow_credentials = "*" not in settings.allowed_origins
    if not allow_credentials and settings.allowed_origins != ["*"]:
        logging.getLogger(__name__).warning(
            "CORS allow_credentials disabled because wildcard origin present: %s",
            settings.allowed_origins,
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    dist_path = Path(__file__).resolve().parent.parent / "frontend_dist"
    if dist_path.exists():
        assets_dir = dist_path / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/", include_in_schema=False)
        async def serve_spa_root() -> FileResponse:
            return FileResponse(dist_path / "index.html")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa_paths(full_path: str) -> FileResponse:
            candidate = (dist_path / full_path).resolve()
            try:
                candidate.relative_to(dist_path)
            except ValueError:
                return FileResponse(dist_path / "index.html")

            if candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(dist_path / "index.html")
    else:
        logging.getLogger(__name__).info(
            "Frontend build directory not found; API will serve without SPA bundle."
        )

    return app


app = create_app()
