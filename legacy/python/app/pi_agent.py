from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from .llm import LLMClient


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SCRIPT = ROOT / "packages" / "pi-runtime" / "src" / "cli.ts"
DEFAULT_RUNNER = ROOT / "node_modules" / ".bin" / "tsx"
RESULT_PREFIX = "PI_AGENT_RESULT="


class PiAgentUnavailable(RuntimeError):
    """Raised when the optional Node Pi Agent runtime is not installed or disabled."""


def pi_agent_available() -> bool:
    enabled = os.getenv("PI_AGENT_ENABLED", "1").strip().lower()
    if enabled in {"0", "false", "no", "off"}:
        return False
    script = Path(os.getenv("PI_AGENT_SCRIPT", str(DEFAULT_SCRIPT))).expanduser()
    runner = Path(os.getenv("PI_AGENT_RUNNER", str(DEFAULT_RUNNER))).expanduser()
    dependencies = ROOT / "node_modules" / "@earendil-works" / "pi-coding-agent"
    return bool(shutil.which("node") and script.is_file() and runner.is_file() and dependencies.is_dir())


def run_pi_agent(
    client: LLMClient,
    question: str,
    subject: str,
    skills: list[dict[str, Any]],
    images: list[tuple[str, Path]],
    temperature: float = 0,
) -> dict[str, Any]:
    if not pi_agent_available():
        raise PiAgentUnavailable(
            "Pi Agent 未安装或已关闭；运行 `npm install` 后重试"
        )
    script = Path(os.getenv("PI_AGENT_SCRIPT", str(DEFAULT_SCRIPT))).expanduser().resolve()
    runner = Path(os.getenv("PI_AGENT_RUNNER", str(DEFAULT_RUNNER))).expanduser().resolve()
    timeout_seconds = max(15, int(client.timeout))
    with tempfile.TemporaryDirectory(prefix="skyclass-pi-agent-") as run_dir:
        payload = {
            "base_url": client.base_url,
            "api_key": client.api_key,
            "model": client.model,
            "timeout_ms": timeout_seconds * 1000,
            "temperature": temperature,
            "question": question,
            "subject": subject,
            "skills": skills,
            "images": [
                {"label": label, "path": str(Path(path).resolve())}
                for label, path in images
            ],
            "run_dir": run_dir,
        }
        try:
            completed = subprocess.run(
                [str(runner), str(script)],
                input=json.dumps(payload, ensure_ascii=False),
                text=True,
                capture_output=True,
                timeout=timeout_seconds + 15,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"Pi Agent 超时（{timeout_seconds} 秒）") from exc
    if completed.returncode != 0:
        detail = completed.stderr.strip().splitlines()[-1:] or ["未知错误"]
        raise RuntimeError(detail[0][:800])
    result_line = next(
        (
            line[len(RESULT_PREFIX):]
            for line in reversed(completed.stdout.splitlines())
            if line.startswith(RESULT_PREFIX)
        ),
        "",
    )
    if not result_line:
        raise RuntimeError("Pi Agent 没有返回结构化结果")
    try:
        result = json.loads(result_line)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Pi Agent 返回了无效 JSON") from exc
    answer = result.get("answer")
    if not isinstance(answer, dict):
        raise RuntimeError("Pi Agent 回答结构不完整")
    agent = result.get("agent") if isinstance(result.get("agent"), dict) else {}
    answer["_agent"] = agent
    return answer
