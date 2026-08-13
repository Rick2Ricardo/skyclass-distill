# Board2Skill 实验与验收计划

> 状态：实验设计稿；尚未运行本文定义的实验。所有结果均为 `TBD`。
>
> 设计日期：2026-08-09。目标范围是固定或轻微运动机位、板书占主导的 K12 数学/物理课堂视频。本文不主张通用课堂视频理解、任意镜头下的完美清板，也不把写入/擦除检测本身作为新颖性。

## 0. 证据边界与论文定位

现有工作已经覆盖板书二值化、内容区域或连通域跨帧跟踪、教师遮挡恢复、书写/擦除事件、时空冲突分段和关键板书合成。最接近的视觉先例包括 [Whiteboard Video Summarization via Spatio-Temporal Conflict Minimization](https://www.cs.rit.edu/~rlaz/files/Kenny_ICDAR_2017.pdf)、[Automated Whiteboard Lecture Video Summarization by Content Region Detection and Representation](https://par.nsf.gov/servlets/purl/10292303) 和 [FCN-LectureNet](https://ieeexplore.ieee.org/document/9494351/)。[KCVR](https://aclanthology.org/2026.acl-long.414/) 又已覆盖 transcript、抽样黑板帧、教学阶段和知识规划的联合建模。因此，本项目的证据包不得把以下内容单独写成主要贡献：

- 从固定机位视频恢复干净板书；
- 检测内容写入、擦除、增长或消失；
- 按板书变化分段或选关键帧；
- 泛化地声称“黑板与语音联合有助于教学理解”。

本文拟检验的缺口是：能否把板书变化表示成具有内容、顺序、语音证据和教学功能的原子编辑事件，并证明这种中间表示对教学 Skill 蒸馏和 Tutor 执行具有独立价值。

### 0.1 任务表示

每个 gold 或预测事件定义为：

```text
e_i = (t_start, t_end,
       BoardStateBefore,
       BoardDelta[type, mask, object_type, content],
       BoardStateAfter,
       aligned_utterance,
       pedagogical_role,
       provenance,
       confidence)
```

首版 `BoardDelta.type` 固定为 `ADD / ERASE / MODIFY / CONNECT`；`object_type` 固定为 `TEXT / EQUATION / DIAGRAM / GRAPH / OTHER`。`pedagogical_role` 的候选本体在试标后冻结，首版最多保留 6–8 个可稳定区分的类别，例如定义引入、推导步骤、例题实例化、关系说明、对比/强调、纠错和总结。类别不能在看过测试结果后增删。

### 0.2 单一主张

> **在固定或轻微运动机位、板书占主导的 K12 数学/物理课堂视频上，显式重建并以教师话语和教学功能约束原子级语义板书编辑，能够在匹配模型与推理预算下，产生比 transcript、静态/最终板书、均匀抽帧、原始视频 VLM 和传统板书提取更忠实、证据更可追溯的教学 Skill，并在板书依赖的 Tutor 任务上带来可重复的性能收益。**

该主张只涉及教学 Skill 忠实度和 Tutor 任务表现；没有真实学生随机对照实验时，不声称改善真实学习效果。

### 0.3 可检验子主张

- **SC1：可恢复性。** 完整方法能在 teacher-held-out 视频上可靠恢复编辑边界、类型、空间区域、状态顺序和语音对齐，并优于简单帧差与可运行的 legacy board extraction。
- **SC2：Skill 忠实度。** 在相同 distiller、文本预算和视觉预算下，显式 predicted delta 产生的 Skill 比 transcript-only、static/final board、uniform frames 和 raw-video VLM 具有更高的编辑覆盖、证据落地精度、时序一致性和更低的无证据陈述率。
- **SC3：下游价值。** 在相同 Tutor backbone、最大上下文、输出长度、工具权限和采样协议下，完整方法在板书依赖的诊断、下一教学动作、补救和近迁移任务上优于最强非 oracle 基线；在板书无关任务上不产生实质退化。
- **SC4：机制与边界。** typed delta、语音对齐和 pedagogical role 各自提供可测的独立增益；收益在未见教师和预先定义的轻中度遮挡、ASR 噪声与分辨率下降下仍然存在，但不外推到剧烈镜头运动或不可读板书。

## 1. Claim–Evidence Matrix

| Claim | 审稿人问题 | 必需证据 | 数据/切分 | 关键基线 | 主指标 | 可否证条件 | 结果 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SC1 可恢复性 | 是真正恢复编辑，还是做了平滑帧差/关键帧选择？ | 人工逐事件 gold；状态、事件、类型、掩膜、顺序、语音对齐的分层评测；遮挡区域单独报告 | Board2Skill-Gold；teacher-held-out 为主测试 | Frame Difference、Legacy Board Extraction、Full、Oracle Delta | Boundary F1@3s、Delta Type Macro-F1、Delta Mask mIoU、State Foreground F1、Alignment Recall@1 | Full 未同时超过简单帧差和可运行 legacy，或只在 seen-teacher 有效 | TBD | planned |
| SC2 Skill 忠实度 | 更好的 Skill 是否只是更多 token 或更长提示？ | 同一 distiller、预算配平的配对生成；专家盲评与自动可审计指标；gold delta 上限 | 同一测试事件派生的 Skill pairs；按视频/教师聚类 | Transcript Only、Static/Final、Uniform Frames、Raw Video VLM、Legacy、Oracle、Full | Evidence F1、Edit Coverage、Temporal Fidelity、Unsupported Claim Rate | Full 对最强非 oracle 的主要忠实度指标无预注册优势 | TBD | planned |
| SC3 Tutor 价值 | 表示更准是否真正影响 Tutor，而非只让摘要更漂亮？ | 板书依赖/无关任务分层；同一 Tutor backbone；配对多轮 episode；客观答案与专家 rubric | 冻结的 Tutor 场景集；unseen-teacher、unseen-lesson | Base Tutor 加七种输入/Skill 条件 | Board-dependent Task Success、Diagnosis Accuracy、Remediation Success、Near-transfer Accuracy、Leakage Rate | Full 在板书依赖主指标上不优于最强非 oracle，或以泄露答案/更高预算换取增益 | TBD | planned |
| SC4 机制与边界 | 哪个模块有效，是否只适配一个教师或高画质样本？ | 机制消融、leave-one-teacher-out、预定义噪声分桶、自然难例和失败案例 | Board2Skill-Gold + stress variants | Full 与模块消融 | 各主指标的配对差、Worst-group、性能下降 | typed delta、对齐、教学角色均无可测贡献，或未见教师收益消失 | TBD | planned |

证据强度顺序固定为：先验证标注与现象存在，再验证内在恢复，再验证 Skill 忠实度，最后验证 Tutor 价值。不能用 Tutor 的单个漂亮案例反推板书恢复正确，也不能用内在指标替代下游证据。

## 2. 数据集、标注与切分

### 2.1 主数据：Board2Skill-Gold（待构建）

| 阶段 | 视频与教师 | 事件量 | 用途 | 当前状态 |
| --- | --- | ---: | --- | --- |
| Schema pilot | 3–5 个短片段，至少 2 位教师 | 30–50 | 验证事件本体、标注时长与可判定性 | TBD |
| P0 pilot | 6–10 个片段，至少 3 位教师 | 100–200 | 可恢复性和 baseline 冒烟 | TBD |
| 主实验最低规模 | 12–20 节有合法使用边界的视频，至少 3 位教师、3 个物理/数学单元 | 300–600 | teacher-held-out、Skill 和 Tutor 主实验 | TBD |

“视频可访问”不等于“可公开再分发”。正式采集前必须逐项记录来源、使用授权、学生出镜/隐私、是否只发布时间戳与派生标注。无明确再分发权时，公开包只包含合法的派生标注、处理脚本、视频 ID/链接与校验信息，不复制原视频。

每个事件至少标注：

1. `t_start/t_end` 与稳定的 `BoardStateBefore/After` 时间点；
2. ADD/ERASE/MODIFY/CONNECT 类型；
3. delta 区域 mask 或 polygon；
4. TEXT/EQUATION/DIAGRAM/GRAPH/OTHER 对象类型；
5. 可辨认时的文本、公式或图元素；不可辨认时显式标 `illegible/uncertain`；
6. 对齐的 ASR/人工转写 utterance span；
7. pedagogical role；
8. 证据充分性、遮挡程度、镜头运动、板书介质和标注置信度。

### 2.2 标注质量门槛

- 冻结测试集 100% 双人独立标注并由第三方或资深标注者裁决；训练集至少 20% 双标。
- 类别标签用 Krippendorff's α 或 Cohen's κ；最低可继续门槛为 `>= 0.67`，目标为 `>= 0.80`。
- delta mask 的标注者间 median IoU 最低门槛为 `>= 0.75`。
- 语音对齐的标注者间 median 边界绝对误差最低门槛为 `<= 3 s`。
- 若任一主标签未过最低门槛，先合并类别、澄清手册并重标 pilot；不得直接扩大数据。
- 报告每类样本数、缺失/不确定比例、每分钟事件数、标注分钟/视频分钟和裁决率。

上述数值是预先设定的项目验收阈值，不是已有实验结果。

### 2.3 分组切分

- **主切分：Leave-One-Teacher-Out。** 至少 3 位教师时做 3 折；每折整位教师只进入测试，任何同源课程、重剪辑或相邻片段不得进入训练。
- **Unseen-lesson。** 在 seen-teacher 内按整节课分组留出，用于区分教师风格记忆和课程内容迁移。
- **Adjacent-topic transfer。** 只在主数据规模允许时启用；测试题与 Skill 来源知识点相邻但不重合。
- **In-domain diagnostic。** 按视频分组，不做事件级随机切分，只用于诊断上限，不作为泛化主结论。
- **Hard/failure set。** 按预先定义的遮挡、低清、擦写重叠、细小符号和语音滞后规则自动/人工筛入；不能根据模型错误事后挑选后再冒充独立测试集。

测试集在方法调参前冻结。所有来自同一原视频的相邻片段、重编码版本、字幕和衍生帧必须共享 group ID。Skill 模板、Tutor 问题、示例提示和外部知识库均做 n-gram、语义近邻和来源 ID 泄漏检查。

### 2.4 外部资源的限定用途

| 资源 | 可复用内容 | 允许用途 | 不能替代什么 |
| --- | --- | --- | --- |
| [AccessMath / ICDAR 2017 release](https://www.cs.rit.edu/~rlaz/files/Kenny_ICDAR_2017.pdf) | 固定机位白板、内容与冲突分段 | legacy sanity check、代码复现或预训练 | 中文 K12 语义 delta、语音和教学角色 gold |
| [LectureMath / FCN-LectureNet release](https://github.com/kdavila/lecturemath/tree/master/ACCESS2021_release) | 34 个白板/黑板视频的关键帧、二值图、分段、唯一内容单元和 speaker action 标注 | legacy baseline、跨板面外部测试 | 完整 Board2Skill 事件和 Tutor 评测 |
| [AVLectures](https://github.com/Darshansingh11/AVLectures) | transcript、OCR、视频和主题边界 | 无监督预训练、ASR/OCR 外部压力测试 | edit mask、pedagogical role 和 Skill gold |
| [LectureVideoDB](https://cvit.iiit.ac.in/research/projects/cvit-projects/lecturevideodb) | 黑板/白板文字检测识别帧 | OCR/HMER 部件诊断 | 时序状态恢复 |
| [PedagogyBench](https://github.com/Shallcom/PedagogyBench) | 教学理解任务和分段 | 教学角色本体参考、可选外部迁移 | 板书 delta 真值 |

任何外部数据的训练/测试用途都须先核验许可证、原视频可用性和协议兼容性；当前均记为 `TBD`，不得假定全部可下载或可重分发。

## 3. Baseline Matrix

所有条件使用相同的视频/片段边界、ASR 版本、distiller backbone、Tutor backbone、最大上下文、最大输出 token、采样参数和工具权限。视觉输入预算采用“等视觉 token/等图像槽位”主协议，并额外报告真实成本协议。Full 的离线预处理成本必须单列，不能藏在免费缓存中。

| ID | 方法 | Distiller 输入 | 为什么必须包含 | 实现/来源 | 公平性约束 | 可运行状态 |
| --- | --- | --- | --- | --- | --- | --- |
| B0 | Transcript Only | 时间戳 transcript | 检验视觉和时序增量 | 项目现有 ASR/文本流程 | 与其他条件相同文本和输出预算 | yes，需冻结版本 |
| B1 | Static/Final Board | transcript + 每段最终稳定板书；无 delta | 检验最终板书是否已经足够 | 从 gold/预测稳定状态取最后一帧，必须注明来源 | 图像槽位不足时用预注册的填充/截断规则，不得给更多文本 | planned |
| B2 | Uniform Frames | transcript + 均匀抽帧 | 对应当前项目的少量均匀帧范式 | 当前实现可抽 6 帧、分析仅使用前 4 帧；实验需冻结统一帧数 | 与 Full 匹配视觉 token 或图像数；相同分辨率 | partial |
| B3 | Raw Video VLM | transcript + 原始视频片段或原生视频 token | 检验结构化中间表示是否优于直接端到端理解 | 支持原生视频的同级 VLM；模型名待定 | 相同源片段、视觉 token 上限和输出预算；另报真实成本 | unknown |
| B4 | Frame Difference | 配准后相邻帧差、阈值和形态学；无学习 | 最低限度 sanity baseline | 本项目实现 | 参数只在 validation 调整 | planned |
| B5 | Legacy Board Extraction | 传统时空内容跟踪、冲突/删除分段、关键状态 | 检验是否只是重做 AccessMath/FCN-LectureNet | 优先运行公开 release；不兼容时实现公开算法的最接近可审计版本并声明差异 | 相同帧率、分辨率和训练数据；不得使用测试 gold | unknown，P0 必须确认 |
| B6 | Oracle Delta | gold before/delta/after + gold utterance；教学角色分“gold/无 role”两种 oracle | 给出表示和模块误差上限 | Board2Skill-Gold | 仅作上限，不计入可部署方法排名 | planned |
| B7 | Full Board2Skill | predicted before/typed delta/after + aligned utterance + pedagogical role + provenance | 被检验的完整方法 | this work | 与 B0–B5 匹配在线模型和推理预算；单列离线成本 | planned |

Tutor 主实验还需增加 **Base Tutor（无课堂资源、无 Skill）**，用于校准任务难度；它不是蒸馏质量基线。若 B3 无法在同一 backbone 上原生接收视频，则使用两个并列协议：`capability-matched`（允许最强可用视频 VLM）和 `budget-matched`（统一视觉 token）；不能把两个协议的数字混入同一排名。

## 4. 指标与主实验

### 4.1 Intrinsic：板书状态与编辑恢复

| 层级 | 指标 | 定义/报告方式 | 主/辅 |
| --- | --- | --- | --- |
| State | Board Foreground F1、mIoU | 在人工稳定状态上比较板书前景；按视频宏平均 | 主 |
| State | Occluded-region Foreground F1 | 只在教师/手臂遮挡区域评测恢复 | 主诊断 |
| Event | Boundary F1@±1/3/5s | 预测事件中心或边界落入容忍窗；`±3s` 为预注册主指标 | 主 |
| Event | Segment temporal IoU | 事件时间段与 gold 的交并比 | 辅 |
| Delta | Delta Type Macro-F1 | ADD/ERASE/MODIFY/CONNECT 宏平均；同时列每类 | 主 |
| Delta | Delta Mask mIoU / Boundary F1 | 在匹配事件上比较空间区域；未匹配事件计失败 | 主 |
| Content | Object Type Macro-F1 | TEXT/EQUATION/DIAGRAM/GRAPH/OTHER | 辅 |
| Content | Normalized edit distance / structural match | 文字、公式分别报告；图用预冻结元素/边匹配 | P1 |
| Sequence | Event-order Kendall's τ、sequence edit distance | 按视频比较编辑顺序，不跨视频聚合序列 | 主诊断 |
| Alignment | Utterance Recall@1 within ±5s、temporal IoU | top-1 对齐是否命中 gold span；同时报 median boundary error | 主 |
| Role | Pedagogical-role Macro-F1 | 只在 IAA 过门槛的冻结本体上报告 | 主 |
| End-to-end | Tuple Success Rate | 边界、类型、mask、utterance 和 role 同时达预注册阈值的事件比例 | 辅，严格指标 |

SSIM/PSNR 可作为视觉诊断，但不能成为主要指标，因为空白板面会掩盖细小但教学关键的符号错误。所有事件指标同时报告 micro、macro-by-video、macro-by-teacher 和 worst-group。

### 4.2 Skill Fidelity：从事件到可执行教学 Skill

Gold Skill 由学科专家在不看方法身份的条件下，依据相同课堂事件和冻结 schema 编写或裁决。自动指标不能替代专家对“教学动作是否被证据支持”的判断。

Oracle Value Gate 把响应拆为固定、连续的匿名 claim units，并提供固定 eligible evidence/edit/pair units；两名独立评分者逐 claim 判断 supported 与证据子集、逐 edit 判断 coverage、逐 pair 判断顺序。四项指标均由 validator/compiler 推导，不接受评分者自报分母。公共包不含显式私有配对键，但内容仍可能使条件可推断；随机分发与互盲独立会话属于外部流程验收。

| 指标 | 操作化定义 | 评测方式 |
| --- | --- | --- |
| Schema Validity / Field Completeness | 必填字段合法且非占位的比例 | 确定性验证器；不作为充分质量证据 |
| Edit Coverage Recall | gold 中教学相关编辑被 Skill 引用或转化的比例 | 事件 ID 对齐 + 专家裁决 |
| Evidence Grounding Precision / Recall / F1 | Skill 原子主张是否由正确 utterance、delta 和时间戳支持 | 双盲专家标注；按 Skill 宏平均 |
| Temporal Fidelity | Skill 中动作/表征顺序与 gold 编辑顺序的一致性 | Kendall's τ、pairwise order accuracy |
| Semantic Content Fidelity | 公式、图关系、文字与 gold 的一致程度 | 结构匹配 + 专家 rubric |
| Pedagogical-role Agreement | Skill 所述教学功能与 gold role 一致 | Macro-F1 |
| Unsupported Claim Rate | 无任何课堂证据支持的事实性教学动作或学生状态占比 | 专家标注；越低越好 |
| Actionability | 触发、动作、预期回应、检查、补救、拒绝条件是否可执行 | 1–5 冻结 rubric，至少两名盲评者 |
| Provenance Completeness | 可回溯至视频、时间、utterance 和 board event 的原子主张比例 | 确定性审计 |

主忠实度指标预注册为 `Evidence Grounding F1` 和 `Unsupported Claim Rate`；Actionability 只能作为有 IAA 报告的人工辅指标。

### 4.3 下游 Tutor 指标

Tutor 场景分为 `board-dependent` 和 `board-independent`，分类规则在运行前由教师冻结。主结论只基于前者，后者用于检验副作用。

| 指标 | 定义 | 证据类型 |
| --- | --- | --- |
| Board-dependent Task Success | Tutor 是否正确使用板书中的顺序、符号或图关系完成预定义目标 | 可验证答案/结构化 rubric；主指标 |
| Student-state Diagnosis Accuracy | 是否识别冻结场景中的具体错误状态 | gold label；Macro-F1 |
| Next-action Accuracy | 所选教学动作是否属于专家允许动作集合 | set-valued accuracy / Macro-F1 |
| Remediation Success | 首次解释失败后，是否执行不同且适用的补救并使受控学生状态通过检查 | 配对多轮 episode；主指标 |
| Near-transfer Accuracy | 同概念换数字、图形或表征后的客观正确率 | 可执行答案器/教师验证；主指标 |
| Learning-check Completion | 是否真实提出并处理检查，而非只在隐藏结构中生成 | trajectory 审计 |
| Premature Answer Leakage | 在应引导阶段直接泄露完整答案的 episode 比例 | 规则 + 盲审；越低越好 |
| Abstention Accuracy | 无适用 Skill 或证据不足时是否正确拒绝/回退 | gold applicability |
| Board-independent Non-inferiority | 在不需要板书的任务上相对最强基线的变化 | 预注册 `-2` 个百分点非劣界；设计阈值 |

模拟学生只能用于可控机制实验，不能被描述为真实学习增益。P2 若开展真实学生前后测，必须另行完成伦理审查、样本量分析、预注册和参与者同意；该实验不是当前主张成立的前置条件。

## 5. 消融设计

| 变体 | 移除/替换 | 检验机制 | 受影响主指标 | 若无下降的解释与动作 |
| --- | --- | --- | --- | --- |
| Full | 无 | 完整机制 | 全部 | 参考组 |
| w/o Temporal Persistence | 用相邻帧差替代跨帧状态跟踪 | 状态生命周期是否必要 | Boundary F1、Mask mIoU、Skill Temporal Fidelity | 收缩状态恢复机制主张 |
| w/o Occlusion Reconstruction | 不做人物/手臂遮挡区域时序融合 | 遮挡恢复是否产生实际价值 | Occluded-region F1、Edit Coverage | 若总体无影响但难例下降，仅保留为工程模块 |
| Binary Delta | typed delta 改成 changed/unchanged | 编辑类型是否必要 | Type F1、Evidence F1、Tutor Task Success | 若 Tutor 无下降，不把 typed delta 写成核心机制 |
| w/o Semantic Content | 保留 mask/type，不识别公式、文字或图关系 | “语义”而非运动变化是否必要 | Content Fidelity、Tutor Task Success | 失败则论文只能声称时序视觉表示 |
| w/o Speech Alignment | 用固定邻域 transcript 或无对齐 transcript | 精确话语落地是否必要 | Alignment、Grounding F1、Unsupported Rate | 若无下降，删除专门对齐模块 |
| w/o Pedagogical Role | 不预测教学功能 | role 是否帮助 Skill 归纳 | Role F1、Actionability、Next-action Accuracy | 若无下降，不把 role 作为方法贡献 |
| w/o Provenance/Uncertainty | 去除证据链和不确定性字段 | 审计和拒绝机制是否降低幻觉 | Unsupported Rate、Abstention Accuracy | 若无下降，仅作为可解释界面功能 |
| Gold Vision + Predicted Alignment | oracle board delta，预测对齐/role | 隔离语言与教学语义误差 | Skill Fidelity | 判断下一阶段应优化哪一模块 |
| Predicted Vision + Gold Alignment | 预测 delta，oracle utterance/role | 隔离视觉恢复误差 | Skill Fidelity | 同上 |

每个消融只改变一个预定义机制；不得同时减少输入 token、改变 backbone 或放宽输出格式。

## 6. 鲁棒性、失败分析与效率

### 6.1 鲁棒性与压力测试

| 压力条件 | 预定义分桶/扰动 | 主要指标 | 失败阈值/边界 | 结果 |
| --- | --- | --- | --- | --- |
| 教师遮挡 | gold 可见板面遮挡比例：低/中/高；阈值在 pilot 后冻结 | State F1、Mask mIoU、Edit Coverage | 高遮挡允许作为边界，但中遮挡不能完全失效 | TBD |
| ASR 噪声 | 自然 ASR + 受控字/词错误率 10/20/30%；保留时间轴 | Alignment、Grounding F1 | 20% 噪声下仍保留相对最强静态基线的方向性优势 | TBD |
| 分辨率 | 1080p/720p/480p 重编码 | State/Delta/Content 指标 | 480p 可列失败边界；720p 应维持可用 | TBD |
| 镜头运动 | 固定、轻微抖动/缩放、切镜 | Boundary F1、Mask mIoU | 剧烈切镜不在主张内，必须单列失败率 | TBD |
| 板面介质 | 黑板、白板、数字板书 | 每介质主指标与 worst-group | 不得只报告占比最大的介质 | TBD |
| 编辑密度 | 每分钟事件数低/中/高 | Boundary F1、sequence edit distance | 高频擦写为预期难例，需报告而非剔除 | TBD |
| 未见教师 | leave-one-teacher-out | 全部主指标 | 完整方法相对最强非 oracle 的优势方向必须保留 | TBD |
| 未见知识单元 | adjacent-topic | Skill Fidelity、Tutor 指标 | 只在样本量足够时形成结论 | TBD |

所有人工扰动使用固定随机种子并保存生成参数。自然困难样本和合成压力样本分表报告。

### 6.2 失败分类与抽样协议

失败至少按以下互斥主因编码，允许附加次因：

1. **视觉状态：** 配准失败、遮挡误恢复、反光/粉笔弱对比、板面切换；
2. **事件：** 小符号漏检、擦除被当遮挡、多个原子编辑错误合并或拆分；
3. **语义：** 下标/符号误识、公式结构错、图中连线或箭头方向错；
4. **对齐：** 教师先说后写、写后解释、ASR 时间漂移、多人语音；
5. **教学功能：** 板面整理误判为教学动作、一个编辑具有多重功能；
6. **Skill：** 从单个案例过度泛化、证据不足却补写学生状态、顺序丢失；
7. **Tutor：** Skill 路由错误、动作不适用、重复解释、答案泄露、未执行检查。

定性图例必须包含：按固定种子随机抽取的代表成功、每个 hard bucket 的最高损失样本、每类至少一个真实失败。不得只选最好看的案例。报告错误计数、占比、与主指标的关联以及可修复/结构性边界。

### 6.3 效率与可复现性

| 指标 | 单位 | 统计范围 | 结果 |
| --- | --- | --- | --- |
| 离线预处理速度 | video-seconds / wall-second；real-time factor | 配准、分割、跟踪、OCR/HMER、对齐分别与总计 | TBD |
| GPU/CPU 峰值内存 | GB | 每模块和端到端 | TBD |
| 计算量 | GPU-hours、CPU-hours / video-hour | 数据构建与推理分开 | TBD |
| 中间存储 | GB / video-hour | 帧、mask、状态、事件图 | TBD |
| Skill 构建成本 | token、图像/视频 token、货币成本 / video-hour | 每个 baseline 与 Full | TBD |
| Tutor 在线成本 | token、调用数、延迟、货币成本 / episode | 不计已缓存成本与计入摊销成本各一版 | TBD |
| 缓存摊销拐点 | Tutor queries / source video | Full 总成本低于 raw-video 重读的查询数 | TBD |
| 失败/重试率 | % | API、视频解码、视觉回退分别报告 | TBD |

发布时冻结代码提交、模型完整标识、Prompt、解码参数、环境、随机种子、训练/验证/测试 manifest 和失败日志。外部 API 的日期与版本必须记录。

## 7. 公平预算与统计协议

### 7.1 公平比较

1. **同源输入：** 所有条件使用同一视频时间段和同一 ASR 文本；条件差异只来自预注册的视觉/事件表示。
2. **同模型：** 主协议固定一个支持所需模态的 distiller 和一个 Tutor backbone。P1 至少在第二个不同模型家族复现方向，不用第二模型结果替换失败的主协议。
3. **同在线预算：** 匹配最大文本 token、视觉 token/图像槽位、输出 token、温度、最大轮数、工具权限、检索 top-k 和重试次数。
4. **双成本报告：** 一张表严格匹配在线预算；另一张表报告真实 API/算力成本。Full 的离线板书重建成本和 B3 每次重读视频的成本都计入。
5. **Oracle 隔离：** B6 只作误差上限，不参与“最佳可部署方法”显著性比较。
6. **失败透明：** 视频输入被 API 回退到文本、解码失败或超预算时记为失败/回退，不能算作有效多模态结果。
7. **盲评：** 专家和 LLM judge 均看不到方法名；候选顺序随机；LLM judge 只作辅证并以人工一致性校准。

### 7.2 重复、置信区间与检验

- stochastic distillation 和 Tutor 生成每个条件至少运行 3 个预先登记的随机种子；确定性视觉模块无需伪造种子，但必须重复检查环境可复现性。
- 所有方法按同一 `sample × seed` 配对；不得为某方法挑最好 seed。
- 主要置信区间使用按教师/视频分层的 hierarchical cluster bootstrap，报告 95% CI；不能把同一视频内的数百事件当成独立样本。
- 配对二元结果使用 McNemar 或 cluster-aware permutation；连续/比例指标使用配对 cluster bootstrap 或预先指定的混合效应模型；人工 1–5 rubric 使用配对有序检验或 ordinal mixed model。
- 报告绝对差、相对差、95% CI 和效应量，不只报 p 值。
- 四个子主张的主检验采用 Holm 校正；探索性分桶明确标记 exploratory。
- 主测试前基于 pilot 的方差和教师内相关进行功效分析；若样本量不足，只报告估计与 CI，不声称“无差异”。
- 测试集只运行冻结版本。若看过测试结果后改方法，必须创建新版本并使用新留出集或把该结果标为 post hoc。

## 8. P0/P1/P2 实验优先级与 Stop/Go 门槛

### 8.0 最早 Oracle Value Gate（投资决策 pilot）

在实现完整板书恢复算法前，先回答一个更便宜也更根本的问题：**即使直接提供人工 gold delta，时序板书表示是否会让下游 Skill 更忠实？** 如果 oracle 输入都没有价值，继续优化 predicted delta 没有投资依据。

- **数据：**仅使用 Schema pilot 中 30–50 个已完成双标与仲裁的事件，至少覆盖 2 位教师；这些事件此后只进入 train/development，不得进入冻结主测试集。
- **四个条件：**`Transcript Only / Static-Final Board / Uniform Frames / Oracle Delta`。Oracle Delta 使用 gold before/delta/after、delta 类型/区域/内容和 gold utterance span，但**不提供 gold pedagogical role**，避免把目标标签当输入。
- **预算：**四组使用相同 distiller、完整 transcript 范围、Prompt、最大文本/视觉 token、输出 token、温度、随机种子和重试次数。Static/Final、Uniform 与 Oracle 的视觉槽位按同一上限截断；若结构化 delta 文本占用额外 token，必须从相同总上下文预算中扣除。
- **评测：**对配对生成的 Skill 做盲评，主看 `Evidence Grounding F1 / Temporal Fidelity / Edit Coverage Recall / Unsupported Claim Rate`。评审者看不到条件名；每个条件至少使用相同的 3 个预登记随机种子。
- **统计冻结：**按 seed-in-case mean→case macro→video macro→teacher macro 后的 Evidence F1 只选择一次最强非 oracle，tie 顺序为 Static-Final、Uniform、Transcript；同一 arm 用于全部指标和 CI。item 取两评分者等权平均；bootstrap 固定 teacher→video→case→seed、四臂配对、seed/replicates 与 R7。缺失、重复、跨教师/视频混配、少于两教师、每 case 少于三 seeds 或 0 eligible 均 `BLOCKED`，不得产生部分 Go/Stop。
- **性质：**这是是否投入完整恢复算法的内部顺序决策，不是论文主结果，不做 benchmark 排名，不用于最终显著性主张；所有样本、Prompt 调整和阈值选择都标记为 development decisions。

| Condition | Evidence Grounding F1 ↑ | Temporal Fidelity ↑ | Edit Coverage Recall ↑ | Unsupported Claim Rate ↓ | Cost | Decision note |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Transcript Only | TBD | TBD | TBD | TBD | TBD | investment pilot only |
| Static-Final Board | TBD | TBD | TBD | TBD | TBD | investment pilot only |
| Uniform Frames | TBD | TBD | TBD | TBD | TBD | investment pilot only |
| Oracle Delta | TBD | TBD | TBD | TBD | TBD | investment pilot only |

**预先指定的 Go 条件：**Oracle Delta 相对上述 Evidence F1 规则选出的同一个最强非 oracle 条件，在 Evidence Grounding F1、Temporal Fidelity 和 Edit Coverage Recall **三个指标上均绝对提升至少 5 个百分点**，且每个差值的配对 80% bootstrap CI 下界均 `> 0`；同时 Unsupported Claim Rate 的配对点估计不得上升。80% CI 仅用于小样本投资筛选，95% CI 只作描述。

**立即 Stop 条件：**上述三个正向指标中任一个未达到“`+5` 个百分点且 80% CI 下界 `>0`”，或 Oracle Delta 的 Unsupported Claim Rate 高于最强非 oracle 条件，即立即停止把时序板书作为核心贡献，不启动完整恢复算法。可保留静态/文本 Skill 路线；不能用该 pilot 反向宣称 oracle 无效的普遍科学结论。

| 优先级 | 实验 | 依赖 | 核心输出 | Go 门槛 | Stop/Pivot 条件 |
| --- | --- | --- | --- | --- | --- |
| P0 | 标注 pilot 与 IAA | 标注手册、合法样片 | 30–50 事件、时间/成本、IAA | 类别 α/κ `>=0.67`；mask median IoU `>=0.75`；对齐 median error `<=3s` | 任一主标签两轮修订后仍不过门槛：合并本体；仍失败则停止“语义 edit”论文路线 |
| P0（最早价值门） | Oracle Value Gate | 30–50 个已仲裁事件、冻结 distiller 与预算协议 | 四条件 budget-matched Skill Fidelity | Oracle 对最强非 oracle 在 Evidence Grounding F1、Temporal Fidelity、Edit Coverage Recall 上均 `>=+5pp` 且 80% paired-bootstrap CI 下界 `>0`；Unsupported Rate 不升 | 任一正向指标无明确增量或 Unsupported Rate 上升：立即停止时序板书核心路线，不投入完整恢复算法 |
| P0 | 简单帧差、Legacy、Full 的内在冒烟 | Oracle Value Gate 通过、P0 gold、可运行视频 | 100–200 事件的恢复指标 | Full 的 Boundary F1@3s `>=0.70`、Type Macro-F1 `>=0.65`、Mask mIoU `>=0.55`、Alignment Recall@1 `>=0.70`，且多数教师上优于 Frame Difference | 达不到绝对可用阈值，或只在单一教师上有效：不进入 Skill 主实验；先修数据/视觉层 |
| P0 | Legacy 可复现性审计 | 公开代码/论文、统一输入 | 可运行配置或有证据的兼容性报告 | 至少一个时空 board baseline 能在本数据上运行或被忠实复现 | 不能运行也不能忠实复现：不得写“优于 legacy”；降级为简单基线并在局限中说明 |
| P1 | 七条件 Skill Fidelity 主实验 | 冻结 distiller、P0 通过 | budget-matched 配对 Skill | Full 相对最强非 oracle 的 Evidence Grounding F1 绝对提升 `>=5` 个百分点，且 95% cluster-bootstrap CI 下界 `>0`；Unsupported Claim Rate 不升高 | Full 与 Static/Final 或 Uniform Frames 无稳定差异：停止“时序是核心贡献”，转为 benchmark/诊断论文 |
| P1 | 机制消融与 oracle 分解 | P1 主实验 | typed delta、alignment、role 的独立作用 | 至少 typed semantic delta 对一个主 Skill 指标和一个下游候选指标有一致正向贡献；oracle 显示尚有可解释 headroom | 只有更长输入有效，或 role/alignment 全无贡献：删除无效模块与对应 claim |
| P1 | Leave-One-Teacher-Out 与鲁棒性 | 至少 3 位教师 | 每教师/每难度分桶结果 | 相对最强非 oracle 的优势方向在每个 teacher fold 保留；中度噪声组不出现系统性反转 | 优势只来自单教师/单介质：把结论收缩为该设置，不能主张跨教师 |
| P2 | Tutor 主实验 | P1 Skill 门槛通过、冻结 Tutor harness | 板书依赖/无关配对 episodes | Board-dependent Task Success 或 Near-transfer Accuracy 相对最强非 oracle 绝对提升 `>=5` 个百分点且 95% CI 下界 `>0`；Remediation Success 同方向；Leakage 不升；board-independent 非劣于 `-2` pp | 无下游增益：不以 Board2Skill 方法论文投稿；可转成数据集/表示诊断论文。若以泄露或更高预算换增益，判定失败 |
| P2 | 第二模型家族复现与效率 | P2 主结果 | 方向复现、成本/延迟表 | 关键收益方向在第二模型保留，且成本被完整报告 | 仅对单一闭源模型/API 版本成立：降级为模型特定发现，不能泛化 |
| P2 可选 | 真实学生/教师研究 | 伦理审批、功效分析 | 学习或可用性结果 | 仅按独立协议判断 | 未开展不影响当前受限主张；开展但样本不足不得声称学习增益 |

阈值是项目决策标准，不是预测结果。最终论文主检验仍以冻结测试集、效应大小和置信区间为准。

### 8.1 总体决策规则

- **Go：Board2Skill 方法论文。** P0、P1、P2 的主门槛全部通过，尤其是时序表示相对 Static/Final、Uniform Frames 和 Legacy 的 Skill 与 Tutor 双层增益。
- **Pivot：benchmark/diagnostic paper。** 事件标注可靠且方法在内在指标上有效，但 Skill 或 Tutor 增益未达到门槛；贡献改为任务、数据、旧范式失效分析和误差传播，不声称下游有效。
- **No-Go：板书恢复主线。** 标注本体不可靠；Full 不优于简单/legacy；或静态最终板书与显式 delta 在严格预算下等效。
- **禁止的降级叙事。** 不能因为下游失败，就把普通清板、写擦检测或关键帧抽取重新包装成“最强贡献”。

## 9. TBD 结果表模板

### 9.1 数据与标注

| Split/Fold | Teachers | Videos | Minutes | Events | ADD | ERASE | MODIFY | CONNECT | Double-annotated % | α/κ | Mask median IoU | Alignment median error (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Train | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Validation | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Unseen-teacher Test | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

### 9.2 Intrinsic 主结果

| Method | State F1 ↑ | Occluded F1 ↑ | Boundary F1@3s ↑ | Type Macro-F1 ↑ | Mask mIoU ↑ | Order τ ↑ | Align R@1 ↑ | Role Macro-F1 ↑ | Tuple Success ↑ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frame Difference | TBD | TBD | TBD | N/A | TBD | TBD | N/A | N/A | N/A |
| Legacy Board Extraction | TBD | TBD | TBD | TBD | TBD | TBD | N/A/TBD | N/A | N/A |
| Full Board2Skill | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Oracle Delta | N/A（gold input） | N/A（gold input） | N/A（gold input） | N/A（gold input） | N/A（gold input） | N/A（gold input） | N/A（gold input） | N/A（gold input） | N/A（gold input） |

Oracle 行仅用于说明 gold 输入上限，不产生 intrinsic 模型结果，也不进入性能排名。

### 9.3 Skill Fidelity 主结果

| Distillation condition | Schema Valid ↑ | Edit Coverage ↑ | Evidence P ↑ | Evidence R ↑ | Evidence F1 ↑ | Temporal Fidelity ↑ | Role Agreement ↑ | Unsupported Rate ↓ | Actionability ↑ | Input Cost ↓ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Transcript Only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Static/Final Board | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Uniform Frames | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Raw Video VLM | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Legacy Board Extraction | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Oracle Delta | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Full Board2Skill | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

### 9.4 Tutor 主结果

| Condition | Board-dependent Success ↑ | Diagnosis Macro-F1 ↑ | Next-action Accuracy ↑ | Remediation Success ↑ | Near-transfer Accuracy ↑ | Check Completion ↑ | Leakage ↓ | Abstention Accuracy ↑ | Board-independent Δ ↑ | Cost/Episode ↓ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Base Tutor | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Transcript Only | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Static/Final Board | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Uniform Frames | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Raw Video VLM | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Legacy Board Extraction | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Oracle Delta | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Full Board2Skill | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

### 9.5 消融

| Variant | Mechanism tested | Boundary F1@3s ↑ | Type F1 ↑ | Evidence F1 ↑ | Unsupported Rate ↓ | Tutor Success ↑ | Interpretation after results |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Full | Full mechanism | TBD | TBD | TBD | TBD | TBD | TBD |
| w/o Temporal Persistence | State lifetime | TBD | TBD | TBD | TBD | TBD | TBD |
| Binary Delta | Typed edit | TBD | N/A | TBD | TBD | TBD | TBD |
| w/o Semantic Content | Semantic edit objects | TBD | TBD | TBD | TBD | TBD | TBD |
| w/o Speech Alignment | Utterance grounding | TBD | TBD | TBD | TBD | TBD | TBD |
| w/o Pedagogical Role | Teaching function | TBD | TBD | TBD | TBD | TBD | TBD |
| w/o Provenance/Uncertainty | Auditability/refusal | TBD | TBD | TBD | TBD | TBD | TBD |

### 9.6 鲁棒性与效率

| Setting | Boundary F1@3s ↑ | Type F1 ↑ | Mask mIoU ↑ | Evidence F1 ↑ | Tutor Success ↑ | RTF ↓ | GPU-hours/video-hour ↓ | Cost/video-hour ↓ | Failure/Note |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Clean / 1080p / seen medium | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Medium occlusion | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| ASR noise 20% | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| 720p | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Unseen teacher | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Raw Video VLM | N/A | N/A | N/A | TBD | TBD | TBD | TBD | TBD | TBD |

## 10. 执行清单与所有权

1. 冻结事件 schema、标注手册、合法样片清单和 group IDs。
2. 完成 P0 双标 pilot；只在 IAA 过门槛后扩大标注。
3. 在 30–50 个已仲裁事件上冻结 Oracle Value Gate 的四条件输入、distiller、预算、随机种子和盲评 rubric。
4. 运行 Oracle Value Gate；未达到三个 `+5pp`/80% CI 门槛或 Unsupported Rate 上升时立即停止时序板书核心路线。该 pilot 不进入论文主结果，样本不进入冻结测试集。
5. 只有 Oracle Value Gate 通过后，才实现完整恢复算法；同时实现 Frame Difference，并审计至少一个 legacy baseline 的可运行性。
6. 冻结主切分、主指标、P0/P1/P2 门槛、模型版本和预算协议。
7. 先运行正式 intrinsic，过门槛后才扩大专家 Skill gold 和下游实验。
8. 运行七条件 Skill Fidelity；通过后才扩大 Tutor episodes。
9. 在看主测试集前完成消融、鲁棒性生成脚本和统计代码冒烟。
10. 保存逐样本输出、失败日志、成本和随机种子；运行盲评与裁决。
11. 根据总体决策规则选择 method、benchmark/diagnostic 或 no-go，不以事后叙事替代门槛。

## 11. No-Fabrication Status

本文没有生成或填入任何实验结果。所有 `TBD` 必须来自实际运行、人工标注或在完全匹配协议下复现/核验的公开 baseline。所有阈值均是预先定义的项目验收标准，不代表模型已经达到这些数值。若公开论文中的数字与本项目协议不一致，只能放入相关工作背景，不能复制进主对比表。
