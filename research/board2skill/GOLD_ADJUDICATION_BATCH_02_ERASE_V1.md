# Gold Adjudication Batch 02 — ERASE Persistence V1

## 1. Scope and non-decision boundary

This batch resolves the visual-evidence questions for four real ERASE/ADD candidates without recording a human Gold decision:

1. `kg003-erase-ab2-4422-4428 / kg003-erase-ab2-pair-1`;
2. `kg005-erase-add-ab-1888-1905 / KG005-AB-001`;
3. the same package / `KG005-AB-002`;
4. the same package / `KG005-AB-003`.

Frozen parent state:

- repository commit: `874eb2643edcaed4916d3b083fce27bd13390bbf`;
- Gold queue JSON SHA-256: `9d5ddd5a7b2a36a51543039d14c6f4974031d6546c558a0558ef7cc6521bfeb9`;
- KG003 intake SHA-256: `cff464f6e224d9edb857d0439213e86d3556ed1a3d6376f1e23a51fde86392f9`;
- KG005 intake SHA-256: `98eb5e93fde18351f02ce1de48a409a7c9b55011235062e98ebecac07c5f25f9`;
- previously frozen base annotation policy SHA-256: `ac3cfd01ce7278c3a35fe9a6112cabaa71b0569bd39711f652854c840993b0e2`;
- ERASE persistence policy SHA-256: `ed5f0135fb9ee24308417722a480fdcf7f9c8f84c262dd70c46c7e44a94ba679` (`ERASE_PERSISTENCE_POLICY_V1.md`);
- source-video SHA-256 roots: KG003 `e4409e94aab76ed26501ebd24e51b09d3454944a09d4a6b37365a75fb9d080e4`, KG005 `127ed9323274d0dd00f3cc39c4a3b68f3109d74dbfd7fb2d08f87cab008f7241`;
- machine-readable persistence evidence: `ERASE_PERSISTENCE_EXTENSION_V1.json`.

This document and its machine-readable companion are machine pre-review artifacts. They do not create a reviewer identity, decision, accepted event, signoff, or SignedGold record. Existing intake bytes remain unchanged. Because the extension assets live in the private research data tree, a human may inspect them locally, but the Gold queue must not consume them until a new versioned immutable intake/package binds their exact paths and hashes.

## 2. Frozen persistence rule

For main-Gold ERASE:

- target content must be continuously visible for at least `2.0 s` before the event;
- target content must be continuously absent for at least `2.0 s` after first full absence;
- each state interval needs at least three source-video samples at start/middle/end;
- the full interval must retain the same canvas and viewport, with no target-region occlusion or surface transition;
- when a task clip censors either state, evidence must be recovered from the same source-video bytes or the candidate remains `unknown` / `reject`.

The evidence horizon is not part of the event. Boundary scoring uses first persistent removal through first complete absence; it does not include tool selection or the subsequent two-second confirmation period. The normative text is `ERASE_PERSISTENCE_POLICY_V1.md`; this section is only its execution summary.

## 3. Machine pre-review findings

| Order | Package / group | Frozen source state | Extended evidence | Recommended human action |
|---:|---|---|---|---|
| 1 | `kg003-erase-ab2-4422-4428 / kg003-erase-ab2-pair-1` | Both independent passes propose `ERASE`; old task window left-censored the before state | Source frames at 4420.0, 4421.0 and 4422.5 show the same right-side red derivation continuously present; 4424.933, 4426.0 and 4427.0 show it continuously absent on the same canvas | Inspect for `accept / ERASE`; use `4423.067` as first persistent change candidate and `4424.933` as first-full-absence candidate. Human must still transcribe only visible erased ink and choose exact boundary if residual ink at 4424.933 is disputed |
| 2 | `kg005-erase-add-ab-1888-1905 / KG005-AB-001` | A/B agree on `ERASE`; B includes toolbar selection in its earlier boundary | Existing evidence already shows stable before content and stable absence through 1896.166667 | Inspect for `accept / ERASE` at `1892.367–1893.366667`; exclude the 1892.166667 toolbar-selection interval from the event |
| 3 | same / `KG005-AB-002` | A/B agree on `ADD` after a 2.83 s stable blank interval | Formula is continuously written at 1896.2–1898.333 and remains visible through 1904.5 | Inspect for `accept / ADD` at `1896.200–1898.333`; preserve the new formula as a distinct object rather than a spatial `MODIFY` |
| 4 | same / `KG005-AB-003` | A froze `unknown`, B proposed `ERASE`; old clip ended before persistence could be checked | Source frames at 1902.5, 1903.5 and 1904.5 show the lower red fraction formula present; 1904.933 and 1904.967 retain a final red residual, while frames from 1905.0 through 1908.1 show it absent on the same page and viewport | The right-censor blocker is resolved. After a versioned intake binds the extension evidence, inspect for `accept / ERASE`; `1904.667` is first-change candidate and `1905.000` is the first-full-absence candidate. Do not accept from the old unextended intake |

No machine finding resolves KG003's exact glyphs, reviewer identity, or package signature. KG005-AB-003 remains `unknown` in the current queue until the versioned intake exists and a human explicitly selects a final `ERASE` event.

## 4. Reviewer worksheet

All cells are intentionally blank.

| Group | Visual reviewer outcome | Physics reviewer outcome | Exact visible transcription | Event start/end | Stable before/after evidence | Final adjudication after discussion |
|---|---|---|---|---|---|---|
| `KG003 / kg003-erase-ab2-pair-1` |  |  |  |  |  |  |
| `KG005 / KG005-AB-001` |  |  |  |  |  |  |
| `KG005 / KG005-AB-002` |  |  |  |  |  |  |
| `KG005 / KG005-AB-003` |  |  |  |  |  |  |

## 5. Stop conditions and next artifact

Stop without deciding if any frame hash differs, the target page/viewport changes inside a state interval, an apparent absence can be explained by occlusion, or exact visible semantics require speech/subtitles to invent board content.

The next mechanical step is not a decision write. Create replacement versioned immutable KG003/KG005 intake packages that:

1. preserve the old intake URI and SHA as provenance;
2. bind the extension frame paths and hashes;
3. remove only the proven censoring blocker while keeping all remaining human fields pending;
4. regenerate the queue/workset hashes;
5. pass structural readiness before either package can be signed.
