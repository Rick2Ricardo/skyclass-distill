from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

import yaml


def _slug(value: str, fallback: str) -> str:
    clean = re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-")
    clean = re.sub(r"-{2,}", "-", clean)
    return (clean or fallback)[:63].rstrip("-")


def _lines(values: list[Any], default: str = "按输入材料完成任务。") -> str:
    normalized = [str(v).strip() for v in values if str(v).strip()]
    return "\n".join(f"{i}. {value}" for i, value in enumerate(normalized or [default], 1))


def _lesson_flow(values: list[Any], fallback: list[Any]) -> str:
    records = values or [{"phase": f"第 {index} 步", "teacher_action": step} for index, step in enumerate(fallback, 1)]
    sections: list[str] = []
    for index, raw in enumerate(records, 1):
        record = raw if isinstance(raw, dict) else {"phase": f"第 {index} 步", "teacher_action": str(raw)}
        phase = str(record.get("phase") or f"第 {index} 步")
        sections.extend([
            f"### {index}. {phase}",
            "",
            f"- **老师做**：{record.get('teacher_action') or '按当前学习目标推进一个可观察动作。'}",
            f"- **可以这样问/说**：{record.get('suggested_language') or '用一个可由当前材料回答的问题推进学生思考。'}",
            f"- **期待学生表现**：{record.get('expected_student_response') or '学生用语言、图示、公式或操作呈现理解。'}",
            f"- **学生卡住时**：{record.get('if_student_struggles') or '降低一步难度，补充表征或回到前置问题。'}",
            "",
        ])
    return "\n".join(sections).rstrip()


def _assessment(values: list[Any]) -> str:
    if not values:
        return "1. 检查学生能否独立解释本步结论；不能时回到上一表征补充支架。"
    lines = []
    for index, raw in enumerate(values, 1):
        record = raw if isinstance(raw, dict) else {"check": str(raw)}
        lines.append(
            f"{index}. **检查**：{record.get('check', '')}  "
            f"\n   **达标信号**：{record.get('success_signal') or '学生能独立完成并说明理由。'}  "
            f"\n   **未达标下一步**：{record.get('next_move_if_not') or '回到前一步补充支架后再检查。'}"
        )
    return "\n".join(lines)


def _adaptations(values: list[Any]) -> str:
    if not values:
        return "1. 学生基础薄弱：减少同时处理的变量并增加图示。\n2. 学生已经掌握：撤去支架并要求迁移到新情境。"
    lines = []
    for index, raw in enumerate(values, 1):
        record = raw if isinstance(raw, dict) else {"learner_signal": "观察到的学生表现", "adjustment": str(raw)}
        lines.append(f"{index}. **看到**“{record.get('learner_signal', '')}”时，**调整为**：{record.get('adjustment', '')}")
    return "\n".join(lines)


def build_skill_suite(suite: dict[str, Any], output_root: Path, subject: str, provenance: dict[str, Any]) -> list[dict[str, Any]]:
    output_root.mkdir(parents=True, exist_ok=True)
    built = []
    for index, capability in enumerate(suite.get("capabilities", []), 1):
        key = _slug(str(capability.get("key", "")), f"teaching-capability-{index}")
        skill_name = _slug(f"physics-{key}", f"physics-teaching-capability-{index}")
        folder = output_root / skill_name
        (folder / "agents").mkdir(parents=True, exist_ok=True)
        (folder / "references").mkdir(parents=True, exist_ok=True)
        name = str(capability.get("name") or key)
        summary = str(capability.get("summary") or f"运用{name}设计与分析{subject}教学。")
        use_when = "、".join(str(x) for x in capability.get("use_when", [])) or f"设计或分析{subject}课堂"
        description = f"指导老师运用{name}实施、检查和调整{subject}教学。用于{use_when}；给出教师动作、建议话术、学生预期反应与卡点支架，不用于替代课程事实核验。"
        skill_md = f"""---
name: {skill_name}
description: {description}
---

# {name}

{summary}

## 教学目标

{capability.get('teaching_goal') or '让学生能够独立完成目标任务，并能用物理语言说明理由。'}

## 什么时候使用

{_lines(capability.get('use_when', []), f'需要运用{name}推进学生理解时。')}

## 课前准备

{_lines(capability.get('prerequisites', []) or capability.get('inputs', []), '明确学生起点、学习目标、课堂材料与可用时间。')}

## 按这个顺序教

{_lesson_flow(capability.get('lesson_flow', []), capability.get('procedure', []))}

> “可以这样问/说”是根据多课模式生成的建议话术，不是来源视频的逐字引用。老师应根据学生实际回答调整，不能机械照念。

## 课堂检查点

{_assessment(capability.get('assessment_checkpoints', []))}

## 根据学生表现调整

{_adaptations(capability.get('adaptations', []))}

## 教完以后检查自己

{_lines(capability.get('quality_checks', []), '检查每个教学动作是否服务学习目标并可观察。')}

## 常见教法失败与纠偏

{_lines(capability.get('failure_modes', []), '发现证据不足时降低结论强度并请求补充材料。')}

## 查看来源证据

需要示例或溯源时读取 [references/evidence.md](references/evidence.md)。需要快速理解模式时读取 [references/pattern.md](references/pattern.md)。不要把来源中的短例句扩写成原课逐字稿。
"""
        (folder / "SKILL.md").write_text(skill_md, "utf-8")
        short = f"指导老师用{name}完成可观察、可调整的高中物理课堂教学"
        if len(short) > 64:
            short = short[:64]
        agent_yaml = "\n".join([
            "interface:",
            f"  display_name: {json.dumps(name, ensure_ascii=False)}",
            f"  short_description: {json.dumps(short, ensure_ascii=False)}",
            f"  default_prompt: {json.dumps(f'使用 ${skill_name} 根据学生起点设计一段老师可以直接实施的高中物理教学。', ensure_ascii=False)}",
            "",
        ])
        (folder / "agents" / "openai.yaml").write_text(agent_yaml, "utf-8")
        evidence_lines = [f"# {name}：证据索引", "", "以下均为短摘录，用于定位教学动作；请回看原转写确认上下文。", ""]
        for evidence in capability.get("evidence", [])[:16]:
            evidence_lines.append(
                f"- **{evidence.get('lesson', '未知课程')} · {evidence.get('timestamp', '--:--')}**："
                f"“{str(evidence.get('quote', ''))[:36]}” — {evidence.get('supports', '')}"
            )
        (folder / "references" / "evidence.md").write_text("\n".join(evidence_lines) + "\n", "utf-8")
        pattern = f"""# {name}

{summary}

## 教学目标

{capability.get('teaching_goal') or '未单独标注'}

## 适用场景

{_lines(capability.get('use_when', []))}

## 课前准备

{_lines(capability.get('prerequisites', []) or capability.get('inputs', []))}

## 证据强度

- 支持课程数：{capability.get('supporting_lessons', '未标注')}
- 置信度：{capability.get('confidence', '未标注')}
- 是否离线草案：{'是' if suite.get('provisional') else '否'}
"""
        (folder / "references" / "pattern.md").write_text(pattern, "utf-8")
        manifest = {"skill": skill_name, "subject": subject, "capability": capability, "suite": suite.get("suite_name"), "provenance": provenance}
        (folder / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8")
        valid, errors = validate_skill(folder)
        built.append({"name": skill_name, "display_name": name, "path": str(folder), "valid": valid, "errors": errors})
    (output_root / "suite.json").write_text(json.dumps(suite, ensure_ascii=False, indent=2), "utf-8")
    _remove_stale_generated_skills(output_root, {item["name"] for item in built}, provenance.get("job_id"))
    return built


def _remove_stale_generated_skills(output_root: Path, current_names: set[str], job_id: Any) -> None:
    if not job_id:
        return
    for folder in output_root.iterdir():
        manifest_file = folder / "manifest.json"
        if not folder.is_dir() or folder.name in current_names or not manifest_file.exists():
            continue
        try:
            manifest = json.loads(manifest_file.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if manifest.get("provenance", {}).get("job_id") == job_id:
            shutil.rmtree(folder)


def validate_skill(folder: Path) -> tuple[bool, list[str]]:
    errors: list[str] = []
    skill_file = folder / "SKILL.md"
    if not skill_file.exists():
        return False, ["缺少 SKILL.md"]
    text = skill_file.read_text("utf-8")
    match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not match:
        errors.append("YAML frontmatter 缺失或格式错误")
    else:
        try:
            meta = yaml.safe_load(match.group(1))
            if set(meta) != {"name", "description"}:
                errors.append("frontmatter 只能包含 name 与 description")
            if not re.fullmatch(r"[a-z0-9-]{1,64}", str(meta.get("name", ""))):
                errors.append("技能名不符合 lowercase-hyphen 规则")
        except Exception as exc:
            errors.append(f"frontmatter 无法解析：{exc}")
    agent_file = folder / "agents" / "openai.yaml"
    if not agent_file.exists():
        errors.append("缺少 agents/openai.yaml")
    else:
        try:
            interface = (yaml.safe_load(agent_file.read_text("utf-8")) or {}).get("interface", {})
            short = str(interface.get("short_description", ""))
            prompt = str(interface.get("default_prompt", ""))
            display_name = str(interface.get("display_name", ""))
            if not display_name:
                errors.append("agents/openai.yaml 缺少 display_name")
            if not 25 <= len(short) <= 64:
                errors.append("short_description 应为 25–64 个字符")
            skill_name = str(meta.get("name", "")) if "meta" in locals() else ""
            if not skill_name or f"${skill_name}" not in prompt:
                errors.append("default_prompt 必须显式引用 $skill-name")
        except Exception as exc:
            errors.append(f"agents/openai.yaml 无法解析：{exc}")
    for reference in ("evidence.md", "pattern.md"):
        if not (folder / "references" / reference).exists():
            errors.append(f"缺少 references/{reference}")
    return not errors, errors
