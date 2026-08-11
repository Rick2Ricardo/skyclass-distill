# Oracle A2 extension log: `phy-force-liyongle-004`, 133–240 s

Date: 2026-08-12

Annotator: `annotator-a2-independent-extension`
Status: `needs_review` / `independent`

## Scope and blind protocol

- Independently annotated only the visible chalkboard changes in source seconds 133–240.
- Used the source video and `annotator-a.json` only for schema, naming, and the board state through 132 s.
- Did not consult B-side annotations, disagreement/adjudication materials, development gold, prior run outputs, or model-distillation artifacts.
- Did not use time-aligned ASR. Speech, intent, student state, learning effect, and inferred teaching effect were not annotated.
- Every event has `pedagogical_role: unknown`; no item is accepted.

## Deliverables

- Annotation: `data/board2skill/oracle-pilot/tbv2-ly-004-01/annotator-a-extension-133-240.json`
- 1 fps overview frames: `a2-extension-frames-1fps/` (109 files)
- 4 fps boundary frames: `a2-extension-frames-4fps/` (436 files; `qsec-N` means `N/4` seconds)
- Overview sheets: `a2-extension-sheets/` (9 files)
- Boundary sheets: `a2-extension-boundary-sheets/` (22 files)
- Full-resolution QA crops: `a2-extension-crops/` (13 files)
- Per-event before/after comparisons: `a2-extension-comparisons/` (9 files)

## Annotation result

Six stable BoardStates and nine board deltas were recorded.

| Delta | Time (s) | Operation | Visible persistent change |
|---|---:|---|---|
| d011 | 138.00–140.00 | ADD | Vertical upward resultant-component arrow |
| d012 | 140.25–148.00 | ADD | `F₁=1/5mg` |
| d013 | 152.25–154.75 | CONNECT | Horizontal rightward `f` arrow from the same origin |
| d014 | 158.50–163.50 | CONNECT | Right vertical copied edge plus diagonal `F合`, completing the vector construction |
| d015 | 164.50–167.75 | ADD | Angle arc and `α=30°` |
| d016 | 177.00–186.50 | ADD | `f=√3/5mg` |
| d017 | 187.75–197.00 | ADD | `F合=2/5mg=ma` |
| d018 | 198.25–206.00 | ADD | `∴a=2/5g=4m/s²` |
| d019 | 224.00–237.25 | ADD | Heading `> 正交分解法` |

Operation totals: ADD 7, CONNECT 2, ERASE 0, MODIFY 0.

The handwritten “解：”-like marker visible at 133 s was already complete before the requested window. It is carried in the initial BoardState and is not backfilled as a 133–240 s delta.

## Main uncertainties

- Boundaries were checked at 4 fps, so nominal resolution is 0.25 s; brief hand/body occlusions remain.
- The vector construction overlaps the earlier `F₁` equation, making a few connecting strokes less cleanly separable.
- The small angle letter is visually consistent with `α` but retains an alpha/theta handwriting ambiguity.
- The method-heading bullet and title were separated by a pause; they are grouped as one semantic heading event.
- Pointing at existing writing was excluded. No reliable erasure or modification was observed.

## Validation and hashes

- `jq empty`: passed.
- Invariants: 9 deltas, 6 states, all events/states `needs_review` and `independent`, all roles `unknown`, times constrained to 133–240 s.
- Reference audit: all 49 unique frame/comparison references in the JSON exist.
- Source video SHA-256: `3811c42fb32f36e27754926062a1280b0b576edee91adca0d0a8f9a5362ad6d9`
- Inherited `annotator-a.json` SHA-256: `88edb165ba322d6b91d8474b96064d29d15abe8a59bff781b8718f59d2bb1490`
- Extension JSON SHA-256: `5f1f5f47b8c9370e978b07d93c7ef4a62053db60b273c070a44a7645560c8dcc`
- Referenced-asset manifest SHA-256: `3e2941807c557c563d87a373d144c7af52eb3ac307ac3602184aefb12e592785`
- Comparison manifest SHA-256: `85ce8cf48167371130572e2e5aeb5fd069dc5b16b19606da730aed08119e0d24`

The referenced-asset manifest digest is computed by sorting the JSON's unique representative/evidence/comparison references, hashing each referenced file as `SHA256  relative-path`, then hashing that newline-delimited manifest.

No A/B comparison, acceptance decision, commit, or push was performed.
