# KG003 ERASE Annotator B2 Log

## Scope and isolation

- Task: strict blind, independent temporal-board-v2 annotation for `phy-force-kunge-003`, absolute visual window `4422.000-4428.000` seconds.
- Annotator: `B2`.
- This run did not read annotator A, annotator B, any prior B/B2 log, manifests, operation-gap material, prior/model annotations, model outputs, existing assets, or unrelated `research/board2skill` files.
- No repository-wide `rg`, `find`, CodeGraph, or equivalent discovery/search command was used.
- No alignment, adjudication, commit, push, or publication action was performed.

## Exact pre-existing files read

These are the complete pre-existing inputs consulted, in read order:

1. `packages/contracts/src/temporal-board.ts`
2. `research/board2skill/DATA_AND_ANNOTATION_SPEC.md`
3. `data/raw/physics/force-pilot/phy-force-kunge-003/source.mp4`
4. `data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/asr/clip-4422-4428.json`

The fourth file was not opened until the visual freeze described below had been written. All other later reads were limited to the new B2-owned derived files under `data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/` and the new B2 output `data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/annotator-b2.json` for visual QA, asset generation, hashing, and validation.

## Visual freeze point

The visual decision was frozen in:

`data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/visual-freeze.json`

At that point `asr_consulted=false` was recorded. The freeze fixed the following facts before any ASR access:

- one visual event, operation `erase`;
- conservative event envelope `4423.033-4424.933` seconds;
- last fully intact frame `4423.033`, first changed frame `4423.067`;
- last residual-ink frame `4424.900`, first fully absent frame `4424.933`;
- before state stable during `4422.000-4423.033`;
- after state stable during `4424.933-4427.967`;
- fixed `digital_ink` surface with source-frame viewport `(0,0,974,678)`;
- affected region normalized to the surface: `x=0.655, y=0.340, width=0.270, height=0.300`;
- teacher video panel outside the board surface; no transient occlusion in the affected region; persistent application chrome represented as ignore regions;
- visual trigger/teacher intent/pedagogical role unknown; learner evidence absent.

The ASR was subsequently attached only as a speech trace. It did not alter any frozen event, boundary, operation, state, surface, viewport, region, or occlusion decision.

## ASR trace

- Raw text preserved exactly: `这两个情况连立起来`
- Source segment indexes: `[0]`
- Source-local segment time: `0.000-6.140` seconds
- Absolute speech time after adding the `4422.000` clip origin: `4422.000-4428.140` seconds
- The `0.140`-second ASR overhang is retained in the speech trace and transition envelope only; visual artifacts remain within `4422.000-4428.000`.
- Normalization: `none`; normalized text: `null`.
- Pedagogical role and teacher intent remain `unknown`.

## Outputs

- Ignored bundle: `data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/annotator-b2.json`
- New B2-derived visual directory: `data/board2skill/oracle-pilot/tbv2-kg003-erase-4422-4428/b2-visual-annotator-b2-20260812/`
- Tracked audit log: `research/board2skill/KG003_ERASE_ANNOTATOR_B2_LOG.md`

No A/B directory was read or modified. All generated frames, crops, contact sheets, comparison image, delta mask, and visual-freeze artifact are confined to the new `b2-visual-annotator-b2-20260812` directory.

## Review policy

- Every status-bearing artifact is `needs_review` (surface: 1, states: 2, delta: 1, transition: 1).
- Annotation review status is `independent`.
- Accepted artifact count is `0`.
- `learner_observations` is empty and `observed_learner_response` is `null`.
- Trigger, teaching action/intent, pedagogical role, expected learner change, learning check, and remediation are all unknown claims.

## Validation

- `validateBoardEvidenceBundle`: valid, zero issues.
- Canonical payload SHA-256 declared and recomputed: `574f8a38e9fc302a27991a27ef132038345ccdd2a1c27c593956713a73fc7751`.
- Declared assets checked: 20 unique URIs; all files exist and every SHA-256 matches.
- Source video SHA-256: `e4409e94aab76ed26501ebd24e51b09d3454944a09d4a6b37365a75fb9d080e4`.
- ASR JSON SHA-256: `fad1323b0ea85dd9f9b1fdf8e91b2933a28c6308ad7f22584ad96df245d5de03`.
- Absolute-time assertions passed for every visual frame/state/delta and for the ASR local-to-absolute mapping.
- ASR raw text, segment index, and local/absolute times match the source JSON.
- Status assertion passed: five `needs_review`, zero `accepted`, review status `independent`.
- Learner-empty and unknown-role/intent assertions passed.
- Temporary quarter-rate/dense extraction frames, contact sheets, boundary enlargements, and unused frame/crop files were deleted after the visual and hash checks. The bundle was then revalidated: contract valid, canonical hash unchanged, and all 20 declared assets still present with matching hashes.
