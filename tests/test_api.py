import asyncio
from pathlib import Path

import httpx

from app.config import Settings
from app.main import create_app


def test_application_factory_exposes_api_without_secret(tmp_path: Path):
    settings = Settings(data_dir=tmp_path, llm_api_key="secret", llm_base_url="https://relay.example/v1")
    app = create_app(lambda: settings)

    async def request():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get("/api/health"), await client.get("/api/settings")

    health, public = asyncio.run(request())

    assert health.status_code == 200
    assert health.json()["api_configured"] is True
    assert public.status_code == 200
    assert "llm_api_key" not in public.json()
    assert public.json()["llm_api_key_set"] is True


def test_application_factory_registers_local_upload_routes(tmp_path: Path):
    app = create_app(lambda: Settings(data_dir=tmp_path))
    paths = app.openapi()["paths"]

    assert "/api/uploads" in paths
    assert "/api/jobs/local" in paths
    assert "/api/jobs/{job_id}/skills/{skill_name}" in paths
    assert "/api/sources" in paths
    assert "/api/video-cookies/test" in paths
