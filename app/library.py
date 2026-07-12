from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path

from .artifacts import atomic_write_json
from .models import Project, ProjectCreate, VideoAsset, now_iso


class LibraryStore:
    """Small file-backed catalog for projects and reusable video assets."""

    def __init__(self, data_dir: Path):
        self.root = data_dir / "library"
        self.projects_dir = self.root / "projects"
        self.videos_dir = self.root / "videos"
        self.skill_deletions_path = self.root / "skill-deletions.json"
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        self.videos_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    def create_project(self, payload: ProjectCreate) -> Project:
        project = Project(id=uuid.uuid4().hex[:10], **payload.model_dump())
        self.save_project(project)
        return project

    def save_project(self, project: Project) -> Project:
        with self._lock:
            project.updated_at = now_iso()
            atomic_write_json(self.projects_dir / f"{project.id}.json", project.model_dump())
        return project

    def get_project(self, project_id: str, include_deleted: bool = False) -> Project:
        path = self.projects_dir / f"{project_id}.json"
        if not path.exists():
            raise KeyError(project_id)
        project = Project.model_validate_json(path.read_text("utf-8"))
        if project.deleted_at and not include_deleted:
            raise KeyError(project_id)
        return project

    def list_projects(self) -> list[Project]:
        projects = []
        for path in self.projects_dir.glob("*.json"):
            try:
                project = Project.model_validate_json(path.read_text("utf-8"))
                if not project.deleted_at:
                    projects.append(project)
            except Exception:
                continue
        return sorted(projects, key=lambda item: item.updated_at, reverse=True)

    def save_video(self, video: VideoAsset) -> VideoAsset:
        with self._lock:
            video.updated_at = now_iso()
            atomic_write_json(self.videos_dir / f"{video.id}.json", video.model_dump())
            project = self.get_project(video.project_id)
            self.save_project(project)
        return video

    def add_video(self, **values) -> VideoAsset:
        existing = next(
            (item for item in self.list_videos(values["project_id"]) if item.source_url == values["source_url"]),
            None,
        )
        video = VideoAsset(id=existing.id if existing else uuid.uuid4().hex[:12], **values)
        return self.save_video(video)

    def get_video(self, video_id: str) -> VideoAsset:
        path = self.videos_dir / f"{video_id}.json"
        if not path.exists():
            raise KeyError(video_id)
        return VideoAsset.model_validate_json(path.read_text("utf-8"))

    def list_videos(self, project_id: str, include_deleted: bool = False) -> list[VideoAsset]:
        videos = []
        for path in self.videos_dir.glob("*.json"):
            try:
                video = VideoAsset.model_validate_json(path.read_text("utf-8"))
                if video.project_id == project_id and (include_deleted or not video.deleted_at):
                    videos.append(video)
            except Exception:
                continue
        return sorted(videos, key=lambda item: item.created_at, reverse=True)

    def delete_videos(self, project_id: str, video_ids: list[str]) -> list[str]:
        deleted: list[str] = []
        with self._lock:
            for video_id in dict.fromkeys(video_ids):
                video = self.get_video(video_id)
                if video.project_id != project_id:
                    raise ValueError(f"视频 {video_id} 不属于当前项目")
                if not video.deleted_at:
                    video.deleted_at = now_iso()
                    self.save_video(video)
                    deleted.append(video_id)
        return deleted

    def delete_project(self, project_id: str) -> Project:
        with self._lock:
            project = self.get_project(project_id)
            self.delete_videos(project_id, [video.id for video in self.list_videos(project_id)])
            project.deleted_at = now_iso()
            return self.save_project(project)

    def purge_project_catalog(self, project_id: str) -> None:
        with self._lock:
            self.get_project(project_id)
            for video in self.list_videos(project_id, include_deleted=True):
                (self.videos_dir / f"{video.id}.json").unlink(missing_ok=True)
            (self.projects_dir / f"{project_id}.json").unlink(missing_ok=True)

    @staticmethod
    def skill_key(job_id: str, skill_name: str) -> str:
        return f"{job_id}:{skill_name}"

    def _deleted_skills(self) -> set[str]:
        if not self.skill_deletions_path.exists():
            return set()
        try:
            values = json.loads(self.skill_deletions_path.read_text("utf-8"))
            return {str(value) for value in values} if isinstance(values, list) else set()
        except (OSError, json.JSONDecodeError):
            return set()

    def skill_deleted(self, job_id: str, skill_name: str) -> bool:
        return self.skill_key(job_id, skill_name) in self._deleted_skills()

    def delete_skill(self, job_id: str, skill_name: str) -> None:
        with self._lock:
            deleted = self._deleted_skills()
            deleted.add(self.skill_key(job_id, skill_name))
            atomic_write_json(self.skill_deletions_path, sorted(deleted))
