# Socratic-SWE 论文卡片

## 元数据

- 标题：*Socratic-SWE: Self-Evolving Coding Agents via Trace-Derived Agent Skills*
- 作者：Chuan Xiao, Zhengbo Jiao, Shaobo Wang, Wei Wang, Bing Zhao, Hu Wei, Linfeng Zhang, Lin Qu
- 版本：arXiv:2606.07412v1，2026-06-05
- 论文页面：[arXiv:2606.07412](https://arxiv.org/abs/2606.07412)
- 本地原文：`socratic-swe-2026-arxiv-2606.07412v1.pdf`
- 页数：21
- SHA-256：`12fa1d830c06770d9a9e24e52226317fed810d09de311138a46514f8077ab72f`
- 来源：用户于 2026-08-10 放入 `tmp/pdfs/05-socratic-swe/paper.pdf`
- 阅读状态：已精读；Skill Registry、任务生成、验证门、消融和局限已核对

## 与 Board2Skill 的关系

Socratic-SWE 把历史解题轨迹中的反复失败与有效修复模式蒸馏为 Skill，再用 Skill 定向生成新任务，形成与 Agent 当前弱点对齐的动态课程。对 Board2Skill 的直接启发是：学生误解、补救失败和黑板操作错误不仅应被记录，还应反过来决定下一轮验证任务和 Skill 优化方向。

## 关键结论

- 同时蒸馏成功、失败和部分成功轨迹，分别形成正向策略、反模式和补救策略。
- 新教学场景应依次通过结构、证据、可执行和教学区分度四级验证门。
- 训练题不是越难越好，应优先覆盖当前能力边界且能提升可信验证集的场景。
- 本项目优化外部 Skill 而非模型权重，因此先用实际验证增益替代论文的梯度对齐奖励。
