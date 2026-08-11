# Agent-World 论文卡片

## 元数据

- 标题：*Agent-World: Scaling Real-World Environment Synthesis for Evolving General Agent Intelligence*
- 作者：Guanting Dong, Junting Lu, Junjie Huang, Wanjun Zhong, Longxiang Liu, Shijue Huang, Zhenyu Li, Yang Zhao, Xiaoshuai Song, Xiaoxi Li, Jiajie Jin, Yutao Zhu, Hanbin Wang, Fangyu Lei, Qinyu Luo, Mingyang Chen, Zehui Chen, Jiazhan Feng, Ji-Rong Wen, Zhicheng Dou
- 版本：arXiv:2604.18292v1，2026-04-20
- 论文页面：[arXiv:2604.18292](https://arxiv.org/abs/2604.18292)
- 本地原文：`agent-world-2026-arxiv-2604.18292v1.pdf`
- 页数：48
- SHA-256：`d9d803ef67a329f0c8028a3dd2446660f4c6794c137a0a5fae55c6dd385fca63`
- 来源：用户于 2026-08-10 放入 `tmp/pdfs/04-agent-world/paper.pdf`
- 阅读状态：已精读；环境构造、动态 Arena、主结果、扩展分析和局限已核对

## 与 Board2Skill 的关系

Agent-World 把真实、有状态的工具环境与动态任务生成组合为自进化训练场。Board2Skill 可以借鉴这个视角，把学生状态、黑板状态和可执行教学工具放进同一个交互环境，再根据当前失败类型合成新教学任务。关键边界是：合成学生和环境只是代理评估，不能直接声称真实学习增益。

## 关键结论

- 建立 `TeachingWorld`：隐藏学生知识状态、可见回答与黑板状态、教师动作和受控状态转移。
- 用教学动作依赖图反向生成任务，并通过误解、提示缺失、多轮和表征变化控制难度。
- 每轮应重新生成分层平衡的诊断任务，再围绕薄弱能力生成训练场景。
- 学生认知状态不像数据库那样可完全执行验证，必须保留专家校准与真实学习效果边界。
