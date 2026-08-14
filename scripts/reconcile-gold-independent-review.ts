import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { GoldReviewStore } from "../packages/store/src/goldReviewStore.js";
import { containsFabricatedLearnerOutcome } from "../packages/contracts/src/signed-gold.js";
import {
  compileGoldDoubleReviewQualityReportV1,
  equalGoldReviewScientificDecisionV1,
  GOLD_DOUBLE_REVIEW_QUALITY_PROTOCOL_JSON_SHA256_V1,
  validateGoldDoubleReviewQualityProtocolV1,
  validateGoldDoubleReviewQualityReportV1AgainstInputs,
  type GoldDoubleReviewPair,
  type GoldDoubleReviewQualityProtocolV1,
  type GoldReviewScientificDecision,
} from "../packages/contracts/src/gold-independent-review-quality.js";

const root = process.cwd();
const manifestPath = resolve(root, "research/board2skill/GOLD_INDEPENDENT_REVIEW_MANIFEST_V1.json");
const reviewPackagePath = resolve(root, "research/board2skill/GOLD_INDEPENDENT_REVIEW_PACKAGE_V1.json");
const visualTemplatePath = resolve(root, "research/board2skill/GOLD_INDEPENDENT_REVIEW_VISUAL_TEMPLATE_V1.json");
const physicsTemplatePath = resolve(root, "research/board2skill/GOLD_INDEPENDENT_REVIEW_PHYSICS_TEMPLATE_V1.json");
const qualityProtocolPath = resolve(root, "research/board2skill/GOLD_DOUBLE_REVIEW_QUALITY_PROTOCOL_V1.json");
const dataDir = resolve(root, "data");
const EXPECTED_MANIFEST_PAYLOAD_SHA256 = "87a8a583a884b8a6702f5db0a8fafdf747cce79404d06232ca5a94ddd815014e";
const EXPECTED_MANIFEST_JSON_SHA256 = "1150a7a4f5283ab2e3c1688ecde1ceb5396ee4c62ccc758332880b12723af9b0";
const [visualPathArg, physicsPathArg, outputPathArg] = process.argv.slice(2);
if (!visualPathArg || !physicsPathArg) {
  throw new Error("usage: reconcile-gold-independent-review <visual-assessment.json> <physics-assessment.json> [output.json]");
}

const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
const domainHash = (domain: string, value: unknown): string => sha256(`${domain}\0${JSON.stringify(value)}`);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const exactKeys = (value: Record<string, unknown>, keys: string[], label: string): void => {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} fields are not exact`);
};

function inside(base: string, target: string): boolean {
  const path = relative(resolve(base), resolve(target));
  return path === "" || (!path.startsWith("..") && !path.startsWith("/") && !path.startsWith("\\"));
}

async function verifiedFile(uri: string, expectedSha256: string, expectedLength?: number): Promise<void> {
  const path = resolve(root, uri);
  if (!inside(root, path)) throw new Error(`evidence path escapes repository: ${uri}`);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error(`evidence is not a controlled regular file: ${uri}`);
  const real = await realpath(path);
  if (!inside(root, real)) throw new Error(`evidence real path escapes repository: ${uri}`);
  const bytes = await readFile(real);
  if (sha256(bytes) !== expectedSha256 || (expectedLength !== undefined && bytes.byteLength !== expectedLength)) throw new Error(`evidence bytes drifted: ${uri}`);
}

function parseJsonObject(bytes: Uint8Array, label: string): Record<string, unknown> {
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error(`${label} must not contain a UTF-8 BOM`);
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error(`${label} is not valid UTF-8`); }
  assertNoDuplicateJsonKeys(source, label);
  const value = JSON.parse(source) as unknown;
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`);
  return value;
}

function assertNoDuplicateJsonKeys(source: string, label: string): void {
  let index = 0;
  const whitespace = (): void => { while (/\s/u.test(source[index] ?? "")) index += 1; };
  const stringValue = (): string => {
    const start = index;
    index += 1;
    while (index < source.length) {
      const code = source.charCodeAt(index);
      if (code === 0x22) { index += 1; return JSON.parse(source.slice(start, index)) as string; }
      if (code < 0x20) throw new Error(`${label} contains an invalid JSON string`);
      if (code === 0x5c) {
        index += 1;
        if (source[index] === "u") index += 4;
      }
      index += 1;
    }
    throw new Error(`${label} contains an unterminated JSON string`);
  };
  const value = (): void => {
    whitespace();
    const token = source[index];
    if (token === "{") object();
    else if (token === "[") array();
    else if (token === '"') { stringValue(); }
    else {
      const match = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(source.slice(index));
      if (!match) throw new Error(`${label} is not strict JSON`);
      index += match[0].length;
    }
  };
  const object = (): void => {
    index += 1; whitespace();
    const keys = new Set<string>();
    if (source[index] === "}") { index += 1; return; }
    while (true) {
      if (source[index] !== '"') throw new Error(`${label} contains an invalid JSON key`);
      const key = stringValue();
      if (keys.has(key)) throw new Error(`${label} contains duplicate key: ${key}`);
      keys.add(key); whitespace();
      if (source[index] !== ":") throw new Error(`${label} contains an invalid JSON object`);
      index += 1; value(); whitespace();
      if (source[index] === "}") { index += 1; return; }
      if (source[index] !== ",") throw new Error(`${label} contains an invalid JSON object`);
      index += 1; whitespace();
    }
  };
  const array = (): void => {
    index += 1; whitespace();
    if (source[index] === "]") { index += 1; return; }
    while (true) {
      value(); whitespace();
      if (source[index] === "]") { index += 1; return; }
      if (source[index] !== ",") throw new Error(`${label} contains an invalid JSON array`);
      index += 1; whitespace();
    }
  };
  whitespace(); value(); whitespace();
  if (index !== source.length) throw new Error(`${label} contains trailing JSON content`);
}

function expectedOrder(cards: Record<string, unknown>[], slot: string): string[] {
  return [...cards].sort((left, right) => {
    const a = sha256(`skyclass/gold-independent-review-presentation/v1\0${slot}\0${left.card_sha256}`);
    const b = sha256(`skyclass/gold-independent-review-presentation/v1\0${slot}\0${right.card_sha256}`);
    return a.localeCompare(b);
  }).map((card) => String(card.card_sha256));
}

const manifestBytes = await readFile(manifestPath);
const manifest = parseJsonObject(manifestBytes, "manifest");
const { manifest_payload_sha256: manifestCommitment, ...manifestPayload } = manifest;
if (manifestCommitment !== domainHash("skyclass/gold-independent-review-manifest/v1", manifestPayload)) throw new Error("manifest commitment mismatch");
if (manifestCommitment !== EXPECTED_MANIFEST_PAYLOAD_SHA256 || sha256(manifestBytes) !== EXPECTED_MANIFEST_JSON_SHA256) throw new Error("manifest is not the frozen 52-card source");
const cards = Array.isArray(manifest.cards) && manifest.cards.every(isRecord) ? manifest.cards : [];
if (cards.length !== 52) throw new Error("manifest must contain 52 cards");
for (const card of cards) {
  const { card_sha256: commitment, ...payload } = card;
  if (commitment !== domainHash("skyclass/gold-independent-review-card/v1", payload)) throw new Error(`card commitment mismatch: ${card.package_id}/${card.group_id}`);
}
const manifestJsonSha256 = sha256(manifestBytes);
const cardByHash = new Map(cards.map((card) => [String(card.card_sha256), card]));
const reviewPackageBytes = await readFile(reviewPackagePath);
const reviewPackage = parseJsonObject(reviewPackageBytes, "review package");
exactKeys(reviewPackage, ["schema_version", "manifest_payload_sha256", "manifest_json_sha256", "visual_template_sha256", "physics_template_sha256", "review_package_sha256"], "review package");
const { review_package_sha256: reviewPackageCommitment, ...reviewPackagePayload } = reviewPackage;
if (reviewPackage.schema_version !== "gold-independent-review-package-v1"
  || reviewPackage.manifest_payload_sha256 !== manifestCommitment || reviewPackage.manifest_json_sha256 !== manifestJsonSha256
  || reviewPackageCommitment !== domainHash("skyclass/gold-independent-review-package/v1", reviewPackagePayload)) throw new Error("review package invalid");
const frozenTemplates = {
  visual_reviewer: parseJsonObject(await readFile(visualTemplatePath), "visual template"),
  physics_reviewer: parseJsonObject(await readFile(physicsTemplatePath), "physics template"),
};
if (sha256(await readFile(visualTemplatePath)) !== reviewPackage.visual_template_sha256
  || sha256(await readFile(physicsTemplatePath)) !== reviewPackage.physics_template_sha256) throw new Error("review template bytes drifted");

const sourceSnapshot = isRecord(manifest.source_snapshot) ? manifest.source_snapshot : {};
const queue = await new GoldReviewStore(root, dataDir).queue();
const queueBytes = Buffer.from(JSON.stringify(queue), "utf8");
if (sha256(queueBytes) !== sourceSnapshot.queue_sha256 || queue.groups.length !== 52 || queue.summary.decided_count !== 0
  || queue.summary.accepted_event_count !== 0 || queue.summary.signed_package_count !== 0 || queue.summary.paper_gold_ready) {
  throw new Error("current Gold queue no longer matches the frozen zero-decision review source");
}
for (const key of ["active_manifest", "workset", "annotation_policy", "persistence_policy", "batch_03"] as const) {
  const uri = sourceSnapshot[`${key}_uri`];
  const hash = sourceSnapshot[`${key}_sha256`];
  if (typeof uri !== "string" || typeof hash !== "string") throw new Error(`manifest source pin missing: ${key}`);
  await verifiedFile(uri, hash);
}
for (const card of cards) {
  const evidence = Array.isArray(card.evidence) && card.evidence.every(isRecord) ? card.evidence : [];
  if (!evidence.length) throw new Error(`card evidence missing: ${card.package_id}/${card.group_id}`);
  for (const item of evidence) {
    if (typeof item.asset_uri !== "string" || typeof item.sha256 !== "string" || !Number.isSafeInteger(item.byte_length)) throw new Error("card evidence metadata invalid");
    await verifiedFile(item.asset_uri, item.sha256, Number(item.byte_length));
  }
}

type AssessmentDecision = {
  disposition: string;
  selected_candidate_ids: string[];
  final_events: Record<string, unknown>[];
  rationale: string;
  reviewed_at: string;
};
type ValidatedAssessment = {
  bytes_sha256: string;
  reviewer_slot: string;
  reviewer_id: string;
  reviewer_role: string;
  decisions: Map<string, AssessmentDecision>;
};

function validateFinalEvent(event: Record<string, unknown>, candidate: Record<string, unknown>, card: Record<string, unknown>, label: string): void {
  exactKeys(event, ["event_id", "source_event_refs", "operation", "time", "semantic_label", "region", "relation", "modification"], label);
  if (event.event_id !== candidate.event_id) throw new Error(`${label} event_id does not match selected candidate`);
  if (!Array.isArray(event.source_event_refs) || !event.source_event_refs.length || new Set(event.source_event_refs).size !== event.source_event_refs.length) throw new Error(`${label} source_event_refs invalid`);
  if (!Array.isArray(candidate.source_event_refs)
    || JSON.stringify([...event.source_event_refs].sort()) !== JSON.stringify([...candidate.source_event_refs].sort())) throw new Error(`${label} source_event_refs drifted`);
  const sourceEvents = Array.isArray(card.source_events) && card.source_events.every(isRecord) ? card.source_events : [];
  if (!sourceEvents.length || event.source_event_refs.some((id) => !sourceEvents.some((source) => source.event_id === id))) throw new Error(`${label} source_event_refs leave the card`);
  const allowed = ["ADD", "ERASE", "MODIFY", "CONNECT", "atomic_ERASE+ADD"];
  if (!allowed.includes(String(event.operation))) throw new Error(`${label} operation must be resolved`);
  if (candidate.operation !== "unknown" && event.operation !== candidate.operation) throw new Error(`${label} operation changes a frozen non-unknown candidate`);
  if (!isRecord(event.time) || !Number.isFinite(event.time.start) || !Number.isFinite(event.time.end) || Number(event.time.end) <= Number(event.time.start)) throw new Error(`${label} time invalid`);
  const groupTime = isRecord(card.group_time) ? card.group_time : null;
  if (!groupTime || Number(event.time.start) < Number(groupTime.start) - 2 || Number(event.time.end) > Number(groupTime.end) + 2) throw new Error(`${label} time leaves evidence window`);
  if (!text(event.semantic_label)) throw new Error(`${label} semantic_label empty`);
  if (containsFabricatedLearnerOutcome(String(event.semantic_label))) throw new Error(`${label} semantic_label asserts an unobserved learner outcome`);
  if (JSON.stringify(event.region) !== JSON.stringify(candidate.region)) throw new Error(`${label} region drifted`);
  if (JSON.stringify(event.relation) !== JSON.stringify(candidate.relation)) throw new Error(`${label} relation drifted`);
  if (JSON.stringify(event.modification) !== JSON.stringify(candidate.modification)) throw new Error(`${label} modification drifted`);
  if (event.operation === "CONNECT" && !isRecord(event.relation)) throw new Error(`${label} CONNECT lacks relation`);
  if (event.operation !== "CONNECT" && event.relation !== null) throw new Error(`${label} non-CONNECT carries relation`);
  if (event.operation === "MODIFY" && !isRecord(event.modification)) throw new Error(`${label} MODIFY lacks modification`);
  if (event.operation !== "MODIFY" && event.modification !== null) throw new Error(`${label} non-MODIFY carries modification`);
}

async function validateAssessment(pathArg: string, expectedSlot: string): Promise<ValidatedAssessment> {
  const bytes = await readFile(resolve(root, pathArg));
  const assessment = parseJsonObject(bytes, `${expectedSlot} assessment`);
  exactKeys(assessment, ["schema_version", "manifest_payload_sha256", "manifest_json_sha256", "reviewer_slot", "status", "reviewer_id", "reviewer_role", "instructions", "items"], expectedSlot);
  if (assessment.schema_version !== "gold-independent-assessment-v1" || assessment.reviewer_slot !== expectedSlot
    || assessment.status !== "completed_independent_assessment" || assessment.manifest_payload_sha256 !== manifestCommitment
    || assessment.manifest_json_sha256 !== manifestJsonSha256) throw new Error(`${expectedSlot} assessment header invalid`);
  const frozenTemplate = frozenTemplates[expectedSlot as keyof typeof frozenTemplates];
  if (!frozenTemplate || JSON.stringify(assessment.instructions) !== JSON.stringify(frozenTemplate.instructions)) throw new Error(`${expectedSlot} instructions drifted from the frozen template`);
  const reviewerId = text(assessment.reviewer_id);
  const reviewerRole = text(assessment.reviewer_role);
  if (reviewerId.length < 2 || reviewerRole.length < 2) throw new Error(`${expectedSlot} reviewer identity and role required`);
  if (!Array.isArray(assessment.items) || assessment.items.length !== 52 || !assessment.items.every(isRecord)) throw new Error(`${expectedSlot} must contain 52 items`);
  const order = expectedOrder(cards, expectedSlot);
  const decisions = new Map<string, AssessmentDecision>();
  for (const [index, item] of assessment.items.entries()) {
    exactKeys(item, ["presentation_index", "card_sha256", "package_id", "group_id", "decision"], `${expectedSlot}.items[${index}]`);
    const cardHash = String(item.card_sha256);
    const card = cardByHash.get(cardHash);
    if (!card || item.presentation_index !== index + 1 || cardHash !== order[index]
      || item.package_id !== card.package_id || item.group_id !== card.group_id || decisions.has(cardHash)) throw new Error(`${expectedSlot}.items[${index}] card/order mismatch`);
    if (!isRecord(item.decision)) throw new Error(`${expectedSlot}.items[${index}] decision is incomplete`);
    exactKeys(item.decision, ["disposition", "selected_candidate_ids", "final_events", "rationale", "reviewed_at"], `${expectedSlot}.items[${index}].decision`);
    const disposition = String(item.decision.disposition);
    if (!["accept", "reject", "not_an_event", "unknown"].includes(disposition)) throw new Error(`${expectedSlot}.items[${index}] disposition invalid`);
    if (!Array.isArray(item.decision.selected_candidate_ids) || !item.decision.selected_candidate_ids.every((id) => text(id) === id)
      || new Set(item.decision.selected_candidate_ids).size !== item.decision.selected_candidate_ids.length) throw new Error(`${expectedSlot}.items[${index}] selected candidates invalid`);
    if (!Array.isArray(item.decision.final_events) || !item.decision.final_events.every(isRecord)) throw new Error(`${expectedSlot}.items[${index}] final_events invalid`);
    if (text(item.decision.rationale).length < 8 || typeof item.decision.reviewed_at !== "string" || !Number.isFinite(Date.parse(item.decision.reviewed_at))) throw new Error(`${expectedSlot}.items[${index}] rationale/time invalid`);
    const selected = item.decision.selected_candidate_ids as string[];
    const finalEvents = item.decision.final_events as Record<string, unknown>[];
    const candidates = Array.isArray(card.candidates) && card.candidates.every(isRecord) ? card.candidates : [];
    if (disposition !== "accept") {
      if (selected.length || finalEvents.length) throw new Error(`${expectedSlot}.items[${index}] non-accept must not carry events`);
    } else {
      if (!selected.length || selected.length !== finalEvents.length) throw new Error(`${expectedSlot}.items[${index}] accept must close selected candidates one-to-one`);
      const finalByEventId = new Map(finalEvents.map((event) => [String(event.event_id), event]));
      if (finalByEventId.size !== finalEvents.length) throw new Error(`${expectedSlot}.items[${index}] final event IDs duplicate`);
      for (const [eventIndex, candidateId] of selected.entries()) {
        const candidate = candidates.find((value) => value.candidate_id === candidateId);
        if (!candidate) throw new Error(`${expectedSlot}.items[${index}] selected candidate not in card`);
        const finalEvent = finalByEventId.get(String(candidate.event_id));
        if (!finalEvent) throw new Error(`${expectedSlot}.items[${index}] selected candidate lacks matching final event`);
        validateFinalEvent(finalEvent, candidate, card, `${expectedSlot}.items[${index}].final_events[${eventIndex}]`);
      }
      const canonicalEventOrder = [...finalEvents].sort((left, right) => {
        const leftTime = isRecord(left.time) ? Number(left.time.start) : Number.NaN;
        const rightTime = isRecord(right.time) ? Number(right.time.start) : Number.NaN;
        return leftTime - rightTime || String(left.event_id).localeCompare(String(right.event_id), "en");
      });
      if (JSON.stringify(finalEvents) !== JSON.stringify(canonicalEventOrder)) throw new Error(`${expectedSlot}.items[${index}] final_events must use canonical time/event order`);
      const expectedSelectedOrder = finalEvents.map((event) => candidates.find((candidate) => candidate.event_id === event.event_id)?.candidate_id);
      if (JSON.stringify(selected) !== JSON.stringify(expectedSelectedOrder)) throw new Error(`${expectedSlot}.items[${index}] selected candidates must follow final event order`);
    }
    decisions.set(cardHash, {
      disposition,
      selected_candidate_ids: selected,
      final_events: finalEvents,
      rationale: text(item.decision.rationale),
      reviewed_at: item.decision.reviewed_at,
    });
  }
  return { bytes_sha256: sha256(bytes), reviewer_slot: expectedSlot, reviewer_id: reviewerId, reviewer_role: reviewerRole, decisions };
}

const visual = await validateAssessment(visualPathArg, "visual_reviewer");
const physics = await validateAssessment(physicsPathArg, "physics_reviewer");
if (visual.reviewer_id === physics.reviewer_id) throw new Error("visual and physics assessments require distinct reviewer identities");

const qualityProtocolBytes = await readFile(qualityProtocolPath);
if (sha256(qualityProtocolBytes) !== GOLD_DOUBLE_REVIEW_QUALITY_PROTOCOL_JSON_SHA256_V1) throw new Error("quality protocol JSON bytes drifted after preregistration");
const qualityProtocolValue = parseJsonObject(qualityProtocolBytes, "quality protocol");
if (!validateGoldDoubleReviewQualityProtocolV1(qualityProtocolValue)) throw new Error("quality protocol is not the frozen preregistration");
const qualityProtocol = qualityProtocolValue as unknown as GoldDoubleReviewQualityProtocolV1;

const agreements = [];
const conflicts = [];
const qualityPairs: GoldDoubleReviewPair[] = [];
for (const card of cards) {
  const cardHash = String(card.card_sha256);
  const left = visual.decisions.get(cardHash)!;
  const right = physics.decisions.get(cardHash)!;
  const leftScientific = { disposition: left.disposition, selected_candidate_ids: left.selected_candidate_ids, final_events: left.final_events };
  const rightScientific = { disposition: right.disposition, selected_candidate_ids: right.selected_candidate_ids, final_events: right.final_events };
  const common = { card_sha256: cardHash, package_id: card.package_id, group_id: card.group_id };
  qualityPairs.push({
    card_sha256: cardHash,
    package_id: String(card.package_id),
    group_id: String(card.group_id),
    visual: leftScientific as GoldReviewScientificDecision,
    physics: rightScientific as GoldReviewScientificDecision,
  });
  if (equalGoldReviewScientificDecisionV1(leftScientific as GoldReviewScientificDecision, rightScientific as GoldReviewScientificDecision)) {
    agreements.push({ ...common, agreed_decision: leftScientific, visual_rationale: left.rationale, physics_rationale: right.rationale });
  } else {
    conflicts.push({ ...common, visual_decision: leftScientific, physics_decision: rightScientific, joint_resolution: null });
  }
}

const qualityCompilerInput = {
  protocol: qualityProtocol,
  quality_protocol_json_sha256: sha256(qualityProtocolBytes),
  manifest_payload_sha256: String(manifestCommitment),
  manifest_json_sha256: manifestJsonSha256,
  review_package_sha256: String(reviewPackageCommitment),
  visual_assessment_sha256: visual.bytes_sha256,
  physics_assessment_sha256: physics.bytes_sha256,
  pairs: qualityPairs,
};
const qualityReport = compileGoldDoubleReviewQualityReportV1(qualityCompilerInput);
if (!validateGoldDoubleReviewQualityReportV1AgainstInputs(qualityReport, qualityCompilerInput)) throw new Error("quality report postcondition failed");
const qualityDecision = String(qualityReport.decision);
const reconciliationStatus = qualityDecision === "BLOCKED_PRIMARY_KAPPA_NOT_ESTIMABLE"
  ? "reliability_gate_blocked_no_gold_written"
  : qualityDecision === "RELABEL_PILOT_REQUIRED"
    ? "relabel_pilot_required_no_gold_written"
    : conflicts.length
      ? "joint_human_resolution_required_no_gold_written"
      : "ready_for_joint_human_confirmation_no_gold_written";

const payload = {
  schema_version: "gold-independent-reconciliation-v1",
  status: reconciliationStatus,
  manifest_payload_sha256: manifestCommitment,
  manifest_json_sha256: manifestJsonSha256,
  visual_assessment: { bytes_sha256: visual.bytes_sha256, reviewer_id: visual.reviewer_id, reviewer_role: visual.reviewer_role },
  physics_assessment: { bytes_sha256: physics.bytes_sha256, reviewer_id: physics.reviewer_id, reviewer_role: physics.reviewer_role },
  counts: { group_count: 52, agreement_count: agreements.length, conflict_count: conflicts.length },
  pre_adjudication_quality_report: qualityReport,
  agreements,
  conflicts,
  output_invariants: {
    human_store_decision_count_created: 0,
    accepted_event_count_created: 0,
    package_signoff_count_created: 0,
    signed_gold_dataset_created: false,
    explicit_joint_human_confirmation_still_required: true,
  },
};
const result = { ...payload, reconciliation_payload_sha256: domainHash("skyclass/gold-independent-reconciliation/v1", payload) };
const output = `${JSON.stringify(result, null, 2)}\n`;
if (outputPathArg) await writeFile(resolve(root, outputPathArg), output, { encoding: "utf8", flag: "wx", mode: 0o600 });
else process.stdout.write(output);
