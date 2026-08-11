# KG003 4422–4428 秒 ERASE 标注 B 审计日志

> **禁止作为严格独立 B 使用：`blindness_compromised_by_scout_metadata_exposure`。** 初始定位规范时，仓库级搜索输出意外暴露了 operation-gap scout 对本窗口的一行摘要，发生在视觉冻结之前。因此本产物不得进入 A/B agreement、仲裁输入或 Gold。目标 annotator-A JSON、A 日志、A 资产、manifest/model 输出均未读取或修改；指定 ASR 在视觉冻结后才读取。后续应由无上下文 fresh annotator 重做严格 B。

## 1. 产物与结论

- 源视频：`phy-force-kunge-003`。
- 源文件：`data/raw/physics/force-pilot/phy-force-kunge-003/source.mp4`。
- 源 SHA-256：`e4409e94aab76ed26501ebd24e51b09d3454944a09d4a6b37365a75fb9d080e4`。
- `ffprobe`：`1280×720`、`30 fps`、总时长 `6135.048821 s`。
- 复核绝对窗口：`4422.000–4428.000 s`；所有视觉 frame/state/delta 时间均位于该绝对窗口。
- 视觉事件：右侧红色两行手写推导在 `4423.067–4424.967 s` 内逐步、局部消失，操作记为 `erase`。
- `minimum_stable_seconds = 2`。窗口内 before 为 `4422.000–4423.033 s`，仅 `1.033 s`，不达门槛；after 为 `4424.967–4427.967 s`，共 `3.000 s`，达门槛。
- 因 before 不足，未放宽规则：surface、2 states、delta、transition 共 5 个带状态 artifact 全为 `needs_review`，`accepted = 0`。
- pedagogical role、teacher intent 及 transition claim 全部为 `unknown`；`learner_observations = []`。

## 2. 盲性与冻结审计

1. 初始仓库级 `rg` 搜索意外打印了 operation-gap scout 的一行本窗口摘要，故严格盲性已经破坏；bundle 的 `warnings` 和 `annotation_provenance` 均写入精确代码 `blindness_compromised_by_scout_metadata_exposure`。
2. 未读取/修改目标 annotator-A、A 日志、A 资产或 manifest/model 输出，也未执行 A/B 对齐或仲裁。
3. 仍按源视频逐帧独立确定对象、状态、operation、边界与排除项；但该事实不能恢复严格盲性，所以 bundle 显式设置：
   - `strict_independent_eligible = false`
   - `agreement_eligible = false`
   - `gold_eligible = false`
4. 视觉冻结先落盘到 `data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b-visual-freeze.json`，其 SHA-256 为 `2f6f4acfc16d107e070d68157b94b47ce73d3bfcca32ce7d52415a8022163a25`；随后才读取指定 ASR。冻结文件在读 ASR 后未修改。

## 3. 视觉边界与 ERASE 排除检查

30 fps 检查的关键帧如下，边界精度为约 `1/30 s`：

| 绝对秒 | 资产 | 观察 |
| ---: | --- | --- |
| `4422.000` | `b-before-4422.000.jpg` | 右侧两行红色推导完整；底图、题图和左侧墨迹可见 |
| `4423.033` | `b-before-4423.033.jpg` | 最后一帧完整 before |
| `4423.067` | `b-change-4423.067.jpg` | 首帧可见局部删除，事件开始 |
| `4424.933` | `b-change-4424.933.jpg` | 最后残余红色笔画仍可见 |
| `4424.967` | `b-after-4424.967.jpg` | 受影响区首次完全为空，after 开始 |
| `4426.000` | `b-after-4426.000.jpg` | 无遮挡、持续缺失 |
| `4427.000` | `b-after-4427.000.jpg` | 无遮挡、持续缺失 |
| `4427.967` | `b-confirm-4427.967.jpg` | 窗口末端确认仍缺失 |

视觉判定为真实局部 ERASE，而不是大面积页面变化：

- printed prompt、受力图和左侧红色公式在事件期间保持位置与尺度；
- 受影响区域没有教师、手或画中画遮挡；教师画中画位于已校准板面之外；
- 没有切页、surface transition、视口滚动、缩放或相机运动；
- 红色笔画按局部区域逐步消失，after 中无遮挡且连续缺失，不符合曝光/压缩造成的短暂不可见；
- 截止 `4427.967 s` 没有恢复，也没有在同一语义槽写入新对象，故不是 MODIFY 或 ERASE+ADD。

`erase_evidence` 冻结为：`visibility_restored = true`、`absent_from_after_state = true`、`confirmed_until = 4427.967`；支持帧为 `4426.000`、`4427.000`、`4427.967`。尽管 after persistence 足够，before 仍不足 2 秒，所以 status 保持 `needs_review`。

## 4. 对象与状态

- `kg003-b-object-printed-context`：题干/选项/受力图等持续上下文，贯穿窗口。
- `kg003-b-object-left-ink`：左侧红色公式，贯穿窗口。
- `kg003-b-object-right-derivation`：被清除的右侧红色两行推导；`last_visible = 4424.933`，after state 不再包含。
- before state 包含以上 3 个对象；after state 仅保留前两个持续对象。
- 受影响 region（板面归一化）：`x=0.64, y=0.33, width=0.29, height=0.30`。
- `b-delta-mask.png` 只覆盖右侧消失笔画；`b-comparison-before-after.jpg` 并排保存冻结 before/after。

## 5. ASR 原始追踪

冻结后只读取：`data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/asr/clip-4422-4428.json`。

- ASR 文件 SHA-256：`fad1323b0ea85dd9f9b1fdf8e91b2933a28c6308ad7f22584ad96df245d5de03`。
- segment index：`0`。
- 原始文本：`这两个情况连立起来`。
- clip-relative：`[0.000, 6.140] s`。
- source-absolute：`[4422.000, 4428.140] s`。
- 原 ASR 末端比视觉窗口多 `0.140 s`；为保证 raw/index/time 可审计，SpeechSpan 和 `asr_provenance` 原样保留 `4428.140`，没有静默裁剪或规范化。
- ASR 仅作为 raw speech trace，不修改冻结的 visual operation、对象、边界或稳定态；其内容不足以唯一确定教学角色/意图，所以所有相应 claim 仍为 `unknown`。

## 6. Bundle 与资产

忽略产物：`data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/annotator-b.json`。

Bundle 计数：

| Artifact | 数量 | 状态 |
| --- | ---: | --- |
| Surface | 1 | `needs_review` |
| Frame | 8 | 无 review status |
| Object | 3 | 无 review status |
| State | 2 | 全 `needs_review` |
| Delta | 1 | `erase / needs_review` |
| Speech | 1 | raw trace |
| Evidence | 12 | 11 observable + 1 teacher_stated |
| Transition | 1 | `needs_review`，claims unknown |
| Learner observation | 0 | 空 |

13 个 bundle 唯一资产 URI 全部存在且 SHA-256 重算一致，`mismatches = 0`。关键派生资产摘要：

| 资产 | SHA-256 |
| --- | --- |
| `b-before-4423.033.jpg` | `d61e5dc0afccc246419daa6393d2ce15c10537f7ad08eaa63f8493064e03c181` |
| `b-after-4424.967.jpg` | `1854a96a48cf4cf08fc34d5d9987d4f78b7f61973bcf6a120e77cb67c69ff1bd` |
| `b-confirm-4427.967.jpg` | `6473ed99920b6a47b9b94e6762e39af0b2c2326625c34119bf6d869144863781` |
| `b-comparison-before-after.jpg` | `2bb1e43f7a638322504e15c29d334739087828720ec2b293f1eb6a767a02b249` |
| `b-delta-mask.png` | `06ba8efc8b6dc96107a91918fabeb285057e285bff5fa7d3359a58159cb97cc1` |
| `b-visual-freeze.json` | `2f6f4acfc16d107e070d68157b94b47ce73d3bfcca32ce7d52415a8022163a25` |

## 7. 最终验证

- `validateBoardEvidenceBundle`：`valid = true`，`issues = []`。
- canonical payload SHA-256：`3dfe5a286a6651f0af9fd1f06b61a5b56391d6318e6c1f28f7c0228ae8e16fb7`；声明值与重算值一致。
- review-bearing statuses：5 个 `needs_review`、0 个 `accepted`、0 个 `abstained`。
- visual frame/state/delta absolute times：全部位于 `[4422, 4428]`。
- stable duration：before `1.033 s`、after `3.000 s`、ERASE confirmed-after `3.000 s`。
- learner：空；transition role/intent/claims：全 `unknown`。
- ASR：raw text、segment index、relative time、absolute time、SpeechSpan 均与原文件逐项一致。
- Git：`annotator-b.json` 与 `b-*` 资产按 `.gitignore` 保持 ignored；本日志不被忽略。未提交、未推送、未读取或改动 A 产物。
- 临时资产生成脚本通过 `apply_patch` 新建并通过 `apply_patch` 删除；高频抽帧中间目录在终检后清理，仅保留 bundle 引用的 `b-*` 证据资产与视觉冻结文件。
