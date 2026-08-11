# 研究论文库

这里统一管理“借鉴其思想、方法或评测设计”的论文。目标不是堆 PDF，而是让每个产品和算法决策都能追溯到来源，并明确哪些部分属于本项目自己的改造。

## 目录规则

```text
research/papers/
├── README.md                     # 总索引与阅读队列
├── _duplicates/                  # 精确重复副本和 canonical 指向
├── skillopt/
│   ├── README.md                 # 论文卡片、借鉴点与边界
│   └── skillopt-*.pdf            # 原始 PDF，仅本地保存
├── resource2skill/
│   ├── README.md
│   └── resource2skill-*.pdf      # 原始 PDF，仅本地保存
└── <stable-slug>/
    ├── README.md
    └── <title>-<year>-arxiv-<id>.pdf
```

PDF 默认不进入 Git，Markdown 论文卡片和索引进入版本管理。原始文件保持不修改；如果更换版本，使用新文件名并更新 SHA-256，不覆盖旧版本。

## 已归档论文

| 标题 | 年份 | 主题 | Canonical PDF | 状态 | 与 Board2Skill 的关系 |
|---|---:|---|---|---|---|
| [SkillOpt: Executive Strategy for Self-Evolving Agent Skills](skillopt/README.md) | 2026 | Skill 轨迹优化 | `skillopt/skillopt-2026-arxiv-2605.23904v2.pdf` | 已精读 | 借鉴数据隔离、有限编辑、验证闸门、拒绝缓冲和快慢更新；改造为教学策略进化。 |
| [Resource2Skill: Distilling Executable Agent Skills from Human-Created Multimodal Resources](resource2skill/README.md) | 2026 | 多模态资源到 Skill | `resource2skill/resource2skill-2026-arxiv-2606.29538v4.pdf` | 已精读 | 支持从讲解、视频和图像中得到初始 Skill；需加入板书时序和学习成效验证。 |
| [OpenSkill: Open-World Self-Evolution for LLM Agents](openskill/README.md) | 2026 | 开放世界 Skill 获取与自建验证 | `openskill/openskill-2026-arxiv-2606.06741v1.pdf` | 已精读 | 用外部证据构建无目标答案的练习任务和验证器，减少教学测试泄漏。 |
| [Ask Only When Needed: Proactive Retrieval from Memory and Skills for Experience-Driven Lifelong Agents](proactagent/README.md) | 2026 | 主动经验检索与终身 Agent | `proactagent/ask-only-when-needed-2026-arxiv-2604.20572v2.pdf` | 已精读 | 学习“何时调用哪个 Skill”，并用有/无检索的配对分支估计增益。 |
| [Agent-World: Scaling Real-World Environment Synthesis for Evolving General Agent Intelligence](agent-world/README.md) | 2026 | 状态化环境和自进化训练 | `agent-world/agent-world-2026-arxiv-2604.18292v1.pdf` | 已精读 | 把黑板、工具和学生状态构造成可执行环境，围绕能力缺口动态合成教学任务。 |
| [Socratic-SWE: Self-Evolving Coding Agents via Trace-Derived Agent Skills](socratic-swe/README.md) | 2026 | 轨迹驱动的 Skill 与课程自进化 | `socratic-swe/socratic-swe-2026-arxiv-2606.07412v1.pdf` | 已精读 | 从教学失败轨迹抽取 Skill，再生成针对当前弱点的训练题。 |

精确重复副本不进入上表，统一记录在 [`_duplicates/README.md`](_duplicates/README.md)。

六篇核心论文与本项目方法模块的统一映射见 [`BOARD2SKILL_METHOD_MAP.md`](BOARD2SKILL_METHOD_MAP.md)。

## 相关论文阅读队列

这些论文目前只建立索引，不代表已经完成复现或采纳：

| 论文 | 状态 | 计划回答的问题 |
|---|---|---|
| [SkillMaster](https://arxiv.org/abs/2605.08693) | 待系统精读 | 多 Skill 如何形成、复用和管理？ |
| [SAGE: Reinforcement Learning for Self-Improving Agent with Skill Library](https://arxiv.org/abs/2512.17102) | 待系统精读 | Skill 库如何利用运行反馈持续改进？ |
| [SkillSmith](https://arxiv.org/abs/2606.01314) | 待系统精读 | Skill 的生成、组合与泛化怎样评测？ |

## 引用和借鉴规范

每篇准备实际采用的论文都要有独立卡片，并至少记录：

1. 标题、作者、版本日期、论文链接和本地文件校验值。
2. 论文真正做了什么，不能只写宣传性结论。
3. 本项目借鉴的机制，以及代码/数据中的对应位置。
4. 哪些地方没有照搬，为什么需要教育场景改造。
5. 已知限制、失效条件和待验证假设。
6. “灵感来源”“方法复现”“本项目创新”三者必须明确区分。

新增论文时使用稳定的 ASCII 目录名；原文、阅读笔记、复现实验和产品决策不要混在同一个文件中。
