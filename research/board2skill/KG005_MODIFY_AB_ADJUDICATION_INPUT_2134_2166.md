# KG005 2134–2166 s A/B 仲裁签字输入

Package：`kg005-modify-ab-adjudication-2134-2166`
状态：`pending_human_review` / `pending_human_signoff`
accepted：`0`
Paper Gold：`blocked_pending_human_signoff`

本文件是供人工裁决与签字的输入，不是 Gold。机器可读记录见 [`KG005_MODIFY_AB_ADJUDICATION_INPUT_2134_2166.json`](KG005_MODIFY_AB_ADJUDICATION_INPUT_2134_2166.json)，详细对齐理由见 [`KG005_MODIFY_AB_ALIGNMENT_2134_2166.md`](KG005_MODIFY_AB_ALIGNMENT_2134_2166.md)。

## 输入核验

- 源视频：[`source.mp4`](../../data/raw/physics/force-pilot/phy-force-kunge-005/source.mp4)，`source_video_id = phy-force-kunge-005`，duration `8790.021451 s`，绝对源时间窗 `[2134.000, 2166.000] s`。
- A bundle：[`annotator-a.json`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/annotator-a.json)，文件 SHA-256 `ddf5c619fc53c5ac8f329660897387e9e5b9895be572e5ba19f45e09dbd39c85`，payload `ac301ff70c74d1a6c4fea7852cf3ce952d15cc7c9cc11d544afcd65d541bf40a`，contract/payload/assets `PASS`。
- B bundle：[`annotator-b.json`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/annotator-b.json)，文件 SHA-256 `53e6dc47c13685a4865556980780a27375a9a4cdcbe51956b627f0f62cfc146c`，payload `d085bc5b0bd64c15d247570295b2b842f9b412ba5b3a41db2418bc13b4783265`，contract/payload/assets `PASS`。
- canonical ASR：[`clip-2134-2166.json`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/asr/clip-2134-2166.json)，SHA-256 `72a435476427fceb9c23acd01092bed0566387fc64f4c1c6ffab91f358d87d76`。
- 对齐覆盖：5 组，4 matched / 0 A-only / 1 B-only；A4/B8 各且仅覆盖一次。
- 资产：A 53 refs / 29 unique，B 82 refs / 43 unique；缺失 `0`、非法路径 `0`、hash mismatch `0`。
- 教师单人录屏；pedagogical role=`unknown`，teacher intent=`unknown`，learner observations=`[]`，learner effect=`unknown`。

## 裁决硬约束

每组必须从以下集合中人工选择或明确组合：`ERASE`、`ADD`、`atomic ERASE+ADD`、`MODIFY`、`unknown`、`reject`、`not_an_event`。当前没有任何预选项或 accepted 项。

`MODIFY` 只有在以下五项全部成立时可签：同一语义槽、明确 old object、明确 new object、可陈述的实质 old→new 语义或关系变化、relation closure。空间相同、同槽重写或同文重写本身均不够。页面切换、滚动、视口/缩放、工具框和指示动作不得计为事件。ASR 仅保留原始 trace，不得改变视觉 operation，也不得补 role/intent/student。

## G01 — B-only 窗首圈注补笔

- A：无 delta。
- B：`kg005-b-d01`，ADD，`2134.10–2135.10`；[`comparison`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/b-deltas/b-d01-comparison.png)。
- 分歧：B 把右下两个红圈补笔作为独立 ADD；A 把该区域并入窗首已有旧演算块。B 标记 `left_window_censored`。
- old/new/relation：没有可对齐的 A old/new 对；MODIFY 不闭合。

人工 decision：`pending`

- [ ] ERASE
- [ ] ADD
- [ ] atomic ERASE+ADD
- [ ] MODIFY（须补齐 gate）
- [ ] unknown
- [ ] reject
- [ ] not_an_event

Canonical boundary：`pending`
Canonical objects：`pending`
Rationale/evidence：`pending`

## G02 — 擦除右下旧演算

- A：`kg005-a-delta-01`，ERASE，`2136.30–2137.60`；[`comparison`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/assets/deltas/delta-01-comparison.png)。
- B：`kg005-b-d02`，ERASE，`2136.30–2137.80`；[`comparison`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/b-deltas/b-d02-comparison.png)。
- tIoU：`0.866667`。B 终点晚 `0.20 s`。
- 对象分歧：A 是一个复合旧演算对象；B 还纳入 G01 圈注。这里有 old、无 new，因此 MODIFY 不闭合。

人工 decision：`pending`（允许集合：ERASE / ADD / atomic ERASE+ADD / MODIFY / unknown / reject / not_an_event）
Canonical boundary：`pending`
Canonical objects：`pending`
Rationale/evidence：`pending`

## G03 — 新增主公式

- A：`kg005-a-delta-02`，ADD，`2140.27–2154.77`；[`comparison`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/assets/deltas/delta-02-comparison.png)。
- B：`kg005-b-d03`，ADD，`2140.20–2154.90`；[`comparison`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/b-deltas/b-d03-comparison.png)。
- tIoU：`0.986395`。A 晚开始 `0.07 s`、早结束 `0.13 s`。
- 对象分歧：A 为 shell + numerator-v1；B 为 formula-core + numerator-1；两侧都落在 `k = F r² / (I₁ I₂ Δl₁ Δl₂)` 槽。只有 new、无 old，因此 MODIFY 不闭合。

人工 decision：`pending`（允许集合：ERASE / ADD / atomic ERASE+ADD / MODIFY / unknown / reject / not_an_event）
Canonical boundary：`pending`
Canonical objects/region：`pending`
Rationale/evidence：`pending`

## G04 — 分数线末端与等号生命周期

- A：`kg005-a-delta-03`，ADD，`2158.10–2158.27`；[`comparison`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/assets/deltas/delta-03-comparison.png)。
- B：`kg005-b-d04` ADD `2156.60–2158.30`（[`comparison`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/b-deltas/b-d04-comparison.png)）→ `kg005-b-d05` ERASE `2158.90–2159.00`（[`comparison`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/b-deltas/b-d05-comparison.png)）→ `kg005-b-d06` ADD `2159.90–2160.20`（[`comparison`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/b-deltas/b-d06-comparison.png)）。
- A 对 B 包络 tIoU：`0.047222`；A 对 B d04 tIoU：`0.100000`。
- 对象/operation 分歧：A 只保留一个持久等号 ADD；B 分出分数线延长、等号1擦除、等号2重写。
- old/new/relation：B 的等号1与等号2处于同槽且都读作 `=`；没有实质语义差，也没有改变的 relation。不得仅因同槽替换判 MODIFY。

人工 decision：`pending`

- [ ] 一个持久 ADD
- [ ] 分数线 ADD + 等号 atomic ERASE+ADD
- [ ] 完整 ADD→ERASE→ADD 原子序列
- [ ] MODIFY（填写 old/new、实质差异、relation closure）
- [ ] unknown
- [ ] reject
- [ ] not_an_event

Canonical boundary/object sequence：`pending`
Old object / New object：`pending` / `pending`
Substantive semantic change：`pending`
Relation closure：`pending`
Rationale/evidence：`pending`

## G05 — 分子同槽擦除重写

- A：`kg005-a-delta-04`，unknown，`2162.90–2165.10`；[`comparison`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/assets/deltas/delta-04-comparison.png)。
- B：`kg005-b-d07` ERASE `2163.00–2163.30`（[`comparison`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/b-deltas/b-d07-comparison.png)）→ `kg005-b-d08` ADD `2164.20–2165.10`（[`comparison`](../../data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/b-deltas/b-d08-comparison.png)）。
- tIoU：`0.954545`。A 比 B 擦除开始早 `0.10 s`，包络终点一致。
- old/new/relation：两侧 old/new 都位于分子槽，且均读作 `F r²`。物理对象替换存在，但实质语义变化未见；当前证据支持 atomic ERASE+ADD 或 unknown，不支持 MODIFY。

人工 decision：`pending`

- [ ] ERASE
- [ ] ADD
- [ ] atomic ERASE+ADD
- [ ] MODIFY（须新增实质 old→new 差异与 relation closure 证据）
- [ ] unknown
- [ ] reject
- [ ] not_an_event

Canonical boundary/object sequence：`pending`
Old object / New object：`pending` / `pending`
Substantive semantic change：`pending`
Relation closure：`pending`
Rationale/evidence：`pending`

## canonical ASR 原文/index/time

以下文本不纠错；relative 为 ASR 文件原时间，absolute 为 `2134 + relative`。index 2、17 是未映射上下文。

| index | relative s | absolute source s | raw text | map |
|---:|---:|---:|---|---|
| 0 | 0.00–2.30 | 2134.00–2136.30 | 乘以比平方除以千克的平方就推出来 | G01（B） |
| 1 | 2.56–4.10 | 2136.56–2138.10 | 同样道理这一道题也是啊对不对 | G02 |
| 2 | 4.36–5.88 | 2138.36–2139.88 | 你就先推码这才第二道题 | context only |
| 3 | 6.14–6.64 | 2140.14–2140.64 | k | G03 |
| 4 | 6.90–8.44 | 2140.90–2142.44 | 他就等于fr平方 | G03 |
| 5 | 8.70–9.98 | 2142.70–2143.98 | 就是力乘以距离的平方 | G03 |
| 6 | 10.24–11.26 | 2144.24–2145.26 | 再除以之一道 | G03 |
| 7 | 11.52–14.60 | 2145.52–2148.60 | i1i2然后delta有1delta有2这还挺长的对不对 | G03 |
| 8 | 14.86–15.88 | 2148.86–2149.88 | i1i2 | G03 |
| 9 | 16.14–16.90 | 2150.14–2150.90 | 然后是delta | G03 |
| 10 | 17.16–18.18 | 2151.16–2152.18 | 相当于delta有1 | G03 |
| 11 | 18.44–19.46 | 2152.44–2153.46 | delta有2 | G03 |
| 12 | 21.24–22.02 | 2155.24–2156.02 | delta有2 | G04（B） |
| 13 | 22.28–23.04 | 2156.28–2157.04 | 那你现在来看 | G04（B） |
| 14 | 23.56–24.06 | 2157.56–2158.06 | 他的单位 | G04 |
| 15 | 24.32–25.08 | 2158.32–2159.08 | 就只看单位啊 | G04 |
| 16 | 25.86–26.36 | 2159.86–2160.36 | 那么 | G04（B） |
| 17 | 26.62–28.16 | 2160.62–2162.16 | 仔细观察一下选项里面没有牛顿 | context only |
| 18 | 28.42–31.76 | 2162.42–2165.76 | 所以他肯定是把利用千克米每23秒 | G05 |

## Package 签字

- Coverage A4/B8 unique：`pending`
- All group decisions reviewed：`pending`
- Reviewer：`pending`
- Reviewed at：`pending`
- Signer：`pending`
- Signed at：`pending`
- Signature：`pending`
- Accepted group IDs：`[]`
- Rejected group IDs：`[]`
- Gold promotion：`blocked_pending_human_signoff`
