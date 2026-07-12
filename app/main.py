from __future__ import annotations

from collections.abc import Callable

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import create_api_router
from .config import ROOT, Settings, load_settings
from .pipeline import PipelineManager


def create_app(settings_loader: Callable[[], Settings] = load_settings) -> FastAPI:
    app = FastAPI(title="教学 Skill 工坊", version="0.3.0")
    manager = PipelineManager(settings_loader)
    app.state.pipeline_manager = manager
    app.include_router(create_api_router(manager, settings_loader))

    frontend = ROOT / "frontend"
    if frontend.exists():
        app.mount("/assets", StaticFiles(directory=frontend), name="frontend-assets")

    @app.get("/{path:path}")
    def spa(path: str):
        candidate = (frontend / path).resolve()
        if path and candidate.is_file() and frontend.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(frontend / "index.html")

    return app


app = create_app()
