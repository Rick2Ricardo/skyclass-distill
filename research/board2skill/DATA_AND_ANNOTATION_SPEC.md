# Board2Skill 数据与标注规范

> 状态：可执行草案（data/annotation work package）
>
> 审计日期：2026-08-09
>
> 适用范围：以时序板书演化作为视觉证据，蒸馏可执行教师能力
> 事实边界：本文把“当前已存在”“人工确认”“计划目标”“待核验”分开；没有声称已经获得任何尚未实施的标注量、一致性或模型结果。

## 0. 执行摘要

当前仓库足以启动 **schema 校准和单课技术 pilot**，不足以支撑“跨教师 Board2Skill”论文结论。

- 当前最可靠的实体黑板样例只有李永乐《整体法与隔离法》一节：794.3 秒、1280×720，6 张抽样画面显示稳定的大板面，并有 345 个带时间戳 ASR 片段；是否全程无相机运动仍需连续检查，且尚无稠密板书状态或 BoardEdit 真值。
- 另有 4 节已抽帧课程属于“数字课件 + 红色手写批注”，共 56 张稀疏关键帧；它们适合测试 schema 的跨媒介适用性，不应与实体黑板混成同一视觉分布。
- `data/raw/physics/force-pilot/` 中还有 5 个未进入上述正式处理链路的力学候选视频，加上已处理的《整体法与隔离法》共 6 个候选；其中 4 个来自李永乐、2 个来自“坤哥物理”。除已处理样例外，其余记录的 `board_observability` 均是 `待人工确认`，不能写成已验证板书数据。
- 当前 `data/` 中的重复导入很多。任何统计、切分和论文表格必须按 `raw_sha256 + source_video_id + course_part` 去重，不能按 job、目录或文件名计数。
- 论文主标注单元应是 `BoardEditEvent`，不是“关键帧”：`BoardStateBefore → Typed Delta → BoardStateAfter`，并绑定话语、教学作用、证据等级和置信度。
- 第一周目标是冻结去重清单、跑通双人独立标注与仲裁、形成一小批可回放的 adjudicated gold；不是训练模型，也不是报告性能。

## 1. 当前数据盘点

### 1.1 计数口径

本次只读审计使用以下口径：

1. **文件路径数**：实际存在的文件数量，只用于存储审计。
2. **唯一媒体内容数**：MP4 的 SHA-256 唯一值；重复导入只算一个媒体内容。
3. **课程单元数**：依据平台 `video_id/cid/part` 和标题判断；同一合集的不同分 P 可以是不同课程单元，但不等于独立教师或独立采集环境。
4. **独立证据数**：同一源视频的转码副本、重复 job、重复抽帧和不同 ASR 版本都不能作为独立证据。

审计结果如下。这里的数字描述当前磁盘，不代表可合法公开或可用于论文训练的数据规模。

| 层级 | 当前事实 | 解释 |
| --- | ---: | --- |
| `data/` 下 MP4 路径 | 29 | 包含研究素材、上传/管线副本和 source-smoke 测试文件 |
| 全部 MP4 唯一 SHA-256 | 23 | source-smoke 中也有独立测试片段 |
| 排除 `data/source-smoke/` 后的 MP4 路径 | 23 | 位于 raw、media、uploads |
| 排除 source-smoke 后的唯一媒体内容 | 18 | 其中 17 个是教学内容单元，1 个是课程讲义介绍；这是内容去重数，不是授权数 |
| 转写 JSON | 15 | 14 个管线转写 JSON + 1 个同课 whisper.cpp 原始 JSON；重复媒体可能有不同转写版本 |
| SRT / TXT | 各 14 | 与管线产物对应 |
| `data/visual/` JPG 路径 | 68 | 其中实体黑板 6 帧被两个分析 job 各保存一次 |
| 唯一 JPG SHA-256 | 62 | 对应 5 个课程画面集合：1 个实体黑板、4 个数字课件 |
| 带 `index.json` 的稀疏关键帧集合 | 4 | 均是北大学长跳跳合集中的数字课件课程；实体黑板 6 帧没有同型 index |

当前可辨认的来源教师键共 4 个：`li_yongle`、`kunge_bilibili`、北大学长跳跳、物理云学习逸迭 Eddie。它们不等于 4 个可用于跨教师评测的已就绪教师：坤哥账号实名未核实，多数 raw 候选没有转写/抽帧，权利状态也没有达到公开数据集条件。

### 1.2 已核验的重复谱系

以下是必须在 manifest 中合并为同一 `resource_content_id` 的重复项；文件不删除，只在逻辑上去重。

| 内容 | SHA-256 前缀 | 重复路径/来源 | 处理规则 |
| --- | --- | --- | --- |
| 李永乐《整体法与隔离法》 | `ee245b50…` | raw 原件、uploads、副本 job `3aaa2eef4e`、成功 job `dd7be5126b`，共 4 个 MP4 | 选 raw `source.mp4` 为内容基准；其余仅登记 lineage，不进入样本计数 |
| 李永乐“人工智能”视频 | `a89de3e9…` | jobs `4f667ea57e` 与 `e78182d1fa` 两份完全相同 MP4；WAV 也相同 | 只算一节；两个 ASR 输出可用于 ASR 稳定性比较，不能作为两课 |
| Eddie《平均速度》 | `a81ca739…` | `media/ecb35282d1/003…` 与本地测试 upload | 只算一个课程单元 |
| Eddie 合集第 1 课 | `cc234433…` | 正式 media 与 `source-smoke/bilibili-current.mp4` | smoke 副本不得进入训练或测试统计 |
| 实体黑板 6 帧 | 6 对完全相同 JPG | `visual/689afd369a/...` 与 `visual/e70eb8385f/...` | 只算 6 张唯一帧，保留两个 job 的 provenance |

还需做近重复检查：同一教师对同一题的重录版、片头片尾裁剪不同的版本、重编码但内容相同的视频不会被 SHA-256 捕获，需用视频指纹、音频指纹和人工核对补充。

### 1.3 按视觉形态分类

| 类别 | 已人工确认的当前素材 | 可用性 | 不能推断的内容 |
| --- | --- | --- | --- |
| 实体绿板/粉笔、教师遮挡 | `phy-force-liyongle-002`《整体法与隔离法》；已有 6 张状态帧 | 最适合首个 BoardEdit pilot；板面大、书写和受力图可读，教师会局部遮挡 | 6 帧不能恢复准确的起笔/落笔、ADD/ERASE 时间、对象生命周期；尚无 gold |
| 数字课件 + 手写批注 | 北大学长跳跳 `质点/参考系/时间与时刻/矢量与标量` 4 课；各 14/20/11/11 张 indexed frames | 可测试 ADD、CONNECT、强调等事件定义；数字背景稳定 | 当前帧由 scene change、transcript cue、periodic 稀疏选出，不能据此断言没有中间擦除/修改 |
| 视觉形态待核 | 其余 5 个 force-pilot raw 候选、Eddie 5 课、李永乐“人工智能/四维空间”等 | 先做人工 triage，再决定是否入队 | 不因标题、教师风格或来源推测为实体黑板/数字板书 |
| source-smoke | 各平台获取链路测试文件 | 仅用于工程烟测 | 不进入 Board2Skill 数据规模、训练或测试 |

实体黑板与数字课件必须保留 `board_mode` 分层。首篇论文若以实体黑板恢复为核心，应把数字课件作为域外/鲁棒性子集；若要联合建模，必须分别报告指标，不能只报混合平均数。

### 1.4 转写与现有分析的边界

- 《整体法与隔离法》的主转写含 345 个时间戳片段，已知有“必修一→BQ1”“合外力→核外力”等 ASR 错误。标注时保留原始 ASR，另存人工修订文本和差异，禁止直接覆盖。
- 数字课件课程已有逐段 ASR 和稀疏 `index.json`，但抽帧策略不是 BoardEdit 候选生成器。
- 现有分析 JSON 已产生 `TeachingTransition` 和视觉观察，可用作 schema 设计参考；为防确认偏差，gold 标注者在第一遍独立标注时不得查看模型生成的 teaching transitions。
- 目前没有 BoardEdit JSONL、对象级轨迹、擦除真值、板面配准真值、双人标注结果或一致性统计。

### 1.5 当前可用性结论

| 研究问题 | 当前能否回答 | 原因 |
| --- | --- | --- |
| 能否在一节固定机位实体黑板课上试做状态恢复？ | 能做 pilot | 有原视频、同步音频/ASR、可读板面和明显累积书写 |
| ADD/ERASE/MODIFY/CONNECT 能否可靠自动识别？ | 尚不能回答 | 无稠密真值、无双人标注、无基线结果 |
| 板书时序是否提升教师能力蒸馏？ | 尚不能回答 | 当前只有单教师正式样例，且没有与 text/static/oracle delta 的配对评测 |
| 能否声称跨教师泛化？ | 不能 | 可比教师、课程和 held-out teacher 数量不足 |
| 能否公开原视频或截图数据集？ | 不能据现有材料确认 | 当前来源多为标准版权/禁止转载；本地研究记录不等于再发布许可 |

## 2. BoardEdit 标注对象与 schema

### 2.1 标注层级

```text
Resource
└── BoardSurface
    ├── BoardState (B_t)
    │   └── BoardObject
    └── BoardEditEvent
        ├── before_state
        ├── typed_delta
        ├── after_state
        ├── aligned_utterance
        ├── pedagogical_role
        └── evidence_and_confidence
```

一个 `BoardEditEvent` 是教师完成一次可解释板书操作的时间区间，不是单帧差分峰值。事件可以包含多笔连续书写；只有在板面形成可稳定辨认的新状态后才闭合。

### 2.2 资源与板面字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `resource_id` | string | 稳定资源 ID，不使用 job ID |
| `resource_content_sha256` | string | canonical MP4 的 SHA-256 |
| `source_video_id` / `course_part` | string/int | 平台原始 ID 与分 P，支持去重 |
| `teacher_id` | string | 内部伪名；展示实名需另行授权 |
| `board_mode` | enum | `physical_chalkboard`, `physical_whiteboard`, `digital_ink`, `slide_only`, `mixed`, `unknown` |
| `surface_id` | string | 一节课多块板/多页画布分别编号 |
| `board_roi` | polygon | 原视频坐标中的板面多边形，坐标归一化到 `[0,1]` |
| `rectification` | object/null | 单应性/配准版本及参数；无配准时明确为 null |
| `camera_regime` | enum | `fixed`, `minor_jitter`, `pan_zoom`, `cut`, `unknown` |
| `rights_status` | enum | `authorized`, `open_license`, `internal_review_only`, `blocked`, `unknown` |

### 2.3 BoardState 与 BoardObject

`BoardState` 保存某一稳定时刻的“可见状态”和“恢复状态”：

- `visible_mask`：该帧直接可见的板书；
- `occlusion_mask`：教师、手、教具、反光等不可判区域；
- `recovered_mask`：算法或标注者利用邻帧恢复的状态；
- `recovery_source_frames`：每个恢复区域所依据的帧；
- `state_observability`：`fully_observed | partially_recovered | unresolved`。

`BoardObject` 最低字段：

```json
{
  "object_id": "O017",
  "object_type": "TEXT|EQUATION|DIAGRAM|GRAPH|OTHER",
  "object_subtype": "text_block|formula|diagram_component|connector|axis|table|highlight|other",
  "region": {"polygon_norm": [[0.1, 0.2], [0.2, 0.2], [0.2, 0.3]]},
  "content_transcription": "N=(M+m)g",
  "content_status": "human_verified|machine_suggested|unreadable|not_applicable",
  "parent_object_id": null,
  "semantic_slot": "incline_example.ground_normal",
  "first_observed_ms": 300000,
  "last_observed_ms": 420000,
  "evidence_frame_ids": ["F@305.2", "F@319.8"]
}
```

公式/文字转写不是事件成立的前置条件：看不清内容但能确认发生了书写变化时，允许 `content_status=unreadable`；不能让 OCR 失败把视觉事件错误删除。

### 2.4 BoardEditEvent 完整 schema

```json
{
  "schema_version": "boardedit-v0.1",
  "event_id": "R001-E0007",
  "resource_id": "R001",
  "surface_id": "S01",
  "time": {
    "start_ms": 301200,
    "end_ms": 309800,
    "stable_before_ms": 300500,
    "stable_after_ms": 311000,
    "boundary_precision": "exact|approximate|interval_only"
  },
  "before_state": {
    "state_id": "B006",
    "frame_refs": ["frame@300500"],
    "observability": "fully_observed|partially_recovered|unresolved"
  },
  "delta": {
    "primary_operation": "ADD|ERASE|MODIFY|CONNECT",
    "atomic_operations": [],
    "target_object_ids": ["O017"],
    "created_object_ids": ["O024"],
    "deleted_object_ids": [],
    "relation": null,
    "region_union_norm": [0.11, 0.31, 0.28, 0.43],
    "change_mask_ref": "annotation://R001-E0007-mask",
    "visibility_confounds": []
  },
  "after_state": {
    "state_id": "B007",
    "frame_refs": ["frame@311000"],
    "observability": "fully_observed|partially_recovered|unresolved"
  },
  "aligned_utterance": {
    "segment_ids": ["asr-129", "asr-130"],
    "start_ms": 298000,
    "end_ms": 314000,
    "asr_raw": "这个是内力我们不用管",
    "text_corrected": "这个是内力，我们不用管",
    "alignment": "explicit_reference|temporal_cooccurrence|inferred|none",
    "alignment_notes": "TBD"
  },
  "pedagogical_role": {
    "primary": "progressive_scaffolding",
    "role_subtype": "derivation",
    "secondary": ["representation_switch"],
    "role_evidence": "teacher_stated|strong_context|weak_inference|unknown",
    "role_notes": "TBD"
  },
  "evidence": {
    "source_frame_ids": ["frame@300500", "frame@305200", "frame@311000"],
    "source_clip": {"start_ms": 296000, "end_ms": 315000},
    "observed_facts": ["新增公式位于斜面图右侧"],
    "inferences": ["用于把整体受力转成代数约束"],
    "confound_flags": ["teacher_partial_occlusion"]
  },
  "confidence": {
    "operation": 0.0,
    "object_identity": 0.0,
    "temporal_boundary": 0.0,
    "utterance_alignment": 0.0,
    "pedagogical_role": 0.0,
    "scale": "0_to_1",
    "calibration_version": "pilot-v0"
  },
  "annotation": {
    "annotator_id": "A02",
    "created_at": "TBD",
    "review_status": "independent|disputed|adjudicated",
    "adjudicator_id": null,
    "notes": ""
  }
}
```

示例中的数值只展示字段格式，不是当前数据的真实标注或模型输出。

### 2.5 教学作用受控词表

标注时使用与方法契约一致的 coarse role；需要更细解释时写入 `role_subtype`。首轮只使用可从视频证据裁决的角色：

| `pedagogical_role.primary` | 可选 `role_subtype` | 操作定义 |
| --- | --- | --- |
| `definition` | `concept`, `boundary`, `symbol` | 首次写出概念、对象边界或符号定义 |
| `progressive_scaffolding` | `derivation`, `diagram_construction`, `case_split`, `visual_scaffolding`, `summary` | 分步推导、建图、分类、显现或汇总；后一步依赖前一步 |
| `representation_switch` | `text_to_formula`, `formula_to_diagram`, `diagram_to_formula`, `other` | 在文字、公式、图形、表格等表征之间显式映射 |
| `comparison` | `contrast`, `parallel_cases`, `boundary_case` | 并列、分栏或建立两种情况对照 |
| `worked_example` | `example_instantiation`, `numeric_substitution`, `solution_step` | 把一般规则落到具体例题、数值或解题步骤 |
| `emphasis` | `circle`, `box`, `underline`, `color`, `spatial_layout` | 用圈、框、下划线、颜色或空间布局强调 |
| `error_correction` | `self_correction`, `misconception`, `counterexample` | 明确修正先前错误、反例或学生常见错误 |
| `check` | `recap_question`, `consistency_check`, `result_check` | 借板书发起检查、验证或回扣；没有可观察检查动作时不标 |
| `other` | `relation_explanation`, `unmapped` | 教学作用明确但不属于以上类别；必须写 notes |
| `unknown` | `unresolved` | 视觉变化明确，但教学功能证据不足；不进入 role 分类指标 |

“预期学习效果”与“真实学习效果”分开。没有学生回应或测验时，只能标 `teacher_intended_effect` 或 `inferred_role`，不能标记为学生已经理解。

### 2.6 与方法/实验契约的显式映射

本文件是标注层，`METHOD_AND_SYSTEM_SPEC.md` 是运行时 contract，`EXPERIMENT_AND_ACCEPTANCE_PLAN.md` 是评测层。三者的适配规则如下，任何实现不得静默改名或丢字段：

| 标注层 | 运行时/实验层 | 映射 |
| --- | --- | --- |
| `ADD/ERASE/MODIFY/CONNECT` | 方法 `add/erase/modify/connect`；实验大写四类 | JSONL 保留大写；contract adapter 转小写；表格展示大写 |
| `object_type=TEXT` | method `BoardObject.kind=text` | 一一映射 |
| `object_type=EQUATION` | method `kind=formula` | `EQUATION → formula`；实验仍显示 EQUATION |
| `object_type=DIAGRAM` | method `kind=diagram/arrow/mark` | 由 `object_subtype` 决定；关系箭头保留 connector subtype |
| `object_type=GRAPH` | method 当前粗 contract 的 `diagram` | adapter 写 `kind=diagram` 并保留 `object_subtype=graph` 扩展字段；评测仍单列 GRAPH |
| `object_type=OTHER` | method `mark/unknown` | 按 subtype 映射；无法映射时 `unknown` 并 `needs_review` |
| 标注时间毫秒 | method `TimeRange` 秒 | adapter 除以 1000；原始毫秒边界保留在 annotation artifact |
| `board_mode=physical_chalkboard/physical_whiteboard/digital_ink` | method `chalkboard/whiteboard/digital_ink` | 去掉 `physical_` 前缀；`slide_only/mixed` 在 fixed-camera MVP 中标 `needs_review/abstained` |
| `fully_observed/partially_recovered/unresolved` | method `accepted/needs_review/abstained` | 只作默认映射；最终 status 还要考虑 registration、persistence 和 uncertainty codes |
| coarse pedagogical role | method `definition/progressive_scaffolding/representation_switch/comparison/worked_example/emphasis/error_correction/check/other` | 一一映射；`unknown` 映射为 `GroundedClaim.value=null, level=unknown` |
| `role_subtype` | 实验首版 6–8 类 coarse role | subtype 不参与首版主分类；pilot 后按 agreement 预注册合并表，测试集冻结后不再改 |

实验文件要求首版 role 最多保留 6–8 个可稳定区分类别，而方法 contract 暂列 9 个 coarse 值。解决方式不是在测试集上挑类别：schema pilot 后依据未仲裁一致性，将低频/低一致性的 `check` 或其他类别按预注册表并入 `other`/上位类；方法 contract 可以保留更丰富值，论文主指标只使用冻结后的 6–8 类映射。

## 3. 四类操作的可执行判定规则

### 3.1 通用前置条件

一个正例必须同时满足：

1. 能找到事件前后的板面状态，或明确标记哪一侧因遮挡无法完全观察；
2. 变化在教师/手离开后仍存在，不是瞬时前景、指示动作、反光或字幕；
3. 变化位于已登记板面/数字画布 ROI 内；
4. 事件边界覆盖从开始操作到新状态稳定的区间，不把每一笔都拆成独立事件；
5. 至少有一段可回放证据 clip，并记录 confound；
6. 无法判断时使用候选状态 `UNCERTAIN`，不强制塞进四类 gold。

稳定状态的操作判据是：在教师离开变化区域后，至少两个采样观察仍一致，或标注者通过连续视频确认状态已经稳定。具体采样间隔在 pilot 后冻结，不能根据测试集调参。

### 3.2 `ADD`

**定义**：一个此前不存在的板书对象或可独立解释的子对象被创建，并在事件后稳定存在。

正例：

- 在空白区域写出新公式 `N=(M+m)g`；
- 在已有坐标轴上新增一条函数曲线；
- 在已有图旁新增第二种情况，用于分类讨论；
- 在数字课件上写下新的手写解释。

反例：

- 教师身体移开后旧内容重新出现：这是 `OCCLUSION_RESOLVED`，不是 ADD；
- 激光笔、手指、鼠标指针短暂停留：不是板书对象；
- 相机平移让画外旧内容进入画面：`CAMERA_CHANGE`；
- 同一次连续书写中逐笔完成一个公式：整体标一个 ADD，不按字符拆分；
- 给两个已有对象补一条关系箭头：优先标 CONNECT。

### 3.3 `ERASE`

**定义**：此前稳定存在的板书对象被教师擦除/删除，且在无遮挡的后续状态中不再存在。

正例：

- 擦掉一整条错误公式；
- 数字画布执行撤销/橡皮操作，使批注持续消失；
- 清除一个图形分支以腾出同一空间写新内容。

反例：

- 教师、手、衣服或教具挡住内容；
- 强光、自动曝光或视频压缩让粉笔暂时不可见；
- 相机裁剪、切镜头或课件换页；课件换页另标 `SURFACE_TRANSITION`，不当成大量 ERASE；
- 内容太淡、后续帧又恢复：标不可判或遮挡，不标 ERASE。

若同一语义槽先擦后写，保留原子 `ERASE + ADD`，事件主标签按 3.4 的 MODIFY 规则处理。

### 3.4 `MODIFY`

**定义**：一个已稳定存在、身份可追踪的对象被实质改写，事件后仍占据同一语义槽或保持对象身份，但内容/条件/结构发生改变。

正例：

- 把 `=` 改成 `≠`；
- 擦掉公式中的一个符号并改写为另一个符号；
- 在已稳定的受力图上改变某个力箭头的方向或标签；
- 对已完成步骤进行明确纠错并在原位重写。

反例：

- 一个公式尚未写完时继续写右半部分：仍是同一 ADD 事件；
- 在已有公式旁新增说明：ADD；
- 只加框、下划线或圈：若不改变原对象内容，标 CONNECT/ADD-highlight，并以教学角色 `attention_emphasis` 解释；
- 相同空间被完全清空，隔很久后写无关内容：两个事件 ERASE 与 ADD，不是 MODIFY。

边界案例采用“稳定状态 + 语义槽”双判据：只有对象曾经稳定、改写前后存在可追踪关系时才标 MODIFY。主事件写 `MODIFY`，`atomic_operations` 记录实际的 erase/add 子过程。

#### 3.4.1 主 Gold 分母与物理擦写轨迹

当前论文主任务统计的是**相邻稳定板书状态之间的原子语义编辑**，不是触控笔或粉笔动作次数。人工裁决必须先比较教师离开变化区域后的稳定 before/after，再使用中间帧解释变化过程：

1. 稳定 before/after 语义完全相同，即使中间发生擦除并重写，也不进入主 Gold 事件分母；review disposition 记为 `not_an_event`，物理 `ERASE → ADD` 轨迹只保留在来源证据中。
2. 稳定 before 中没有该内容、稳定 after 中出现该内容，中间即使经历试写、擦除和重写，主事件仍按最终净变化记一个 `ADD`。主事件起点取**最终存留版本首次出现**的时刻，终点取其稳定完成时刻；早先被擦掉的试写只保留在来源轨迹，不得并入主事件时间。一次连续完成最终对象的笔画不再逐字符拆分。
3. 稳定 before 中存在对象、稳定 after 中持续缺失，且遮挡、视口和片尾右删失均被排除，记 `ERASE`。
4. 稳定 before/after 占据同一可追踪语义槽，但内容、条件、方向或关系发生实质 old→new 变化，记 `MODIFY`，并把可见物理子过程保存在 `atomic_operations` 或来源事件链中。
5. 新标记的意义依赖至少两个已存在锚点并显式建立关系时，记 `CONNECT`；一根具有独立物理含义的新力矢量仍是 `ADD`，不能仅因它画在已有图上而记 `CONNECT`。

该规则冻结主实验的事件分母。若未来研究物理书写动作或编辑手势，必须建立独立的辅助任务、schema 和结果表，不能把动作级计数混入当前 `ADD / ERASE / MODIFY / CONNECT` 主结果。

### 3.5 `CONNECT`

**定义**：新增或修改的标记显式建立至少两个既有对象/区域之间的关系，其意义依赖这些锚点。

正例：

- 在两个既有公式之间画箭头表示推导；
- 用括号/连线把文字条件绑定到图中对象；
- 在既有受力图中补辅助线，连接力与坐标分量；
- 把两个并列案例用双向箭头或对应标记连接。

反例：

- 新画一根物理力矢量，而它本身就是图中新的研究对象：通常为 ADD `diagram_component`；
- 教师用手指从一个对象指向另一个对象：这是 gesture evidence，不是板书 CONNECT；
- 单纯圈出一个词：记录为 highlight，若没有两个锚点不标 CONNECT；
- 装饰性划线、误触笔迹且无可解释关系：`other/uncertain`。

CONNECT 必填 `relation.source_object_ids`、`relation.target_object_ids` 和 `relation_type`；锚点无法识别时不能进入高置信 gold。

### 3.6 非事件/干扰标签

候选生成器可以输出但 gold 主任务不计为四类事件的标签：

- `NO_EDIT`
- `TEACHER_OCCLUSION`
- `GESTURE_ONLY`
- `CAMERA_CHANGE`
- `SURFACE_TRANSITION`
- `SUBTITLE_OR_OVERLAY_CHANGE`
- `LIGHTING_OR_COMPRESSION`
- `UNCERTAIN`

这些负例必须保留，用于测量误报和构建困难样本；不能只标正例。

## 4. 标注工具与工作流

### 4.1 工具选择

优先使用支持视频时间轴、polygon/mask、对象插值、属性和 reviewer workflow 的 **CVAT**。备选为 Label Studio 或 VIA，但无论使用哪个界面，权威格式都是版本化 JSONL，不把工具私有数据库当唯一真值。

AccessMath/LectureMath 的视频标注工具可参考其 keyframe、segment、unique connected component 和 speaker-action 结构，但需要转换层；它没有本项目的中文话语对齐、教学作用和证据置信度字段。

### 4.2 从资源到 gold 的流程

1. **资源登记**：写入 source ID、canonical SHA-256、教师伪名、课程分 P、权利状态、撤回键和 lineage。
2. **逻辑去重**：先做 SHA-256；再做视频/音频指纹和片头片尾近重复审计。重复项只保留 provenance，不分到不同 split。
3. **视觉 triage**：标记 board mode、板面 ROI、机位、遮挡、字幕/水印、画面可读性；`unknown` 不自动入标注队列。
4. **转写冻结**：保存 ASR raw；人工修订另存，保留 segment ID、时间戳和 edit diff。
5. **候选生成**：实体板先用约 1 FPS 作为低成本候选流（与 FCN-LectureNet 默认一致），在差分峰值附近回看连续视频；数字画布同时利用页面/墨迹变化。采样率是候选参数，不是 gold 精度上限。
6. **独立标注**：A、B 两名标注者在不知道对方结果和模型 TeachingTransition 的情况下，分别标事件、对象、before/after、话语和角色。
7. **自动 QA**：检查时间顺序、对象引用、状态闭合、必填证据、mask 边界、重复 event ID、非法标签组合。
8. **分歧对齐**：先按时空重叠匹配事件，再展示差异，不以某位标注者为默认真值。
9. **仲裁**：视觉操作由训练过的仲裁者裁决；教学作用和物理内容由学科教师/教研员复核。仲裁理由写入 ledger。
10. **冻结版本**：发布内部 `boardedit-vX.Y` manifest；冻结后修改必须提升版本，并重跑 leakage/QA。

### 4.3 双人标注范围

- schema pilot：100% 双人独立标注并仲裁。
- 论文 selection/test：100% 双人独立标注并仲裁。
- 论文 train：至少按教师、board mode、四种操作和困难干扰分层抽 20% 双标；如果论文声称“全语料人际一致性”，则必须全量双标，不能用 20% 推广到全量而不说明。
- 所有 pedagogical role 的论文测试项都应由至少一名学科教师参与复核。

### 4.4 一致性指标与匹配协议

事件检测不能只算分类 kappa，因为两人可能标出不同时间段。建议依次报告：

1. **事件匹配**：同一 surface、时间 tIoU ≥ 0.5，且变化区域 IoU ≥ 0.3；空间无法观察时只按时间匹配并单列。
2. **事件检测一致性**：匹配后的 precision/recall/F1 与边界 tIoU。
3. **操作类别**：matched events 上的 Cohen's kappa 或 Krippendorff's alpha。
4. **对象区域**：polygon/mask IoU；对象身份轨迹用 pairwise link F1。
5. **话语对齐**：起止边界误差、ASR segment overlap、alignment 类型 kappa。
6. **教学作用**：主标签 alpha/kappa；多标签 secondary role 用 micro/macro F1 或 Jaccard。
7. **置信度**：标注者置信度分布与仲裁保留率，用于后续校准，不把平均分当正确率。

初始质量 gate（计划值，不是已取得结果）：核心 operation 与 pedagogical role 的 kappa/alpha **最低继续门槛为 ≥ 0.67，目标为 ≥ 0.80**；事件匹配 F1 目标 ≥ 0.80；delta mask 标注者间 median IoU 最低门槛 ≥ 0.75；语音边界 median 绝对误差最低门槛 ≤ 3 秒。未达到最低门槛时先修订定义、补困难例和再标新样本，不能用仲裁后的标签反算“人际一致性”。时空匹配阈值和 gate 在 pilot 后、看论文测试结果前冻结。

### 4.5 仲裁优先级

1. 是否发生真实板书变化；
2. 遮挡/擦除/镜头变化的区分；
3. 事件边界与 before/after 状态；
4. 对象身份和 operation；
5. 话语对齐；
6. 教学作用；
7. 推断性 expected effect。

如果视觉变化可以确定但教学作用不能确定，保留事件并标 `pedagogical_role=unknown`，而不是删除视觉真值。

## 5. Pilot、论文级规模与切分

### 5.1 当前规模与计划规模必须分开

| 阶段 | 当前已存在 | 计划目标（尚未完成） | 允许的主张 |
| --- | --- | --- | --- |
| 第一周 schema calibration | 1 节已处理实体黑板课 + 4 节稀疏数字课件帧 + 未核验 raw 候选 | 形成 30–50 个双标并完成仲裁的事件/困难负例；缺失类别明确记为缺失，不造例 | schema 可操作性、标注耗时与分歧类型 |
| P0 pilot | 尚未建立 | 6–10 个片段、≥3 位教师、100–200 个事件/负例 | 可恢复性与 baseline 冒烟，不作论文泛化结论 |
| 主实验最低规模 | 尚未建立 | 12–20 节、≥3 位教师、3 个数学/物理单元、约 300–600 个 adjudicated BoardEdit events；精确数量由 pilot 事件密度调整 | leave-one-teacher-out 探索、Skill 与 Tutor 主实验 |
| 更强 benchmark 目标 | 尚未建立 | 若资源允许，扩到 ≥30 节、≥6 位教师、≥1,000 个事件，并保留 ≥2 位永久 held-out 教师；最终规模由事件率、类别长尾和功效分析决定 | 更可信的跨教师结论；这是扩展目标，不是最低规模 |

以上均是规划目标，不是仓库当前统计。若 MODIFY/ERASE 在真实课程中非常稀少，应调整任务为长尾检测、分层报告或补充有真实事件的课程，不能人工制造“自然事件”。

### 5.2 推荐切分

主论文采用 **teacher-disjoint**：

- train、selection/validation、test 的 `teacher_id` 不重叠；
- 最低 3 位教师时采用 leave-one-teacher-out 3 折，每折整位教师只进 test；若达到 ≥6 位教师的更强 benchmark，再保留至少 2 位教师作为永久 final test；
- 同一知识点在不同教师中都要有覆盖，避免“教师身份”和“知识点”完全共线；
- board mode 分层报告。若 held-out 教师恰好也是唯一的数字课件教师，结论只能称为 teacher+domain shift，不能归因于单独的教师泛化；
- 三教师 leave-one-teacher-out 只能支撑最低规模的探索性跨教师证据；结论必须明确教师数量和置信区间，不能外推到广泛教师群体。

### 5.3 泄漏检查清单

冻结 split 前必须执行：

- MP4/audio SHA-256 精确重复；
- 视频指纹和音频指纹近重复；
- 帧 pHash/embedding 近重复，防止同一片段不同抽帧跨 split；
- source URL、BVID/CID、分 P、course collection 和原始题目 ID 分组；
- 同一教师的重录版、剪辑版、合集转载全部归到同一 teacher/source group；
- transcript n-gram 与题面相似度，识别同题、模板题和逐字复讲；
- 同一 `problem_id` 不跨 train/test；若专门测试同题跨教师，必须单列该 protocol，不能与 unseen-problem 混报；
- 模型生成的旧 TeachingTransition/Skill 不进入 gold 标注界面；
- AccessMath/LectureMath 仅作低层预训练或外部基线时，记录使用的 split、预训练权重和重叠审计；
- test 不参与 ontology、提示词、采样率、阈值或置信度校准。

每个 release 生成 leakage report；发现重复时移动逻辑 split，不删除源文件，并提升 manifest 版本。

## 6. 合法使用、隐私与派生物发布

### 6.1 当前项目边界

本仓库的既有调查将当前试点限定为：官方公开来源、非商业内部研究、原视频不入 Git/不公开、不绕过登录/DRM/付费限制。`force-pilot` source records 还明确标有 `private_noncommercial_research_only`，多个页面注明“未经作者授权，禁止转载”。

这是一项项目内部风险控制，不等于已经获得“训练、论文截图、数据集再发布或商业使用”的授权。任何对外发布前必须核验权利主体和授权范围；本文不是法律意见。

### 6.2 资源权利字段

每个资源必须记录：

- 视频、板书/课件、题目、插图、字体、音乐各自权利主体；
- source URL、访问日期、许可文本快照/版本；
- 允许的动作：本地存储、转写、抽帧、标注、模型输入、权重训练、合作方访问、论文展示、数据/派生物公开；
- 商业/非商业、地域、期限、署名要求；
- 教师姓名、声音、肖像和“教师风格”是否允许展示；
- `permission_record_id` 与撤回期限；
- 学生/第三方是否出镜，是否有合法同意。

`rights_status=unknown/blocked` 的资源不得进入公开 release；能否进入内部实验须由项目的许可审查决定，不能由工程代码默认放行。

### 6.3 隐私最小化

- 默认只研究板书与教学动作，不做声纹、脸识别、音色克隆或教师人格模仿。
- 有学生姓名、脸、声音、作业或账号信息时，优先排除该片段；确需使用则取得同意并做去标识化。
- annotation release 使用教师伪名、资源匿名 ID；真实身份映射置于受控权限表。
- 标注员只访问任务所需 clip，不默认开放完整课程库；保留访问日志。
- 论文图先裁到板面并去除人脸、弹幕、账号与无关水印；裁剪和模糊不自动消除版权问题，仍需展示许可。

### 6.4 原视频不能公开时的派生物策略

按权利审查从强到弱选择：

1. **获授权公开**：发布视频/帧、mask、状态和事件 JSONL，并附许可和撤回机制。
2. **受控访问**：研究申请、数据使用协议、只读环境和访问日志。
3. **评测服务器**：研究者提交预测，本项目在私有 test 上计算指标，只返回聚合结果。
4. **不可公开原图的 annotation-only**：发布 schema、伪名 ID、相对时间、归一化区域、操作/关系图和统计；是否构成可发布派生物仍需权利人同意。
5. **最小复现包**：发布代码、标注手册、合成/自录开放样例、manifest 哈希和评测脚本，不发布受限媒体、逐字稿或可还原板书。

板书二值 mask、OCR 文本、公式转写、事件图和短引文仍可能包含受保护表达，不能因为“是派生物”就默认自由发布。公开前逐项审查，不把平台“可观看/可下载”解释为再利用许可。

### 6.5 撤回与级联处理

以 `teacher_id/resource_id` 为撤回键，记录 raw、音频、帧、ASR、标注、缓存、训练队列、权重版本和论文素材的 lineage。收到有效撤回后，按约定范围级联删除或隔离，并记录不可逆聚合统计是否可保留。任何新用途（商业化、在线进化、展示教师身份）重新征得许可。

## 7. AccessMath / LectureMath 可复用资源与限制

### 7.1 AccessMath

作者论文报告的 AccessMath/ICDAR 2017 数据是固定机位、1920×1080、板面为画面主要元素的线性代数白板课：12 个视频、约 10 小时，5 个训练、7 个测试；4 名研究生标注，每视频报告约 12–15 小时标注工作，包含理想分段、关键帧、背景对象、唯一内容元素和像素级二值化。可参考：

- [Whiteboard Video Summarization via Spatio-Temporal Conflict Minimization（作者 PDF）](https://www.cs.rit.edu/~rlaz/files/Kenny_ICDAR_2017.pdf)
- [作者项目页：AccessMath / LectureMath](https://kdavila.com/)

可复用：

- 固定机位白板的背景去除、二值化、稳定 connected components、时空冲突和摘要基线；
- keyframe/segment/unique content 的标注思路；
- 作为低层板书恢复的外部域测试或预训练来源（严格沿用官方 split）。

限制：

- 任务目标是内容提取/摘要，不包含本项目的中文话语对齐、BoardEdit 四类语义和 pedagogical role；
- 线性代数白板与中文高中物理绿板、数字课件存在明显领域差异；
- 不能用它替代本项目的跨教师、跨知识点和 Skill 下游评测；
- 论文称数据/工具公开，但具体下载物的许可与视频再发布条件仍需逐项核验。

### 7.2 LectureMath / FCN-LectureNet

[官方 LectureMath GitHub](https://github.com/kdavila/lecturemath) 提供 FCN-LectureNet 代码和 release。README 说明：

- LectureMath 元数据包含 34 个视频；
- 默认 1 FPS 抽帧；
- 模型包含背景估计、文本 mask、二值化分支；
- stable CC/tracklet 表示内容生命周期，并支持 deletion-event 分段；
- release annotation 包含 keyframes、binary、portions、segments、unique CC groups 与 speaker actions；
- README 明确警告 speaker polygon points 没有正确设置，应忽略；
- 仓库代码的顶层许可证是 MIT。

可复用方式：

1. 将 FCN-LectureNet、均匀抽帧和时空冲突法作为低层恢复/摘要基线；
2. 复用 annotation tool 的视频对象与时间段交互，不直接复用其 schema；
3. 用 LectureMath mask/tracklet 预训练板书视觉编码器，再在本项目数据上适配；
4. 单独报告外部数据和本地数据结果，不把两个数据集的标注定义混算。

限制与许可：

- MIT 明确覆盖仓库 software，不应自动推定 Dropbox annotation、模型、原视频或第三方内容具有同样许可；使用前查看数据包内 LICENSE/README 和原始视频条款。
- FCN-LectureNet 已处理稳定 CC、书写/删除和摘要，因此本项目不能把“恢复干净板书/检测删除”单独当新任务；它更适合作为 Board2Skill 的低层对照。
- 其目标指标主要是二值内容与摘要覆盖，不验证教师能力蒸馏，不能作为 pedagogical-role 或 Skill 迁移 gold。

## 8. 一周启动队列

### Day 1：冻结数据谱系

- 生成只读 manifest：canonical path、SHA-256、source ID、teacher ID、course part、rights status、duplicate-of。
- 把已知 4 组媒体重复和 6 对重复帧并入 lineage；不删除、不移动文件。
- 将 source-smoke 标为 engineering-only。

**出口**：任何人都能从 manifest 解释“29 个 MP4 路径为何不是 29 节独立课”。

### Day 2：视觉与权利 triage

- 以统一时间点人工查看 6 个 force-pilot 视频，填写 board mode、ROI、机位、遮挡、可读性和权利状态。
- 已确认的《整体法与隔离法》作为实体黑板 canonical pilot。
- `kunge-003` 作为同知识点第二教师候选；若板面不可观察，记录失败原因，不静默换样本。
- 数字课件 `时间与时刻`、`矢量与标量` 只作为 schema stress cases。

**出口**：至少一个实体黑板队列和一个数字墨迹队列；其余仍可为 `unknown/blocked`。

### Day 3：标注工程与手册校准

- 在 CVAT 建立 surface、object、event、negative confound 和 role 属性。
- 从实体黑板与数字课件分别选连续片段，A/B 独立试标。
- 标注者只看原视频/ASR，不看旧的模型 TeachingTransition。

**出口**：JSONL 转换能通过 schema、引用和时间顺序检查。

### Day 4：第一轮仲裁

- 逐项记录 ADD/ERASE/MODIFY/CONNECT 与遮挡、换页的分歧。
- 修订规则和正反例；不计算仲裁后 kappa 代替原始一致性。
- 若真实样本未出现某类操作，明确写“未观察到”，不造正例。

### Day 5：盲标新样本

- 目标形成 30–50 个新的双标 event candidates/negatives，并完成事件匹配。
- 计算 event F1/tIoU、operation/role kappa 或 alpha、对象 IoU；全部标为 pilot 结果，不写成模型性能。

### Day 6：学科与证据审计

- 物理教师/教研员检查公式、受力图、教学作用和“观察/推断”边界。
- 抽查 ASR raw 与 corrected diff，保证每个 role 可回放。
- 标记低置信、不可见和需更多未来帧恢复的困难事件。

### Day 7：冻结 `boardedit-pilot-v0`

- 冻结 schema、手册、manifest、adjudication ledger、agreement report、类分布和缺失类别。
- 决定是否进入 12–20 课算法 pilot；不满足 gate 时回到 schema/数据选择，不提前训练。

## 9. 验收门槛

第一周通过必须同时满足：

### 9.1 数据与权利

- [ ] 所有入队资源有 canonical SHA-256、source ID、teacher ID、course part、board mode、rights status 和 withdrawal key。
- [ ] 已知重复没有跨 annotation unit 或 split 重复计数。
- [ ] source-smoke、失败 job 和课程介绍不混入教学样本统计。
- [ ] `unknown/blocked` 权利状态不会进入公开 release；内部使用有明确审查记录。

### 9.2 Schema 完整性

- [ ] 每个 gold event 有 before、delta、after、time interval、region/object、operation、source clip、utterance alignment、pedagogical role、evidence、confidence。
- [ ] observed facts、teacher-stated intent、annotator inference 和 validated outcome 分字段保存。
- [ ] 擦除与遮挡、换页、相机变化有困难负例；无法判断的样本没有被强制赋四类标签。
- [ ] MODIFY 只发生在已稳定对象上；CONNECT 有可追踪锚点。

### 9.3 标注质量

- [ ] pilot 样本 100% 双人独立标注，原始标注和仲裁结果都保留。
- [ ] 事件匹配、分类、对象、话语和角色一致性均有未仲裁统计。
- [ ] 继续门槛：operation/role kappa 或 alpha ≥ 0.67、mask median IoU ≥ 0.75、语音边界 median 误差 ≤ 3 秒；目标：event match F1 ≥ 0.80、operation/role kappa 或 alpha ≥ 0.80。未达最低门槛则修订后盲标新样本。
- [ ] 所有争议 gold 已有仲裁人和理由；不以大模型自动裁决最终真值。
- [ ] 物理内容与教学作用经过学科复核。

### 9.4 论文可用性

- [ ] split 按教师隔离，并通过精确/近重复、同题和合集泄漏检查。
- [ ] 类别缺失与长尾如实报告，不用合成事件冒充自然课堂事件。
- [ ] 当前数据只支持的 claim 与禁止 claim 有书面记录。
- [ ] 没有生成或填入虚构的性能、一致性、标注量、学习增益或跨教师结论。

## 10. 风险登记与停机条件

| 风险 | 当前证据 | 修复或停机条件 |
| --- | --- | --- |
| 单课/单教师假象 | 正式实体黑板样例只有一节 | 未达到至少 3 教师前只做 pilot；最低规模只做 3 折 leave-one-teacher-out，达到 ≥6 教师后再保留 ≥2 位永久 held-out test 教师 |
| 低频 ERASE/MODIFY | 当前 6 帧无法判断事件率 | 稠密标注后若事件极少，收缩标签/改为长尾分析，不人为平衡真实 test |
| 遮挡被误判为擦除 | 教师频繁站在板前 | 强制 occlusion mask、未来帧证据和困难负例；无法恢复标 unresolved |
| 数字课件与实体黑板混域 | 当前两种视觉形态都存在 | 分层训练/报告；首篇方法明确主域 |
| ASR/公式错误污染 role | 已观察到物理术语错写 | raw/corrected 双轨、学科复核、公式单独校验 |
| 旧模型分析污染 gold | 已有 TeachingTransition/Skill | 首轮标注盲化，模型产物只在 gold 冻结后用于对照 |
| 重复导入导致泄漏 | 至少 4 组媒体精确重复 | manifest 去重、内容 group split、release leakage report |
| 数据许可不足 | 多来源标注禁止转载/内部研究 | 原视频不公开；优先授权、自录/OER；不满足论文展示/训练许可则停用该资源 |
| 标注 ontology 不稳定 | 尚无双标结果 | pilot gate 未过不扩规模、不训练主模型 |

## 11. No-fabrication 状态

本文没有生成实验结果。所有“一周 30–50 个事件/负例、P0 的 100–200、主实验 12–20 课/300–600 事件、更强 benchmark ≥30 课/≥6 教师/≥1,000 事件、一致性阈值”等数字均是 **待执行的规划目标或 gate**，不是当前数据事实。当前可核验事实仅来自本地文件、内容哈希、现有 source/job/index/ASR/notes，以及 AccessMath/LectureMath 作者论文和官方代码仓库。任何实际规模、类分布、一致性、算法指标和 Skill 增益必须由后续真实标注与实验填写。
