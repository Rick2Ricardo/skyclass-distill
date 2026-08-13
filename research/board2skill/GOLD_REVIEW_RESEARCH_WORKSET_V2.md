# Gold Review Research Workset V2

## 1. Frozen source snapshot

This is a versioned update to `GOLD_REVIEW_RESEARCH_WORKSET_V1.md`; all unaffected review ordering and evidence rules remain unchanged.

- parent workset SHA-256: `f3ce9eec7e92e9998171e21444b35d29a9e773f87b4c408b11a0bf7de702905e`;
- active manifest SHA-256: `0531052460831836b3ed5353489903dab6c398de3651a66d9180bff17dc8e78d`;
- active Gold queue SHA-256: `58eac46d9ca82003117a8c6d334103e171f211d67332c2a8314a3d2e06f53a20`;
- compile-readiness SHA-256: `b3e1298eb721bbb494e3777b979b313d74c714d835886d5e341641317f188ed9`;
- shape: `6 components / 4 lessons / 52 groups / 398 verified evidence assets / 52 unique canonical comparisons`;
- human state: `0 decided / 0 accepted / 0 signed`;
- structural readiness is true; human readiness is false.

This workset is not a decision ledger and creates no reviewer, decision, accepted event, signoff, or SignedGold record.

## 2. Updated package identities

Replace only these V1 package references during review:

| V1 package | Active V2 package |
|---|---|
| `kg003-erase-ab2-4422-4428` | `kg003-erase-ab2-4422-4428-persistence-v2` |
| `kg005-erase-add-ab-1888-1905` | `kg005-erase-add-ab-1888-1905-persistence-v2` |

All other package IDs and their order remain unchanged.

## 3. Updated specialist-adjudication state

### KG003 ERASE

The left-censored persistence blocker is resolved by 8 source-video frames. Reviewers must still transcribe only visible erased ink and choose the exact boundary. The candidate remains non-acceptance-ready until the semantic transcription is supplied by a human.

### KG005 terminal disappearance

The right-censored persistence blocker is resolved by 11 source-video frames. Frames at `1904.933` and `1904.967` still contain a red residual; `1905.000` is the first-full-absence candidate, followed by more than three seconds of continuous absence. The current candidate remains `operation = unknown` and non-acceptance-ready. A human must explicitly decide the operation and final event.

## 4. Execution order

Proceed with human review in the existing V1 order, substituting the two V2 package IDs above. Do not compile a lesson until all 52 groups are decided, all six component packages receive two distinct signoffs, and at least 30 accepted events exist. After full SignedGold compilation, select the derived LY004 lesson for the first single-lesson closed-loop experiment, then run the preregistered four-lesson four-arm confirmation gate.
