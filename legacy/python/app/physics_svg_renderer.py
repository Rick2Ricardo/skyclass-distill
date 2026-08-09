"""Dependency-free renderer for the constrained physics teaching scene format.

This module is deliberately standalone because it is copied into generated Skills.
It never executes model-provided Python or JavaScript; numeric expressions are parsed
through a small arithmetic AST evaluator.
"""

from __future__ import annotations

import argparse
import ast
import html
import json
import math
import re
from pathlib import Path
from typing import Any


ALLOWED_FUNCTIONS = {
    "abs": abs,
    "cos": math.cos,
    "max": max,
    "min": min,
    "sin": math.sin,
    "sqrt": math.sqrt,
    "tan": math.tan,
}
ALLOWED_BINARY = {
    ast.Add: lambda left, right: left + right,
    ast.Sub: lambda left, right: left - right,
    ast.Mult: lambda left, right: left * right,
    ast.Div: lambda left, right: left / right,
    ast.Pow: lambda left, right: left ** right,
    ast.Mod: lambda left, right: left % right,
}
ALLOWED_UNARY = {ast.UAdd: lambda value: value, ast.USub: lambda value: -value}


def evaluate_number(value: Any, variables: dict[str, float]) -> float:
    try:
        if isinstance(value, bool):
            raise ValueError("布尔值不能作为坐标")
        if isinstance(value, (int, float)):
            result = float(value)
        elif isinstance(value, str):
            if len(value) > 200:
                raise ValueError("数值表达式过长")
            expression = ast.parse(value, mode="eval")
            if sum(1 for _ in ast.walk(expression)) > 64:
                raise ValueError("数值表达式过于复杂")
            result = float(_evaluate_node(expression.body, variables))
        else:
            raise ValueError(f"坐标或尺寸必须是数字/受限表达式：{value!r}")
    except (SyntaxError, ArithmeticError, TypeError, RecursionError) as exc:
        raise ValueError(f"无效数值表达式：{exc}") from exc
    if not math.isfinite(result):
        raise ValueError("数值表达式产生了非有限值")
    return round(result, 6)


def _evaluate_node(node: ast.AST, variables: dict[str, float]) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return float(node.value)
    if isinstance(node, ast.Name):
        if node.id in variables:
            return float(variables[node.id])
        if node.id == "pi":
            return math.pi
        if node.id == "e":
            return math.e
        raise ValueError(f"未知参数：{node.id}")
    if isinstance(node, ast.BinOp) and type(node.op) in ALLOWED_BINARY:
        return ALLOWED_BINARY[type(node.op)](
            _evaluate_node(node.left, variables), _evaluate_node(node.right, variables),
        )
    if isinstance(node, ast.UnaryOp) and type(node.op) in ALLOWED_UNARY:
        return ALLOWED_UNARY[type(node.op)](_evaluate_node(node.operand, variables))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in ALLOWED_FUNCTIONS:
        if node.keywords:
            raise ValueError("数值函数不允许关键字参数")
        return float(ALLOWED_FUNCTIONS[node.func.id](*[_evaluate_node(arg, variables) for arg in node.args]))
    raise ValueError("表达式包含未允许的语法")


def _parameter_values(spec: dict[str, Any], overrides: dict[str, float] | None) -> dict[str, float]:
    values: dict[str, float] = {}
    overrides = overrides or {}
    known = {str(parameter["key"]) for parameter in spec.get("parameters", [])}
    unknown = set(overrides) - known
    if unknown:
        raise ValueError("未知参数：" + ", ".join(sorted(unknown)))
    for parameter in spec.get("parameters", []):
        key = str(parameter["key"])
        value = float(overrides.get(key, parameter["default"]))
        if not math.isfinite(value):
            raise ValueError(f"参数 {key} 必须是有限数值")
        minimum = parameter.get("min")
        maximum = parameter.get("max")
        if minimum is not None and value < float(minimum):
            raise ValueError(f"参数 {key} 低于下限 {minimum}")
        if maximum is not None and value > float(maximum):
            raise ValueError(f"参数 {key} 高于上限 {maximum}")
        values[key] = value
    values.update({"canvas_width": float(spec["canvas"]["width"]), "canvas_height": float(spec["canvas"]["height"])})
    return values


def _attr(name: str, value: Any) -> str:
    return f' {name}="{html.escape(str(value), quote=True)}"'


def _style(element: dict[str, Any]) -> str:
    attributes = ""
    for source, target in (
        ("stroke", "stroke"), ("fill", "fill"), ("stroke_width", "stroke-width"),
        ("opacity", "opacity"), ("font_size", "font-size"),
    ):
        if source in element and element[source] is not None:
            attributes += _attr(target, element[source])
    if element.get("dashed"):
        attributes += _attr("stroke-dasharray", "8 6")
    return attributes


def _text_value(template: str, variables: dict[str, float]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in variables:
            raise ValueError(f"文本引用了未知参数：{key}")
        return f"{variables[key]:g}"

    rendered = re.sub(r"\{([a-z][a-z0-9_]*)\}", replace, template)
    if "{" in rendered or "}" in rendered:
        raise ValueError("文本参数只能使用 {parameter_key} 格式")
    return rendered


def _render_element(element: dict[str, Any], variables: dict[str, float]) -> str:
    kind = element["type"]
    numeric = lambda key: evaluate_number(element[key], variables)
    style = _style(element)
    if kind in {"line", "arrow"}:
        marker = _attr("marker-end", "url(#arrowhead)") if kind == "arrow" else ""
        return (
            f"<line{_attr('x1', numeric('x1'))}{_attr('y1', numeric('y1'))}"
            f"{_attr('x2', numeric('x2'))}{_attr('y2', numeric('y2'))}{style}{marker} />"
        )
    if kind == "circle":
        return f"<circle{_attr('cx', numeric('cx'))}{_attr('cy', numeric('cy'))}{_attr('r', numeric('r'))}{style} />"
    if kind == "ellipse":
        return (
            f"<ellipse{_attr('cx', numeric('cx'))}{_attr('cy', numeric('cy'))}"
            f"{_attr('rx', numeric('rx'))}{_attr('ry', numeric('ry'))}{style} />"
        )
    if kind == "rect":
        rx = _attr("rx", numeric("rx")) if element.get("rx") is not None else ""
        return (
            f"<rect{_attr('x', numeric('x'))}{_attr('y', numeric('y'))}"
            f"{_attr('width', numeric('width'))}{_attr('height', numeric('height'))}{rx}{style} />"
        )
    if kind == "polyline":
        points = " ".join(
            f"{evaluate_number(point[0], variables)},{evaluate_number(point[1], variables)}"
            for point in element["points"]
        )
        return f"<polyline{_attr('points', points)}{style} />"
    if kind == "text":
        anchor = _attr("text-anchor", element.get("text_anchor", "start"))
        text = html.escape(_text_value(str(element["text"]), variables))
        return f"<text{_attr('x', numeric('x'))}{_attr('y', numeric('y'))}{anchor}{style}>{text}</text>"
    raise ValueError(f"不支持的图元类型：{kind}")


def render_svg(
    spec: dict[str, Any], overrides: dict[str, float] | None = None, stage: int | None = None,
) -> str:
    if not spec.get("applicable"):
        raise ValueError("该 Skill 没有可渲染资产")
    canvas = spec["canvas"]
    width, height = int(canvas["width"]), int(canvas["height"])
    variables = _parameter_values(spec, overrides)
    stages = spec["stages"]
    stage_index = len(stages) if stage is None else stage
    if not 1 <= stage_index <= len(stages):
        raise ValueError(f"stage 必须在 1..{len(stages)} 之间")
    elements = [element for current in stages[:stage_index] for element in current["elements"]]
    rendered = "\n  ".join(_render_element(element, variables) for element in elements)
    title = html.escape(str(spec.get("title", "Physics teaching asset")))
    background = html.escape(str(canvas.get("background", "#ffffff")), quote=True)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{title}">
  <title>{title}</title>
  <defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="context-stroke" /></marker></defs>
  <rect width="100%" height="100%" fill="{background}" />
  {rendered}
</svg>
"""


def _parse_overrides(values: list[str]) -> dict[str, float]:
    result: dict[str, float] = {}
    for value in values:
        if "=" not in value:
            raise ValueError(f"参数必须使用 key=value：{value}")
        key, raw = value.split("=", 1)
        result[key] = float(raw)
    return result


def main() -> None:
    default_spec = Path(__file__).resolve().parent.parent / "assets" / "code" / "spec.json"
    parser = argparse.ArgumentParser(description="Render a parameterized physics teaching SVG")
    parser.add_argument("--spec", type=Path, default=default_spec)
    parser.add_argument("--output", type=Path, default=Path("rendered.svg"))
    parser.add_argument("--param", action="append", default=[], help="Override one parameter as key=value")
    parser.add_argument("--stage", type=int, help="Render cumulatively through this 1-based teaching stage")
    args = parser.parse_args()
    spec = json.loads(args.spec.read_text("utf-8"))
    svg = render_svg(spec, _parse_overrides(args.param), args.stage)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(svg, "utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
