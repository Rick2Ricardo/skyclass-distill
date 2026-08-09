# Translation and extraction notes

## Status

This is a **draft core-reading bundle**, not yet a paragraph-by-paragraph translation of all 31 PDF pages.

- Fully aligned in this pass: abstract, problem framing, method, experimental setup, main comparison, key scaling/online/source/representation/selection ablations, conclusion, human validation, failure patterns, and limitations.
- Mapped but not translated paragraph by paragraph: the full reference list (pp.10–14), detailed benchmark/backend protocols (Appendices A–H), most qualitative case-study captions (Appendix J), the full user-study table, and the on-disk schema listing.
- No OCR was used. The PDF has a selectable text layer; text was extracted directly and checked against page renders.
- Source block IDs in `paper.md` and `source_map.json` are stable for this draft. New blocks should receive new IDs rather than renumbering existing ones.

## Terminology decisions

- `skill` → “技能”; `capability` remains “能力”.
- `procedural knowledge` → “程序性知识”.
- `artifact` → “产物”, avoiding “工件” in this software-authoring context.
- `harness` → “智能体运行框架”; the `-H` suffix does not denote a human rater.
- Framework and component names such as Resource2Skill and MetaBrowse are retained in English.
- Percentage-point changes use “个百分点”; raw score differences use “分” only where the paper treats the scale as percentage points.

## Layout and figure notes

- The PDF is A4 and mostly single-column, despite dense academic layout. Reading order was verified visually on all 31 rendered pages.
- Figure and table crops were taken from 180-dpi renders and visually checked to exclude surrounding body prose.
- Figure 3 and Table 2 share PDF page 8 and were split into separate assets.
- Tables 4 and 5 are retained as one image because they are discussed together in the representation/selection ablation passage.
- The crop bounding boxes are not yet encoded in `source_map.json`; the corresponding `bbox` arrays are intentionally empty rather than guessed.

## Uncertainty and claims to revisit

- The paper reports several current model/backend names and benchmark configurations dated 2026. These are translated as written, without external verification.
- “Statistically significant” is preserved for the reported paired Wilcoxon tests, but this draft does not independently recompute the statistics.
- The human A/B study supports preference direction, but Krippendorff’s `α = 0.58` indicates only moderate inter-rater agreement; the critical reading notes flag this explicitly.
- The online-acquisition result on `T_novel` is a targeted coverage-gap experiment, not an estimate of benefit on naturally sampled requests.

## Next-pass queue

1. Appendix A–C: per-domain backends, benchmark construction, and harness configurations.
2. Appendix D–I: acceptance predicate, retrieval/composition quality, judge reliability, paired tests, and online acquisition details.
3. Appendix J–L: all success/failure case figures, full human-study table, and skill storage schema.
