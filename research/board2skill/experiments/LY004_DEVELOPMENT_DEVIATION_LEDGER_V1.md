# LY004 开发实验偏差台账 v1

> 本文件在 replacement block 执行前冻结。所有偏差均保留，不把失败或重试包装成完整随机观察。

## D-01：排除 generation seed 20260815

- 原计划 block：`ly004-development-seed-02.json`，generation seed `20260815`。
- 原始完整输出中，`ly004-known-condition/oracle_delta` 的 provider `attempt_count=2`；它违反协议“一请求一次 provider attempt”。
- 该整批 8 项永久排除，原目录原样移至 gitignored `data/board2skill/oracle-gate-development/archive/run-02-retry-contaminated-20260814`，不得进入盲评或统计。
- 在运行器改为硬性单次 attempt 后，曾对相同 block 做一次整批完整重跑；执行中收到 schema 非法响应并立即失败，runner 未发布 run 目录。该失败也不得继续重试或补单项。

## D-02：预注册 replacement block

- replacement spec：`ly004-development-seed-04.json`
- generation seed：`20260817`
- 替换单位：完整 `2 cases × 4 arms` block，共 8 项；不替换单个响应。
- 运行约束：`maxAttempts=1`。任一请求失败，则整个 replacement block 失败，当前开发门转 `BLOCKED`，不再挑选新的 replacement seed。
- 最终三块仅允许：`20260814, 20260816, 20260817`。选择发生在读取 replacement 结果之前。

该偏差使本轮成为有透明偏差记录的开发方向门，而非严格无偏正式实验；无论结论如何均禁止作为 Paper evidence。
