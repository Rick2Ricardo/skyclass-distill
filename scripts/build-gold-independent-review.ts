import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { GoldReviewStore } from "../packages/store/src/goldReviewStore.js";
import type { GoldReviewCandidate, GoldReviewGroup, GoldReviewSourceEvent, GoldReviewTimeRange } from "../packages/contracts/src/index.js";

const root = process.cwd();
const dataDir = resolve(root, "data");
const checkOnly = process.argv.includes("--check");
const manifestUri = "research/board2skill/GOLD_INDEPENDENT_REVIEW_MANIFEST_V1.json";
const visualTemplateUri = "research/board2skill/GOLD_INDEPENDENT_REVIEW_VISUAL_TEMPLATE_V1.json";
const physicsTemplateUri = "research/board2skill/GOLD_INDEPENDENT_REVIEW_PHYSICS_TEMPLATE_V1.json";
const protocolUri = "research/board2skill/GOLD_INDEPENDENT_REVIEW_PROTOCOL_V1.md";
const qualityProtocolUri = "research/board2skill/GOLD_DOUBLE_REVIEW_QUALITY_PROTOCOL_V1.json";
const QUALITY_PROTOCOL_JSON_SHA256 = "a50db9341390cdd82936fdfadcce419a0fce9d91c96b27c80f2ad59a4c0a291e";

const EXPECTED = {
  parent_repository_commit: "aa3fc1425d8bea0a699503f2192e3cdeb0fbf353",
  queue_sha256: "58eac46d9ca82003117a8c6d334103e171f211d67332c2a8314a3d2e06f53a20",
  active_manifest_uri: "research/board2skill/oracle_pilot_clips.json",
  active_manifest_sha256: "0531052460831836b3ed5353489903dab6c398de3651a66d9180bff17dc8e78d",
  workset_uri: "research/board2skill/GOLD_REVIEW_RESEARCH_WORKSET_V2.md",
  workset_sha256: "b841f7f26f8ddc458f321329ca58f49fc034a5366e53e782e3d875defaf3750a",
  annotation_policy_uri: "research/board2skill/DATA_AND_ANNOTATION_SPEC.md",
  annotation_policy_sha256: "ac3cfd01ce7278c3a35fe9a6112cabaa71b0569bd39711f652854c840993b0e2",
  persistence_policy_uri: "research/board2skill/ERASE_PERSISTENCE_POLICY_V1.md",
  persistence_policy_sha256: "ed5f0135fb9ee24308417722a480fdcf7f9c8f84c262dd70c46c7e44a94ba679",
  batch_03_uri: "research/board2skill/GOLD_ADJUDICATION_BATCH_03_REMAINING_V1.json",
  batch_03_sha256: "cc49569f0c7f539603f15c0dc6d4b731cf3ccdfc07db29e99bc704b9c1e16577",
  batch_03_payload_sha256: "b761dbf91304f31ca37fa83587e64f520d54a202480bf7ff3d7935d93bb443e9",
} as const;

const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
const domainHash = (domain: string, value: unknown): string => sha256(`${domain}\0${JSON.stringify(value)}`);

function inside(base: string, target: string): boolean {
  const path = relative(resolve(base), resolve(target));
  return path === "" || (!path.startsWith("..") && !path.startsWith("/") && !path.startsWith("\\"));
}

async function verifiedFile(uri: string, expectedSha256?: string): Promise<Buffer> {
  const path = resolve(root, uri);
  if (!inside(root, path)) throw new Error(`path escapes repository: ${uri}`);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error(`not a controlled regular file: ${uri}`);
  const real = await realpath(path);
  if (!inside(root, real)) throw new Error(`real path escapes repository: ${uri}`);
  const bytes = await readFile(real);
  if (expectedSha256 && sha256(bytes) !== expectedSha256) throw new Error(`SHA-256 mismatch: ${uri}`);
  return bytes;
}

function groupKey(group: Pick<GoldReviewGroup, "package_id" | "group_id">): string {
  return `${group.package_id}/${group.group_id}`;
}

await verifiedFile(EXPECTED.active_manifest_uri, EXPECTED.active_manifest_sha256);
await verifiedFile(qualityProtocolUri, QUALITY_PROTOCOL_JSON_SHA256);
await verifiedFile(EXPECTED.workset_uri, EXPECTED.workset_sha256);
await verifiedFile(EXPECTED.annotation_policy_uri, EXPECTED.annotation_policy_sha256);
await verifiedFile(EXPECTED.persistence_policy_uri, EXPECTED.persistence_policy_sha256);
const batch03 = JSON.parse((await verifiedFile(EXPECTED.batch_03_uri, EXPECTED.batch_03_sha256)).toString("utf8"));
if (batch03.batch_payload_sha256 !== EXPECTED.batch_03_payload_sha256 || batch03.items?.length !== 36) {
  throw new Error("Batch 03 source is not the frozen 36-card handoff");
}

const queue = await new GoldReviewStore(root, dataDir).queue();
const queueBytes = Buffer.from(JSON.stringify(queue), "utf8");
if (sha256(queueBytes) !== EXPECTED.queue_sha256) throw new Error("active Gold queue drifted from the frozen independent-review source");
if (queue.groups.length !== 52 || queue.packages.length !== 6 || queue.summary.decided_count !== 0
  || queue.summary.accepted_event_count !== 0 || queue.summary.signed_package_count !== 0 || queue.summary.paper_gold_ready) {
  throw new Error("independent review packets may only be generated from the frozen zero-decision 52-group queue");
}

const packageIntake = new Map(queue.packages.map((item) => [item.package_id, item.intake_sha256]));
type ReviewEvidence = {
  evidence_index: number;
  evidence_id: string;
  side: string;
  kind: string;
  label: string;
  asset_uri: string;
  sha256: string;
  byte_length: number;
};

type ReviewCard = {
  card_index: number;
  package_id: string;
  source_video_id: string;
  source_intake_sha256: string | undefined;
  group_id: string;
  alignment_class: string;
  group_time: GoldReviewTimeRange | null;
  source_events: GoldReviewSourceEvent[];
  candidates: GoldReviewCandidate[];
  evidence: ReviewEvidence[];
  evidence_set_sha256: string;
  unresolved_fields: string[];
  speech_context: { text: string; status: "context_not_gold" };
  card_sha256: string;
};

const cards: ReviewCard[] = [];
let evidenceAssetCount = 0;
let evidenceByteLength = 0;
for (const [cardIndex, group] of [...queue.groups].sort((left, right) => groupKey(left).localeCompare(groupKey(right), "en", { numeric: true })).entries()) {
  const evidence: ReviewEvidence[] = [];
  for (const [evidenceIndex, item] of group.evidence.entries()) {
    const bytes = await verifiedFile(item.path, item.sha256);
    evidenceAssetCount += 1;
    evidenceByteLength += bytes.byteLength;
    evidence.push({
      evidence_index: evidenceIndex,
      evidence_id: item.evidence_id,
      side: item.side,
      kind: item.kind,
      label: item.label,
      asset_uri: item.path,
      sha256: item.sha256,
      byte_length: bytes.byteLength,
    });
  }
  if (!evidence.some((item) => item.kind.toLowerCase().includes("comparison"))) {
    throw new Error(`independent-review card lacks comparison evidence: ${groupKey(group)}`);
  }
  const cardPayload = {
    card_index: cardIndex + 1,
    package_id: group.package_id,
    source_video_id: group.source_video_id,
    source_intake_sha256: packageIntake.get(group.package_id),
    group_id: group.group_id,
    alignment_class: group.alignment_class,
    group_time: group.time,
    source_events: group.source_events,
    candidates: group.candidates,
    evidence,
    evidence_set_sha256: domainHash("skyclass/gold-independent-review-evidence-set/v1", evidence),
    unresolved_fields: group.unresolved_fields,
    speech_context: { text: group.speech_context, status: "context_not_gold" as const },
  };
  cards.push({ ...cardPayload, card_sha256: domainHash("skyclass/gold-independent-review-card/v1", cardPayload) });
}
if (cards.length !== 52 || new Set(cards.map((item) => `${item.package_id}/${item.group_id}`)).size !== 52) {
  throw new Error("independent-review manifest must cover 52 unique queue groups");
}

const manifestPayload = {
  schema_version: "gold-independent-review-manifest-v1",
  status: "frozen_machine_evidence_human_assessments_pending",
  source_snapshot: {
    ...EXPECTED,
    queue_schema_version: queue.schema_version,
    queue_byte_length: queueBytes.byteLength,
  },
  protocol: {
    reviewer_slots: ["visual_reviewer", "physics_reviewer"],
    independent_before_reconciliation: true,
    reviewer_files_must_not_be_shared_before_both_complete: true,
    speech_status: "context_not_gold",
    machine_candidate_status: "hypothesis_not_gold",
    reconciliation_may_not_write_gold: true,
    final_store_decision_requires_explicit_joint_human_confirmation: true,
  },
  counts: {
    package_count: 6,
    group_count: 52,
    candidate_count: cards.reduce((sum, item) => sum + item.candidates.length, 0),
    evidence_asset_count: evidenceAssetCount,
    evidence_byte_length: evidenceByteLength,
  },
  cards,
  output_invariants: {
    decision_count: 0,
    accepted_event_count: 0,
    reviewer_identity_count: 0,
    package_signoff_count: 0,
    signed_gold_dataset_created: false,
  },
};
const manifest = {
  ...manifestPayload,
  manifest_payload_sha256: domainHash("skyclass/gold-independent-review-manifest/v1", manifestPayload),
};
const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestJsonSha256 = sha256(manifestBytes);

type ReviewerSlot = "visual_reviewer" | "physics_reviewer";
function buildTemplate(slot: ReviewerSlot) {
  const ordered = [...cards].sort((left, right) => {
    const leftKey = sha256(`skyclass/gold-independent-review-presentation/v1\0${slot}\0${left.card_sha256}`);
    const rightKey = sha256(`skyclass/gold-independent-review-presentation/v1\0${slot}\0${right.card_sha256}`);
    return leftKey.localeCompare(rightKey);
  });
  return {
    schema_version: "gold-independent-assessment-v1",
    manifest_payload_sha256: manifest.manifest_payload_sha256,
    manifest_json_sha256: manifestJsonSha256,
    reviewer_slot: slot,
    status: "unfilled_template",
    reviewer_id: null,
    reviewer_role: null,
    instructions: {
      do_not_open_peer_assessment_before_completion: true,
      inspect_all_evidence_for_final_boundaries: true,
      speech_is_context_not_gold: true,
      allowed_dispositions: ["accept", "reject", "not_an_event", "unknown"],
      replace_each_decision_null_with_completed_decision_object: true,
    },
    items: ordered.map((card, index) => ({
      presentation_index: index + 1,
      card_sha256: card.card_sha256,
      package_id: card.package_id,
      group_id: card.group_id,
      decision: null,
    })),
  };
}
const visualTemplate = buildTemplate("visual_reviewer");
const physicsTemplate = buildTemplate("physics_reviewer");
if (JSON.stringify(visualTemplate.items.map((item) => item.card_sha256)) === JSON.stringify(physicsTemplate.items.map((item) => item.card_sha256))) {
  throw new Error("reviewer presentation orders must differ");
}
const visualBytes = `${JSON.stringify(visualTemplate, null, 2)}\n`;
const physicsBytes = `${JSON.stringify(physicsTemplate, null, 2)}\n`;

const reviewPackagePayload = {
  schema_version: "gold-independent-review-package-v1",
  manifest_payload_sha256: manifest.manifest_payload_sha256,
  manifest_json_sha256: manifestJsonSha256,
  visual_template_sha256: sha256(visualBytes),
  physics_template_sha256: sha256(physicsBytes),
};
const reviewPackage = {
  ...reviewPackagePayload,
  review_package_sha256: domainHash("skyclass/gold-independent-review-package/v1", reviewPackagePayload),
};
const reviewPackageUri = "research/board2skill/GOLD_INDEPENDENT_REVIEW_PACKAGE_V1.json";
const reviewPackageBytes = `${JSON.stringify(reviewPackage, null, 2)}\n`;

const protocol = `# Independent Gold Double Review Protocol V1

## Research boundary

This protocol turns the frozen 52-group Gold queue into two independent human assessment sessions. It does **not** create a Gold decision, reviewer identity, package signoff, accepted event, or SignedGold dataset.

- frozen parent commit: \`${EXPECTED.parent_repository_commit}\`;
- frozen queue SHA-256: \`${EXPECTED.queue_sha256}\`;
- manifest payload commitment: \`${manifest.manifest_payload_sha256}\`;
- manifest JSON SHA-256: \`${manifestJsonSha256}\`;
- review package commitment: \`${reviewPackage.review_package_sha256}\`;
- denominator: 6 component packages / 52 groups / ${manifest.counts.candidate_count} candidates / ${evidenceAssetCount} evidence assets;
- initial state: 0 decided / 0 accepted / 0 signed.

## Files and isolation

1. Give [the visual template](${visualTemplateUri.split("/").at(-1)}) only to the visual reviewer.
2. Give [the physics template](${physicsTemplateUri.split("/").at(-1)}) only to the physics reviewer.
3. Both reviewers may use [the frozen evidence manifest](${manifestUri.split("/").at(-1)}), but neither may inspect the peer's filled assessment before both files are complete.
4. The two templates contain the same 52 cards in different deterministic presentation orders.
5. Fill \`reviewer_id\`, \`reviewer_role\`, set \`status\` to \`completed_independent_assessment\`, and replace every \`decision: null\` with:

\`\`\`json
{
  "disposition": "accept | reject | not_an_event | unknown",
  "selected_candidate_ids": [],
  "final_events": [],
  "rationale": "visible-evidence justification",
  "reviewed_at": "ISO-8601 timestamp"
}
\`\`\`

For \`accept\`, selected candidates and final events must close one-to-one. For every other disposition both arrays remain empty. Speech is always \`context_not_gold\`.

Reviewer identity uniqueness is an external human-governance assertion: one person must not use two aliases to occupy both slots. The reconciler rejects identical IDs, while the study owner remains responsible for the identity registry and session isolation.

## Reconciliation

Run:

\`\`\`bash
npm run board:reconcile-gold-double-review -- <completed-visual.json> <completed-physics.json> [output.json]
\`\`\`

The reconciler revalidates the frozen manifest, both complete item sets, candidate/event provenance and reviewer independence. It reports exact agreements and conflicts. A blocked or relabel quality branch propagates to the top-level reconciliation status; it cannot appear as ready for joint confirmation. Even \`ready_for_joint_human_confirmation_no_gold_written\` only means that reliability passed and no scientific conflict remains: a human must still confirm every final decision before the existing append-only Store endpoint may be used.

Before either assessment is filled, [the quality protocol](GOLD_DOUBLE_REVIEW_QUALITY_PROTOCOL_V1.json) freezes two primary reliability gates: Cohen's κ over the four dispositions and Cohen's κ over the canonical accepted operation sequence (all non-accepted decisions are one explicit \`NO_EVENT_ACCEPTED\` category). Both must be estimable and at least \`0.67\` before the labeling ontology may continue unchanged; \`0.80\` is the target. A single-category perfect match is reported as \`BLOCKED_PRIMARY_KAPPA_NOT_ESTIMABLE\`, never as reliable agreement. Boundary errors and exact/candidate/semantic agreement are diagnostics without an additional post-hoc threshold.

The exact quality-protocol JSON bytes are pinned as SHA-256 \`${QUALITY_PROTOCOL_JSON_SHA256}\` in the generator, reconciler and quality report. The review-package commitment is already an input to the protocol, so this one-way binding avoids a circular content-hash graph while proving which preregistered bytes were used.

The reconciliation artifact embeds a domain-separated \`pre_adjudication_quality_report\`. It binds the frozen protocol, manifest, review package and exact bytes of both completed assessments. This report is reliability evidence only: it is not Gold and cannot create a decision, accepted event, signoff, SignedGold dataset, model score or paper claim.

## Stop conditions

- source, manifest, card, evidence or template hash drift;
- missing, duplicated or reordered assessment item;
- same reviewer identity in both slots;
- acceptance without a selected candidate and exact final event;
- event source, operation, boundary, semantic label, relation or modification drift;
- either reviewer seeing the peer file before completion;
- any attempt to treat reconciliation output as Gold, signoff, or a scientific result.
`;

async function emit(uri: string, bytes: string): Promise<void> {
  const path = resolve(root, uri);
  if (checkOnly) {
    if (await readFile(path, "utf8") !== bytes) throw new Error(`generated artifact drifted: ${uri}`);
  } else {
    await writeFile(path, bytes, { encoding: "utf8", mode: 0o644 });
  }
}

await emit(manifestUri, manifestBytes);
await emit(visualTemplateUri, visualBytes);
await emit(physicsTemplateUri, physicsBytes);
await emit(reviewPackageUri, reviewPackageBytes);
await emit(protocolUri, protocol);
console.log(`${checkOnly ? "verified" : "wrote"} independent review: 52 cards / ${evidenceAssetCount} evidence / ${evidenceByteLength} bytes; manifest ${manifest.manifest_payload_sha256}`);
