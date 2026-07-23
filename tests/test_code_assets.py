import json
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.code_assets import ExecutableAssetSpec, add_executable_assets
from app.physics_svg_renderer import render_svg
from app.skill_builder import build_skill_suite


def executable_spec() -> dict:
    return {
        "applicable": True,
        "reason": "需要参数化斜面图",
        "kind": "diagram",
        "title": "斜面与支持力",
        "purpose": "让学生比较斜面角度变化时的图示",
        "assumptions": ["不按真实比例表示力的大小"],
        "provenance": "system-synthesized",
        "canvas": {"width": 800, "height": 500, "background": "#ffffff"},
        "parameters": [{
            "key": "angle_deg", "label": "斜面角度", "default": 30,
            "min": 0, "max": 80, "unit": "deg",
        }],
        "stages": [
            {
                "name": "画斜面", "teaching_step": "先显示斜面",
                "elements": [{
                    "type": "line", "x1": 100, "y1": 400,
                    "x2": "100+400*cos(angle_deg*pi/180)",
                    "y2": "400-400*sin(angle_deg*pi/180)",
                    "stroke": "#17302f", "stroke_width": 3,
                }],
            },
            {
                "name": "标角度", "teaching_step": "再显示可调角度",
                "elements": [{
                    "type": "text", "x": 100, "y": 450,
                    "text": "斜面角度 = {angle_deg}°", "fill": "#17302f", "font_size": 22,
                }],
            },
        ],
        "invariants": ["斜面端点应随角度连续变化"],
    }


def test_renderer_uses_safe_parameterized_expressions():
    spec = ExecutableAssetSpec.model_validate(executable_spec()).model_dump()

    default = render_svg(spec)
    changed = render_svg(spec, {"angle_deg": 60}, stage=1)

    assert default.startswith("<svg")
    assert "斜面角度 = 30°" in default
    assert default != changed
    assert "斜面角度" not in changed


def test_asset_schema_rejects_arbitrary_code_expression():
    payload = executable_spec()
    payload["stages"][0]["elements"][0]["x2"] = "__import__('os').system('echo unsafe')"

    with pytest.raises(ValidationError, match="未允许"):
        ExecutableAssetSpec.model_validate(payload)


def test_asset_schema_validates_optional_numeric_fields_too():
    payload = executable_spec()
    payload["stages"][0]["elements"][0]["rx"] = "__import__('os').system('echo unsafe')"

    with pytest.raises(ValidationError, match="未允许"):
        ExecutableAssetSpec.model_validate(payload)


def test_standalone_renderer_rejects_unsafe_text_format_fields():
    spec = ExecutableAssetSpec.model_validate(executable_spec()).model_dump()
    spec["stages"][1]["elements"][0]["text"] = "{angle_deg.__class__}"

    with pytest.raises(ValueError, match="parameter_key"):
        render_svg(spec)


class AssetClient:
    max_attempts = 2

    def __init__(self):
        self.calls = 0

    def chat_json(self, system, user):
        self.calls += 1
        if self.calls == 1:
            return {"applicable": True, "reason": "需要参数化斜面图", "kind": "diagram"}
        return executable_spec()


def test_add_executable_assets_checkpoints_each_capability():
    suite = {"capabilities": [{"name": "受力图建模"}]}
    checkpoints = []
    client = AssetClient()

    result = add_executable_assets(
        client, suite, [{"lesson_title": "斜面"}],
        checkpoint=lambda payload: checkpoints.append(json.loads(json.dumps(payload))),
    )

    assert client.calls == 2
    assert result["capabilities"][0]["executable_asset"]["applicable"] is True
    assert len(checkpoints) == 1


def test_skill_package_contains_standalone_renderer_and_example(tmp_path: Path):
    suite = {
        "suite_name": "可执行物理教学能力",
        "capabilities": [{
            "key": "incline-diagram", "name": "斜面图渐进建模",
            "summary": "使用参数化图示帮助学生建模。",
            "evidence": [], "executable_asset": executable_spec(),
        }],
    }

    built = build_skill_suite(suite, tmp_path / "skills", "高中物理", {"job_id": "job-code"})
    folder = Path(built[0]["path"])
    output = tmp_path / "custom.svg"
    completed = subprocess.run(
        [
            sys.executable, str(folder / "scripts" / "render.py"),
            "--output", str(output), "--param", "angle_deg=45", "--stage", "2",
        ],
        capture_output=True, text=True,
    )
    manifest = json.loads((folder / "manifest.json").read_text("utf-8"))

    assert completed.returncode == 0, completed.stderr
    assert output.read_text("utf-8").startswith("<svg")
    assert built[0]["valid"]
    assert built[0]["has_executable_asset"]
    assert "code" in manifest["modalities"]
    assert (folder / "assets" / "code" / "example.svg").exists()
    validation = json.loads((folder / "assets" / "code" / "validation.json").read_text("utf-8"))
    assert validation["default_render"] == "passed"
    assert len(validation["stage_probes"]) == 2
    assert validation["parameter_probes"][0]["changes_output"] is True
    assert validation["physics_applicability"] == "teacher-review-required"
    reference = (folder / "references" / "executable-asset.md").read_text("utf-8")
    assert "--param angle_deg=80" in reference
    assert "仅在 spec 定义该参数时" not in reference
