# 李永乐 003 A/B 对齐：702–922 秒

## 结论与状态

- 绝对源视频窗口：`[702.000, 922.000]` 秒。
- 冻结输入为 Annotator A 的 16 个 delta 与 Annotator B 的 17 个 delta。严格时间交叠的二部连通分量产生 **17 个真实对齐组**：13 matched、1 A-only、3 B-only。
- 每个 A/B 事件在下表恰好出现一次；多对一和一对多组保留对象拆分差异，不人为凑组数。
- 本文仅提供人工裁决输入。所有 review/signoff 均 pending，accepted=0；`paper_gold_status = blocked_pending_human_signoff`。
- 本窗没有独立 ASR：`speech=[]`。烧录字幕不是证据；`learner_observations=[]`，role/intent/learner effect 均为 unknown。

## 冻结输入与验证

| 输入 | 路径 | 文件 SHA-256 | canonical payload |
|---|---|---|---|
| Annotator A | [annotator-a.json](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a.json) | `7943be809bf2a55077a55b81de8af48d7008319cd93e39123a52563babc1eefc` | `12365c9e8af108ac42387cca954157494f52cc2f1c8d53c0b986f3e99400c50e` |
| Annotator B | [annotator-b.json](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-b.json) | `36d2e681e823dde4d7df01c38b0b3aaed41ffd81f1f09c3aab27a1ca7d220791` | `44102cb741a5217f664936cff271a2e76e2303af6c38f1f4dbe955042f5db086` |
| 规范源视频 | [source.mp4](../../data/raw/physics/force-pilot/phy-force-liyongle-003/source.mp4) | `c7e62d680e003d9e5d28305015bd409f9e6e155e67fcaba72b73f9571de39d95` | — |
| 标注规范 | [DATA_AND_ANNOTATION_SPEC.md](DATA_AND_ANNOTATION_SPEC.md) | `4068892dd320772a1743ba2b464a92a1d66084abcfd2c0c3d2d2edb287ad57d3` | — |
| runtime contract | [temporal-board.ts](../../packages/contracts/src/temporal-board.ts) | `db231fc43433624252d8d014a64264173ef770e63c0b362b5397dbaf0b0f29f8` | — |

A/B 均通过 `temporal-board-v2` contract，canonical payload 重算一致，源视频 ID、时长和哈希一致。磁盘逐项复算了 A 的 50 个、B 的 109 个唯一引用资产；全部 path 可解析且 SHA-256 匹配。两侧都只有 ADD、全部 needs_review、0 accepted、0 speech、0 learner。

## 全量唯一覆盖对齐

`temporal union IoU` 对多事件组按两侧时间区间并集计算交并比，只显示边界接近度，不是接受阈值。匹配组由严格 `overlap > 0` 的连通分量产生；没有交叠的单边事件保持 A-only/B-only。

| 组 | 分类 | A 事件与绝对时间 | B 事件与绝对时间 | union tIoU | 边界/对象拆分差异 | 待人工核验 |
|---|---|---|---|---:|---|---|
| G01 | b_only | — | `tbv2-ly-003-b-delta-01` 702.05–706.10 | — | B-only；左截断续写，A 可能吸收到窗口初始状态或漏标。 | 核对 702.000 前后原帧，只把窗内新增且持续的后缀当 ADD；也可 reject/not_an_event/unknown。 |
| G02 | matched | `LY003-A-DELTA-E001` 710.50–716.00 | `tbv2-ly-003-b-delta-02` 710.40–716.70 | 0.873 | 一对一；起止边界略有差异。 | 确定第一笔可见与完成稳定边界；对象为新行而非旧行替换。 |
| G03 | matched | `LY003-A-DELTA-E002` 720.25–725.25 | `tbv2-ly-003-b-delta-03` 720.30–725.80 | 0.892 | 一对一；B 结束略晚。 | 核对公式完成笔画与稳定边界。 |
| G04 | matched | `LY003-A-DELTA-E003` 730.25–738.25 | `tbv2-ly-003-b-delta-04` 730.20–738.80 | 0.930 | 一对一；两侧都把空白区域新图作为 ADD。 | 确认旧板书持续存在；新图不是 MODIFY。 |
| G05 | b_only | — | `tbv2-ly-003-b-delta-05` 740.30–743.00 | — | B-only；A 未冻结对应时段事件。 | 核对是否为持久新增，或应并入后续问题文字；保留 reject/not_an_event/unknown。 |
| G06 | b_only | — | `tbv2-ly-003-b-delta-06` 744.20–747.00 | — | B-only；A 未冻结对应时段事件。 | 核对短标记是否真实、持久且不只是遮挡/动作。 |
| G07 | matched | `LY003-A-DELTA-E004` 748.25–754.00<br>`LY003-A-DELTA-E005` 755.25–771.25 | `tbv2-ly-003-b-delta-07` 748.20–771.50 | 0.933 | A 拆为 2 个对象/事件，B 合为 1 个持续续写对象/事件。 | 裁决 1 或 2 个原子 ADD；先前文字始终保留，所以不能改判 MODIFY。 |
| G08 | matched | `LY003-A-DELTA-E006` 782.25–784.75 | `tbv2-ly-003-b-delta-08` 782.20–784.80 | 0.962 | 一对一；边界接近。 | 确认箭头与标签是否作为一个原子 ADD。 |
| G09 | matched | `LY003-A-DELTA-E007` 786.00–788.25 | `tbv2-ly-003-b-delta-09` 785.40–788.30 | 0.776 | 一对一；A 起点较晚。 | 确定起点和箭头/标签粒度；既有图与 mg 保留。 |
| G10 | matched | `LY003-A-DELTA-E008` 797.50–809.25 | `tbv2-ly-003-b-delta-10` 802.20–808.80 | 0.562 | 一对一但对象范围不同；A 覆盖 797.5–809.25，B 只冻结 802.2–808.8 主箭头段。 | 核对辅助线是否属于同一复合 ADD，统一边界与 region。 |
| G11 | matched | `LY003-A-DELTA-E009` 842.25–849.25<br>`LY003-A-DELTA-E010` 852.25–853.75 | `tbv2-ly-003-b-delta-11` 841.00–853.70 | 0.663 | A 拆为主公式与追加 =ma 两个 ADD；B 合为完整公式一个 ADD。 | 裁决 1 或 2 个原子 ADD；追加内容不替换原公式，严禁误判 MODIFY。 |
| G12 | matched | `LY003-A-DELTA-E011` 855.25–858.50 | `tbv2-ly-003-b-delta-12` 854.40–858.80 | 0.739 | 一对一；边界略有差异。 | 核对结论完成边界与可见转写。 |
| G13 | matched | `LY003-A-DELTA-E012` 884.25–889.25 | `tbv2-ly-003-b-delta-13` 884.00–889.00 | 0.905 | 一对一；第一幅图同时持续存在。 | 核心困难负例：相似新图是独立新增对象，只支持 ADD，不支持 MODIFY。 |
| G14 | matched | `LY003-A-DELTA-E013` 892.25–896.00 | `tbv2-ly-003-b-delta-14` 892.40–894.30<br>`tbv2-ly-003-b-delta-15` 894.80–896.20 | 0.785 | A 合为 1 个事件，B 拆为 mg、N 两个事件。 | 裁决 1 或 2 个原子 ADD；新增受力对象不修改第二幅图本体。 |
| G15 | matched | `LY003-A-DELTA-E014` 904.25–907.00 | `tbv2-ly-003-b-delta-16` 904.10–909.20 | 0.539 | 一对一；B 时间包络更长，A 结束更早。 | 核对主箭头完成边界；后续辅助线另见 G16。 |
| G16 | a_only | `LY003-A-DELTA-E015` 911.00–912.25 | — | — | A-only；与 G15 不重叠，B 未冻结对应事件。 | 核对 911.0–912.25 的新增线是否持久独立事件；可 ADD/reject/not_an_event/unknown。 |
| G17 | matched | `LY003-A-DELTA-E016` 917.75–918.75 | `tbv2-ly-003-b-delta-17` 917.80–919.30 | 0.613 | 一对一；B 结束略晚。 | 核对角标完成边界；新角标不修改原斜面图。 |

## 分歧与困难负例

- **B-only**：G01、G05、G06。G01 是窗口起点后的左截断续写；G05/G06 是 A 未单列的问题行起始片段和短标记。三组均可由人工选 ADD、reject、not_an_event 或 unknown，不能因单边出现自动 accepted。
- **A-only**：G16 的红色合力辅助线，与 G15 时间不重叠。需核验它是否是持久独立新增，不能因 B 缺失自动 reject。
- **A 两个 ↔ B 一个**：G07 的连续问题文字、G11 的公式主干与追加 `=ma`。无论裁决为一个还是多个原子事件，先前内容始终保留，operation 候选都是 ADD，不满足 old→new 同语义槽的 MODIFY 条件。
- **A 一个 ↔ B 两个**：G14 中 A 合并 `mg/N`，B 拆成两事件。它们是在第二幅既有图上增加新受力对象，不是修改图形本体。
- **新图困难负例**：G13 两侧都看到右下空白区域新增第二幅斜面图，第一幅图持续存在。语义相似不等于同槽替换；视觉事实支持 ADD 候选，不支持自动判 MODIFY。
- **边界/范围差异**：G10 的 A 时间覆盖辅助线、箭头与标签，B 只覆盖主箭头段；G15 的 B 包络长于 A。需回看原分辨率 evidence，不能平均边界或 region。

## 重点直接证据

- G01 左截断续写：[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-01-comparison.jpg)。
- G07 问题续写粒度：[A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E004.jpg)<br>[A2 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E005.jpg)；[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-07-comparison.jpg)。
- G11 公式续写 `=ma`：[A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E009.jpg)<br>[A2 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E010.jpg)；[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-11-comparison.jpg)。
- G13 第二幅新图：[A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E012.jpg)；[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-13-comparison.jpg)。
- G14 `mg/N` 拆分：[A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E013.jpg)；[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-14-comparison.jpg)<br>[B2 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-15-comparison.jpg)。
- G16 A-only 辅助线：[A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E015.jpg)。

## 人工裁决入口

机器可读输入见 [LIYONGLE_003_AB_ADJUDICATION_INPUT_702_922.json](LIYONGLE_003_AB_ADJUDICATION_INPUT_702_922.json)，签字审阅表见 [LIYONGLE_003_AB_ADJUDICATION_INPUT_702_922.md](LIYONGLE_003_AB_ADJUDICATION_INPUT_702_922.md)。逐组允许选项固定为 ADD / reject / not_an_event / unknown；在逐组视觉复核与包级签字完成前，不得生成 accepted/adjudicated delta 或 paper Gold。
