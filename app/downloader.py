from __future__ import annotations

import re
import shutil
import subprocess
import sys
from contextlib import redirect_stdout
from pathlib import Path
from typing import Callable

from .models import CourseItem


LogFn = Callable[[str], None]
VIDEO_SUFFIXES = {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi", ".mpeg", ".mpg"}


class _QuietLibraryProgress:
    """Discard the dependency's 4 KB-per-line terminal animation; pipeline logs stay structured."""

    def write(self, text: str) -> int:
        return len(text)

    def flush(self) -> None:
        return None


def check_runtime() -> dict[str, bool]:
    try:
        import yt_dlp  # noqa: F401
        ytdlp = True
    except ImportError:
        ytdlp = False
    try:
        import bilibili_api  # noqa: F401
        bilibili = True
    except ImportError:
        bilibili = False
    return {"ffmpeg": bool(shutil.which("ffmpeg")), "yt_dlp": ytdlp, "bilibili_api": bilibili}


def download_item(
    item: CourseItem,
    directory: Path,
    max_height: int = 720,
    log: LogFn | None = None,
    cookie_browser: str = "",
) -> dict[str, str]:
    directory.mkdir(parents=True, exist_ok=True)
    safe_id = re.sub(r"[^0-9A-Za-z._-]+", "-", item.id).strip("-.")[:80] or "video"
    stem = f"{item.index:03d}-{safe_id}"
    if item.metadata.get("local_path"):
        return import_local_item(item, directory, stem, log)
    existing = next(directory.glob(f"{stem}.mp4"), None)
    audio_target = directory / f"{stem}.wav"
    if existing and valid_media(existing, item.duration):
        if audio_target.exists() and not valid_media(audio_target, item.duration):
            audio_target.unlink()
        audio = extract_audio(existing, audio_target, log)
        return {"video": str(existing), "audio": str(audio)}
    if existing:
        existing.unlink()
    if audio_target.exists():
        audio_target.unlink()
    if item.metadata.get("bvid"):
        try:
            video = download_bilibili(item, directory / f"{stem}.mp4", log)
        except Exception as exc:
            if log:
                log(f"B 站专用下载失败，自动切换 yt-dlp：{str(exc)[-200:]}")
            video = download_with_ytdlp(item, directory, stem, max_height, log, cookie_browser)
    else:
        video = download_with_ytdlp(item, directory, stem, max_height, log, cookie_browser)
    audio = extract_audio(video, audio_target, log)
    return {"video": str(video), "audio": str(audio)}


def import_local_item(item: CourseItem, directory: Path, stem: str, log: LogFn | None = None) -> dict[str, str]:
    source = Path(str(item.metadata.get("local_path", ""))).expanduser().resolve()
    if not source.is_file() or source.suffix.lower() not in VIDEO_SUFFIXES:
        raise RuntimeError(f"本地视频不存在或格式不受支持：{source.name}")
    target = directory / f"{stem}{source.suffix.lower()}"
    audio_target = directory / f"{stem}.wav"
    if not valid_media(target, item.duration):
        target.unlink(missing_ok=True)
        if log:
            log(f"导入本地视频：{item.title}")
        try:
            target.hardlink_to(source)
        except OSError:
            shutil.copy2(source, target)
    if not valid_media(target, item.duration):
        raise RuntimeError(f"本地视频无法读取：{source.name}")
    if audio_target.exists() and not valid_media(audio_target, item.duration):
        audio_target.unlink()
    audio = extract_audio(target, audio_target, log)
    return {"video": str(target), "audio": str(audio)}


def download_bilibili(item: CourseItem, target: Path, log: LogFn | None = None) -> Path:
    """Delegate Bilibili WBI, media selection, headers, and download to bilibili-api-python."""
    try:
        from bilibili_api import bili_simple_download, request_settings, sync, video
    except ImportError as exc:
        raise RuntimeError("未安装 bilibili-api-python") from exc
    try:
        request_settings.set("impersonate", "chrome")
    except Exception:
        pass
    bvid = str(item.metadata["bvid"])
    page_index = int(item.metadata.get("page_index", max(item.index - 1, 0)))
    if log:
        log(f"bilibili-api-python 获取公开媒体：{item.title}")
    video_obj = video.Video(bvid=bvid)
    data = sync(video_obj.get_download_url(page_index=page_index, html5=True))
    streams = video.VideoDownloadURLDataDetecter(data).detect_best_streams()
    if not streams or not getattr(streams[0], "url", None):
        raise RuntimeError("bilibili-api-python 未返回可用公开媒体流")
    partial = target.with_suffix(".mp4.part")
    with redirect_stdout(_QuietLibraryProgress()):
        sync(bili_simple_download(streams[0].url, str(partial), f"下载 {item.index}"))
    if not partial.exists() or partial.stat().st_size < 1024:
        raise RuntimeError("B 站视频下载后文件为空")
    partial.replace(target)
    return target


def download_with_ytdlp(
    item: CourseItem,
    directory: Path,
    stem: str,
    max_height: int,
    log: LogFn | None = None,
    cookie_browser: str = "",
) -> Path:
    output = str(directory / f"{stem}.%(ext)s")
    fmt = f"bestvideo[height<={max_height}]+bestaudio/best[height<={max_height}]/best"
    cmd = [
        sys.executable, "-m", "yt_dlp", item.source_url, "--no-playlist",
        "--format", fmt, "--merge-output-format", "mp4", "--remux-video", "mp4",
        "--write-info-json", "--no-overwrites", "--output", output, "--newline",
        "--retries", "5", "--fragment-retries", "5", "--extractor-retries", "3",
        "--concurrent-fragments", "4", "--socket-timeout", "30",
        "--user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
        "--add-header", "Accept-Language:zh-CN,zh;q=0.9,en;q=0.7",
        "--referer", item.source_url,
        "--impersonate", "chrome",
    ]
    if cookie_browser:
        cmd.extend(["--cookies-from-browser", cookie_browser])
    if log:
        cookie_note = f" · 临时使用 {cookie_browser} Cookie" if cookie_browser else ""
        log(f"yt-dlp 下载：{item.title}{cookie_note}")
    process = subprocess.run(cmd, capture_output=True, text=True)
    if process.returncode:
        detail = (process.stdout + process.stderr)[-1200:]
        raise RuntimeError(
            "yt-dlp 下载失败：" + detail
            + "\n请确认内容公开且无登录、付费或 DRM 限制，并尝试升级 yt-dlp。"
        )
    candidates = [
        path for path in directory.glob(f"{stem}.*")
        if path.suffix.lower() in VIDEO_SUFFIXES and not path.name.endswith(".part")
    ]
    video = next((path for path in candidates if path.suffix.lower() == ".mp4"), None)
    video = video or (candidates[0] if candidates else None)
    if not video:
        raise RuntimeError(f"下载完成但未找到视频文件：{stem}")
    return video


def extract_audio(video: Path, audio: Path, log: LogFn | None = None) -> Path:
    if audio.exists() and audio.stat().st_size > 1024:
        return audio
    if not shutil.which("ffmpeg"):
        raise RuntimeError("未找到 ffmpeg，请先安装 ffmpeg")
    if log:
        log("FFmpeg 提取 16kHz 单声道音轨")
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000", str(audio)],
        capture_output=True, text=True,
    )
    if result.returncode:
        raise RuntimeError("音轨提取失败：" + result.stderr[-500:])
    return audio


def valid_media(path: Path, expected_duration: float | None = None) -> bool:
    if not path.exists() or path.stat().st_size < 1024 or not shutil.which("ffprobe"):
        return False
    if expected_duration:
        min_bytes_per_second = 20_000 if path.suffix.lower() == ".wav" else 8_000
        if path.stat().st_size < float(expected_duration) * min_bytes_per_second:
            return False
    duration = media_duration(path)
    return duration is not None and (
        expected_duration is None or duration >= float(expected_duration) * 0.9
    )


def media_duration(path: Path) -> float | None:
    if not path.exists() or not shutil.which("ffprobe"):
        return None
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        duration = float(result.stdout.strip())
        return duration if result.returncode == 0 and duration > 1 else None
    except ValueError:
        return None
