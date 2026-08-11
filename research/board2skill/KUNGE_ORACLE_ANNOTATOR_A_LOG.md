# 坤哥 Oracle Annotator A 独立标注日志

## 标注身份与状态

- Clip：`tbv2-kg-003-01`
- Annotator：`annotator-a`
- 标注状态：`independent` / `needs_review`
- 非 Gold 状态：没有任何 `accepted` 或 `adjudicated` artifact。
- 源视频：`data/raw/physics/force-pilot/phy-force-kunge-003/source.mp4`
- 源 SHA-256：`e4409e94aab76ed26501ebd24e51b09d3454944a09d4a6b37365a75fb9d080e4`
- 源视频参数：6135.048821 秒，1280×720，30 fps。
- 标注窗口：源视频绝对 `2640–2880 s`；窗口相对 `0–240 s`。
- 板面：`digital_ink`；教师数字墨迹覆盖预置题图，右侧教师画中画不属于板面。
- 输出：`data/board2skill/oracle-pilot/tbv2-kg-003-01/annotator-a.json`

## 独立性与语义边界

- 第一遍视觉标注只查看指定源视频与本次自行抽取的帧；没有查看其他坤哥 annotator 文件、未来窗口或模型蒸馏输出。
- 视觉事件边界在接触任何 ASR 前冻结。冻结后只确认本 clip 的 `asr/` 目录存在，没有读取其内容，也没有据此修改边界或补写语义。
- `speech=[]`、`learner_observations=[]`；所有 pedagogical role、teacher intent、learning check、remediation、learner effect 均为 `unknown` 或空。
- 可直接从墨迹辨认的公式/符号仅作为 BoardObject 的人工视觉转写，不作为话语、教学作用或学习效果证据。

## 抽帧与视觉复核

- 1 fps：完整生成相对 `0–239 s` 的 240 张总览帧，生成 8 张每张 30 秒的 1 fps 接触表，并逐表视觉核验。
- 4 fps：对候选区间生成 17 张每张 12 秒的边界接触表；另对相对 `196–230 s` 的密集力图书写生成 5 张仅板面区域的放大 4 fps 接触表，并逐表视觉核验。
- Contract evidence：19 张稳定状态帧、18 张 before/after 对比图、18 张粗区域 mask；另有 1 张全事件 QA 对比接触表，不被 bundle 引用。
- 4 fps 边界精度按 0.25 秒量化；短稳定状态也保持 `needs_review`，不提升为 accepted。
- 页面滚动/切换/缩放/工具栏主要出现在相对约 `21–23`、`42–47`、`71–81`、`188–196`、`223–224` 秒；它们不是 ERASE。预置题图、教师画中画、字幕/UI 与指示动作也不计事件。

## 冻结事件

本轮在完整相对 `0–240 s` 窗口内标出 18 个持久教师墨迹事件，均为 `ADD`。没有观察到满足定义且可持久核验的 `ERASE`、`MODIFY` 或 `CONNECT`；力箭头是新图元，不因接触预置物块而改标 CONNECT。

| Delta ID | 相对时间 (s) | 绝对时间 (s) | 操作 | 可观察变化 |
| --- | ---: | ---: | --- | --- |
| `KG003-DELTA-E001` | 10.75–11.25 | 2650.75–2651.25 | ADD | 圈注左侧预置斜面图角标 |
| `KG003-DELTA-E002` | 28.00–35.75 | 2668.00–2675.75 | ADD | 左下方手写题解标题行 |
| `KG003-DELTA-E003` | 86.25–95.75 | 2726.25–2735.75 | ADD | 分隔线及沿斜面方向标题 |
| `KG003-DELTA-E004` | 96.50–104.00 | 2736.50–2744.00 | ADD | 沿斜面方向平衡关系 |
| `KG003-DELTA-E005` | 108.25–113.75 | 2748.25–2753.75 | ADD | 垂直斜面方向标题 |
| `KG003-DELTA-E006` | 120.75–125.50 | 2760.75–2765.50 | ADD | 垂直斜面方向平衡关系 |
| `KG003-DELTA-E007` | 128.75–135.25 | 2768.75–2775.25 | ADD | 摩擦关系式 |
| `KG003-DELTA-E008` | 156.50–163.75 | 2796.50–2803.75 | ADD | 右侧分数计算 |
| `KG003-DELTA-E009` | 164.75–168.75 | 2804.75–2808.75 | ADD | 摩擦系数数值结果 |
| `KG003-DELTA-E010` | 183.25–184.50 | 2823.25–2824.50 | ADD | 题干关键词圈注 |
| `KG003-DELTA-E011` | 198.00–199.50 | 2838.00–2839.50 | ADD | 右侧预置物块图竖直向下箭头 |
| `KG003-DELTA-E012` | 200.75–201.75 | 2840.75–2841.75 | ADD | 右侧预置物块图左上方向箭头 |
| `KG003-DELTA-E013` | 204.00–205.00 | 2844.00–2845.00 | ADD | 右侧预置物块图水平向右箭头 |
| `KG003-DELTA-E014` | 211.00–212.25 | 2851.00–2852.25 | ADD | 右侧预置物块图沿斜面向右上箭头 |
| `KG003-DELTA-E015` | 220.50–221.50 | 2860.50–2861.50 | ADD | 竖直向下箭头的 `mg` 标签 |
| `KG003-DELTA-E016` | 222.00–223.00 | 2862.00–2863.00 | ADD | 左上方向箭头的 `F_N` 标签 |
| `KG003-DELTA-E017` | 225.50–226.50 | 2865.50–2866.50 | ADD | 沿斜面箭头的 `f` 标签 |
| `KG003-DELTA-E018` | 227.00–228.00 | 2867.00–2868.00 | ADD | 水平向右箭头的 `F₂` 标签 |

推荐 Gold-start 子窗相对 `80–240 s`（绝对 `2720–2880 s`）可直接筛选：`KG003-DELTA-E003` 至 `KG003-DELTA-E018`，共 16 个事件。完整标注仍覆盖相对 `0–240 s`，未因推荐子窗重画或删除已冻结边界。

## 自动校验

- `temporal-board-v2` validator：通过，0 errors。
- JSON 解析与结构断言：通过。
- 事件/状态/帧/transition：18 / 19 / 19 / 18。
- 时间检查：所有 contract 时间使用源视频绝对秒，surface、state、frame、delta、evidence 均位于源范围；18 个事件均位于绝对 `2640–2880 s` 窗口。
- 状态检查：surface、19 个 state、18 个 delta、18 个 transition 全为 `needs_review`；delta/transition annotation 全为 `independent`。
- 语义检查：无 SpeechSpan、无 learner observation；role/intent 槽未被填入推断值。
- 引用检查：112 个重复计入的资产引用全部存在，逐引用 SHA-256 与文件内容一致。
- Canonical payload SHA-256：`21176fe9a9d1b137914145d988d51cf34d5052b3635a85177e6a73ade47d8396`。
- `annotator-a.json` 文件 SHA-256：`6b756feafbca5459a9d04761389a2fb55f0accf0afdbdd3dcf83cb185c989ae0`。
- 粗区域 mask 仅支持独立事件定位，已显式标记 `coarse_region_mask`，在 mask-level Gold 使用前仍需人工细化。
