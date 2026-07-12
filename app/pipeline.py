from __future__ import annotations

import json
import shutil
import threading
import traceback
import uuid
from pathlib import Path
from typing import Callable

from .artifacts import VersionedJsonArtifact, atomic_write_json, content_fingerprint
from .config import Settings
from .distiller import analyze_lesson, distill_common, distill_single, offline_draft
from .downloader import download_item, valid_media
from .llm import LLMClient
from .library import LibraryStore
from .models import JobEvent, JobState, PipelineRequest
from .prompts import ANALYSIS_PROMPT_VERSION, DISTILL_PROMPT_VERSION
from .skill_builder import build_skill_suite
from .sources import discover
from .store import JobStore
from .transcriber import transcribe


class PipelineManager:
    def __init__(self, settings_loader: Callable[[], Settings]):
        self.settings_loader = settings_loader
        self.settings = settings_loader()
        self.store = JobStore(self.settings.data_dir)
        self.library = LibraryStore(self.settings.data_dir)
        self._threads: dict[str, threading.Thread] = {}
        self._cancel: set[str] = set()
        self._lock = threading.RLock()

    def create(self, request: PipelineRequest) -> JobState:
        job = JobState(id=uuid.uuid4().hex[:10], request=request)
        job.events.append(JobEvent(message="任务已创建，等待启动", level="info"))
        self.store.save(job)
        return job

    def create_ingest(self, project_id: str, request: PipelineRequest, items=None) -> JobState:
        self.library.get_project(project_id)
        job = JobState(
            id=uuid.uuid4().hex[:10], request=request, kind="ingest",
            project_id=project_id, items=items or [],
        )
        job.events.append(JobEvent(message="视频入库任务已创建：仅下载并转录，不调用蒸馏 API"))
        self.store.save(job)
        return job

    def create_distill(self, project_id: str, video_ids: list[str], mode: str) -> JobState:
        project = self.library.get_project(project_id)
        unique_ids = list(dict.fromkeys(video_ids))
        if mode == "single" and len(unique_ids) != 1:
            raise ValueError("单视频 Skill 必须且只能选择 1 个视频")
        if mode == "common" and len(unique_ids) < 4:
            raise ValueError("共性 Skills 至少需要选择 4 个视频")
        videos = [self.library.get_video(video_id) for video_id in unique_ids]
        if any(video.project_id != project_id for video in videos):
            raise ValueError("所选视频不属于当前项目")
        if any(video.deleted_at for video in videos):
            raise ValueError("所选视频已从项目视频池删除，请刷新后重新选择")
        job = JobState(
            id=uuid.uuid4().hex[:10],
            request=PipelineRequest(source_url=f"project://{project_id}", limit=len(videos), subject=project.subject, grade=project.grade),
            kind="distill", project_id=project_id, video_ids=unique_ids, distill_mode=mode,
        )
        label = "单视频 Skill" if mode == "single" else "共性 Skills"
        job.events.append(JobEvent(message=f"{label} 蒸馏任务已创建，已选择 {len(videos)} 个视频"))
        self.store.save(job)
        return job

    def start(self, job_id: str) -> JobState:
        job = self.store.get(job_id)
        with self._lock:
            thread = self._threads.get(job_id)
            if thread and thread.is_alive():
                return job
            self._cancel.discard(job_id)
            job.status = "queued"
            job.error = None
            self.store.save(job)
            thread = threading.Thread(target=self.run, args=(job_id,), name=f"pipeline-{job_id}", daemon=True)
            self._threads[job_id] = thread
            thread.start()
        return self.store.get(job_id)

    def cancel(self, job_id: str) -> JobState:
        with self._lock:
            self._cancel.add(job_id)
        job = self.store.get(job_id)
        self.store.event(job, "已请求取消；当前原子步骤结束后停止", "warning")
        return job

    def delete_project(self, project_id: str, permanent: bool = False) -> dict:
        self.library.get_project(project_id)
        if not permanent:
            self.library.delete_project(project_id)
            return {"deleted": True, "permanent": False, "released_bytes": 0}

        jobs = [job for job in self.store.list() if job.project_id == project_id]
        active = [job for job in jobs if job.status in {"queued", "running"}]
        if active:
            raise ValueError("项目仍有运行中的任务，请等待完成或取消任务后再永久删除")

        settings = self.settings_loader()
        root = settings.data_dir.resolve()
        videos = self.library.list_videos(project_id, include_deleted=True)
        targets: set[Path] = set()
        for job in jobs:
            targets.update({
                root / "media" / job.id,
                root / "transcripts" / job.id,
                root / "analysis" / job.id,
                root / "skills" / job.id,
                root / "projects" / project_id / "skills" / job.id,
            })
        for video in videos:
            targets.add(root / "analysis" / "videos" / f"{video.id}.json")
            targets.add(root / "analysis" / "videos" / f"{video.id}.meta.json")
            for value in video.artifacts.values():
                path = Path(str(value))
                targets.add(path if path.is_absolute() else root / path)

        safe_targets: list[Path] = []
        for target in targets:
            resolved = target.resolve()
            if resolved != root and root in resolved.parents and resolved.exists():
                safe_targets.append(resolved)
        files_to_delete: set[Path] = set()
        for target in safe_targets:
            if target.is_file():
                files_to_delete.add(target)
            elif target.is_dir():
                files_to_delete.update(path.resolve() for path in target.rglob("*") if path.is_file())
        released_bytes = sum(path.stat().st_size for path in files_to_delete if path.exists())
        for target in sorted(safe_targets, key=lambda path: len(path.parts), reverse=True):
            if not target.exists():
                continue
            shutil.rmtree(target) if target.is_dir() else target.unlink(missing_ok=True)
        for job in jobs:
            self.store.path(job.id).unlink(missing_ok=True)
        project_skills = root / "projects" / project_id
        if project_skills.exists():
            shutil.rmtree(project_skills)
        self.library.purge_project_catalog(project_id)
        return {
            "deleted": True,
            "permanent": True,
            "released_bytes": released_bytes,
            "video_count": len(videos),
            "job_count": len(jobs),
        }

    def _check_cancel(self, job: JobState) -> None:
        if job.id in self._cancel:
            job.status = "cancelled"
            job.stage = "cancelled"
            self.store.event(job, "任务已取消", "warning")
            raise PipelineCancelled()

    def _stage(self, job: JobState, stage: str, progress: float, message: str) -> None:
        job.stage = stage
        job.progress = round(progress, 3)
        self.store.event(job, message)

    def run(self, job_id: str) -> JobState:
        settings = self.settings_loader()
        job = self.store.get(job_id)
        job.status = "running"
        job.error = None
        self.store.save(job)
        try:
            if job.kind == "distill":
                return self._run_project_distill(job, settings)
            local_source = job.request.source_url.startswith("local://")
            self._stage(job, "discover", 0.02, "正在读取本地视频" if local_source else "正在解析课程列表")
            if not job.items:
                job.items = discover(
                    job.request.source_url,
                    job.request.limit,
                    cookie_browser=settings.video_cookie_browser,
                )
                if not job.items:
                    raise RuntimeError("未发现课程视频")
                self.store.event(job, f"发现 {len(job.items)} 个视频", "success")
            self._check_cancel(job)

            media_dir = settings.data_dir / "media" / job.id
            transcript_dir = settings.data_dir / "transcripts" / job.id
            analysis_dir = settings.data_dir / "analysis" / job.id
            analysis_dir.mkdir(parents=True, exist_ok=True)
            item_artifacts = job.artifacts.setdefault("items", {})
            transcripts: list[tuple[str, dict]] = []
            total = len(job.items)

            for idx, item in enumerate(job.items):
                self._check_cancel(job)
                job.current_item = idx + 1
                base = 0.08 + 0.37 * idx / total
                self._stage(job, "download", base, f"下载 {idx + 1}/{total} · {item.title}")
                record = item_artifacts.setdefault(item.id, {})
                media_ok = (
                    bool(record.get("video") and record.get("audio"))
                    and valid_media(Path(record["video"]), item.duration)
                    and valid_media(Path(record["audio"]), item.duration)
                )
                if not media_ok:
                    files = download_item(
                        item, media_dir,
                        max_height=job.request.max_video_height or settings.max_video_height,
                        log=lambda msg: self.store.event(job, msg),
                        cookie_browser=settings.video_cookie_browser,
                    )
                    record.update(files)
                    self.store.save(job)
                self._stage(job, "transcribe", base + 0.19 / total, f"转写 {idx + 1}/{total} · {item.title}")
                transcript = transcribe(
                    Path(record["audio"]), transcript_dir,
                    model_name=job.request.whisper_model or settings.whisper_model,
                    language=job.request.language,
                    log=lambda msg: self.store.event(job, msg),
                )
                record["transcript_json"] = str(transcript_dir / f"{Path(record['audio']).stem}.json")
                record["transcript_txt"] = str(transcript_dir / f"{Path(record['audio']).stem}.txt")
                record["transcript_srt"] = str(transcript_dir / f"{Path(record['audio']).stem}.srt")
                transcripts.append((item.title, transcript))
                self.store.event(job, f"《{item.title}》转写完成", "success")
                self.store.save(job)

            if job.kind == "ingest":
                video_ids = []
                for item in job.items:
                    record = item_artifacts[item.id]
                    video = self.library.add_video(
                        project_id=str(job.project_id), title=item.title, source_url=item.source_url,
                        source=item.source, duration=item.duration, cover_url=item.cover_url,
                        job_id=job.id, course_item_id=item.id,
                        artifacts={key: str(value) for key, value in record.items()}, metadata=item.metadata,
                    )
                    video_ids.append(video.id)
                job.artifacts["video_ids"] = video_ids
                job.status = "completed"
                job.stage = "completed"
                job.progress = 1
                self.store.event(job, f"入库完成：{len(video_ids)} 个视频已可用于蒸馏", "success")
                return self.store.save(job)

            self._check_cancel(job)
            client = LLMClient(
                settings.llm_base_url,
                settings.llm_api_key,
                settings.llm_model,
                timeout=settings.llm_timeout_seconds,
                max_attempts=settings.llm_max_attempts,
            )
            analyses: list[dict] = []
            if client.configured:
                for idx, (title, transcript) in enumerate(transcripts):
                    self._stage(job, "analyze", 0.56 + 0.22 * idx / total, f"教研分析 {idx + 1}/{total} · {title}")
                    target = analysis_dir / f"lesson-{idx + 1:03d}.json"
                    artifact = VersionedJsonArtifact(target, ANALYSIS_PROMPT_VERSION)
                    fingerprint = content_fingerprint(title, job.request.subject, transcript)
                    analysis = artifact.load(fingerprint)
                    if analysis is None:
                        analysis = analyze_lesson(client, title, job.request.subject, transcript, lambda msg: self.store.event(job, msg))
                        artifact.save(analysis, fingerprint)
                    else:
                        self.store.event(job, f"复用已验证的单课分析 · {title}")
                    analyses.append(analysis)
                self._stage(job, "distill", 0.82, "正在跨课程聚类共性教学能力")
                checkpoint = VersionedJsonArtifact(analysis_dir / "skill-suite.checkpoint.json", DISTILL_PROMPT_VERSION)
                distill_fingerprint = content_fingerprint(analyses)
                suite = distill_common(
                    client,
                    analyses,
                    lambda msg: self.store.event(job, msg),
                    initial_suite=checkpoint.load(distill_fingerprint),
                    checkpoint=lambda payload: checkpoint.save(payload, distill_fingerprint),
                )
            else:
                self._stage(job, "distill", 0.82, "未配置 API，生成带低置信度标记的离线草案")
                self.store.event(job, "配置中转 API 后重跑可获得语义级教学能力蒸馏", "warning")
                suite = offline_draft(transcripts)

            suite_file = analysis_dir / "skill-suite.json"
            atomic_write_json(suite_file, suite)
            self._check_cancel(job)
            self._stage(job, "package", 0.94, "打包并验证 Skills")
            skills_dir = settings.data_dir / "skills" / job.id
            provenance = {
                "job_id": job.id, "source_url": job.request.source_url,
                "courses": [{"id": item.id, "title": item.title, "url": item.source_url} for item in job.items],
                "whisper_model": job.request.whisper_model or settings.whisper_model,
                "llm_model": settings.llm_model if client.configured else None,
                "analysis_prompt_version": ANALYSIS_PROMPT_VERSION,
                "distill_prompt_version": DISTILL_PROMPT_VERSION,
                "analysis_file": str(suite_file),
            }
            built = build_skill_suite(suite, skills_dir, job.request.subject, provenance)
            if not built:
                raise RuntimeError("未生成任何 Skill：视频内容中缺少足够、可操作且有转写证据支持的教学方法")
            invalid = [item for item in built if not item.get("valid")]
            if invalid:
                detail = "; ".join(f"{item['name']}: {', '.join(item.get('errors', []))}" for item in invalid)
                raise RuntimeError(f"Skill 打包校验失败：{detail}")
            if client.configured:
                checkpoint.clear()
            job.artifacts.update({"analysis": str(suite_file), "skills_dir": str(skills_dir), "skills": built})
            job.status = "completed"
            job.stage = "completed"
            job.progress = 1
            self.store.event(job, f"流水线完成：生成 {len(built)} 个 Skills", "success")
            return self.store.save(job)
        except PipelineCancelled:
            return self.store.get(job_id)
        except Exception as exc:
            job.status = "failed"
            job.stage = "failed"
            job.error = str(exc)
            job.artifacts["traceback"] = traceback.format_exc(limit=8)
            self.store.event(job, f"任务失败：{exc}", "error")
            return self.store.save(job)

    def _run_project_distill(self, job: JobState, settings: Settings) -> JobState:
        """Distill selected, already-transcribed assets without downloading them again."""
        client = LLMClient(
            settings.llm_base_url, settings.llm_api_key, settings.llm_model,
            timeout=settings.llm_timeout_seconds, max_attempts=settings.llm_max_attempts,
        )
        if not client.configured:
            raise RuntimeError("无法蒸馏：尚未配置中转 API（Base URL、API Key 和模型均为必填）")
        videos = [self.library.get_video(video_id) for video_id in job.video_ids]
        if not videos:
            raise RuntimeError("无法蒸馏：没有选择视频")
        if job.distill_mode == "common" and len(videos) < 4:
            raise RuntimeError("无法蒸馏共性 Skills：至少需要 4 个已转录视频")
        if job.distill_mode == "single" and len(videos) != 1:
            raise RuntimeError("无法蒸馏单视频 Skill：必须且只能选择 1 个视频")

        analyses = []
        transcripts = []
        analysis_dir = settings.data_dir / "analysis" / job.id
        analysis_dir.mkdir(parents=True, exist_ok=True)
        job.items = []
        total = len(videos)
        for index, video in enumerate(videos, 1):
            self._check_cancel(job)
            transcript_path = Path(video.artifacts.get("transcript_json", ""))
            if not transcript_path.is_file():
                raise RuntimeError(f"无法蒸馏《{video.title}》：转写文件不存在，请重新入库")
            transcript = json.loads(transcript_path.read_text("utf-8"))
            transcripts.append((video.title, transcript))
            self._stage(job, "analyze", 0.08 + 0.62 * (index - 1) / total, f"教研分析 {index}/{total} · {video.title}")
            cached_dir = settings.data_dir / "analysis" / "videos"
            target = cached_dir / f"{video.id}.json"
            artifact = VersionedJsonArtifact(target, ANALYSIS_PROMPT_VERSION)
            fingerprint = content_fingerprint(video.title, job.request.subject, transcript)
            analysis = artifact.load(fingerprint)
            if analysis is None:
                analysis = analyze_lesson(client, video.title, job.request.subject, transcript, lambda msg: self.store.event(job, msg))
                artifact.save(analysis, fingerprint)
            else:
                self.store.event(job, f"复用单课分析 · {video.title}")
            analyses.append(analysis)

        label = "单视频教学能力" if job.distill_mode == "single" else "跨视频共性教学能力"
        self._stage(job, "distill", 0.74, f"正在提炼{label}")
        checkpoint = VersionedJsonArtifact(analysis_dir / "skill-suite.checkpoint.json", DISTILL_PROMPT_VERSION)
        fingerprint = content_fingerprint(job.distill_mode, analyses)
        distill_log = lambda msg: self.store.event(job, msg)
        if job.distill_mode == "single":
            suite = distill_single(
                client, analyses[0], distill_log,
                initial_suite=checkpoint.load(fingerprint),
                checkpoint=lambda payload: checkpoint.save(payload, fingerprint),
            )
        else:
            suite = distill_common(
                client, analyses, distill_log,
                initial_suite=checkpoint.load(fingerprint),
                checkpoint=lambda payload: checkpoint.save(payload, fingerprint),
            )
        suite["distill_mode"] = job.distill_mode
        suite_file = analysis_dir / "skill-suite.json"
        atomic_write_json(suite_file, suite)
        if not suite.get("capabilities"):
            if job.distill_mode == "single":
                raise RuntimeError("未生成任何单视频 Skill：API 已正常调用，但模型未从本课分析中返回带证据的可迁移教师行动；请检查转写和单课分析质量")
            raise RuntimeError("未生成任何共性 Skill：API 已正常调用，但所选视频之间没有足够明确、可操作的共同教学能力证据")

        self._stage(job, "package", 0.92, "正在打包并校验 Skills")
        skills_dir = settings.data_dir / "projects" / str(job.project_id) / "skills" / job.id
        provenance = {
            "job_id": job.id, "project_id": job.project_id, "distill_mode": job.distill_mode,
            "video_ids": job.video_ids,
            "courses": [{"id": video.id, "title": video.title, "url": video.source_url} for video in videos],
            "llm_model": settings.llm_model, "analysis_prompt_version": ANALYSIS_PROMPT_VERSION,
            "distill_prompt_version": DISTILL_PROMPT_VERSION, "analysis_file": str(suite_file),
        }
        built = build_skill_suite(suite, skills_dir, job.request.subject, provenance)
        if not built:
            raise RuntimeError("未生成任何 Skill：模型返回了空能力列表，可能是视频内容偏科普/闲聊，或转写证据不足")
        invalid = [item for item in built if not item.get("valid")]
        if invalid:
            detail = "; ".join(f"{item['name']}: {', '.join(item.get('errors', []))}" for item in invalid)
            raise RuntimeError(f"Skills 已生成但格式校验失败：{detail}")
        checkpoint.clear()
        job.artifacts.update({"analysis": str(suite_file), "skills_dir": str(skills_dir), "skills": built})
        job.status = "completed"
        job.stage = "completed"
        job.progress = 1
        self.store.event(job, f"蒸馏完成：生成 {len(built)} 个 Skills", "success")
        return self.store.save(job)


class PipelineCancelled(Exception):
    pass
