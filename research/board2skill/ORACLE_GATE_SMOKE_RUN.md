# Oracle Gate executable smoke: run-003

Date: 2026-08-12

Status: `not_evaluable` engineering wiring smoke
Model: `gpt-5.5`

## Purpose

This run answers only whether all four evidence conditions can execute under one frozen and auditable API protocol. It does not estimate treatment value, does not rank the four conditions, and must not be cited as an experiment result.

The four paired conditions are:

1. Transcript only
2. Static final board
3. Uniformly sampled video frame
4. Oracle before/delta/after board evidence

## Frozen input

- Gold-dev bundle: `tbv2-ly-004-01-gold-dev-v2`
- Bundle payload SHA-256: `23e8ce456c302a82c0ad2dfd9c105943bc7f2f91288cac0acaba0d1dc3758b1f`
- Smoke specification: `research/board2skill/experiments/oracle-gate-smoke-2event-v1.json`
- Blind-seed handling: the repository stores only a SHA-256 commitment; the private seed is supplied at runtime through `ORACLE_GATE_BLIND_SEED` and is absent from Git and public evaluator artifacts
- Cases: `B-DELTA-05`, `B-DELTA-06`
- Uniform frames: 90 s and 99 s, frozen by path, timestamp, and SHA-256 in the v2 adjudication ledger
- Generation seed: `20260812`
- Prompt SHA-256: `38cdf0bfad57415873b0d17572eebe592d8ec348571a38254a68dace84d5d080`
- Output schema SHA-256: `a4632fc7c3902417f4ae341de2c0b1996fe3ad93797c91b701bc4f4dd35cc1ea`
- Protocol fingerprint SHA-256: `7cbe7caf3789f3eeded3bf3334542a72aeaee81521df225d5d9873ce289c6052`

Gold-dev v1 remains unchanged at payload SHA-256 `266415d4f9d67d96b4d743140f6d162197454bf5cfdbf4d86ee18386e2f27f20`, preserving the provenance of grounded Skill run-005. V2 is a new version rather than an in-place mutation.

## Runtime audit

- Nominal matrix: 2 cases × 4 arms × 1 seed
- Completed requests: 8
- Text-only requests: 2
- Visual requests: 6
- Visual request shape: exactly one `1920×360 image/jpeg` canonical canvas per request
- Transport: Pi streaming for all text and visual calls
- Cache: disabled
- Tools: none
- Stop reason: 8/8 `stop`
- Attempts: 8/8 completed on attempt 1
- Token usage: present for 8/8 requests; 16,707 total tokens across the wiring smoke
- Blind items: 8; public keys are only blind ID, paired-case ID, seed index, response, and response hash
- Private answer key: 8 records in a separate private output directory

Per-arm token totals are retained only as runtime diagnostics, not outcome metrics: transcript 2,358; static final 5,061; uniform 4,918; oracle delta 4,370. The difference reflects provider tokenization and generated response length; it is not an effectiveness comparison.

## Fail-closed guarantees exercised

- Text and visual arms use the same Pi adapter and frozen sampling configuration.
- The runner recomputes the provider request SHA from model, system/user inputs, sampling controls, and submitted visual bytes.
- Submitted visual labels, content hashes, MIME types, and byte lengths must match the canonical canvas exactly.
- Text-only responses cannot claim the unavailable `visual-1` evidence slot.
- Unregistered response fields, including nested arm or condition metadata, are rejected.
- Non-`stop`, missing token usage, model/audit mismatch, invalid image, bad hash, or path escape aborts the run.
- The evaluator package contains no arm or condition SHA; the private key is stored separately.

## Non-results and next gate

No Evidence Grounding, Edit Coverage, Temporal Fidelity, Unsupported Claim Rate, confidence interval, or Go/Stop decision is computed from this run. A single-delta case cannot define edit-order Kendall τ.

Formal execution remains closed until all of the following hold:

- 30–50 double-annotated and human-signed Gold events
- At least two teachers and preferably four independent source videos
- Coverage of ADD, ERASE, MODIFY, and CONNECT
- At least one multi-edit window, with multiple windows required for a useful temporal analysis
- At least three preregistered generation seeds
- Frozen blind-rating and hierarchical-bootstrap protocol

The local run artifacts are under `data/board2skill/oracle-gate-smoke/run-003/` and are intentionally excluded from Git because they contain model responses and private answer-key material. The private directory is mode `0700`; its files are mode `0600`.
