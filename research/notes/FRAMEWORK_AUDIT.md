# AnyTeacher 框架审计与架构决策

更新：2026-08-08

## 先纠正一个实现方向

目标不是“把问题转发给 Pi Agent”，而是让 Pi Agent 成为一个能够读取蒸馏产物、执行教学策略、完成检查与补救的教师运行时：

```text
课堂视频 / 字幕 / 板书
        ↓  确定性蒸馏工作流
Teaching Transition + Evidence + Skill Package
        ↓  Pi Agent 原生 Skill / Tool Runtime
诊断 → 解释 → 学习检查 → 读取学生回应 → 补救 / 推进
```

因此需要分开两层：

- **Distillation Control Plane**：数据切分、视频分析、Teaching Transition Schema、证据校验、Skill 打包、checkpoint、评测和人工审查。这一层必须尽量确定性、可重放、可审计。
- **Teacher Runtime**：给定学生状态和一组 Skill，决定本轮需要读取哪些 Skill，执行教学工具，输出学生可见回答。这一层适合交给 Pi Agent。

当前运行时直接 import Pi SDK，在 `packages/pi-runtime/src/index.ts` 中注册 `load_teaching_skill` 和 `inspect_visual_evidence`；Skill 是 Agent 的受限能力来源，而不是普通 prompt 拼接。

## 框架比较

| 框架 | 强项 | 与 AnyTeacher 的匹配 | 结论 |
| --- | --- | --- | --- |
| **Pi Agent SDK** | TypeScript 原生；`AgentSession`；可注册自定义 Tool；ResourceLoader 原生 Skills；事件流和会话生命周期 | 很适合“执行老师能力”：按需加载 Skill、读取证据、严格限制工具、记录 tool trace | **保留为 Teacher Runtime** |
| OpenAI Agents SDK | Agent/Runner、tools、handoffs、guardrails、sessions、tracing 较完整 | 适合 OpenAI 生态的多 Agent 产品；当前项目还要兼容 OpenAI-compatible relay，且蒸馏控制面不是它的核心优势 | 暂不替换 Pi；可作为后续 OpenAI-only 对照 |
| LangGraph | 显式状态图、持久化/恢复、streaming、human-in-the-loop | 很适合长期学习者状态、人工审批、跨天恢复；但会新增一套运行时，Skill 仍需自己接入 | 只有在多轮状态和人工 gate 成为瓶颈时再引入 |
| Mastra | TypeScript 工作流、分支/循环/暂停恢复、Agent/Tool/MCP 组合、可观测性 | 可替代当前 Typed Pipeline，但会引入第二套工作流抽象 | 只有当人工 gate 与长任务恢复成为瓶颈时再评估 |

## 推荐方案

当前推荐：**Pi Agent SDK + 自定义 TypeScript Typed Workflow**。

不要把 AnyTeacher 做成多 Agent swarm。教学能力的核心价值来自可审查的 Skill 内容、条件、证据和闭环状态，不来自更多 Agent 数量。

### Runtime 层

1. `TeacherAgent`：直接使用 Pi `AgentSession`。
2. `load_teaching_skill(skill_id)`：只读取本轮路由选中的完整 Skill 包，并返回 `Teaching Transition` 字段。
3. `inspect_visual_evidence(evidence_id)`：只读取 Skill 包内、路径经过校验的视觉证据。
4. `assess_student_response(response, checkpoint)`：把学生回应和检查标准绑定，输出 `correct / partial / incorrect / unclear`。
5. `next_action`：只允许 `advance / remediate / clarify / complete`，避免模型自由发明教学状态。
6. `TeacherRunTrace`：记录 Skill 版本、证据版本、tool calls、实际模态、fallback、token/耗时和学生可见文本哈希。

### Distillation 层

```text
ingest
  → transcript + frame index
  → lesson evidence extraction
  → Teaching Transition normalization
  → cross-lesson abstraction
  → teacher review gate
  → SKILL.md + manifest.json + evidence assets
  → retrieval index
```

每个 Skill 最少必须有：

```text
trigger / learner_state
teacher_move
expected_student_response
learning_check
remediation
abstain_when
evidence[]
version / provenance
```

### 不建议的做法

- 不要把整段课堂逐字稿直接塞进 Agent 上下文，并把它称为 Skill。
- 不要只用一条 `answer` 作为教学能力；必须有状态条件、检查和补救。
- 不要让 Pi 的内置文件写入、shell 或网络工具默认开放给学生教学运行时。
- 不要把多模态请求失败后回退到文本的样本算作有效视觉结果。
- 不要把模型自评或 LLM Judge 的风格偏好当成学生学习收益。

## 名称建议

推荐产品名：**AnyTeacher**。

推荐副标题：**Evidence-grounded teacher skills from real classrooms**。

推荐论文标题：**AnyTeacher: Distilling Evidence-Grounded Teaching Skills from Classroom Videos**。

`AnyTeacher` 比 `SkyClass` 更直接地表达“让模型获得不同老师的可迁移能力”；`AnyTutor` 更像问答产品，`TeacherForge` 更像开发工具。需要注意 `AnyTeacher` 是产品级名字，不应在论文中暗示“适用于任何学科、任何教师”；论文正文要明确数据和迁移边界。

## 迁移顺序

1. 已完成：React/Vite Studio、Fastify API、直接 Pi SDK、Skill/视觉受限工具与运行审计。
2. 已完成：Teaching Transition 的 TypeScript Schema、蒸馏工作流与 Skill builder。
3. 已完成：TypeScript 媒体编排；yt-dlp、FFmpeg 和 whisper.cpp 作为外部 CLI，不再存在 Python Web worker。
4. 下一步：补充教师人工审核 gate、时序板书状态和学生学习结果评测。

## 决策

AnyTeacher 当前采用 **Pi Agent SDK 作为教师运行时，Typed Workflow 作为蒸馏控制面**。LangGraph/Mastra 只作为未来“长时间状态、人工审批、可恢复图工作流”的备选，不在当前阶段同时引入。
