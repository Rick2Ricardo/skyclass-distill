from __future__ import annotations

import json
import re
from typing import Any, Callable

from pydantic import ValidationError

from .llm import LLMClient
from .llm_schemas import TeacherGuide
from .prompts import (
    ANALYSIS_SYSTEM, ANALYSIS_USER, COURSE_REDUCE_SYSTEM, COURSE_REDUCE_USER,
    DISTILL_SYSTEM, DISTILL_USER, GUIDE_SYSTEM, GUIDE_USER,
    SINGLE_DISTILL_SYSTEM, SINGLE_DISTILL_USER,
)


def _timestamp(seconds: float) -> str:
    minutes, sec = divmod(int(seconds), 60)
    return f"{minutes:02d}:{sec:02d}"


def transcript_chunks(payload: dict[str, Any], max_chars: int = 28_000) -> list[str]:
    chunks: list[list[str]] = [[]]
    size = 0
    for segment in payload.get("segments", []):
        line = f"[{_timestamp(float(segment.get('start', 0)))}] {segment.get('text', '').strip()}"
        if size + len(line) > max_chars and chunks[-1]:
            chunks.append([])
            size = 0
        chunks[-1].append(line)
        size += len(line) + 1
    return ["\n".join(chunk) for chunk in chunks if chunk]


def analyze_lesson(client: LLMClient, title: str, subject: str, transcript: dict[str, Any], log: Callable[[str], None] | None = None) -> dict[str, Any]:
    chunks = transcript_chunks(transcript)
    analyses = []
    for index, chunk in enumerate(chunks, 1):
        if log:
            log(f"分析《{title}》片段 {index}/{len(chunks)}")
        analyses.append(client.chat_json(ANALYSIS_SYSTEM, ANALYSIS_USER.format(title=title, subject=subject, transcript=chunk)))
    if len(analyses) == 1:
        return analyses[0]
    return client.chat_json(
        COURSE_REDUCE_SYSTEM,
        COURSE_REDUCE_USER.format(title=title, analyses=json.dumps(analyses, ensure_ascii=False)),
    )


CheckpointFn = Callable[[dict[str, Any]], None]


def distill_single(
    client: LLMClient,
    analysis: dict[str, Any],
    log: Callable[[str], None] | None = None,
    initial_suite: dict[str, Any] | None = None,
    checkpoint: CheckpointFn | None = None,
) -> dict[str, Any]:
    if log:
        log("从单节课提炼可迁移教学能力")
    suite = initial_suite
    if suite is None:
        suite = client.chat_json(
            SINGLE_DISTILL_SYSTEM,
            SINGLE_DISTILL_USER.format(analysis=json.dumps(analysis, ensure_ascii=False)),
        )
        if checkpoint:
            checkpoint(suite)
    elif log:
        completed = sum(_guide_complete(capability) for capability in suite.get("capabilities", []))
        log(f"恢复单视频蒸馏检查点：已完成 {completed}/{len(suite.get('capabilities', []))} 个教师指南")
    return add_teacher_guides(client, suite, [analysis], log, checkpoint)


def distill_common(
    client: LLMClient,
    analyses: list[dict[str, Any]],
    log: Callable[[str], None] | None = None,
    initial_suite: dict[str, Any] | None = None,
    checkpoint: CheckpointFn | None = None,
) -> dict[str, Any]:
    if log:
        log(f"跨 {len(analyses)} 节课归纳共同教学能力")
    suite = initial_suite
    if suite is None:
        suite = client.chat_json(
            DISTILL_SYSTEM,
            DISTILL_USER.format(count=len(analyses), analyses=json.dumps(analyses, ensure_ascii=False)),
        )
        if checkpoint:
            checkpoint(suite)
    elif log:
        completed = sum(_guide_complete(capability) for capability in suite.get("capabilities", []))
        log(f"恢复蒸馏检查点：已完成 {completed}/{len(suite.get('capabilities', []))} 个教师指南")
    return add_teacher_guides(client, suite, analyses, log, checkpoint)


def _guide_complete(capability: dict[str, Any]) -> bool:
    return all(capability.get(key) for key in ("lesson_flow", "assessment_checkpoints", "adaptations"))


def add_teacher_guides(
    client: LLMClient,
    suite: dict[str, Any],
    analyses: list[dict[str, Any]],
    log: Callable[[str], None] | None = None,
    checkpoint: CheckpointFn | None = None,
) -> dict[str, Any]:
    capabilities = suite.get("capabilities", [])
    analyses_json = json.dumps(analyses, ensure_ascii=False)
    for index, capability in enumerate(capabilities, 1):
        if _guide_complete(capability):
            continue
        if log:
            log(f"生成教师行动指南 {index}/{len(capabilities)} · {capability.get('name', capability.get('key', ''))}")
        guide = _generate_teacher_guide(client, capability, analyses_json, log)
        capability.update(guide.model_dump())
        if checkpoint:
            checkpoint(suite)
    return suite


def _generate_teacher_guide(
    client: LLMClient,
    capability: dict[str, Any],
    analyses_json: str,
    log: Callable[[str], None] | None,
) -> TeacherGuide:
    last_error: ValidationError | None = None
    attempts = max(1, min(client.max_attempts, 2))
    for attempt in range(1, attempts + 1):
        raw = client.chat_json(
            GUIDE_SYSTEM,
            GUIDE_USER.format(capability=json.dumps(capability, ensure_ascii=False), analyses=analyses_json),
        )
        try:
            return TeacherGuide.model_validate(raw)
        except ValidationError as exc:
            last_error = exc
            if log and attempt < attempts:
                log(f"教师指南结构不完整，正在重新生成（{attempt}/{attempts}）")
    raise RuntimeError(f"教师指南结构校验失败：{last_error}")


def offline_draft(lessons: list[tuple[str, dict[str, Any]]]) -> dict[str, Any]:
    """No-API fallback: produce an explicitly provisional, evidence-indexed suite."""
    question_hits: list[dict[str, str]] = []
    transition_hits: list[dict[str, str]] = []
    for title, payload in lessons:
        lesson_questions = 0
        lesson_transitions = 0
        for segment in payload.get("segments", []):
            text = str(segment.get("text", "")).strip()
            evidence = {"lesson": title, "timestamp": _timestamp(float(segment.get("start", 0))), "quote": text[:30]}
            if lesson_questions < 3 and re.search(r"为什么|如何|什么|是否|想一想|请看|能不能|怎么", text):
                question_hits.append(evidence | {"supports": "问题驱动与观察提示"})
                lesson_questions += 1
            if lesson_transitions < 3 and re.search(r"因此|所以|也就是|换句话说|我们得到|说明", text):
                transition_hits.append(evidence | {"supports": "推理链显化与表征转换"})
                lesson_transitions += 1
    question_support = len({e["lesson"] for e in question_hits})
    transition_support = len({e["lesson"] for e in transition_hits})
    capabilities = [
        {
            "key": "question-driven-observation", "name": "问题驱动观察",
            "summary": "用可观察的问题把学生从情境带向物理量与关系。",
            "use_when": ["引入新概念", "展示现象或图像", "检查学生是否抓住关键变量"],
            "inputs": ["学习目标", "现象/图像/题目", "学生常见直觉"],
            "procedure": ["明确本步唯一观察目标", "提出可由证据回答的问题", "限定需要比较的对象或变量", "等待并收集可观察回答", "把回答映射到物理术语", "用追问检查迁移"],
            "quality_checks": ["问题可由当前材料回答", "一次只推进一个认知台阶", "结论与观察证据相连"],
            "failure_modes": ["问题过大：拆成变量识别、关系判断和解释三层", "教师自问自答：预留作答或预测节点"],
            "evidence": question_hits[:12], "supporting_lessons": question_support,
            "confidence": min(0.25 + question_support * 0.05, 0.5),
        },
        {
            "key": "explicit-reasoning-chain", "name": "物理推理链显化",
            "summary": "显式连接条件、模型、规律、数学表达与结论。",
            "use_when": ["推导公式", "讲解例题", "从现象抽象模型"],
            "inputs": ["已知条件", "目标量", "候选物理规律", "表征材料"],
            "procedure": ["列出已知与目标", "声明理想化假设", "选择规律并说明适用条件", "在图、语言和公式间逐步转换", "检查量纲与极端情形", "回到情境解释结论"],
            "quality_checks": ["每个所以都有依据", "公式注明对象和条件", "最终解释使用情境语言"],
            "failure_modes": ["只报公式：补写适用条件与选择理由", "推导跳步：标出表征转换节点"],
            "evidence": transition_hits[:12], "supporting_lessons": transition_support,
            "confidence": min(0.25 + transition_support * 0.05, 0.5),
        },
    ]
    return {
        "suite_name": "高中物理共性教学能力（离线草案）",
        "methodology": "未配置 API 时依据问句与因果连接词生成的初步证据索引；必须在配置 API 后复核。",
        "capabilities": [cap for cap in capabilities if cap["supporting_lessons"] >= 2],
        "excluded_course_specific_patterns": [],
        "limitations": ["离线草案不具备语义聚类能力", "置信度较低，不能替代教研员复核"],
        "provisional": True,
    }
