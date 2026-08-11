# Formal Oracle Gate v1：正式四组实验协议

> 状态：`ledger_attestation_implemented / execution_blocked`
>
> 日期：2026-08-12
>
> 用途：判断“时序板书视觉证据是否值得继续投入自动恢复算法”。这是 development 阶段的内部顺序决策，不是论文主测试结果。

## 1. 中心主张与证据

中心主张不是“模型看了图就更好”，而是：在教师单人网课中，经过人工签字的 `before → typed delta → after` 时序板书证据，相比相同语音下的文字、最终静态板书和均匀抽帧，更能让系统恢复有证据约束、顺序正确、可执行且少幻觉的教学动作。

| 主张 | 评审问题 | 所需证据 | 指标 | 状态 |
| --- | --- | --- | --- | --- |
| 时序变化有独立价值 | 最终板书或普通抽帧是否已经足够？ | 同 case、同模型、同 Prompt、同预算的四臂配对实验 | Evidence Grounding F1、Edit Coverage、Temporal Fidelity、Unsupported Claim Rate | TBD |
| typed delta 有助于恢复操作顺序 | 模型是否只是在描述图片？ | 多编辑窗口、ERASE/ADD/MODIFY/CONNECT 分桶 | 顺序准确率、操作覆盖率、错误类型 | TBD |
| 改进不是某位教师或某种板面造成 | 结论能否跨教师/介质成立？ | 至少 2 位教师；按 teacher、board mode、operation 报告 | macro-by-teacher、worst-group | TBD |
| 成本可控 | Oracle arm 是否只是用了更多 token？ | 输入/输出 token、像素、延迟、重试、成本逐请求审计 | 质量—成本曲线 | TBD |

## 2. 数据与不可变边界

- 根输入只能是重新验证签字正文、内容哈希与视觉证据的 `signed-gold-dataset-v1`。
- 每个接受 group 恰好形成一个 case；事件按人工签字顺序原样保留，不能运行时重排。
- 总计 30–50 个签字事件、至少 2 位教师、至少一个含两个有序编辑的窗口，并至少各覆盖一项 ADD/ERASE/MODIFY/CONNECT；若真实数据无法稳定得到某类，应先收缩事件本体或方法主张，不能在运行后补类别。
- 数据只标记为 `development`，不得进入论文冻结主测试集。
- 当前均为无学生出镜的教师录课；不得产生观察到的学生反应或学习增益。
- `internal_review_only` 只允许内部非商业实验；`blocked/unknown` 不能运行。每个来源保留撤回键。
- 课堂语音必须来自独立签字的时间对齐账本。现有 `context_not_gold` ASR 不能冒称 gold utterance。

## 3. 四个冻结条件

| Arm | 输入 | 检验的问题 |
| --- | --- | --- |
| Transcript | 同一事件窗语音，无图 | 单靠语言可恢复多少能力？ |
| Static-Final | 同一语音 + 事件后稳定板书 | 最终结果是否已经足够？ |
| Uniform | 同一语音 + 预注册均匀帧 | 普通抽帧是否已经足够？ |
| Oracle Delta | 同一语音 + 人工签字 before/delta/after montage | 时序编辑表示的上限价值是多少？ |

所有视觉臂均使用一张 `1920×360 JPEG quality=88` canonical canvas。不得给 Oracle arm 更多输出 token、工具、缓存或重试预算。`atomic_ERASE+ADD` 在 formal 输入阶段必须先由人工签字数据展开成 `ERASE → ADD` 两个有序事件；未展开的原子标签直接拒绝，不能在运行时猜测内部顺序。

## 4. 冻结运行协议

- 同一完整模型标识与 Pi transport；`temperature=0`、无工具、无缓存。
- 至少 3 个唯一预注册 seed。
- 冻结 system prompt、user template、output schema、rubric、代码 revision 及各自 SHA-256。
- 冻结最大输入/输出 token、图像数与像素、timeout、最大 attempts。
- 确定性 planner 展开完整的 `case × 4 arms × seed` 笛卡尔积。
- 每个请求有稳定 `request_id` 与 `idempotency_key`；缺任一请求不得出部分结论。
- 第一层结构校验只返回 `untrusted_structure_valid`，不把可自行重哈希的 JSON 当作预注册或可信 Gold。
- 当前已实现第二层账本 attestation：在跨实例/进程全局锁内，从当前 `GoldReviewStore` 重新读取 manifest、全部 intake、每一版历史 decision 和两类 signoff，重编译 Signed Gold，并生成确定性 `gold-ledger-snapshot-v1`。
- 账本快照只能由外部提供的 Ed25519 私钥冻结为内容寻址 registry；运行时必须从进程外获得 pinned registry SHA 与可信公钥。registry 自带的 key ID、hash 或公钥不能建立信任。撤销使用独立、追加式、外部签名记录，并与 capability callback 共用跨进程锁，防止检查后撤销的 TOCTOU。
- 本地撤销目录只能证明“当前可见的签名撤销记录有效”，不能证明同一 OS 权限下的历史文件从未被删除。正式 API 前还必须由进程外 pinned active/revoked head、单调序列的可信审计服务或 WORM 存储证明撤销不可回滚；当前实现不宣称具备该性质。
- 通过验证后只在持有全局账本锁的 callback 内借出不可序列化 `ledger_attested_only` capability；它不是执行令牌。registry 中 `media_bytes_verified`、`speech_bytes_verified`、`run_store_verified` 与 `api_execution_allowed` 仍强制为 `false`。
- 只有资产/语音字节复核、私有 checkpoint store、盲评协议与统计器也在同一受控调用链内通过后才能执行正式 API。

## 5. 评分与统计

主指标：

1. `Evidence Grounding F1`：原子教学主张是否引用正确语音与板书事件。
2. `Unsupported Claim Rate`：无课堂证据支持的动作、内容或学生状态占比，越低越好。
3. `Edit Coverage Recall`：Gold 教学相关编辑被恢复或转化的比例。
4. `Temporal Fidelity`：动作顺序的 pairwise accuracy / Kendall's τ。

人工评分采用 `oracle-gate-rating-v1`，至少两名互盲评分者。公共包只含随机 blind ID、待评输出及必要 rubric；arm、seed、配对、教师、视频和来源都保留在权限为 `0700/0600` 的私有映射中。

统计以相同 `case × seed` 配对。主要比较为 Oracle Delta 对预注册规则选择出的最强非 Oracle 条件。内部投资门使用 80% paired hierarchical cluster bootstrap CI；95% CI 只作描述。cluster 层级至少为教师→视频/窗口；分桶样本不足时只报告 descriptive，不制造显著性。

## 6. Go / Stop 解释

- `GO`：Oracle Delta 相对最强非 Oracle 在 Grounding F1、Temporal Fidelity、Edit Coverage Recall 三项上均绝对提升至少 `+5pp`，且每项配对 80% bootstrap CI 下界均 `>0`；Unsupported Claim Rate 的配对点估计不得上升。
- `REVISE`：平均方向有利但高度依赖教师、介质、操作类型或成本，需要先补数据或缩窄方法主张。
- `STOP`：三个正向指标中任一个未达到 `+5pp` 且 80% CI 下界 `>0`，或 Unsupported Claim Rate 上升，或改善只来自额外预算；停止投入完整自动板书恢复，转向更轻量输入。

阈值只决定是否继续工程投资，不得写成真实学习增益或论文最终显著性结论。

## 7. 执行顺序

| 优先级 | 工作 | 依赖 | 停止条件 |
| --- | --- | --- | --- |
| P0 | 完成 Gold 人工裁决与双签 | 当前 5+ 仲裁包 | 任一包证据或签字链不闭合 |
| P0 | 完成 formal input/spec 与结构 preflight | Signed Gold | 少于 30 事件/2 教师/3 seeds/multi-edit |
| P0 | 冻结当前 Gold 账本 snapshot 与外部签名 registry | 结构 preflight | 账本漂移、历史缺失、签名/权限/内容地址不匹配 |
| P0 | 字节级验证 static/uniform/oracle/语音账本 | 结构 preflight | hash、路径、解码、时间或来源不匹配 |
| P0 | 内容寻址 checkpoint、锁、resume、私有权限 | 完整 schedule | spec 漂移、损坏 checkpoint、宽权限目录 |
| P0 | 冻结双盲 rubric 与统计预注册 | 评分者确认 | rubric/统计规则仍可运行后修改 |
| P0 | fake client 全链 dry-run | 上述全部 | 任何失败仍产生部分结果 |
| P1 | 正式 API 运行 | ready preflight | 任一请求审计失败则整次决策 fail closed |
| P1 | 双盲评分与统计 | 完整运行记录 | 缺评分/配对/分桶，不产生 Go/Stop |

## 8. 结果模板

| Arm | Grounding F1 ↑ | Unsupported Rate ↓ | Edit Coverage ↑ | Temporal Fidelity ↑ | Input tokens | Output tokens | Latency | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Transcript | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Static-Final | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Uniform | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Oracle Delta | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

No experimental result has been generated here. 所有 `TBD` 必须来自冻结协议下的真实运行与双盲评分；不得用 engineering smoke、Agent 标注或规划阈值填充。
