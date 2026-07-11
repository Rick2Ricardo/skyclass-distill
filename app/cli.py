from __future__ import annotations

import argparse
import json
import time

from .config import load_settings
from .models import PipelineRequest
from .pipeline import PipelineManager


def main() -> None:
    parser = argparse.ArgumentParser(prog="skyclass", description="B 站教师课程教学技能蒸馏")
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="运行完整流水线")
    run.add_argument("--url", required=True)
    run.add_argument("--limit", type=int, default=5)
    run.add_argument("--subject", default="高中物理")
    run.add_argument("--grade", default="高中")
    run.add_argument("--whisper-model", default=None)
    run.add_argument("--max-video-height", type=int, default=None)
    resume = sub.add_parser("resume", help="从失败或中断处继续任务")
    resume.add_argument("job_id")
    args = parser.parse_args()
    manager = PipelineManager(load_settings)
    if args.command == "run":
        request = PipelineRequest(
            source_url=args.url, limit=args.limit, subject=args.subject, grade=args.grade,
            whisper_model=args.whisper_model, max_video_height=args.max_video_height,
        )
        job = manager.create(request)
    else:
        job = manager.store.get(args.job_id)
    if args.command in {"run", "resume"}:
        print(f"job={job.id}")
        manager.start(job.id)
        seen = 0
        while True:
            current = manager.store.get(job.id)
            for event in current.events[seen:]:
                print(f"[{event.level}] {event.message}")
            seen = len(current.events)
            if current.status in {"completed", "failed", "cancelled"}:
                print(json.dumps(current.model_dump(), ensure_ascii=False, indent=2))
                raise SystemExit(0 if current.status == "completed" else 1)
            time.sleep(1)


if __name__ == "__main__":
    main()
