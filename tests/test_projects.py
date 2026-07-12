import asyncio
from pathlib import Path

import httpx
import pytest

from app.config import Settings
from app.main import create_app
from app.models import PipelineRequest, ProjectCreate
from app.pipeline import PipelineManager


def test_project_api_creates_persistent_workspace(tmp_path: Path):
    app = create_app(lambda: Settings(data_dir=tmp_path))

    async def request():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post("/api/projects", json={"name": "高中物理", "subject": "高中物理", "grade": "高中"})
            listed = await client.get("/api/projects")
            return created, listed

    created, listed = asyncio.run(request())
    assert created.status_code == 200
    assert created.json()["video_count"] == 0
    assert listed.json()[0]["name"] == "高中物理"


def test_distill_modes_enforce_video_counts(tmp_path: Path):
    manager = PipelineManager(lambda: Settings(data_dir=tmp_path))
    project = manager.library.create_project(ProjectCreate(name="高中物理"))
    video_ids = []
    for index in range(4):
        video = manager.library.add_video(
            project_id=project.id, title=f"课 {index}", source_url=f"https://example.com/{index}",
            job_id="ingest", course_item_id=str(index), artifacts={"transcript_json": str(tmp_path / f"{index}.json")},
        )
        video_ids.append(video.id)

    with pytest.raises(ValueError, match="只能选择 1 个"):
        manager.create_distill(project.id, video_ids[:2], "single")
    with pytest.raises(ValueError, match="至少需要选择 4 个"):
        manager.create_distill(project.id, video_ids[:3], "common")
    assert manager.create_distill(project.id, video_ids[:1], "single").kind == "distill"
    assert manager.create_distill(project.id, video_ids, "common").distill_mode == "common"


def test_new_distill_job_fails_with_clear_reason_without_api(tmp_path: Path):
    manager = PipelineManager(lambda: Settings(data_dir=tmp_path))
    project = manager.library.create_project(ProjectCreate(name="高中物理"))
    transcript = tmp_path / "lesson.json"
    transcript.write_text('{"segments": []}', "utf-8")
    video = manager.library.add_video(
        project_id=project.id, title="测试课", source_url="https://example.com/video",
        job_id="ingest", course_item_id="1", artifacts={"transcript_json": str(transcript)},
    )
    job = manager.create_distill(project.id, [video.id], "single")
    result = manager.run(job.id)
    assert result.status == "failed"
    assert "尚未配置中转 API" in result.error
