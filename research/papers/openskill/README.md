# OpenSkill 论文卡片

## 元数据

- 标题：*OpenSkill: Open-World Self-Evolution for LLM Agents*
- 作者：Zhiling Yan, Dingjie Song, Hanrong Zhang, Wei Liang, Yuxuan Zhang, Yutong Dai, Lifang He, Philip S. Yu, Ran Xu, Xiang Li, Lichao Sun
- 版本：arXiv:2606.06741v1，2026-06-04
- 论文页面：[arXiv:2606.06741](https://arxiv.org/abs/2606.06741)
- 代码：[OpenLAIR/OpenSkill](https://github.com/OpenLAIR/OpenSkill)
- 项目页：[OpenSkill](https://openlair.github.io/openskill/)
- 本地原文：`openskill-2026-arxiv-2606.06741v1.pdf`
- 页数：20
- SHA-256：`a5a7184ca3036c6ce22a00b4f691158a5df30b760dae50cf66d4f91939fff194`
- 来源：用户于 2026-08-10 放入 `tmp/pdfs/02-openskill/paper.pdf`
- 阅读状态：已精读；方法、主结果、验证器分析、消融和局限已核对

## 与 Board2Skill 的关系

OpenSkill 从开放世界资源同时构造 Skill 和验证锚点，再用无目标任务答案的虚拟任务优化 Skill。它可能帮助 Board2Skill 在缺少真实学生反馈时构建泄漏受控的练习与验证环；但必须另行验证自建评估与真实学习效果是否一致。

## 关键结论

- 将“写 Skill 的知识”和“验证 Skill 的知识”独立检索，适合改造成教师视频与教材规范双源初始化。
- 失败后先区分知识缺口与实现错误，再决定是否检索，适合教学失败类型化诊断。
- 虚拟验证器仍存在深层语义假阳性，不能用格式正确代替物理概念与真实学习效果正确。
- 本项目应保存历史最佳验证版本，不采用论文中“最后一次修改即最终版本”的策略。
