# LY004 region-claim 解耦 FIX 实验（预注册 v1）

> 状态：在任何 FIX 响应生成前冻结。仅用于决定是否进入正式 Gold；不是 Paper evidence。

## 假设与唯一干预

原始开发门唯一阻断 GO 的错误来自 Oracle response 把“区域位置”与“ADD 操作”捆绑成一个事实 claim，而冻结评分分母不评价 region。

本轮唯一改动是 prompt version 从 `oracle-gate-prompt-v1` 变为 `oracle-gate-prompt-v2-region-claim-decoupled`，新增规则：

- 操作类型、板书内容、区域位置必须分开；
- region 只作为 `observed_board_actions.region` 的定位元数据；
- 除非评分任务明确评价空间位置，否则不得为 region 单独生成 evidence claim。

模型、输入 bundle、两个 case、四个 arm、三个 generation seed、温度、输出 schema、视觉预算、最大 token、无缓存、无工具、单次 attempt、盲法与评分协议全部保持不变。

## 固定矩阵

- cases：`ly004-known-condition`, `ly004-question-pair`
- arms：`transcript_only`, `static_final_board`, `uniform_frame`, `oracle_delta`
- seeds：`20260818, 20260819, 20260820`
- 总请求：24；任一请求失败则整门 `BLOCKED`，不补跑、不选择替代 seed。

## 成功门

先按原协议选择最强非 Oracle baseline。只有同时满足以下条件才从 FIX 升级为 GO：

1. Oracle mean Evidence F1 ≥ `0.9434523809523809`；
2. Oracle Edit Content = `1.0`；
3. Oracle ADD Operation = `1.0`；
4. Oracle Unsupported Rate = `0`；
5. 两个 case 的 mean paired F1 delta 都 > 0，且至少 4/6 pair > 0；
6. Oracle hard failure = 0。

若完整数据但任一条件不满足，结论为 `FIX_STOP`：停止扩大 Gold并重审表示/分母。评分缺失或生成失败为 `BLOCKED`。
