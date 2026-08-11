# KG005 ERASE/ADD 独立标注员 B 日志

## 结论

对 `phy-force-kunge-005` 源视频绝对时间 `1888.000000–1905.000000 s` 的 510 个原始 30 fps 帧完成独立逐帧标注。视觉冻结得到 3 个 BoardDelta：`ERASE → ADD → ERASE`，没有把同一空间的后续书写自动判成 `MODIFY`。全部 delta 与 transition 均显式为 `annotation_review_status=independent`、`status=needs_review`；`accepted=0`。learner observation 为空，pedagogical role 与 intent 均为 unknown。

## 盲标隔离与污染审计

视觉冻结前只读取：

- `research/board2skill/DATA_AND_ANNOTATION_SPEC.md`
- `packages/contracts/src/temporal-board.ts`
- `data/raw/physics/force-pilot/phy-force-kunge-005/source.mp4`

视觉冻结前未读取 ASR、OPERATION_GAP、oracle manifest、scout 图片/说明、A 标注、既有 annotator、对齐、仲裁或蒸馏输出，也未进行仓库级搜索。所有 `b-*` 视觉资产均由指定源视频重新生成。视觉冻结文件在读取 ASR 前落盘并校验，未发现盲标污染。

- visual freeze：`data/board2skill/oracle-pilot/tbv2-kg005-hardnegative-1888-1905/b-assets/b-visual-freeze.json`
- visual freeze SHA-256：`bfa65dd244961fc1ce6bd17f243fa9fae995ab4a9cb959bd602a68ce4d70d986`
- `asr_read_before_freeze=false`
- `annotator_a_read_before_freeze=false`
- `visual_contamination_detected=false`

冻结后只额外读取任务指定的精确 ASR：`data/board2skill/oracle-pilot/tbv2-kg005-hardnegative-1888-1905/asr/clip-1888-1905.json`。ASR SHA-256 为 `c96ffbe3a8077736046d78c8f14c47f41d700c99efb894ba16143bfc678a4a77`，仅作为 `context_not_adjudicated` speech 写入，没有反改视觉边界、对象或 operation。

## 源与独立资产

- canonical source SHA-256：`127ed9323274d0dd00f3cc39c4a3b68f3109d74dbfd7fb2d08f87cab008f7241`
- 源视频：1280×720、30 fps、8790.021451 s
- 观察窗：17.000000 s，帧 `N` 的绝对时间为 `1888 + (N - 1) / 30`
- 全新 `b-*` 原帧：510 张；全帧树哈希 `515fd9f35dde702b903131ece652414209770d1d223ba28d7ca7a40764f50b7f`
- 接触表/细节表：44 张；接触表树哈希 `98dc04556c97185e2d44e48420f7472ce3ea588aa4136100d525f53962879dea`
- state crops：4 张
- comparison：3 张
- delta masks：3 张
- review clip：1 个；event clips：3 个
- `b-assets` 总文件数：569

片段时长检查：主 review clip 17.0 s；三个事件 clip 分别为 1.5 s、2.4 s、0.4 s。

## 板面与干扰

板面是固定数字墨迹/PDF 页，归一化视频 ROI 为 `(0,0)–(0.759375,1)`；教师画面位于右侧并排除在板面之外。整段没有页面切换、镜头切换或板面移动。

浮动笔工具栏中的橡皮选择高亮和擦除时的瞬态光标不作为 BoardObject，也不进入 delta mask。片段中没有 CONNECT。新增公式是短暂笔迹：形成稳定状态后保留约 6.33 s，随后在片段末尾被擦除。

## 视觉边界与对象

| Delta | 绝对时间（s） | Operation | 影响对象 | Before → After | 关键视觉事实 |
| --- | ---: | --- | --- | --- | --- |
| `B-DELTA-001` | `1892.166667–1893.366667` | ERASE | `L²m/t²`、`V²m`、圈注 | `B-STATE-001 → B-STATE-002` | 1892.166667 选择橡皮；1892.366667 首次持续去墨；1893.366667 全部消失，后续空白持续到新增开始前。 |
| `B-DELTA-002` | `1896.200000–1898.266667` | ADD | 新公式 `Lm²/t²` | `B-STATE-002 → B-STATE-003` | 从稳定空白区开始逐笔书写，1898.300000 起稳定。 |
| `B-DELTA-003` | `1904.666667–1904.933333` | ERASE | 短暂公式 `Lm²/t²` | `B-STATE-003 → B-STATE-004` | 公式被逐步擦净；frame 509/510 均为空白。片段末尾只提供约 0.033 s 持久性证据，因此保留 `needs_review` 与 clip-end uncertainty。 |

第一次擦除结束到 ADD 开始之间约有 2.83 s 的操作间隔，且 `1893.400000–1896.166667` 为稳定空白状态。被擦对象是两条公式加圈注，而新增对象是一条新公式，缺少连续可追踪对象身份；因此按规范标为独立 `ERASE + ADD`，不是仅凭空间复用推断 `MODIFY`。

## ASR 溯源（冻结后）

原 ASR 为 clip-relative，统一加 `1888 s` 映射到绝对时间：

| source segment | clip 时间（s） | 绝对时间（s） | Bundle speech |
| ---: | ---: | ---: | --- |
| 0 | `0–11` | `1888–1899` | `B-SPEECH-000` |
| 1 | `11–17` | `1899–1905` | `B-SPEECH-001` |

保留 `raw_text`，`normalization=none`；未用 ASR 判定视觉 operation 或边界。transition 可引用同时间段 speech 作为上下文，但全部 role/intent claim 仍为 `value=null, subject=unknown, level=unknown`。

## Bundle 统计

- surfaces：1
- frames：16
- objects：5（含 1 个持久背景聚合对象）
- states：4
- deltas：3（ERASE 2、ADD 1、MODIFY 0、CONNECT 0、unknown 0）
- speech spans：2
- evidence refs：25
- transitions：3
- learner observations：0
- accepted：0
- needs_review：全部 surface/state/delta/transition

ignored bundle：`data/board2skill/oracle-pilot/tbv2-kg005-hardnegative-1888-1905/annotator-b.json`

- canonical payload SHA-256：`16fcbfd3753bb2a159ad5a232bdbc973484af90613185aa8dd35bf42a20ef928`
- bundle file SHA-256：`7d9ac1416bd716c4df117d4d3fcaa0fc270e0a4081ef107afa36ef37b43a8abd`

## 校验

最终校验覆盖：

- `validateBoardEvidenceBundle`：`valid=true`，issues `0`
- `canonicalBoardEvidencePayload` 重算与声明 hash 完全一致
- 60 个 asset 引用逐个执行 path 存在性与 SHA-256 校验，覆盖 33 个唯一路径
- `b-assets` 569 个文件计数、510 个连续原帧、44 张接触表以及两个目录树哈希复核
- 所有 frame 文件名到绝对时间的 `30 fps` 映射检查
- surface/state/delta/speech/evidence/transition/event clip 全部位于 `1888–1905 s`
- 2 个 ASR segment 的 raw text、segment index、clip-relative 与 absolute time 映射逐项检查
- visual freeze 三个 operation 与时间边界逐项对 bundle 校对，无冻结漂移
- accepted 递归计数为 0；learner observation 为 0；role/intent unknown；所有 delta/transition explicit independent

最终结果：`PASS`。

## 限制

- `B-DELTA-003` 的空白 after-state 只由片段末尾两帧支持，虽然视觉上已完全擦净，但没有更长未来帧；因此不升级为 accepted。
- 公式转写来自逐帧人工视觉读取，不使用 ASR 校正；对象/状态仍全部保留 `needs_review`。
- 本日志与 ignored bundle 均未提交、未推送；未修改规范、契约或其他研究文件。
