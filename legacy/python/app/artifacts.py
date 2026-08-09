from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


def content_fingerprint(*values: Any) -> str:
    encoded = json.dumps(values, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
    temp.replace(path)


@dataclass(frozen=True, slots=True)
class VersionedJsonArtifact:
    path: Path
    version: str

    @property
    def metadata_path(self) -> Path:
        return self.path.with_suffix(".meta.json")

    def load(self, input_fingerprint: str) -> dict[str, Any] | None:
        if not self.path.exists() or not self.metadata_path.exists():
            return None
        try:
            metadata = json.loads(self.metadata_path.read_text("utf-8"))
            if metadata != {"version": self.version, "input_fingerprint": input_fingerprint}:
                return None
            payload = json.loads(self.path.read_text("utf-8"))
            return payload if isinstance(payload, dict) else None
        except (OSError, json.JSONDecodeError):
            return None

    def save(self, payload: dict[str, Any], input_fingerprint: str) -> None:
        atomic_write_json(self.path, payload)
        atomic_write_json(
            self.metadata_path,
            {"version": self.version, "input_fingerprint": input_fingerprint},
        )

    def clear(self) -> None:
        self.path.unlink(missing_ok=True)
        self.metadata_path.unlink(missing_ok=True)
