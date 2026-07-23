from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Callable

from .artifacts import atomic_write_json, content_fingerprint
from .downloader import media_duration


FRAME_EXTRACTOR_VERSION = "teaching-keyframes-v1"
VISUAL_CUE_RE = re.compile(
    r"看(?:这里|这个|图|屏幕|板书)|观察|图像|图表|曲线|坐标|板书|实验|现象|"
    r"指针|刻度|示意图|受力图|电路图|光路图|画出|标出"
)
LogFn = Callable[[str], None]


def _transcript_duration(transcript: dict[str, Any]) -> float:
    duration = float(transcript.get("duration") or 0)
    for segment in transcript.get("segments", []):
        duration = max(duration, float(segment.get("end") or segment.get("start") or 0))
    return duration


def cue_timestamps(transcript: dict[str, Any], limit: int = 8) -> list[float]:
    hits: list[float] = []
    for segment in transcript.get("segments", []):
        if VISUAL_CUE_RE.search(str(segment.get("text", ""))):
            hits.append(max(0.0, float(segment.get("start") or 0) + 0.5))
            if len(hits) >= limit:
                break
    return hits


def periodic_timestamps(duration: float, limit: int = 6) -> list[float]:
    if duration <= 1 or limit <= 0:
        return []
    count = min(limit, max(1, int(duration // 60) + 1))
    step = duration / (count + 1)
    return [round(step * index, 3) for index in range(1, count + 1)]


def _spaced(values: list[float], limit: int, min_gap: float = 4.0) -> list[float]:
    selected: list[float] = []
    for value in sorted(max(0.0, float(item)) for item in values):
        if all(abs(value - existing) >= min_gap for existing in selected):
            selected.append(value)
            if len(selected) >= limit:
                break
    return selected


def plan_frame_timestamps(
    transcript: dict[str, Any],
    duration: float,
    scene_timestamps: list[float] | None = None,
    max_frames: int = 20,
) -> list[dict[str, Any]]:
    """Build a bounded, deterministic mix of cue, scene, and periodic frames."""
    candidates: list[tuple[float, str, int]] = []
    candidates.extend((value, "transcript_cue", 0) for value in cue_timestamps(transcript, 8))
    candidates.extend((value, "scene_change", 1) for value in _spaced(scene_timestamps or [], 8))
    candidates.extend((value, "periodic", 2) for value in periodic_timestamps(duration, 6))

    chosen: list[tuple[float, str, int]] = []
    for value, reason, priority in sorted(candidates, key=lambda item: (item[2], item[0])):
        if value >= max(duration - 0.2, 0.2):
            continue
        if any(abs(value - existing[0]) < 3.0 for existing in chosen):
            continue
        chosen.append((value, reason, priority))
        if len(chosen) >= max_frames:
            break
    return [
        {"timestamp": round(value, 3), "selection_reason": reason}
        for value, reason, _ in sorted(chosen, key=lambda item: item[0])
    ]


def detect_scene_timestamps(video: Path, threshold: float = 0.32, limit: int = 12) -> list[float]:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("多模态蒸馏需要 ffmpeg 提取视频关键帧")
    result = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "info", "-i", str(video),
            "-vf", f"select=gt(scene\\,{threshold}),showinfo", "-an", "-f", "null", "-",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode:
        return []
    values = [float(value) for value in re.findall(r"pts_time:([0-9]+(?:\.[0-9]+)?)", result.stderr)]
    return _spaced(values, limit, min_gap=5.0)


def _cached_index(index_path: Path, fingerprint: str) -> dict[str, Any] | None:
    if not index_path.exists():
        return None
    try:
        payload = json.loads(index_path.read_text("utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if payload.get("version") != FRAME_EXTRACTOR_VERSION or payload.get("fingerprint") != fingerprint:
        return None
    if not all(Path(frame.get("path", "")).is_file() for frame in payload.get("frames", [])):
        return None
    return payload


def extract_keyframes(
    video: Path,
    transcript: dict[str, Any],
    output_dir: Path,
    log: LogFn | None = None,
    max_frames: int = 20,
) -> dict[str, Any]:
    video = video.resolve()
    if not video.is_file():
        raise RuntimeError("多模态蒸馏失败：来源视频文件不存在，请重新入库")
    if not shutil.which("ffmpeg"):
        raise RuntimeError("多模态蒸馏需要 ffmpeg 提取视频关键帧")

    stat = video.stat()
    fingerprint = content_fingerprint(
        FRAME_EXTRACTOR_VERSION,
        str(video),
        stat.st_size,
        stat.st_mtime_ns,
        transcript,
        max_frames,
    )
    index_path = output_dir / "index.json"
    cached = _cached_index(index_path, fingerprint)
    if cached is not None:
        if log:
            log(f"复用 {len(cached.get('frames', []))} 张已提取关键帧")
        return cached

    duration = media_duration(video) or _transcript_duration(transcript)
    if duration <= 1:
        raise RuntimeError("多模态蒸馏失败：无法确定视频时长")
    if log:
        log("检测镜头变化、视觉提示词与周期采样点")
    scene_timestamps = detect_scene_timestamps(video)
    plan = plan_frame_timestamps(transcript, duration, scene_timestamps, max_frames)
    if not plan:
        raise RuntimeError("多模态蒸馏失败：未找到可提取的关键帧")

    output_dir.mkdir(parents=True, exist_ok=True)
    for old_path in output_dir.glob("F*.jpg"):
        old_path.unlink(missing_ok=True)

    frames: list[dict[str, Any]] = []
    for index, item in enumerate(plan, 1):
        timestamp = float(item["timestamp"])
        target = output_dir / f"F{index:03d}-{int(timestamp * 1000):010d}.jpg"
        result = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-ss", f"{timestamp:.3f}", "-i", str(video), "-frames:v", "1",
                "-vf", "scale='min(960,iw)':-2", "-q:v", "3", str(target),
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode or not target.is_file() or target.stat().st_size < 256:
            target.unlink(missing_ok=True)
            continue
        frames.append(
            {
                "frame_id": f"F{len(frames) + 1:03d}",
                "timestamp": round(timestamp, 3),
                "path": str(target.resolve()),
                "selection_reason": item["selection_reason"],
            }
        )
    if not frames:
        raise RuntimeError("多模态蒸馏失败：ffmpeg 未能输出有效关键帧")

    payload = {
        "version": FRAME_EXTRACTOR_VERSION,
        "fingerprint": fingerprint,
        "video": str(video),
        "duration": duration,
        "strategy": "scene_change+transcript_cue+periodic",
        "frames": frames,
    }
    atomic_write_json(index_path, payload)
    if log:
        log(f"关键帧提取完成：{len(frames)} 张")
    return payload
