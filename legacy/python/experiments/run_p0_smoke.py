from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.artifacts import atomic_write_json
from app.config import ROOT, load_settings
from app.llm import LLMClient
from app.pipeline import PipelineManager
from app.skill_qa import (
    QA_PROMPT_VERSION,
    QA_TURN_SCHEMA_VERSION,
    collect_project_skill_records,
    delivery_audit,
    generate_answer,
    normalize_answer,
    public_skill_cards,
    rank_skill_records,
)


DEFAULT_BENCHMARK = ROOT / "benchmark" / "pilot" / "physics_p0_smoke_v1.json"


def load_scenarios(path: Path, scenario_id: str, limit: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    benchmark = json.loads(path.read_text("utf-8"))
    scenarios = list(benchmark.get("scenarios", []))
    if scenario_id:
        scenarios = [item for item in scenarios if item.get("id") == scenario_id]
        if not scenarios:
            raise SystemExit(f"unknown scenario: {scenario_id}")
    if limit > 0:
        scenarios = scenarios[:limit]
    return benchmark, scenarios


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the fixed P0 Base/Text/Multimodal smoke matrix")
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--benchmark", type=Path, default=DEFAULT_BENCHMARK)
    parser.add_argument("--scenario-id", default="")
    parser.add_argument("--limit", type=int, default=1)
    parser.add_argument("--max-skills", type=int, default=3)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    settings = load_settings()
    manager = PipelineManager(load_settings)
    project = manager.library.get_project(args.project_id)
    records = collect_project_skill_records(
        args.project_id,
        manager.store.list(),
        manager.library.skill_deleted,
    )
    if not records:
        raise SystemExit("project has no valid distilled Skills")
    benchmark, scenarios = load_scenarios(args.benchmark, args.scenario_id, args.limit)
    output = args.output or (
        settings.data_dir / "experiments" /
        f"p0-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    )
    manifest = {
        "benchmark_id": benchmark["benchmark_id"],
        "baseline_version": "v1-c974bac",
        "project_id": args.project_id,
        "subject": project.subject,
        "model": settings.llm_model,
        "prompt_version": QA_PROMPT_VERSION,
        "turn_schema_version": QA_TURN_SCHEMA_VERSION,
        "temperature": 0,
        "selection": "deterministic lexical top-k shared by Text and Multimodal arms",
        "max_skills": args.max_skills,
        "dry_run": args.dry_run,
        "scenario_ids": [item["id"] for item in scenarios],
        "results": [],
    }
    if args.dry_run:
        atomic_write_json(output, manifest)
        print(json.dumps({"ok": True, "dry_run": True, "output": str(output), "count": len(scenarios)}))
        return

    client = LLMClient(
        settings.llm_base_url,
        settings.llm_api_key,
        settings.llm_model,
        timeout=settings.llm_timeout_seconds,
        max_attempts=settings.llm_max_attempts,
    )
    if not client.configured:
        raise SystemExit("LLM API is not configured")
    for scenario in scenarios:
        selected = rank_skill_records(scenario["question"], records, limit=args.max_skills)
        arms = {}
        for arm, modality, skills in (
            ("base", "text", []),
            ("text_skill", "text", selected),
            ("multimodal_skill", "multimodal", selected),
        ):
            answer = normalize_answer(generate_answer(
                client,
                scenario["question"],
                project.subject,
                selected=skills,
                modality=modality,
                temperature=0,
            ))
            arms[arm] = {"answer": answer, "execution_audit": delivery_audit(answer)}
        manifest["results"].append({
            "scenario": scenario,
            "selected_skills": public_skill_cards(selected),
            "arms": arms,
        })
        atomic_write_json(output, manifest)
        print(json.dumps({"scenario": scenario["id"], "saved": str(output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
