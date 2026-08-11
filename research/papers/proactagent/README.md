# ProActAgent 论文卡片

## 元数据

- 标题：*Ask Only When Needed: Proactive Retrieval from Memory and Skills for Experience-Driven Lifelong Agents*
- 作者：Yuxuan Cai, Wei Li, Jie Zhou, Qin Chen, Xin Li, Bo Zhang, Liang He
- 框架名：ProActAgent
- 版本：arXiv:2604.20572v2，2026-06-04
- 论文页面：[arXiv:2604.20572](https://arxiv.org/abs/2604.20572)
- 本地原文：`ask-only-when-needed-2026-arxiv-2604.20572v2.pdf`
- 页数：22
- SHA-256：`faba4df3579f60a23c6993a407b1c648b09bad9ec686b9f2e793cde8726ec685`
- 来源：用户于 2026-08-10 放入 `tmp/pdfs/03-proactagent/paper.pdf`
- 阅读状态：已精读；方法、配对分支奖励、主结果、消融和局限已核对

## 与 Board2Skill 的关系

ProActAgent 把检索作为策略动作，用相同交互前缀下“检索/不检索”两条续写轨迹学习何时查询经验。这对 Board2Skill 的 Skill 路由很有价值：教师 Agent 不应在每一步强制加载所有教学 Skill，而应估计当前知识缺口、教学增益和上下文成本。

## 关键结论

- 经验库应区分事实、情节、成功策略、失败反模式和优劣对照策略，不能混成一个向量库。
- 在相同学生状态、对话前缀和黑板状态上比较检索与不检索，可局部估计一次 Skill 调用是否真正有用。
- 初期可用显式路由和离线成对 Rollout，不需要立即复制高成本强化学习训练。
- 真实学生对话不能精确回放，线上信号只能进入候选区，不能直接修改生产 Skill。
