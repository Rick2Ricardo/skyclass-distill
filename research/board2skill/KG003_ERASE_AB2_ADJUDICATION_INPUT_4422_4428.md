# KG003 ERASE A/B2 Adjudication Input — 4422–4428 s

Case: `kg003-erase-ab2-4422-4428`
Pair: `A1 ↔ B2-1`
Current state: **all review/signoff pending; candidate unset; accepted=false; accepted count=0; Gold blocked**

This form is a human adjudication input, not an adjudicated result. It uses [annotator A](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/annotator-a.json) and [strict-blind annotator B2](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/annotator-b2.json) only. A contaminated legacy B pass remains quarantined and was not read or used.

Machine-readable frozen input: [KG003_ERASE_AB2_ADJUDICATION_INPUT_4422_4428.json](KG003_ERASE_AB2_ADJUDICATION_INPUT_4422_4428.json)
Full comparison: [KG003_ERASE_AB2_ALIGNMENT_4422_4428.md](KG003_ERASE_AB2_ALIGNMENT_4422_4428.md)

## Frozen intake

| Item | Frozen value |
| --- | --- |
| A event | `a-delta-erase-01`, `4423.000–4425.167`, operation `erase` |
| B2 event | `kg003-b2-delta-erase-1`, `4423.033–4424.933`, operation `erase` |
| Temporal IoU | `0.876788` |
| Region IoU | `0.816532` |
| A before | `4422.000–4423.000`, left-censored, 1.000 s, below A minimum 2 s |
| B2 before | `4422.000–4423.033`, left-censored, 1.033 s, meets B2 minimum 1 s |
| A after | `4425.200–4427.933`, 2.733 s |
| B2 after | `4424.933–4427.967`, 3.034 s |
| A persistence | absent/visible restored through 4427.933; 2.766 s after A end |
| B2 persistence | absent/visible restored through 4427.967; 3.034 s after B2 end |
| Learner observations | empty |
| Pedagogical role | unknown |
| Teacher intent | unknown |

## Canonical ASR integrity

- Raw text: `这两个情况连立起来`
- Source segment indexes: `[0]`
- Source-local time: `0.000–6.140`
- Absolute time: `4422.000–4428.140`
- Normalization: `none`; normalized text: `null`
- Visual effect: none; this trace must not change event count, operation, boundary, state, surface, or persistence.

A clipped its SpeechSpan end to 4428.000; B2 retains the canonical 4428.140 end. The adjudication record must use the canonical source-local and absolute values above.

## Evidence panel

### Boundary start

- A: event starts `4423.000` — [A start frame](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/a-assets/frames/a-frame-031.png)
- B2: `4423.033` last intact, `4423.067` first changed — [last intact](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/evidence-frames/frame-4423.033.jpg), [first changed](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/evidence-frames/frame-4423.067.jpg)

### Boundary end and 4424.933 disagreement

- A labels 4424.933 as last-visible and closes at 4425.167 — [4424.933](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/a-assets/frames/a-frame-089.png), [4425.167 operation end](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/a-assets/frames/a-frame-096.png)
- B2 labels 4424.900 as last residual and 4424.933 as first fully absent — [4424.900](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/evidence-frames/frame-4424.900.jpg), [4424.933](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/evidence-frames/frame-4424.933.jpg)
- Direct comparisons: [A](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/a-assets/derived/a-erase-comparison.png), [B2](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/board-assets/comparison-4423.033-4424.933.png)

### After stability and persistence

- A: [after start 4425.200](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/a-assets/frames/a-frame-097.png), [confirm 4427.933](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/a-assets/frames/a-frame-179.png)
- B2: [first absent 4424.933](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/evidence-frames/frame-4424.933.jpg), [confirm 4427.967](../../data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/evidence-frames/frame-4427.967.jpg)

## Pending review record

All boxes are intentionally unchecked.

### 1. Event candidate

Select exactly one:

- [ ] `ERASE`
- [ ] `reject`
- [ ] `not_an_event`
- [ ] `unknown`

Rationale and evidence links:
`pending`

Reviewer: `pending`
Reviewed at: `pending`

### 2. Temporal boundaries

Start decision:

- [ ] A start `4423.000`
- [ ] B2 envelope start `4423.033`
- [ ] first changed frame `4423.067`
- [ ] custom/unknown: `pending`

End decision:

- [ ] B2 first-full-absence `4424.933`
- [ ] A operation-end `4425.167`
- [ ] custom/unknown: `pending`

Rationale and evidence links:
`pending`

Reviewer: `pending`
Reviewed at: `pending`

### 3. Before-state left censoring

- [ ] Left-censored evidence is sufficient for the selected candidate.
- [ ] Left-censored evidence is insufficient; select `reject` or `unknown` as appropriate.
- [ ] More pre-window evidence is required before decision.

Governing minimum-stability policy and rationale:
`pending`

Reviewer: `pending`
Reviewed at: `pending`

### 4. After-state stability

- [ ] After state begins at first full absence `4424.933`.
- [ ] After state begins after operation buffer at `4425.200`.
- [ ] Custom/unknown: `pending`.

Chosen stable interval and rationale:
`pending`

Reviewer: `pending`
Reviewed at: `pending`

### 5. ERASE persistence

- [ ] Visibility is restored and later absence is sufficient under the chosen boundary/policy.
- [ ] Persistence is insufficient.
- [ ] Persistence remains unknown.

Chosen `confirmed_until`, horizon, and rationale:
`pending`

Reviewer: `pending`
Reviewed at: `pending`

### 6. Canonical ASR trace

- [ ] Raw text, index `[0]`, local `0.000–6.140`, and absolute `4422.000–4428.140` are confirmed.
- [ ] Integrity problem found; describe without changing visual decisions.

Notes:
`pending`

Reviewer: `pending`
Reviewed at: `pending`

### 7. Evidence and hash integrity

- [ ] Both bundles remain contract-valid and payload hashes match.
- [ ] All declared assets remain present at repository-relative paths and hash-match.
- [ ] Frozen input file hashes match the machine-readable input.

Notes:
`pending`

Reviewer: `pending`
Reviewed at: `pending`

## Required signoffs

| Role | Status | Name | Signed at | Decision/notes |
| --- | --- | --- | --- | --- |
| Visual adjudicator | pending | pending | pending | pending |
| Data-governance reviewer | pending | pending | pending | pending |

## Release gate

Gold remains blocked until one allowed event candidate is selected, all seven reviews are completed, both required signoffs are recorded, and the signed decision is materialized in a separate adjudicated artifact. This input itself must remain `accepted=false` and must not be counted as Gold.
