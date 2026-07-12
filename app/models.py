from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CourseItem(BaseModel):
    id: str
    source_url: str
    title: str
    index: int = 1
    duration: float | None = None
    cover_url: str | None = None
    source: str = "unknown"
    metadata: dict[str, Any] = Field(default_factory=dict)


class DiscoverRequest(BaseModel):
    url: str
    limit: int = Field(5, ge=1, le=50)


class SearchRequest(BaseModel):
    keyword: str = Field("高中物理 系统课", min_length=2, max_length=100)
    limit: int = Field(10, ge=1, le=30)


class PipelineRequest(BaseModel):
    source_url: str
    limit: int = Field(5, ge=1, le=50)
    subject: str = "高中物理"
    grade: str = "高中"
    whisper_model: str | None = None
    max_video_height: int | None = Field(None, ge=144, le=2160)
    language: str = "zh"


class LocalPipelineRequest(BaseModel):
    upload_id: str = Field(pattern=r"^[a-f0-9]{10,32}$")
    subject: str = "高中物理"
    grade: str = "高中"
    whisper_model: str | None = None
    language: str = "zh"


class SettingsUpdate(BaseModel):
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_timeout_seconds: int | None = Field(None, ge=1, le=1800)
    llm_max_attempts: int | None = Field(None, ge=1, le=10)
    whisper_model: str | None = None
    max_video_height: int | None = Field(None, ge=144, le=2160)
    max_upload_size_mb: int | None = Field(None, ge=1, le=20_480)
    video_cookie_browser: Literal["", "chrome", "safari", "firefox", "edge", "brave", "chromium"] | None = None


class BrowserCookieProbeRequest(BaseModel):
    url: str
    browser: Literal["chrome", "safari", "firefox", "edge", "brave", "chromium"]


class JobEvent(BaseModel):
    time: str = Field(default_factory=now_iso)
    level: Literal["info", "success", "warning", "error"] = "info"
    message: str


class JobState(BaseModel):
    id: str
    status: Literal["queued", "running", "completed", "failed", "cancelled"] = "queued"
    stage: str = "queued"
    progress: float = 0
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    request: PipelineRequest
    items: list[CourseItem] = Field(default_factory=list)
    current_item: int = 0
    events: list[JobEvent] = Field(default_factory=list)
    artifacts: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
