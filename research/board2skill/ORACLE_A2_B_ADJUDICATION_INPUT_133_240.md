# Oracle A2/B 133–240 秒人工仲裁输入说明

## 状态与用途

本包覆盖 `phy-force-liyongle-004` 的源视频绝对时间 133–240 秒，共 7 个 A2/B 对齐组。它只是一份供人工复核和签字的仲裁输入，不是 Gold 标注，也不包含任何自动接受结果。

- `decision_status`: `pending_human`
- `review_states`: `pending`
- `paper_gold_status`: `blocked_pending_human_signoff`
- `automatic_promotion_allowed`: `false`
- 教学角色：`unknown`
- 学生/学习效果证据：未使用

机器可读入口：[ORACLE_A2_B_ADJUDICATION_INPUT_133_240.json](ORACLE_A2_B_ADJUDICATION_INPUT_133_240.json)

## 固定输入与哈希

| 输入 | 路径 | SHA-256 |
|---|---|---|
| A2 后半段 | [annotator-a-extension-133-240.json](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-a-extension-133-240.json) | `5f1f5f47b8c9370e978b07d93c7ef4a62053db60b273c070a44a7645560c8dcc` |
| B 标注 | [annotator-b.json](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b.json) | `4d079190ac20e9657b82aa20612810071c55319e1181e824dfd28c4111092bb4` |
| 对齐说明 | [ORACLE_A2_B_ALIGNMENT_133_240.md](ORACLE_A2_B_ALIGNMENT_133_240.md) | `3b70aa6920586a426c19065c6ac03ff9d30b84c72e114adf5930ff51917843a0` |
| 标注规范 | [DATA_AND_ANNOTATION_SPEC.md](DATA_AND_ANNOTATION_SPEC.md) | `4068892dd320772a1743ba2b464a92a1d66084abcfd2c0c3d2d2edb287ad57d3` |
| 运行时契约 | [temporal-board.ts](../../packages/contracts/src/temporal-board.ts) | `db231fc43433624252d8d014a64264173ef770e63c0b362b5397dbaf0b0f29f8` |
| 原始 ASR 上下文 | [clip-12-240.json](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/asr/clip-12-240.json) | `d53b23e1e0156c3d36db7d98dd3131b876d777e13ab25999fab769a85c45177f` |
| 源视频 | [source.mp4](../../data/raw/physics/force-pilot/phy-force-liyongle-004/source.mp4) | `3811c42fb32f36e27754926062a1280b0b576edee91adca0d0a8f9a5362ad6d9` |

ASR 文件的时间是相对 `clip-12-240` 的时间；换算到源视频绝对时间需加 12 秒。JSON 中的 `asr_segment_indexes` 直接引用原始 segment 索引，`raw_text` 是相应 `text` 字段按原样拼接，未纠错、未规范化。它只提供上下文，不能作为自动仲裁、说话者身份、教学意图或学生反应的事实证据。

## 对齐组摘要

| 组 | A2 事件 | B 事件 | 待签建议 | 候选时间与操作 | 主要未决字段 |
|---|---|---|---|---|---|
| G01 | d011 + d012 | B-DELTA-09 | split | 138.00–140.00 ADD；140.25–148.00 ADD | 标注是 `F₁=1/5mg`、`N-mg=mg/5` 还是不可读；split/merge；状态和对象 ID |
| G02 | d013 | B-DELTA-10 | merge | 152.25–154.75 ADD | ADD/CONNECT；边界；状态和对象 ID |
| G03 | d014 + d015 | B-DELTA-11 | split | 158.50–163.50 CONNECT；164.50–167.75 ADD | split/merge；连接锚点；角字母 `α`/`θ`/不可读 |
| G04 | d016 | B-DELTA-12 | merge | 177.00–186.50 ADD | 时间边界；可见转写/规范数学格式；状态和对象 ID |
| G05 | d017 | B-DELTA-13 | merge | 187.75–197.00 ADD | 时间边界；可见转写/规范数学格式；状态和对象 ID |
| G06 | d018 | B-DELTA-14 | merge | 198.25–206.00 ADD | 时间边界；末项是 `=`、`≈` 还是不可读；状态和对象 ID |
| G07 | d019 | B-DELTA-15 | merge | 224.00–237.25 ADD | 前缀是 `>` 式符号、`2.`、`二` 还是不可读；时间边界；状态和对象 ID |

表中的 merge/split、时间、operation 和 semantic label 都只是 `proposed` 候选。人工签字前不得编译为 accepted 或 Gold。

## 逐组证据与待签建议

### G01：箭头与文字是否拆分

- A2：`d011` 在 138.00–140.00 添加竖直向上箭头；`d012` 在 140.25–148.00 添加其旁文字。证据：[d011 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/a2-extension-comparisons/d011-before-after.jpg)、[d012 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/a2-extension-comparisons/d012-before-after.jpg)。
- B：`B-DELTA-09` 在 138.50–150.20 将箭头和约 `N-mg=mg/5` 的文字合为一个 ADD。证据：[B 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/comparisons/delta-09-before-after.jpg)、[B mask](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/masks/delta-09-region-mask.png)。
- 待签建议：split 为两个 ADD；候选标签分别为“新增竖直向上的合力分量箭头”和“建议转写：`F₁=1/5mg`”。
- ASR 原文（segments 42–46，仅上下文）：那我们是不是可以先把这个人所受到的支持力和重力先合起来 对吧 这个力有多大 支持力1.2MG 减重力MG 那就是1/5MG 所以这个人在数值方向就受到一个1/5MG的力
- 未决：公式可见转写、事件粒度、前后状态和对象 ID。

### G02：水平力箭头是 ADD 还是 CONNECT

- A2：`d013` 在 152.25–154.75 标为 CONNECT。证据：[A2 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/a2-extension-comparisons/d013-before-after.jpg)。
- B：`B-DELTA-10` 在 151.50–155.00 标为 ADD。证据：[B 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/comparisons/delta-10-before-after.jpg)、[B mask](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/masks/delta-10-region-mask.png)。
- 待签建议：merge 为一个 152.25–154.75 ADD，标签“新增水平向右的摩擦力箭头 `f`”。依据规范，新物理向量通常是 ADD；只有存在两个持久锚点、新连接对象和明确关系时才满足 CONNECT。
- ASR 原文（segment 47，仅上下文）：这个人在水平方向还受到一个向右的摩擦
- 未决：ADD/CONNECT、边界、前后状态和新对象 ID。

### G03：几何连接与角标是否拆分

- A2：`d014` 在 158.50–163.50 补几何连接，`d015` 在 164.50–167.75 添加角弧和角标。证据：[d014 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/a2-extension-comparisons/d014-before-after.jpg)、[d015 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/a2-extension-comparisons/d015-before-after.jpg)。
- B：`B-DELTA-11` 在 158.50–166.20 合并为 CONNECT。证据：[B 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/comparisons/delta-11-before-after.jpg)、[B mask](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/masks/delta-11-region-mask.png)。
- 待签建议：split 为一个 158.50–163.50 CONNECT（补右侧竖边与 `F合` 对角线）和一个 164.50–167.75 ADD（角弧与 `α=30°`）。
- ASR 原文（segments 49–52，仅上下文）：必然和加速度方向一致 那是不是朝右上呢 对不对 这是河力 而且河力的方向必然与水平方向也夹30度角吧
- 未决：事件粒度、连接对象与持久锚点、角字母。

### G04：摩擦力结果

- A2：`d016`，177.00–186.50 ADD，标签“在向量图右侧写 `f=√3/5mg`”。证据：[A2 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/a2-extension-comparisons/d016-before-after.jpg)。
- B：`B-DELTA-12`，176.80–185.50 ADD，标签“添加摩擦力结果 `f=√3mg/5`”。证据：[B 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/comparisons/delta-12-before-after.jpg)、[B mask](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/masks/delta-12-region-mask.png)。
- 待签建议：merge 为 177.00–186.50 ADD，候选可见转写 `f=(√3/5)mg`。
- ASR 原文（segments 58–61，仅上下文）：所以摩擦力有多大 一个角是30度的直角三角形 这个长边应该是短边的更耗3倍吧 5分之更耗3MG 对不对
- 未决：时间边界、可见转写与规范数学格式、前后状态、对象 ID、最终 comparison/mask。

### G05：合力方程

- A2：`d017`，187.75–197.00 ADD，标签“`F合=2/5mg=ma`”。证据：[A2 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/a2-extension-comparisons/d017-before-after.jpg)。
- B：`B-DELTA-13`，188.00–201.00 ADD，标签“`F合=2mg/5=ma`”。证据：[B 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/comparisons/delta-13-before-after.jpg)、[B mask](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/masks/delta-13-region-mask.png)。
- 待签建议：merge 为 187.75–197.00 ADD，候选可见转写 `F合=(2/5)mg=ma`。
- ASR 原文（segments 62–66，仅上下文）：不仅如此我还可以把河力求出来 河力是这个斜边 这是1/5MG 斜边应该是2/5MG 又因为2/5MG 这个河力它应该等于MA 所以这个加速度A 是不就算出来了
- 未决：时间边界、可见转写与规范数学格式、前后状态、对象 ID、最终 comparison/mask。

### G06：加速度结论

- A2：`d018`，198.25–206.00 ADD，标签“`∴a=2/5g=4m/s²`”。证据：[A2 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/a2-extension-comparisons/d018-before-after.jpg)。
- B：`B-DELTA-14`，201.50–207.50 ADD，标签“`a=2g/5≈4m/s²`”。证据：[B 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/comparisons/delta-14-before-after.jpg)、[B mask](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/masks/delta-14-region-mask.png)。
- 待签建议：merge 为 198.25–206.00 ADD，候选可见转写 `∴a=(2/5)g=4m/s²`。
- ASR 原文（segments 65–67，仅上下文）：又因为2/5MG 这个河力它应该等于MA 所以这个加速度A 是不就算出来了 2/5G 大约是4米每二次方面 对吧
- 未决：时间边界、末项关系符号、前后状态、对象 ID、最终 comparison/mask。

### G07：新方法标题的前缀

- A2：`d019`，224.00–237.25 ADD，将前缀看作 `>` 式符号。证据：[A2 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/a2-extension-comparisons/d019-before-after.jpg)。
- B：`B-DELTA-15`，224.50–235.80 ADD，将前缀转写为 `2.`。证据：[B 对比](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/comparisons/delta-15-before-after.jpg)、[B mask](../../data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b-assets/masks/delta-15-region-mask.png)。
- 待签建议：merge 为 224.00–237.25 ADD，核心标签只保留确定可见部分“正交分解法”。
- ASR 原文（segments 75–79，仅上下文）：如果没有办法把多个粒转化成两个粒的话 那我们就使用第二个思路 也就是正交分解法 正交分解法 政調分解法我們在處理 經理學問題的時候已經使用過了
- 未决：前缀字形、时间边界、前后状态、对象 ID、最终 comparison/mask。

## 人工签字流程

1. 视觉仲裁员逐组查看 A2/B 对比图、B mask 和必要原帧，在 JSON 的 `items[].human_review` 中给出决定、审核者 ID、时间和备注；没有把握的字段继续留在 `unresolved_fields`。
2. 涉及公式字符、力学关系或 ADD/CONNECT 规范的项目由物理复核者二次检查。不得用 ASR 自动覆盖可见板书。
3. 只有 7 组均有明确人工决定，且最终事件、对象、状态和证据引用均完整后，才可计算签字 payload 的 SHA-256 并写入 `signature_sha256`。
4. 编译门还应检查 `package_signoff` 的两类审核者、签字时间和完整 group ID 列表；在此之前必须维持 `paper_gold_status=blocked_pending_human_signoff`。

当前 JSON 中 7 个 `human_review` 均严格为：

```json
{
  "decision": "pending",
  "reviewer_id": null,
  "reviewed_at": null,
  "signature_sha256": null,
  "notes": ""
}
```

任何脚本都不得把 `proposed` 直接解释为人工决定，也不得从本 intake 生成 accepted BoardDelta、accepted teaching transition 或论文 Gold 声明。
