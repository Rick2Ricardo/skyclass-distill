from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .artifacts import atomic_write_json


ROOT = Path(__file__).resolve().parent.parent


def _read_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text("utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(slots=True)
class Settings:
    data_dir: Path
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = "gpt-4.1-mini"
    llm_timeout_seconds: int = 180
    llm_max_attempts: int = 3
    whisper_model: str = "small"
    max_video_height: int = 720
    max_upload_size_mb: int = 4096

    @property
    def runtime_file(self) -> Path:
        return self.data_dir / "runtime_settings.json"

    def public(self) -> dict[str, Any]:
        return {
            "llm_base_url": self.llm_base_url,
            "llm_api_key_set": bool(self.llm_api_key),
            "llm_api_key_hint": ("••••" + self.llm_api_key[-4:]) if self.llm_api_key else "",
            "llm_model": self.llm_model,
            "llm_timeout_seconds": self.llm_timeout_seconds,
            "llm_max_attempts": self.llm_max_attempts,
            "whisper_model": self.whisper_model,
            "max_video_height": self.max_video_height,
            "max_upload_size_mb": self.max_upload_size_mb,
            "data_dir": str(self.data_dir),
        }

    def save_runtime(self, values: dict[str, Any]) -> None:
        allowed = {
            "llm_base_url", "llm_api_key", "llm_model", "llm_timeout_seconds",
            "llm_max_attempts", "whisper_model", "max_video_height",
            "max_upload_size_mb",
        }
        existing: dict[str, Any] = {}
        if self.runtime_file.exists():
            try:
                existing = json.loads(self.runtime_file.read_text("utf-8"))
            except (OSError, json.JSONDecodeError):
                existing = {}
        existing = {key: value for key, value in existing.items() if key in allowed}
        payload = existing | {k: v for k, v in values.items() if k in allowed and v is not None}
        if not payload.get("llm_api_key"):
            payload.pop("llm_api_key", None)
            if existing.get("llm_api_key"):
                payload["llm_api_key"] = existing["llm_api_key"]
        self.data_dir.mkdir(parents=True, exist_ok=True)
        atomic_write_json(self.runtime_file, payload)
        try:
            self.runtime_file.chmod(0o600)
        except OSError:
            pass


def load_settings() -> Settings:
    _read_dotenv(ROOT / ".env")
    configured_data_dir = Path(os.getenv("DATA_DIR", "data")).expanduser()
    data_dir = (configured_data_dir if configured_data_dir.is_absolute() else ROOT / configured_data_dir).resolve()
    runtime: dict[str, Any] = {}
    runtime_file = data_dir / "runtime_settings.json"
    if runtime_file.exists():
        try:
            runtime = json.loads(runtime_file.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            runtime = {}
    return Settings(
        data_dir=data_dir,
        llm_base_url=str(runtime.get("llm_base_url") or os.getenv("LLM_BASE_URL", "")),
        llm_api_key=str(runtime.get("llm_api_key") or os.getenv("LLM_API_KEY", "")),
        llm_model=str(runtime.get("llm_model") or os.getenv("LLM_MODEL", "gpt-4.1-mini")),
        llm_timeout_seconds=int(runtime.get("llm_timeout_seconds") or os.getenv("LLM_TIMEOUT_SECONDS", "180")),
        llm_max_attempts=int(runtime.get("llm_max_attempts") or os.getenv("LLM_MAX_ATTEMPTS", "3")),
        whisper_model=str(runtime.get("whisper_model") or os.getenv("WHISPER_MODEL", "small")),
        max_video_height=int(runtime.get("max_video_height") or os.getenv("MAX_VIDEO_HEIGHT", "720")),
        max_upload_size_mb=int(runtime.get("max_upload_size_mb") or os.getenv("MAX_UPLOAD_SIZE_MB", "4096")),
    )
