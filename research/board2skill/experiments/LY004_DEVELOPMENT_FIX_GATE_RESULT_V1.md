# LY004 region-claim 解耦 FIX 实验结果 v1

> 结论：**FIX_STOP**。这是两名隔离 Agent 评分者产生的开发方向证据，不是人工专家评分、Paper Gold、论文结果或学生学习效果证据。

## 冻结输入

- 预注册提交先于全部模型响应生成。
- 有效矩阵：2 cases × 4 arms × 3 generation seeds = 24 项。
- seeds：`20260818, 20260819, 20260820`；全部 24 项 `attempt_count=1`，没有重试或替代 block。
- 唯一表示改动是 prompt v2 的 region-claim 解耦规则；模型、输入、四臂、温度、token、缓存、工具、输出 schema、视觉预算和评分定义保持冻结。
- R1/R2 使用不同顺序的 item-only 盲包；评分时看不到 arm、case、pair、seed 或请求标识。

## 主要结果

| arm | Evidence F1 | Edit content | ADD operation | Unsupported rate |
|---|---:|---:|---:|---:|
| transcript_only | 0.715 | 0.000 | 0.000 | 0.000 |
| static_final_board | 0.718 | 1.000 | 0.000 | 0.373 |
| uniform_frame | 0.571 | 0.167 | 0.000 | 0.414 |
| oracle_delta | **0.860** | **1.000** | **1.000** | **0.000** |

最强非 Oracle baseline 是 `static_final_board`。Oracle Delta 的 6 个 case×seed 配对中 5 个为正，但 case 级结果不满足预注册门：

- `known-condition` 平均 F1 差：`+0.286`；
- `question-pair` 平均 F1 差：`-0.003`；
- schema/privacy hard failure：`0`。

## FIX 成功门判定

| 冻结条件 | 要求 | 实际 | 结果 |
|---|---:|---:|---|
| Oracle Evidence F1 | ≥ 0.943452 | 0.859524 | 失败 |
| Edit Content | 1.0 | 1.0 | 通过 |
| ADD Operation | 1.0 | 1.0 | 通过 |
| Unsupported Rate | 0 | 0 | 通过 |
| 两个 case 平均差均 > 0 | 2/2 | 1/2 | 失败 |
| 正配对 | ≥ 4/6 | 5/6 | 通过 |
| Hard failure | 0 | 0 | 通过 |

因此机械结论为 `FIX_STOP`，不能进入正式 Gold 扩展。

## 失败归因

region 解耦目标本身已经实现：Oracle Unsupported Rate 从上一轮 `0.0208` 降到 `0`，同时 Edit Content 和 ADD Operation 都保持 `1.0`。失败来自证据召回不稳定，而不是新的 unsupported claim。

最明显的失败项出现在 `question-pair / seed 20260819`：响应正确恢复了 ADD 和 `f=?、a=?`，但 evidence claims 只写“两个问题”和“两个待求量”，没有分别原子化为“摩擦力问题”和“加速度问题”。固定分母把这两项作为独立语音单元，因此该项 Evidence F1 只有 `0.4`。这说明当前 prompt 只约束了 region 与 operation/content 的解耦，没有同时保证复合语音问题的逐原子覆盖。

## 科研边界与下一步

本轮使用的是一组新的 generation seeds，因此它能支持“prompt v2 未通过预注册绝对门”的结论，但不能单独把 F1 下降因果归因于 prompt 改动。下一步不扩大 Gold，也不继续自由调 prompt；先预注册一个同 seed 的 prompt-v1/v2 配对诊断，复用上一轮有效 seeds，在逐项同随机种子条件下检验：

1. region 解耦是否稳定消除 unsupported claim；
2. question-pair 的两个语音单元是否因 prompt v2 更容易被合并；
3. 是否需要把“事实 claim 原子化”从 region 专项规则提升为覆盖复合语音单元的通用输出合同。

该诊断只用于表示与评分分母决策；在新的预注册门通过前，仍不得进入正式 Gold、论文统计或学生效果主张。
