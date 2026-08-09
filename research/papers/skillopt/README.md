# SkillOpt 论文卡片

## 元数据

- 标题：*SkillOpt: Executive Strategy for Self-Evolving Agent Skills*
- 作者：Yifan Yang, Ziyang Gong, Weiquan Huang, Qihao Yang, Ziwei Zhou, Zisu Huang, Yan Li, Xuemei Gao, Qi Dai, Bei Liu, Kai Qiu, Yuqing Yang, Dongdong Chen, Xue Yang, Chong Luo
- 版本：arXiv:2605.23904v2，2026-05-25
- 论文页面：[arXiv:2605.23904](https://arxiv.org/abs/2605.23904)
- 代码页面：[SkillOpt project](https://aka.ms/SkillOpt)
- 本地原文：`skillopt-2026-arxiv-2605.23904v2.pdf`
- 页数：27
- SHA-256：`87f7f0f323b1671e9202b3ebb1596e909e507c71ecd1b360b0075a5ee1727fe3`

## 论文解决的问题

SkillOpt 不修改执行 Agent 的模型参数，而是把外部 Skill 文本当作可优化的执行策略。目标模型保持冻结，另一个优化器模型依据任务轨迹提出 Skill 编辑，再通过独立选择集决定是否接受。

它的关键价值不是“让模型自己改提示词”这句话，而是给自我修改加上了训练证据、有限编辑、独立验证、失败记忆和版本选择，降低无约束自我改写导致的退化与过拟合。

## 核心机制

1. 将数据分为 `D_train`、`D_selection` 和锁定的 `D_test`。
2. 用当前 Skill 在训练任务上 rollout，保留完整执行轨迹和得分。
3. 分别总结成功与失败轨迹，再生成候选修改。
4. 用 `ADD / DELETE / REPLACE` 原子操作控制修改范围。
5. 通过文本学习率限制每轮编辑数量，并随迭代调整。
6. 候选 Skill 只有在选择集上严格提升才被接受；平分也拒绝。
7. 被拒绝的修改进入缓冲区，作为后续优化的负反馈。
8. 在轮次结束后比较新旧 Skill 在同一任务上的表现，执行较慢的元更新。
9. 部署的是验证后最优、较紧凑的 Skill；推理时不需要调用优化器。

## 本项目直接借鉴

- 冻结教师 Agent 的基础模型，先迭代外部 Teaching Skill。
- 严格隔离训练集、选择集和最终测试集。
- 保存完整教学轨迹，而不是只保存最终答案。
- 以有限、可审计的补丁生成候选 Skill。
- 选择集严格提升才晋升版本，并支持立即回滚。
- 保留拒绝编辑、失败案例和退化原因，避免重复犯错。
- 区分会话内快速优化和跨轮次慢速总结。

## 针对空中课堂的扩展

原论文主要优化单领域中的单个 Skill。本项目需要把编辑对象扩展为带来源和路由的 Skill 图谱：

- `SPLIT`：把互相冲突的教学策略拆开。
- `MERGE`：合并不同教师共享的稳定机制。
- `FORK_VARIANT`：保留面向不同学生或不同风格的策略。
- `ROUTER_UPDATE`：根据学生错误与学习结果优化选用条件。
- 多模态补丁：除了文字指令，还可以修改画布程序、工具调用和讲解时序。
- 教育闸门：除了任务成功，还要检查学习迁移、典型错误修复和学生子群退化。

## 不直接照搬的部分

- 不用单一总分决定教师能力好坏；知识正确性和学习效果是硬约束。
- 不把学生点赞直接当成 Skill 更新奖励。
- 不把多位教师的提示词直接平均合并。
- 不允许当前会话生成的候选版本未经离线重放和选择集验证就进入生产。
- 不把论文给出的 benchmark 提升直接当成本项目已达到的效果，必须在自有物理教学数据上重新验证。

## 在项目中的落点

总体落地设计见项目根目录的 [`MULTI_TEACHER_SKILL_EVOLUTION_PLAN.md`](../../../MULTI_TEACHER_SKILL_EVOLUTION_PLAN.md)。第一阶段以现有“文字题转物理图”Skill 为纵向切片，实现版本库、轨迹评测、候选补丁、选择闸门和拒绝缓冲区。
