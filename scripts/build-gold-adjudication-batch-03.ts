import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { GoldReviewStore } from "../packages/store/src/goldReviewStore.js";
import type { GoldReviewGroup, GoldReviewQueue } from "../packages/contracts/src/index.js";

const root = process.cwd();
const dataDir = resolve(root, "data");
const checkOnly = process.argv.includes("--check");
const jsonUri = "research/board2skill/GOLD_ADJUDICATION_BATCH_03_REMAINING_V1.json";
const markdownUri = "research/board2skill/GOLD_ADJUDICATION_BATCH_03_REMAINING_V1.md";

const EXPECTED = {
  parent_repository_commit: "805be314350bcf6166f890b709f6a160d5f8880a",
  manifest_uri: "research/board2skill/oracle_pilot_clips.json",
  manifest_sha256: "0531052460831836b3ed5353489903dab6c398de3651a66d9180bff17dc8e78d",
  workset_uri: "research/board2skill/GOLD_REVIEW_RESEARCH_WORKSET_V2.md",
  workset_sha256: "b841f7f26f8ddc458f321329ca58f49fc034a5366e53e782e3d875defaf3750a",
  earlier_batch_01_uri: "research/board2skill/GOLD_ADJUDICATION_BATCH_01_V1.md",
  earlier_batch_01_sha256: "002230de0c7c00843c484b0382ea70a40ba0c6300138a10aa6e2ae724a537007",
  erase_batch_02_uri: "research/board2skill/GOLD_ADJUDICATION_BATCH_02_ERASE_V1.md",
  erase_batch_02_sha256: "8f3df84943d6af0d36d3110ff5e3713b4034dcd6f560da2afa0e0ce247b95e93",
  queue_sha256: "58eac46d9ca82003117a8c6d334103e171f211d67332c2a8314a3d2e06f53a20",
  annotation_policy_uri: "research/board2skill/DATA_AND_ANNOTATION_SPEC.md",
  annotation_policy_sha256: "ac3cfd01ce7278c3a35fe9a6112cabaa71b0569bd39711f652854c840993b0e2",
  persistence_policy_uri: "research/board2skill/ERASE_PERSISTENCE_POLICY_V1.md",
  persistence_policy_sha256: "ed5f0135fb9ee24308417722a480fdcf7f9c8f84c262dd70c46c7e44a94ba679",
} as const;

const PACKAGE_ORDER = [
  "tbv2-kg-003-01-a-b-2720-2880-human-intake",
  "tbv2-ly-003-01-a-b-702-922-human-intake",
] as const;

const EARLIER_BATCH_GROUPS = new Set([
  "kg003-erase-ab2-4422-4428-persistence-v2/kg003-erase-ab2-pair-1",
  "kg005-erase-add-ab-1888-1905-persistence-v2/KG005-AB-001",
  "kg005-erase-add-ab-1888-1905-persistence-v2/KG005-AB-002",
  "kg005-erase-add-ab-1888-1905-persistence-v2/KG005-AB-003",
  "kg005-modify-ab-adjudication-2134-2166/KG005-AB-G01",
  "kg005-modify-ab-adjudication-2134-2166/KG005-AB-G02",
  "kg005-modify-ab-adjudication-2134-2166/KG005-AB-G03",
  "kg005-modify-ab-adjudication-2134-2166/KG005-AB-G04",
  "kg005-modify-ab-adjudication-2134-2166/KG005-AB-G05",
  "tbv2-ly-004-01-a2-b-133-240-human-intake/G01",
  "tbv2-ly-004-01-a2-b-133-240-human-intake/G02",
  "tbv2-ly-004-01-a2-b-133-240-human-intake/G03",
  "tbv2-ly-004-01-a2-b-133-240-human-intake/G04",
  "tbv2-ly-004-01-a2-b-133-240-human-intake/G05",
  "tbv2-ly-004-01-a2-b-133-240-human-intake/G06",
  "tbv2-ly-004-01-a2-b-133-240-human-intake/G07",
]);

const QUICK = new Set([
  "tbv2-kg-003-01-a-b-2720-2880-human-intake/G02",
  "tbv2-kg-003-01-a-b-2720-2880-human-intake/G03",
  "tbv2-kg-003-01-a-b-2720-2880-human-intake/G05",
  "tbv2-kg-003-01-a-b-2720-2880-human-intake/G09",
  "tbv2-kg-003-01-a-b-2720-2880-human-intake/G11",
  "tbv2-kg-003-01-a-b-2720-2880-human-intake/G15",
  "tbv2-kg-003-01-a-b-2720-2880-human-intake/G16",
  "tbv2-kg-003-01-a-b-2720-2880-human-intake/G18",
  "tbv2-ly-003-01-a-b-702-922-human-intake/G02",
  "tbv2-ly-003-01-a-b-702-922-human-intake/G03",
  "tbv2-ly-003-01-a-b-702-922-human-intake/G04",
  "tbv2-ly-003-01-a-b-702-922-human-intake/G08",
  "tbv2-ly-003-01-a-b-702-922-human-intake/G09",
  "tbv2-ly-003-01-a-b-702-922-human-intake/G12",
  "tbv2-ly-003-01-a-b-702-922-human-intake/G13",
  "tbv2-ly-003-01-a-b-702-922-human-intake/G17",
]);

const SPECIALIST: Record<string, string[]> = {
  "tbv2-kg-003-01-a-b-2720-2880-human-intake/G04": [
    "B-only mark: decide whether the new theta-like glyph is persistent teacher ink or not an event.",
    "Do not use speech to promote an unreadable glyph into a semantic label.",
  ],
  "tbv2-kg-003-01-a-b-2720-2880-human-intake/G07": [
    "B-only circled problem-text candidate: verify viewport registration before deciding event existence.",
    "Transcribe the circled glyphs from the board image only; otherwise choose unknown or reject.",
  ],
  "tbv2-kg-003-01-a-b-2720-2880-human-intake/G17": [
    "Resolve the visible label as f, f-prime, or unreadable without using the speech transcript as Gold.",
  ],
  "tbv2-kg-003-01-a-b-2720-2880-human-intake/G19": [
    "B-only auxiliary mark: decide whether it is a persistent board object or transient pen/tool trace.",
    "Do not assign a physical meaning unless the visible mark itself supports it.",
  ],
  "tbv2-ly-003-01-a-b-702-922-human-intake/G01": [
    "The review window starts mid-line. Verify that the suffix is a new persistent addition rather than pre-existing left-censored content.",
  ],
  "tbv2-ly-003-01-a-b-702-922-human-intake/G05": [
    "B-only partial question line: keep unknown if the visible fragment cannot be transcribed independently.",
  ],
  "tbv2-ly-003-01-a-b-702-922-human-intake/G06": [
    "B-only short mark: determine event existence and exact visible text from the full evidence sequence.",
  ],
  "tbv2-ly-003-01-a-b-702-922-human-intake/G07": [
    "A has two source events while B has one continuation envelope. Freeze one consistent semantic-event granularity before accepting.",
    "Do not merge two independently meaningful questions merely to match one annotator envelope.",
  ],
  "tbv2-ly-003-01-a-b-702-922-human-intake/G11": [
    "A separates the base equation and the appended =ma; B uses one envelope. Preserve ADD semantics and resolve event granularity explicitly.",
  ],
  "tbv2-ly-003-01-a-b-702-922-human-intake/G14": [
    "A groups mg and N while B has two source events. Confirm whether the Gold unit is one compound drawing action or two semantic additions.",
  ],
  "tbv2-ly-003-01-a-b-702-922-human-intake/G16": [
    "A-only construction line: decide whether it is a persistent semantic board object or merely an auxiliary trace.",
  ],
};

type Tier = "quick_confirmation" | "bounded_review" | "specialist_adjudication";

type BatchEvidence = {
  evidence_index: number;
  evidence_id: string;
  side: string;
  kind: string;
  label: string;
  asset_uri: string;
  sha256: string;
  byte_length: number;
};

type BatchItem = {
  review_index: number;
  tier: Tier;
  package_id: string;
  source_video_id: string;
  group_id: string;
  alignment_class: string;
  group_time: GoldReviewGroup["time"];
  source_events: GoldReviewGroup["source_events"];
  proposed_candidate: {
    candidate_id: string;
    event_id: string;
    source_event_refs: string[];
    operation: GoldReviewGroup["candidates"][number]["operation"];
    time: GoldReviewGroup["candidates"][number]["time"];
    semantic_label: string;
    region: GoldReviewGroup["candidates"][number]["region"];
    relation: GoldReviewGroup["candidates"][number]["relation"];
    modification: GoldReviewGroup["candidates"][number]["modification"];
    machine_acceptance_ready: boolean;
    machine_acceptance_blockers: string[];
    status: "unverified_machine_proposal_not_gold";
  };
  compiler_canonical_comparison: BatchEvidence;
  comparison_evidence: BatchEvidence[];
  evidence: BatchEvidence[];
  evidence_set_sha256: string;
  unresolved_fields_from_queue: string[];
  speech_context: { text: string; status: "context_not_gold" };
  required_human_questions: string[];
  required_review_path: string;
  human_decision_created: false;
  accepted_event_created: false;
  reviewer_identity_created: false;
  package_signoff_created: false;
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function domainHash(domain: string, value: unknown): string {
  return sha256(`${domain}\0${JSON.stringify(value)}`);
}

function inside(base: string, target: string): boolean {
  const path = relative(resolve(base), resolve(target));
  return path === "" || (!path.startsWith("..") && !path.startsWith("/") && !path.startsWith("\\"));
}

async function verifiedFile(uri: string, expectedSha256: string): Promise<Buffer> {
  const path = resolve(root, uri);
  if (!inside(root, path)) throw new Error(`path escapes repository: ${uri}`);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`not a controlled regular file: ${uri}`);
  const real = await realpath(path);
  if (!inside(root, real)) throw new Error(`real path escapes repository: ${uri}`);
  const bytes = await readFile(real);
  if (sha256(bytes) !== expectedSha256) throw new Error(`SHA-256 mismatch: ${uri}`);
  return bytes;
}

function groupKey(group: Pick<GoldReviewGroup, "package_id" | "group_id">): string {
  return `${group.package_id}/${group.group_id}`;
}

function tierFor(group: GoldReviewGroup): Tier {
  const key = groupKey(group);
  if (SPECIALIST[key]) return "specialist_adjudication";
  if (QUICK.has(key)) return "quick_confirmation";
  return "bounded_review";
}

function baseQuestions(group: GoldReviewGroup): string[] {
  const questions = [
    "Does the canonical comparison and the full frozen evidence sequence show a persistent board-state change?",
    "Does the proposed operation match the stable before/after semantic change?",
    "Are the event start/end, visible transcription, region, and object identity supported without speech or subtitles?",
  ];
  if (group.alignment_class.includes("only")) {
    questions.push("This is a one-sided candidate: inspect every linked evidence frame before deciding event existence.");
  }
  return questions;
}

function compareGroup(left: GoldReviewGroup, right: GoldReviewGroup): number {
  const tierOrder: Record<Tier, number> = { quick_confirmation: 0, bounded_review: 1, specialist_adjudication: 2 };
  return tierOrder[tierFor(left)] - tierOrder[tierFor(right)]
    || PACKAGE_ORDER.indexOf(left.package_id as typeof PACKAGE_ORDER[number]) - PACKAGE_ORDER.indexOf(right.package_id as typeof PACKAGE_ORDER[number])
    || left.group_id.localeCompare(right.group_id, "en", { numeric: true });
}

const queue = await new GoldReviewStore(root, dataDir).queue();
const queueBytes = Buffer.from(JSON.stringify(queue), "utf8");
if (sha256(queueBytes) !== EXPECTED.queue_sha256) throw new Error("active Gold queue drifted from the frozen batch source");
if (queue.summary.package_count !== 6 || queue.summary.group_count !== 52
  || queue.summary.decided_count !== 0 || queue.summary.accepted_event_count !== 0
  || queue.summary.signed_package_count !== 0 || queue.summary.paper_gold_ready !== false) {
  throw new Error("batch 03 may only be generated from the frozen zero-decision Gold queue");
}

await verifiedFile(EXPECTED.manifest_uri, EXPECTED.manifest_sha256);
await verifiedFile(EXPECTED.workset_uri, EXPECTED.workset_sha256);
await verifiedFile(EXPECTED.earlier_batch_01_uri, EXPECTED.earlier_batch_01_sha256);
await verifiedFile(EXPECTED.erase_batch_02_uri, EXPECTED.erase_batch_02_sha256);
await verifiedFile(EXPECTED.annotation_policy_uri, EXPECTED.annotation_policy_sha256);
await verifiedFile(EXPECTED.persistence_policy_uri, EXPECTED.persistence_policy_sha256);

const selected = queue.groups.filter((group) => PACKAGE_ORDER.includes(group.package_id as typeof PACKAGE_ORDER[number])).sort(compareGroup);
if (selected.length !== 36 || selected.filter((group) => group.package_id === PACKAGE_ORDER[0]).length !== 19
  || selected.filter((group) => group.package_id === PACKAGE_ORDER[1]).length !== 17) {
  throw new Error("batch 03 must cover exactly KG003 19 groups plus LY003 17 groups");
}
if (new Set(selected.map(groupKey)).size !== selected.length) throw new Error("duplicate review group in batch 03");
const batchGroupKeys = new Set(selected.map(groupKey));
const queueGroupKeys = new Set(queue.groups.map(groupKey));
if (EARLIER_BATCH_GROUPS.size !== 16 || [...EARLIER_BATCH_GROUPS].some((key) => !queueGroupKeys.has(key) || batchGroupKeys.has(key))
  || [...queueGroupKeys].some((key) => !EARLIER_BATCH_GROUPS.has(key) && !batchGroupKeys.has(key))) {
  throw new Error("batches 01/02/03 do not form an exact disjoint cover of the 52-group queue");
}

const items: BatchItem[] = [];
for (const [reviewIndex, group] of selected.entries()) {
  if (group.current_decision || group.package_signed || group.package_locked) throw new Error(`batch item is no longer undecided: ${groupKey(group)}`);
  if (group.candidates.length !== 1) throw new Error(`remaining batch expects one candidate per group: ${groupKey(group)}`);
  const evidence = [];
  for (const [index, item] of group.evidence.entries()) {
    const bytes = await verifiedFile(item.path, item.sha256);
    evidence.push({
      evidence_index: index,
      evidence_id: item.evidence_id,
      side: item.side,
      kind: item.kind,
      label: item.label,
      asset_uri: item.path,
      sha256: item.sha256,
      byte_length: bytes.byteLength,
    });
  }
  const comparisons = evidence.filter((item) => item.kind.toLowerCase().includes("comparison"))
    .sort((left, right) => `${left.asset_uri}:${left.sha256}`.localeCompare(`${right.asset_uri}:${right.sha256}`, "en"));
  if (!comparisons.length) throw new Error(`missing canonical comparison: ${groupKey(group)}`);
  const candidate = group.candidates[0];
  const key = groupKey(group);
  items.push({
    review_index: reviewIndex + 1,
    tier: tierFor(group),
    package_id: group.package_id,
    source_video_id: group.source_video_id,
    group_id: group.group_id,
    alignment_class: group.alignment_class,
    group_time: group.time,
    source_events: group.source_events,
    proposed_candidate: {
      candidate_id: candidate.candidate_id,
      event_id: candidate.event_id,
      source_event_refs: candidate.source_event_refs,
      operation: candidate.operation,
      time: candidate.time,
      semantic_label: candidate.semantic_label,
      region: candidate.region,
      relation: candidate.relation,
      modification: candidate.modification,
      machine_acceptance_ready: candidate.acceptance_ready,
      machine_acceptance_blockers: candidate.acceptance_blockers,
      status: "unverified_machine_proposal_not_gold",
    },
    compiler_canonical_comparison: comparisons[0],
    comparison_evidence: comparisons,
    evidence,
    evidence_set_sha256: domainHash("skyclass/gold-adjudication-evidence-set/v1", evidence),
    unresolved_fields_from_queue: group.unresolved_fields,
    speech_context: { text: group.speech_context, status: "context_not_gold" },
    required_human_questions: [...baseQuestions(group), ...(SPECIALIST[key] ?? [])],
    required_review_path: tierFor(group) === "specialist_adjudication"
      ? "inspect_all_frozen_evidence_and_resolve_disagreement_before_decision"
      : tierFor(group) === "quick_confirmation"
        ? "inspect_canonical_comparisons_then_check_event_boundaries_in_full_evidence"
        : "inspect_canonical_comparisons_and_expand_full_evidence_for_each_unresolved_field",
    human_decision_created: false,
    accepted_event_created: false,
    reviewer_identity_created: false,
    package_signoff_created: false,
  });
}

const tierCounts = Object.fromEntries((["quick_confirmation", "bounded_review", "specialist_adjudication"] as const)
  .map((tier) => [tier, items.filter((item) => item.tier === tier).length]));
if (tierCounts.quick_confirmation !== 16 || tierCounts.bounded_review !== 9 || tierCounts.specialist_adjudication !== 11) {
  throw new Error("unexpected adjudication tier denominator");
}

const payload = {
  schema_version: "gold-adjudication-pre-review-batch-v1",
  batch_id: "gold-adjudication-batch-03-remaining-36-v1",
  status: "machine_pre_review_only_human_decisions_pending",
  source_snapshot: {
    ...EXPECTED,
    queue_schema_version: queue.schema_version,
    queue_byte_length: queueBytes.byteLength,
  },
  coverage: {
    total_queue_groups: 52,
    earlier_batch_01_groups: 12,
    erase_batch_02_groups: 4,
    earlier_batch_group_keys: [...EARLIER_BATCH_GROUPS].sort((left, right) => left.localeCompare(right, "en", { numeric: true })),
    this_batch_groups: 36,
    union_group_count: 52,
    this_batch_packages: [...PACKAGE_ORDER],
    this_batch_package_group_counts: [19, 17],
    tier_counts: tierCounts,
    maximum_candidate_events_if_every_item_survives_human_review: 36,
  },
  evidence_policy: {
    claim: "Each item is an executable human-review card, not a Gold result.",
    canonical_comparison_is_visual_entry_point_only: true,
    full_frozen_evidence_required_for_final_boundary: true,
    speech_status: "context_not_gold",
    acceptance_ready_status: "machine_structural_field_only_not_human_acceptance",
    allowed_human_dispositions: ["accept", "reject", "not_an_event", "unknown"],
    no_acceptance_quota: true,
  },
  items,
  output_invariants: {
    decision_count: 0,
    accepted_event_count: 0,
    reviewer_identity_count: 0,
    package_signoff_count: 0,
    signed_gold_dataset_created: false,
  },
};

const artifact = {
  ...payload,
  batch_payload_sha256: domainHash("skyclass/gold-adjudication-pre-review-batch/v1", payload),
};
const jsonBytes = `${JSON.stringify(artifact, null, 2)}\n`;
const jsonSha256 = sha256(jsonBytes);

function compact(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

const markdownRows = items.map((item) => {
  const comparisons = item.comparison_evidence.map((comparison) => `[${comparison.side} comparison](../../${comparison.asset_uri}) \`${comparison.sha256.slice(0, 12)}\``).join("<br>");
  const proposal = `${item.proposed_candidate.operation} · ${item.proposed_candidate.semantic_label}`;
  const question = item.required_human_questions.at(-1) ?? item.required_human_questions[0];
  return `| ${item.review_index} | ${item.tier} | \`${item.package_id} / ${item.group_id}\` | ${compact(proposal)} | ${comparisons} | ${compact(question)} |  |  |  |`;
});

const markdown = `# Gold Adjudication Batch 03 — Remaining 36 Groups V1

## 1. Purpose and frozen boundary

This artifact closes the **human-review handoff coverage** for the 36 groups not listed in Batch 01 or the ERASE batch. It was generated from the real GoldReviewStore queue and verified evidence bytes.

- parent repository commit: \`${EXPECTED.parent_repository_commit}\`;
- active manifest SHA-256: \`${EXPECTED.manifest_sha256}\`;
- active Gold queue SHA-256: \`${EXPECTED.queue_sha256}\` (${queueBytes.byteLength} bytes);
- active Workset V2 SHA-256: \`${EXPECTED.workset_sha256}\`;
- machine-readable batch: [${jsonUri.split("/").at(-1)}](${jsonUri.split("/").at(-1)}), SHA-256 \`${jsonSha256}\`;
- batch payload commitment: \`${artifact.batch_payload_sha256}\`;
- coverage: 19 KG003 groups + 17 LY003 groups = 36; together with Batch 01 (12) and Batch 02 (4), the union is exactly 52 groups;
- current human state remains **0 decided / 0 accepted / 0 signed**.

This document is not a decision ledger. It creates no reviewer identity, decision, accepted event, signoff, or SignedGold record. A proposed candidate is an A/B-derived hypothesis, not a recommendation to accept.

## 2. Claim–evidence review policy

1. Start from the linked canonical comparison, then inspect the full frozen evidence sequence before choosing a final boundary.
2. Confirm only persistent visual board-state changes. Tool selection, cursor motion, viewport changes, teacher occlusion, and same-content rewrites are not semantic events.
3. Speech is \`context_not_gold\`: it may direct attention to a glyph but cannot supply board content that is not visible.
4. \`quick_confirmation\` means low disagreement in the machine inputs, not automatic acceptance.
5. \`specialist_adjudication\` requires every evidence frame and the stated disagreement to be resolved before a decision.
6. There is no acceptance quota. Use \`unknown\` or \`reject\` whenever the evidence is insufficient.

Tier denominator: ${tierCounts.quick_confirmation} quick confirmation, ${tierCounts.bounded_review} bounded review, ${tierCounts.specialist_adjudication} specialist adjudication.

## 3. Independent reviewer worksheet

Each reviewer fills the two outcome columns independently before discussion. The final column is filled only after disagreement is described. Blank cells are intentional and are not decisions.

| # | Tier | Package / group | Frozen machine proposal (not Gold) | Canonical comparison | Required human question | Visual reviewer | Physics reviewer | Final discussion outcome |
|---:|---|---|---|---|---|---|---|---|
${markdownRows.join("\n")}

## 4. Stop conditions

Stop the affected item without accepting it when any of the following occurs:

- an evidence byte, path, or SHA-256 differs from the machine-readable batch;
- the queue or Workset V2 hash differs from the frozen source snapshot;
- a visible formula or label can only be completed from subtitles or speech;
- one-sided or compound source events cannot be mapped to a stable semantic Gold unit;
- an event boundary includes tool selection, occlusion, or a later persistence-confirmation horizon;
- the two reviewers disagree about event existence, operation, or visible semantic content.

After all 52 groups have real append-only decisions, every component still requires two distinct package signers and at least 30 accepted final events before the whole-queue SignedGold v2 compiler may run.
`;

async function emit(uri: string, bytes: string): Promise<void> {
  const path = resolve(root, uri);
  if (checkOnly) {
    const current = await readFile(path, "utf8");
    if (current !== bytes) throw new Error(`generated artifact drifted: ${uri}`);
    return;
  }
  await writeFile(path, bytes, { encoding: "utf8", mode: 0o644 });
}

await emit(jsonUri, jsonBytes);
await emit(markdownUri, markdown);
console.log(`${checkOnly ? "verified" : "wrote"} ${items.length} undecided review cards; payload ${artifact.batch_payload_sha256}; JSON ${jsonSha256}`);
