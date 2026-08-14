# Independent Gold Double Review Protocol V1

## Research boundary

This protocol turns the frozen 52-group Gold queue into two independent human assessment sessions. It does **not** create a Gold decision, reviewer identity, package signoff, accepted event, or SignedGold dataset.

- frozen parent commit: `aa3fc1425d8bea0a699503f2192e3cdeb0fbf353`;
- frozen queue SHA-256: `58eac46d9ca82003117a8c6d334103e171f211d67332c2a8314a3d2e06f53a20`;
- manifest payload commitment: `87a8a583a884b8a6702f5db0a8fafdf747cce79404d06232ca5a94ddd815014e`;
- manifest JSON SHA-256: `1150a7a4f5283ab2e3c1688ecde1ceb5396ee4c62ccc758332880b12723af9b0`;
- review package commitment: `21de05a19d9cdccf47c4aab05562cb1463d02d0a2eb275c567fd84186b7211e7`;
- denominator: 6 component packages / 52 groups / 54 candidates / 398 evidence assets;
- initial state: 0 decided / 0 accepted / 0 signed.

## Files and isolation

1. Give [the visual template](GOLD_INDEPENDENT_REVIEW_VISUAL_TEMPLATE_V1.json) only to the visual reviewer.
2. Give [the physics template](GOLD_INDEPENDENT_REVIEW_PHYSICS_TEMPLATE_V1.json) only to the physics reviewer.
3. Both reviewers may use [the frozen evidence manifest](GOLD_INDEPENDENT_REVIEW_MANIFEST_V1.json), but neither may inspect the peer's filled assessment before both files are complete.
4. The two templates contain the same 52 cards in different deterministic presentation orders.
5. Fill `reviewer_id`, `reviewer_role`, set `status` to `completed_independent_assessment`, and replace every `decision: null` with:

```json
{
  "disposition": "accept | reject | not_an_event | unknown",
  "selected_candidate_ids": [],
  "final_events": [],
  "rationale": "visible-evidence justification",
  "reviewed_at": "ISO-8601 timestamp"
}
```

For `accept`, selected candidates and final events must close one-to-one. For every other disposition both arrays remain empty. Speech is always `context_not_gold`.

Reviewer identity uniqueness is an external human-governance assertion: one person must not use two aliases to occupy both slots. The reconciler rejects identical IDs, while the study owner remains responsible for the identity registry and session isolation.

## Reconciliation

Run:

```bash
npm run board:reconcile-gold-double-review -- <completed-visual.json> <completed-physics.json> [output.json]
```

The reconciler revalidates the frozen manifest, both complete item sets, candidate/event provenance and reviewer independence. It reports exact agreements and conflicts. A blocked or relabel quality branch propagates to the top-level reconciliation status; it cannot appear as ready for joint confirmation. Even `ready_for_joint_human_confirmation_no_gold_written` only means that reliability passed and no scientific conflict remains: a human must still confirm every final decision before the existing append-only Store endpoint may be used.

Before either assessment is filled, [the quality protocol](GOLD_DOUBLE_REVIEW_QUALITY_PROTOCOL_V1.json) freezes two primary reliability gates: Cohen's κ over the four dispositions and Cohen's κ over the canonical accepted operation sequence (all non-accepted decisions are one explicit `NO_EVENT_ACCEPTED` category). Both must be estimable and at least `0.67` before the labeling ontology may continue unchanged; `0.80` is the target. A single-category perfect match is reported as `BLOCKED_PRIMARY_KAPPA_NOT_ESTIMABLE`, never as reliable agreement. Boundary errors and exact/candidate/semantic agreement are diagnostics without an additional post-hoc threshold.

The exact quality-protocol JSON bytes are pinned as SHA-256 `a50db9341390cdd82936fdfadcce419a0fce9d91c96b27c80f2ad59a4c0a291e` in the generator, reconciler and quality report. The review-package commitment is already an input to the protocol, so this one-way binding avoids a circular content-hash graph while proving which preregistered bytes were used.

The reconciliation artifact embeds a domain-separated `pre_adjudication_quality_report`. It binds the frozen protocol, manifest, review package and exact bytes of both completed assessments. This report is reliability evidence only: it is not Gold and cannot create a decision, accepted event, signoff, SignedGold dataset, model score or paper claim.

## Stop conditions

- source, manifest, card, evidence or template hash drift;
- missing, duplicated or reordered assessment item;
- same reviewer identity in both slots;
- acceptance without a selected candidate and exact final event;
- event source, operation, boundary, semantic label, relation or modification drift;
- either reviewer seeing the peer file before completion;
- any attempt to treat reconciliation output as Gold, signoff, or a scientific result.
