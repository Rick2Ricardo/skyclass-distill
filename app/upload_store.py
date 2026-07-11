from __future__ import annotations

import re
import uuid
from collections.abc import AsyncIterable
from dataclasses import dataclass
from pathlib import Path

from .downloader import VIDEO_SUFFIXES, media_duration
from .models import CourseItem


UPLOAD_ID_PATTERN = re.compile(r"^[a-f0-9]{10,32}$")


class UploadError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class UploadResult:
    upload_id: str
    filename: str
    size: int
    duration: float


class UploadStore:
    def __init__(self, data_dir: Path, max_size_mb: int = 4096):
        self.root = (data_dir / "uploads").resolve()
        self.max_bytes = max_size_mb * 1024 * 1024

    def directory(self, upload_id: str) -> Path:
        if not UPLOAD_ID_PATTERN.fullmatch(upload_id):
            raise UploadError("上传批次编号无效")
        directory = (self.root / upload_id).resolve()
        if self.root not in directory.parents:
            raise UploadError("上传批次路径无效")
        return directory

    @staticmethod
    def safe_filename(filename: str) -> str:
        name = Path(filename.replace("\x00", "")).name.strip()[:180]
        if not name or Path(name).suffix.lower() not in VIDEO_SUFFIXES:
            raise UploadError("请选择 MP4、MOV、MKV、WebM、M4V、AVI、MPEG 视频")
        return name

    async def save(self, filename: str, chunks: AsyncIterable[bytes], upload_id: str | None = None) -> UploadResult:
        safe_name = self.safe_filename(filename)
        upload_id = upload_id or uuid.uuid4().hex[:12]
        upload_dir = self.directory(upload_id)
        upload_dir.mkdir(parents=True, exist_ok=True)
        index = len(self.files(upload_id)) + 1
        target = upload_dir / f"{index:03d}-{safe_name}"
        while target.exists():
            index += 1
            target = upload_dir / f"{index:03d}-{safe_name}"
        partial = target.with_name(target.name + ".part")
        size = 0
        try:
            with partial.open("wb") as handle:
                async for chunk in chunks:
                    size += len(chunk)
                    if size > self.max_bytes:
                        raise UploadError(f"单个视频不能超过 {self.max_bytes // 1024 // 1024} MB")
                    handle.write(chunk)
            if size < 1024:
                raise UploadError("上传的视频文件为空")
            partial.replace(target)
            duration = media_duration(target)
            if duration is None:
                target.unlink(missing_ok=True)
                raise UploadError(f"无法读取视频：{safe_name}")
            return UploadResult(upload_id, safe_name, size, duration)
        except Exception:
            partial.unlink(missing_ok=True)
            raise

    def files(self, upload_id: str) -> list[Path]:
        directory = self.directory(upload_id)
        if not directory.is_dir():
            return []
        return sorted(
            (path for path in directory.iterdir() if path.is_file() and path.suffix.lower() in VIDEO_SUFFIXES),
            key=lambda path: path.name,
        )

    def course_items(self, upload_id: str) -> list[CourseItem]:
        return [
            CourseItem(
                id=f"local-{upload_id[:8]}-p{index}",
                source_url=f"local://{upload_id}/{path.name}",
                title=re.sub(r"^\d{3}-", "", path.stem),
                index=index,
                duration=media_duration(path),
                source="local-upload",
                metadata={
                    "local_path": str(path),
                    "original_filename": re.sub(r"^\d{3}-", "", path.name),
                },
            )
            for index, path in enumerate(self.files(upload_id), 1)
        ]
