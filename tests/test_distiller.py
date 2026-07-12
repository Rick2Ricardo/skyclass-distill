from app.distiller import add_teacher_guides, distill_single


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
