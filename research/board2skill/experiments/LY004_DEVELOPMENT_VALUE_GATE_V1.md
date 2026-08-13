# LY004 四臂单课开发价值门（冻结协议 v1）

> 状态：preregistered development gate；不是 Paper Gold、不是论文主实验、不是学生学习效果证据。
>
> 冻结日期：2026-08-14。输入仅使用 `tbv2-ly-004-01-gold-dev-v2` 中两条 A/B 与语音一致、但尚未完成最终人工双签的工程事件。

## 1. 研究问题

在模型、提示、输出 schema、文本上下文、视觉槽位上限、温度和重试规则一致时，显式 before/delta/after 与操作类型是否比以下三种输入产生更可追溯的课堂能力描述：

1. `transcript_only`
2. `static_final_board`
3. `uniform_frame`
4. `oracle_delta`

本轮只回答“正确时序板书表示是否值得继续投入正式 Gold 和自动恢复”。它不回答自动恢复是否成功、Tutor 是否提升，也不允许声称真实学习增益。

## 2. 冻结输入

- 课程：`phy-force-liyongle-004`
- 开发 bundle：`data/board2skill/gold-dev/tbv2-ly-004-01-gold-dev-v2/bundle.json`
- bundle SHA-256：`28b452ff69aa9145e8f82dbf7e9a57545c2ffdffeb8495065ee050339d408e9d`
- 仲裁台账：`research/board2skill/adjudications/tbv2-ly-004-01-gold-dev-v2.json`
- 台账 SHA-256：`e0ebf649702b45d18684088475a99ab6d1f33a5a012fffe0fac446254a930c02`
- case A：`ly004-known-condition / B-DELTA-05`，目标编辑为 ADD `N = 1.2mg`
- case B：`ly004-question-pair / B-DELTA-06`，目标编辑为 ADD `f=?，a=?`
- 初始三个生成 seed：`20260814, 20260815, 20260816`。其中 `20260815` 因原始 block 内一次 provider retry 被整块排除；同 seed 的单次-attempt完整重跑又在 schema 门失败且未发布 artifact。读取替代结果前，按偏差台账预注册 replacement seed `20260817`。最终可评分 seed 固定为 `20260814, 20260816, 20260817`。
- 总请求数：`2 cases × 4 arms × 3 seeds = 24`
- 模型：运行时配置中的同一冻结模型；每个结果 manifest 必须记录实际模型
- 温度：0
- 最大输出：2048 tokens
- cache：none
- tools：none
- 每个请求只允许一次 provider attempt；缺失项不得补跑后当作完整配对
- 偏差台账：`research/board2skill/experiments/LY004_DEVELOPMENT_DEVIATION_LEDGER_V1.md`；replacement 若任一请求失败，本开发门直接 `BLOCKED`，不再继续选 seed。

## 3. 固定证据分母

### Case A

- `T1`：教师陈述支持力等于 1.2mg。
- `T2`：教师随后提出摩擦力和加速度两个问题。
- `B1`：本 case 的目标板书编辑是 ADD `N = 1.2mg`。

### Case B

- `T1`：教师陈述支持力等于 1.2mg。
- `T2`：教师提出摩擦力大小问题。
- `T3`：教师提出加速度大小问题。
- `B1`：本 case 的目标板书编辑是 ADD 两个待求量 `f=?` 与 `a=?`。

评分者不能因为某 arm 看不到视觉而改变分母；看不到但诚实不主张不算 unsupported，未覆盖目标编辑计入 Edit Coverage 的缺失。

## 4. 评分与指标

每份匿名响应由两个隔离评分实例独立完成。当前开发门允许使用两个看不到 answer key、pair、seed 和 arm 的 Agent 评分实例，以便快速筛选方向；它们只能产生 `development_agent_rating`，不能替代 Paper Gold 阶段的两名学科专家，也不能被表述为人工评测。R1 与 R2 分别读取不同冻结顺序的逐项视图。

- **Evidence Grounding Precision / Recall / F1（主）**：只对 `evidence_claims` 评分。每个数组元素是一个 claim；一个 claim 可以覆盖多个分母单元。`TP` 是被至少一个准确 claim 覆盖的不同证据单元数，`FN` 是未覆盖的分母单元数，因此 `TP+FN` 必须等于 evidence card 的单元数。`FP` 是无任一冻结单元支持或与冻结单元矛盾的 claim 数。`precision=TP/(TP+FP)`（无预测时定义为 1），`recall=TP/(TP+FN)`，两者均为 0 时 `F1=0`。
- **Edit Coverage（主辅）**：是否正确恢复本 case 的 `B1` 内容与 ADD 操作；内容、操作各 0/1，均正确才记完整覆盖。
- **Unsupported Claim Rate（共同主门）**：事实主张集合固定为全部 `evidence_claims` 加所有 `content != null` 的 `observed_board_actions`；重复项仍分别计数。无冻结证据支持或与冻结证据矛盾的项为 unsupported。无事实主张时 rate 定义为 0。
- **Operation Fidelity（诊断）**：是否把目标操作恢复为 ADD；Static/Uniform 诚实输出 unknown 不算 unsupported，但不得算正确恢复。
- **Temporal Fidelity**：本轮每 case 只有一个目标编辑，固定记 `N/A`，不进入均值或停止决策。
- **Schema / privacy hard gate**：结构无效，或把学生反应、答题结果、学习效果写成已观察事实，直接记 hard failure。建议、假设、未知声明不属于 hard failure。

两位评分者不得互看评分，也不做事后裁决；最终开发门一律使用两个原始评分的等权均值。评分表中的 precision/recall/F1/rate 只是冗余校验字段，编译器必须从整数计数重新计算并拒绝漂移。任一 ledger 缺项、重复项、非有限数、越界值、评分者 ID 相同或 blind 集不一致时，不生成方向结论，门状态为 `BLOCKED`。报告 item 均值、case-seed 配对差和评分者绝对分歧，不报告 p 值或论文级置信区间。

## 5. 方向性判定

先把每个 item 的两位评分者指标等权平均，再在每个 arm 的 6 个 item 上取算术平均。以全局平均 Evidence F1 选择一次最强非 Oracle arm；精确平分时优先顺序固定为 `static_final_board > uniform_frame > transcript_only`。随后所有指标都使用同一比较 arm。六个配对差定义为同一私有 `(case, generation seed)` 下 `Oracle item mean − baseline item mean`；每个 case 的差为其三个 seed 配对差的算术平均。

- **GO（进入正式 Gold 扩展）**：
  1. Oracle Delta 相对最强非 Oracle 的 Evidence F1 在两个 case 中都为正；
  2. 六个 case-seed 配对中至少四个为正；
  3. Oracle Delta 在 6 个 item 上的平均 Edit Content Correct 严格高于 baseline；
  4. Oracle Delta 在 6 个 item 上的平均 Unsupported Claim Rate 不高于 baseline；
  5. 任一 Oracle item 在任一评分者处都没有 schema/privacy hard failure。
- **FIX（保留方向、先修表示/提示）**：GO 不成立，但 Oracle 的全局平均 Evidence F1 严格高于 baseline，且 Oracle 无 hard failure。
- **PIVOT/STOP（暂停扩大 Gold）**：除 GO、FIX、BLOCKED 之外的所有完整评分结果。

判定伪代码冻结为：

```text
if ledgers_invalid_or_incomplete: BLOCKED
baseline = argmax(global_mean_evidence_f1(non_oracle_arms), fixed_tie_order)
pair_delta[p] = mean_raters(F1_oracle[p]) - mean_raters(F1_baseline[p])
case_positive[c] = mean(pair_delta for c's three seeds) > 0
GO = all(case_positive) and count(pair_delta > 0) >= 4
     and global_mean(EditContent_oracle) > global_mean(EditContent_baseline)
     and global_mean(UnsupportedRate_oracle) <= global_mean(UnsupportedRate_baseline)
     and no_oracle_hard_failure
if GO: GO
else if global_mean(F1_oracle) > global_mean(F1_baseline) and no_oracle_hard_failure: FIX
else: PIVOT_STOP
```

该门只决定是否值得投入下一批人工 Gold，不构成论文 GO/STOP。

## 6. 盲法与防泄漏

- 每名评分者的公共视图逐项只含 `blind_id`、响应、响应哈希和该 item 的证据卡；不含 pair、case、seed、arm 或请求标识。
- R1/R2 使用不同的域分隔确定性随机顺序和隔离会话。响应正文或证据本身可能让评分者推测条件，因此本协议只声称“无显式条件标签”，不声称语义上不可推断。
- arm、case、request audit 和私有配对仅留在 gitignored `data/`。
- 同一评分者不能读取 answer key、run-records 或本文件中的 arm 映射后再评分。
- 完成两份评分 ledger 前不得打开 arm。
- 旧 run-001..003 仅是接线 smoke，不能合并进本轮三个 seed。

## 7. 输出

- 每 seed 一个不可变原始运行目录。
- 两份隔离盲包：各 24 条，分别冻结不同顺序。
- 两份独立 rating ledger。
- 一张主结果表与逐 case-seed 配对附表。
- 所有结果缺失时写 `TBD`；严禁根据旧 smoke 猜测。

本轮盲包必须由 `scripts/prepare-ly004-development-blind.ts` 从三个原始 run 机械生成。生成器在私有侧必须证明三个 spec 与三个 generation seed 精确对应、每个 case×seed 恰覆盖四个不同 arm 各一次、总计 24 个唯一 blind item，并发布域分隔 matrix receipt；公共评分视图不得发布 arm 映射、pair、真实 case ID、真实 seed、request audit 或 condition hash。生成 run 沿用 smoke manifest 只是历史命名；本协议和输出均固定为 development、禁止作为 Paper evidence。
