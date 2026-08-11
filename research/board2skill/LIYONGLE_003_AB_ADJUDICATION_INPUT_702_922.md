# 李永乐 003 A/B 人工裁决输入：702–922 秒

## 当前状态

这是可签字的人工裁决输入，不是 Gold 标注。

- JSON intake：[LIYONGLE_003_AB_ADJUDICATION_INPUT_702_922.json](LIYONGLE_003_AB_ADJUDICATION_INPUT_702_922.json)，SHA-256 `9b705bddbc4997c8a1d7440199abe9f484cbbb60178e447af63cde564dd99d76`。
- 全量对齐：[LIYONGLE_003_AB_ALIGNMENT_702_922.md](LIYONGLE_003_AB_ALIGNMENT_702_922.md)，SHA-256 `38f582b966baab0ea911968441cf12bedd8512b86feaec6107a3c269c17cfa4e`。
- 17/17 组 `human_review.decision=pending`、`human_signoff.decision_status=pending_human`；包级 signoff 同样 pending，accepted=0。
- `paper_gold_status=blocked_pending_human_signoff`；任何候选都不能自动变成 accepted/adjudicated delta。

## 输入锁定

| 角色 | 输入 | 文件 SHA-256 | payload SHA-256 |
|---|---|---|---|
| Annotator A | [annotator-a.json](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a.json) | `7943be809bf2a55077a55b81de8af48d7008319cd93e39123a52563babc1eefc` | `12365c9e8af108ac42387cca954157494f52cc2f1c8d53c0b986f3e99400c50e` |
| Annotator B | [annotator-b.json](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-b.json) | `36d2e681e823dde4d7df01c38b0b3aaed41ffd81f1f09c3aab27a1ca7d220791` | `44102cb741a5217f664936cff271a2e76e2303af6c38f1f4dbe955042f5db086` |
| 规范源视频 | [source.mp4](../../data/raw/physics/force-pilot/phy-force-liyongle-003/source.mp4) | `c7e62d680e003d9e5d28305015bd409f9e6e155e67fcaba72b73f9571de39d95` | — |
| 标注规范 | [DATA_AND_ANNOTATION_SPEC.md](DATA_AND_ANNOTATION_SPEC.md) | `4068892dd320772a1743ba2b464a92a1d66084abcfd2c0c3d2d2edb287ad57d3` | — |
| runtime contract | [temporal-board.ts](../../packages/contracts/src/temporal-board.ts) | `db231fc43433624252d8d014a64264173ef770e63c0b362b5397dbaf0b0f29f8` | — |

A/B contract、canonical payload、全部引用资产 path/hash 已逐项复算通过。A16/B17 均完整纳入，按严格时间交叠形成 13 matched、1 A-only、3 B-only，共 17 组。

## 逐组签字审阅表

每组允许决定固定为 **ADD / reject / not_an_event / unknown**。表中“ADD 候选”只反映冻结视觉输入，两侧一致也不构成自动接受。

| 组 | 分类 | A | B | tIoU | 直接证据 | 边界/对象拆分与首要核验 | 候选/允许决定 | 人工决定 |
|---|---|---|---|---:|---|---|---|---|
| G01 | b_only | — | `tbv2-ly-003-b-delta-01` | — | —<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-01-comparison.jpg) | B-only；左截断续写，A 可能吸收到窗口初始状态或漏标。<br>核对 702.000 前后原帧，只把窗内新增且持续的后缀当 ADD；也可 reject/not_an_event/unknown。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G02 | matched | `LY003-A-DELTA-E001` | `tbv2-ly-003-b-delta-02` | 0.873 | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E001.jpg)<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-02-comparison.jpg) | 一对一；起止边界略有差异。<br>确定第一笔可见与完成稳定边界；对象为新行而非旧行替换。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G03 | matched | `LY003-A-DELTA-E002` | `tbv2-ly-003-b-delta-03` | 0.892 | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E002.jpg)<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-03-comparison.jpg) | 一对一；B 结束略晚。<br>核对公式完成笔画与稳定边界。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G04 | matched | `LY003-A-DELTA-E003` | `tbv2-ly-003-b-delta-04` | 0.930 | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E003.jpg)<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-04-comparison.jpg) | 一对一；两侧都把空白区域新图作为 ADD。<br>确认旧板书持续存在；新图不是 MODIFY。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G05 | b_only | — | `tbv2-ly-003-b-delta-05` | — | —<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-05-comparison.jpg) | B-only；A 未冻结对应时段事件。<br>核对是否为持久新增，或应并入后续问题文字；保留 reject/not_an_event/unknown。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G06 | b_only | — | `tbv2-ly-003-b-delta-06` | — | —<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-06-comparison.jpg) | B-only；A 未冻结对应时段事件。<br>核对短标记是否真实、持久且不只是遮挡/动作。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G07 | matched | `LY003-A-DELTA-E004`<br>`LY003-A-DELTA-E005` | `tbv2-ly-003-b-delta-07` | 0.933 | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E004.jpg)<br>[A2 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E005.jpg)<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-07-comparison.jpg) | A 拆为 2 个对象/事件，B 合为 1 个持续续写对象/事件。<br>裁决 1 或 2 个原子 ADD；先前文字始终保留，所以不能改判 MODIFY。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G08 | matched | `LY003-A-DELTA-E006` | `tbv2-ly-003-b-delta-08` | 0.962 | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E006.jpg)<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-08-comparison.jpg) | 一对一；边界接近。<br>确认箭头与标签是否作为一个原子 ADD。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G09 | matched | `LY003-A-DELTA-E007` | `tbv2-ly-003-b-delta-09` | 0.776 | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E007.jpg)<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-09-comparison.jpg) | 一对一；A 起点较晚。<br>确定起点和箭头/标签粒度；既有图与 mg 保留。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G10 | matched | `LY003-A-DELTA-E008` | `tbv2-ly-003-b-delta-10` | 0.562 | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E008.jpg)<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-10-comparison.jpg) | 一对一但对象范围不同；A 覆盖 797.5–809.25，B 只冻结 802.2–808.8 主箭头段。<br>核对辅助线是否属于同一复合 ADD，统一边界与 region。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G11 | matched | `LY003-A-DELTA-E009`<br>`LY003-A-DELTA-E010` | `tbv2-ly-003-b-delta-11` | 0.663 | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E009.jpg)<br>[A2 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E010.jpg)<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-11-comparison.jpg) | A 拆为主公式与追加 =ma 两个 ADD；B 合为完整公式一个 ADD。<br>裁决 1 或 2 个原子 ADD；追加内容不替换原公式，严禁误判 MODIFY。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G12 | matched | `LY003-A-DELTA-E011` | `tbv2-ly-003-b-delta-12` | 0.739 | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E011.jpg)<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-12-comparison.jpg) | 一对一；边界略有差异。<br>核对结论完成边界与可见转写。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G13 | matched | `LY003-A-DELTA-E012` | `tbv2-ly-003-b-delta-13` | 0.905 | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E012.jpg)<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-13-comparison.jpg) | 一对一；第一幅图同时持续存在。<br>核心困难负例：相似新图是独立新增对象，只支持 ADD，不支持 MODIFY。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G14 | matched | `LY003-A-DELTA-E013` | `tbv2-ly-003-b-delta-14`<br>`tbv2-ly-003-b-delta-15` | 0.785 | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E013.jpg)<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-14-comparison.jpg)<br>[B2 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-15-comparison.jpg) | A 合为 1 个事件，B 拆为 mg、N 两个事件。<br>裁决 1 或 2 个原子 ADD；新增受力对象不修改第二幅图本体。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G15 | matched | `LY003-A-DELTA-E014` | `tbv2-ly-003-b-delta-16` | 0.539 | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E014.jpg)<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-16-comparison.jpg) | 一对一；B 时间包络更长，A 结束更早。<br>核对主箭头完成边界；后续辅助线另见 G16。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G16 | a_only | `LY003-A-DELTA-E015` | — | — | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E015.jpg)<br>— | A-only；与 G15 不重叠，B 未冻结对应事件。<br>核对 911.0–912.25 的新增线是否持久独立事件；可 ADD/reject/not_an_event/unknown。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |
| G17 | matched | `LY003-A-DELTA-E016` | `tbv2-ly-003-b-delta-17` | 0.613 | [A1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/evidence/comparison-E016.jpg)<br>[B1 comparison](../../data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/deltas/b-d-17-comparison.jpg) | 一对一；B 结束略晚。<br>核对角标完成边界；新角标不修改原斜面图。 | ADD candidate; ADD / reject / not_an_event / unknown | **pending** |

## 核心 operation 审核

- G04、G13 的新斜面图位于空白或空间独立区域，旧图/旧板书持续存在。即使语义相似，也不满足 MODIFY 所需的 old→new 同槽替换。
- G07 的问题文字续写、G11 的 `=ma` 追加都保留原有笔画；裁决重点是拆成几个 ADD，而不是改判 MODIFY。
- G08–G10、G14–G15、G17 是在既有图上增加箭头、辅助线或角标；图形本体持续存在，新增对象仍是 ADD 候选。
- G01/G05/G06/G16 是单边候选，必须回看 comparison、mask、before/after 和后续稳定帧；可 reject、not_an_event 或 unknown，不能单边自动接受。

## Speech、learner 与语义边界

- 本窗没有独立 ASR。JSON 中 `governance.speech=[]`、`speech_evidence_used=[]`，所有 item 的 `speech_ids=[]`；烧录字幕明确排除，不能反向伪造成 SpeechSpan 或语义证据。
- `learner_observations=[]`，没有学生回应、理解或效果事实。
- `pedagogical_role`、`teacher_intent`、`learner_effect` 全部 unknown。人工只裁决可见板书事件，不从板书内容推断教学意图。

## 签署门槛

人工 adjudicator 需要逐组：

1. 回看原分辨率 comparison/mask 与 before/after，确认事件存在性、持久性和遮挡排除。
2. 从 ADD / reject / not_an_event / unknown 中选择；如选 ADD，再确定原子事件数量、绝对时间、region、可见转写和对象/state ID。
3. 填写每组 `human_review`、`human_signoff`，并完成包级 `package_signoff` 与签名哈希。
4. 在 17 组全部签署且包级签名有效前，paper Gold 与所有 accepted/adjudicated 输出保持 blocked。
