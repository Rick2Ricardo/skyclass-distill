# 多课程 Oracle Delta 四臂确认门（预注册 v1）

> 状态：在人工 Gold 裁决完成和任何本门模型响应生成前冻结。本门用于决定是否继续扩大科研数据与 Skill 优化，不是学生学习效果实验；未通过前不得写成论文主结果。

> 实现边界：当前只冻结科研语义与阈值，尚未实现本门专用 sampler、盲包生成器和统计/decision compiler。它们必须在首个本门响应前实现，并逐字段绑定本文件所在提交、最终 dataset root、12-case机械样本与144-request矩阵；在此之前本门状态只能是 `BLOCKED`，本文不能单独充当可执行或防漂移证明。

## 研究问题与固定假设

在不同课程、两位教师与多个随机种子上，使用签字时序板书变化的 `oracle_delta`，是否比只看最终板面的 `static_final_board` 更准确地恢复教师的证据与板书操作，同时不增加无证据事实？

主要假设只比较 `oracle_delta - static_final_board`。`transcript_only` 与 `uniform_frame` 保留为诊断 arm，不参与事后挑选“最弱 baseline”。固定 prompt 为 `oracle-gate-prompt-v2-region-claim-decoupled`；不得在看到本门结果后修改 prompt、评分分母或样本。

## 数据资格与确定性抽样

- 输入必须是通过 `signed-gold-dataset-v2` 全部校验的内容寻址数据集。
- 数据集必须恰好包含当前四个 lesson source：`phy-force-kunge-003`、`phy-force-kunge-005`、`phy-force-liyongle-003`、`phy-force-liyongle-004`，覆盖两位教师；每节课至少有 3 个 accepted group，否则整门 `BLOCKED`。
- 每节课确定性选 3 个 group，共 12 cases。排序键固定为 `SHA-256("skyclass/multilesson-oracle-confirmation/case/v1\0" + dataset_sha256 + "\0" + lesson_id + "\0" + package_id + "\0" + group_id)`，取每课最小三个；因此选择在最终双签数据集 hash 形成前不可知。
- case 的 claims 只从该组最终签字响应任务定义派生；evidence/edit/operation 分母只来自同组 Signed Gold `final_events` 与已验证 transcript。`speech_context` 仍是 `context_not_gold`，不得冒充语音 Gold。
- 任一 lesson 少于 3 个合格组、源根漂移、证据缺失或样本不等于上述机械选择时，不得换组，直接 `BLOCKED`。

## 固定实验矩阵

- cases：12（4 lessons × 3 cases）。
- arms：`transcript_only`、`static_final_board`、`uniform_frame`、`oracle_delta`。
- generation seeds：`20260831, 20260901, 20260902`。
- 总请求：`12 × 4 × 3 = 144`。
- 每个请求必须使用同一模型、system prompt、prompt v2、output schema、temperature、input/output budget、cache/tools policy，并且 `attempt_count=1`。
- 任一请求失败、重试、缺失或 schema/privacy hard failure，不补跑、不换 seed，整门 `BLOCKED`。

## 冻结评分与汇总

两名隔离评分者只接收分别重排的 item-only 盲包；不得看到 lesson、teacher、case、arm、seed、pair、request 或 run 标识。两人逐项评分后先等权平均，再按 `seed → case → lesson → teacher` 等权宏平均；不能让事件更多的课获得更大权重。

主要指标：Evidence Grounding F1、Edit Content Coverage、Operation Accuracy、Unsupported Claim Rate，以及 schema/privacy/teacher-only 等 hard failure。

主要效应是每个 `case × seed` 内的 `oracle_delta - static_final_board` Evidence F1 配对差。80% 分层 bootstrap 按 `teacher → lesson → case → seed` 重采样并保持四臂配对，固定 `10,000` 次、seed `20260903`；95% 区间只描述，不用于门控。单事件 case 的 temporal-pair 指标记 NA，不得因此阻断其他指标。

## 机械决策门

分支优先级固定为 `BLOCKED → GO → STOP → INCONCLUSIVE`。

### GO

必须同时满足：

1. Oracle−Static Evidence F1 宏平均差 `≥ 0.08`；
2. 该差的 80% 分层 bootstrap 下界 `> 0`；
3. 两位教师各自宏平均差都 `> 0`，且至少 3/4 lessons 为正；
4. Oracle Edit Content Coverage 与 Operation Accuracy 均不低于 Static；
5. Oracle Unsupported Claim Rate `≤ 0.05`，且不高于 Static `+0.02`；
6. hard failure 为 0。

`0.08` 不是根据未来确认数据选择：它在本门运行前由既有 LY004 开发结果冻结，低于两轮已观测 Oracle−Static 差（约 `0.249` 与 `0.142`），但仍要求足以支持后续数据与 Skill 投资的最小实际增益；本门不会据结果回调该阈值。

### STOP

完整数据下，若 Oracle−Static Evidence F1 宏平均差 `≤ 0`，或任一教师宏平均差 `≤ -0.05`，或 Oracle hard failure 非零，则 `STOP`：不扩大数据，不进入 Skill 自动优化，先重审证据表示或任务定义。

### INCONCLUSIVE

完整数据既不满足 GO 也不满足 STOP 时为 `INCONCLUSIVE`。不得追加 seed、换 baseline、删 case 或调阈值；只允许按本协议公开不确定结论，并另立新的预注册实验。

## 允许与禁止的结论

- GO 只支持“在这四节签字课程与冻结任务上，时序 Oracle evidence 相对最终板面具有跨样本开发价值”，允许进入下一阶段数据扩展与 Skill 优化。
- 它不证明学生学习增益、跨学科泛化、因果教学效果或可公开分发原视频。
- 正式论文统计仍需外部评分会话记录、权利 active head、签名/WORM 与完整可复现 artifact；本协议文件和本地自哈希不能替代这些来源证明。
