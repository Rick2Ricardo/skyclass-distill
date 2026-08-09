from __future__ import annotations

import json
import re
from typing import Any, Callable, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from .llm import LLMClient
from .physics_svg_renderer import evaluate_number


CODE_ASSET_PROMPT_VERSION = "physics-executable-asset-v2"
NumericExpression = float | str
CheckpointFn = Callable[[dict[str, Any]], None]
LogFn = Callable[[str], None]


class ParameterSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,31}$")
    label: str = Field(min_length=1, max_length=60)
    default: float
    min: float | None = None
    max: float | None = None
    unit: str = Field("", max_length=20)

    @model_validator(mode="after")
    def validate_range(self):
        if self.min is not None and self.max is not None and self.min >= self.max:
            raise ValueError("parameter min must be smaller than max")
        if self.min is not None and self.default < self.min:
            raise ValueError("parameter default is below min")
        if self.max is not None and self.default > self.max:
            raise ValueError("parameter default is above max")
        return self


class CanvasSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: int = Field(800, ge=320, le=1600)
    height: int = Field(500, ge=240, le=1200)
    background: str = Field("#ffffff", pattern=r"^(none|#[0-9A-Fa-f]{3,8}|[A-Za-z]+)$")


class SceneElement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["line", "arrow", "circle", "ellipse", "rect", "polyline", "text"]
    x1: NumericExpression | None = None
    y1: NumericExpression | None = None
    x2: NumericExpression | None = None
    y2: NumericExpression | None = None
    x: NumericExpression | None = None
    y: NumericExpression | None = None
    width: NumericExpression | None = None
    height: NumericExpression | None = None
    cx: NumericExpression | None = None
    cy: NumericExpression | None = None
    r: NumericExpression | None = None
    rx: NumericExpression | None = None
    ry: NumericExpression | None = None
    points: list[list[NumericExpression]] | None = None
    text: str | None = Field(None, max_length=200)
    text_anchor: Literal["start", "middle", "end"] = "start"
    stroke: str = Field("#17302f", pattern=r"^(none|#[0-9A-Fa-f]{3,8}|[A-Za-z]+)$")
    fill: str = Field("none", pattern=r"^(none|#[0-9A-Fa-f]{3,8}|[A-Za-z]+)$")
    stroke_width: float = Field(2, ge=0, le=20)
    opacity: float = Field(1, ge=0, le=1)
    font_size: float = Field(20, ge=6, le=72)
    dashed: bool = False


class TeachingStage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    teaching_step: str = Field(min_length=1, max_length=240)
    elements: list[SceneElement] = Field(min_length=1, max_length=64)


class ExecutableAssetSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    applicable: bool
    reason: str = Field("", max_length=300)
    kind: Literal["diagram", "graph", "experiment_schematic"] | None = None
    title: str = Field("", max_length=100)
    purpose: str = Field("", max_length=300)
    assumptions: list[str] = Field(default_factory=list, max_length=12)
    provenance: Literal["system-synthesized"] = "system-synthesized"
    canvas: CanvasSpec | None = None
    parameters: list[ParameterSpec] = Field(default_factory=list, max_length=12)
    stages: list[TeachingStage] = Field(default_factory=list, max_length=8)
    invariants: list[str] = Field(default_factory=list, max_length=16)

    @model_validator(mode="after")
    def validate_executable_scene(self):
        if not self.applicable:
            return self
        if not self.kind or not self.title or not self.purpose or self.canvas is None or not self.stages:
            raise ValueError("applicable asset requires kind, title, purpose, canvas, and stages")
        keys = [parameter.key for parameter in self.parameters]
        if len(keys) != len(set(keys)):
            raise ValueError("parameter keys must be unique")
        variables = {parameter.key: parameter.default for parameter in self.parameters}
        variables.update({"canvas_width": float(self.canvas.width), "canvas_height": float(self.canvas.height)})
        for stage in self.stages:
            for element in stage.elements:
                _validate_element(element, variables)
        return self


class AssetGateSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    applicable: bool
    reason: str = Field(min_length=1, max_length=300)
    kind: Literal["diagram", "graph", "experiment_schematic"] | None = None

    @model_validator(mode="after")
    def validate_kind(self):
        if self.applicable and self.kind is None:
            raise ValueError("applicable asset gate requires kind")
        return self


REQUIRED_NUMERIC_FIELDS = {
    "line": ("x1", "y1", "x2", "y2"),
    "arrow": ("x1", "y1", "x2", "y2"),
    "circle": ("cx", "cy", "r"),
    "ellipse": ("cx", "cy", "rx", "ry"),
    "rect": ("x", "y", "width", "height"),
    "text": ("x", "y"),
}
NUMERIC_FIELDS = (
    "x1", "y1", "x2", "y2", "x", "y", "width", "height",
    "cx", "cy", "r", "rx", "ry",
)


def _validate_element(element: SceneElement, variables: dict[str, float]) -> None:
    raw = element.model_dump()
    for name in REQUIRED_NUMERIC_FIELDS.get(element.type, ()):
        if raw.get(name) is None:
            raise ValueError(f"{element.type} requires {name}")
    for name in NUMERIC_FIELDS:
        if raw.get(name) is None:
            continue
        result = evaluate_number(raw[name], variables)
        if name in {"r", "rx", "ry", "width", "height"} and result <= 0:
            raise ValueError(f"{element.type}.{name} must be positive")
    if element.type == "polyline":
        if not element.points or len(element.points) < 2 or any(len(point) != 2 for point in element.points):
            raise ValueError("polyline requires at least two [x, y] points")
        for point in element.points:
            evaluate_number(point[0], variables)
            evaluate_number(point[1], variables)
    if element.type == "text":
        if not element.text:
            raise ValueError("text element requires text")
        fields = re.findall(r"\{([^{}]+)\}", element.text)
        if any(field not in variables for field in fields):
            raise ValueError("text template references an unknown parameter")
        remainder = re.sub(r"\{[^{}]+\}", "", element.text)
        if "{" in remainder or "}" in remainder:
            raise ValueError("text template has unmatched braces")


CODE_ASSET_SYSTEM = """你是高中物理教学可视化设计员。你不输出任意 Python/JavaScript 代码，只输出符合给定 JSON 契约的受限 SVG 场景规范。该规范将由可信渲染器执行。只为确实需要受力图、光路图、几何图、坐标图、实验装置或参数化表征的教学能力生成资产；不适用时返回 applicable=false。不得把理想化模拟声称为真实实验测量，必须显式写出假设。输出严格 JSON。"""

CODE_ASSET_GATE_SYSTEM = """你是高中物理教学资产筛选员。判断某项教学能力是否真的需要参数化图示、坐标图或实验装置示意。课堂话术、组织流程、情绪激励、复盘仪式等若不依赖可视化，应判为不适用。只输出很短的严格 JSON。"""

CODE_ASSET_GATE_USER = """判断该能力是否需要可执行视觉资产，只返回：
{{"applicable":true或false,"reason":"不超过80字","kind":"diagram或graph或experiment_schematic；不适用时为null"}}

教学能力：
{capability}
"""

CODE_ASSET_USER = """判断下面的教学能力是否适合附带可执行图示/实验示意资产。

不适用时返回：
{{"applicable":false,"reason":"为什么不需要可执行图示"}}

适用时返回：
{{
  "applicable": true,
  "reason": "为什么该能力适合参数化可视化",
  "kind": "diagram | graph | experiment_schematic",
  "title": "资产名称",
  "purpose": "这个资产如何服务教学目标",
  "assumptions": ["理想化假设或边界"],
  "provenance": "system-synthesized",
  "canvas": {{"width":800,"height":500,"background":"#ffffff"}},
  "parameters": [{{"key":"angle_deg","label":"斜面角度","default":30,"min":0,"max":80,"unit":"deg"}}],
  "stages": [{{
    "name": "第一步",
    "teaching_step": "教师在这一步展示什么、让学生观察什么",
    "elements": [
      {{"type":"line","x1":100,"y1":400,"x2":"100+400*cos(angle_deg*pi/180)","y2":"400-400*sin(angle_deg*pi/180)","stroke":"#17302f","stroke_width":3}},
      {{"type":"text","x":100,"y":450,"text":"斜面角度 = {{angle_deg}}°","fill":"#17302f","font_size":22}}
    ]
  }}],
  "invariants": ["可由教师检查的物理或教学不变量"]
}}

允许的图元只有 line、arrow、circle、ellipse、rect、polyline、text。各 stage 只写本步新增元素，渲染器会累积到当前步骤。坐标可为数字，也可为仅包含参数、pi、四则运算、幂、sin/cos/tan/sqrt/min/max/abs 的表达式。text 中可以用 {{parameter_key}} 显示参数。画面使用 0..width、0..height 坐标。优先生成 2–4 个渐进教学步骤，不要堆叠无关装饰。

教学能力：
{capability}

来源课程中与表征/实验相关的上下文：
{context}
"""


def _compact(value: Any) -> Any:
    if isinstance(value, str):
        return value[:300]
    if isinstance(value, list):
        return [_compact(item) for item in value[:4]]
    if isinstance(value, dict):
        return {
            key: _compact(item) for key, item in list(value.items())[:12]
            if key not in {"frame_path", "path"}
        }
    return value


def _compact_capability(capability: dict[str, Any]) -> dict[str, Any]:
    return {
        key: _compact(capability.get(key))
        for key in ("name", "summary", "teaching_goal", "use_when", "evidence")
        if capability.get(key)
    }


def _relevant_context(
    analyses: list[dict[str, Any]], capability: dict[str, Any],
) -> list[dict[str, Any]]:
    lesson_names = {
        str(evidence.get("lesson", ""))
        for evidence in capability.get("evidence", [])
        if isinstance(evidence, dict) and evidence.get("lesson")
    }
    selected = [
        analysis for analysis in analyses
        if str(analysis.get("lesson_title", "")) in lesson_names
    ]
    if not selected:
        selected = analyses[:12]
    return [
        {
            "lesson_title": analysis.get("lesson_title"),
            "knowledge_focus": _compact(analysis.get("knowledge_focus", [])),
            "representation_moves": _compact(analysis.get("representation_moves", [])),
            "experiment_reasoning": _compact(analysis.get("experiment_reasoning", [])),
            "visual_evidence": _compact(analysis.get("visual_evidence", [])),
        }
        for analysis in selected[:12]
    ]


def add_executable_assets(
    client: LLMClient,
    suite: dict[str, Any],
    analyses: list[dict[str, Any]],
    log: LogFn | None = None,
    checkpoint: CheckpointFn | None = None,
) -> dict[str, Any]:
    capabilities = suite.get("capabilities", [])
    for index, capability in enumerate(capabilities, 1):
        if "executable_asset" in capability:
            continue
        if log:
            log(f"评估可执行图示/实验资产 {index}/{len(capabilities)} · {capability.get('name', '')}")
        context = json.dumps(_relevant_context(analyses, capability), ensure_ascii=False)
        capability["executable_asset"] = _generate_asset(client, capability, context, log).model_dump()
        if checkpoint:
            checkpoint(suite)
    return suite


def _generate_asset(
    client: LLMClient,
    capability: dict[str, Any],
    context: str,
    log: LogFn | None,
) -> ExecutableAssetSpec:
    last_error: ValidationError | ValueError | None = None
    attempts = max(1, min(client.max_attempts, 2))
    capability_payload = _compact_capability(capability)
    for evidence in capability_payload.get("evidence", []):
        evidence.pop("frame_path", None)
    gate: AssetGateSpec | None = None
    for attempt in range(1, attempts + 1):
        gate_raw = client.chat_json(
            CODE_ASSET_GATE_SYSTEM,
            CODE_ASSET_GATE_USER.format(
                capability=json.dumps(capability_payload, ensure_ascii=False),
            ),
        )
        try:
            gate = AssetGateSpec.model_validate(gate_raw)
            break
        except ValidationError as exc:
            last_error = exc
            if log and attempt < attempts:
                log(f"可执行资产适用性判断格式无效，正在重新判断（{attempt}/{attempts}）")
    if gate is None:
        raise RuntimeError(f"可执行资产适用性判断失败：{last_error}")
    if not gate.applicable:
        return ExecutableAssetSpec(applicable=False, reason=gate.reason)
    capability_payload["asset_kind"] = gate.kind
    capability_payload["asset_reason"] = gate.reason
    for attempt in range(1, attempts + 1):
        raw = client.chat_json(
            CODE_ASSET_SYSTEM,
            CODE_ASSET_USER.format(
                capability=json.dumps(capability_payload, ensure_ascii=False), context=context,
            ),
        )
        try:
            return ExecutableAssetSpec.model_validate(raw)
        except (ValidationError, ValueError) as exc:
            last_error = exc
            if log and attempt < attempts:
                log(f"可执行资产结构或表达式无效，正在重新生成（{attempt}/{attempts}）")
    raise RuntimeError(f"可执行资产校验失败：{last_error}")
