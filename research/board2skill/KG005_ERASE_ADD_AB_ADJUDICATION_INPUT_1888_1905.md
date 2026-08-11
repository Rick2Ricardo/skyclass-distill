# KG005 ERASE/ADD human adjudication input, 1888–1905 s

This worksheet mirrors `KG005_ERASE_ADD_AB_ADJUDICATION_INPUT_1888_1905.json`. It is an **unsigned, unadjudicated input**. It records no accepted event and must not be treated as Paper Gold.

Companion intake SHA-256: `98eb5e93fde18351f02ce1de48a409a7c9b55011235062e98ebecac07c5f25f9`.

## Gate

| Field | Current value |
|---|---|
| Automatic adjudication | not performed |
| Candidate decisions | 0/3 recorded |
| Human reviews | 0/3 completed |
| Human review | pending |
| Human signoff | pending |
| Accepted count | 0 |
| Paper Gold | blocked |

## GoldReviewStore fields and load result

- `package_id`: `kg005-erase-add-ab-1888-1905`.
- `source_video_id`: `phy-force-kunge-005`.
- `items`: 3, each with `group_id`/`pair_id`, exact `a_side.events` and `b_side.events`, `alignment_window`, `evidence_assets`, and one explicit `proposal.candidate_events` entry.
- Per-group evidence: 8 (`A comparison + mask + before + after`, `B comparison + mask + before + after`); total 24 group-local records over 20 unique asset paths. All controlled relative paths exist and all 24 verifications match their recorded SHA-256.
- Candidate count: 3 total. Store-normalized operations/readiness are G1 `ERASE / true`, G2 `ADD / true`, G3 `unknown / false`.
- G3 normalized blocker: `操作类型尚未确定`. Its human options are `ERASE`, `reject`, `not_an_event`, and `unknown`; acceptance requires a human to explicitly submit an `ERASE` final event. No acceptance-ready ERASE is prefilled.
- Queue compatibility test: baseline excluding this intake `5 packages / 49 groups`; manifest-loaded queue `6 packages / 52 groups`. Actual increment is `+1 package / +3 groups / +0 decisions / +0 accepted events`.
- Loaded package remains unsigned and unlocked, with `decided_count=0`, `accepted_event_count=0`, no package signoffs, and `paper_gold_ready=false`.

Permitted human decision values, when a decision is eventually entered: `ERASE`, `ADD`, `reject`, `not_an_event`, `unknown`. Null/blank below means pending. `MODIFY` and any other value are out of scope.

## Verified input checkpoint

- A bundle: SHA-256 `e27bb4187f9e45dc48b43f7c3fff99a3626b72fb935f8339d389237d18a1ff06`; canonical payload `54bfdc993c966231c9ed565e1a4b92a3078f61561623884c6561e8722dcc74a5`; contract valid.
- B bundle: SHA-256 `7d9ac1416bd716c4df117d4d3fcaa0fc270e0a4081ef107afa36ef37b43a8abd`; canonical payload `16fcbfd3753bb2a159ad5a232bdbc973484af90613185aa8dd35bf42a20ef928`; contract valid.
- Source video SHA-256: `127ed9323274d0dd00f3cc39c4a3b68f3109d74dbfd7fb2d08f87cab008f7241`.
- Canonical ASR SHA-256: `c96ffbe3a8077736046d78c8f14c47f41d700c99efb894ba16143bfc678a4a77`; both bundles match its two segment indexes, offset times, and raw text. ASR is `context_not_adjudicated` only.
- A referenced assets: 47 occurrences / 23 unique paths, 0 missing/hash failures; A manifest 533/533 pass.
- B referenced assets: 60 occurrences / 33 unique paths, 0 missing/hash failures; frozen full-frame/contact tree hashes reproduce.
- Time/freeze traceability errors: A 0, B 0. Accepted count: A 0, B 0.

## Coverage and metrics

Unique temporal matching covers A `3/3` and B `3/3`; unmatched `0`, duplicate coverage `0`, off-diagonal positive-overlap pairs `0`.

| Pair | A/B operations | tIoU | Native region IoU | Video region IoU | Review state |
|---|---|---:|---:|---:|---|
| KG005-AB-001 | erase / erase | 0.805000 | 0.649001 | 0.800374 | pending |
| KG005-AB-002 | add / add | 0.968902 | 0.417559 | 0.533667 | pending |
| KG005-AB-003 | **unknown / erase** | 0.886792 | 0.417559 | 0.533667 | **pending; preserve disagreement** |

The native and video-region IoUs differ because A/B froze different surface polygons. Region reuse also causes cross-event spatial overlap, so matching is determined by temporal overlap first and corroborated by region/object evidence.

## Candidate KG005-AB-001

- A: `kg005-a-d1-erase`, `1892.367–1893.333`, `erase`, affected objects `kg005-a-o-old-left`, `kg005-a-o-old-right`.
- B: `B-DELTA-001`, `1892.166667–1893.366667`, `erase`, affected objects `B-O-OLD-L2M-T2`, `B-O-OLD-V2M`, `B-O-OLD-CIRCLE`.
- Boundary deltas A−B: start `+0.200333 s`, end `−0.033667 s`.
- Object note: A groups the circled right formula; B splits its text and circle. B's earlier start includes transient eraser-toolbar selection, while first persistent content removal is approximately `1892.366667`.

Human decision: **pending / blank**
Human rationale: **pending / blank**
Reviewer: **pending / blank**
Review time: **pending / blank**
Signoff: **pending / blank**

## Candidate KG005-AB-002

- A: `kg005-a-d2-add`, `1896.200–1898.333`, `add`, affected object `kg005-a-o-new-formula`.
- B: `B-DELTA-002`, `1896.200000–1898.266667`, `add`, affected object `B-O-NEW-LM2-T2`.
- Boundary deltas A−B: start `0.000000 s`, end `+0.066333 s`.
- Review note: both independent freezes contain a stable blank interval before the writing event. Spatial reuse alone is not MODIFY, and MODIFY is not a permitted decision here.

Human decision: **pending / blank**
Human rationale: **pending / blank**
Reviewer: **pending / blank**
Review time: **pending / blank**
Signoff: **pending / blank**

## Candidate KG005-AB-003 — right-censored hard negative

- A: `kg005-a-d3-clip-end-unknown`, `1904.667–1904.967`, **`unknown`**, empty affected-object list because the operation is unknown. A records that erase persistence is unverified before the clip ends.
- B: `B-DELTA-003`, `1904.666667–1904.933333`, **`erase`**, affected object `B-O-NEW-LM2-T2`. B records visible terminal-frame removal but also that after-state persistence is clip-end limited.
- Boundary deltas A−B: start `+0.000333 s`, end `+0.033667 s`.
- Object note: A's before-state `kg005-a-o-new-formula` corresponds to B's `B-O-NEW-LM2-T2`; this does not resolve the operation label.
- Required handling: preserve the `unknown` versus `ERASE` conflict until a human explicitly decides. Do not infer resolution from agreement on time or region.

Human decision: **pending / blank**
Human rationale: **pending / blank**
Reviewer: **pending / blank**
Review time: **pending / blank**
Signoff: **pending / blank**

## Global human signoff

Reviewer identity: **pending / blank**
Decision completeness check: **pending**
Right-censored disagreement explicitly resolved by human: **pending**
Accepted-count authorization: **none; remains 0**
Signed by: **pending / blank**
Signed at: **pending / blank**
Paper Gold release: **blocked**
