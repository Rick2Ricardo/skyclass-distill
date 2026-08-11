# KG003 ERASE annotator A independent log

## Scope and isolation

- Source: `phy-force-kunge-003`, canonical MP4 `data/raw/physics/force-pilot/phy-force-kunge-003/source.mp4`.
- Canonical SHA-256: `e4409e94aab76ed26501ebd24e51b09d3454944a09d4a6b37365a75fb9d080e4`; re-hash matched `research/manifests/physics_force_downloads.csv` and `source.json`.
- Absolute source-video window: `4422.000–4428.000` seconds.
- Annotator: A; review state: independent. No alignment or adjudication was performed.
- I did not read the operation-gap scout, any annotator-B artifact, model output, or another person's labels for this window.
- Visual facts and boundaries were frozen to the ignored `a-assets/a-visual-freeze.json` before the permitted machine ASR file was opened.

## Method and visual audit

The controlling implementation is `packages/contracts/src/temporal-board.ts` (`temporal-board-v2`), with the method and annotation rules in `METHOD_AND_SYSTEM_SPEC.md` and `DATA_AND_ANNOTATION_SPEC.md`. The frozen recovery setting is `minimum_stable_seconds=2`.

I decoded and reviewed all 180 nominal 30-fps frames in the six-second window using an independent `a-assets/` tree and nine 20-frame contact sheets. The registered surface is the digital canvas only; the teacher picture-in-picture and bottom program bar are outside it.

Observable frame facts:

| Absolute time | A frame | Frozen observation |
| ---: | --- | --- |
| 4422.000–4422.967 | 001–030 | Target red digital-ink object is unchanged and visible. |
| 4423.000 | 031 | Digital eraser is selected; target is still intact. |
| 4423.067 | 033 | First visible deletion within the target region. |
| 4424.000 | 061 | Target is partially deleted while the rest of the canvas remains registered. |
| 4424.933 | 089 | Last target trace remains visible. |
| 4424.967 | 090 | Target is first fully absent. |
| 4425.167 | 096 | Operation tail ends and the pointer tool is restored; target remains absent. |
| 4425.200–4427.933 | 097–179 | Same surface and viewport; target remains absent with the region visible. |

No page change, pan, zoom, scene cut, camera change, target-region occlusion, or surface transition occurs through `4427.933`. Toolbar/pointer/caret changes do not move the canvas. The disappearance is progressive inside the target region while neighboring canvas content persists, so it is a real visual `erase`, not an occlusion or a viewport loss.

## Gate decision

- Delta: `4423.000–4425.167`.
- Before: `4422.000–4423.000`, only `1.000 s` and left-censored by the task window.
- After: `4425.200–4427.933`, `2.733 s` on the same visible surface.
- Erase persistence: `confirmed_until=4427.933`; `confirmed_until - delta.end = 2.766 s`.
- Minimum stable gate: after state **passes** the frozen `2 s` threshold. Therefore this is not an after-gate abstention.
- Review decision: `erase + needs_review`, because the in-window before state is left-censored and shorter than the same stable-duration threshold. Every status-bearing artifact is `needs_review`; accepted count is zero.

## ASR boundary

Only after the visual freeze, I read `data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/asr/clip-4422-4428.json` (SHA-256 `fad1323b0ea85dd9f9b1fdf8e91b2933a28c6308ad7f22584ad96df245d5de03`). Segment index `0` contains raw machine text `这两个情况连立起来` at clip-relative `0.000–6.140`.

The bundle preserves this as an unnormalized speech draft and clips its absolute span to `4422.000–4428.000`. It did not change the visual operation, region, boundary, surface, persistence, or review decision. No transition or pedagogical role is asserted.

## Outputs and verification

- Ignored bundle: `data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/annotator-a.json`.
- Independent assets: `data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/a-assets/`.
- Canonical payload SHA-256: `2f78499602e304a34e8a2922840566fb6bf5b9d7bec839b9c32896e48cb0a81a`.
- Contract validator: `valid=true`, zero issues.
- Referenced asset audit: all paths exist and every declared SHA-256 matches the file bytes.
- Absolute-time audit: all visual labels and the clipped speech draft are within `4422.000–4428.000`; all timestamps are within the canonical source duration `6135.048821`.
- ASR trace audit: speech segment index `0`, raw text, clipping note, source path, and source hash are preserved.
- Fabrication guard: `learner_observations=[]`, `transitions=[]`; no learner state, teacher intent, pedagogical role, success, or outcome is invented.
