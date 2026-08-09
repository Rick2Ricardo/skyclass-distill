from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from typing import Callable


_models: dict[str, object] = {}
_model_lock = Lock()


def _format_time(seconds: float) -> str:
    millis = int(seconds * 1000)
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _get_model(name: str):
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError("未安装 faster-whisper，请执行 pip install -e .") from exc
    with _model_lock:
        if name not in _models:
            _models[name] = WhisperModel(name, device="cpu", compute_type="int8")
        return _models[name]


def transcribe(audio: Path, output_dir: Path, model_name: str = "small", language: str = "zh", log: Callable[[str], None] | None = None) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{audio.stem}.json"
    text_path = output_dir / f"{audio.stem}.txt"
    srt_path = output_dir / f"{audio.stem}.srt"
    if json_path.exists() and text_path.exists() and json_path.stat().st_mtime >= audio.stat().st_mtime:
        try:
            cached = json.loads(json_path.read_text("utf-8"))
            cached_language = cached.get("requested_language", cached.get("language"))
            if cached.get("model") == model_name and cached_language == language:
                return cached
        except json.JSONDecodeError:
            pass
    if log:
        log(f"加载 Whisper {model_name} 并开始转写")
    model = _get_model(model_name)
    segments_iter, info = model.transcribe(
        str(audio), language=language, vad_filter=True, beam_size=5,
        condition_on_previous_text=True, word_timestamps=False,
    )
    segments = []
    for index, segment in enumerate(segments_iter, 1):
        record = {"id": index, "start": round(segment.start, 3), "end": round(segment.end, 3), "text": segment.text.strip()}
        segments.append(record)
        if log and index % 25 == 0:
            log(f"已转写 {index} 个片段，至 {_format_time(segment.end).replace(',', '.')}")
    payload = {
        "audio": str(audio), "model": model_name, "requested_language": language, "language": info.language,
        "language_probability": info.language_probability, "duration": info.duration,
        "segments": segments, "text": "\n".join(s["text"] for s in segments),
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
    text_path.write_text(payload["text"], "utf-8")
    srt_path.write_text("\n\n".join(
        f"{i}\n{_format_time(s['start'])} --> {_format_time(s['end'])}\n{s['text']}"
        for i, s in enumerate(segments, 1)
    ), "utf-8")
    return payload
