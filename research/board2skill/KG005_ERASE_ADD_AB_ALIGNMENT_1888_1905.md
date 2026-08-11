# KG005 ERASE/ADD A–B alignment, 1888–1905 s

Status: **post-freeze alignment only; no adjudication performed**
Generated: `2026-08-11T20:49:42Z`
Human review: **pending**
Human signoff: **pending**
Accepted artifacts: **0**
Paper Gold: **blocked**

## Scope and non-decision rule

This report aligns the three independently frozen Annotator A deltas with the three independently frozen Annotator B deltas for `phy-force-kunge-005`, absolute source time `[1888, 1905]` seconds. It does not choose a winning annotation, change either bundle, accept an event, infer pedagogical role/intent, or sign off a result. In particular, the right-censored third pair remains an explicit `A=unknown` versus `B=ERASE` disagreement.

If a human later records a candidate decision, the only permitted values are `ERASE`, `ADD`, `reject`, `not_an_event`, and `unknown`. Blank/null review fields in the companion input are deliberate and mean pending, not a sixth decision.

## GoldReviewStore intake compatibility

The companion JSON is also a manifest-loadable Gold review intake without changing any alignment measurement or adjudication conclusion:

- intake SHA-256: `98eb5e93fde18351f02ce1de48a409a7c9b55011235062e98ebecac07c5f25f9`;
- `package_id`: `kg005-erase-add-ab-1888-1905`;
- `source_video_id`: `phy-force-kunge-005`;
- `items`: three groups, `KG005-AB-001` through `KG005-AB-003`;
- each group contains one exact A source event, one exact B source event, an alignment window, and eight SHA-addressed visual assets: A/B comparison, mask, before state, and after state;
- proposals: one `ERASE` candidate for G1, one `ADD` candidate for G2, and one unresolved `unknown` candidate for G3.

An actual `GoldReviewStore.queue()` load, compared in memory with the same manifest paths excluding only this intake, changed the queue by `+1` package, `+3` groups, `+0` decisions, and `+0` accepted events. All 24 group-local evidence records (20 unique asset paths) passed the store's byte/hash verification. The three normalized candidates number `1/1/1`; G1 and G2 are structurally acceptance-ready, while G3 is `acceptance_ready=false` with blocker `操作类型尚未确定`. G3 can become an accepted event only if a human explicitly supplies an `ERASE` final event; the intake does not prefill that resolution.

## Input identity and independent-freeze traceability

| Input | Path | SHA-256 | Canonical payload SHA-256 |
|---|---|---|---|
| Source video | `data/raw/physics/force-pilot/phy-force-kunge-005/source.mp4` | `127ed9323274d0dd00f3cc39c4a3b68f3109d74dbfd7fb2d08f87cab008f7241` | n/a |
| Annotator A bundle | `data/board2skill/oracle-pilot/tbv2-kg005-hardnegative-1888-1905/annotator-a.json` | `e27bb4187f9e45dc48b43f7c3fff99a3626b72fb935f8339d389237d18a1ff06` | `54bfdc993c966231c9ed565e1a4b92a3078f61561623884c6561e8722dcc74a5` |
| Annotator B bundle | `data/board2skill/oracle-pilot/tbv2-kg005-hardnegative-1888-1905/annotator-b.json` | `7d9ac1416bd716c4df117d4d3fcaa0fc270e0a4081ef107afa36ef37b43a8abd` | `16fcbfd3753bb2a159ad5a232bdbc973484af90613185aa8dd35bf42a20ef928` |
| A visual freeze | `data/board2skill/oracle-pilot/tbv2-kg005-hardnegative-1888-1905/a-visual-freeze.json` | `006e27f4408ae28d814ea11d7aaeb74b13ed881b538d8c8098c5db67804b0c63` | n/a |
| B visual freeze | `data/board2skill/oracle-pilot/tbv2-kg005-hardnegative-1888-1905/b-assets/b-visual-freeze.json` | `bfa65dd244961fc1ce6bd17f243fa9fae995ab4a9cb959bd602a68ce4d70d986` | n/a |
| A annotation log | `research/board2skill/KG005_ERASE_ADD_ANNOTATOR_A_LOG.md` | `bdd658badf5b493d25be7e35177182922606e4062e48a131d86329b9d56df526` | n/a |
| B annotation log | `research/board2skill/KG005_ERASE_ADD_ANNOTATOR_B_LOG.md` | `3ce4630146e8ae482d6887631b30bd85c326a13c5d1a7867a4f27efd17a4cec8` | n/a |
| Canonical ASR | `data/board2skill/oracle-pilot/tbv2-kg005-hardnegative-1888-1905/asr/clip-1888-1905.json` | `c96ffbe3a8077736046d78c8f14c47f41d700c99efb894ba16143bfc678a4a77` | n/a |

The two freezes and logs describe independent visual passes. The ASR is retained only as `context_not_adjudicated`; it was not used to alter visual boundaries, objects, regions, operations, roles, or intent.

## Revalidation ledger

| Check | Annotator A | Annotator B |
|---|---:|---:|
| `validateBoardEvidenceBundle` | pass, 0 issues | pass, 0 issues |
| Declared canonical payload equals recomputation | pass | pass |
| Bundle source SHA equals source-video SHA | pass | pass |
| Referenced asset occurrences | 47 | 60 |
| Unique referenced asset paths | 23 | 33 |
| Referenced asset path/hash errors | 0 | 0 |
| State/delta/transition/evidence time errors | 0 | 0 |
| Freeze delta operation/time mismatches | 0 | 0 |
| ASR segment index/time/raw-text mismatches | 0 | 0 |
| `needs_review` state/delta/transition count | 11/11 | 11/11 |
| Accepted count | 0 | 0 |
| Learner observations | 0 | 0 |
| Non-unknown pedagogical role/intent | 0 | 0 |

A's independent asset manifest covers `533/533` files with no missing or hash-mismatched asset; its manifest SHA-256 is `124c28d1d914cbd7ba19e0307aca4498e964b5ee5e8f294e7c119f90d7428d0f`. B's asset root contains 569 files. Its 510-full-frame tree SHA-256 is `515fd9f35dde702b903131ece652414209770d1d223ba28d7ca7a40764f50b7f`, and its contact/detail-sheet tree SHA-256 is `98dc04556c97185e2d44e48420f7472ce3ea588aa4136100d525f53962879dea`; both reproduce the values frozen by B. The bundle-level path/hash checks above cover every asset actually referenced by the contract payloads.

Both bundles reproduce canonical ASR segment indexes `0` and `1`, source-offset intervals `[1888,1899]` and `[1899,1905]`, and exact raw text. Speech remains context only.

## Alignment method

The matching key is same source window plus positive temporal overlap, then region/object corroboration. For intervals `A` and `B`, `tIoU = |A ∩ B| / |A ∪ B|`. Only the diagonal pairs have positive temporal overlap; all six off-diagonal temporal IoUs are exactly zero. Therefore the maximum unique assignment is unambiguous and covers A3/B3 exactly once.

Region coordinates are board-surface-normalized, and A/B froze different surface extents. This report therefore gives two spatial measurements:

- **native region IoU**: rectangle IoU on the stored normalized coordinates;
- **video region IoU**: each rectangle is first mapped through its annotator's rectangular surface polygon into common video-normalized coordinates, then rectangle IoU is computed.

Spatial IoU by itself is not a valid matcher here because the board region is deliberately reused; temporal overlap supplies the unique correspondence.

## Unique delta coverage

| Pair | Annotator A | Annotator B | A time (s) | B time (s) | Δstart A−B (s) | Δend A−B (s) | tIoU | Native region IoU | Video region IoU | Operation observation |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| KG005-AB-001 | `kg005-a-d1-erase` | `B-DELTA-001` | 1892.367–1893.333 | 1892.166667–1893.366667 | +0.200333 | −0.033667 | 0.805000 | 0.649001 | 0.800374 | A `erase`, B `erase`; agreement, unadjudicated |
| KG005-AB-002 | `kg005-a-d2-add` | `B-DELTA-002` | 1896.200–1898.333 | 1896.200000–1898.266667 | 0.000000 | +0.066333 | 0.968902 | 0.417559 | 0.533667 | A `add`, B `add`; agreement, unadjudicated |
| KG005-AB-003 | `kg005-a-d3-clip-end-unknown` | `B-DELTA-003` | 1904.667–1904.967 | 1904.666667–1904.933333 | +0.000333 | +0.033667 | 0.886792 | 0.417559 | 0.533667 | **A `unknown`, B `erase`; disagreement, unadjudicated** |

Coverage statistics:

- matched pairs: `3`;
- A covered: `3/3` (`100%`), unmatched `0`, duplicate coverage `0`;
- B covered: `3/3` (`100%`), unmatched `0`, duplicate coverage `0`;
- mean matched tIoU: `0.886898`;
- mean native region IoU: `0.494706`;
- mean video region IoU: `0.622570`;
- mean absolute boundary error over six paired boundaries: `0.055722 s`;
- exact operation agreement: `2/3` (`66.6667%`); explicit disagreement: `1/3`.

## Object correspondence without identity collapse

| A object | B object | Native region IoU | Video region IoU | Interpretation |
|---|---|---:|---:|---|
| `kg005-a-o-old-left` | `B-O-OLD-L2M-T2` | 0.582496 | 0.887409 | Same left old formula candidate |
| `kg005-a-o-old-right` | `B-O-OLD-V2M` | 0.257962 | 0.314007 | B splits formula text from its circle |
| `kg005-a-o-old-right` | `B-O-OLD-CIRCLE` | 0.649533 | 0.966275 | A groups the circled right formula as one object |
| `kg005-a-o-new-formula` | `B-O-NEW-LM2-T2` | 0.580426 | 0.891520 | Same new formula candidate in pairs 2 and 3 |

Pair 1's affected-object cardinality (`A=2`, `B=3`) is a granularity difference, not an unmatched event. For pair 3, A has an empty `affected_object_ids` list because its frozen operation is `unknown`; its before-state object still corresponds spatially and temporally to B's new-formula object. This correspondence is evidence for review, not an operation adjudication.

## Pair-specific review notes

### KG005-AB-001

B begins at `1892.166667`, including the transient eraser-toolbar selection; both annotations locate the first persistent board-content removal at approximately `1892.366667`. A begins at `1892.367`. The interval difference must be reviewed by a human, even though both frozen operation labels are erase.

### KG005-AB-002

Both annotations observe a stable blank interval before the new formula is written, and both independently label the event add rather than treating spatial reuse as MODIFY. No MODIFY candidate is exposed in the adjudication input because the allowed decision vocabulary is restricted to `ERASE`, `ADD`, `reject`, `not_an_event`, and `unknown`.

### KG005-AB-003 — preserve hard-negative disagreement

The event is right-censored by the clip boundary. A freezes `unknown`: only a terminal blank observation is available and erase persistence cannot be established. B freezes `erase`: the final frames visually show removal, while B also records that after-state persistence is clip-end limited. Neither label supersedes the other. A human must explicitly review the competing evidence; until then the candidate decision remains null, human review/signoff remain pending, accepted count remains zero, and Paper Gold remains blocked.

## Gate state

- Automatic adjudication: **disabled / not performed**.
- Candidate decisions recorded: **0/3**.
- Human reviews completed: **0/3**.
- Human signoff: **pending**.
- Accepted artifacts: **0**.
- Paper Gold eligibility: **blocked pending human review and signoff**, with the right-censored disagreement explicitly unresolved.
