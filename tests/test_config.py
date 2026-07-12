import json
from pathlib import Path

from app.config import Settings


def test_runtime_settings_merge_without_dropping_secret(tmp_path: Path):
    settings = Settings(data_dir=tmp_path)
    settings.save_runtime({
        "llm_base_url": "https://relay.example/v1",
        "llm_api_key": "secret",
        "llm_model": "model-a",
    })
    settings.save_runtime({"whisper_model": "small", "llm_api_key": ""})

    saved = json.loads(settings.runtime_file.read_text("utf-8"))
    assert saved["llm_base_url"] == "https://relay.example/v1"
    assert saved["llm_api_key"] == "secret"
    assert saved["whisper_model"] == "small"


def test_runtime_settings_ignore_unknown_keys(tmp_path: Path):
    settings = Settings(data_dir=tmp_path)
    settings.save_runtime({"llm_model": "model-a", "unexpected": "value"})

    assert "unexpected" not in json.loads(settings.runtime_file.read_text("utf-8"))


def test_runtime_settings_store_browser_name_but_not_cookie_data(tmp_path: Path):
    settings = Settings(data_dir=tmp_path)
    settings.save_runtime({"video_cookie_browser": "chrome", "cookies": "secret"})

    saved = json.loads(settings.runtime_file.read_text("utf-8"))
    assert saved["video_cookie_browser"] == "chrome"
    assert "cookies" not in saved
