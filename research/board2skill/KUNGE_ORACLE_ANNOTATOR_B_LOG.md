# 坤哥 temporal-board-v2 独立标注 B 日志

## 范围与独立性

- 候选：`tbv2-kg-003-01`
- 源视频：`data/raw/physics/force-pilot/phy-force-kunge-003/source.mp4`
- 固定绝对窗口：`2640.000–2880.000 s`
- JSON canonical 时间轴：完整源视频绝对秒；标注区间 `2640.000–2880.000 s`
- JSON `source_video_id`：`phy-force-kunge-003`；`duration_seconds`：`6135.048821`
- 下表为便于复核保留窗口相对时间（绝对时间 = 相对时间 + `2640.000 s`）
- 共同评测重点子窗：相对 `80.000–240.000 s`
- 标注者：annotator B；本记录和全部 `b-*` 资产均独立生成。
- 标注过程中未读取 annotator A JSON、A 日志、A 的 comparison/contact 资产或模型蒸馏输出。
- 先依据视频逐帧冻结视觉事件和边界，再读取邻近 ASR 草稿。ASR 未改变任何视觉边界，也未用于补写教学角色、意图或学生结果。

## 口径

仅记录教师新增且在后续稳定帧中持续存在的数字墨迹。以下均不作为板书变化：页面滚动、切页/表面过渡、缩放、预置题图、工具栏、选择框、鼠标十字/指示动作、字幕，以及短暂出现后消失的指示圈和划线。

所有 surface、state、delta 均为 `needs_review`；所有 delta 都带 `independent_annotation` 不确定性代码。没有 `accepted` 或 `adjudicated` 结果，`transitions` 与 `learner_observations` 均为空。

## 冻结的视觉事件

| # | 相对时间（s） | 操作 | 持久墨迹对象 |
|---:|---:|---|---|
| 1 | 29.75–35.25 | ADD text | `解：(1)甲图：` |
| 2 | 53.25–54.50 | ADD diagram | 甲图沿斜面辅助轴 |
| 3 | 57.25–58.50 | ADD diagram | 甲图垂直斜面辅助轴 |
| 4 | 86.50–96.25 | ADD text | 大括号与`沿斜面：` |
| 5 | 98.25–104.50 | ADD formula | `mg sinθ = F₁ + f` |
| 6 | 107.75–114.50 | ADD text | `垂直斜面：` |
| 7 | 117.25–118.25 | ADD mark | 甲图重力与法向夹角 `θ` |
| 8 | 121.00–125.25 | ADD formula | `mg cosθ = F_N` |
| 9 | 128.25–132.50 | ADD formula | `且：f = μF_N` |
| 10 | 151.00–151.75 | ADD mark | 圈注题干 `F₁=2N` |
| 11 | 156.50–161.50 | ADD formula | `4/8` |
| 12 | 167.25–168.75 | ADD formula | `μ = 0.5` |
| 13 | 184.00–184.75 | ADD mark | 圈注题干“向下” |
| 14 | 197.25–198.50 | ADD arrow | 乙图重力方向箭头 |
| 15 | 201.00–202.50 | ADD arrow | 乙图支持力方向箭头 |
| 16 | 204.50–205.25 | ADD arrow | 乙图水平向右推力箭头 |
| 17 | 210.25–211.00 | ADD arrow | 乙图沿斜面向上摩擦力箭头 |
| 18 | 219.75–220.50 | ADD text | `mg` |
| 19 | 222.00–222.75 | ADD text | `F_N` |
| 20 | 225.75–226.25 | ADD text | `f′` |
| 21 | 227.25–228.25 | ADD text | `F₂` |
| 22 | 236.50–237.00 | ADD diagram | 乙图沿斜面辅助轴 |

边界以 4 fps 细化接触表人工冻结，时间精度按 0.25 s 处理。辅助轴和受力箭头在各自出现后均有独立稳定帧，因此保持为独立 ADD 事件，而不合并成 CONNECT 或教学意图事件。

## ASR 使用

视觉冻结完成后才读取：

- `data/board2skill/oracle-pilot/tbv2-kg-003-01/asr/clip-2640-2880.json`
- SHA-256：`1bc570a9a07b305a3a9221f90e46d879975629aa7a0de7de3d486471ed95f5a0`

bundle 仅保留 10 个相邻 `SpeechSpan` 草稿，`normalization: none`、`normalized_text: null`；写入 JSON 时已统一换算为完整源视频绝对秒。ASR 原始连续索引为：b01 `10–15`、b02 `18–29`、b03 `39–52`、b04 `54–62`、b05 `63–67`、b06 `72–85`、b07 `89–93`、b08 `97–108`、b09 `109–113`、b10 `114–117`。每条 `raw_text` 与时间均由对应原始 segment 连续重构。未把 ASR 作为视觉 delta 的证据引用，也未据此修改边界或推断 role/intent/learner outcome。

## 独立资产

- `data/board2skill/oracle-pilot/tbv2-kg-003-01/b-frames/`：241 张 1 fps 浏览帧。
- `data/board2skill/oracle-pilot/tbv2-kg-003-01/b-contact/`：108 张粗/细接触表。
- `data/board2skill/oracle-pilot/tbv2-kg-003-01/b-boundary/`：23 张稳定状态代表帧。
- `data/board2skill/oracle-pilot/tbv2-kg-003-01/b-comparison/`：22 张 before/after 对照图和 22 张人工 ROI 矩形 mask。
- 输出：`data/board2skill/oracle-pilot/tbv2-kg-003-01/annotator-b.json`（由 `data/*` 规则忽略）。

源视频 SHA-256：`e4409e94aab76ed26501ebd24e51b09d3454944a09d4a6b37365a75fb9d080e4`。

## 校验

- JSON 可解析。
- `validateBoardEvidenceBundle`：`valid: true`，`issues: []`。
- 结构计数：22 objects、22 deltas、23 states、23 frames、10 speech spans。
- canonical delta 时间范围：最早 `2669.75 s`，最晚结束 `2877.00 s`，全部位于绝对窗口 `[2640, 2880]`；与上表相对边界逐项保持 `+2640 s` 映射。
- 所有 frame/state/object/delta/evidence/speech 时间均已机械换算到完整源时间轴；所有 `source_video_id` 均为 `phy-force-kunge-003`。
- 资产引用：137 次引用、68 个唯一文件；逐一检查均存在且声明 SHA-256 与文件实际摘要一致。
- surface/state/delta 状态全为 `needs_review`；未出现 `accepted` 或 `adjudicated`。
- ASR 可追溯性自检：10 条 speech 的索引连续性、原始文本拼接、`relative + 2640` 绝对时间，以及对应 speech evidence 时间均逐条一致。
- canonical payload SHA-256：`2fda01ec90422d4f5675459cc58927996d38715b2680649b64e4f23864107309`，与 JSON 声明一致。
