# Resource2Skill 论文卡片

## 元数据

- 标题：*Resource2Skill: Distilling Executable Agent Skills from Human-Created Multimodal Resources*
- 作者：Yijia Fan, Zonglin Di, Zimo Wen, Yifan Yang, Mingxi Cheng, Qi Dai, Bei Liu, Kai Qiu, Yue Dong, Ji Li, Chong Luo
- 版本：arXiv:2606.29538v4，2026-07-17
- 论文页面：[arXiv:2606.29538](https://arxiv.org/abs/2606.29538)
- 本地原文：`resource2skill-2026-arxiv-2606.29538v4.pdf`
- 页数：31
- SHA-256：`f328560aefd38ff1034a1cf06640581b30ed37a47dad48c851e7a54498d60aa5`
- 完整双语阅读材料：[`../../resource2skill_reader/paper.md`](../../resource2skill_reader/paper.md)

## 本项目借鉴

- 把人类制作的多模态资源看成过程性知识来源，而不只是问答语料。
- 从视频、文字和图像中抽取可复用步骤，再编译为可执行 Skill。
- 为蒸馏结果建立结构化知识库和质量筛选，而不是只输出摘要。
- 用下游任务表现检查 Skill 是否真正可执行、可迁移。

## 针对教学场景的扩展

- 用板书状态和状态变化表达“怎么画”，而不只使用采样截图。
- 抽取启发、追问、纠错、留白和逐步显露等教学行为。
- 区分可观察事实、教师显式陈述、系统推断和实验验证。
- 支持多位教师的共性合并、策略分割、风格适配和来源追踪。
- 用学生学习检查和迁移题评测教学能力，而不只评测任务完成。

## 与 SkillOpt 的关系

Resource2Skill 主要回答“如何从多模态人类资源得到初始 Skill”；SkillOpt 主要回答“初始 Skill 如何根据运行轨迹继续优化”。本项目将两者串联，但在中间加入多教师合并/分割和教学状态建模，并在末端加入受控的版本晋升与学生路由。
