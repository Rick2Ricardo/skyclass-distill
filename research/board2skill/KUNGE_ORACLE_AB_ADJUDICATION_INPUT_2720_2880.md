# 坤哥 A/B 人工裁决输入：2720–2880 s

## 当前状态

这是人工裁决入口，不是 Gold 标注。

- JSON intake：[KUNGE_ORACLE_AB_ADJUDICATION_INPUT_2720_2880.json](KUNGE_ORACLE_AB_ADJUDICATION_INPUT_2720_2880.json)，SHA-256 `cd5393475dd9075bb8a917909b444084f9d61c564b06fd5d47c7a6689089af32`
- 逐事件对齐依据：[KUNGE_ORACLE_AB_ALIGNMENT_2720_2880.md](KUNGE_ORACLE_AB_ALIGNMENT_2720_2880.md)，SHA-256 `75de468044e8f1d97a8e5c9ddcea027dbadb7b584d89908ab41b8be8a9033630`
- 规范源范围：`2720.000–2880.000 s`；相对 `tbv2-kg-003-01`：`80.000–240.000 s`
- 包级 `decision_status = pending_human`；19/19 组 `human_review.decision = pending` 且 `human_signoff.decision_status = pending_human`
- `paper_gold_status = blocked_pending_human_signoff`；任何 proposal 都不能自动转成 accepted/adjudicated 事件。

## 输入锁定

| 角色 | 输入 | SHA-256 |
|---|---|---|
| Annotator A | [annotator-a.json](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/annotator-a.json) | `6b756feafbca5459a9d04761389a2fb55f0accf0afdbdd3dcf83cb185c989ae0` |
| Annotator B | [annotator-b.json](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/annotator-b.json) | `c67cb6042aa8b94ef8f48be3ea120c94398c0ec6b6b353840e3fe5d89231b37e` |
| 原始 ASR | [clip-2640-2880.json](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/asr/clip-2640-2880.json) | `1bc570a9a07b305a3a9221f90e46d879975629aa7a0de7de3d486471ed95f5a0` |
| 规范源视频 | [source.mp4](../../data/raw/physics/force-pilot/phy-force-kunge-003/source.mp4) | `e4409e94aab76ed26501ebd24e51b09d3454944a09d4a6b37365a75fb9d080e4` |
| 标注规范 | [DATA_AND_ANNOTATION_SPEC.md](DATA_AND_ANNOTATION_SPEC.md) | `4068892dd320772a1743ba2b464a92a1d66084abcfd2c0c3d2d2edb287ad57d3` |
| runtime contract | [temporal-board.ts](../../packages/contracts/src/temporal-board.ts) | `db231fc43433624252d8d014a64264173ef770e63c0b362b5397dbaf0b0f29f8` |

两份 bundle 均通过 `temporal-board-v2` contract 校验，且指向同一规范源哈希。修复后 B 的 payload SHA-256 是 `2fda01ec90422d4f5675459cc58927996d38715b2680649b64e4f23864107309`。A/B 整个 2640–2880 s 标注窗口分别有 18/22 个事件；本裁决子窗完整纳入 A 的 16 个事件与 B 的 19 个事件。JSON 的 `coverage` 列出两侧完整 event ID 集合、matched/unmatched 集合、8 条子窗 speech trace 与冻结 delta 并集的事件空档；每个输入事件在 19 个 items 中恰好出现一次。

## 逐组人工审阅表

下表的“proposal”只说明建议检查路径，不是默认接受。`共同候选` 仍需决定边界、可见转写、region 和 Gold state/object IDs；`B 独有候选` 可被人工接受、修改或 reject。

| 组 | A | B | B speech / 绝对时间 | 原始 ASR indexes | proposal | 首要 unresolved | 人工决定 |
|---|---|---|---|---|---|---|---|
| G01 | `E003` | `d04` | `speech-b-03` / 2719.62–2744.96 | 39–52 | 共同候选 | 分隔符与标题是否拆分 | pending |
| G02 | `E004` | `d05` | `speech-b-03` / 2719.62–2744.96 | 39–52 | 共同候选 | 平衡式转写与边界 | pending |
| G03 | `E005` | `d06` | `speech-b-04` / 2747.26–2764.94 | 54–62 | 共同候选 | 标题边界 | pending |
| G04 | — | `d07` | `speech-b-04` / 2747.26–2764.94 | 54–62 | **B 独有：review/reject** | `θ` 是否为持久新增；A 漏标或 B 误报 | pending |
| G05 | `E006` | `d08` | `speech-b-04` / 2747.26–2764.94 | 54–62 | 共同候选 | 平衡式转写与边界 | pending |
| G06 | `E007` | `d09` | `speech-b-05` / 2765.96–2775.68 | 63–67 | 共同候选 | “且：”和末笔的粒度 | pending |
| G07 | — | `d10` | `speech-b-06` / 2784.64–2809.98 | 72–85 | **B 独有：review/reject** | 视口/滚动混杂；圈注字样及事件存在性 | pending |
| G08 | `E008` | `d11` | `speech-b-06` / 2784.64–2809.98 | 72–85 | 共同候选 | `4/8` 后续笔画的归属 | pending |
| G09 | `E009` | `d12` | `speech-b-06` / 2784.64–2809.98 | 72–85 | 共同候选 | `μ=0.5` 较早准备笔画 | pending |
| G10 | `E010` | `d13` | `speech-b-07` / 2817.40–2827.38 | 89–93 | 共同候选 | “向下”样圈注的转写和边界 | pending |
| G11 | `E011` | `d14` | `speech-b-08` / 2833.80–2854.78 | 97–108 | 共同候选 | 竖直向下箭头边界 | pending |
| G12 | `E012` | `d15` | `speech-b-08` / 2833.80–2854.78 | 97–108 | 共同候选 | 左上箭头的可见描述与边界 | pending |
| G13 | `E013` | `d16` | `speech-b-08` / 2833.80–2854.78 | 97–108 | 共同候选 | 水平向右箭头边界 | pending |
| G14 | `E014` | `d17` | `speech-b-08` / 2833.80–2854.78 | 97–108 | 共同候选 | tIoU=0；对象同一性与边界 | pending |
| G15 | `E015` | `d18` | `speech-b-09` / 2858.10–2868.34 | 109–113 | 共同候选 | tIoU=0；`mg` 完成笔画边界 | pending |
| G16 | `E016` | `d19` | `speech-b-09` / 2858.10–2868.34 | 109–113 | 共同候选 | `F_N` 下标和边界 | pending |
| G17 | `E017` | `d20` | `speech-b-09` / 2858.10–2868.34 | 109–113 | 共同候选 | A=`f`、B=`f′`；原帧决定有无撇号 | pending |
| G18 | `E018` | `d21` | `speech-b-09` / 2858.10–2868.34 | 109–113 | 共同候选 | `F₂` 边界 | pending |
| G19 | — | `d22` | `speech-b-10` / 2869.62–2879.10 | 114–117 | **B 独有：review/reject** | 辅助轴/小箭头/其他标记；A 漏标或 B 误报 | pending |

### 三个 B 独有候选的直接证据

- G04：[d07 comparison](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/b-comparison/b-d07-compare.jpg) 与 [mask](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/b-comparison/b-d07-mask.png)
- G07：[d10 comparison](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/b-comparison/b-d10-compare.jpg) 与 [mask](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/b-comparison/b-d10-mask.png)；comparison 含视口变化，明确允许人工 reject
- G19：[d22 comparison](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/b-comparison/b-d22-compare.jpg) 与 [mask](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/b-comparison/b-d22-mask.png)

每组 JSON item 还保留 A/B comparison、delta mask 和 before/after frame 的路径与 SHA-256。A/B 使用的 ROI 宽度略有不同，因此应在规范帧上统一 region，不能直接平均两侧坐标。

## ASR 与语义约束

- `speech_ids` 与 `speech_source_pointers` 指向修复后 B bundle；`speech_time` 是规范源绝对时间。子窗共使用 `speech-b-03` 至 `speech-b-10` 八条 trace，同一 trace 可覆盖多个视觉事件。
- `asr_segment_indexes` 是 canonical ASR `segments` 数组的零基索引；`asr_segments.start/end` 是相对 2640 s 子片时间，`asr_segments.source_time` 是加 2640 后的规范源绝对时间。
- 每组 `raw_text` 与对应 B speech 的 `raw_text` 完全一致，同时等于 canonical segment 原始 `text` 按顺序、单空格连接。未做清洗、纠错或物理事实替换。
- ASR 状态固定为 `context_only_not_adjudicated`。诸如“鞋面”“setter”“q337”“f1匹”等原始错字保留；它们不能解决 G17 的 `f`/`f′` 可见墨迹分歧。
- `pedagogical_role`、`teacher_intent`、`learner_effect` 均为 `unknown`；无 learner evidence。

## 签署门槛

人工 adjudicator 需逐组完成：

1. 回看原分辨率 before/after 与后续帧，决定事件存在性、持久性和 operation。
2. 决定原子粒度、规范源绝对时间边界、可见墨迹转写与统一 region。
3. 在决定后分配 `before_state_id`、`after_state_id` 和 `object_ids`，填写逐组 `human_review` 与 `human_signoff`。
4. 由包级 visual adjudicator（必要时 physics reviewer）填写 `package_signoff`。在 `signed_group_ids` 完整且签名有效前，paper Gold 和所有 accepted/adjudicated 输出继续 blocked。
