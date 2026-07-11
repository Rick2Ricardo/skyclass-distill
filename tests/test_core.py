import json
from pathlib import Path

from app.distiller import offline_draft, transcript_chunks
from app.llm import parse_json_object
from app.skill_builder import build_skill_suite, validate_skill


def test_parse_json_fence():
    assert parse_json_object('```json\n{"ok": true}\n```') == {"ok": True}


def test_transcript_chunks_preserve_timestamps():
    payload = {"segments": [{"start": 65, "text": "速度是什么"}, {"start": 70, "text": "所以得到结论"}]}
    chunks = transcript_chunks(payload, max_chars=40)
    assert "[01:05]" in chunks[0]
    assert sum("速度是什么" in chunk for chunk in chunks) == 1


def test_offline_draft_requires_cross_lesson_support():
    lessons = [
        ("课一", {"segments": [{"start": 1, "text": "为什么这样？所以得到关系。"}]}),
        ("课二", {"segments": [{"start": 2, "text": "请看图像，如何判断？因此说明变化。"}]}),
    ]
    suite = offline_draft(lessons)
    assert suite["provisional"] is True
    assert all(cap["supporting_lessons"] >= 2 for cap in suite["capabilities"])


def test_build_valid_skill_suite(tmp_path: Path):
    suite = offline_draft([
        ("课一", {"segments": [{"start": 1, "text": "为什么这样？所以得到关系。"}]}),
        ("课二", {"segments": [{"start": 2, "text": "如何判断？因此说明变化。"}]}),
    ])
    built = build_skill_suite(suite, tmp_path, "高中物理", {"test": True})
    assert built
    for item in built:
        assert item["valid"]
        assert validate_skill(Path(item["path"]))[0]


def test_build_removes_only_stale_skills_from_same_job(tmp_path: Path):
    stale = tmp_path / "physics-old"
    stale.mkdir()
    (stale / "manifest.json").write_text(json.dumps({"provenance": {"job_id": "job-1"}}), "utf-8")
    unrelated = tmp_path / "keep-me"
    unrelated.mkdir()
    (unrelated / "manifest.json").write_text(json.dumps({"provenance": {"job_id": "job-2"}}), "utf-8")
    suite = offline_draft([
        ("课一", {"segments": [{"start": 1, "text": "为什么这样？所以得到关系。"}]}),
        ("课二", {"segments": [{"start": 2, "text": "如何判断？因此说明变化。"}]}),
    ])

    build_skill_suite(suite, tmp_path, "高中物理", {"job_id": "job-1"})

    assert not stale.exists()
    assert unrelated.exists()
