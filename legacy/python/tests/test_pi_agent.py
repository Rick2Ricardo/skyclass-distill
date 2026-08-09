import json
from pathlib import Path
from types import SimpleNamespace

from app.llm import LLMClient
from app import pi_agent


def test_pi_agent_bridge_sends_secret_on_stdin_and_reads_prefixed_result(
    tmp_path: Path,
    monkeypatch,
):
    captured = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["payload"] = json.loads(kwargs["input"])
        return SimpleNamespace(
            returncode=0,
            stdout=(
                'sdk noise\nPI_AGENT_RESULT={"answer":{"answer":"讲解",'
                '"assumptions":[],"learning_checks":["检查"]},'
                '"agent":{"runtime":"pi-agent","tool_calls":[{"tool":"load_teaching_skill","ok":true}]}}\n'
            ),
            stderr="",
        )

    monkeypatch.setattr(pi_agent, "pi_agent_available", lambda: True)
    monkeypatch.setattr(pi_agent.subprocess, "run", fake_run)
    monkeypatch.setenv("PI_AGENT_SCRIPT", str(pi_agent.DEFAULT_SCRIPT))
    client = LLMClient("https://relay.example/v1", "secret-key", "model-a")

    result = pi_agent.run_pi_agent(
        client,
        "什么是位移？",
        "高中物理",
        [{"key": "vector", "name": "矢量图示"}],
        [],
    )

    assert captured["command"] == [str(pi_agent.DEFAULT_RUNNER), str(pi_agent.DEFAULT_SCRIPT)]
    assert "secret-key" not in captured["command"]
    assert captured["payload"]["api_key"] == "secret-key"
    assert result["answer"] == "讲解"
    assert result["_agent"]["runtime"] == "pi-agent"


def test_pi_agent_available_can_be_disabled(monkeypatch):
    monkeypatch.setenv("PI_AGENT_ENABLED", "0")

    assert pi_agent.pi_agent_available() is False
