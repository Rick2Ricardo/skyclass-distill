# V1 Baseline Freeze

- Baseline ID: `v1-c974bac`
- Git commit: `c974bac`
- Commit title: `feat: add multimodal distillation and executable assets`
- Freeze date: `2026-08-05`
- Experiment entry point: `POST /api/experiments/compare` in the TypeScript server.
- Fixed pilot set: `benchmark/pilot/physics_p0_smoke_v1.json`

The Git commit above is the immutable implementation reference. P0 fixes after
that commit must report their own working-tree or commit revision and must not
silently replace this baseline ID.

The three minimum P0 arms are:

1. `base`: same model, question only, no distilled Skill or visual evidence;
2. `text_skill`: same selected Skills, text fields only;
3. `multimodal_skill`: same selected Skills with packaged visual evidence.

A requested multimodal arm is eligible for the primary result only when its
execution audit records `actual=multimodal`, at least one actual visual input,
and no modality fallback.
