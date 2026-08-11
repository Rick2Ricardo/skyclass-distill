# KG005 2134–2166 s Temporal Board v2 A/B 对齐单

状态：`pending_human_review`；人工签字：`pending`；accepted：`0`；Paper Gold：`blocked_pending_human_signoff`。

本单只对齐两份独立视觉标注，不作自动裁决，也不把同一空间位置或擦后重写自动解释为 `MODIFY`。只有人工确认同一语义槽、明确旧对象、明确新对象、且旧→新发生了实质语义/关系变化，才可选择 `MODIFY`。页面切换、滚动、工具框和指示动作不是板书事件。

## 输入与冻结范围

- 源视频：[`phy-force-kunge-005/source.mp4`](../../data/raw/physics/force-pilot/phy-force-kunge-005/source.mp4)，`source_video_id = phy-force-kunge-005`，duration `8790.021451 s`，SHA-256 `127ed9323274d0dd00f3cc39c4a3b68f3109d74dbfd7fb2d08f87cab008f7241`。
- 绝对源时间窗：`[2134.000, 2166.000] s`。本文件所有边界均为完整源视频绝对秒。
- Annotator A：[`annotator-a.json`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/annotator-a.json)，4 个 delta，文件 SHA-256 `ddf5c619fc53c5ac8f329660897387e9e5b9895be572e5ba19f45e09dbd39c85`，payload SHA-256 `ac301ff70c74d1a6c4fea7852cf3ce952d15cc7c9cc11d544afcd65d541bf40a`。
- Annotator B：[`annotator-b.json`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/annotator-b.json)，8 个 delta，文件 SHA-256 `53e6dc47c13685a4865556980780a27375a9a4cdcbe51956b627f0f62cfc146c`，payload SHA-256 `d085bc5b0bd64c15d247570295b2b842f9b412ba5b3a41db2418bc13b4783265`。
- canonical ASR：[`clip-2134-2166.json`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/asr/clip-2134-2166.json)，SHA-256 `72a435476427fceb9c23acd01092bed0566387fc64f4c1c6ffab91f358d87d76`；仅作原始语音 trace，不改变视觉 operation，也不补 role/intent/student。
- 规范：[`DATA_AND_ANNOTATION_SPEC.md`](DATA_AND_ANNOTATION_SPEC.md)；contract：[`temporal-board.ts`](../../packages/contracts/src/temporal-board.ts)。

两 bundle 均通过 `temporal-board-v2` contract、payload 重算、引用资产存在性/路径/SHA 检查。A 的 53 次资产引用归并为 29 个唯一资产，B 的 82 次引用归并为 43 个唯一资产；均无缺失或 hash 不符。两侧所有 delta/transition 均为 `needs_review`，accepted 数为 0；learner observation 均为空。

## 唯一覆盖结论

共 5 个对齐组：4 个 matched、0 个 A-only、1 个 B-only。A 的 4/4 与 B 的 8/8 delta 各出现且只出现一次。

| 组 | 对齐类 | A delta | B delta | A/B operation | 边界与对象分歧 | 待人工裁决 |
|---|---|---|---|---|---|---|
| KG005-AB-G01 | B-only | — | `kg005-b-d01` | — / ADD | B 在 `2134.10–2135.10` 记录右下两个红圈补笔；A 将其视为窗首已有旧演算块的一部分。B 明示 `left_window_censored`。 | 是否存在稳定、可独立计数的窗内 ADD；也可判 `not_an_event`/reject/unknown。 |
| KG005-AB-G02 | matched | `kg005-a-delta-01` | `kg005-b-d02` | ERASE / ERASE | A `2136.30–2137.60`，B `2136.30–2137.80`，tIoU `0.866667`。A 擦除对象为整块旧演算；B 还包含 G01 圈注。 | ERASE 的终点与对象集合；若 G01 不成立，B 的圈注对象不得单独进入 Gold。 |
| KG005-AB-G03 | matched | `kg005-a-delta-02` | `kg005-b-d03` | ADD / ADD | A `2140.27–2154.77`，B `2140.20–2154.90`，tIoU `0.986395`。两侧均为 `k = F r² / (I₁ I₂ Δl₁ Δl₂)` 公式槽，但对象切分、ROI 和 OCR 表述略异。 | 统一 ADD 边界、区域与对象切分；无 old 对象，因此不闭合 MODIFY。 |
| KG005-AB-G04 | matched compound/granularity dispute | `kg005-a-delta-03` | `kg005-b-d04`,`kg005-b-d05`,`kg005-b-d06` | ADD / ADD→ERASE→ADD | A 只记录 `2158.10–2158.27` 的持久等号 ADD；B 从 `2156.60–2160.20` 分出分数线延长、首个等号、擦除及重写。A 对 B 合并包络 tIoU `0.047222`（对 B d04 为 `0.100000`）。B old/new 等号都读作 `=`。 | 可保留一个 ADD、拆成原子事件、判 atomic ERASE+ADD、unknown、reject 或 not_an_event。仅凭同槽同文不得判 MODIFY；须另证实实质 old→new 变化。 |
| KG005-AB-G05 | matched compound/granularity dispute | `kg005-a-delta-04` | `kg005-b-d07`,`kg005-b-d08` | unknown / ERASE→ADD | A `2162.90–2165.10`，B 包络 `2163.00–2165.10`，tIoU `0.954545`。两侧都观察分子槽擦除重写；old/new 对象均读作 `F r²`。 | 首选审查 atomic ERASE+ADD 或 unknown；若动作/持久性不足也可 not_an_event/reject。没有实质语义差异时不得判 MODIFY。 |

覆盖账本：

- A：`kg005-a-delta-01`→G02；`kg005-a-delta-02`→G03；`kg005-a-delta-03`→G04；`kg005-a-delta-04`→G05。
- B：`kg005-b-d01`→G01；`kg005-b-d02`→G02；`kg005-b-d03`→G03；`kg005-b-d04`/`d05`/`d06`→G04；`kg005-b-d07`/`d08`→G05。
- A-only：无。B-only：仅 `kg005-b-d01`。

## 分组仲裁要点

### G01 — 窗首圈注补笔（B-only）

- 边界：B `2134.10–2135.10`；A 无事件。因为动作在左边界后仅 `0.10 s` 开始，存在明显 left-censor 风险。
- 对象槽：B `kg005-b-obj-circle-completion`；A 的 `kg005-a-object-prior-working` 是更粗的复合旧演算对象。
- old/new 与关系：B 仅提供新增圈注对象，没有可独立对齐的 A old/new 对；MODIFY 不闭合。
- 允许选择：`ADD`、`ERASE`、`atomic ERASE+ADD`、`MODIFY`、`unknown`、`reject`、`not_an_event`。其中 `MODIFY` 只有补获左窗前 old 对象并证明实质变化后才可签。

### G02 — 擦除右下旧演算

- 边界：开始一致 `2136.30`；B 结束比 A 晚 `0.20 s`。
- operation：两侧一致 ERASE。
- 对象：A 擦除一个复合旧演算对象；B 擦除旧演算加 G01 圈注对象。G01 的存在性会影响最终对象集合，但不改变这里没有 new 对象的事实。
- old/new 与关系：有 old、无 new，不满足 MODIFY 闭合。

### G03 — 新增主公式

- 边界：A 相对 B 晚开始 `0.07 s`、早结束 `0.13 s`。
- operation：两侧一致 ADD。
- 对象：A 切为 shell 与 numerator-v1；B 切为 formula-core 与 numerator-1。两侧文本可对齐到同一公式槽，但规范化对象边界仍需人工选择。
- old/new 与关系：有 new、无 old，不满足 MODIFY 闭合；ASR 只可帮助定位语音，不可替代视觉 OCR。

### G04 — 分数线末端/等号生命周期

- 边界：A 的短 ADD 落在 B d04 的尾部；A 未分出 B 在 `2158.90–2159.00` 的擦除及 `2159.90–2160.20` 的重写。
- operation：A=ADD；B=ADD（分数线延长+等号1）→ERASE（等号1）→ADD（等号2）。
- 对象槽：分数线延长是独立 ADD 槽；等号1/等号2占同一空间语义槽，且文本都为 `=`。
- old/new 与关系：B 提供物理 old/new 对，但没有实质语义变化证据，也没有改变的关系类型；空间同位和书写替换本身不构成 MODIFY。
- 人工可签方案：一个持久 ADD；分数线 ADD + 等号 atomic ERASE+ADD；完整 ADD→ERASE→ADD；unknown；reject/not_an_event。MODIFY 仅在人工发现可陈述的实质 old→new 属性或关系变化时可选，并须填写 old/new object 与 relation closure。

### G05 — 分子同槽擦除重写

- 边界：A 比 B 的擦除开始早 `0.10 s`，两者都在 `2165.10 s` 结束。
- operation：A 刻意保留 unknown；B 拆成 ERASE→ADD。
- 对象槽：A numerator-v1→numerator-v2；B numerator-1→numerator-2；前后视觉文本都为 `F r²`。
- old/new 与关系：old/new 对象存在，空间槽闭合，但实质语义变化不成立；因此目前证据支持 atomic ERASE+ADD/unknown，而不支持 MODIFY。
- 若人工最终选择 MODIFY，必须额外填写：old 的确切语义、new 的确切语义、两者差异、被改变的 relation，以及对应帧证据；任一缺失都应退回 atomic ERASE+ADD 或 unknown。

## canonical ASR 原文 trace

ASR 时间原始为片段相对秒；下表同时保留原 index、原相对时间和换算后的完整源绝对时间（`absolute = 2134 + relative`）。文本逐字保留，不纠错。事件关联采用 bundle transition 的显式 speech refs；index 2、17 仅为未映射上下文，不能据此补 operation/role/intent/student。

| index | relative s | absolute source s | raw text | event group |
|---:|---:|---:|---|---|
| 0 | 0.00–2.30 | 2134.00–2136.30 | 乘以比平方除以千克的平方就推出来 | G01（B 显式） |
| 1 | 2.56–4.10 | 2136.56–2138.10 | 同样道理这一道题也是啊对不对 | G02 |
| 2 | 4.36–5.88 | 2138.36–2139.88 | 你就先推码这才第二道题 | 未映射上下文 |
| 3 | 6.14–6.64 | 2140.14–2140.64 | k | G03 |
| 4 | 6.90–8.44 | 2140.90–2142.44 | 他就等于fr平方 | G03 |
| 5 | 8.70–9.98 | 2142.70–2143.98 | 就是力乘以距离的平方 | G03 |
| 6 | 10.24–11.26 | 2144.24–2145.26 | 再除以之一道 | G03 |
| 7 | 11.52–14.60 | 2145.52–2148.60 | i1i2然后delta有1delta有2这还挺长的对不对 | G03 |
| 8 | 14.86–15.88 | 2148.86–2149.88 | i1i2 | G03 |
| 9 | 16.14–16.90 | 2150.14–2150.90 | 然后是delta | G03 |
| 10 | 17.16–18.18 | 2151.16–2152.18 | 相当于delta有1 | G03 |
| 11 | 18.44–19.46 | 2152.44–2153.46 | delta有2 | G03 |
| 12 | 21.24–22.02 | 2155.24–2156.02 | delta有2 | G04（B 显式） |
| 13 | 22.28–23.04 | 2156.28–2157.04 | 那你现在来看 | G04（B 显式） |
| 14 | 23.56–24.06 | 2157.56–2158.06 | 他的单位 | G04 |
| 15 | 24.32–25.08 | 2158.32–2159.08 | 就只看单位啊 | G04 |
| 16 | 25.86–26.36 | 2159.86–2160.36 | 那么 | G04（B 显式） |
| 17 | 26.62–28.16 | 2160.62–2162.16 | 仔细观察一下选项里面没有牛顿 | 未映射上下文 |
| 18 | 28.42–31.76 | 2162.42–2165.76 | 所以他肯定是把利用千克米每23秒 | G05 |

## 人工签字区

- Reviewer：`pending`
- Reviewed at：`pending`
- 对齐组覆盖确认（A4/B8，各一次）：`pending`
- G01 decision：`pending`
- G02 decision：`pending`
- G03 decision：`pending`
- G04 decision：`pending`
- G05 decision：`pending`
- role/intent：`unknown` / `unknown`
- learner observations/effect：`[]` / `unknown`
- Package sign-off：`pending`
- Gold promotion：`blocked_pending_human_signoff`
