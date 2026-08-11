# 李永乐 003 Oracle Pilot 独立标注 B 日志（702–922 秒）

## 1. 产物与盲标声明

- 标注者：Annotator B，独立首轮，未对齐、未仲裁。
- 源视频：`data/raw/physics/force-pilot/phy-force-liyongle-003/source.mp4`。
- 绝对时间窗：`[702.000, 922.000]` 秒；所有 JSON 时间均为源视频绝对秒。
- Schema：`temporal-board-v2`。
- 忽略产物：`data/board2skill/oracle-pilot/tbv2-ly-003-01/annotator-b.json`。
- 独立资产：`data/board2skill/oracle-pilot/tbv2-ly-003-01/b-assets/`。
- 冻结视觉对象、状态、变化、transition 和边界之前，只读取了标注/方法规范、当前 TypeScript contract 与源视频。未读取 annotator-a、A 日志、A 资产、manifest 候选语义描述、operation-gap scout、模型输出或任何 A/B 对齐、仲裁材料。
- 本日志不包含与 A 的比较或一致性结论。

## 2. 证据边界

- 视频为固定机位实体黑板；人工 ROI 为原帧 `y=32..644`，右上水印进入 ignore region，烧录字幕带位于 ROI 外。
- 本窗没有独立 ASR。画面中的烧录字幕没有被转录或反向伪造成 `SpeechSpan`，因此 `speech=[]`。
- `teacher_only_recording=true`；`learner_observations=[]`，所有 `observed_learner_response=null`，没有学生理解、回应或学习效果的伪事实。
- 每个 transition 的 `pedagogical_role`、`teaching_action`、`trigger`、`expected_learner_change`、`learning_check`、`remediation` 均保持 unknown；只保留由画面直接支持的 `board_action`。
- surface、18 个 state、17 个 delta、17 个 transition 全部为 `needs_review`；accepted 数为 0。这里的“独立”是标注阶段，不把它伪装成 contract 的 review status 枚举值。

## 3. 冻结事件清单

本窗冻结 17 个变化，全部为 ADD；没有为了任务名预设类型，而是逐事件检查 before/after 对象成员关系。所有旧对象均继续保留，没有同语义槽 old→new 替换；也没有遮挡解除后持续缺失的对象。

| Delta | 绝对区间（秒） | 新对象/可见变化 | 类型 | 困难负例判据 |
| --- | ---: | --- | --- | --- |
| 01 | 702.05–706.10 | 既有第 2 条文字行右侧的窗口内续写笔画 | ADD | 左截断；旧文字对象保留，续写作为新增后缀，不是替换 |
| 02 | 710.40–716.70 | 第 3 条文字“求力的合成” | ADD | 空白处新文字 |
| 03 | 720.30–725.80 | 第 4 条公式 `F合=ma` | ADD | 新公式行，未替换上方文字 |
| 04 | 730.20–738.80 | 第一幅斜面、小球和角标示意图 | ADD | 空白处多笔新图，旧方法列表保留 |
| 05 | 740.30–743.00 | 第一幅图下方问题行起始片段 | ADD | 文字起始片段是独立新增 |
| 06 | 744.20–747.00 | 第一幅图左上侧短文字标记 | ADD | 新位置短标记 |
| 07 | 748.20–771.50 | 第一幅图下方问题文字的后续内容 | ADD | 先前问题片段保留，继续添加不构成 MODIFY |
| 08 | 782.20–784.80 | 第一幅图小球处向下的 `mg` 箭头与标注 | ADD | 在既有图上增加新受力对象，图形本体保留 |
| 09 | 785.40–788.30 | 第一幅图小球处 `N` 箭头与标注 | ADD | 新受力对象，非对 `mg` 或斜面图的替换 |
| 10 | 802.20–808.80 | 第一幅图上的红色 `F合` 方向箭头与标注 | ADD | 叠加新箭头，白色受力箭头持续存在 |
| 11 | 841.00–853.70 | 公式 `F合=mg sinθ=ma` | ADD | 第一幅图右侧新公式行 |
| 12 | 854.40–858.80 | 结论 `a=g sinθ` | ADD | 在上一公式下方新增结论，不覆盖旧公式 |
| 13 | 884.00–889.00 | 右下空白区域的第二幅斜面小球图 | ADD | 与第一幅图语义相近但空间分离，第一幅图仍在，不能判 MODIFY |
| 14 | 892.40–894.30 | 第二幅图小球处向下的 `mg` 箭头与标注 | ADD | 在第二幅新图上增加受力对象 |
| 15 | 894.80–896.20 | 第二幅图小球处 `N` 箭头与标注 | ADD | 新受力对象，短稳定间隔已保留为 needs_review |
| 16 | 904.10–909.20 | 第二幅图小球处红色水平向右箭头 | ADD | 新箭头，既有白色箭头和图形均保留 |
| 17 | 917.80–919.30 | 第二幅图斜面底角红色 `θ` 标记 | ADD | 新角标；919.6–922.0 内容稳定 |

操作计数：ADD 17，ERASE 0，MODIFY 0，CONNECT 0，MOVE 0，UNKNOWN 0。

## 4. 对 MODIFY / ERASE / CONNECT 的排除

- MODIFY：contract 要求 affected 同时包含仅存在于 before 的旧对象、仅存在于 after 的新对象，并显式绑定稳定 `semantic_slot_id`。本窗所有 17 个事件都表现为旧对象继续存在、空间上新增对象，因此没有任何事件满足 old→new 同槽替换。尤其 delta 01 的续写和 delta 13 的第二幅相似图均按 ADD 处理。
- ERASE：没有对象在遮挡解除且区域重新可见后持续缺失；教师身体短时遮挡没有被判成擦除，所以 `erase_evidence` 全为 null。
- CONNECT：新增的受力箭头和角标没有满足“新增 connector + 至少两个 before/after 持续锚点 + 显式双锚关系”的 contract 条件，因此没有误标 CONNECT。

## 5. 产物规模与哈希

| 项目 | 数量/值 |
| --- | ---: |
| Surface | 1 |
| FrameObservation | 37 |
| BoardObject | 20（3 个窗口初始粗粒度对象 + 17 个新增对象） |
| BoardState | 18 |
| BoardDeltaEvent | 17 |
| SpeechSpan | 0 |
| EvidenceRef | 54（37 frame + 17 board_delta） |
| BoardGroundedTransition | 17 |
| LearnerObservation | 0 |
| accepted | 0 |
| 源视频时长 | 986.965 秒 |
| 源视频 SHA-256 | `c7e62d680e003d9e5d28305015bd409f9e6e155e67fcaba72b73f9571de39d95` |
| canonical payload SHA-256 | `44102cb741a5217f664936cff271a2e76e2303af6c38f1f4dbe955042f5db086` |

资产 URI 均为受控相对路径。JSON 引用 37 张原帧、37 张板面裁剪、17 张手工区域矩形 mask 和 17 张 before/after comparison；每一处引用都带实际文件 SHA-256。mask 是保守的手工矩形 union，不声称像素级精确分割。

## 6. 验证结果

- `validateBoardEvidenceBundle`：valid，0 issues。
- canonical payload：重算值与声明值一致。
- 源视频：磁盘重算 SHA-256 与 JSON 声明一致。
- 引用资产：URI 可解析、文件存在、磁盘 SHA-256 与 JSON 声明一致。
- 绝对时间：surface/frame/object/state/delta/evidence/transition 全部位于 `[702, 922]`；帧按绝对时间升序。
- 状态链：每个 delta 均满足 `before.stable_end <= delta.start < delta.end <= after.stable_start`；ADD 对象在 before 不存在、在 after 存在，`first_visible` 位于事件窗内。
- review gate：surface/state/delta/transition 全为 `needs_review`，accepted=0。
- 语音/学生事实：speech=0，learner=0，role/intent 均 unknown。
- mask 区域：17 个 PNG 的非黑像素 bbox 与 JSON 归一化 region 逐项一致。
- 区域差分：每个 comparison 在标注 region 内的 before/after 亮度差 `YAVG` 均大于 0；逐事件为：

| Delta | region-diff YAVG | Delta | region-diff YAVG |
| --- | ---: | --- | ---: |
| 01 | 2.8086 | 10 | 9.17751 |
| 02 | 2.78915 | 11 | 18.8828 |
| 03 | 2.26669 | 12 | 8.77488 |
| 04 | 8.69225 | 13 | 25.2545 |
| 05 | 8.8148 | 14 | 25.6416 |
| 06 | 2.00443 | 15 | 7.43848 |
| 07 | 36.8283 | 16 | 6.3645 |
| 08 | 11.4568 | 17 | 33.8008 |
| 09 | 13.7239 |  |  |

## 7. 复核注意项

- Delta 01 在 702 秒边界处已经处于书写过程中，因此只把边界后可见的续写笔画作为新增对象，并以 `left_censored_at_window_start` 标记；该事件及极短稳定状态不应直接升级为 accepted。
- Delta 05–07 的手写中文无法在不依赖字幕的前提下完整可靠转写，语义文本保持 null；视觉事件不因 OCR 不确定而删除。
- Delta 13 是本窗最重要的 MODIFY 困难负例：第二幅斜面图与第一幅图相似，但空间位置独立、两图同时持续存在，视觉事实只支持 ADD。
- 所有教学角色和意图都等待独立语音证据或后续人工复核，本产物不做推断填充。
