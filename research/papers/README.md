# 研究论文库

这里统一管理“借鉴其思想、方法或评测设计”的论文。目标不是堆 PDF，而是让每个产品和算法决策都能追溯到来源，并明确哪些部分属于本项目自己的改造。

## 目录规则

```text
research/papers/
├── README.md                     # 总索引与阅读队列
├── skillopt/
│   ├── README.md                 # 论文卡片、借鉴点与边界
│   └── skillopt-*.pdf            # 原始 PDF，仅本地保存
└── resource2skill/
    ├── README.md
    └── resource2skill-*.pdf      # 原始 PDF，仅本地保存
```

PDF 默认不进入 Git，Markdown 论文卡片和索引进入版本管理。原始文件保持不修改；如果更换版本，使用新文件名并更新 SHA-256，不覆盖旧版本。

## 已归档论文

| 论文 | 状态 | 本地材料 | 主要借鉴 | 关键边界 |
|---|---|---|---|---|
| SkillOpt: Executive Strategy for Self-Evolving Agent Skills | 已精读，原文已归档 | [`skillopt/README.md`](skillopt/README.md) | 数据隔离、有限文本编辑、验证闸门、拒绝缓冲、快慢两级更新 | 原论文以单领域单 Skill 为主；本项目要扩展为多教师 Skill 图谱和教育评测 |
| Resource2Skill: Distilling Executable Agent Skills from Human-Created Multimodal Resources | 已精读，原文已归档 | [`resource2skill/README.md`](resource2skill/README.md)、[双语精读](../resource2skill_reader/paper.md) | 从多模态人类资源抽取过程知识、建立 Skill Wiki、编译为可执行能力 | 本项目更关注教学时序、板书状态、学生学习结果和多教师差异 |

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
