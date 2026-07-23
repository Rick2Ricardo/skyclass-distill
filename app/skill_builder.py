from __future__ import annotations

import copy
import hashlib
import json
import re
import shutil
from pathlib import Path
from typing import Any

import yaml

from .code_assets import ExecutableAssetSpec
from .physics_svg_renderer import render_svg


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


def _package_visual_evidence(
    capability: dict[str, Any], folder: Path,
) -> list[dict[str, Any]]:
    visual_dir = folder / "assets" / "visual"
    if visual_dir.exists():
        shutil.rmtree(visual_dir)
    records: list[dict[str, Any]] = []
    for index, evidence in enumerate(capability.get("evidence", [])[:16], 1):
        source_value = evidence.pop("frame_path", None)
        if not source_value:
            continue
        source = Path(str(source_value)).resolve()
        if not source.is_file() or source.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        visual_dir.mkdir(parents=True, exist_ok=True)
        frame_id = _slug(str(evidence.get("frame_id", "frame")), f"frame-{index}")
        source_video_id = _slug(str(evidence.get("source_video_id", "video")), "video")
        target = visual_dir / f"{index:02d}-{source_video_id}-{frame_id}{source.suffix.lower()}"
        shutil.copy2(source, target)
        relative = target.relative_to(folder).as_posix()
        evidence["visual_asset"] = relative
        records.append(evidence)
    return records


def _package_executable_asset(capability: dict[str, Any], folder: Path) -> bool:
    scripts_dir = folder / "scripts"
    code_dir = folder / "assets" / "code"
    reference = folder / "references" / "executable-asset.md"
    raw = capability.get("executable_asset")
    if not isinstance(raw, dict) or not raw.get("applicable"):
        if scripts_dir.exists():
            shutil.rmtree(scripts_dir)
        if code_dir.exists():
            shutil.rmtree(code_dir)
        reference.unlink(missing_ok=True)
        return False

    spec = ExecutableAssetSpec.model_validate(raw)
    normalized = spec.model_dump()
    capability["executable_asset"] = normalized
    scripts_dir.mkdir(parents=True, exist_ok=True)
    code_dir.mkdir(parents=True, exist_ok=True)
    renderer_source = Path(__file__).with_name("physics_svg_renderer.py")
    renderer_target = scripts_dir / "render.py"
    shutil.copy2(renderer_source, renderer_target)
    renderer_target.chmod(0o755)
    (code_dir / "spec.json").write_text(json.dumps(normalized, ensure_ascii=False, indent=2), "utf-8")
    (code_dir / "example.svg").write_text(render_svg(normalized), "utf-8")
    validation = _probe_executable_asset(spec)
    (code_dir / "validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2), "utf-8")

    parameter_lines = [
        f"- `{parameter.key}`：{parameter.label}，默认 `{parameter.default:g}`"
        f"{f' {parameter.unit}' if parameter.unit else ''}，范围 "
        f"`{parameter.min if parameter.min is not None else '-∞'} .. {parameter.max if parameter.max is not None else '+∞'}`"
        for parameter in spec.parameters
    ] or ["- 本资产没有可调参数。"]
    stage_lines = [
        f"{index}. **{stage.name}**：{stage.teaching_step}"
        for index, stage in enumerate(spec.stages, 1)
    ]
    assumption_lines = [f"- {item}" for item in spec.assumptions] or ["- 未声明额外理想化假设。"]
    invariant_lines = [f"- {item}" for item in spec.invariants] or ["- 使用前由教师检查图示与当前题目条件一致。"]
    run_lines = ["python scripts/render.py --output rendered.svg"]
    if len(spec.stages) >= 2:
        run_lines.append("python scripts/render.py --output stage-2.svg --stage 2")
    if spec.parameters:
        parameter = spec.parameters[0]
        sample = parameter.max if parameter.max is not None else parameter.default + max(1, abs(parameter.default) * 0.1)
        run_lines.append(
            f"python scripts/render.py --output custom.svg --param {parameter.key}={sample:g}"
        )
    reference.write_text(
        "\n".join([
            f"# {spec.title}", "", spec.purpose, "",
            "> 该资产由系统根据课堂证据合成，并非来源教师提供的原始代码。项目自动验证了规范结构、受限表达式、全部阶段和参数探测；物理适用性仍须结合题目条件检查。", "",
            "## 教学步骤", "", *stage_lines, "",
            "## 参数", "", *parameter_lines, "",
            "## 假设", "", *assumption_lines, "",
            "## 使用前检查", "", *invariant_lines, "",
            "## 运行", "", "```bash", *run_lines, "```", "",
            "默认渲染结果见 [assets/code/example.svg](../assets/code/example.svg)，参数规范见 [assets/code/spec.json](../assets/code/spec.json)。", "",
            "自动检查结果见 [assets/code/validation.json](../assets/code/validation.json)。它覆盖结构、逐阶段渲染、参数边界和输出敏感性，不替代物理适用性审核。", "",
        ]),
        "utf-8",
    )
    return True


def _probe_executable_asset(spec: ExecutableAssetSpec) -> dict[str, Any]:
    """Exercise all stages and parameters without claiming physics correctness."""
    normalized = spec.model_dump()

    def digest(svg: str) -> str:
        return hashlib.sha256(svg.encode("utf-8")).hexdigest()[:16]

    stage_probes = [
        {"stage": index, "status": "passed", "svg_sha256_16": digest(render_svg(normalized, stage=index))}
        for index in range(1, len(spec.stages) + 1)
    ]
    parameter_probes = []
    for parameter in spec.parameters:
        delta = max(1.0, abs(parameter.default) * 0.1)
        candidates = [
            parameter.default,
            parameter.min if parameter.min is not None else parameter.default - delta,
            parameter.max if parameter.max is not None else parameter.default + delta,
        ]
        values = list(dict.fromkeys(float(value) for value in candidates))
        outputs = [digest(render_svg(normalized, {parameter.key: value})) for value in values]
        if len(set(outputs)) <= 1:
            raise ValueError(f"参数 {parameter.key} 在探测范围内没有改变渲染结果")
        parameter_probes.append({
            "key": parameter.key,
            "values": values,
            "status": "passed",
            "changes_output": True,
            "svg_sha256_16": outputs,
        })
    return {
        "schema": "passed",
        "default_render": "passed",
        "stage_probes": stage_probes,
        "parameter_probes": parameter_probes,
        "physics_applicability": "teacher-review-required",
    }


def build_skill_suite(suite: dict[str, Any], output_root: Path, subject: str, provenance: dict[str, Any]) -> list[dict[str, Any]]:
    output_root.mkdir(parents=True, exist_ok=True)
    built = []
    for index, capability in enumerate(suite.get("capabilities", []), 1):
        key = _slug(str(capability.get("key", "")), f"teaching-capability-{index}")
        skill_name = _slug(f"physics-{key}", f"physics-teaching-capability-{index}")
        folder = output_root / skill_name
        (folder / "agents").mkdir(parents=True, exist_ok=True)
        (folder / "references").mkdir(parents=True, exist_ok=True)
        packaged_capability = copy.deepcopy(capability)
        visual_records = _package_visual_evidence(packaged_capability, folder)
        has_executable_asset = _package_executable_asset(packaged_capability, folder)
        visual_reference = folder / "references" / "visual-evidence.md"
        if not visual_records:
            visual_reference.unlink(missing_ok=True)
        name = str(capability.get("name") or key)
        summary = str(capability.get("summary") or f"运用{name}设计与分析{subject}教学。")
        use_when = "、".join(str(x) for x in capability.get("use_when", [])) or f"设计或分析{subject}课堂"
        description = f"指导老师运用{name}实施、检查和调整{subject}教学。用于{use_when}；给出教师动作、建议话术、学生预期反应与卡点支架，不用于替代课程事实核验。"
        visual_link = (
            "\n需要核对板书、图示或实验画面时读取 "
            "[references/visual-evidence.md](references/visual-evidence.md)。"
            if visual_records else ""
        )
        code_link = (
            "\n需要生成参数化图示或实验示意时读取 "
            "[references/executable-asset.md](references/executable-asset.md)，再运行 `scripts/render.py`。"
            if has_executable_asset else ""
        )
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

需要示例或溯源时读取 [references/evidence.md](references/evidence.md)。需要快速理解模式时读取 [references/pattern.md](references/pattern.md)。{visual_link}{code_link}不要把来源中的短例句或单帧扩写成未发生的课堂过程。
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
        for evidence in packaged_capability.get("evidence", [])[:16]:
            visual_marker = f" · 画面 {evidence.get('frame_id')}" if evidence.get("visual_asset") else ""
            evidence_lines.append(
                f"- **{evidence.get('lesson', '未知课程')} · {evidence.get('timestamp', '--:--')}{visual_marker}**："
                f"“{str(evidence.get('quote', ''))[:36]}” — {evidence.get('supports', '')}"
            )
        (folder / "references" / "evidence.md").write_text("\n".join(evidence_lines) + "\n", "utf-8")
        if visual_records:
            visual_lines = [
                f"# {name}：视觉证据", "",
                "以下图像是从来源视频提取的关键帧。只能用于支持画面中直接可见的事实，不能单独证明学生已理解。", "",
            ]
            for evidence in visual_records:
                asset = str(evidence["visual_asset"])
                relative_from_reference = f"../{asset}"
                visual_lines.extend([
                    f"## {evidence.get('lesson', '未知课程')} · {evidence.get('frame_timestamp') or evidence.get('timestamp', '--:--')} · {evidence.get('frame_id', '')}", "",
                    f"![{evidence.get('frame_id', '关键帧')}]({relative_from_reference})", "",
                    f"- 画面观察：{evidence.get('visual_observation') or '未单独标注'}",
                    f"- 支持判断：{evidence.get('supports', '未标注')}", "",
                ])
            visual_reference.write_text("\n".join(visual_lines), "utf-8")
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
        manifest = {
            "skill": skill_name,
            "subject": subject,
            "modalities": ["text"] + (["visual"] if visual_records else []) + (["code"] if has_executable_asset else []),
            "capability": packaged_capability,
            "suite": suite.get("suite_name"),
            "provenance": provenance,
        }
        (folder / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8")
        valid, errors = validate_skill(folder)
        built.append({
            "name": skill_name, "display_name": name, "path": str(folder),
            "valid": valid, "errors": errors, "has_executable_asset": has_executable_asset,
        })
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
    manifest_file = folder / "manifest.json"
    if manifest_file.exists():
        try:
            manifest = json.loads(manifest_file.read_text("utf-8"))
            if "visual" in manifest.get("modalities", []):
                if not (folder / "references" / "visual-evidence.md").exists():
                    errors.append("缺少 references/visual-evidence.md")
                if not any((folder / "assets" / "visual").glob("*")):
                    errors.append("缺少 assets/visual 关键帧")
            if "code" in manifest.get("modalities", []):
                required = [
                    folder / "references" / "executable-asset.md",
                    folder / "scripts" / "render.py",
                    folder / "assets" / "code" / "spec.json",
                    folder / "assets" / "code" / "example.svg",
                    folder / "assets" / "code" / "validation.json",
                ]
                for path in required:
                    if not path.exists():
                        errors.append(f"缺少 {path.relative_to(folder).as_posix()}")
                spec_file = folder / "assets" / "code" / "spec.json"
                renderer_file = folder / "scripts" / "render.py"
                if spec_file.exists():
                    spec = ExecutableAssetSpec.model_validate_json(spec_file.read_text("utf-8"))
                    if not render_svg(spec.model_dump()).startswith("<svg"):
                        errors.append("可执行资产默认渲染失败")
                    _probe_executable_asset(spec)
                validation_file = folder / "assets" / "code" / "validation.json"
                if validation_file.exists():
                    validation = json.loads(validation_file.read_text("utf-8"))
                    if validation.get("physics_applicability") != "teacher-review-required":
                        errors.append("可执行资产校验报告缺少物理适用性人工复核标记")
                if renderer_file.exists():
                    compile(renderer_file.read_text("utf-8"), str(renderer_file), "exec")
        except (OSError, json.JSONDecodeError, ValueError, SyntaxError) as exc:
            errors.append(f"manifest.json 无法解析：{exc}")
    return not errors, errors
