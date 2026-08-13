# Gold Adjudication Batch 01 V1

## 1. Scope

This is the first human adjudication handoff under the stable-semantic-state policy in `DATA_AND_ANNOTATION_SPEC.md §3.4.1`. It contains 12 review groups:

- 3 mechanically clean KG005 calibration groups;
- 2 KG005 same-slot rewrite stress cases;
- all 7 LY004 groups, the smallest single-component lesson.

Frozen inputs:

- parent repository commit: `0b6c5273c81c7bcbddbcada9b1a86da65164c762`
- Gold queue JSON SHA-256: `9d5ddd5a7b2a36a51543039d14c6f4974031d6546c558a0558ef7cc6521bfeb9`
- workset SHA-256: `f3ce9eec7e92e9998171e21444b35d29a9e773f87b4c408b11a0bf7de702905e`
- annotation policy SHA-256: `ac3cfd01ce7278c3a35fe9a6112cabaa71b0569bd39711f652854c840993b0e2`

This file contains machine pre-review recommendations, not Gold decisions. Reviewers must inspect the linked frozen evidence independently. No reviewer identity, decision record, package signoff, or accepted event is created by this document.

## 2. Frozen decision policy

Apply these checks in order:

1. If the visible board surface, before/after state, or persistence horizon is insufficient, choose `unknown` or `reject`.
2. If stable before and after carry the same semantic content, choose `not_an_event`; retain any intermediate erase/rewrite only as source trace.
3. If new persistent content appears while prior content remains, choose `ADD`.
4. If a prior persistent object is absent in a clear stable after-state, choose `ERASE`.
5. Use `MODIFY` only for a substantive, traceable old→new semantic change in the same slot.
6. Use `CONNECT` only when a new mark explicitly relates at least two persistent anchors. A new force vector is an `ADD`, not automatically a `CONNECT`.
7. Speech is `context_not_gold`: it may disambiguate a visible glyph but may not add content that is absent from the visual evidence.

## 3. Machine pre-review recommendations

| Order | Package / group | Candidate(s) | Recommended human outcome | Evidence-bound caveat |
|---:|---|---|---|---|
| 1 | `kg005-modify-ab-adjudication-2134-2166 / KG005-AB-G01` | `KG005-AB-G01-C1` | inspect for `accept / ADD` | Two lower red emphasis circles are newly completed and persistent; confirm that both belong to one event envelope |
| 2 | same / `KG005-AB-G02` | `KG005-AB-G02-C1` | inspect for `accept / ERASE` | A/B both show the lower-right working block removed and still absent in later clear frames |
| 3 | same / `KG005-AB-G03` | `KG005-AB-G03-C1` | inspect for `accept / ADD` | A/B agree on a new persistent `k = F r² / (I₁ I₂ Δl₁ Δl₂)` formula; confirm exact subscripts and delta glyphs |
| 4 | same / `KG005-AB-G04` | `KG005-AB-G04-C1` | inspect for `accept / ADD` at `2159.90–2160.20 s` | Stable net change is no trailing equals sign → one trailing equals sign. The final persistent sign is written in B event `kg005-b-d06`; the earlier trial `ADD → ERASE` is source trace and is excluded from the main-event boundary; do not label `MODIFY` |
| 5 | same / `KG005-AB-G05` | `KG005-AB-G05-C1` | inspect for `not_an_event` | Stable before/after numerator both read `F r²`; physical erase/rewrite has no substantive semantic delta and must not be labeled `MODIFY` |
| 6 | `tbv2-ly-004-01-a2-b-133-240-human-intake / G01` | `G01-C1`, `G01-C2` | inspect for two `accept / ADD` events | First is a new vertical resultant/component arrow; second is its magnitude annotation. Confirm whether the visible identifier is `F₁`, an upward-force mark, or another glyph before final transcription |
| 7 | same / `G02` | `G02-C1` | inspect for `accept / ADD` | The new horizontal rightward arrow labeled `f` is a physical force-vector object. It does not connect two prior anchors, so `CONNECT` is not justified |
| 8 | same / `G03` | `G03-C1`, `G03-C2` | inspect for `CONNECT` then `ADD` | The queue normalizes `G03-C1.relation_candidate` into anchors `B-O10 → B-O11` with relation type `resultant_of_perpendicular_force_components`, so the current contract can express the `CONNECT`. Human review must still verify that both anchors persist and the new mark actually closes that relation. C2 separately adds the angle arc/label; transcribe only visibly supported `30°`, without inventing `α` or `θ` if unreadable |
| 9 | same / `G04` | `G04-C1` | inspect for `accept / ADD` | New persistent equation appears. Confirm the exact visible form of `f = (√3/5)mg` from the comparison, not subtitles alone |
| 10 | same / `G05` | `G05-C1` | inspect for `accept / ADD`, with boundary/text correction if needed | A-side frame at 197 s clearly supports `F合 = (2/5)mg`; B-side later state supports the continuation toward `=ma`. Include `=ma` only if the chosen event end reaches a clear stable frame that visibly contains it |
| 11 | same / `G06` | `G06-C1` | inspect for `accept / ADD` | Confirm whether the final relation before `4 m/s²` is `=` or `≈`; speech says “大约” and may not overwrite the visible glyph |
| 12 | same / `G07` | `G07-C1` | inspect for `accept / ADD` | `正交分解法` is visibly added. Exclude the leading bullet/ordinal from semantic text unless its glyph is independently legible |

If all recommendations survive independent review, this batch would decide 12/52 groups and contribute at most 13 accepted semantic events. Those counts are projections only; they remain zero until real decision records are written.

## 4. Reviewer worksheet

Each reviewer fills this independently before discussion. Blank cells are intentional.

| Group | Visual reviewer outcome | Physics reviewer outcome | Exact visible transcription | Boundary/persistence note | Final adjudication after discussion |
|---|---|---|---|---|---|
| `KG005-AB-G01` |  |  |  |  |  |
| `KG005-AB-G02` |  |  |  |  |  |
| `KG005-AB-G03` |  |  |  |  |  |
| `KG005-AB-G04` |  |  |  |  |  |
| `KG005-AB-G05` |  |  |  |  |  |
| `LY004 / G01` |  |  |  |  |  |
| `LY004 / G02` |  |  |  |  |  |
| `LY004 / G03` |  |  |  |  |  |
| `LY004 / G04` |  |  |  |  |  |
| `LY004 / G05` |  |  |  |  |  |
| `LY004 / G06` |  |  |  |  |  |
| `LY004 / G07` |  |  |  |  |  |

Disagreement is not failure. Keep the group undecided until both reviewers can state the evidence difference. The adjudicator may choose `unknown`, `reject`, or `not_an_event`; no quota requires accepting a group.

## 5. Stop conditions

Stop this batch without signing the affected component package if any of the following occurs:

- exact visible mathematical content cannot be resolved without using subtitles or speech as a substitute for the board;
- a candidate needs a source event, asset, or time range absent from the frozen intake;
- the two reviewers disagree about whether a stable semantic state change exists;
- a final event would require silently changing a non-`unknown` candidate operation;
- the current queue SHA-256 or any evidence asset SHA-256 changes.

After adjudication, package signoff remains a separate action. A reviewer who enters or discusses a group decision does not automatically provide either package-level signoff.
