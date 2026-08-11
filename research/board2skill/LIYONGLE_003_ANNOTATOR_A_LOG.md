# 李永乐 003：Annotator A 独立时序板书标注日志

## 任务边界

- bundle：`tbv2-ly-003-01-annotator-a`
- source video：`data/raw/physics/force-pilot/phy-force-liyongle-003/source.mp4`
- `source_video_id`：`phy-force-liyongle-003`
- 完整源视频时窗：`702.000–922.000 s`（11:42–15:22）
- 标注者：`annotator-a`
- 复核状态：全量 `independent` / `needs_review`，无 accepted、无 adjudication
- 隔离约束：本轮未读取任何 ly003 后续 annotator 标注、operation scout 结论或模型蒸馏输出。

## 标注方法

先完整阅读 `DATA_AND_ANNOTATION_SPEC.md` 与 temporal-board-v2 contract，再直接检查源视频。边界先以 1 fps 全窗扫描冻结候选，再以 4 fps 检查开始、结束、遮挡恢复与持久性。所有 contract 时间均为完整源视频绝对秒，不使用窗口相对时间。

本轮实际生成并检查：

- 1 fps 原始总览帧 221 张、总览 contact sheet 9 张；
- 4 fps 边界 contact sheet 17 张、局部放大/补查 contact sheet 45 张；
- contract 引用证据 49 个：17 张稳定态帧、16 张 before/after 对照图、16 张粗区域 mask。

视频含画面内字幕，但没有可用的时间戳 ASR。因此 `speech=[]`、`learner_observations=[]`，speech/role/intent/learner 相关推断均保持空或 unknown。指点、手势、身体遮挡、曝光变化与字幕变化不作为板书事件。

## 冻结的持久变化

| # | 绝对时间（s） | operation | 持久变化 |
|---:|---:|---|---|
| 1 | 710.50–716.00 | ADD | 新增第 3 条“求力的合成” |
| 2 | 720.25–725.25 | ADD | 新增第 4 条公式 `F合=ma` |
| 3 | 730.25–738.25 | ADD | 新增第一幅斜面、小球与底角图示 |
| 4 | 748.25–754.00 | ADD | 新增第一种情形的问题标记并写出下一项序号 |
| 5 | 755.25–771.25 | ADD | 新增第二种斜面运动情形的问题描述 |
| 6 | 782.25–784.75 | ADD | 第一幅图新增重力箭头与 `mg` |
| 7 | 786.00–788.25 | ADD | 第一幅图新增支持力箭头与 `N` |
| 8 | 797.50–809.25 | ADD | 第一幅图新增红色合力作图辅助线、合力箭头与 `F合` |
| 9 | 842.25–849.25 | ADD | 新增 `① F合=mg sinθ` |
| 10 | 852.25–853.75 | ADD | 在既有公式右侧追加 `=ma` |
| 11 | 855.25–858.50 | ADD | 新增 `∴ a=g sinθ` |
| 12 | 884.25–889.25 | ADD | 新增第二幅斜面与小球图示 |
| 13 | 892.25–896.00 | ADD | 第二幅图新增重力、支持力箭头及 `mg`、`N` |
| 14 | 904.25–907.00 | ADD | 第二幅图新增水平向右的红色合力箭头 |
| 15 | 911.00–912.25 | ADD | 第二幅图新增红色合力作图辅助线 |
| 16 | 917.75–918.75 | ADD | 第二幅图底角新增红色 `θ` 标记 |

窗口起点 702 s 时教师已在书写，该动作约 706 s 才结束；由于缺少窗口内的稳定 before state，这段左删失动作只进入基线状态，不创建 delta。

## MODIFY / ERASE 严格判定

本独立标注未发现证据闭合的 MODIFY 或 ERASE。

- `852.25–853.75 s` 是最接近 MODIFY 的候选，但画面清楚显示教师仅在 `① F合=mg sinθ` 右侧追加 `=ma`；旧字迹未删除、未替换，因此按 contract 标为 ADD。它不满足同一语义槽中 old object 退出、new object 进入的闭合条件。
- 全窗没有看到任何已建立对象在清晰、无遮挡的后续稳定态中持续缺失。短时“消失”均可由教师遮挡、取景/曝光或低分辨率解释，故 ERASE 为 0。
- 没有为了 operation-gap 人为补类别；无法闭合 old/new 或擦除证据的候选不标为 MODIFY/ERASE。

## 输出与验证

- 数据：`data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a.json`（按仓库规则 ignored）
- 证据：`data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-a-assets/`
- 源视频 SHA-256：`c7e62d680e003d9e5d28305015bd409f9e6e155e67fcaba72b73f9571de39d95`
- payload SHA-256：`12365c9e8af108ac42387cca954157494f52cc2f1c8d53c0b986f3e99400c50e`
- 数量：17 states、16 deltas、16 transitions、16 objects、33 evidence records；operation 分布为 ADD 16 / MODIFY 0 / ERASE 0。
- temporal-board-v2 contract：`valid: true`，0 issues。
- payload 复算：声明值与 `canonicalBoardEvidencePayload` 的 SHA-256 一致。
- 资产检查：50 个唯一引用资产（含源视频）全部存在，SHA-256 全部匹配。
- 状态检查：surface/state/delta/transition 共 50 个 reviewable records，全部 `needs_review`；delta/transition annotation 全部 `independent`；accepted 为 0。
- diff-check：16 组 before/after 在各自标注区域均有非零像素差；抽样 RGB 平均绝对差范围为 7.82–51.36，阈值 20 以上像素比例范围为 6.45%–68.21%。

结论：该窗口可作为高质量 ADD/持久性负例与“追加不等于修改”的边界案例，但不能为当前 operation gap 提供合格的 MODIFY 或 ERASE 正例。
