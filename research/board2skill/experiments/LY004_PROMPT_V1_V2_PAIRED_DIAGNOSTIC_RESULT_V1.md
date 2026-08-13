# LY004 prompt-v1/v2 同 seed 配对诊断结果 v1

> 结论：**REGION_FIX_RETAINED**。这是两名 Agent 按外部隔离流程在同一轮联合盲包上产生的开发诊断证据；代码可证明两份评分绑定同一矩阵和同一 item 集，互不可见性仍是流程性声明。它不是因果估计、人工专家评分、正式 Gold、论文结果或学生学习效果证据。

## 冻结与盲法

- 预注册提交 `717ada6` 先于全部新增 v2 响应。
- 比较单元：`prompt version × 3 seeds × 2 cases × 4 arms = 48` 项。
- v1/v2 共用 seeds `20260814, 20260816, 20260817`；新增 v2 的24项全部 `attempt_count=1`。
- 历史 v1 与新增 v2 在同一个48项联合盲包中重新评分，没有复用历史评分CSV。
- 公共ID经独立HMAC重盲；R1/R2只看各自不同顺序的item-only视图，不知道version、seed、case、arm或配对关系。
- 机械结果绑定联合矩阵、私有重盲映射、两份评分视图和配对单元的域分隔哈希；输入不完整或任一根漂移时只产生 `BLOCKED`，不沿用旧科学分支。

## 机械结果

Oracle arm 的同seed配对 F1 差（v2 - v1）：

| 汇总 | 平均差 | 预注册下限 |
|---|---:|---:|
| 全部6对 | **+0.0161** | -0.02 |
| known-condition 3对 | -0.0333 | -0.05 |
| question-pair 3对 | **+0.0655** | -0.05 |

其他门：

- v2 Oracle 的6项 unsupported count 全为0；
- hard failure为0；
- `question-pair` 中摩擦力问题和加速度问题的独立恢复率均未下降，v2相对v1平均提升1.0；
- 因此优先命中预注册分支 `REGION_FIX_RETAINED`。

## 科研解释

region-claim 解耦应保留：在本次3个配对seed中，它消除了 Oracle 的region unsupported，而同seed Oracle F1没有越过预注册下降阈值。此前不同seed FIX实验中观测到的F1下降与seed波动解释相容；本诊断不能把差异严格因果归因于seed，也不能把结果升级成正式GO。

值得注意的是，非Oracle arms在同seed下也有波动，尤其uniform-frame平均F1差为`-0.206`。prompt v2按设计只新增一条通用claim规则，却可能改变所有arms的输出行为；因此下一步正式价值门必须继续把四臂全部纳入，而不能只看Oracle arm。

## 下一步

不再修改region规则，也不继续追加探索性prompt补丁。下一步新建一个预注册确认门：固定prompt v2，扩展到更多已签事件/课程，并以四臂、多个教师、同一评分合同检验Oracle增益是否跨样本成立。在该确认门通过前，仍不扩大为Paper Gold或学生效果主张。
