from __future__ import annotations

from collections.abc import Callable

from fastapi import FastAPI

from .api import create_api_router
from .config import Settings, load_settings
from .pipeline import PipelineManager


def create_app(settings_loader: Callable[[], Settings] = load_settings) -> FastAPI:
    app = FastAPI(
        title="AnyTeacher Internal Worker",
        version="0.5.0",
        docs_url=None,
        redoc_url=None,
    )
    manager = PipelineManager(settings_loader)
    app.state.pipeline_manager = manager
    app.include_router(create_api_router(manager, settings_loader))

    return app


app = create_app()
