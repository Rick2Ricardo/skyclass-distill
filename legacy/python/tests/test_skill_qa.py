import json
from pathlib import Path

from app.config import Settings
from app.llm import LLMClient
from app.models import JobState, PipelineRequest, ProjectCreate, QARequest
from app.pipeline import PipelineManager
from app.skill_qa import (
    QA_JUDGE_VERSION, blind_answers, collect_project_skill_records, delivery_audit,
    generate_answer, generate_followup_answer, judge_answers, normalize_answer,
    rank_skill_records, student_visible_content,
)


def _packaged_skill(folder: Path, name: str = "physics-visual-modeling") -> dict:
    folder.mkdir(parents=True)
    capability = {
        "key": "visual-modeling",
        "name": "语言到图形的表征转换",
        "summary": "把物理语言转换为坐标轴、箭头和图形。",
        "teaching_goal": "学生能把位移的大小和方向画成箭头。",
        "use_when": ["讲解矢量与标量", "设计板书"],
        "lesson_flow": [{"teacher_action": "画坐标轴并标出正方向"}],
        "evidence": [{"lesson": "矢量与标量", "quote": "箭头长度表示大小"}],
    }
    (folder / "manifest.json").write_text(json.dumps({
        "skill": name,
        "modalities": ["text", "visual"],
        "capability": capability,
    }, ensure_ascii=False), "utf-8")
    return {
        "name": name,
        "display_name": capability["name"],
        "path": str(folder),
        "valid": True,
        "errors": [],
    }


def _manager_with_skill(tmp_path: Path) -> tuple[PipelineManager, str]:
    settings = Settings(
        data_dir=tmp_path,
        llm_base_url="https://relay.example/v1",
        llm_api_key="secret",
        llm_model="test-model",
    )
    manager = PipelineManager(lambda: settings)
    project = manager.library.create_project(ProjectCreate(name="高中物理"))
    built = _packaged_skill(tmp_path / "skill")
    distill = JobState(
        id="distill001",
        request=PipelineRequest(source_url="project://test", subject="高中物理"),
        kind="distill",
        project_id=project.id,
        status="completed",
        artifacts={"skills": [built], "skills_dir": str(tmp_path)},
    )
    manager.store.save(distill)
    return manager, project.id


def test_collect_and_rank_project_skills_uses_packaged_manifest(tmp_path: Path):
    manager, project_id = _manager_with_skill(tmp_path)
    records = collect_project_skill_records(
        project_id, manager.store.list(), manager.library.skill_deleted,
    )
    ranked = rank_skill_records("矢量和标量的板书怎么画", records)

    assert len(records) == 1
    assert ranked[0]["name"] == "语言到图形的表征转换"
    assert ranked[0]["retrieval_score"] > 0


def test_generate_answer_uses_ephemeral_pi_agent_when_available(monkeypatch):
    client = LLMClient(
        "https://relay.example/v1",
        "secret",
        "test-model",
    )
    called = {}

    def fake_agent(client, question, subject, skills, images, temperature=0):
        called["skills"] = skills
        return {
            "answer": "Pi Agent 回答",
            "assumptions": [],
            "learning_checks": ["现在画一个方向箭头"],
            "_agent": {
                "runtime": "pi-agent",
                "tool_calls": [{"tool": "load_teaching_skill", "ok": True}],
            },
        }

    monkeypatch.setattr("app.skill_qa.run_pi_agent", fake_agent)
    answer = normalize_answer(generate_answer(
        client,
        "位移为什么有方向？",
        "高中物理",
        selected=[{
            "key": "vector",
            "name": "矢量图示",
            "modalities": ["text"],
            "capability": {
                "summary": "把语言变成箭头",
                "evidence": [],
            },
            "folder": ".",
        }],
    ))

    assert called["skills"][0]["key"] == "vector"
    assert answer["answer"] == "Pi Agent 回答"
    assert answer["delivery"]["engine"] == "pi-agent"
    assert answer["delivery"]["tool_calls"][0]["tool"] == "load_teaching_skill"


def test_blind_answers_keeps_identity_out_of_public_answer_payload():
    answers, mapping = blind_answers(
        "qa-job",
        {"answer": "baseline"},
        {"answer": "skill"},
    )

    assert set(answers) == {"A", "B"}
    assert set(mapping.values()) == {"baseline", "skills"}
    assert "baseline" not in answers
    assert "skills" not in answers


def test_normalize_answer_builds_canonical_student_turn_and_audit_fields():
    answer = normalize_answer({
        "answer": "先看箭头的方向。",
        "assumptions": ["你知道正方向"],
        "learning_checks": ["请画出向东 3 米的位移"],
        "_delivery": {
            "requested": "multimodal",
            "actual": "text",
            "visual_count": 2,
            "fallback_reason": "vision unavailable",
            "tool_calls": [{"tool": "load_teaching_skill", "ok": True}],
        },
    })

    assert answer["schema_version"] == "student-tutor-turn-v1"
    assert answer["learning_check"]["prompts"] == ["请画出向东 3 米的位移"]
    assert answer["student_response"] == ""
    assert answer["assessment"]["status"] == "pending"
    assert answer["next_action"] == {
        "type": "await_student_response",
        "instruction": "请画出向东 3 米的位移",
        "reason": "",
    }
    assert answer["delivery"]["attempted_visual_count"] == 2
    assert answer["delivery"]["actual_visual_count"] == 0
    assert answer["delivery"]["visual_count"] == 0
    assert answer["delivery"]["fallback_occurred"] is True
    assert answer["delivery"]["multimodal_valid"] is False
    assert answer["delivery"]["tool_call_count"] == 1
    assert "马上自检" in answer["student_visible_text"]
    assert len(answer["student_visible_sha256"]) == 64
    audit = delivery_audit(answer)
    assert audit["include_in_primary_result"] is False
    assert audit["exclusion_reasons"] == ["requested_multimodal_but_not_executed"]


def test_judge_reads_same_student_visible_answer_including_learning_check():
    captured = {}

    class Client:
        def chat_json(self, system, user, temperature=0):
            captured["user"] = user
            return {"axis_scores": {}, "rationale": "", "cautions": []}

    answers = {
        "A": normalize_answer({"answer": "讲解 A", "learning_checks": ["A 的检查题"]}),
        "B": normalize_answer({"answer": "讲解 B", "learning_checks": ["B 的检查题"]}),
    }
    result = judge_answers(Client(), "测试问题", answers)

    assert student_visible_content(answers["A"]) in captured["user"]
    assert "A 的检查题" in captured["user"]
    assert "B 的检查题" in captured["user"]
    assert result["judge_version"] == QA_JUDGE_VERSION
    assert result["input_sha256"] == {
        "A": answers["A"]["student_visible_sha256"],
        "B": answers["B"]["student_visible_sha256"],
    }
    assert result["includes_structured_learning_check"] == {"A": True, "B": True}


def test_followup_assesses_the_displayed_check_and_preserves_student_response():
    captured = {}

    class Client:
        def chat_json(self, system, user, temperature=0):
            captured["user"] = user
            return {
                "answer": "方向对了，但还要标出大小。",
                "learning_checks": ["请把箭头长度补成 3 个单位"],
                "assessment": {
                    "status": "partial",
                    "feedback": "你已经正确画出了向东方向。",
                    "evidence": ["回答中写了向东"],
                },
                "next_action": {
                    "type": "remediate",
                    "instruction": "补画箭头长度",
                    "reason": "缺少大小",
                },
            }

    previous = normalize_answer({
        "answer": "位移需要大小和方向。",
        "learning_checks": ["请画出向东 3 米的位移"],
    })
    answer = normalize_answer(generate_followup_answer(
        Client(),
        "什么是位移？",
        "高中物理",
        previous,
        "我画了一个向东的箭头",
    ))

    assert "请画出向东 3 米的位移" in captured["user"]
    assert "我画了一个向东的箭头" in captured["user"]
    assert answer["student_response"] == "我画了一个向东的箭头"
    assert answer["assessment"]["status"] == "partial"
    assert answer["next_action"]["type"] == "remediate"


def test_manager_followup_reuses_selected_skills_and_saves_closed_loop_turn(
    tmp_path: Path,
    monkeypatch,
):
    manager, project_id = _manager_with_skill(tmp_path)
    previous_answer = normalize_answer({
        "answer": "先画正方向。",
        "learning_checks": ["请画向东 3 米的箭头"],
    })
    parent = JobState(
        id="qa-parent",
        request=PipelineRequest(source_url="project://test/qa", subject="高中物理"),
        kind="qa",
        project_id=project_id,
        qa_mode="qa",
        qa_question="什么是位移？",
        qa_skill_modality="text",
        status="completed",
        artifacts={"qa": {
            "job_id": "qa-parent",
            "question": "什么是位移？",
            "mode": "qa",
            "answer": previous_answer,
            "selected_skills": [{"key": "physics-visual-modeling", "name": "语言到图形"}],
            "selection": {"reason": "相关", "coverage_gap": "无"},
        }},
    )
    manager.store.save(parent)
    captured = {}

    def fake_followup(
        client, question, subject, previous_answer, student_response,
        selected=None, modality="text", temperature=0,
    ):
        captured["selected"] = selected
        captured["student_response"] = student_response
        return {
            "answer": "你的方向正确。",
            "student_response": student_response,
            "assessment": {"status": "correct", "feedback": "方向正确", "evidence": ["向东"]},
            "next_action": {"type": "advance", "instruction": "继续标大小", "reason": "方向已掌握"},
            "learning_checks": ["箭头长度应该是多少？"],
            "_delivery": {"requested": modality, "actual": "text"},
        }

    monkeypatch.setattr("app.pipeline.generate_followup_answer", fake_followup)
    followup = manager.create_qa_followup("qa-parent", "我画了向东的箭头")
    completed = manager.run(followup.id)
    result = completed.artifacts["qa"]

    assert completed.status == "completed"
    assert result["parent_job_id"] == "qa-parent"
    assert result["student_response"] == "我画了向东的箭头"
    assert result["answer"]["assessment"]["status"] == "correct"
    assert result["previous_answer"]["student_visible_sha256"] == previous_answer["student_visible_sha256"]
    assert [turn["role"] for turn in result["conversation"]] == [
        "student", "assistant", "student", "assistant",
    ]
    assert captured["selected"][0]["key"] == "physics-visual-modeling"
    assert captured["student_response"] == "我画了向东的箭头"


def test_manager_ab_job_hides_mapping_until_human_reveal(tmp_path: Path, monkeypatch):
    manager, project_id = _manager_with_skill(tmp_path)

    monkeypatch.setattr(
        "app.pipeline.select_skills",
        lambda client, question, candidates, limit: (
            candidates[:1],
            {"reason": "与矢量板书相关", "coverage_gap": "无"},
        ),
    )
    monkeypatch.setattr(
        "app.pipeline.generate_answer",
        lambda client, question, subject, selected=None, modality="text", temperature=0: {
            "answer": "使用课堂步骤回答" if selected else "一般回答",
            "assumptions": [],
            "teacher_checks": ["观察学生能否画出箭头"],
            "_delivery": {
                "requested": modality,
                "actual": "text",
                "fallback_reason": "no visual evidence" if modality == "multimodal" else "",
            },
        },
    )
    monkeypatch.setattr(
        "app.pipeline.judge_answers",
        lambda client, question, answers: {
            "axis_scores": {},
            "means": {"A": 8, "B": 6},
            "winner": "A",
            "rationale": "A 更具体",
            "cautions": [],
        },
    )

    job = manager.create_qa(
        project_id,
        QARequest(
            question="矢量板书怎么设计？",
            mode="ab",
            skill_modality="multimodal",
        ),
    )
    completed = manager.run(job.id)
    public_result = completed.artifacts["qa"]

    assert completed.status == "completed"
    assert public_result["revealed"] is False
    assert "reveal" not in public_result
    assert "selected_skills" not in public_result
    assert set(public_result["answers"]) == {"A", "B"}
    assert public_result["protocol"]["baseline_version"] == "v1-c974bac"
    assert public_result["execution_audit"]["comparison_valid"] is False
    assert public_result["execution_audit"]["include_in_primary_result"] is False

    revealed = manager.reveal_qa(job.id, "A")
    assert revealed["revealed"] is True
    assert set(revealed["reveal"].values()) == {"baseline", "skills"}
    assert revealed["selected_skills"][0]["name"] == "语言到图形的表征转换"
    assert revealed["human_vote"]["choice"] == "A"


def test_multimodal_qa_reads_only_visual_asset_inside_skill_folder(tmp_path: Path):
    folder = tmp_path / "skill"
    image = folder / "assets" / "visual" / "frame.jpg"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"jpeg")
    record = {
        "key": "physics-visual-modeling",
        "name": "语言到图形",
        "summary": "图形化",
        "teaching_goal": "会画图",
        "use_when": [],
        "modalities": ["text", "visual"],
        "folder": str(folder),
        "capability": {
            "evidence": [
                {"visual_asset": "assets/visual/frame.jpg", "lesson": "课一", "frame_id": "F001"},
                {"visual_asset": "../outside.jpg", "lesson": "越界", "frame_id": "F999"},
            ],
        },
    }

    class Client:
        def chat_json_multimodal(self, system, user, images, temperature=0):
            assert len(images) == 1
            assert images[0][1] == image
            return {"answer": "视觉回答", "assumptions": [], "teacher_checks": []}

    answer = generate_answer(
        Client(),
        "怎么画？",
        "高中物理",
        selected=[record],
        modality="multimodal",
    )
    assert answer["answer"] == "视觉回答"
    assert answer["_delivery"]["actual"] == "multimodal"
    assert answer["_delivery"]["visual_count"] == 1


def test_multimodal_qa_falls_back_to_text_when_relay_rejects_images(tmp_path: Path):
    folder = tmp_path / "skill"
    image = folder / "assets" / "visual" / "frame.jpg"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"jpeg")
    record = {
        "key": "physics-visual-modeling",
        "name": "语言到图形",
        "summary": "图形化",
        "teaching_goal": "会画图",
        "use_when": [],
        "modalities": ["text", "visual"],
        "folder": str(folder),
        "capability": {
            "evidence": [{"visual_asset": "assets/visual/frame.jpg", "frame_id": "F001"}],
        },
    }

    class Client:
        def chat_json_multimodal(self, system, user, images, temperature=0):
            raise RuntimeError("Remote end closed connection without response")

        def chat_json(self, system, user, temperature=0):
            return {"answer": "文本回退回答", "assumptions": [], "teacher_checks": []}

    answer = normalize_answer(generate_answer(
        Client(),
        "怎么画？",
        "高中物理",
        selected=[record],
        modality="multimodal",
    ))

    assert answer["answer"] == "文本回退回答"
    assert answer["delivery"]["requested"] == "multimodal"
    assert answer["delivery"]["actual"] == "text"
    assert "Remote end closed" in answer["delivery"]["fallback_reason"]


def test_multimodal_qa_builds_local_skill_answer_when_relay_is_down(tmp_path: Path):
    folder = tmp_path / "skill"
    image = folder / "assets" / "visual" / "frame.jpg"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"jpeg")
    record = {
        "key": "physics-visual-modeling",
        "name": "语言到图形",
        "summary": "图形化",
        "teaching_goal": "会画图",
        "use_when": [],
        "modalities": ["text", "visual"],
        "folder": str(folder),
        "capability": {
            "summary": "把语言转换成箭头和坐标轴。",
            "lesson_flow": [{"teacher_action": "先画坐标轴", "student_signal": "能标出正方向"}],
            "assessment_checkpoints": ["学生能独立画出方向箭头"],
            "evidence": [{"visual_asset": "assets/visual/frame.jpg", "frame_id": "F001"}],
        },
    }

    class Client:
        def chat_json_multimodal(self, system, user, images, temperature=0):
            raise RuntimeError("vision down")

        def chat_json(self, system, user, temperature=0):
            raise RuntimeError("text down")

    answer = normalize_answer(generate_answer(
        Client(),
        "怎么画？",
        "高中物理",
        selected=[record],
        modality="multimodal",
    ))

    assert answer["delivery"]["actual"] == "local"
    assert "语言到图形" in answer["answer"]
    assert "先画坐标轴" in answer["answer"]
    assert "教师：" not in answer["answer"]
    assert "现在轮到你" in answer["answer"]
    assert answer["teacher_checks"] == ["你能独立画出方向箭头"]
