# 教学蒸馏台 SkyClass Distill

[![CI](https://github.com/Rick2Ricardo/skyclass-distill/actions/workflows/ci.yml/badge.svg)](https://github.com/Rick2Ricardo/skyclass-distill/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6f63.svg)](LICENSE)

从国内主流视频网站或本地教学视频出发，一条流水线完成媒体采集、Faster Whisper 转写、课堂证据分析、共性教学能力蒸馏和 Codex Teaching Skills 打包。

> 这里的“蒸馏”不是训练或微调模型，而是通过大模型完成结构化知识提取：`视频 → 逐字稿 → 单课分析 → 多课共性 → 教师行动指南 → Skill`。

## 主要能力

- **多来源采集**：复用 `yt-dlp` 站点适配器和 `curl-cffi` Chrome TLS 模拟；B 站额外使用 `bilibili-api-python`，失败时自动回退。
- **本地语音转写**：Faster Whisper 在本机生成 JSON、TXT 和 SRT，不消耗云端语音 API。
- **单一模型接口**：只需一个 OpenAI-compatible Chat Completions API，即可完成单课分析和多课共性蒸馏。
- **教师行动指南**：输出适用场景、教学步骤、建议话术、学生反应、支架、检查点和分层调整。
- **证据可追溯**：能力结论保留来源课程、时间戳和短摘录，不把模型生成话术伪装成原课原话。
- **工程化恢复**：支持本地多视频上传、内容指纹、版本化检查点和中断续跑。

## 蒸馏流程

流水线依次执行：

```text
discover → download → transcribe → analyze → distill → package
```

### 1. 获取视频

- 在线课程：统一通过 `yt-dlp` 解析公开的单集、合集和课程页面；B 站优先使用 `bilibili-api-python`，接口变化或失败时自动回退到 `yt-dlp`。
- 本地课程：前端支持多选 MP4、MOV、MKV、WebM、M4V、AVI 和 MPEG 视频。
- FFmpeg 将视频统一转换为 16kHz 单声道 WAV 音轨。

#### 视频站点兼容性

站点页面、地区限制和反爬策略会持续变化，下表记录的是本项目实际测试结果，而不是永久可用承诺。

| 来源 | 当前状态 | 说明 |
| --- | --- | --- |
| 哔哩哔哩 | 已实测下载 | 专用接口优先，`yt-dlp` 自动回退 |
| AcFun、芒果 TV、优酷、微博、腾讯视频 | 已实测下载 | 可解析公开页面并获得包含音视频的 MP4 |
| 抖音、西瓜视频 | 条件支持 | 常要求新鲜访客 Cookie；抖音验证挑战可能使普通 Cookie 仍然失效 |
| 爱奇艺、小红书 | 依链接而定 | 免费、公开且提取器可识别的页面才可能成功 |
| 其他站点 | 自动尝试 | 交给 `yt-dlp` 通用适配器，失败时返回明确原因 |

本项目只处理公开且没有 DRM 的媒体，默认不读取浏览器 Cookie，也不绕过会员、付费或访问控制。

对于要求访客 Cookie 的公开页面，可在前端“模型接口”中选择 Chrome、Safari、Firefox 等浏览器并点击“一键检测 Cookie”。项目只保存浏览器名称；`yt-dlp` 每次解析当前网址时临时读取目标域名 Cookie，不生成 Cookie 文件、不显示明文。首次使用可能触发 macOS 钥匙串授权，且需要先在所选浏览器访问一次目标网站。

### 2. Whisper 转写

Faster Whisper 在本机运行，默认使用 `small` 模型。每个视频输出：

- JSON：完整分段、开始时间、结束时间和语言信息。
- TXT：纯文本逐字稿。
- SRT：可直接配合视频查看的字幕文件。

### 3. 单课教学分析

逐字稿按时间戳送入中转 API。该阶段只提取课堂中实际发生的内容，包括：

- 学生的可能起点和困难。
- 教师采取的教学动作及目的。
- 提问方式、表征转换和认知支架。
- 易错点处理和课堂检查方式。
- 支持判断的时间戳与短证据。

没有出现在视频里的行为不会作为原课事实补写。

### 4. 多课共性提炼

系统比较多节课的分析，只保留至少两节不同课程共同支持的教学模式。课程特有知识不会直接包装成共性能力。

为了避免长请求导致中转连接不稳定，蒸馏分成两层：

1. 先生成简洁的共性教学能力候选和证据。
2. 再为每个能力分别生成教师行动指南，并逐项保存。

每完成一个教师指南都会写入版本化检查点。中转接口临时断开后，重新启动任务会跳过已经完成的能力；Prompt、逐字稿或 Whisper 模型变化时，内容指纹会使旧缓存自动失效。

### 5. 教师行动指南

每个共性能力会进一步转换为老师可以实施的教学流程，主要包括：

- 什么时候使用。
- 教学目标和课前准备。
- 4 步教师行动。
- 每一步的建议话术。
- 预期学生反应。
- 学生卡住时的支架。
- 课堂检查点和未达标后的下一步。
- 针对基础薄弱和已经掌握学生的调整方法。

建议话术由模型根据多课共性生成，不会伪装成来源视频的原话；原课短摘录单独保存在证据索引中。

### 6. Skill 打包

每个能力最终生成一个独立 Skill，并检查名称、YAML frontmatter、界面元数据和引用文件是否完整。

核心实现位置：

- `app/main.py`：应用工厂与前端装配。
- `app/api.py`：HTTP API Router。
- `app/upload_store.py`：本地视频上传、路径安全和文件大小控制。
- `app/artifacts.py`：原子写入、内容指纹和版本化检查点。
- `app/prompts.py`：单课分析、共性提炼和教师指南 Prompt。
- `app/distiller.py`：分段分析、共性蒸馏和逐能力指南生成。
- `app/skill_builder.py`：Skill 文件生成与结构校验。
- `app/llm_schemas.py`：大模型教师指南输出契约。

## 快速开始

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

打开 <http://127.0.0.1:8000>。

在页面中可以选择：

- `在线视频`：粘贴公开课程、合集或单集页面地址，设置数量后运行。
- `本地视频`：选择一个或多个本地文件后运行。

## API 配置

项目只需要一个 OpenAI-compatible Chat Completions API。在项目根目录创建 `.env`：

```dotenv
LLM_BASE_URL=https://your-relay.example.com/v1
LLM_API_KEY=your-api-key
LLM_MODEL=your-model-name
LLM_TIMEOUT_SECONDS=240
LLM_MAX_ATTEMPTS=2

WHISPER_MODEL=small
MAX_UPLOAD_SIZE_MB=4096
VIDEO_COOKIE_BROWSER=        # 可选：chrome / safari / firefox / edge / brave / chromium
```

也可以在前端右上角的“模型接口”中填写。密钥保存在本机，不会进入浏览器存储；`.env` 和 `data/runtime_settings.json` 已加入 Git 忽略列表。

## CLI 使用

运行一个在线课程任务：

```bash
skyclass run \
  --url "https://www.bilibili.com/video/BV1Ha411r7Hk/" \
  --limit 5 \
  --subject 高中物理 \
  --whisper-model small
```

继续失败或中断的任务：

```bash
skyclass resume <job_id>
```

## 结果文件结构

所有运行结果默认保存在 `data/`。每次任务会生成一个 `job_id`：

```text
data/
├── jobs/
│   └── <job_id>.json
├── uploads/
│   └── <upload_id>/
│       └── 001-local-video.mp4
├── media/
│   └── <job_id>/
│       ├── 001-video.mp4
│       └── 001-video.wav
├── transcripts/
│   └── <job_id>/
│       ├── 001-video.json
│       ├── 001-video.txt
│       └── 001-video.srt
├── analysis/
│   └── <job_id>/
│       ├── lesson-001.json
│       ├── lesson-001.meta.json
│       ├── lesson-002.json
│       ├── skill-suite.checkpoint.json  # 仅未完成任务可能存在
│       └── skill-suite.json
└── skills/
    └── <job_id>/
        ├── suite.json
        └── physics-example-skill/
            ├── SKILL.md
            ├── manifest.json
            ├── agents/
            │   └── openai.yaml
            └── references/
                ├── pattern.md
                └── evidence.md
```

### 任务文件

`data/jobs/<job_id>.json` 保存：

- 当前任务状态、阶段和进度。
- 视频列表和来源信息。
- 运行日志和失败原因。
- 媒体、逐字稿、分析和 Skills 的路径。

### 转写文件

`data/transcripts/<job_id>/` 包含：

- `*.json`：Whisper 模型、语言、时长和分段时间戳。
- `*.txt`：方便阅读和全文检索的纯文本。
- `*.srt`：可以与原视频同步查看的字幕。

### 分析文件

`data/analysis/<job_id>/` 包含：

- `lesson-XXX.json`：每节课的教学行为分析和证据。
- `lesson-XXX.meta.json`：Prompt 版本和输入内容指纹，用于安全复用缓存。
- `skill-suite.checkpoint.json`：未完成蒸馏的逐能力恢复点，成功打包后自动清理。
- `skill-suite.json`：跨课程共性能力与教师行动指南的完整结构。

### Skill 文件

`data/skills/<job_id>/<skill-name>/` 包含：

- `SKILL.md`：给老师使用的完整教学行动指南。
- `agents/openai.yaml`：Codex 的展示名称、说明和默认调用提示。
- `references/pattern.md`：教学模式、适用场景和证据强度。
- `references/evidence.md`：来源课程、时间戳和短摘录。
- `manifest.json`：任务、课程、模型、能力结构和来源信息。

`data/skills/<job_id>/suite.json` 是该任务全部共性教学能力的汇总结果。

前端“共性教学能力”区域提供“查看内容”，可以直接查看 `SKILL.md`、模式说明和证据索引。

## 测试

```bash
pytest -q
```

当前测试覆盖应用工厂、API 路由、设置安全合并、上传路径校验、同源重定向保护、版本化缓存、蒸馏检查点、模型输出契约和 Skill 打包。

## 合规边界

仅处理公开且你有权下载、研究或转换的课程。不要绕过登录、付费、DRM 或站点访问控制；请遵守来源站点条款及课程版权要求。

## License

本项目采用 [MIT License](LICENSE) 开源。课程视频、字幕、教师讲义及其他第三方内容不因本项目代码许可证而改变其原有版权归属。
