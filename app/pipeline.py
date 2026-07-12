from __future__ import annotations

import threading
import traceback
import uuid
from pathlib import Path
from typing import Callable

from .artifacts import VersionedJsonArtifact, atomic_write_json, content_fingerprint
from .config import Settings
from .distiller import analyze_lesson, distill_common, offline_draft
from .downloader import download_item, valid_media
from .llm import LLMClient
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
        self._threads: dict[str, threading.Thread] = {}
        self._cancel: set[str] = set()
        self._lock = threading.RLock()

    def create(self, request: PipelineRequest) -> JobState:
        job = JobState(id=uuid.uuid4().hex[:10], request=request)
        job.events.append(JobEvent(message="任务已创建，等待启动", level="info"))
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


class PipelineCancelled(Exception):
    pass
