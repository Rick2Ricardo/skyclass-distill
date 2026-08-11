# KG005 2134–2166 s temporal-board-v2 annotator B log

Date: 2026-08-12 (Asia/Shanghai)
Source: `phy-force-kunge-005`
Absolute window: `[2134.000, 2166.000]` seconds
Bundle: `data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/annotator-b.json`
Review policy: independent / `needs_review`; accepted artifacts: **0**

## Independence and freeze order

This is annotator B's independent visual pass. Before freezing the visual interpretation, I read only the temporal-board-v2 method/contract, the canonical clip/source metadata, and the source video. I did **not** read annotator A files or logs, A assets or model output, or operation-gap scout semantic conclusions.

The full visual object inventory, stable states, operations, and absolute boundaries were frozen at `2026-08-11T18:20:36Z` in:

- `data/board2skill/oracle-pilot/tbv2-kg005-modify-2134-2166/b-visual-freeze.json`
- freeze SHA-256: `6f82f450084eae509a300da2a6688acd11efae6d7cbdc67b5a06eef2a72a4015`

Only after that file was written and hashed did I read `asr/clip-2134-2166.json`. ASR was used as raw contemporaneous speech context only. It did not change any visual object, state, operation, boundary, or the transient-event exclusion.

## Visual procedure and assets

The board is a fixed digital-ink surface occupying video-normalized polygon `(0,0)–(0.759375,0.9444444444)`. I inspected dense 4 fps frames, then independent 10 fps crops around ambiguous short changes. Final evidence uses only annotator-B-prefixed assets:

- 13 full frames in `b-frames/`
- 13 calibrated board crops in `b-boards/`
- 8 binary delta masks and 8 before/diff/after comparisons in `b-deltas/`

All 42 referenced B assets have SHA-256 values embedded beside their controlled relative URIs. The generator recomputed every digest from the file bytes and failed closed on missing or changed assets.

The visible red sweep beneath the options at `2161.1–2161.9` was excluded: it disappears before a stable after-state, so the visual evidence supports a transient pointer/gesture rather than a persistent board object.

## Frozen states and operations

| Delta | Absolute interval (s) | Before → after | Operation | Frozen observable change |
|---|---:|---|---|---|
| `kg005-b-d01` | 2134.1–2135.1 | s0 → s1 | ADD | Complete two lower red emphasis circles; left-window-censored because the first circle is already in progress at 2134.0. |
| `kg005-b-d02` | 2136.3–2137.8 | s1 → s2 | ERASE | Remove the pre-existing right-side/lower red working and the completed-circle strokes; absence confirmed through 2140.0. |
| `kg005-b-d03` | 2140.2–2154.9 | s2 → s3 | ADD | Continuously write one spatially connected fraction-form expression beginning with `k` and the visible numerator `F r²`. |
| `kg005-b-d04` | 2156.6–2158.3 | s3 → s4 | ADD | Extend the fraction bar and add the first equals sign. |
| `kg005-b-d05` | 2158.9–2159.0 | s4 → s5 | ERASE | Erase the first equals sign; absence confirmed through 2159.8. |
| `kg005-b-d06` | 2159.9–2160.2 | s5 → s6 | ADD | Rewrite the equals sign in the same region. |
| `kg005-b-d07` | 2163.0–2163.3 | s6 → s7 | ERASE | Erase the first visible `F r²` numerator; absence confirmed through 2164.1. |
| `kg005-b-d08` | 2164.2–2165.1 | s7 → s8 | ADD | Rewrite visible `F r²` in the same numerator region. |

Operation totals are ADD `5`, ERASE `3`, MODIFY `0`, CONNECT `0`, MOVE `0`, UNKNOWN `0`. The clip-directory name did not determine the label: the visual sequence contains separable persistent erase/add events, so no MODIFY was asserted.

Stable-state intervals are `s0 2134.0–2134.1`, `s1 2135.1–2136.3`, `s2 2137.8–2140.0`, `s3 2154.9–2156.6`, `s4 2158.3–2158.9`, `s5 2159.0–2159.8`, `s6 2160.2–2163.0`, `s7 2163.3–2164.1`, and `s8 2165.1–2166.0`. All are absolute source-video seconds and remain `needs_review`.

## Raw ASR provenance after visual freeze

ASR file SHA-256: `72a435476427fceb9c23acd01092bed0566387fc64f4c1c6ffab91f358d87d76`. Each bundle span preserves the source segment's exact `text`, keeps `normalization: none` and `normalized_text: null`, records the original zero-based segment index, and converts clip-relative time by adding exactly `2134` seconds.

| Index | Clip-relative (s) | Absolute (s) | Exact raw text |
|---:|---:|---:|---|
| 0 | 0.00–2.30 | 2134.00–2136.30 | 乘以比平方除以千克的平方就推出来 |
| 1 | 2.56–4.10 | 2136.56–2138.10 | 同样道理这一道题也是啊对不对 |
| 2 | 4.36–5.88 | 2138.36–2139.88 | 你就先推码这才第二道题 |
| 3 | 6.14–6.64 | 2140.14–2140.64 | k |
| 4 | 6.90–8.44 | 2140.90–2142.44 | 他就等于fr平方 |
| 5 | 8.70–9.98 | 2142.70–2143.98 | 就是力乘以距离的平方 |
| 6 | 10.24–11.26 | 2144.24–2145.26 | 再除以之一道 |
| 7 | 11.52–14.60 | 2145.52–2148.60 | i1i2然后delta有1delta有2这还挺长的对不对 |
| 8 | 14.86–15.88 | 2148.86–2149.88 | i1i2 |
| 9 | 16.14–16.90 | 2150.14–2150.90 | 然后是delta |
| 10 | 17.16–18.18 | 2151.16–2152.18 | 相当于delta有1 |
| 11 | 18.44–19.46 | 2152.44–2153.46 | delta有2 |
| 12 | 21.24–22.02 | 2155.24–2156.02 | delta有2 |
| 13 | 22.28–23.04 | 2156.28–2157.04 | 那你现在来看 |
| 14 | 23.56–24.06 | 2157.56–2158.06 | 他的单位 |
| 15 | 24.32–25.08 | 2158.32–2159.08 | 就只看单位啊 |
| 16 | 25.86–26.36 | 2159.86–2160.36 | 那么 |
| 17 | 26.62–28.16 | 2160.62–2162.16 | 仔细观察一下选项里面没有牛顿 |
| 18 | 28.42–31.76 | 2162.42–2165.76 | 所以他肯定是把利用千克米每23秒 |

No speech normalization or semantic repair was applied. The transition fields preserve only an observable board-action statement. Trigger, teaching action, pedagogical role, expected learner change, learning check, and remediation are explicitly unknown; `observed_learner_response` is `null`, and `learner_observations` is empty.

## Validation ledger

- Contract: `validateBoardEvidenceBundle` returned `valid: true` with `0` issues.
- Canonical payload SHA-256: `d085bc5b0bd64c15d247570295b2b842f9b412ba5b3a41db2418bc13b4783265`; a fresh hash of `canonicalBoardEvidencePayload(bundle)` matches the declared value.
- Serialized bundle SHA-256: `53e6dc47c13685a4865556980780a27375a9a4cdcbe51956b627f0f62cfc146c`.
- Source video SHA-256: `127ed9323274d0dd00f3cc39c4a3b68f3109d74dbfd7fb2d08f87cab008f7241`; verified against the canonical source metadata and current bytes.
- Source probe: duration `8790.021451` s, size `613147736` bytes, H.264 `1280×720` at `30/1` fps, AAC `44100` Hz stereo.
- Time audit: every surface, frame, object lifecycle, state, delta, speech span, evidence range, and transition uses absolute source time and lies inside `[2134,2166]` and the source duration.
- Erase audit: affected objects are present before and absent after; each erase has restored visibility, finite `confirmed_until`, and a same-surface support frame reaching that horizon.
- Status audit: surface `1/1`, states `9/9`, deltas `8/8`, and transitions `8/8` are `needs_review`; accepted count `0`.
- Teacher-only audit: `learner_observations: []`, every `observed_learner_response: null`, no learner-observed or learner-hypothesis claim, and no inferred role or intent.

No alignment or arbitration against another annotation was performed. No commit or push was made.
