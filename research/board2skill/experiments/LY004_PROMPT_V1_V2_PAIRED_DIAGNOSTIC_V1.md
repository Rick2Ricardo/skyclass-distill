# LY004 prompt-v1/v2 同 seed 配对诊断（预注册 v1）

> 状态：在任何诊断响应生成前冻结。仅解释 FIX_STOP 的失败来源，不改变既有 FIX_STOP 结论，不是正式 Gold 或论文证据。

## 问题

region-claim 解耦 FIX 达成了 `Unsupported Rate=0`、`Edit=1`、`ADD=1`，但 Oracle Evidence F1 从上一批 seeds 的 `0.943` 降到新 seeds 的 `0.860`。由于两轮 generation seeds 不同，不能把差异直接归因于 prompt v2。

## 设计

- 既有 prompt-v1 观测：seeds `20260814, 20260816, 20260817`。
- 新增 prompt-v2 观测：使用完全相同的三个 seeds；每个 seed 恰执行 `2 cases × 4 arms = 8` 个请求。
- 唯一计划配置改动：`prompt_version` 从 `oracle-gate-prompt-v1` 改为 `oracle-gate-prompt-v2-region-claim-decoupled`。provider/backend时间不可同步控制，因此结果只作诊断关联，不作严格因果估计。
- 模型、bundle、case、arm、温度、token、cache、tools、输出 schema、视觉输入与评分分母保持冻结。
- 全部请求必须 `attempt_count=1`；任一失败则诊断 `BLOCKED`，不补跑、不换 seed。
- `seed_index` 保留旧 v1 的 `0/2/3`；配对主键是 `generation_seed + case_id + arm`。
- 生成完成后，把历史 v1 的24项与新增 v2 的24项合成一个48项盲包，重新随机排列并由同一轮R1/R2独立评分；不得复用历史 rating CSV 作为v1 comparator，避免评分session混杂。

## 联合重盲规则

- 新私有 joint-blind seed 文件的字节SHA-256承诺：`55f0c1a1815f24165e3433a42baf4ea95fbddd10c151e6a8d0d05a79993d5f49`。私有seed不入Git，必须在生成前匹配该承诺。
- ID域：`skyclass/ly004-prompt-paired-diagnostic/joint-blind-id/v1\0`。
- 对每个原始item生成 `J-` + `HMAC-SHA256(joint_seed_bytes, domain || canonical_json({version_tag,source_run_manifest_sha256,original_blind_id}))` 的前24个小写hex；`version_tag`只能为`prompt-v1`或`prompt-v2`。
- canonical JSON使用UTF-8、key按字典序、无额外空白。生成器必须拒绝HMAC碰撞，并强制48项/48个唯一新ID。
- public item只含新`blind_id`、固定evidence card、response、response hash，不得含original blind/pair ID、prompt version、seed、case、arm、run或request标识。
- private map保存新ID到`version_tag + generation_seed + case + arm + original blind/pair ID + source roots`的映射；R1/R2排序只对新ID应用已冻结的排序域。

## 冻结旧 v1 comparator roots

- specs：`0e57376c934f4290ad98f674da9c7806d8c8bbf9ea79a02fccc865154bff2856`, `563752f33a56870bec85d96e8a58777c7342808254a5b7a42d387fe7ab8548f2`, `d03092896ae69c27c4901b634eb3ce2149c37f670fad2dce408fd6bd61c627c0`；
- run manifests：`b51b4abb7cf3ef602b482960f0bbbacaa16f540335e7de11ecab57ef9a467f80`, `8caa8da0e02c5ac55fdc79f7aa6d699553ffd63a43a2ce3e09f0d86743b3b1ea`, `9a1bf687e88b0b3d19e019bb3dee52a3042300f66b8b0ec44b8dcdb42b8237d8`；
- blind items：`2293b1e46bfeb84e5e7fc226ec1a622fc74a5e5718bd8149c057d88f9e66ea14`, `49535c78090f26504e1ef04314172c9ba8fd2288c8b144621a7e093045574b82`, `a3ed41585790853f981bd623352a265b610a74f7b418ee2ee585a33e901a94b7`；
- private records：`7a56568a2d4c62a7a1c73d3a690c41fba3163a0d327fd12d7e809c2a01dd0385`, `188ba6c353186d4819220990863bac50a40de48e78a48f2e548a52f85b7c114d`, `6f439388e435ad3bf8100526db834ef7b9c44d4929e6cd631477c8f76d207343`；
- pilot root：`d180f8bf33429ffeb7769feb5bdea3a76f90161306309c9adceefb4a42ece09f`；answer keys：`fc820c7aec7c404c7c89c8dfb3a4ff94303945d338347f7b0e38b6eb7e4d3f37`, `05ad6916a9795cd52ba9ab7273dd5057f92279b3b03c97e058acfd9374d53d22`, `6e6864d6a1447e4c5c403a37e0d8d4f480fd83effb2074fff68d9742caf4f52b`；
- 原评分定义：`LY004_DEVELOPMENT_VALUE_GATE_V1.md` = `eb12f5a038220a9988dc0da3d89b8b26d9cc78200d945a49b83838723613a01f`；
- 新联合评分模板：`ly004-prompt-paired-diagnostic-rating-template-v1.csv`（其SHA在本预注册提交中与本文共同冻结）。

联合盲包的R1/R2排序域固定为 `skyclass/ly004-prompt-paired-diagnostic/rater-order/{rater}/v1\0`。公开item仍只包含 opaque blind ID、固定evidence card、response和response hash；private map保存 `prompt_version + generation_seed + case + arm`，评分者不可见。

## 主要诊断量

先在每个 `case × arm × seed` 内计算 `v2 - v1`：

1. Evidence F1 差；
2. Unsupported Claim Rate 差；
3. Edit Content 与 ADD Operation 差；
4. 对 `question-pair`，新增两个冻结二元评分列：`friction_question_recovered` 与 `acceleration_question_recovered`。只有独立的 factual claim 明确指出相应物理量的问题或待求目标时记1；“两个问题”“两个待求量”等合并表述两个都记0。其他case记NA。

按 case 与 arm 等权汇总，不用跨 seed 的未配对均值替代配对差。

## 机械诊断规则

按R1/R2先等权合并，再计算6个Oracle配对：

1. `REGION_FIX_RETAINED`：Oracle v2 的6项unsupported count均为0，且mean paired F1 delta `v2-v1 >= -0.02`，两个case各自mean delta都 `>= -0.05`。
2. `ATOMIC_QUESTION_CONTRACT_NEEDED`：不满足1；`question-pair`三个Oracle配对的mean delta `< -0.05`，且v2的两个question recovery平均值至少一项比v1下降 `>=0.25`；同时`known-condition` mean delta `>= -0.05`。
3. `REPRESENTATION_REDESIGN`：前两项均不满足时的唯一完整数据fallback；两个case的Oracle mean delta都 `< -0.05` 或至少两个非Oracle arms的全局mean delta `< -0.05` 是该分支的重要失败证据，但不是额外分支。
4. 数据/评分不完整、任何attempt不等于1、root漂移或两名评分者盲包不闭合：`BLOCKED`。

分支优先级固定为 `BLOCKED → REGION_FIX_RETAINED → ATOMIC_QUESTION_CONTRACT_NEEDED → REPRESENTATION_REDESIGN`。即使1成立，也只表示结果与“没有重要配对下降”一致，不得宣称下降由seed波动导致。

无论哪种结果，本诊断都不直接产生 GO；必须先形成新的预注册价值门，才允许进入正式 Gold。
