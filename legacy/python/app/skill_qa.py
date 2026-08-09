from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any, Callable

from .llm import LLMClient
from .pi_agent import PiAgentUnavailable, run_pi_agent


QA_PROMPT_VERSION = "pi-agent-skill-tutor-v1"
QA_TURN_SCHEMA_VERSION = "student-tutor-turn-v1"
QA_JUDGE_VERSION = "student-facing-skill-ab-judge-v3"
QA_AXES = (
    ("goal_alignment", "目标与问题匹配"),
    ("pedagogical_soundness", "讲解准确且循序渐进"),
    ("actionability", "学生可跟随性"),
    ("observable_assessment", "学习检查质量"),
    ("clarity", "表达清晰度"),
)

LogFn = Callable[[str], None]


def _text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(_text(item) for item in value)
    if isinstance(value, dict):
        return " ".join(_text(item) for item in value.values())
    return str(value or "")


def _string_list(value: Any, limit: int = 8) -> list[str]:
    if not isinstance(value, list):
        value = [value] if value else []
    return [str(item).strip() for item in value if str(item).strip()][:limit]


def _tokens(value: str) -> set[str]:
    normalized = re.sub(r"\s+", "", value.lower())
    latin = set(re.findall(r"[a-z0-9][a-z0-9_-]{1,}", normalized))
    cjk_runs = re.findall(r"[\u3400-\u9fff]+", normalized)
    cjk: set[str] = set()
    for run in cjk_runs:
        if len(run) == 1:
            cjk.add(run)
        for size in (2, 3):
            cjk.update(run[index : index + size] for index in range(max(0, len(run) - size + 1)))
    return latin | cjk


def _safe_manifest(folder: Path) -> dict[str, Any] | None:
    manifest_file = folder / "manifest.json"
    if not manifest_file.is_file():
        return None
    try:
        manifest = json.loads(manifest_file.read_text("utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(manifest, dict) or not isinstance(manifest.get("capability"), dict):
        return None
    return manifest


def collect_project_skill_records(
    project_id: str,
    jobs: list[Any],
    skill_deleted: Callable[[str, str], bool],
) -> list[dict[str, Any]]:
    """Load validated project Skills from their packaged manifests."""
    records: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for job in jobs:
        if (
            getattr(job, "project_id", None) != project_id
            or getattr(job, "kind", None) != "distill"
            or getattr(job, "status", None) != "completed"
        ):
            continue
        for built in job.artifacts.get("skills", []):
            name = str(built.get("name", ""))
            if (
                not name
                or not built.get("valid")
                or skill_deleted(job.id, name)
                or (job.id, name) in seen
            ):
                continue
            folder = Path(str(built.get("path", ""))).resolve()
            manifest = _safe_manifest(folder)
            if manifest is None:
                continue
            capability = manifest["capability"]
            modalities = [
                value for value in manifest.get("modalities", [])
                if value in {"text", "visual", "code"}
            ]
            records.append({
                "key": name,
                "name": str(capability.get("name") or built.get("display_name") or name),
                "summary": str(capability.get("summary") or ""),
                "teaching_goal": str(capability.get("teaching_goal") or ""),
                "use_when": capability.get("use_when", []),
                "modalities": modalities or ["text"],
                "capability": capability,
                "folder": str(folder),
                "job_id": job.id,
            })
            seen.add((job.id, name))
    return records


def rank_skill_records(
    question: str,
    records: list[dict[str, Any]],
    limit: int = 8,
) -> list[dict[str, Any]]:
    """Build a deterministic lexical shortlist before the LM selector."""
    query_tokens = _tokens(question)
    ranked: list[tuple[float, str, dict[str, Any]]] = []
    for record in records:
        title = f"{record.get('name', '')} {record.get('summary', '')}"
        applicability = _text(record.get("use_when", []))
        goal = str(record.get("teaching_goal", ""))
        capability = record.get("capability", {})
        grounded_body = _text({
            "evidence": capability.get("evidence", []),
            "lesson_flow": capability.get("lesson_flow", capability.get("procedure", [])),
            "failure_modes": capability.get("failure_modes", []),
        })
        title_tokens = _tokens(title)
        body_tokens = _tokens(f"{applicability} {goal} {grounded_body}")
        title_overlap = len(query_tokens & title_tokens)
        body_overlap = len(query_tokens & body_tokens)
        coverage = (title_overlap + body_overlap) / max(1, len(query_tokens))
        exact_boost = 0.0
        compact_question = re.sub(r"\s+", "", question.lower())
        for phrase in (str(record.get("name", "")), *map(str, record.get("use_when", []))):
            compact_phrase = re.sub(r"\s+", "", phrase.lower())
            if compact_phrase and (compact_phrase in compact_question or compact_question in compact_phrase):
                exact_boost = max(exact_boost, 2.0)
        modality_boost = 0.08 * len(record.get("modalities", []))
        score = 3.0 * title_overlap + body_overlap + coverage + exact_boost + modality_boost
        ranked.append((score, str(record.get("key", "")), record | {"retrieval_score": round(score, 4)}))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return [record for _, _, record in ranked[: max(1, limit)]]


def _candidate_card(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": record["key"],
        "name": record["name"],
        "summary": record.get("summary", ""),
        "teaching_goal": record.get("teaching_goal", ""),
        "use_when": record.get("use_when", []),
        "modalities": record.get("modalities", ["text"]),
        "retrieval_score": record.get("retrieval_score", 0),
    }


def select_skills(
    client: LLMClient,
    question: str,
    candidates: list[dict[str, Any]],
    limit: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    cards = [_candidate_card(record) for record in candidates]
    raw = client.chat_json(
        """你是学习 Skill 路由器。根据学生的问题或学习任务，从候选中选择真正有帮助且能够组合的少量 Skills。
只允许返回候选中的 key；不相关时可以少选或返回空数组。不要回答学生问题。输出严格 JSON。""",
        f"""学生的问题或学习任务：
{question}

最多选择 {limit} 个 Skills。候选：
{json.dumps(cards, ensure_ascii=False)}

返回：
{{
  "selected_skill_keys": ["候选 key"],
  "selection_reason": "为什么这些 Skill 能共同帮助回答问题",
  "coverage_gap": "候选仍无法覆盖什么；没有则写无"
}}""",
        temperature=0,
    )
    allowed = {record["key"]: record for record in candidates}
    selected_keys: list[str] = []
    for key in raw.get("selected_skill_keys", []):
        normalized = str(key)
        if normalized in allowed and normalized not in selected_keys:
            selected_keys.append(normalized)
        if len(selected_keys) >= limit:
            break
    if not selected_keys and candidates:
        selected_keys = [candidates[0]["key"]]
        raw["selection_reason"] = str(raw.get("selection_reason") or "模型未选择候选，回退到词法最相关 Skill")
    return [allowed[key] for key in selected_keys], {
        "reason": str(raw.get("selection_reason") or ""),
        "coverage_gap": str(raw.get("coverage_gap") or ""),
    }


def _compact_capability(record: dict[str, Any]) -> dict[str, Any]:
    capability = record["capability"]
    return {
        "key": record["key"],
        "name": record["name"],
        "summary": capability.get("summary", ""),
        "teaching_goal": capability.get("teaching_goal", ""),
        "use_when": capability.get("use_when", []),
        "prerequisites": capability.get("prerequisites", capability.get("inputs", [])),
        "lesson_flow": capability.get("lesson_flow", capability.get("procedure", [])),
        "assessment_checkpoints": capability.get("assessment_checkpoints", []),
        "adaptations": capability.get("adaptations", []),
        "quality_checks": capability.get("quality_checks", []),
        "failure_modes": capability.get("failure_modes", []),
        "evidence": capability.get("evidence", [])[:6],
        "modalities": record.get("modalities", ["text"]),
    }


def _visual_images(records: list[dict[str, Any]], limit: int = 4) -> list[tuple[str, Path]]:
    images: list[tuple[str, Path]] = []
    seen: set[Path] = set()
    for record in records:
        folder = Path(record["folder"]).resolve()
        for evidence in record["capability"].get("evidence", []):
            relative = evidence.get("visual_asset")
            if not relative:
                continue
            path = (folder / str(relative)).resolve()
            if folder not in path.parents or path in seen or not path.is_file():
                continue
            label = (
                f"{record['key']} · {evidence.get('lesson', '来源课程')} · "
                f"{evidence.get('frame_id', '')}@{evidence.get('frame_timestamp') or evidence.get('timestamp', '')}"
            )
            images.append((label, path))
            seen.add(path)
            if len(images) >= limit:
                return images
    return images


def local_skill_fallback(
    question: str,
    subject: str,
    selected: list[dict[str, Any]],
    reason: str,
) -> dict[str, Any]:
    """Teach from Skill fields directly when the relay is unavailable."""
    def student_facing(value: Any) -> str:
        text = _text(value).strip()
        replacements = (
            ("部分学生", "你可能"),
            ("多数学生", "你应该"),
            ("巡视学生", "检查你"),
            ("引导学生", "带你"),
            ("要求学生", "请你"),
            ("让学生", "请你"),
            ("学生能", "你能"),
            ("学生", "你"),
            ("教师", "我"),
            ("呈现", "先看"),
            ("展示", "先看"),
        )
        for source, target in replacements:
            text = text.replace(source, target)
        return text

    def learning_check(item: Any) -> str:
        if not isinstance(item, dict):
            return student_facing(item)
        task = (
            item.get("student_task") or item.get("prompt") or item.get("check")
            or item.get("method") or item.get("question")
        )
        signal = item.get("success_signal") or item.get("expected_answer")
        task_text = student_facing(task)
        signal_text = student_facing(signal)
        if signal_text:
            return f"请你完成一次自检，目标是：{signal_text}"
        return task_text or signal_text

    lines = [
        "## 先抓住问题",
        f"你问的是：“{question}”我们先不背结论，而是把关键词、方向和可以画出来的关系逐一拆开。",
        "",
        "## 跟我一步步学",
    ]
    checks: list[str] = []
    for index, record in enumerate(selected, 1):
        capability = record.get("capability", {})
        name = str(record.get("name") or record.get("key") or f"Skill {index}")
        summary = str(capability.get("summary") or record.get("summary") or "").strip()
        lines.extend(["", f"### {index}. 用“{name}”来理解"])
        if summary:
            lines.append(f"这一轮我会这样带你：{student_facing(summary)}")
        goal = student_facing(capability.get("teaching_goal"))
        if goal:
            lines.append(f"学完这一小步，你应该能做到：{goal}")
        flow = capability.get("lesson_flow", capability.get("procedure", []))
        for step_index, step in enumerate(flow[:3], 1):
            if isinstance(step, dict):
                action = (
                    step.get("teacher_action") or step.get("action")
                    or step.get("move") or step.get("description")
                )
                student = (
                    step.get("expected_student_response") or step.get("student_action")
                    or step.get("student_signal")
                )
                wording = step.get("teacher_talk") or step.get("prompt") or step.get("script")
                detail = "；".join(
                    text for text in (
                        student_facing(action) if action else "",
                        f"想一想：{student_facing(wording)}" if wording else "",
                        f"你的目标：{student_facing(student)}" if student else "",
                    ) if text
                )
            else:
                detail = student_facing(step)
            if detail:
                lines.append(f"{step_index}. {detail}")
        evidence_quotes = [
            student_facing(item.get("quote") or item.get("excerpt"))
            for item in capability.get("evidence", [])[:3]
            if isinstance(item, dict) and (item.get("quote") or item.get("excerpt"))
        ]
        if evidence_quotes:
            lines.append("可以抓住这些来源线索：" + "；".join(evidence_quotes))
        for item in (
            capability.get("assessment_checkpoints", [])
            or capability.get("quality_checks", [])
        ):
            text = learning_check(item)
            if text and text not in checks:
                checks.append(text)
    if not checks:
        checks = [
            "请你独立画出或写出关键表征，再用一句话解释每个符号的含义。",
            "换一个表面不同的情境，看看你能否继续使用同一判断标准。",
        ]
    lines.extend(["", "## 现在轮到你", *[f"- {item}" for item in checks[:4]]])
    lines.extend([
        "",
        "把你的答案、草图或卡住的那一步发给我，我会根据你的回答继续讲，而不是直接重复结论。",
    ])
    return {
        "answer": "\n".join(lines),
        "assumptions": [
            f"当前学科为{subject}",
            "外部模型接口暂不可用，本轮由已选择 Skill 的结构化讲解步骤直接授课。",
        ],
        "teacher_checks": checks[:6],
        "_delivery": {
            "requested": "multimodal",
            "actual": "local",
            "visual_count": 0,
            "fallback_reason": reason,
            "engine": "local-skill-fallback",
            "agent_fallback_reason": reason,
            "tool_calls": [],
        },
    }


def generate_answer(
    client: LLMClient,
    question: str,
    subject: str,
    selected: list[dict[str, Any]] | None = None,
    modality: str = "text",
    temperature: float = 0,
) -> dict[str, Any]:
    selected = selected or []
    context = [_compact_capability(record) for record in selected]
    images = _visual_images(selected) if modality == "multimodal" else []
    pi_agent_error = ""

    # Keep retrieval and experimental assignment in Python, but run both the
    # baseline and Skill arm through the same real Pi AgentSession. Every call
    # uses an ephemeral session, so this adds the agent/tool loop without L1/L2/L3.
    if isinstance(client, LLMClient):
        try:
            answer = run_pi_agent(
                client,
                question,
                subject,
                context,
                images,
                temperature=temperature,
            )
            agent = answer.pop("_agent", {})
            answer["_delivery"] = {
                "requested": modality,
                "actual": "multimodal" if images else "text",
                "visual_count": len(images),
                "fallback_reason": (
                    "所选 Skills 没有可读取的视觉证据，本次 Pi Agent 使用文本内容。"
                    if modality == "multimodal" and selected and not images else ""
                ),
                "engine": "pi-agent",
                "agent_fallback_reason": "",
                "tool_calls": agent.get("tool_calls", []),
            }
            return answer
        except PiAgentUnavailable:
            # Optional runtime is not installed or was explicitly disabled.
            # Preserve the previous direct-generation path for development/tests.
            pass
        except RuntimeError as exc:
            pi_agent_error = str(exc)

    schema = """只返回严格 JSON：
{
  "answer": "直接面向学生讲解的 Markdown；包含解释、例子和让学生马上作答的小检查",
  "assumptions": ["对学生已有基础的必要假设；没有则为空"],
  "learning_checks": ["学生现在可以回答或完成的短问题、草图或练习"]
}"""
    if not selected:
        answer = client.chat_json(
            """你是一名直接面向学生授课的学科老师。请用第二人称“你”讲解，而不是讨论老师应该怎么设计课堂。
先判断学生卡在哪里，再给出直观解释、必要定义、一个具体例子和一个马上可以回答的小检查。不要声称使用了任何 Skill、课程视频或未提供的课堂证据。""",
            f"学科：{subject}\n学生的问题或学习任务：{question}\n\n{schema}",
            temperature=temperature,
        )
        answer["_delivery"] = {
            "requested": "text",
            "actual": "text",
            "visual_count": 0,
            "fallback_reason": "",
            "engine": "direct",
            "agent_fallback_reason": pi_agent_error,
            "tool_calls": [],
        }
        return answer

    system = """你是接管授课的 Skill 老师，直接面向学生完成讲解，不是教师教练，也不是教案生成器。
1. 把 Skills 内化为你的讲解方法，只采用与当前问题真正相关的部分，不能机械拼接；
2. 全程用第二人称“你”，亲自解释概念、演示推理、画出应有的表征，并根据可能的卡点提供下一步；
3. 推荐结构是：先给直觉抓手 → 精确定义或推理 → 具体例子/图示 → 一个让学生马上作答的小检查；
4. 不得输出“教师可以……”“让学生……”或课堂活动设计；要直接对学生说和直接提问；
5. Skill 中的课程摘录只用于支持讲解，不得扩写成未发生的事实；
6. 不要在答案正文透露“实验组”“Skill 组”或系统实现；
7. 如果 Skill 不足以支持某个学科事实，依靠可靠的基础学科知识补足，并明确必要假设。"""
    user = (
        f"学科：{subject}\n学生的问题或学习任务：{question}\n\n"
        f"供你内化使用的教学 Skills：\n{json.dumps(context, ensure_ascii=False)}\n\n{schema}"
    )
    if images:
        user += (
            "\n\n随请求提供的图片是 Skill 的来源视觉证据。只引用画面直接可见内容，"
            "把它直接转化为学生此刻能理解的图示、板书式解释或实验观察。"
        )
        try:
            if isinstance(client, LLMClient):
                answer = client.chat_json_multimodal(
                    system, user, images, temperature=temperature,
                    max_attempts=1, timeout=min(client.timeout, 45),
                )
            else:
                answer = client.chat_json_multimodal(system, user, images, temperature=temperature)
            answer["_delivery"] = {
                "requested": "multimodal",
                "actual": "multimodal",
                "visual_count": len(images),
                "fallback_reason": "",
                "engine": "direct",
                "agent_fallback_reason": pi_agent_error,
                "tool_calls": [],
            }
            return answer
        except RuntimeError as visual_exc:
            # Some OpenAI-compatible relays accept JSON chat but close image requests.
            # A teacher should still receive a grounded answer instead of losing the
            # whole QA run, so retry once with the same selected Skills in text form.
            try:
                if isinstance(client, LLMClient):
                    answer = client.chat_json(
                        system, user, temperature=temperature,
                        max_attempts=1, timeout=min(client.timeout, 45),
                    )
                else:
                    answer = client.chat_json(system, user, temperature=temperature)
                answer["_delivery"] = {
                    "requested": "multimodal",
                    "actual": "text",
                    "visual_count": len(images),
                    "fallback_reason": str(visual_exc),
                    "engine": "direct",
                    "agent_fallback_reason": pi_agent_error,
                    "tool_calls": [],
                }
                return answer
            except RuntimeError as text_exc:
                return local_skill_fallback(
                    question,
                    subject,
                    selected,
                    f"视觉请求：{visual_exc}；文本重试：{text_exc}",
                )
    answer = client.chat_json(system, user, temperature=temperature)
    answer["_delivery"] = {
        "requested": modality,
        "actual": "text",
        "visual_count": 0,
        "fallback_reason": (
            "所选 Skills 没有可读取的视觉证据，本次自动使用文本内容。"
            if modality == "multimodal" else ""
        ),
        "engine": "direct",
        "agent_fallback_reason": pi_agent_error,
        "tool_calls": [],
    }
    return answer


def generate_followup_answer(
    client: LLMClient,
    question: str,
    subject: str,
    previous_answer: dict[str, Any],
    student_response: str,
    selected: list[dict[str, Any]] | None = None,
    modality: str = "text",
    temperature: float = 0,
) -> dict[str, Any]:
    """Run the minimal stateless P0 feedback turn after a displayed check."""
    selected = selected or []
    context = [_compact_capability(record) for record in selected]
    images = _visual_images(selected) if modality == "multimodal" else []
    previous_visible = student_visible_content(previous_answer)
    schema = """只返回严格 JSON：
{
  "answer": "先反馈学生刚才的作答，再给恰好适合当前状态的讲解或提示；不要无条件泄露完整答案",
  "assumptions": ["必要假设；没有则为空"],
  "learning_checks": ["下一步由学生完成的一个短问题、草图或练习；已经掌握则可为空"],
  "student_response": "逐字保留本轮收到的学生回答",
  "assessment": {
    "status": "correct | partial | incorrect | unclear",
    "feedback": "直接面向学生的简短诊断反馈",
    "evidence": ["判断依据必须来自学生回答中的可观察内容"]
  },
  "next_action": {
    "type": "advance | remediate | clarify | complete",
    "instruction": "学生下一步具体做什么",
    "reason": "为什么选择这一步"
  }
}"""
    system = """你是一名直接面向学生的学科老师，正在执行一次最小、可审计的学习检查闭环。
只根据学生真正看到的上一轮内容和学生刚才的回答判断，不得假装看到草图、步骤或信息。
先判断回答为正确、部分正确、错误或无法判断，再选择推进、补救、澄清或完成。
反馈必须指出学生回答中的具体依据；证据不足时使用 unclear 并追问。
教学 Skill 只决定怎样教，不能替代对学生回答的观察。全程用第二人称“你”。"""
    user = f"""学科：{subject}
最初问题：{question}

学生上一轮真正看到的内容：
{previous_visible}

学生本轮回答：
{student_response}

继续使用的教学 Skills：
{json.dumps(context, ensure_ascii=False)}

{schema}"""

    def attach_delivery(
        answer: dict[str, Any],
        *,
        actual: str,
        attempted_visual_count: int,
        fallback_reason: str = "",
    ) -> dict[str, Any]:
        answer["student_response"] = student_response
        answer["_delivery"] = {
            "requested": modality,
            "actual": actual,
            "visual_count": attempted_visual_count if actual == "multimodal" else 0,
            "attempted_visual_count": attempted_visual_count,
            "actual_visual_count": attempted_visual_count if actual == "multimodal" else 0,
            "fallback_reason": fallback_reason,
            "engine": "direct-followup",
            "agent_fallback_reason": "",
            "tool_calls": [],
        }
        return answer

    if images:
        try:
            if isinstance(client, LLMClient):
                answer = client.chat_json_multimodal(
                    system, user, images, temperature=temperature,
                    max_attempts=1, timeout=min(client.timeout, 45),
                )
            else:
                answer = client.chat_json_multimodal(system, user, images, temperature=temperature)
            return attach_delivery(
                answer, actual="multimodal", attempted_visual_count=len(images),
            )
        except RuntimeError as visual_exc:
            try:
                if isinstance(client, LLMClient):
                    answer = client.chat_json(
                        system, user, temperature=temperature,
                        max_attempts=1, timeout=min(client.timeout, 45),
                    )
                else:
                    answer = client.chat_json(system, user, temperature=temperature)
                return attach_delivery(
                    answer,
                    actual="text",
                    attempted_visual_count=len(images),
                    fallback_reason=str(visual_exc),
                )
            except RuntimeError as text_exc:
                return {
                    "answer": (
                        "我已经收到你的回答，但当前模型接口不可用，所以这一轮不能可靠判断正误。"
                        "请保留刚才的作答，接口恢复后再继续评估。"
                    ),
                    "assumptions": [],
                    "learning_checks": ["请补充你判断时使用的关键步骤或理由。"],
                    "student_response": student_response,
                    "assessment": {
                        "status": "unclear",
                        "feedback": "当前无法完成可靠评估，不把你的回答判为正确或错误。",
                        "evidence": [],
                    },
                    "next_action": {
                        "type": "clarify",
                        "instruction": "请补充你判断时使用的关键步骤或理由。",
                        "reason": "模型接口不可用且现有信息不足以完成评估。",
                    },
                    "_delivery": {
                        "requested": modality,
                        "actual": "local",
                        "visual_count": 0,
                        "attempted_visual_count": len(images),
                        "actual_visual_count": 0,
                        "fallback_reason": f"视觉请求：{visual_exc}；文本重试：{text_exc}",
                        "engine": "local-followup-fallback",
                        "agent_fallback_reason": "",
                        "tool_calls": [],
                    },
                }

    try:
        answer = client.chat_json(system, user, temperature=temperature)
        return attach_delivery(answer, actual="text", attempted_visual_count=0)
    except RuntimeError as text_exc:
        return {
            "answer": "我已经收到你的回答，但当前模型接口不可用，暂时不能可靠判断正误。",
            "assumptions": [],
            "learning_checks": ["请补充你判断时使用的关键步骤或理由。"],
            "student_response": student_response,
            "assessment": {
                "status": "unclear",
                "feedback": "当前无法完成可靠评估，不把你的回答判为正确或错误。",
                "evidence": [],
            },
            "next_action": {
                "type": "clarify",
                "instruction": "请补充你判断时使用的关键步骤或理由。",
                "reason": "模型接口不可用且现有信息不足以完成评估。",
            },
            "_delivery": {
                "requested": modality,
                "actual": "local",
                "visual_count": 0,
                "attempted_visual_count": 0,
                "actual_visual_count": 0,
                "fallback_reason": str(text_exc),
                "engine": "local-followup-fallback",
                "agent_fallback_reason": "",
                "tool_calls": [],
            },
        }


def normalize_answer(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize every tutor output into the P0 student-turn contract.

    ``teacher_checks`` remains as a read-compatible alias for results written by
    the pre-P0 UI. New code should use ``learning_check.prompts``.
    """
    delivery = raw.get("_delivery", raw.get("delivery", {}))
    raw_check = raw.get("learning_check", {})
    if isinstance(raw_check, dict):
        checks = _string_list(raw_check.get("prompts", raw_check.get("prompt", [])))
        success_criteria = _string_list(raw_check.get("success_criteria", []))
    else:
        checks = _string_list(raw_check)
        success_criteria = []
    if not checks:
        checks = _string_list(raw.get("learning_checks", raw.get("teacher_checks", [])))

    raw_assessment = raw.get("assessment", {})
    assessment = raw_assessment if isinstance(raw_assessment, dict) else {}
    assessment_status = str(assessment.get("status") or "pending").strip().lower()
    if assessment_status not in {"pending", "correct", "partial", "incorrect", "unclear"}:
        assessment_status = "unclear"

    raw_next = raw.get("next_action", {})
    next_action = raw_next if isinstance(raw_next, dict) else {}
    next_type = str(next_action.get("type") or "").strip().lower()
    allowed_next = {"await_student_response", "advance", "remediate", "clarify", "complete"}
    if next_type not in allowed_next:
        next_type = "await_student_response" if checks else "complete"
    next_instruction = str(next_action.get("instruction") or "").strip()
    if not next_instruction and next_type == "await_student_response" and checks:
        next_instruction = checks[0]

    requested = str(delivery.get("requested") or "text")
    actual = str(delivery.get("actual") or "text")
    fallback_reason = str(delivery.get("fallback_reason") or "")
    agent_fallback_reason = str(delivery.get("agent_fallback_reason") or "")
    tool_calls = [
        item for item in delivery.get("tool_calls", [])
        if isinstance(item, dict)
    ][:12]
    attempted_visual_count = int(
        delivery.get("attempted_visual_count", delivery.get("visual_count", 0)) or 0
    )
    actual_visual_count = int(
        delivery.get(
            "actual_visual_count",
            attempted_visual_count if actual == "multimodal" else 0,
        ) or 0
    )
    fallback_occurred = bool(fallback_reason or agent_fallback_reason)
    multimodal_valid = bool(
        requested == "multimodal"
        and actual == "multimodal"
        and actual_visual_count > 0
        and not fallback_reason
    )

    normalized = {
        "schema_version": QA_TURN_SCHEMA_VERSION,
        "answer": str(raw.get("answer") or "模型没有返回可显示的答案。").strip(),
        "assumptions": _string_list(raw.get("assumptions", [])),
        "learning_check": {
            "prompts": checks,
            "success_criteria": success_criteria,
        },
        "student_response": str(raw.get("student_response") or "").strip(),
        "assessment": {
            "status": assessment_status,
            "feedback": str(assessment.get("feedback") or "").strip(),
            "evidence": _string_list(assessment.get("evidence", [])),
        },
        "next_action": {
            "type": next_type,
            "instruction": next_instruction,
            "reason": str(next_action.get("reason") or "").strip(),
        },
        # Deprecated alias kept while old saved results and the UI migrate.
        "teacher_checks": checks,
        "delivery": {
            "requested": requested,
            "actual": actual,
            "visual_count": actual_visual_count,
            "attempted_visual_count": attempted_visual_count,
            "actual_visual_count": actual_visual_count,
            "fallback_occurred": fallback_occurred,
            "multimodal_valid": multimodal_valid,
            "fallback_reason": fallback_reason,
            "engine": str(delivery.get("engine") or "direct"),
            "agent_fallback_reason": agent_fallback_reason,
            "tool_calls": tool_calls,
            "tool_call_count": len(tool_calls),
        },
    }
    normalized["student_visible_text"] = student_visible_content(normalized)
    normalized["student_visible_sha256"] = hashlib.sha256(
        normalized["student_visible_text"].encode("utf-8")
    ).hexdigest()
    return normalized


def student_visible_content(answer: dict[str, Any]) -> str:
    """Render the semantic content visible in an answer card for judging/audit."""
    sections = [str(answer.get("answer") or "").strip()]
    assumptions = _string_list(answer.get("assumptions", []))
    learning_check = answer.get("learning_check", {})
    checks = _string_list(
        learning_check.get("prompts", []) if isinstance(learning_check, dict)
        else learning_check
    )
    if not checks:
        checks = _string_list(answer.get("teacher_checks", []))
    assessment = answer.get("assessment", {})
    if assumptions:
        sections.append("学习前提：\n" + "\n".join(f"- {item}" for item in assumptions))
    if isinstance(assessment, dict) and str(assessment.get("feedback") or "").strip():
        sections.append("对你刚才回答的反馈：\n" + str(assessment["feedback"]).strip())
    if checks:
        sections.append("马上自检：\n" + "\n".join(f"- {item}" for item in checks))
    next_action = answer.get("next_action", {})
    instruction = (
        str(next_action.get("instruction") or "").strip()
        if isinstance(next_action, dict) else ""
    )
    if instruction and instruction not in checks:
        sections.append("下一步：\n" + instruction)
    return "\n\n".join(section for section in sections if section)


def delivery_audit(answer: dict[str, Any]) -> dict[str, Any]:
    """Return the small, stable execution record used by P0 result filtering."""
    delivery = answer.get("delivery", {})
    requested = str(delivery.get("requested") or "text")
    actual = str(delivery.get("actual") or "text")
    valid_for_requested_modality = bool(
        requested != "multimodal" or delivery.get("multimodal_valid") is True
    )
    exclusion_reasons: list[str] = []
    if requested == "multimodal" and not valid_for_requested_modality:
        exclusion_reasons.append("requested_multimodal_but_not_executed")
    if actual == "local":
        exclusion_reasons.append("external_model_not_used")
    return {
        "requested": requested,
        "actual": actual,
        "attempted_visual_count": int(delivery.get("attempted_visual_count") or 0),
        "actual_visual_count": int(delivery.get("actual_visual_count") or 0),
        "tool_call_count": int(delivery.get("tool_call_count") or 0),
        "fallback_occurred": bool(delivery.get("fallback_occurred")),
        "fallback_reason": str(delivery.get("fallback_reason") or ""),
        "agent_fallback_reason": str(delivery.get("agent_fallback_reason") or ""),
        "valid_for_requested_modality": valid_for_requested_modality,
        "include_in_primary_result": not exclusion_reasons,
        "exclusion_reasons": exclusion_reasons,
        "student_visible_sha256": str(answer.get("student_visible_sha256") or ""),
    }


def blind_answers(
    job_id: str,
    baseline: dict[str, Any],
    skill_answer: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, str]]:
    skill_is_a = int(hashlib.sha256(job_id.encode("utf-8")).hexdigest()[-1], 16) % 2 == 0
    if skill_is_a:
        return {"A": skill_answer, "B": baseline}, {"A": "skills", "B": "baseline"}
    return {"A": baseline, "B": skill_answer}, {"A": "baseline", "B": "skills"}


def _clamp_score(value: Any) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    return round(min(10.0, max(0.0, numeric)), 1) if math.isfinite(numeric) else 0.0


def judge_answers(
    client: LLMClient,
    question: str,
    answers: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    axes = [{"key": key, "label": label} for key, label in QA_AXES]
    visible_answers = {
        label: student_visible_content(answer)
        for label, answer in answers.items()
    }
    input_sha256 = {
        label: hashlib.sha256(content.encode("utf-8")).hexdigest()
        for label, content in visible_answers.items()
    }
    raw = client.chat_json(
        """你是匿名学习回答裁判。你不知道答案来自哪个系统。只根据学生问题和评分量表评价 A、B 两个答案。
不要奖励篇幅；重点看是否真正讲懂、学生能否跟随，以及是否通过小检查形成互动。输出严格 JSON。""",
        f"""学生问题：
{question}

答案 A：
{visible_answers["A"]}

答案 B：
{visible_answers["B"]}

五个评分轴：
{json.dumps(axes, ensure_ascii=False)}

返回：
{{
  "axis_scores": {{
    "goal_alignment": {{"A": 0, "B": 0}},
    "pedagogical_soundness": {{"A": 0, "B": 0}},
    "actionability": {{"A": 0, "B": 0}},
    "observable_assessment": {{"A": 0, "B": 0}},
    "clarity": {{"A": 0, "B": 0}}
  }},
  "rationale": "只根据答案说明主要差异",
  "cautions": ["两个答案仍需人工检查的地方"]
}}""",
        temperature=0,
    )
    scores: dict[str, dict[str, float]] = {}
    for key, label in QA_AXES:
        values = raw.get("axis_scores", {}).get(key, {})
        scores[key] = {
            "label": label,
            "A": _clamp_score(values.get("A")),
            "B": _clamp_score(values.get("B")),
        }
    means = {
        label: round(sum(scores[key][label] for key, _ in QA_AXES) / len(QA_AXES), 2)
        for label in ("A", "B")
    }
    if abs(means["A"] - means["B"]) < 0.25:
        winner = "tie"
    else:
        winner = "A" if means["A"] > means["B"] else "B"
    return {
        "axis_scores": scores,
        "means": means,
        "winner": winner,
        "rationale": str(raw.get("rationale") or ""),
        "cautions": [str(item) for item in raw.get("cautions", []) if str(item).strip()][:6],
        "judge_version": QA_JUDGE_VERSION,
        "input_sha256": input_sha256,
        "includes_structured_learning_check": {
            label: bool(answer.get("learning_check", {}).get("prompts", []))
            if isinstance(answer.get("learning_check", {}), dict)
            else False
            for label, answer in answers.items()
        },
    }


def public_skill_cards(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for record in records:
        modalities = record.get("modalities", ["text"])
        cards.append({
            "key": record["key"],
            "name": record["name"],
            "summary": record.get("summary", ""),
            "modalities": modalities,
            "visual_asset_count": len(_visual_images([record], limit=20)),
            "has_code_asset": "code" in modalities,
        })
    return cards
