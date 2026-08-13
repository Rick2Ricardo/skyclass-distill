# ERASE Persistence Policy V1

## Scope

This addendum freezes the previously open persistence parameter in `DATA_AND_ANNOTATION_SPEC.md §3.1` before any Gold decision is recorded. It applies to every main-Gold `ERASE` candidate; it does not change the stable-semantic-state denominator in §3.4.1 and does not create an annotation or decision.

## State-evidence gate

A main-Gold `ERASE` candidate must satisfy all of the following:

1. The target object is continuously and clearly visible for at least `2.0 s` before the event.
2. The target object is continuously and clearly absent for at least `2.0 s` after first full absence.
3. Each state interval retains at least three source-video samples at its start, middle, and end.
4. The continuous video between those samples retains the same registered canvas and viewport, exposes the target region, and contains no page change, zoom, pan, target-region occlusion, or other surface transition that could explain disappearance.
5. If a task clip censors either state, the observation window must be extended from the exact same source-video bytes. If the required interval cannot be recovered, the candidate remains `unknown` or is rejected; a single boundary frame is insufficient.

The `2.0 s` intervals are evidence horizons, not event duration. The ERASE event begins at the first frame of persistent target removal and ends at the first frame where the last target residual is fully absent. Tool selection, the teacher leaving the region, and the subsequent persistence horizon are excluded from the event boundary. A disputed first-change or first-absence frame remains a human adjudication question and must cite the source frame used.

## Rationale and frozen boundary

The two-second rule adopts the stricter of the independently used pilot settings rather than choosing a threshold per case. Requiring three samples plus continuous-video review makes the rule robust to single-frame compression, exposure, and clip-edge artifacts while keeping the evidence horizon separate from Boundary F1. The rule is frozen before any Gold decision or package signoff and must not be retuned from downstream model results.

This policy is evidence-only. Human reviewers still decide whether the visible content is the same object, whether the disappearance is an ERASE rather than an occlusion or surface transition, the exact semantic transcription, and the final event boundary.
