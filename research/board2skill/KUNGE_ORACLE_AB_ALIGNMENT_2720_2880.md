# 坤哥第二教师候选 A/B 对齐：2720–2880 s

## 结论与状态

- 对齐范围是规范源视频绝对时间 `2720.000–2880.000 s`，对应 `tbv2-kg-003-01` 的相对时间 `80.000–240.000 s`。
- Annotator A 在该范围有 16 个事件，Annotator B 有 19 个事件；19 个对齐组覆盖两侧全部事件，得到 16 个共同事件、0 个 A 独有事件、3 个 B 独有候选。
- 本文只记录冻结后的逐事件对齐和分歧，不作 accepted/adjudicated 判定。所有合并、边界、转写和 B 独有候选均须人工复核。
- `paper_gold_status = blocked_pending_human_signoff`。页面切换、滚动、缩放、预置题图、字幕、工具栏和指示动作不属于板书事件。

## 冻结输入与证据口径

| 输入 | 路径 | SHA-256 |
|---|---|---|
| Annotator A | [annotator-a.json](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/annotator-a.json) | `6b756feafbca5459a9d04761389a2fb55f0accf0afdbdd3dcf83cb185c989ae0` |
| Annotator B | [annotator-b.json](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/annotator-b.json) | `c67cb6042aa8b94ef8f48be3ea120c94398c0ec6b6b353840e3fe5d89231b37e` |
| 原始 ASR | [clip-2640-2880.json](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/asr/clip-2640-2880.json) | `1bc570a9a07b305a3a9221f90e46d879975629aa7a0de7de3d486471ed95f5a0` |
| 标注规范 | [DATA_AND_ANNOTATION_SPEC.md](DATA_AND_ANNOTATION_SPEC.md) | `4068892dd320772a1743ba2b464a92a1d66084abcfd2c0c3d2d2edb287ad57d3` |
| temporal-board contract | [temporal-board.ts](../../packages/contracts/src/temporal-board.ts) | `db231fc43433624252d8d014a64264173ef770e63c0b362b5397dbaf0b0f29f8` |
| 规范源视频 | [source.mp4](../../data/raw/physics/force-pilot/phy-force-kunge-003/source.mp4) | `e4409e94aab76ed26501ebd24e51b09d3454944a09d4a6b37365a75fb9d080e4` |

A/B 均为完整 `temporal-board-v2` bundle，源视频及其哈希一致；A/B 全窗口各有 18/22 个事件，推荐子窗筛选后为 16/19 个。修复后 B 的 payload SHA-256 是 `2fda01ec90422d4f5675459cc58927996d38715b2680649b64e4f23864107309`。两侧 ROI 横向范围略有差异（A 到 `x=0.75`，B 到 `x=0.765625`），因此 region 数值不能直接当成像素级共识。

canonical ASR 的 segment 时间是相对 2640 s 子片的秒数，换算规范源绝对时间须加 `2640`；修复后 B speech 的 `time` 已是规范源绝对时间。intake 逐组保存对应 B speech ID、完整 `source_segment_indexes`、绝对 speech time、canonical segment 明细与原始 `raw_text`。同一 speech 覆盖多个视觉事件时，这段 trace 会在各组重复出现。ASR 仅作为未裁决上下文，不修正诸如“鞋面”“setter”“q337”“f1匹”等识别结果，也不据此推断教师角色、教学意图或学生效果。

子窗内 speech trace 映射固定为：G01–G02 → `speech-b-03`；G03–G05 → `speech-b-04`；G06 → `speech-b-05`；G07–G09 → `speech-b-06`；G10 → `speech-b-07`；G11–G14 → `speech-b-08`；G15–G18 → `speech-b-09`；G19 → `speech-b-10`。这只是时间上下文映射，不是语义裁决。

## 全量逐事件对齐

`tIoU` 是两侧时间区间的交并比，仅用于显示边界接近程度；它不是接受标准。`—` 表示一侧缺失，`0.000` 表示视觉对象可配对但两侧冻结时间段不重叠。

| 组 | A 事件与绝对时间 | B 事件与绝对时间 | tIoU | 对齐结论 | 待人工复核 |
|---|---|---|---:|---|---|
| G01 | `KG003-DELTA-E003` 2726.25–2735.75 | `delta-b-04` 2726.50–2736.25 | 0.925 | 共同：分隔符/沿斜面标题 | `{`/分隔线的转写与边界 |
| G02 | `KG003-DELTA-E004` 2736.50–2744.00 | `delta-b-05` 2738.25–2744.50 | 0.719 | 共同：沿斜面平衡式 | 公式可见转写、起止边界 |
| G03 | `KG003-DELTA-E005` 2748.25–2753.75 | `delta-b-06` 2747.75–2754.50 | 0.815 | 共同：垂直斜面标题 | 起止边界 |
| G04 | — | `delta-b-07` 2757.25–2758.25 | — | **B 独有候选：左图 `θ`** | 持久新增是否成立；A 漏标或 B 误报 |
| G05 | `KG003-DELTA-E006` 2760.75–2765.50 | `delta-b-08` 2761.00–2765.25 | 0.895 | 共同：垂直斜面平衡式 | 公式可见转写、边界 |
| G06 | `KG003-DELTA-E007` 2768.75–2775.25 | `delta-b-09` 2768.25–2772.50 | 0.536 | 共同：摩擦关系式 | A 较晚结束；前缀“且”是否属于对象 |
| G07 | — | `delta-b-10` 2791.00–2791.75 | — | **B 独有候选：题干局部圈注** | comparison 有滚动/视口混杂；被圈字样与 B 的 `F₁=2N` 转写均待核实 |
| G08 | `KG003-DELTA-E008` 2796.50–2803.75 | `delta-b-11` 2796.50–2801.50 | 0.690 | 共同：右侧 `4/8` 分数计算 | A 是否把后续笔画纳入同一事件 |
| G09 | `KG003-DELTA-E009` 2804.75–2808.75 | `delta-b-12` 2807.25–2808.75 | 0.375 | 共同：`μ = 0.5` 数值结果 | A 较早起点是否包含准备笔画 |
| G10 | `KG003-DELTA-E010` 2823.25–2824.50 | `delta-b-13` 2824.00–2824.75 | 0.333 | 共同：题干“向下”圈注 | 精确边界与可见转写 |
| G11 | `KG003-DELTA-E011` 2838.00–2839.50 | `delta-b-14` 2837.25–2838.50 | 0.222 | 共同：乙图竖直向下箭头 | 起止边界 |
| G12 | `KG003-DELTA-E012` 2840.75–2841.75 | `delta-b-15` 2841.00–2842.50 | 0.429 | 共同：乙图左上/支持力方向箭头 | 方向命名与边界 |
| G13 | `KG003-DELTA-E013` 2844.00–2845.00 | `delta-b-16` 2844.50–2845.25 | 0.400 | 共同：乙图水平向右箭头 | 边界；此时只见箭头，力名稍后出现 |
| G14 | `KG003-DELTA-E014` 2851.00–2852.25 | `delta-b-17` 2850.25–2851.00 | 0.000 | 共同：乙图沿斜面向上箭头 | 两侧冻结边界无重叠；对象同一性需看原分辨率帧确认 |
| G15 | `KG003-DELTA-E015` 2860.50–2861.50 | `delta-b-18` 2859.75–2860.50 | 0.000 | 共同：`mg` 标签 | 两侧冻结边界无重叠；完成笔画判据 |
| G16 | `KG003-DELTA-E016` 2862.00–2863.00 | `delta-b-19` 2862.00–2862.75 | 0.750 | 共同：`F_N` 标签 | 下标与边界 |
| G17 | `KG003-DELTA-E017` 2865.50–2866.50 | `delta-b-20` 2865.75–2866.25 | 0.500 | 共同：沿斜面箭头标签 | **A=`f`，B=`f′`**；只能按可见墨迹人工转写 |
| G18 | `KG003-DELTA-E018` 2867.00–2868.00 | `delta-b-21` 2867.25–2868.25 | 0.600 | 共同：`F₂` 标签 | 边界 |
| G19 | — | `delta-b-22` 2876.50–2877.00 | — | **B 独有候选：乙图沿斜面辅助轴/小箭头** | 精确对象类型、持续性；A 漏标或 B 误报 |

## 分歧分析

### 共同与独有事件

- 共同事件：G01–G03、G05–G06、G08–G18，共 16 组。共同仅表示两份冻结标注可以按可见对象配对，不代表语义、边界或事件粒度已经裁决。
- A 独有：无。
- B 独有：G04 的 `θ`、G07 的题干圈注、G19 的沿斜面辅助轴/小箭头。三者均保留为 `pending_human` 候选；不能因 B 有记录而自动接受，也不能因 A 缺失而自动删除。

### 粒度与边界

- 数量差 3 完全来自 B 单列的三个微小候选。共同部分总体是一对一，没有自动执行 merge/split。
- G01 两侧都把分隔符与方向标题视作复合落笔；是否拆分 `{`/分隔线和文字，仍由人工按原子事件规则决定。
- G08、G09 对连续计算笔画的归属不同：A 的 `4/8` 结束更晚，且 `μ=0.5` 开始更早。人工需要决定空档、准备笔画和最后一笔应归前一事件还是后一事件。
- G11–G18 均把箭头与稍后的文字标签分开，但多数起止边界相差 0.25–1.25 s；G14、G15 甚至没有区间交叠。这是边界口径分歧，不足以单独证明对象不同。
- G17 是实质转写分歧：A 标 `f`，B 标 `f′`。ASR 不能解决可见笔画是否含撇号。

### 视觉核验重点

- [B d07 comparison](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/b-comparison/b-d07-compare.jpg) 可见左图局部新增红色 `θ` 样笔画，但仍须人工确认它满足持久数字墨迹和准确边界要求。
- [B d10 comparison](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/b-comparison/b-d10-compare.jpg) 的 before/after 含明显滚动或视口变化；局部圈注虽然可见，具体圈注文字、前后可比性及是否应成事件均为 unresolved。
- [B d22 comparison](../../data/board2skill/oracle-pilot/tbv2-kg-003-01/b-comparison/b-d22-compare.jpg) 可见右图沿斜面方向附近新增小型红色标记；“辅助轴”“箭头”或其他对象类型不得在人工查看原帧前定案。

## 人工裁决入口

机器可读 intake 与审阅表见 [KUNGE_ORACLE_AB_ADJUDICATION_INPUT_2720_2880.json](KUNGE_ORACLE_AB_ADJUDICATION_INPUT_2720_2880.json) 和 [KUNGE_ORACLE_AB_ADJUDICATION_INPUT_2720_2880.md](KUNGE_ORACLE_AB_ADJUDICATION_INPUT_2720_2880.md)。其中 proposal 只是人工候选：每组 `human_review.decision = pending`、`human_signoff.decision_status = pending_human`，包级签署同样为空；在逐组视觉裁决和最终签名完成前，不得生成 Gold bundle 或 accepted/adjudicated BoardDelta。
