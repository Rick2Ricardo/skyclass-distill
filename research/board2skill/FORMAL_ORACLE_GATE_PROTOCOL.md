# Formal Oracle Gate v1：正式四组实验协议

> 状态：`externally_pinned_composition_first_slice_implemented / execution_blocked`
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
- 已实现第三层、但尚未外部 attested 的 `oracle-gate-byte-inventory-v1` 与 `untrusted_media_bytes_valid` 预检：来源 MP4 以单一文件句柄流式重算字节哈希，检查 `ftyp`、ffprobe 元数据并用冻结 ffmpeg 对目标视频流执行完整 decode；ffmpeg/ffprobe 的二进制、版本输出与执行前后文件身份全部固定。static、uniform 与 Oracle comparison 必须逐文件真实解码，并计算编码无关的 `oracle-rgba8-v1` canonical 像素哈希。
- 语音预检从 Whisper.cpp raw 开始，拒绝重复 JSON key、时间戳/offset 漂移和顶层/分段双重文本，逐字节重建 index、SRT、TXT 与选中片段文本。`signed-speech-alignment-v1` 账本还必须严格闭合 case、source、clip、五份文件引用、segment ID/index/time/text hash 与选中文本；账本正文先形成域分隔 SHA-256，再由进程外 trusted reviewer key 做 canonical Ed25519 签名。不同正文不能复用签字，只验一个“ledger SHA”不算通过。
- 媒体预检输出继续显式写 `source_frame_derivation_verified=false`：当前证明固定文件字节、真实像素、视频可解码和 ASR 派生链一致，但尚未证明 static/uniform 帧由冻结 ffmpeg 在声明 PTS 自动抽取，也未把全部媒体、语音账本和工具链组合成一个进程外 pinned attestation。当前工具与视频执行仍采用路径执行前后身份复核，不宣称具备不可变 fd/副本级 TOCTOU 证明。因此它不能把账本 capability 升格为执行令牌。
- 在媒体字节层之上，新增独立的 `oracle-gate-frame-derivation-preflight-v1`。它不改写前一层含义，而是把每个 Static-Final / Uniform 的“时间选择规则”和“帧抽取规则”分别绑定：冻结时间按目标视频流首个可显示帧 PTS 归零，不使用 `-ss`，从流首软件解码并选择第一个 `normalized PTS >= timestamp_us` 的帧；缺失、重复、倒退 PTS、错误绝对流索引、非等比输出、非完整 RGBA8 或多/少帧均 fail-closed。
- 来源视频先复制到权限为 `0700/0400` 的随机私有 staging，复制字节与冻结 SHA/长度一致后，才用单线程、无硬件加速、禁自动旋转、固定 edit-list/bitexact/nearest 参数抽帧。Static/Uniform 只接受 pinned `pngjs` 生成的 lossless canonical PNG，重新编码后的完整文件字节、长度、SHA、尺寸和 `oracle-rgba8-v1` 像素哈希必须同时等于冻结资产。成功输出可写 `source_frame_derivation_verified=true`，但状态仍是 `untrusted_source_frame_derivation_valid` 且 `api_execution_allowed=false`。
- 当前仍未把 ffmpeg 动态依赖树或静态工具 capsule 纳入外部 attestation；同一 OS 用户可操作路径时，工具执行前后检查不等于不可变 FD/WORM 证明。因此新层只关闭“图片是否真的来自声明视频 PTS”的工程缺口，不能单独打开正式 API。
- 已冻结浏览器安全的内容寻址 run/intents/attempt receipts/commits/checkpoints/private answer key/public blind package contracts；完整结构验证必须提交从 generation 0 到终态的连续 checkpoint 历史。breaking `RequestAttemptAuditV4` 使用独立 v4 domain并强制 transport capture roots；`CommittedRequestV3` 保持独立 v3 domain，旧 attempt v2/v3 不得混入。确认无结果只能在剩余 attempt 预算内进入 `RETRY_READY`，ambiguous 请求不得重发，attempt audit 不得重放，`SCHEMA_VALIDATED_COMMITTED` 现在证明 strict SSE derivation 加结构 schema 的 provenance 逐字段不可变，公开盲包按大小写无关方式拒绝 private answer-key 值。该状态仍不声称自由文本语义正确；teacher-only 违规、无证据学生结果等必须作为盲评失败样本保留和评分，不能在运行阶段筛掉。
- 私有运行仓库现已实现真实 `0700/0600` 内容寻址存储、跨进程 owner-nonce 锁、create-once HEAD、连续 checkpoint、强制 external HEAD pin、dispatch intent 前的不可变请求落盘，以及 v3 attempt receipt、SSE→assistant content→canonical response、结构验证与 fail-closed retry/terminal 状态。`schedule_sha256` 继续精确绑定结构预检的 8 字段 `case × arm × seed` 调度；breaking `formal-oracle-execution-plan-v2` / `oracle-gate-request-intent-v2` 分别冻结 `request_envelope_sha256` 与候选 `provider_body_sha256`。Store 在 dispatch commit 和历史重载时分别读取、严格解析并重建两份请求 bytes。成功 receipt 又必须先持久化 A fetch-observed SSE entity bytes、B domain-addressed derivation record、C derived assistant-content UTF-8 bytes（文件名固定 `assistant-content.utf8`，不预先声称 JSON/schema 有效）、D canonical response bytes及其独立 public-response commitment；每次外部 reload 都从 A 重跑 parser 并逐字验证 B/C/D、completion ID、model、stop、usage、token budgets 与 intent 双根。`provider_http_request_id` 与 `completion_id` 分离；前者在未来外部 header-capture contract 落地前只是 untrusted declared metadata，不参与 A/B/C/D 或 commit 权威判断。任一 durable dispatch 在恢复时仍按 ambiguous 阻断，不能自动重发；语义审查固定为 `pending_external_blind_review`。
- 该 store 只证明私有字节、完整四臂×全 seed 矩阵、计划与 checkpoint 绑定；它不独立证明 case 是当前 Signed Gold 的全集，也不重做事件数、教师数和 operation 覆盖。正式执行前必须在同一受控调用链内，把 `run.ledger_registry_sha256`、`run.schedule_sha256`、数据集/manifest/spec/build 哈希与进程外 pinned Ed25519 registry capability 逐项组合，并把最新 HEAD pin 保存在外部单调/WORM 系统。本地同 UID 可删除并恢复旧 HEAD；旧 pin 也随之回退时，store 自身无法证明历史曾经前进。因此本层全部接口仍固定 `api_execution_allowed=false`，不能单独成为执行令牌。
- externally-pinned composition 第一薄片已按固定锁序 `registry → Gold ledger → media/ASR/frame → run store` 组合上述层：入口先冻结 dataset/manifest/spec/inventory/run/plan/checkpoint、真实 prompt/request/visual bytes，并把外部 registry/speech trusted key 规范化为独立 Ed25519 SPKI 快照；随后在 pinned registry 与当前 Gold ledger 的同一 callback 内重跑 structural、全部媒体/ASR 字节和 source-frame derivation，逐项闭合 registry snapshot、Signed Gold、manifest/spec/resource root、schedule、code/build、inventory、frame proofs、execution plan 与 run root，最后在 run owner-nonce 锁内 create-once 提交并核对 exact external generation-0 HEAD pin、`SEALED_READY` 和全 `PENDING` provenance。任一层失败不会借出部分 capability；成功也只在 callback 内借出不可序列化、不可伪造的 `composition_attested_only` capability，离开 callback 即失效。
- composition JSON 是 `non_authoritative_composition_record`：其自哈希只证明内容地址，不证明跨进程真实性。`run.media_attestation_sha256` 在本组合中精确映射 source-frame preflight SHA；`run.speech_attestation_sha256` 映射 byte inventory SHA，但 inventory 单独仍是 `untrusted_inventory`，只有本 callback 确实重跑签字 ASR/字节验证后才获得组合内含义。当前只闭合 declared resource-manifest root，authoritative rights/withdrawal active head 仍为 `pending_external_authoritative_head`；ffmpeg 动态依赖/不可变 capsule、composition 外部签名/WORM、外部单调 HEAD 也均 pending。
- 当前 execution plan 已绑定 strict canonical future-adapter request envelope：exact keys、duplicate key/invalid UTF-8/unpaired surrogate 拒绝、canonical base64 visuals，以及 model/system/rendered-user/visual/seed/temperature/token/timeout/cache/tools 和 `inner_provider_retries=0`。`teacher-evidence-user-prompt-v1` 从 byte-preflight 已验证的同 case selected transcript 与固定 template/schema 确定重建；四臂 transcript/task/rules/schema 逐字一致，只改变中性 `visual-1` availability 与实际视觉输入，prompt 不暴露 private arm/case/Gold 标识。因此 `request_envelope_serialization_status=completed`、`user_prompt_derivation_status=completed`。
- 新增 `pi-openai-completions-fetch-boundary-v1` body serialization candidate：字段和插入顺序精确复现当前冻结 compat 下 Pi 0.84.1 `openai-completions` 的参数构造，即 system→user blocks、中性视觉标签与 data URL、`stream=true`、`stream_options.include_usage=true`、`store=false`、`max_completion_tokens`、temperature、seed；无工具历史且 `tools=[]` 时，provider body 必须省略 `tools`。视觉邻接标签保留图像 SHA，但 body 不携带 run/case/arm/idempotency 等本地 provenance，API key 也绝不进入 body/持久层。纯 builder 只能写 `provider_body_dispatch_status=pending_local_pi_fetch_boundary_proof_non_executable` 与 `pi_sdk_fetch_boundary_equivalence_status=pending_local_fake_fetch_proof`；plan/intent 只绑定 profile 与双 hash，不能因序列化成功自授 proof。
- `proveNonProductionFormalOraclePiFetchBoundary` 使用真实本地 Pi `Models.complete`（明确禁止 `completeSimple`）与 `openAICompletionsApi`，固定 compat/cache/session/tools/reasoning/sampling/retry 参数，把调用送入模块内部 `example.invalid` guard。exported proof 不接收 caller fetch 或 API key，也不读取环境 credential；它只用固定 dummy credential 与内建内存 Response，因此自身没有网络委托面。guard 逐字比较实际 OpenAI SDK `init.body` 与持久 candidate、检查 URL/POST/runtime Authorization/SDK 版本/单次 fetch/SDK retry-count=0，`onPayload` 只能比较并返回 `undefined`，不会替换 payload；`4200` 输入预算配 `2048` 输出上限时仍捕获 `max_completion_tokens=2048`，证明未经过 Simple token clamp。
- 本地 Response 现由 `formal-oracle-pi-response-stream-v1` 严格证明：raw SSE 保留精确字节/hash，冻结 LF-only framing，允许可选唯一空 `role=assistant` prelude、随后 1..N 个非空 content delta、唯一 `stop` finish、唯一 usage-only event 与最终唯一 `[DONE]`。每帧以 duplicate-aware JSON grammar 检查 exact key set 与整数词法，但合法 JSON 空白和字段顺序不属于语义合同；id/model/created/object/index 必须全流一致，禁止多 choice、unknown/tool/reasoning、length/error、重复 usage/finish/DONE、尾随内容，usage 必须自洽且分别不超过冻结 input/output token budget。通用 runtime-branded artifact 只声明 `untrusted_sse_entity_strict_derivation_only`，不自证输入来源；外层 Pi proof 才证明测试字节来自本次模块内部 fake fetch。proof 现具有排除 self 的独立 domain hash；Store 只接受 branded artifact 提交并按上文 A/B/C/D 持久化、reload 重派生。
- 完整 fetch entity 若在 strict SSE、assistant duplicate-aware JSON 或冻结 arm response schema 任一阶段失败，必须构造 `formal-oracle-invalid-response-v1` runtime-branded artifact；三阶段全通过反而不得构造。SSE 阶段失败只发布 A raw entity 与 domain-addressed invalid record；JSON/schema 阶段失败还发布并绑定 B derivation 与 C assistant bytes，但永不发布 D canonical response、usage/cost/stop/commit。Store 在同一锁内将该 attempt 直接提交为 `FAILED_CLOSED` terminal receipt，固定 `invalid_response_received` reason，禁止 retry/unknown 冒充，并在每次 reload 从 A 重跑完整 failure pipeline。该记录仍只证明传入的 complete fetch-observed entity 如何失败；真实 endpoint/header/raw capture/exactly-once 来源权威仍 pending，API 继续为 false。
- `.node-version` 固定开发/验收入口为 Node `22.23.2`，根与两个 application workspace 的 dev/test/typecheck/build/server/preview lifecycle 在任何工作前先 fail-fast 检查 `>=22.19.0`。composition 对 execution plan 的每个请求逐项运行真实 Pi 0.84.1 `Models.complete`（非 Simple）到模块内部 `example.invalid` fake fetch，验证 body 双根、SDK headers、单次 fetch、hidden retry=0、compat、完整内存 SSE 与相同兼容 runtime；持久 composition 按 `schedule_index` 保存完整 domain-addressed proof（含 strict SSE proof），公开 cross-validator 再以受信 execution plan 逐项闭合 request/model/input-output budgets，倒序、删重、计划错配或任意 proof root 均 fail closed。它仍没有 caller API key/fetch/env/endpoint入口，不会发网络请求，且不能证明真实 endpoint/account/response 来源。Pi/OpenAI 版本与源码哈希仍只叫 `observed_local_dependency_hashes`，不是可信 toolchain capsule；`provider_runtime_engine_status=compatible_runtime_proved_external_capsule_pending` 只关闭最低运行时版本门。OpenAI SDK fetch init 未绑定 `redirect:error`，因此 redirect policy 仍 pending。真实 endpoint/account、禁止重定向、外部可信 toolchain capsule、exactly-once/idempotency、timeout→unknown receipt、真实 provider SSE capture 与 model-specific tokenizer/image accounting 仍未完成；加上 rights/authenticity/WORM、external monotonic head、盲包与统计，`api_execution_allowed=false`。
- endpoint/account authority 第一层现已新增独立的 Ed25519 signed、内容寻址 `formal-oracle-transport-registry-v1`：它精确绑定 ledger registry、composition、run、execution plan、model、canonical HTTPS DNS-name endpoint 声明、provider/account/credential key ID、禁止 redirect、零 provider retry、Store 独占 retry、chat-completions 无 provider idempotency时的 fetch 后 unknown 永久阻断策略，并以 issued/expires 时间窗和同 signer create-once revocation fail closed。registry/撤销文件保持私有 `0700/0600`、拒绝 symlink/hardlink/宽权限；读取时持有 transport registry 跨进程锁直到 callback 结束。借出的 runtime-frozen capability 不可序列化、不含 API secret，只写 `endpoint_account_attested_only`。此层只校验 DNS 形式声明；single-consume sender 已在实际发送前重新检查 capability 有效期、解析全部 A/AAAA answer 并拒绝任何非 public IP，随后以 `agent:false` 的 one-shot HTTPS、pinned lookup 与实际 socket remote address/family 复核关闭本地 DNS/socket 复用绕过。运行时 DNS rebinding、redirect、endpoint/account active-head WORM 与可信 toolchain capsule仍须在正式执行组合门中持续复核，所以 `api_execution_allowed=false`。
- single-consume transport capture 薄片现已接入：Run Store 必须先把 envelope/body/intent/checkpoint 写入不可变对象并成功完成 HEAD CAS，唯一赢家才能在 callback 内取得不可序列化 lease；sender 一进入便原子消费该 lease，第二次或跨 callback 调用拒绝。sender 同时要求仍 active 的 signed transport capability 与外部 callback secret，逐字复验 authority/run/plan/model/envelope/body roots；解析 endpoint hostname 的全部 A/AAAA answers，任一非 canonical public IP 即发网前拒绝，随后让 HTTPS 使用原 hostname/TLS SNI 和选定 IP 的 pinned lookup，Node HTTPS 不自动跟随 redirect。Pi `Models.complete` 仍固定 hidden retry=0，`onPayload` 与实际 fetch body 双重 CAS。响应按 complete/partial/no-header 三态生成 domain-addressed capture record，绑定 normalized allowlist headers、HTTP/request ID、完整 DNS 集、selected IP、精确 entity SHA/长度；complete 与 partial entity bytes 都写入私有 `entity.bin`，Store 重启后从 record 重新读取并校验。complete 200 SSE 再分 strict result/invalid-response，partial/no-header 永远是 unknown/block，不能自动重试。此层仍不拥有 endpoint/account active-head WORM、可信运行时/toolchain capsule、model tokenizer/image accounting 或正式批量 execution gate，所以所有返回继续 `api_execution_allowed=false`。
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
| P0 | 字节级验证 source/static/uniform/oracle/语音账本 | 结构 preflight | hash、路径、真实解码、像素、时间、账本语义或来源不匹配 |
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
