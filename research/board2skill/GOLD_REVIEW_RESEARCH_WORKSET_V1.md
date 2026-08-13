# Gold Review Research Workset V1

## 1. Purpose and evidence boundary

This workset turns the current Board2Skill Gold queue into an executable human-review order. It is a research handoff, not a decision ledger:

- it does not accept or reject any group;
- it does not create reviewer identities or signatures;
- it does not treat `acceptance_ready` as human acceptance;
- it does not promote speech context to Gold evidence;
- it does not change any frozen intake, candidate, image, or source-video bytes.

Frozen source snapshot:

- repository commit: `16f583b8b4cf0a3873f499416031344e10291149`
- Gold queue JSON SHA-256: `9d5ddd5a7b2a36a51543039d14c6f4974031d6546c558a0558ef7cc6521bfeb9`
- queue shape: 6 component packages, 4 derived lessons, 52 groups, 54 candidates, 379 verified evidence assets
- human state: 0 decided groups, 0 accepted events, 0 signed packages

The immediate research objective is to produce a human-audited SignedGold v2 dataset with all 52 groups decided, at least 30 accepted events, and two distinct signers per component package. Until then, single-lesson confirmation and the 144-request multi-lesson experiment remain blocked.

## 2. Review tiers

| Tier | Groups | Meaning | Required action |
|---|---:|---|---|
| A — quick confirmation | 3 | Candidate is mechanically acceptance-ready and has no unresolved fields | Inspect comparison and source frames; accept only if visible content, operation, timing, and region all agree |
| B — bounded human review | 45 | Candidate is mechanically acceptance-ready, but one or more human boundary fields remain | Resolve only the listed fields; do not rewrite unaffected candidate content |
| C — specialist adjudication | 4 | Operation or visible semantic content is not acceptance-ready | Keep fail-closed until the specific evidence question below is resolved |

### Tier A: quick confirmation

All three are in `kg005-modify-ab-adjudication-2134-2166`:

1. `KG005-AB-G01` — proposed `ADD`
2. `KG005-AB-G02` — proposed `ERASE`
3. `KG005-AB-G03` — proposed `ADD`

These are the first useful calibration items for the two human reviewers. Agreement here does not authorize later items; it only establishes the working interpretation of operation, visible text, region, and persistence.

### Tier B: bounded human review

Review in this order so that the first complete lesson can be compiled as early as possible:

1. `tbv2-ly-004-01-a2-b-133-240-human-intake`: 7 groups / 9 candidates. All groups have speech context and this is the smallest single-component lesson. Main questions are exact time, visible transcription, region, and whether `G02` is `ADD` or `CONNECT`.
2. `kg005-erase-add-ab-1888-1905`: `KG005-AB-001` and `KG005-AB-002`. Resolve the transient-toolbar/start boundary and object/region granularity.
3. `tbv2-kg-003-01-a-b-2720-2880-human-intake`: 19 groups. All candidates are `ADD`; review exact time, semantic transcription, region, and a small number of event-existence/granularity disagreements.
4. `tbv2-ly-003-01-a-b-702-922-human-intake`: 17 groups. All candidates are `ADD`, but speech context is absent. Review from visual evidence only and allocate the required state/object identities without inventing spoken intent.

The dominant unresolved categories are not four new scientific hypotheses. They are annotation closure work: operation/event existence, time boundary, semantic transcription, region, object granularity, and state/object identifiers.

## 3. Tier C: four blocked groups

### C1. KG003 erase — visible semantic transcription missing

- package: `kg003-erase-ab2-4422-4428`
- group: `kg003-erase-ab2-pair-1`
- frozen operation candidate: `ERASE`
- window: 4423.000–4425.167 s
- speech context: “这两个情况连立起来” (`context_not_gold`)

Visual pre-review indicates that the right-side red derivation is removed while the lower-left formulas remain. The erased region appears to contain two red lines, including a fraction relation beginning with `μmg` and a lower relation resembling `√3 + μ′ = 2`. Glyphs, subscripts/primes, and the exact transcription remain a human decision; this workset intentionally does not convert that reading into Gold.

Required decision:

- transcribe only the visibly erased ink;
- choose the event start/end policy for the left-censored before state and persistence horizon;
- confirm that the 4424.933 s evidence shows full absence;
- reject or keep `unknown` if any affected glyph cannot be resolved without invention.

### C2. KG005 clip-end disappearance — right-censored persistence

- package: `kg005-erase-add-ab-1888-1905`
- group: `KG005-AB-003`
- current operation: `unknown`
- window: 1904.666667–1904.967 s

The comparison shows a terminal disappearance near the clip boundary, but there is no sufficient after-state horizon. Do not force `ERASE` from the last frame alone.

Required decision:

- obtain post-clip evidence from the source video and prove persistence, then adjudicate `ERASE`; or
- retain `unknown` / reject the candidate if that evidence cannot be recovered.

### C3. KG005 G04 — compound ADD→ERASE→ADD sequence

- package: `kg005-modify-ab-adjudication-2134-2166`
- group: `KG005-AB-G04`
- current operation: `unknown`
- window: 2156.6–2160.2 s

The B trace records three physical source events: an equals sign is added, erased, and written again. This is not a `MODIFY` event. Under the stable-semantic-state policy in `DATA_AND_ANNOTATION_SPEC.md §3.4.1`, the main Gold unit compares stable before/after states: no trailing equals sign becomes one trailing equals sign.

Required decision:

- inspect for one `accept / ADD` final event at `2159.90–2160.20 s`, when the final persistent equals sign is written; retain the earlier trial `ADD → ERASE` only as source trace and do not include it in the main-event boundary; or
- choose `unknown` / `reject` if the stable final equals sign or its persistence cannot be verified.

### C4. KG005 G05 — same-slot rewrite with no semantic delta

- package: `kg005-modify-ab-adjudication-2134-2166`
- group: `KG005-AB-G05`
- current operation: `unknown`
- window: 2162.9–2165.1 s

The source trace shows erase and rewrite activity, but before and after both read as `F r²`; no semantic change is visible. It must not be labeled `MODIFY` merely because pen strokes changed.

Required decision:

- inspect for `not_an_event`, because the frozen main Gold ontology records persistent semantic deltas and the stable content did not change; or
- choose `unknown` / `reject` if the two stable states cannot be compared reliably.

The intermediate `ERASE → ADD` remains auditable source trace but does not inflate the main experiment denominator. The same rule must be applied to every same-content rewrite in the dataset.

## 4. Human execution order

1. Two reviewers independently inspect the Tier A calibration groups.
2. Apply the frozen stable-semantic-state ontology; independently freeze the remaining persistence rule for clip boundaries.
3. Resolve the four Tier C groups before signing either affected KG005/KG003 component package.
4. Review all seven LY004 groups first as the calibration lesson, but do not claim it is independently compilable under the current whole-queue compiler.
5. Complete the remaining KG003, KG005, and LY003 groups and all six component signoffs; reach at least 30 accepted final events.
6. Compile the full SignedGold v2 dataset, then select the derived LY004 lesson for the already frozen single-lesson confirmation workflow.
7. After that single-lesson check, use the same compiled four-lesson dataset to materialize the preregistered 12-case, four-arm, three-seed confirmation experiment.

## 5. Research gates

| Gate | Pass condition | Current state |
|---|---|---|
| Structural evidence | 6 components → 4 lessons; 379/379 assets verified; 52/52 canonical comparisons unique | PASS |
| Group adjudication | 52/52 groups have append-only human decisions | BLOCKED (0/52) |
| Signed Gold | each of 6 components has two distinct signers | BLOCKED (0/6) |
| Minimum evidence | at least 30 accepted final events | BLOCKED (0/30) |
| Single-lesson confirmation | one signed lesson plus frozen four-arm evaluation | BLOCKED on Signed Gold |
| Multi-lesson confirmation | 4 lessons, 12 frozen cases, 144 completed requests, blinded ratings and preregistered statistics | BLOCKED on Signed Gold and experiment implementation |

Engineering beyond these gates is deliberately deprioritized. Only changes needed to preserve evidence identity, blinding, reproducibility, or fail-closed compilation should interrupt the research path.
