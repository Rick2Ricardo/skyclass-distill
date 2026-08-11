# Board2Skill 执行路线图与 Agent 验收协议

> 状态：执行中；已完成 2 个事件的工程 Gold-dev 多模态闭环与 2×4 四条件接线 smoke，但尚未生成正式价值实验结果
> 当前阶段：两位教师已有 5 个独立 A/B（含严格盲标 B2）待签仲裁包；李永乐后半段 7 组（提出 9 个候选事件）、坤哥主窗 19 组、李永乐假 MODIFY 困难负例 17 组、坤哥同槽重写 5 组、坤哥真实 ERASE 1 组，共 49 个 review groups、51 个候选事件，仍不能冒充论文 Gold
> 核心问题：时序板书演化能否提供字幕、最终板书和均匀抽帧之外的独立证据，从而蒸馏出更忠实、可执行的教师能力？

> 2026-08-11 补充：`grounded-skill-distillation-v2` 第一薄片已接入产品的单课蒸馏入口。新链路把 Board Action IR 与 Render Plan 分离：教学动作不绑定渲染器，HTML / SVG / Ink 仅由独立计划选择；teacher replay、counterfactual、repair、merged 来源显式区分。每个 accepted delta 的 before/delta/after montage 现按精确 evidence ID 校验并实际提交多模态 API，单请求最多 4 个事件，更多事件稳定分批，视觉请求和 usage 进入独立 audit。产品导入单位改为 Bundle JSON + montage 的完整 evidence package 目录，裸 JSON 不再绑定为可运行包。跨课 temporal common 仍等待多 bundle 契约，禁止用单 bundle 冒充。
>
> 2026-08-12 补充：产品新增 `Gold 仲裁` 中心，直接读取 canonical clip manifest 中登记的 5 个 A/B 仲裁输入并统一为 49 组、51 个候选事件的评审队列。每组展示全部冻结 A/B 事件、全部原始视觉证据、ASR 上下文与未决字段；人工决策以 append-only 修订链保存，绑定 intake SHA-256、父版本和记录哈希。只有包内每组都有决策后才能开始包级签字；第一位视觉仲裁人签字即锁定决策，第二位不同人员以物理复核角色签字后整包正式冻结。证据按登记索引、真实图片解码与 SHA-256 fail-closed 提供。当前仍是 `0/49` 已裁决、`0/5` 双签冻结，不能生成或宣称论文 Gold。

## 1. 项目决策

本项目不把通用清板、遮挡恢复、写入/擦除检测或关键帧摘要作为论文中心贡献。论文候选主张是：

> 在固定或轻微运动机位、板书占主导的 K12 数学/物理课堂中，显式恢复并对齐原子级板书编辑，可以提高教师 Skill 的证据忠实度，并在板书依赖的 Tutor 任务上产生独立价值。

研究链路固定为：

```text
Video + timestamped ASR
  -> BoardState / typed BoardDelta
  -> Board-Grounded Teaching Transition
  -> Executable Teaching Skill
  -> Tutor behavior and transfer evaluation
```

当前只承诺固定机位、单个主要板面、数学/物理、`ADD / ERASE / MODIFY / CONNECT` 四类 gold 事件。不承诺通用课堂理解、全学科、任意镜头、真实学生学习增益或教师人格模仿。

## 2. 已冻结的规划工件

- [Board2Skill-Opt v2 方法](./OPTIMIZATION_METHOD_V2.md)：把教师示范与最优策略分开，引入多解意图、类型化成败经验、条件 Skill、四道门、selection-only 晋升和回滚。
- [方法与系统规格](./METHOD_AND_SYSTEM_SPEC.md)：模块、数据契约、代码接入点、PR 顺序和 fallback。
- [数据与标注规范](./DATA_AND_ANNOTATION_SPEC.md)：数据盘点、事件 schema、双标仲裁、切分、许可与一周启动队列。
- [实验与验收计划](./EXPERIMENT_AND_ACCEPTANCE_PLAN.md)：主张—证据矩阵、基线、指标、消融、统计与 Stop/Go 门槛。

仓库目前没有 `ccfa.yaml`。在用户决定建立正式论文项目状态文件前，以本目录三个规格和本路线图作为状态依据；不得静默创建或改写 `ccfa.yaml`。

## 3. 为什么先做 Oracle Value Gate

完整板书恢复可能消耗数周，但最根本的未知不是“能否恢复”，而是“正确的时序 Delta 是否真的帮助 Skill 蒸馏”。因此实施顺序必须是：

1. 双人标注并仲裁 30–50 个开发事件；
2. 预算配平比较 `Transcript Only / Static-Final Board / Uniform Frames / Oracle Delta`；
3. 只有 Oracle Delta 通过预注册的 Skill fidelity 价值门，才投资完整视觉恢复算法。

该 pilot 只用于投资决策，不进入冻结主测试集，也不作为论文主结果。如果 Oracle 输入本身没有明确增量，项目立即停止“时序板书是核心贡献”的路线，保留静态视觉 Skill 或转向诊断研究。

## 4. 三个并行 Agent 工作流

并发执行固定为三个 worker，由主 Agent 验收。worker 不互相修改同一文件；共享字段以数据 schema 和版本化 contract 为准。

| Worker | 长期职责 | 首批交付物 | 不得擅自做的事 |
| --- | --- | --- | --- |
| A：Visual Evidence | contracts、密集采样、板面 ROI、配准、可见性、BoardState/Delta、诊断资产 | versioned bundle validator；固定机位 sampler；合成遮挡/擦除测试 | 不用 LLM 猜视觉真值；不把静态帧基线替换掉；不改 gold 定义 |
| B：Data & Annotation | manifest、去重、权利 triage、CVAT/JSONL、双标、仲裁、teacher split、leakage report | canonical resource manifest；30–50 个 adjudicated dev events；agreement report | 不把 job/副本当独立课程；不公开未知授权媒体；不看模型输出后修改 gold |
| C：Skill & Evaluation | 四条件 Oracle harness、legacy baseline、指标、Grounded Transition、v2 Skill、Tutor arms、统计 | budget-matched Oracle Gate；逐样本输出；实验配置指纹 | 不改变各 arm 模型/预算；不把 oracle 计入可部署排名；不填虚构结果 |
| Root：Acceptance | 任务合同、交叉审查、diff、测试、证据链、公平性和阶段决策 | 每个 gate 的 pass/revise/stop 记录 | 不因 demo 漂亮而越过 gate；不替失败结果重写主张 |

三个 worker 可以复用当前已经完成规划的子 Agent，但每一波都要收到新的、边界明确的任务；完成后由 Root 读取实际文件和测试输出，不以子 Agent 自报为验收结论。

## 5. 分阶段计划

### Phase 0：研究契约与价值验证，Week 1

并行工作：

- Worker A：实现最小 BoardEdit schema/adapter、JSON validator 和证据 URI 规则；暂不实现完整恢复器。
- Worker B：生成 canonical manifest，完成视觉/权利 triage，建立标注工程，双标并仲裁 30–50 个开发事件。
- Worker C：实现四条件 Oracle Gate harness、预算审计、盲评导出和 TBD 报告模板。

Gate G0-A：标注可行性：

- operation/role `alpha or kappa >= 0.67`；
- mask median IoU `>= 0.75`；
- utterance alignment median error `<= 3s`；
- 所有资源有 canonical ID、teacher group、rights status 和 withdrawal key。

Gate G0-B：Oracle 价值：

- 以 [实验计划的 Oracle Value Gate](./EXPERIMENT_AND_ACCEPTANCE_PLAN.md#80-最早-oracle-value-gate投资决策-pilot) 为唯一数值口径；
- 未通过则停止完整视觉算法；通过才进入 Phase 1。

### Phase 1：固定机位视觉恢复，Week 2–4

并行工作：

- Worker A：按 `PR-B2S-0/1/2` 实现 contracts、批量 FFmpeg 采样、人工 ROI、轻微配准、遮挡/可见性、双向状态融合和 typed delta。
- Worker B：扩展到 100–200 个 pilot 事件与困难负例；冻结主 schema、类映射、teacher group 和测试集。
- Worker C：实现 Frame Difference，并审计或忠实复现至少一个 AccessMath/LectureMath legacy baseline；完成 intrinsic evaluator。

Gate G1：视觉可用性：

- 使用冻结 P0 gold 和 [实验计划的 P0 恢复门槛](./EXPERIMENT_AND_ACCEPTANCE_PLAN.md#8-p0p1p2-实验优先级与-stopgo-门槛)；
- accepted event 必须有 before、after、mask、时间、可见性和来源；
- 遮挡不得直接产生 erase；fallback 样本不得计入 temporal 成功样本；
- Full 若不能超过简单帧差和至少一个可运行 legacy，对视觉机制做 revise 或 stop。

### Phase 2：Grounded Transition 与 Skill，Week 5–7

并行工作：

- Worker A：稳定 predicted delta、语义 crop/montage、状态缓存和失败诊断。
- Worker B：扩大有合法边界的数据；最低目标 12–20 节、至少 3 位教师、300–600 个 adjudicated events，具体规模由 pilot 事件率和功效分析决定。
- Worker C：实现 speech alignment、evidence level、Board-Grounded Transition、v2 Skill 编译、资产去重和固定实验 arm。

Gate G2：Skill Fidelity：

- 运行七条件对照：Transcript、Static/Final、Uniform、Raw Video VLM、Legacy、Oracle、Full；
- 主看 Evidence Grounding F1、Unsupported Claim Rate、Edit Coverage 和 Temporal Fidelity；
- 必须同 distiller、同输入范围、同视觉/文本预算、同输出限制、同随机种子；
- Full 未稳定优于最强非-oracle 静态/均匀条件，则停止“时序为核心”，转 benchmark/diagnostic。

### Phase 3：Tutor 执行与教师外测试，Week 8–10

并行工作：

- Worker A：为 Tutor 输出参数化 `visual_strategy`，不直接搬运原课堂图和答案。
- Worker B：完成 leave-one-teacher-out、unseen-lesson、board-mode 分层和泄漏报告。
- Worker C：实现固定 Skill 选择、板书依赖/无关任务、补救 episode、近迁移、泄露与成本审计。

Gate G3：下游价值：

- 按 [实验计划 P2 门槛](./EXPERIMENT_AND_ACCEPTANCE_PLAN.md#8-p0p1p2-实验优先级与-stopgo-门槛) 判断；
- 增益不得来自更长上下文、更多图像、不同 Skill 路由或答案泄露；
- 板书无关任务需要满足预注册非劣条件；
- intrinsic 成立但 Tutor 无增益时，转为数据集/表示诊断论文。

### Phase 4：鲁棒性、复现与论文证据，Week 11–12

- 未见教师、遮挡、ASR 噪声、720p/480p、板面介质、事件密度和自然失败分桶；
- typed delta、时间持久性、遮挡恢复、语音对齐、pedagogical role、provenance 的单变量消融；
- hierarchical cluster bootstrap、配对检验、成本、延迟、缓存和失败率；
- 填写真实结果，保留逐样本输出和版本指纹；所有未知值继续保持 `TBD`。

最终只允许三种决策：

1. **Method paper**：G0–G3 全部通过；
2. **Benchmark/diagnostic paper**：标注和表示可靠，但 Skill/Tutor 增益不足；
3. **No-Go/Pivot**：Oracle 无价值、视觉不可恢复或静态条件等效。

## 6. Root 验收清单

每个 worker 交付后，Root 必须执行以下检查：

1. **Scope**：只修改任务允许的文件；现有用户改动不被覆盖。
2. **Contract**：事件、对象、角色、时间单位、ID 和 status 与数据规范有显式映射。
3. **Traceability**：Skill 原子主张可回到 transition、delta、speech、state 和 source frame。
4. **Correctness**：类型检查、单元测试、合成不变量、fixture 集成测试与真实小样本冒烟按风险运行。
5. **Experiment fairness**：各 arm 的模型、Prompt、token、图像、输出、随机种子、路由和重试预算匹配。
6. **Data integrity**：按内容/教师/课程分组去重；无同源片段跨 split；原始和修订 ASR 并存。
7. **Rights/privacy**：未知授权媒体不进入公开 release；无绝对本机路径、教师身份泄漏或学生隐私。
8. **No fabrication**：所有未运行结果是 `TBD`；规划阈值不冒充已有性能。
9. **Gate compliance**：前一 gate 未通过，不接受下一阶段的大规模实现。

验收结果使用：

```text
PASS    交付完整且 gate 通过，可进入下一阶段
REVISE  可修复的不一致、测试缺口或证据缺口，退回原 worker
STOP    中心假设、数据许可或关键门槛失败，按预注册路线转向
```

## 7. 当前验收状态

| 工件 | 状态 | Root 结论 |
| --- | --- | --- |
| Method/System spec | PASS after revision | 已加入算法投资前 Oracle Gate；接口、fallback、PR 与测试可执行 |
| Data/Annotation spec | PASS | 本地数量经 Root 复核：29 MP4 路径/23 唯一 SHA；排除 smoke 后 23/18；`data/visual/` 下 68 JPG 路径/62 唯一 SHA；若计入 `data/projects/` 的 19 个 Skill 资产副本则全 `data/` 为 87 路径，仍是 62 个唯一内容 |
| Experiment/Acceptance plan | PASS after revision | 已加入四条件 Oracle Gate、主基线、统计、硬 Stop/Go 与全 TBD 结果表 |
| Cross-contract consistency | PASS with adapters | 标注层大写 operation/对象枚举通过显式 adapter 映射到运行时 contract；论文角色在 pilot 后冻结为可稳定区分的 6–8 类 |
| Board2Skill-Opt v2 contract | PASS first slice | 五层对象、运行时 validator 与 19 个防污染测试已落地；尚未接入 v1 builder 和产品路径 |
| Temporal Board v2 contract | PASS first slice | `temporal-board-v2` 的 Surface/Frame/Object/State/Delta/Speech/Transition/Bundle 及 validator 已落地；29 项专项测试覆盖稳定时长与对象生命周期、teacher-only、证据等级、同板面、擦除持久性、CONNECT 双锚点关系、MODIFY old→new 语义槽与路径安全；纯契约层只校验摘要格式，不替代资产重算与人工仲裁 |
| Oracle pilot clip manifest | PASS for annotation intake | 已冻结 11 个片段、6 个源视频、2 位教师、两种板书媒介；5 个片段完成独立 A/B（含严格盲标 B2）与待签对齐，其余保持候选。全部为 `internal_review_only` 和 `needs_review`，尚无论文级 accepted delta |
| Oracle four-arm executable smoke | PASS as wiring smoke only | 已实现 Transcript / Static-Final / Uniform / Oracle Delta 的统一 Pi runner、1920×360 JPEG canonical canvas、冻结 Prompt/schema/token/temperature/seed/cache/tools 协议、真实像素/SHA/request/usage 审计，以及 evaluator/private answer key 物理分离。真实 `gpt-5.5` run-003 使用运行时私有 blind seed，完成 `2 cases × 4 arms × 1 seed = 8` 次请求，全部一次 `stop`；manifest 强制 `decision=not_evaluable`。这不是四组价值结果，formal runner 与统计仍由 30–50 Gold、至少 2 位教师、人工签字和至少 3 seeds 门控 |
| A/B first annotation | PASS for adjudication intake | `tbv2-ly-004-01` 已有两份独立标注和逐事件分歧表；B 标出 15 个候选 delta，所有未仲裁项继续保持 `needs_review`，其中摩擦力箭头身份/时序与 ADD/CONNECT 划分仍是高优先级争议 |
| Human-signable Li Yongle back-half intake | PASS for human review only | `133–240 s` 的 A2 9 个事件与 B 7 个事件已完整对齐为 7 组、9 个候选；证据路径/哈希和原始 ASR 均闭环，所有 `human_review` 与包级签字仍为 pending，paper Gold blocked |
| Second-teacher independent annotation | PASS for adjudication intake | `kunge_bilibili / 2720–2880 s` 已完成 A/B 独立标注：A 16、B 19 个子窗事件，对齐成 16 个共同组和 3 个 B 独有待审候选；19/19 均 pending，视口混杂候选明确允许 reject，未产生 accepted 事件 |
| False-MODIFY hard negative | PASS for human review only | `ly-003 / 702–922 s` 的 A16/B17 全部只支持 ADD，现对齐为 17 组；相似第二幅图、公式续写和新增箭头均保留旧对象，因此不能自动判 MODIFY。17/17 均 pending，accepted=0 |
| Same-slot rewrite hard negative | PASS for human review only | `kg005 / 2134–2166 s` 已完成 A4/B8 双标并对齐为 5 组；两侧均未标 MODIFY。证据支持 ERASE、ADD、atomic ERASE+ADD 或 unknown；同槽等号/`F r²` 重写没有实质语义变化，5/5 pending，accepted=0 |
| Strict-blind ERASE intake | PASS for human review only | `kg003 / 4422–4428 s` 的 A 与严格盲标 B2 均识别同一 ERASE，tIoU `0.876788`、region IoU `0.816532`；before 左删失与边界仍待裁决。旧 B 因 scout 元数据暴露被隔离，不参与一致性、仲裁或 Gold。1/1 pending，accepted=0 |
| Human Gold review workflow | PASS as unsigned review infrastructure | `/api/gold-review` 与产品 `Gold 仲裁` 中心已统一载入 5 个包/49 组/51 个候选事件；355/355 份图像按冻结 hash 解码并全部展示，组决策 append-only、按包串行写入且父链可验。全组裁决后由视觉仲裁与物理复核两名不同人员双签；首次签字锁定决策，双签才正式冻结。当前无人工决策或签字，因此仅证明评审基础设施可用，不证明 Gold 已完成 |
| Operation-gap scouting | PASS for next annotation queue | `kg005 2134–2166 s` 的初始 MODIFY 假设已被双标否定并转为困难负例；`kg003 4422–4428 s` 已形成严格 A/B2 ERASE 仲裁输入；`kg005 1888–1905 s` ERASE+ADD 困难负例尚待双标。本地 ASR 已生成，均未进入 Gold |
| Engineering Gold-dev compile | PASS for pipeline smoke only | 仅接受 B-DELTA-05、B-DELTA-06 两个 A/B 与语音一致的低争议事件；编译时间已冻结进仲裁台账，同一输入连续两次得到稳定 payload SHA-256 `266415d4f9d67d96b4d743140f6d162197454bf5cfdbf4d86ee18386e2f27f20`。编译器将状态帧生成真正的 before / 高亮 delta / after 三联图，并把未仲裁的 pedagogical role 清回 unknown；明确标记 `engineering_gold_dev_not_paper_gold` 与 `requires_human_signoff` |
| Engineering Gold-dev v2 for Oracle smoke | PASS for wiring smoke only | 保持 v1 及 run-005 不变，另建不可变 v2，增加冻结的 90 s / 99 s 独立 Uniform 帧；payload SHA-256 `23e8ce456c302a82c0ad2dfd9c105943bc7f2f91288cac0acaba0d1dc3758b1f`。Static-Final 与 Uniform 不再复用同一帧，仍明确不是 paper Gold |
| Grounded Skill distillation v2 | PASS first real single-lesson smoke | 已实现 renderer-neutral Board Action IR、独立 HTML/SVG/Ink Render Plan、源 transition/delta/evidence 约束、teacher replay 与设计动作分层、schema repair 和 v2 Skill builder。真实 `gpt-5.5` run-005 实际提交 2 张 1920×360 三联 montage，单次通过并生成 1 个 capability / 1 个 Skill，视觉 SHA、正常 stop 与 usage 均进入 audit。产物正确把实例系数 1.2 参数化为 λ、没有补写学生事实。该结果只证明闭环可运行，不构成 Oracle 价值门结果；跨课 temporal common 在多 bundle 契约完成前保持关闭 |

## 8. 下一次实际执行入口

下一波不直接写完整恢复算法，而是继续 Phase 0：

1. 在产品 `Gold 仲裁` 中心对当前五个仲裁包的 49 个 review groups（51 个候选事件）逐组裁决并执行包级签字；任何 proposal、单标或 Agent 对齐结果均保持 `needs_review`，不能用“候选数超过 50”冒充“50 条 Gold”；
2. 双标 `kg005 1888–1905 s` 的 ERASE+ADD 困难负例，把最后一个操作长尾纳入人工仲裁；随后只用真正签字的事件编译 `temporal-board-v2` bundle并重算全部摘要；当前 2 条工程 Gold-dev 只用于闭环测试；
3. 运行四条件 Oracle harness，生成逐样本盲评包，所有结果继续保持 `TBD` 直到真实运行完成；
4. 并行把已冻结的 8 个问题家族写成 24 条受控 Tutor 场景及物理锚点，冻结 train/selection/locked-test manifest；
5. 给当前 v1 分析增加显式 Observation adapter，禁止把学生预期回应写入观察层；
6. Root 先验收 G0-A，再运行并验收 G0-B；只有 `PASS` 后，才派发 `packages/board-evidence` 的完整自动恢复实现。

这条顺序是项目当前最重要的成本控制：先证明“正确的板书时序值得恢复”，再证明“算法能够恢复它”。
