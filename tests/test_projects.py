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
    assert manager.create_distill(project.id, video_ids[:1], "single").distill_modality == "text"
    assert manager.create_distill(project.id, video_ids[:1], "single", "multimodal").distill_modality == "multimodal"
    assert manager.create_distill(project.id, video_ids[:1], "single").generate_executable_assets is False
    assert manager.create_distill(project.id, video_ids[:1], "single", "text", True).generate_executable_assets is True


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


def test_multimodal_project_distill_keeps_traceable_frame_source(tmp_path: Path, monkeypatch):
    settings = Settings(
        data_dir=tmp_path, llm_base_url="https://relay.example/v1",
        llm_api_key="secret", llm_model="vision-model",
    )
    manager = PipelineManager(lambda: settings)
    project = manager.library.create_project(ProjectCreate(name="高中物理"))
    transcript = tmp_path / "lesson.json"
    transcript.write_text('{"segments":[{"start":10,"end":14,"text":"请看坐标轴"}]}', "utf-8")
    video_file = tmp_path / "lesson.mp4"
    video_file.write_bytes(b"video")
    frame = tmp_path / "frame.jpg"
    frame.write_bytes(b"frame")
    video = manager.library.add_video(
        project_id=project.id, title="图像课", source_url="https://example.com/video",
        job_id="ingest", course_item_id="1",
        artifacts={"transcript_json": str(transcript), "video": str(video_file)},
    )
    observed = {}

    monkeypatch.setattr("app.pipeline.extract_keyframes", lambda *args, **kwargs: {
        "fingerprint": "frames-v1", "strategy": "test",
        "frames": [{"frame_id": "F001", "timestamp": 12, "path": str(frame)}],
    })
    monkeypatch.setattr("app.pipeline.analyze_lesson", lambda *args, **kwargs: {
        "lesson_title": "图像课", "teaching_moves": [],
    })
    monkeypatch.setattr("app.pipeline.analyze_lesson_multimodal", lambda *args, **kwargs: {
        "lesson_title": "图像课", "visual_evidence": [{"frame_id": "F001"}],
    })
    monkeypatch.setattr("app.pipeline.distill_single_multimodal", lambda *args, **kwargs: {
        "suite_name": "多模态单课能力",
        "capabilities": [{
            "key": "visual-modeling", "name": "图像建模",
            "evidence": [{"lesson": "图像课", "frame_id": "F001", "timestamp": "00:12"}],
        }],
    })
    monkeypatch.setattr("app.pipeline.add_executable_assets", lambda client, suite, analyses, log, checkpoint: (
        suite["capabilities"][0].update({"executable_asset": {"applicable": False, "reason": "测试"}}),
        checkpoint(suite),
        suite,
    )[-1])

    def fake_build(suite, output_root, subject, provenance):
        observed["suite"] = suite
        observed["provenance"] = provenance
        return [{"name": "physics-visual-modeling", "valid": True, "errors": []}]

    monkeypatch.setattr("app.pipeline.build_skill_suite", fake_build)

    job = manager.create_distill(project.id, [video.id], "single", "multimodal", True)
    result = manager.run(job.id)

    evidence = observed["suite"]["capabilities"][0]["evidence"][0]
    assert result.status == "completed"
    assert result.distill_modality == "multimodal"
    assert result.generate_executable_assets is True
    assert evidence["frame_path"] == str(frame)
    assert evidence["frame_timestamp"] == "00:12"
    assert evidence["source_video_id"] == video.id
    assert observed["provenance"]["analysis_prompt_version"].startswith("teacher-visual-enrichment")
    assert observed["provenance"]["code_asset_prompt_version"].startswith("physics-executable")
