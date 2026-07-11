from __future__ import annotations

import re
from collections.abc import Callable
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from .config import Settings
from .downloader import check_runtime
from .llm import LLMClient
from .models import DiscoverRequest, LocalPipelineRequest, PipelineRequest, SearchRequest, SettingsUpdate
from .pipeline import PipelineManager
from .sources import discover, search_bilibili, supported_sites
from .upload_store import UploadError, UploadStore


SettingsLoader = Callable[[], Settings]


def create_api_router(manager: PipelineManager, settings_loader: SettingsLoader) -> APIRouter:
    router = APIRouter(prefix="/api")

    def job_or_404(job_id: str):
        try:
            return manager.store.get(job_id)
        except KeyError as exc:
            raise HTTPException(404, "任务不存在") from exc

    @router.get("/health")
    def health():
        settings = settings_loader()
        return {
            "ok": True,
            "runtime": check_runtime(),
            "api_configured": bool(settings.llm_api_key and settings.llm_base_url),
        }

    @router.get("/settings")
    def get_settings():
        return settings_loader().public()

    @router.put("/settings")
    def save_settings(payload: SettingsUpdate):
        settings = settings_loader()
        settings.save_runtime(payload.model_dump(exclude_none=True))
        return settings_loader().public()

    @router.post("/settings/test")
    def test_settings(payload: SettingsUpdate | None = None):
        settings = settings_loader()
        values = payload.model_dump(exclude_none=True) if payload else {}
        client = LLMClient(
            str(values.get("llm_base_url") or settings.llm_base_url),
            str(values.get("llm_api_key") or settings.llm_api_key),
            str(values.get("llm_model") or settings.llm_model),
            timeout=int(values.get("llm_timeout_seconds") or settings.llm_timeout_seconds),
            max_attempts=int(values.get("llm_max_attempts") or settings.llm_max_attempts),
        )
        try:
            return client.test()
        except RuntimeError as exc:
            raise HTTPException(502, str(exc)) from exc

    @router.post("/discover")
    def discover_api(payload: DiscoverRequest):
        try:
            return {"items": [item.model_dump() for item in discover(payload.url, payload.limit)]}
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.get("/sources")
    def list_supported_sources():
        return {
            "sites": supported_sites(),
            "notice": "仅支持公开、无 DRM 且无需登录的页面；实际可用性取决于站点变化和 yt-dlp 版本。",
        }

    @router.post("/search")
    def search_api(payload: SearchRequest):
        try:
            return {"items": search_bilibili(payload.keyword, payload.limit)}
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.get("/jobs")
    def list_jobs():
        return [job.model_dump() for job in manager.store.list()]

    @router.post("/jobs")
    def create_job(payload: PipelineRequest):
        job = manager.create(payload)
        return manager.start(job.id).model_dump()

    @router.post("/uploads")
    async def upload_local_video(request: Request, filename: str, upload_id: str | None = None):
        settings = settings_loader()
        uploads = UploadStore(settings.data_dir, settings.max_upload_size_mb)
        try:
            result = await uploads.save(filename, request.stream(), upload_id)
        except UploadError as exc:
            raise HTTPException(400, str(exc)) from exc
        return {
            "upload_id": result.upload_id,
            "filename": result.filename,
            "size": result.size,
            "duration": result.duration,
        }

    @router.post("/jobs/local")
    def create_local_job(payload: LocalPipelineRequest):
        settings = settings_loader()
        uploads = UploadStore(settings.data_dir, settings.max_upload_size_mb)
        try:
            items = uploads.course_items(payload.upload_id)
        except UploadError as exc:
            raise HTTPException(400, str(exc)) from exc
        if not items:
            raise HTTPException(404, "本地视频上传批次不存在或没有可用视频")
        if len(items) > 50:
            raise HTTPException(400, "单次最多处理 50 个本地视频")
        request = PipelineRequest(
            source_url=f"local://{payload.upload_id}",
            limit=len(items),
            subject=payload.subject,
            grade=payload.grade,
            whisper_model=payload.whisper_model,
            language=payload.language,
        )
        job = manager.create(request)
        job.items = items
        manager.store.event(job, f"已接收 {len(items)} 个本地视频", "success")
        return manager.start(job.id).model_dump()

    @router.get("/jobs/{job_id}")
    def get_job(job_id: str):
        return job_or_404(job_id).model_dump()

    @router.get("/jobs/{job_id}/skills/{skill_name}")
    def get_skill_contents(job_id: str, skill_name: str):
        if not re.fullmatch(r"[a-z0-9-]{1,64}", skill_name):
            raise HTTPException(400, "Skill 名称无效")
        job = job_or_404(job_id)
        skill = next((item for item in job.artifacts.get("skills", []) if item.get("name") == skill_name), None)
        if not skill:
            raise HTTPException(404, "Skill 不存在")
        root_value = job.artifacts.get("skills_dir")
        if not root_value:
            raise HTTPException(404, "Skill 目录不存在")
        root = Path(str(root_value)).resolve()
        folder = Path(str(skill.get("path", ""))).resolve()
        if root not in folder.parents or not folder.is_dir():
            raise HTTPException(400, "Skill 路径无效")
        files = {
            "skill": folder / "SKILL.md",
            "pattern": folder / "references" / "pattern.md",
            "evidence": folder / "references" / "evidence.md",
        }
        return {
            "name": skill_name,
            "display_name": skill.get("display_name", skill_name),
            "valid": bool(skill.get("valid")),
            "errors": skill.get("errors", []),
            "documents": {key: path.read_text("utf-8") if path.exists() else "" for key, path in files.items()},
        }

    @router.post("/jobs/{job_id}/start")
    def start_job(job_id: str):
        job_or_404(job_id)
        return manager.start(job_id).model_dump()

    @router.post("/jobs/{job_id}/cancel")
    def cancel_job(job_id: str):
        job_or_404(job_id)
        return manager.cancel(job_id).model_dump()

    return router
