# LY004 四臂开发价值门结果 v1

> 结论：**FIX**。这是两名隔离 Agent 评分者产生的开发方向证据，不是人工专家评分、Paper Gold、论文结果或学生学习效果证据。

## 冻结输入与偏差

- 有效矩阵：2 cases × 4 arms × 3 generation seeds = 24 项。
- 有效 seeds：`20260814, 20260816, 20260817`；全部 24 项 `attempt_count=1`。
- `20260815` 整块因一次 provider retry 排除；其单次-attempt重跑又在 schema 门失败且未发布。替代 block `20260817` 在读取结果前预注册，详见 `LY004_DEVELOPMENT_DEVIATION_LEDGER_V1.md`。
- R1/R2 使用不同顺序的 item-only 盲包；评分时看不到 arm、case、pair、seed 或请求标识。

## 主要结果

| arm | Evidence F1 | Edit content | ADD operation | Unsupported rate |
|---|---:|---:|---:|---:|
| transcript_only | 0.747 | 0.000 | 0.000 | 0.000 |
| static_final_board | 0.694 | 1.000 | 0.000 | 0.464 |
| uniform_frame | 0.694 | 0.167 | 0.000 | 0.417 |
| oracle_delta | **0.943** | **1.000** | **1.000** | 0.021 |

最强非 Oracle baseline 是 `transcript_only`。Oracle Delta 的六个 case×seed 配对差全部为正：

- `known-condition` 平均 F1 差：`+0.300`
- `question-pair` 平均 F1 差：`+0.093`
- 6/6 配对为正；无 schema/privacy hard failure。

## 为什么不是 GO

GO 要求 Oracle Unsupported Claim Rate 不高于最强 baseline。Oracle 为 `0.0208`，transcript-only 为 `0`，因此严格失败并进入 FIX。

唯一非零 Oracle unsupported 出现在 `question-pair / seed 20260816`。R2 将以下 claim 判为超出冻结分母：

> 新增板书发生在给定变化区域内，属于添加操作。

ADD 操作本身有 Gold 支持，但当前 evidence card 没把 region 作为评分分母；把“区域位置”与“操作类型”捆绑在同一 claim 造成可避免的 false positive。R1未将其判错，因此该项也构成明确的评分分歧来源。

## 下一步科研决策

暂不扩大 Gold。先做一个窄的预注册修复实验：保持数据、模型、四臂和主指标不变，只把 Oracle evidence renderer/prompt 改为“操作类型、内容、区域分别成 claim；仅在评分分母显式包含 region 时才输出 region claim”。

修复实验成功条件：

1. Oracle Evidence F1 不低于本轮 `0.943`；
2. Oracle Edit Content 与 ADD Operation 仍为 `1.0`；
3. Oracle Unsupported Rate 降至 `0`；
4. 六个配对差至少 4 个为正、两个 case 均为正；
5. 无 hard failure。

如果满足，再进入正式 Gold/单课闭环；否则停止扩大 Gold，优先修改证据表示或评分分母。
