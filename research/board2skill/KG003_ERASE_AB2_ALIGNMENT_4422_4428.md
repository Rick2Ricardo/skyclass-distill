# KG003 ERASE A/B2 Alignment — 4422–4428 s

Status: **alignment complete; adjudication and all signoffs pending; 0 accepted; Gold blocked**.

## Governance boundary

This alignment uses only independent annotator A and strict-blind annotator B2. A contaminated legacy B pass exists but remains quarantined: it was not read and is not an input, source, evidence item, voter, or tie-breaker.

Allowed adjudication outcomes are `ERASE`, `reject`, `not_an_event`, and `unknown`. This document does not automatically accept either independent annotation.

## Intake validation

| Input | Actual file SHA-256 | Contract | Canonical payload | Declared assets |
| --- | --- | --- | --- | ---: |
| [Annotator A bundle](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/annotator-a.json) | `6d8c5d2314df1667df76934cf64b8021e1bf355137a9bc3401829951b0e61aed` | valid, 0 issues | match: `2f78499602e304a34e8a2922840566fb6bf5b9d7bec839b9c32896e48cb0a81a` | 10/10 exist and hash-match |
| [Strict-blind B2 bundle](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/annotator-b2.json) | `81b934663d7573b6e1b4da66bd2f8d31e424bdb6645f6b537088e443e8165ec9` | valid, 0 issues | match: `574f8a38e9fc302a27991a27ef132038345ccdd2a1c27c593956713a73fc7751` | 20/20 exist and hash-match |

Every asset URI is repository-relative. No missing, escaping, or absolute asset path was found.

## Canonical ASR trace

The canonical source is [clip-4422-4428.json](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/asr/clip-4422-4428.json), actual SHA-256 `fad1323b0ea85dd9f9b1fdf8e91b2933a28c6308ad7f22584ad96df245d5de03`.

| Field | Canonical value | A | B2 |
| --- | --- | --- | --- |
| raw | `这两个情况连立起来` | exact match | exact match |
| source segment indexes | `[0]` | exact match | exact match |
| local time | `0.000–6.140` | source index preserved | source index preserved |
| absolute time | `4422.000–4428.140` | `4422.000–4428.000`, clipped by 0.140 s | exact match |
| normalization | `none`, normalized text `null` | match | match |

The adjudication input preserves the source-local and absolute canonical times. The A clipping is recorded as an intake discrepancy; it has no effect on the frozen visual evidence or event boundaries.

## Unique event alignment

There is exactly one one-to-one pair and no unmatched event on either side:

| Pair | A | B2 | Match |
| --- | --- | --- | --- |
| `kg003-erase-ab2-pair-1` | A1 → `a-delta-erase-01` | B2-1 → `kg003-b2-delta-erase-1` | unique one-to-one |

The two annotations agree on event count, affected right-side red handwritten block, `erase` operation, unobstructed disappearance, fixed digital-ink surface, later persistent absence, before-window left censoring, empty learner evidence, and unknown pedagogical role/teacher intent.

## Agreement metrics

| Measure | Value |
| --- | ---: |
| Temporal intersection | 1.900 s |
| Temporal union | 2.167 s |
| Temporal IoU | 0.876788 |
| Region IoU | 0.816532 |
| B2 start − A start | +0.033 s |
| B2 end − A end | −0.234 s |
| A after-state start − B2 after-state start | +0.267 s |
| B2 persistence confirmation − A confirmation | +0.034 s |

The B2 region is fully contained within A's larger region rectangle; the remaining difference is margin convention rather than a second object/event.

## Boundary and stability comparison

| Field | A1 | B2-1 | Review state |
| --- | --- | --- | --- |
| Event time | `4423.000–4425.167` (2.167 s) | `4423.033–4424.933` (1.900 s) | pending |
| Start interpretation | operation envelope starts at 4423.000 | 4423.033 last-intact; 4423.067 first-change | pending |
| End interpretation | 4424.933 labelled last-visible; operation ends 4425.167 | 4424.900 last residual; 4424.933 first fully absent | pending |
| Before stable | `4422.000–4423.000` (1.000 s) | `4422.000–4423.033` (1.033 s) | pending |
| Before left-censored | yes; below A's 2 s minimum | yes; meets B2's 1 s minimum | pending policy ruling |
| After stable | `4425.200–4427.933` (2.733 s) | `4424.933–4427.967` (3.034 s) | pending |
| Visibility restored | true | true | agreement; signoff pending |
| Absent from after state | true | true | agreement; signoff pending |
| Confirmed until | 4427.933 | 4427.967 | agreement within 0.034 s; signoff pending |
| Horizon after each delta end | 2.766 s | 3.034 s | both sufficient under their own configs; governing policy pending |

## Evidence for signoff

### Annotator A

- [A before/after comparison](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/a-assets/derived/a-erase-comparison.png) — `c26c140f936379cf68d58c79125d6cd9c5d1987d21e8ad0c49ad34b015b7c001`
- [A delta mask](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/a-assets/derived/a-erase-mask.png) — `978fb90fd0ad54f1bd6648eba181fb152372071f13a14db93c1d565362e6b40d`
- [A frame at 4424.933](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/a-assets/frames/a-frame-089.png) — annotated as last-visible
- [A operation-end frame at 4425.167](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/a-assets/frames/a-frame-096.png)
- [A after-start frame at 4425.200](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/a-assets/frames/a-frame-097.png)
- [A persistence frame at 4427.933](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/a-assets/frames/a-frame-179.png)

### Strict-blind annotator B2

- [B2 before/after comparison](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/board-assets/comparison-4423.033-4424.933.png) — `125a65beb5c760c7c2f7807dc82510785189b691bdb9929ee560657716662a80`
- [B2 delta mask](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/board-assets/delta-mask-4423.033-4424.933.png) — `440851c7d022f17f7d0847c17ca13b34eedbce2b6e2de9e8c75c66c5cdbfa38a`
- [B2 last-intact frame at 4423.033](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/evidence-frames/frame-4423.033.jpg)
- [B2 first-change frame at 4423.067](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/evidence-frames/frame-4423.067.jpg)
- [B2 last-residual frame at 4424.900](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/evidence-frames/frame-4424.900.jpg)
- [B2 first-absent frame at 4424.933](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/evidence-frames/frame-4424.933.jpg)
- [B2 persistence frame at 4427.967](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/evidence-frames/frame-4427.967.jpg)

## Required adjudication rulings

1. Select exactly one event outcome: `ERASE`, `reject`, `not_an_event`, or `unknown`.
2. Resolve the event start and end; custom boundaries require an evidence citation and rationale.
3. Decide whether the left-censored before state is sufficient and which minimum-stability policy governs.
4. Resolve whether the after state starts at first full absence or after a later operation buffer.
5. Confirm or reject erase persistence under the chosen end boundary.
6. Confirm the canonical ASR raw/index/time trace without using it to alter visual facts.

Until these reviews and both required signoffs are complete, `candidate_decision=null`, `accepted=false`, accepted count is 0, and Gold remains blocked.

Machine-readable handoff: [KG003_ERASE_AB2_ADJUDICATION_INPUT_4422_4428.json](KG003_ERASE_AB2_ADJUDICATION_INPUT_4422_4428.json).
