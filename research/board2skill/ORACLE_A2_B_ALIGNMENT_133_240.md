# Oracle A2/B alignment intake: `phy-force-liyongle-004`, 133–240 s

Date: 2026-08-12

Status: alignment intake only; no accepted Gold events

Source A2 SHA-256: `5f1f5f47b8c9370e978b07d93c7ef4a62053db60b273c070a44a7645560c8dcc`
Source B: `data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-b.json`

## Protocol boundary

A2 was frozen before this comparison and states that it did not consult B, the prior disagreement ledger, Gold-dev, or distillation outputs. This document aligns the two independent passes after freezing; it is not a human adjudication record and does not promote any item beyond `needs_review`.

Only visible, persistent board changes are compared here. A2 did not use time-aligned ASR and therefore left speech, teaching intent, pedagogical role, learner state, and learning effect unknown. B-side inferred pedagogical-role labels are explicitly excluded from agreement and must not enter Gold without separate evidence and adjudication.

## Event alignment

| A2 event(s) | B event | Visible-content agreement | Main disagreement | Intake decision |
|---|---|---|---|---|
| d011 `138.00–140.00`; d012 `140.25–148.00` | B-DELTA-09 `138.50–150.20` | Both recover an upward vector followed by a `1/5 mg`-scale label | A2 splits drawing and equation; B merges them and labels the expression as approximately `N-mg=mg/5`, while the stable board is visually closer to `F₁=1/5mg` | High-priority adjudication. Preserve A2's two-step candidate until ASR and original-resolution review decide the semantic text and boundary |
| d013 `152.25–154.75` | B-DELTA-10 `151.50–155.00` | Both recover the rightward `f` arrow from the existing origin | A2 calls this `CONNECT`; B calls it `ADD` | Strong match on content and time. Operation requires relation-anchor adjudication; do not collapse to ADD merely because a new object appears |
| d014 `158.50–163.50`; d015 `164.50–167.75` | B-DELTA-11 `158.50–166.20` | Both recover completion of the resultant construction and the `30°` angle | A2 separates geometric connection from the later angle mark; B merges both | High-priority granularity adjudication. The visible pause supports retaining two candidates unless the annotation policy freezes a compound-event rule |
| d016 `177.00–186.50` | B-DELTA-12 `176.80–185.50` | Both recover `f=√3/5mg` | Boundary differs by about one second; equivalent fraction typography differs only in notation | Strong agreement candidate; boundary and exact transcription still require original-resolution plus ASR review |
| d017 `187.75–197.00` | B-DELTA-13 `188.00–201.00` | Both recover `F合=2/5mg=ma` | B's interval extends later than A2's equation-completion boundary | Strong agreement candidate; prefer event-specific dense-frame boundary after human review |
| d018 `198.25–206.00` | B-DELTA-14 `201.50–207.50` | Both recover the acceleration conclusion ending in `4m/s²` | Start differs by 3.25 s; A2 includes the initial conclusion symbol and symbolic equality | Strong content agreement, material boundary disagreement; review 4 fps frames and ASR before acceptance |
| d019 `224.00–237.25` | B-DELTA-15 `224.50–235.80` | Both recover the new `正交分解法` method heading | A2 describes the leading mark as `>`-like; B transcribes it as `2.`; boundaries differ slightly | Accept only the shared heading text as a candidate fact; keep the prefix glyph unresolved |

## Agreement summary

- A2 has 9 candidate deltas; B has 7 over the same interval.
- Every B event has a visible-content counterpart in A2.
- The count difference is explained by two granularity splits: arrow versus equation, and geometric connection versus angle annotation.
- Content agreement is strongest for the three solution equations and the method heading.
- The most consequential disagreements are operation type for the `f` arrow, compound-event policy, equation start/end boundaries, and ambiguous handwritten symbols.
- Neither pass supplies evidence of student behavior or learning outcomes.

## Proposed adjudication order

1. Freeze the atomic-event policy: a persistent pause or a change from drawing to equation/label should normally create a new delta unless an explicit compound-event exception applies.
2. Review original-resolution 4 fps boundaries for d011–d015 and d017–d018.
3. Align timestamped ASR to determine what the teacher calls `F₁`, `F合`, `f`, the angle, and the second method.
4. Require `CONNECT` relation anchors before accepting d013/d014 under the temporal-board-v2 contract.
5. Produce a human-signable ledger with `accept`, `merge`, `split`, `hold`, and final time/operation/semantic text for each aligned group.
6. Compile a new engineering Gold-dev version only after the ledger is signed; paper Gold remains blocked on final human sign-off.

## Explicit non-results

This alignment does not calculate inter-annotator agreement, does not assert paper-Gold quality, and does not authorize four-arm outcome reporting. The A2 draft uses a lightweight annotation schema rather than a complete `BoardEvidenceBundle`, so it must be transformed and validated before it can enter the executable pipeline.
