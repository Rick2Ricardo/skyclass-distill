# Temporal Board v2：ERASE / MODIFY 缺口片段筛选

> 复核日期：2026-08-12
> 状态：**scouting 完成；假 MODIFY 与真实 ERASE 已完成独立双标/对齐并待人工签字，ERASE+ADD 困难负例尚未双标；全部未进入 Gold**
> 范围：只复核本地已有视频；不根据语音或烧录字幕单独推断操作类型。
> 权利边界：源视频和派生帧均为 `private_noncommercial_research_only / internal_review_only`，不得提交到公开 Git 或数据发布包。

## 1. 结论

scouting 阶段找到一个视觉上疑似 `MODIFY` 的首选窗，以及两个真实擦除窗。后续 A/B 双标已经否定首选窗的 `MODIFY` 假设：两侧都只支持 `ERASE`、`ADD`、原子 `ERASE+ADD` 或 `unknown`，没有实质 old→new 语义变化。第三个窗继续保留为 `ERASE + ADD` 困难负例，防止把所有“擦后再写”错误合并成 `MODIFY`。

1. **假 MODIFY 困难负例：`phy-force-kunge-005`，`2134–2166 s`（`00:35:34–00:36:06`）**。同一道比例系数单位题中，已有推导被清除，随后同一区域写出以 `k = ...` 开头的新表达式，并出现等号和 `F r²` 的同槽擦除重写。A 标为 `ERASE×1 / ADD×2 / unknown×1`，B 标为 `ERASE×3 / ADD×5`，双方均为 `MODIFY×0`；现已形成 5 组待人工签字的对齐输入。
2. **真实 ERASE 待签：`phy-force-kunge-003`，`4422–4428 s`（`01:13:42–01:13:48`）**。课件底图、题图和左侧已有推导保持不动，右侧红色推导被逐步移除，之后保持为空。A 与严格盲标 B2 都识别为 `ERASE`，现已形成 1 组待签仲裁输入；旧 B 因意外看到 scout 元数据被明确隔离，不参与一致性或 Gold。
3. **困难负例：`phy-force-kunge-005`，`1888–1905 s`（`00:31:28–00:31:45`）**。前一候选式的量纲计算被擦除，随后在同一区域开始计算下一候选式。空间复用不等于语义槽延续，因此应拆为 `ERASE` 和后续 `ADD`，**不得标成 MODIFY**。

本地没有第三位教师，也没有能打破“李永乐 = 实体绿板、坤哥 = 数字墨迹”混杂的交叉组合。四个李永乐实体绿板源的低频全课通览没有发现可信的持久 ERASE/MODIFY；`phy-force-liyongle-003` 清单里原先写的 `modify_motion_condition / modify_resultant_direction`，实际画面是另起新图继续添加，不能据此标 `MODIFY`。这一负结论受抽帧频率限制，不等于证明实体绿板视频绝对没有短暂擦改。

## 2. 实际审计范围与方法

### 2.1 本地源

| source record | teacher | medium | 本地视频 | SHA-256 | Oracle manifest 状态 |
| --- | --- | --- | --- | --- | --- |
| `phy-force-liyongle-001` | `li_yongle` | physical chalkboard | `data/raw/physics/force-pilot/phy-force-liyongle-001/source.mp4` | `f4bcc9e2f509f1f6b94ad69015652dcbbaf8bc8f2337774dd70869c61e40b75e` | 已有 2 个候选窗 |
| `phy-force-liyongle-002` | `li_yongle` | physical chalkboard | `data/raw/physics/force-pilot/phy-force-liyongle-002/source.mp4` | `ee245b5002d12e9d0b7144ec231b934aa6e58c40d914e1f1b884db486b4f42ec` | 已有 2 个候选窗 |
| `phy-force-liyongle-003` | `li_yongle` | physical chalkboard | `data/raw/physics/force-pilot/phy-force-liyongle-003/source.mp4` | `c7e62d680e003d9e5d28305015bd409f9e6e155e67fcaba72b73f9571de39d95` | 已有 1 个候选窗 |
| `phy-force-liyongle-004` | `li_yongle` | physical chalkboard | `data/raw/physics/force-pilot/phy-force-liyongle-004/source.mp4` | `3811c42fb32f36e27754926062a1280b0b576edee91adca0d0a8f9a5362ad6d9` | 已有 1 个候选窗 |
| `phy-force-kunge-003` | `kunge_bilibili` | digital ink over slides | `data/raw/physics/force-pilot/phy-force-kunge-003/source.mp4` | `e4409e94aab76ed26501ebd24e51b09d3454944a09d4a6b37365a75fb9d080e4` | 已有 2 个候选窗；本次新窗在原窗之外 |
| `phy-force-kunge-005` | `kunge_bilibili` | digital ink over slides | `data/raw/physics/force-pilot/phy-force-kunge-005/source.mp4` | `127ed9323274d0dd00f3cc39c4a3b68f3109d74dbfd7fb2d08f87cab008f7241` | 假 MODIFY 已双标/对齐；ERASE+ADD 困难负例待双标 |

### 2.2 复核方式

- 四个实体绿板源先按约 `15–20 s` 采样做全课接触表通览；对 `phy-force-liyongle-003` 的 `690–940 s` 再按 `5 s` 稠密复核。通览只支持“当前采样没有看到持久擦改”的负结论，不能排除发生并在下一采样前完全恢复的短事件。
- 两个数字墨迹源对左侧课件 ROI 做全视频 `2 s` 采样，查找“红色教师墨迹减少而非红色底层内容基本不变”的候选点；随后对高分点按 `0.5–1 s` 逐帧视觉复核。
- 页面切换、滚动、视口改变、工具栏弹出、教师画中画遮挡和旧页面回看全部排除为 `ERASE`。
- `MODIFY` 只在“old 对象稳定存在 → 可见移除/改写 → new 对象稳定存在，且 old/new 能追踪到同一语义槽”时作为候选；仅靠同一空间或烧录字幕不够。
- 未查看模型输出，也没有用 Agent 生成的语义标签代替人工事实判断。

数字墨迹颜色扫描可能漏掉小于 `2 s` 且完全恢复的擦改，也可能因抗锯齿/光标产生伪差分；最终结论来自逐帧视觉复核，而不是颜色阈值分数本身。

## 3. 首选窗：`phy-force-kunge-005 / 2134–2166 s`

### 3.1 可见 before / change / after

- **before（`2135.0 s`）**：题干和选项底图固定；下方已有红色推导，以 `F = ... / r²` 开头，并圈出移项后的分子/分母组成。
- **change（约 `2136.0–2139.0 s`）**：同一课件底图和视口保持不动，已有推导从右向左逐步被移除；不是翻页或滚动。
- **after（约 `2140.5–2165.0 s`）**：教师在同一区域重新写出 `k = Fr² / (...)`，分母使用题干中的两段电流、两段长度增量；新公式在继续写单位之前已保持数秒。

scouting 时，这个窗口看起来满足 old→erase→new，因而被列为 `MODIFY` 候选。逐帧 A/B 双标后，主公式是清空旧草算后新增；后续同槽等号和 `F r²` 前后语义相同，没有可陈述的实质属性或关系变化。因此当前证据不支持 `MODIFY`，只支持 `ERASE / ADD / atomic ERASE+ADD / unknown` 候选；5 组仍须人工签字，不能写 accepted。

### 3.2 ASR、风险与派生证据

- scouting 完成后已用本地 whisper.cpp 生成机器时间戳 ASR 草稿：19 个 segments，文件为 `data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/asr/clip-2134-2166.json`，SHA-256 为 `72a435476427fceb9c23acd01092bed0566387fc64f4c1c6ffab91f358d87d76`。它尚未经过人工校对或语义仲裁，只能辅助定位语音，不能单独把 `MODIFY` 提升为事实。
- 风险：旧推导中个别手写字母可读性一般；`2136.5 s` 仍是擦除中间态；后续单位推导属于同公式的后续注释还是新的 ADD，需在标注规范下统一。
- 首轮建议边界：视觉事件候选 `2134.5–2165.5 s`；实际 event boundary 由两名标注员独立落点，不预先锁死。

本地派生帧位于 ignored 目录：

| phase | local frame | SHA-256 |
| --- | --- | --- |
| before | `data/board2skill/operation-gap-scout/kg005-modify-2135-2166/before-2135.0.jpg` | `05be35492498376c5e4be0b793c9c688f0994dcd4e02f8fe124f83ef4ba9567c` |
| change | `data/board2skill/operation-gap-scout/kg005-modify-2135-2166/change-2136.5.jpg` | `182ac85ad9c9f82337e9e967c2479852efc66c8da95f5451a2d4d0c859ef8d39` |
| after | `data/board2skill/operation-gap-scout/kg005-modify-2135-2166/after-2165.0.jpg` | `664ca7f7378002e60ee2348630f045d0db3914f8fbe1a8d6334122298c0db54d` |

## 4. 次选窗：`phy-force-kunge-003 / 4422–4428 s`

### 4.1 可见 before / change / after

- **before（`4422.0 s`）**：同一水平面受力题、受力箭头、左下两行公式和右侧推导均可见。
- **change（`4424.5 s`）**：右侧红色推导只剩部分字符，左侧题图、受力箭头、左下公式和黑色课件底图保持不动。
- **after（`4426.5 s`）**：右侧推导被清空，保留左侧内容；在随后视口移动前有短暂稳定状态。

两份严格可用标注都把候选主标签设为 `ERASE`，tIoU 为 `0.876788`、region IoU 为 `0.816532`。画面能证明内容被移除，但不能区分教师使用的是橡皮、区域清除还是连续 undo；Gold 不应凭界面外观补写工具类型。before 左删失、事件终点、首个全空帧与稳定门槛仍须人工签字。

### 4.2 ASR、风险与派生证据

- `tbv2-kg-003-01` 的 ASR 只覆盖绝对 `2640–2880 s`，不覆盖本窗。scouting 完成后已为本窗单独生成本地 whisper.cpp 机器草稿：1 个 segment，文件为 `data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/asr/clip-4422-4428.json`，SHA-256 为 `fad1323b0ea85dd9f9b1fdf8e91b2933a28c6308ad7f22584ad96df245d5de03`。片段过短且未人工校对，不能据此判断擦除操作或教学意图。
- 风险：`4428 s` 左右开始视口变化。A 与严格 B2 都在变化前确认了稳定 after，但 before 均被窗口左边界截断，且两侧使用的 minimum-stability 配置不同；因此继续保持 review-only，由人工统一门槛，不能放宽 validator。

| phase | local frame | SHA-256 |
| --- | --- | --- |
| before | `data/board2skill/operation-gap-scout/kg003-erase-4422-4428/before-4422.0.jpg` | `8c91f7191cd84bfe1d0222060528947f950dc522255148d1e9e21755e9f1b75f` |
| change | `data/board2skill/operation-gap-scout/kg003-erase-4422-4428/change-4424.5.jpg` | `b84222abe21f85b91769e82ae0601a847d24276999f499c8d380f15c471affee` |
| after | `data/board2skill/operation-gap-scout/kg003-erase-4422-4428/after-4426.5.jpg` | `08520d5f53484b9d57d2297580e47d85f52db4c6da5875bef152b46a80e6a335` |

## 5. 困难负例：`phy-force-kunge-005 / 1888–1905 s`

### 5.1 为什么不是 MODIFY

- **before（`1891.5 s`）**：在多选题下方已经写出前一个候选式的量纲表达并圈出结果。
- **change（`1894.5 s`）**：该表达被逐步擦除，同一课件底图保持不动。
- **after（`1900.5 s`）**：同一空白区域出现另一组幂次组合。

虽然发生在同一空间且时间相邻，但 printed options 显示前后对应不同候选项；这是“清掉上一项的草算，再算下一项”，不是同一对象的 old→new 修订。推荐拆成一个 `ERASE` 和一个后续 `ADD`，并作为 MODIFY 规则的困难负例。

### 5.2 ASR、风险与派生证据

- scouting 完成后已用本地 whisper.cpp 生成机器时间戳 ASR 草稿：2 个 segments，文件为 `data/board2skill/oracle-pilot/tbv2-kg005-erase-add-hardnegative-1888-1905/asr/clip-1888-1905.json`，SHA-256 为 `c96ffbe3a8077736046d78c8f14c47f41d700c99efb894ba16143bfc678a4a77`。它尚未人工校对；不得仅凭机器转写或烧录字幕推断教师是在“纠错”还是“切换选项”。
- 风险：若标注员只看局部 ROI，容易因空间重用误判为 MODIFY；必须同时保留 printed option anchors 和完整页面状态。

| phase | local frame | SHA-256 |
| --- | --- | --- |
| before | `data/board2skill/operation-gap-scout/kg005-erase-add-hardnegative-1888-1905/before-1891.5.jpg` | `7e5c6ba36efc7c4fddde6b681910ee03cdf00b437f822d5f9006d9398edefe66` |
| change | `data/board2skill/operation-gap-scout/kg005-erase-add-hardnegative-1888-1905/change-1894.5.jpg` | `4ada5eb7695ca81fd35ca674fb863672b6ff70b4784371c35e3b393b8f98a2da` |
| after | `data/board2skill/operation-gap-scout/kg005-erase-add-hardnegative-1888-1905/after-1900.5.jpg` | `397fd7a17396685fbeb32f1bb9d872169ee68b1d0aba0c380aa109d1f5e058d3` |

## 6. 已排除的假阳性与备用窗

### 6.1 明确排除

- `phy-force-liyongle-003 / 702–922 s`：教师在已有密集板面上另画斜面、受力图和合力几何；条件变化由新图表达，没有可见 old 对象被改写。应标 ADD 序列，不是 MODIFY。
- `phy-force-kunge-003 / 2720–2880 s` 与 `3260–3540 s`：当前已选第二教师窗口中的主要变化是数字墨迹 ADD/CONNECT；出现的大面积消失均与页面跳转、滚动或旧页回看同时发生，不能标 ERASE。
- `phy-force-kunge-003 / 3696–3745 s`、`3928 s` 之后的多处页面往返，以及 `phy-force-kunge-005` 多处上下滚动：底层文字/题图位置同时改变，均是 surface/viewport transition。

### 6.2 可作 ERASE 备用、但不优先

- `phy-force-kunge-003 / 3933–3936.5 s`：同一题页上的多组红色力图批注被连续清除；清除后很快滚动，稳定 after 较短。
- `phy-force-kunge-005 / 8068–8075 s`：四个选项图上的红色圈选被逐步移除；内容简单，教学对象价值低于首选窗。
- `phy-force-kunge-005 / 8458.5–8461.0 s`：同页右侧图表注释被清除；紧接视口移动，after 稳定期短。

## 7. 教师—介质混杂：当前是硬缺口

所有本轮正候选都来自 `kunge_bilibili + digital_ink_over_slides`。本地只有两位教师，且教师与介质一一绑定：

| teacher | physical chalkboard | digital ink over slides |
| --- | --- | --- |
| `li_yongle` | 有 | 无 |
| `kunge_bilibili` | 无 | 有 |

因此这些候选可以补 operation 长尾，但不能减轻 teacher/medium confounding。下一批最有价值的数据不是再增加一个只使用第三种独有介质的教师，而是：

1. **第三位教师复用现有介质**：优先再找一位数字墨迹教师，形成“坤哥 vs 新教师，同为 digital ink”；或再找一位实体绿板教师，形成“李永乐 vs 新教师，同为 physical board”。
2. 若资源允许，再补同一教师跨介质的课程；这样才能同时识别 teacher effect 与 medium effect。
3. 新采片段必须在同一 surface 上保留稳定 before、真实 change 和稳定 after；翻页/滚动不得为了类别平衡被包装成 ERASE。
4. MODIFY 应优先检索明确的公式、图形或标签修订：old/new 都可读、对象可追踪、重写间隔短，并保留同期音频供独立 ASR 和人工术语校正。

在获得这种交叉组合之前，正式报告只能称为 `teacher + medium shift`，不能声称单独的跨教师泛化。

## 8. 建议执行顺序

1. 对 `kg005 / 2134–2166 s` 的 5 组假 MODIFY 候选执行人工签字；没有新证据时只能选择 ERASE、ADD、atomic ERASE+ADD 或 unknown，不能回填 MODIFY。
2. 对 `kg003 / 4422–4428 s` 的唯一 A/B2 ERASE 配对统一边界、before 左删失策略、after 稳定起点和 persistence 门槛；旧污染 B 永久排除。
3. 为 `kg005 / 1888–1905 s` 完成两份严格独立标注和对齐，检验是否能稳定拒绝“同空间即 MODIFY”。
4. 并行补采第三位教师、且复用 physical 或 digital 现有介质。未完成交叉介质设计前，不把这些片段用于跨教师结论。
5. 只有人工签字后的 accepted 事件才能进入正式 operation 指标与四组实验。

当前可以声称“ERASE 与假 MODIFY 已有可签字的双标候选”，仍不能声称它们已经成为 Gold。
