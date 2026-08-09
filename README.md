# AnyTeacher

[![CI](https://github.com/Rick2Ricardo/skyclass-distill/actions/workflows/ci.yml/badge.svg)](https://github.com/Rick2Ricardo/skyclass-distill/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D22.19-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6f63.svg)](LICENSE)

AnyTeacher 把真实课堂视频、逐字稿和关键帧蒸馏为可追溯的 Teaching Skills，再由受限的 Pi Agent 教师运行时读取 Skill、直接讲解、检查理解并比较不同教学条件。

> 这里的“蒸馏”不是训练模型，而是把课堂证据编译为带触发条件、教学动作、预期回应、学习检查、补救和拒绝条件的结构化 Skill。

## 当前架构

生产主链已经统一为 TypeScript：

```text
React 19 + Vite Web
        ↓ REST
Fastify Node Server
        ↓
Typed Pipeline ── Media CLI (yt-dlp / FFmpeg / whisper.cpp)
        ├── LLM evidence extraction + distillation
        ├── versioned JSON/file stores
        ├── Skill compiler
        └── Pi AgentSession teacher runtime
```

项目参考 [Inno Agent](https://github.com/hhyqhh/inno-agent) 的工程边界：单一 Node 后端、React/Vite 前端、Pi SDK 不改内核、业务能力通过受限工具扩展、运行数据与代码分离。AnyTeacher 不引入长期学习者记忆，重点保持课堂证据与教学 Skill 的可审计链路。

```text
apps/anyteacher/
├── src/                    # TypeScript Fastify 后端
│   ├── server.ts           # API 与静态资源入口
│   ├── config.ts           # 运行路径和端口
│   └── services/           # Tutor / experiment 服务
└── web/                    # React 19 + Vite 前端

packages/
├── contracts/              # 前后端共享类型
├── media/                  # yt-dlp、FFmpeg、whisper.cpp 调度
├── llm/                    # OpenAI-compatible 客户端
├── distillation/           # 课堂证据提取与 Skill 蒸馏
├── pipeline/               # 可恢复任务编排
├── skills/                 # Skill 打包与溯源资产
├── pi-runtime/             # 受限 Pi AgentSession
├── store/                  # 原子 JSON 文件存储
└── runtime-config/         # 本地配置

legacy/                     # 迁移前实现，只作参考，不参与构建或运行
data/                       # 本地运行数据，Git 忽略
```

## 主要能力

- 项目、课堂视频、任务和 Skills 的本地持久化管理。
- 通过 `yt-dlp` 获取公开、无 DRM 的课堂视频，通过 FFmpeg 统一音频与关键帧。
- 远端 OpenAI-compatible 音频转写，失败时可回退本地 `whisper.cpp`。
- 单课或至少四课的共性 Skill 蒸馏，支持文本和文本＋视觉证据。
- Skill 包保存 `SKILL.md`、manifest、来源证据和视觉证据。
- Pi Agent 只开放 `load_teaching_skill` 与 `inspect_visual_evidence`，屏蔽内置文件和命令工具。
- Tutor Lab 对学生直接讲解，并记录实际模态、证据数量和工具调用。
- Experiments 在同一模型与运行时下比较 Base、Text Skill 和 Vision Skill。

## 快速开始

要求：

- Node.js `>=22.19.0`
- FFmpeg / ffprobe
- `yt-dlp`
- 远端音频转写接口，或本地 `whisper.cpp` 的 `whisper-cli` 与 ggml 模型

macOS 可以使用 Homebrew 安装媒体工具：

```bash
brew install ffmpeg yt-dlp whisper-cpp
```

启动项目：

```bash
npm install
cp .env.example .env
npm run dev
```

- TypeScript API：<http://127.0.0.1:3000>
- Vite 开发前端：<http://127.0.0.1:5173>

生产构建和单端口运行：

```bash
npm run build
npm run server
```

打开 <http://127.0.0.1:3000>。

## 配置

`.env` 示例：

```dotenv
LLM_BASE_URL=https://your-relay.example.com/v1
LLM_API_KEY=your-api-key
LLM_MODEL=your-model
LLM_TIMEOUT_SECONDS=240
LLM_MAX_ATTEMPTS=3

ANYTEACHER_DATA_DIR=./data
ANYTEACHER_PORT=3000

WHISPER_MODEL=small
WHISPER_COMMAND=whisper-cli
WHISPER_MODEL_PATH=./models/ggml-small.bin

FFMPEG_COMMAND=ffmpeg
FFPROBE_COMMAND=ffprobe
YTDLP_COMMAND=yt-dlp
```

LLM 配置也可以在前端设置页保存到 `data/runtime_settings.json`。API Key 只保存在本机，不进入浏览器持久化或 Git。

转写顺序：

1. 如果 LLM Base URL 支持 `/audio/transcriptions`，优先使用远端转写。
2. 远端不可用时，后端调用 `whisper-cli`。
3. 两者都不可用时，素材任务明确失败，不会生成伪造逐字稿。

## 数据目录

```text
data/
├── library/                # 项目与视频资产索引
├── jobs/                   # 任务状态和事件
├── uploads/                # 本地上传暂存
├── media/                  # 视频与音频
├── transcripts/            # JSON / TXT / SRT
├── visual/                 # 关键帧
├── analysis/               # 单课证据分析
├── projects/*/skills/      # Skill 包
└── runtime_settings.json   # 本地运行配置
```

`data/`、`.env`、模型文件、依赖和构建产物均不会进入 Git。

## 开发与验证

```bash
npm run typecheck
npm test
npm run build
npm run check
```

`npm run check` 是提交前的完整门禁：TypeScript 类型检查、Vitest 和前后端生产构建。

## 迁移说明

`legacy/python/` 保存原 FastAPI 与静态前端，`legacy/ts-prototype/` 保存早期 TypeScript 原型，`legacy/pi-agent-js/` 保存旧 JS sidecar。它们不在 npm workspace、TypeScript include、CI 或生产启动路径中，可在确认数据兼容后单独归档。

项目只处理用户有权使用的公开、无 DRM 媒体，不绕过会员、付费、登录或访问控制。
