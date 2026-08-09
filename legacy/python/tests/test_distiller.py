from pathlib import Path

from app.distiller import (
    add_teacher_guides, analyze_lesson_multimodal, distill_single, frames_for_range,
    transcript_chunks_with_ranges,
)


class FakeLLMClient:
    def __init__(self):
        self.calls = 0
        self.max_attempts = 2

    def chat_json(self, system: str, user: str):
        self.calls += 1
        return {
            "lesson_flow": [
                {
                    "phase": f"阶段 {index}", "teacher_action": "提出问题",
                    "suggested_language": "请观察", "expected_student_response": "说出变量",
                    "if_student_struggles": "补充图示",
                }
                for index in range(1, 5)
            ],
            "assessment_checkpoints": [
                {"check": "口头检查", "success_signal": "能解释", "next_move_if_not": "回到图示"},
                {"check": "迁移练习", "success_signal": "能独立完成", "next_move_if_not": "降低难度"},
            ],
            "adaptations": [
                {"learner_signal": "卡住", "adjustment": "补图示"},
                {"learner_signal": "已掌握", "adjustment": "增加变式"},
            ],
        }


class InvalidOnceClient(FakeLLMClient):
    def chat_json(self, system: str, user: str):
        if self.calls == 0:
            self.calls += 1
            return {}
        return super().chat_json(system, user)


class SingleDistillClient(FakeLLMClient):
    def __init__(self):
        super().__init__()
        self.prompts = []

    def chat_json(self, system: str, user: str):
        self.prompts.append((system, user))
        if len(self.prompts) == 1:
            return {
                "suite_name": "单课教学能力",
                "capabilities": [{
                    "key": "guided-modeling",
                    "name": "引导建模",
                    "evidence": [{"lesson": "四维空间", "timestamp": "01:20", "quote": "先观察坐标轴"}],
                    "supporting_lessons": 1,
                }],
            }
        return super().chat_json(system, user)


def test_teacher_guide_checkpoint_skips_completed_capabilities():
    complete = {
        "name": "已完成",
        "lesson_flow": [{"phase": "一"}],
        "assessment_checkpoints": [{"check": "一"}],
        "adaptations": [{"learner_signal": "一"}],
    }
    pending = {"name": "待生成"}
    suite = {"capabilities": [complete, pending]}
    checkpoints = []
    client = FakeLLMClient()

    result = add_teacher_guides(client, suite, [], checkpoint=lambda payload: checkpoints.append(payload.copy()))

    assert client.calls == 1
    assert result["capabilities"][1]["lesson_flow"]
    assert len(checkpoints) == 1


def test_teacher_guide_retries_invalid_model_structure():
    client = InvalidOnceClient()
    suite = {"capabilities": [{"name": "待生成"}]}

    result = add_teacher_guides(client, suite, [])

    assert client.calls == 2
    assert len(result["capabilities"][0]["lesson_flow"]) == 4


def test_single_distill_uses_single_lesson_evidence_prompt():
    client = SingleDistillClient()

    result = distill_single(client, {"lesson_title": "四维空间", "teaching_moves": []})

    system, user = client.prompts[0]
    assert "不要求跨课程重复" in system
    assert "至少两节课" not in system
    assert "不要因为只有一节课而返回空列表" in user
    assert result["capabilities"][0]["supporting_lessons"] == 1
    assert result["capabilities"][0]["lesson_flow"]


class MultimodalAnalysisClient:
    def __init__(self):
        self.images = []

    def chat_json_multimodal(self, system, user, images):
        self.images.append(images)
        return {
            "lesson_title": "图像课",
            "visual_evidence": [{"frame_id": "F001", "observation": "板书有坐标轴"}],
        }

    def chat_json(self, system, user):
        raise AssertionError("单分段分析不应调用文本 reduce")


def test_multimodal_analysis_aligns_frames_to_transcript_range(tmp_path: Path):
    near = tmp_path / "near.jpg"
    far = tmp_path / "far.jpg"
    near.write_bytes(b"near")
    far.write_bytes(b"far")
    transcript = {"segments": [{"start": 10, "end": 20, "text": "请看坐标轴"}]}
    frames = [
        {"frame_id": "F001", "timestamp": 12, "path": str(near), "selection_reason": "transcript_cue"},
        {"frame_id": "F002", "timestamp": 80, "path": str(far), "selection_reason": "periodic"},
    ]
    client = MultimodalAnalysisClient()

    result = analyze_lesson_multimodal(client, "图像课", "高中物理", transcript, frames)

    assert result["visual_evidence"][0]["frame_id"] == "F001"
    assert [label for label, _ in client.images[0]] == ["F001@00:12"]


def test_frames_for_range_uses_nearest_frame_when_range_has_no_frame():
    frames = [{"frame_id": "F001", "timestamp": 5}, {"frame_id": "F002", "timestamp": 40}]
    assert frames_for_range(frames, 24, 28)[0]["frame_id"] == "F002"


def test_frames_for_range_bounds_relay_payload_to_three_representative_frames():
    frames = [{"frame_id": f"F{index:03d}", "timestamp": index * 10} for index in range(1, 11)]

    selected = frames_for_range(frames, 0, 120)

    assert len(selected) == 3
    assert selected[0]["frame_id"] == "F001"
    assert selected[-1]["frame_id"] == "F010"


def test_multimodal_transcript_chunks_bound_long_relay_requests():
    transcript = {
        "segments": [
            {"start": index * 10, "end": index * 10 + 9, "text": "物理课堂" * 500}
            for index in range(8)
        ]
    }

    chunks = transcript_chunks_with_ranges(transcript)

    assert len(chunks) >= 2
    assert all(len(chunk["text"]) <= 9_000 for chunk in chunks)
    assert all(chunk["start"] <= chunk["end"] for chunk in chunks)
