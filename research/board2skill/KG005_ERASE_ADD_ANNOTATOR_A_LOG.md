# KG005 ERASE/ADD — Temporal Board v2 Annotator A Log

## Scope and isolation

- Annotator: `A`
- Source: `data/raw/physics/force-pilot/phy-force-kunge-005/source.mp4`
- Authorized absolute source window: `1888.000–1905.000 s`
- Source SHA-256: `127ed9323274d0dd00f3cc39c4a3b68f3109d74dbfd7fb2d08f87cab008f7241`
- Visual-freeze file: `data/board2skill/oracle-pilot/tbv2-kg005-hardnegative-1888-1905/a-visual-freeze.json`
- Visual-freeze SHA-256: `006e27f4408ae28d814ea11d7aaeb74b13ed881b538d8c8098c5db67804b0c63`
- Bundle: `data/board2skill/oracle-pilot/tbv2-kg005-hardnegative-1888-1905/annotator-a.json`
- Review mode/disposition: `independent`, `needs_review`, ignored bundle; `0 accepted`

Before visual freeze, only the annotation specification, the Temporal Board v2 contract, the source video, and A's own derived assets were read. The specified exact ASR was opened only after `a-visual-freeze.json` had been written and hashed. Annotator B, OPERATION_GAP, oracle manifests, scout material, prior annotators, alignment/arbitration outputs, and distillation/model outputs were not read.

The source video itself contains subtitle overlays in the teacher panel. They are inherent source pixels, not an external annotation artifact; the teacher panel and bottom navigation/subtitle areas were excluded from the registered board surface and were not used to assign role or intent.

Blind-label contamination detected: **none**.

## Independent visual assets and inspection

- Video metadata: `1280×720`, `30 fps`, full source duration `8790.021451 s`.
- Extracted `510` consecutive source-resolution PNG frames for the 17-second window: `a-assets/raw-frames/a-raw-0001.png` through `a-raw-0510.png`.
- Built `17` chronological `6×5` contact sheets, one per second, covering all 510 frames.
- Re-opened all candidate boundary and stable-state frames at source resolution.
- Built `3` before/after comparison images and `3` binary delta masks.
- `a-assets/a-asset-manifest.sha256` contains SHA-256 entries for all `533` generated A assets (`510` raw frames + `17` contact sheets + `6` comparison/mask files).
- Asset-manifest SHA-256: `124c28d1d914cbd7ba19e0307aca4498e964b5ee5e8f294e7c119f90d7428d0f`.

Delta comparison/mask hashes:

| Asset | SHA-256 |
| --- | --- |
| `a-d1-comparison.png` | `3e19685cb45a63bfd5c9692be7e1650653db0db82a711b226b412cb444617e68` |
| `a-d1-mask.png` | `fa9a877ac564d078a6795459e699bc79bcf6e2a441841d0ba03ef8fe82e6234c` |
| `a-d2-comparison.png` | `8d6cc9ab586bfa53b46287a7af2550da40884d6b9373044be2c35fcf9a833ac2` |
| `a-d2-mask.png` | `dde1d6bee0e818395f37fb2e87394cba0d5aff47db6c567a4d3ab0e37e83a2c8` |
| `a-d3-comparison.png` | `4ce962ea209a386fd6d1557eea0ae682569c77c7b658d3794d3a94c879a433ee` |
| `a-d3-mask.png` | `526d666b49d12e5a19dadaa86c15079b276fa264ffb7f17d646b504af820dbb0` |

## Frozen visual decisions

| Delta | Absolute boundary (s) | Operation | Visual decision |
| --- | ---: | --- | --- |
| `kg005-a-d1-erase` | `1892.367–1893.333` | `erase` | Two previously stable red formula objects disappear progressively; the directly visible region then remains blank through `1896.167`. |
| `kg005-a-d2-add` | `1896.200–1898.333` | `add` | A red fraction-form formula is continuously written into the stably blank region and remains stable through `1904.633`. The prior blank interval prevents treating spatial reuse as `modify`. |
| `kg005-a-d3-clip-end-unknown` | `1904.667–1904.967` | `unknown` | The stable formula progressively disappears, visually suggesting an erase, but only one blank frame is available before the authorized clip ends. Persistence is unverifiable, so the hard negative remains `unknown`. |

No `modify` or `connect` event was assigned. All event boundaries, object identities, operations, and role/intent-unknown decisions match the pre-ASR visual freeze.

## ASR use after freeze

- Exact ASR file: `data/board2skill/oracle-pilot/tbv2-kg005-hardnegative-1888-1905/asr/clip-1888-1905.json`
- ASR SHA-256: `c96ffbe3a8077736046d78c8f14c47f41d700c99efb894ba16143bfc678a4a77`
- Mapping: clip-local ASR timestamps plus `1888 s` produce source-absolute spans `1888–1899` and `1899–1905`.
- Usage: `context_not_adjudicated` only.
- ASR changed frozen visual boundary/operation/object/role decisions: `false`.
- Speech normalization: `none`; raw segment text and source segment indexes are preserved.

## Bundle statistics

| Artifact | Count |
| --- | ---: |
| Surfaces | 1 |
| Frame observations | 13 |
| Board objects | 3 |
| Board states | 4 |
| Delta events | 3 (`erase=1`, `add=1`, `unknown=1`) |
| Speech spans | 2 |
| Evidence refs | 22 |
| Board-grounded transitions | 3 |
| Learner observations | 0 |
| `needs_review` statuses | 11 |
| `accepted` statuses | 0 |

Every transition keeps pedagogical role and intent claims unknown. `observed_learner_response` is null, executable moves are empty, and `learner_observations` is empty.

## Validation and traceability

- `validateBoardEvidenceBundle`: `valid=true`, `issues=[]`.
- Canonical payload SHA-256 declared/computed: `54bfdc993c966231c9ed565e1a4b92a3078f61561623884c6561e8722dcc74a5` / identical.
- Final bundle file SHA-256: `e27bb4187f9e45dc48b43f7c3fff99a3626b72fb935f8339d389237d18a1ff06`.
- Controlled relative asset path checks: `23` unique referenced assets, `0` missing/unsafe paths.
- Referenced asset hash checks: `0` mismatches.
- Full A-asset manifest verification: `533/533` entries valid, `0` mismatches.
- Annotation-window checks across surfaces, frames, objects, states, deltas, speech, evidence, and transitions: `0` errors.
- ASR text/index/time-offset/provenance traceability: `0` errors.
- Visual-freeze hash/boundary/operation traceability: `0` errors.
- Accepted-artifact count check: `0`.
- Learner-observation and pedagogical-role-null checks: passed.

No specification, contract, B output, arbitration artifact, or other repository output was modified. No commit or push was created.
