"""Isolated faster-whisper adapter used by the TypeScript media pipeline.

This file is a compute tool, not an HTTP server or application backend. It accepts
one audio path and prints one JSON object so the TypeScript job engine owns all
business state and orchestration.
"""

from __future__ import annotations

import argparse
import json

from faster_whisper import WhisperModel


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default="zh")
    args = parser.parse_args()

    model = WhisperModel(args.model, device="auto", compute_type="int8")
    segments, info = model.transcribe(
        args.audio,
        language=args.language or None,
        vad_filter=True,
        beam_size=5,
    )
    records = [
        {
            "start": float(segment.start),
            "end": float(segment.end),
            "text": segment.text.strip(),
        }
        for segment in segments
        if segment.text.strip()
    ]
    print(json.dumps({
        "text": " ".join(item["text"] for item in records),
        "segments": records,
        "language": info.language,
        "language_probability": float(info.language_probability),
        "duration": float(info.duration),
        "engine": "faster-whisper-tool",
        "model": args.model,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
