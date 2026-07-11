# Contributing

感谢你改进 SkyClass Distill。

## 本地开发

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
pytest -q
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## 提交要求

- 不要提交 `.env`、API Key、视频、音频、逐字稿、模型文件或真实学生数据。
- 修改 Prompt 时同步更新版本常量，并补充缓存失效或恢复测试。
- 修改 Skill 输出结构时同步更新 `app/llm_schemas.py`、打包模板和 README。
- 新功能需要包含最小回归测试，并确保 `pytest -q` 与 `python -m pip check` 通过。
- 课程采集功能必须遵守来源站点条款，不得绕过登录、付费、DRM 或访问控制。

## Pull Request

请在 PR 中说明问题、实现方案、验证方法和兼容性影响。涉及输出格式变化时，请附一份去敏后的示例结构。
