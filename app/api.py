from __future__ import annotations

import io
import re
import zipfile
from collections.abc import Callable
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from .config import Settings
from .downloader import check_runtime
from .llm import LLMClient
from .models import (
    BrowserCookieProbeRequest, DiscoverRequest, DistillRequest, LocalPipelineRequest,
    PipelineRequest, ProjectCreate, ProjectLocalVideoRequest, ProjectVideoRequest,
    SearchRequest, SettingsUpdate, VideoDeleteRequest,
)
from .pipeline import PipelineManager
from .sources import discover, probe_browser_cookies, search_bilibili, supported_sites
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
            settings = settings_loader()
            return {
                "items": [
                    item.model_dump()
                    for item in discover(payload.url, payload.limit, settings.video_cookie_browser)
                ]
            }
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/video-cookies/test")
    def test_video_cookies(payload: BrowserCookieProbeRequest):
        try:
            return probe_browser_cookies(payload.url, payload.browser)
        except RuntimeError as exc:
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

    @router.get("/projects")
    def list_projects():
        jobs = manager.store.list()
        result = []
        for project in manager.library.list_projects():
            videos = manager.library.list_videos(project.id)
            skills = sum(
                sum(not manager.library.skill_deleted(job.id, skill.get("name", "")) for skill in job.artifacts.get("skills", [])) for job in jobs
                if job.project_id == project.id and job.kind == "distill" and job.status == "completed"
            )
            result.append(project.model_dump() | {"video_count": len(videos), "skill_count": skills})
        return result

    @router.post("/projects")
    def create_project(payload: ProjectCreate):
        return manager.library.create_project(payload).model_dump() | {"video_count": 0, "skill_count": 0}

    @router.delete("/projects/{project_id}")
    def delete_project(project_id: str, permanent: bool = False):
        try:
            result = manager.delete_project(project_id, permanent=permanent)
        except KeyError as exc:
            raise HTTPException(404, "项目不存在") from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        return result | {"project_id": project_id}

    @router.get("/projects/{project_id}")
    def get_project(project_id: str):
        try:
            project = manager.library.get_project(project_id)
        except KeyError as exc:
            raise HTTPException(404, "项目不存在") from exc
        videos = manager.library.list_videos(project_id)
        return project.model_dump() | {"video_count": len(videos)}

    @router.get("/projects/{project_id}/videos")
    def list_project_videos(project_id: str):
        try:
            manager.library.get_project(project_id)
        except KeyError as exc:
            raise HTTPException(404, "项目不存在") from exc
        return [video.model_dump() for video in manager.library.list_videos(project_id)]

    @router.post("/projects/{project_id}/videos")
    def import_project_videos(project_id: str, payload: ProjectVideoRequest):
        try:
            project = manager.library.get_project(project_id)
        except KeyError as exc:
            raise HTTPException(404, "项目不存在") from exc
        request = PipelineRequest(
            source_url=payload.source_url, limit=payload.limit, subject=project.subject,
            grade=project.grade, whisper_model=payload.whisper_model, language=payload.language,
        )
        job = manager.create_ingest(project_id, request)
        return manager.start(job.id).model_dump()

    @router.delete("/projects/{project_id}/videos")
    def delete_project_videos(project_id: str, payload: VideoDeleteRequest):
        try:
            manager.library.get_project(project_id)
            deleted = manager.library.delete_videos(project_id, payload.video_ids)
        except KeyError as exc:
            raise HTTPException(404, "项目或视频不存在") from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return {"deleted_count": len(deleted), "video_ids": deleted}

    @router.post("/projects/{project_id}/videos/local")
    def import_local_project_videos(project_id: str, payload: ProjectLocalVideoRequest):
        try:
            project = manager.library.get_project(project_id)
        except KeyError as exc:
            raise HTTPException(404, "项目不存在") from exc
        settings = settings_loader()
        uploads = UploadStore(settings.data_dir, settings.max_upload_size_mb)
        try:
            items = uploads.course_items(payload.upload_id)
        except UploadError as exc:
            raise HTTPException(400, str(exc)) from exc
        if not items:
            raise HTTPException(404, "本地视频上传批次不存在或没有可用视频")
        request = PipelineRequest(
            source_url=f"local://{payload.upload_id}", limit=len(items), subject=project.subject,
            grade=project.grade, whisper_model=payload.whisper_model, language=payload.language,
        )
        job = manager.create_ingest(project_id, request, items)
        return manager.start(job.id).model_dump()

    @router.post("/projects/{project_id}/distill")
    def distill_project(project_id: str, payload: DistillRequest):
        try:
            job = manager.create_distill(project_id, payload.video_ids, payload.mode)
        except KeyError as exc:
            raise HTTPException(404, "项目或视频不存在") from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return manager.start(job.id).model_dump()

    @router.get("/projects/{project_id}/skills")
    def list_project_skills(project_id: str):
        try:
            manager.library.get_project(project_id)
        except KeyError as exc:
            raise HTTPException(404, "项目不存在") from exc
        result = []
        for job in manager.store.list():
            if job.project_id != project_id or job.kind != "distill" or job.status != "completed":
                continue
            for skill in job.artifacts.get("skills", []):
                if manager.library.skill_deleted(job.id, skill.get("name", "")):
                    continue
                result.append(skill | {
                    "job_id": job.id, "distill_mode": job.distill_mode,
                    "video_ids": job.video_ids, "created_at": job.updated_at,
                })
        return result

    @router.delete("/projects/{project_id}/skills/{job_id}/{skill_name}")
    def delete_project_skill(project_id: str, job_id: str, skill_name: str):
        if not re.fullmatch(r"[a-z0-9-]{1,64}", skill_name):
            raise HTTPException(400, "Skill 名称无效")
        job = job_or_404(job_id)
        if job.project_id != project_id:
            raise HTTPException(400, "Skill 不属于当前项目")
        skill = next((item for item in job.artifacts.get("skills", []) if item.get("name") == skill_name), None)
        if not skill:
            raise HTTPException(404, "Skill 不存在")
        manager.library.delete_skill(job_id, skill_name)
        return {"deleted": True, "job_id": job_id, "skill_name": skill_name}

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

    @router.get("/jobs/{job_id}/skills/{skill_name}/download")
    def download_skill(job_id: str, skill_name: str):
        if not re.fullmatch(r"[a-z0-9-]{1,64}", skill_name):
            raise HTTPException(400, "Skill 名称无效")
        job = job_or_404(job_id)
        skill = next((item for item in job.artifacts.get("skills", []) if item.get("name") == skill_name), None)
        if not skill or manager.library.skill_deleted(job_id, skill_name):
            raise HTTPException(404, "Skill 不存在或已删除")
        root_value = job.artifacts.get("skills_dir")
        root = Path(str(root_value)).resolve() if root_value else None
        folder = Path(str(skill.get("path", ""))).resolve()
        if not root or root not in folder.parents or not folder.is_dir():
            raise HTTPException(400, "Skill 路径无效")
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
            for path in folder.rglob("*"):
                if path.is_file():
                    bundle.write(path, Path(skill_name) / path.relative_to(folder))
        archive.seek(0)
        return StreamingResponse(archive, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{skill_name}.zip"'})

    @router.post("/jobs/{job_id}/start")
    def start_job(job_id: str):
        job_or_404(job_id)
        return manager.start(job_id).model_dump()

    @router.post("/jobs/{job_id}/cancel")
    def cancel_job(job_id: str):
        job_or_404(job_id)
        return manager.cancel(job_id).model_dump()

    return router
