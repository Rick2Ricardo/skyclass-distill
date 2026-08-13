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

The reconciler revalidates the frozen manifest, both complete item sets, candidate/event provenance and reviewer independence. It reports exact agreements and conflicts. Even a conflict-free report is only `ready_for_joint_human_confirmation_no_gold_written`: a human must still confirm the final decision before the existing append-only Store endpoint may be used.

## Stop conditions

- source, manifest, card, evidence or template hash drift;
- missing, duplicated or reordered assessment item;
- same reviewer identity in both slots;
- acceptance without a selected candidate and exact final event;
- event source, operation, boundary, semantic label, relation or modification drift;
- either reviewer seeing the peer file before completion;
- any attempt to treat reconciliation output as Gold, signoff, or a scientific result.
