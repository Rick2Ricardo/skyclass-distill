# KG005 2134–2166s Temporal Board v2 独立标注日志（Annotator A）

## 独立性与输入边界

- 标注者：`annotator-a`
- 源：`phy-force-kunge-005`，完整源绝对时间 2134–2166 秒。
- 已完整阅读 `research/board2skill/DATA_AND_ANNOTATION_SPEC.md` 与 `packages/contracts/src/temporal-board.ts`。
- 未读取 `research/board2skill/OPERATION_GAP_CLIP_SELECTION.md`，未读取同窗其他标注者或模型输出。
- `data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/asr/` 在视觉结论冻结前未读取。
- 视觉冻结时间：`2026-08-12T01:47:12+08:00`。

## 纯视觉冻结（读取 ASR 前）

采用 2 fps 全窗扫描，并在变化附近加密至 4/10/30 fps。页面、滚动、工具栏、指针和教师画中画不作为 BoardEdit。

| 冻结事件 | 绝对秒 | 纯视觉判定 | 理由 |
| --- | ---: | --- | --- |
| V1 | 2136.30–2137.60 | `erase` | 右下旧演算块被持续擦除；2137.63 后无遮挡且空白稳定。 |
| V2 | 2140.27–2154.77 | `add` | 在此前空白的新位置连续写成一条完整的 `k = F r² / (I₁ I₂ Δl₁ Δl₂)` 式，之后稳定。 |
| V3 | 2158.10–2158.27 | `add` | 在完整公式右侧新增等号；没有两个已存在端点，不能闭合为 `connect`。 |
| V4 | 2162.90–2165.10 | `unknown` | 分子 `F r²` 被擦除并在同一位置重写；old/new 对象与同一语义槽可见，但前后语义文本等价，未观察到内容、条件或结构的实质变化，因此不标 `modify`。 |

V1 与 V2 之间存在约 2.6 秒稳定空白，且新式在不同位置另起，不能把二者合并成同槽 `modify`。V4 保留为真实视觉变化候选，但不为 operation-gap 凑出 MODIFY。

## 语音使用约束

视觉事件、operation 与边界已在读取 ASR 前冻结。后续只允许附录本窗原始 ASR 草稿及时间索引；不得据语音改动上述视觉结论，也不得补写角色、意图或学生效果。

## ASR 草稿（视觉冻结后读取）

- 输入为本地 whisper.cpp `small` 模型的 19 段原始草稿；bundle 中仅保存 `raw_text`、原始 segment index 与 `2134 + relative_time` 的绝对时间。
- 未做人工规范化（`normalization=none`，`normalized_text=null`）。原始草稿中的“推码”“之一道”“每23秒”等可疑识别保持原样，没有静默修订。
- ASR 只与冻结事件做时间索引；未改变 V1–V4 的 operation 或边界，也未据此填写 pedagogical role、intent 或 learner claim。

## 产物

- bundle：`data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/annotator-a.json`（由 `data/*` ignore 规则忽略）。
- 证据资产：同目录 `assets/` 下 10 张完整源帧、10 张板面裁图、4 张 comparison 与 4 张矩形近似 delta mask。
- source duration 取 `source.json` 的 `artifact.ffprobe.format.duration`：`8790.021451` 秒；source SHA-256：`127ed9323274d0dd00f3cc39c4a3b68f3109d74dbfd7fb2d08f87cab008f7241`。
- delta operation 分布：`erase ×1`、`add ×2`、`unknown ×1`、`modify ×0`、`connect ×0`。

## 最终 QA

- Temporal Board v2 contract：`valid=true`，`issues=[]`。
- canonical payload SHA-256：`ac301ff70c74d1a6c4fea7852cf3ce952d15cc7c9cc11d544afcd65d541bf40a`，声明值与重算值一致。
- 资产：29 个唯一 URI（含 canonical source video），全部存在且逐文件 SHA-256 匹配；bundle 内共有 53 次资产引用。
- 状态：surface/state/delta/transition 合计 14 个 `needs_review`、0 个 `accepted`，无其他状态。
- 时间：所有标注条目的完整源绝对时间范围为 2134–2166 秒；未写 clip-relative 时间。
- 学生：`teacher_only_recording=true`、`learner_observations=[]`、所有 role/intent/learner claim 为 `unknown/null`。
- 临时抽帧、contact sheet 与一次性检查文件只保存在 `/tmp`，未放入仓库；仓库中无临时脚本。
