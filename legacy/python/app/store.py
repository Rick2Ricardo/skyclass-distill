from __future__ import annotations

import threading
from pathlib import Path

from .models import JobEvent, JobState, now_iso


class JobStore:
    def __init__(self, data_dir: Path):
        self.directory = data_dir / "jobs"
        self.directory.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    def path(self, job_id: str) -> Path:
        return self.directory / f"{job_id}.json"

    def save(self, job: JobState) -> JobState:
        with self._lock:
            job.updated_at = now_iso()
            temp = self.path(job.id).with_suffix(".tmp")
            temp.write_text(job.model_dump_json(indent=2), "utf-8")
            temp.replace(self.path(job.id))
        return job

    def get(self, job_id: str) -> JobState:
        path = self.path(job_id)
        if not path.exists():
            raise KeyError(job_id)
        return JobState.model_validate_json(path.read_text("utf-8"))

    def list(self) -> list[JobState]:
        jobs: list[JobState] = []
        for path in sorted(self.directory.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                jobs.append(JobState.model_validate_json(path.read_text("utf-8")))
            except Exception:
                continue
        return jobs

    def event(self, job: JobState, message: str, level: str = "info") -> None:
        job.events.append(JobEvent(message=message, level=level))
        job.events = job.events[-200:]
        self.save(job)
