import { sha256Hex } from "./sha256.js";

export const GOLD_DOUBLE_REVIEW_QUALITY_PROTOCOL_DOMAIN_V1 = "skyclass/gold-double-review-quality-protocol/v1";
export const GOLD_DOUBLE_REVIEW_QUALITY_REPORT_DOMAIN_V1 = "skyclass/gold-double-review-quality-report/v1";
export const GOLD_DOUBLE_REVIEW_SCIENTIFIC_PAIR_PROJECTION_DOMAIN_V1 = "skyclass/gold-double-review-scientific-pair-projection/v1";
export const GOLD_DOUBLE_REVIEW_QUALITY_PROTOCOL_JSON_SHA256_V1 = "a50db9341390cdd82936fdfadcce419a0fce9d91c96b27c80f2ad59a4c0a291e";

export type IndependentGoldReviewDisposition = "accept" | "reject" | "not_an_event" | "unknown";
export type GoldDoubleReviewQualityDecision =
  | "BLOCKED_PRIMARY_KAPPA_NOT_ESTIMABLE"
  | "RELABEL_PILOT_REQUIRED"
  | "CONTINUE_FULL_CONFLICT_ADJUDICATION"
  | "TARGET_RELIABILITY_MET";

export interface GoldReviewScientificDecision {
  disposition: IndependentGoldReviewDisposition;
  selected_candidate_ids: string[];
  final_events: Array<{
    event_id: string;
    operation: string;
    time: { start: number; end: number };
    semantic_label: string;
    [key: string]: unknown;
  }>;
}

export interface GoldDoubleReviewPair {
  card_sha256: string;
  package_id: string;
  group_id: string;
  visual: GoldReviewScientificDecision;
  physics: GoldReviewScientificDecision;
}

export interface GoldDoubleReviewQualityCompilerInputV1 {
  protocol: GoldDoubleReviewQualityProtocolV1;
  quality_protocol_json_sha256: string;
  manifest_payload_sha256: string;
  manifest_json_sha256: string;
  review_package_sha256: string;
  visual_assessment_sha256: string;
  physics_assessment_sha256: string;
  pairs: GoldDoubleReviewPair[];
}

export interface GoldDoubleReviewQualityProtocolV1 {
  schema_version: "gold-double-review-quality-protocol-v1";
  status: "preregistered_before_human_assessments";
  parent_repository_commit: string;
  review_package_sha256: string;
  denominator: {
    group_count: 52;
    reviewer_count: 2;
    disposition_labels: IndependentGoldReviewDisposition[];
    operation_non_accept_label: "NO_EVENT_ACCEPTED";
  };
  primary_metrics: Array<Record<string, unknown>>;
  diagnostic_metrics: string[];
  branch_precedence: string[];
  branch_rules: Record<string, string>;
  missing_and_uncertain_policy: Record<string, boolean>;
  scientific_boundary: Record<string, boolean>;
  quality_protocol_sha256: string;
}

type KappaResult = {
  status: "estimable" | "not_estimable";
  value: number | null;
  item_count: number;
  labels: string[];
  observed_agreement: number;
  expected_agreement: number;
  confusion_matrix: number[][];
};

function safeSnapshot(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error("non-canonical number");
    return value;
  }
  if (!value || typeof value !== "object" || Object.getOwnPropertySymbols(value).length) throw new Error("non-plain data");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error("non-plain array");
    const keys = Object.keys(descriptors).filter((key) => key !== "length");
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) throw new Error("sparse array");
    return keys.map((key) => {
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable) throw new Error("array accessor");
      return safeSnapshot(descriptor.value);
    });
  }
  if (Object.getPrototypeOf(value) !== Object.prototype || Object.hasOwn(value, "toJSON")) throw new Error("non-plain object");
  const output: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor) || !descriptor.enumerable) throw new Error("object accessor");
    output[key] = safeSnapshot(descriptor.value);
  }
  return output;
}
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}
const domainHash = (domain: string, value: unknown): string => sha256Hex(`${domain}\0${canonical(safeSnapshot(value))}`);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]): boolean =>
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const dispositionLabels: IndependentGoldReviewDisposition[] = ["accept", "reject", "not_an_event", "unknown"];
const diagnosticMetrics = [
  "exact_scientific_decision_agreement", "binary_acceptance_kappa", "per_disposition_counts_by_reviewer",
  "per_package_exact_agreement", "both_accept_count", "same_candidate_set_given_both_accept",
  "same_operation_sequence_given_both_accept", "same_semantic_sequence_given_both_accept",
  "paired_event_boundary_start_absolute_seconds", "paired_event_boundary_end_absolute_seconds", "conflict_count_and_rate",
];
const branchPrecedence = [
  "BLOCKED_INPUT_INVALID_NO_REPORT", "BLOCKED_PRIMARY_KAPPA_NOT_ESTIMABLE", "RELABEL_PILOT_REQUIRED",
  "CONTINUE_FULL_CONFLICT_ADJUDICATION", "TARGET_RELIABILITY_MET",
];
const branchRules = {
  BLOCKED_INPUT_INVALID_NO_REPORT: "reconciler rejects incomplete or drifted inputs before report publication",
  BLOCKED_PRIMARY_KAPPA_NOT_ESTIMABLE: "either primary kappa denominator is zero",
  RELABEL_PILOT_REQUIRED: "either estimable primary kappa is below 0.67",
  CONTINUE_FULL_CONFLICT_ADJUDICATION: "both primary kappas are at least 0.67 and either is below 0.80",
  TARGET_RELIABILITY_MET: "both primary kappas are at least 0.80",
};
const missingPolicy = {
  unknown_is_a_real_disposition_not_missing: true,
  missing_items_are_input_invalid: true,
  all_or_single_category_agreement_does_not_establish_reliability: true,
  report_each_reviewer_unknown_count: true,
};
const scientificBoundary = {
  quality_report_is_pre_adjudication_reliability_evidence: true,
  quality_report_is_not_gold: true,
  quality_report_does_not_create_decisions: true,
  quality_report_does_not_create_signoffs: true,
  quality_report_does_not_authorize_signed_gold: true,
  formal_gold_write_allowed: false,
};

export function hashGoldDoubleReviewQualityProtocolV1(protocol: Omit<GoldDoubleReviewQualityProtocolV1, "quality_protocol_sha256">): string {
  return domainHash(GOLD_DOUBLE_REVIEW_QUALITY_PROTOCOL_DOMAIN_V1, protocol);
}

export function equalGoldReviewScientificDecisionV1(left: GoldReviewScientificDecision, right: GoldReviewScientificDecision): boolean {
  try { return canonical(safeSnapshot(left)) === canonical(safeSnapshot(right)); }
  catch { return false; }
}

export function validateGoldDoubleReviewQualityProtocolV1(input: unknown): input is GoldDoubleReviewQualityProtocolV1 {
  try { input = safeSnapshot(input); } catch { return false; }
  if (!isRecord(input) || !exactKeys(input, [
    "schema_version", "status", "parent_repository_commit", "review_package_sha256", "denominator", "primary_metrics",
    "diagnostic_metrics", "branch_precedence", "branch_rules", "missing_and_uncertain_policy", "scientific_boundary", "quality_protocol_sha256",
  ])) return false;
  if (input.schema_version !== "gold-double-review-quality-protocol-v1" || input.status !== "preregistered_before_human_assessments"
    || input.parent_repository_commit !== "d90bddc35918b0a388b2fbb6a581fbe7f1bc3f1d"
    || input.review_package_sha256 !== "21de05a19d9cdccf47c4aab05562cb1463d02d0a2eb275c567fd84186b7211e7" || !sha(input.quality_protocol_sha256)) return false;
  if (!isRecord(input.denominator) || !exactKeys(input.denominator, ["group_count", "reviewer_count", "disposition_labels", "operation_non_accept_label"])
    || input.denominator.group_count !== 52 || input.denominator.reviewer_count !== 2
    || JSON.stringify(input.denominator.disposition_labels) !== JSON.stringify(dispositionLabels)
    || input.denominator.operation_non_accept_label !== "NO_EVENT_ACCEPTED") return false;
  if (!Array.isArray(input.primary_metrics) || input.primary_metrics.length !== 2 || !input.primary_metrics.every(isRecord)) return false;
  const [disposition, operation] = input.primary_metrics;
  if (!exactKeys(disposition, ["metric", "minimum_continue_threshold", "target_threshold", "degenerate_expected_agreement_one"])
    || disposition.metric !== "cohen_kappa_disposition" || disposition.minimum_continue_threshold !== 0.67
    || disposition.target_threshold !== 0.8 || disposition.degenerate_expected_agreement_one !== "blocked_not_estimable") return false;
  if (!exactKeys(operation, ["metric", "minimum_continue_threshold", "target_threshold", "non_accept_encoding", "accept_encoding", "degenerate_expected_agreement_one"])
    || operation.metric !== "cohen_kappa_operation_sequence" || operation.minimum_continue_threshold !== 0.67
    || operation.target_threshold !== 0.8 || operation.non_accept_encoding !== "NO_EVENT_ACCEPTED"
    || operation.accept_encoding !== "canonical_time_then_event_id_operation_sequence"
    || operation.degenerate_expected_agreement_one !== "blocked_not_estimable") return false;
  if (JSON.stringify(input.diagnostic_metrics) !== JSON.stringify(diagnosticMetrics)
    || JSON.stringify(input.branch_precedence) !== JSON.stringify(branchPrecedence)
    || JSON.stringify(input.branch_rules) !== JSON.stringify(branchRules)
    || JSON.stringify(input.missing_and_uncertain_policy) !== JSON.stringify(missingPolicy)
    || JSON.stringify(input.scientific_boundary) !== JSON.stringify(scientificBoundary)) return false;
  const { quality_protocol_sha256: commitment, ...payload } = input;
  return commitment === hashGoldDoubleReviewQualityProtocolV1(payload as Omit<GoldDoubleReviewQualityProtocolV1, "quality_protocol_sha256">);
}

function kappa(left: string[], right: string[], fixedLabels?: string[]): KappaResult {
  if (!left.length || left.length !== right.length) throw new Error("Cohen kappa requires two non-empty equal-length label vectors");
  const labels = fixedLabels ? [...fixedLabels] : [...new Set([...left, ...right])].sort((a, b) => a.localeCompare(b, "en"));
  if (left.some((value) => !labels.includes(value)) || right.some((value) => !labels.includes(value))) throw new Error("Cohen kappa label leaves the frozen label set");
  const matrix = labels.map(() => labels.map(() => 0));
  for (let index = 0; index < left.length; index += 1) matrix[labels.indexOf(left[index])][labels.indexOf(right[index])] += 1;
  const observed = matrix.reduce((sum, row, index) => sum + row[index], 0) / left.length;
  const expected = labels.reduce((sum, _label, index) => {
    const leftCount = matrix[index].reduce((a, b) => a + b, 0);
    const rightCount = matrix.reduce((count, row) => count + row[index], 0);
    return sum + (leftCount / left.length) * (rightCount / right.length);
  }, 0);
  const denominator = 1 - expected;
  return {
    status: denominator === 0 ? "not_estimable" : "estimable",
    value: denominator === 0 ? null : (observed - expected) / denominator,
    item_count: left.length,
    labels,
    observed_agreement: observed,
    expected_agreement: expected,
    confusion_matrix: matrix,
  };
}

function operationLabel(decision: GoldReviewScientificDecision): string {
  return decision.disposition === "accept"
    ? `ACCEPT:${decision.final_events.map((event) => event.operation).join(">")}`
    : "NO_EVENT_ACCEPTED";
}

function summary(values: number[]): { count: number; mean: number | null; median: number | null; maximum: number | null } {
  if (!values.length) return { count: 0, mean: null, median: null, maximum: null };
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length, median, maximum: sorted.at(-1)! };
}

function countLabels(values: string[], labels: string[]): Record<string, number> {
  return Object.fromEntries(labels.map((label) => [label, values.filter((value) => value === label).length]));
}

function assertDecision(value: GoldReviewScientificDecision, label: string): void {
  if (!isRecord(value) || !exactKeys(value, ["disposition", "selected_candidate_ids", "final_events"])
    || !dispositionLabels.includes(value.disposition) || !Array.isArray(value.selected_candidate_ids)
    || !value.selected_candidate_ids.every((id) => typeof id === "string" && id.length > 0)
    || new Set(value.selected_candidate_ids).size !== value.selected_candidate_ids.length
    || !Array.isArray(value.final_events)) throw new Error(`${label} scientific decision is invalid`);
  if (value.disposition === "accept" && (!value.final_events.length || value.final_events.length !== value.selected_candidate_ids.length
    || value.final_events.some((event) => !isRecord(event)
      || !exactKeys(event, ["event_id", "source_event_refs", "operation", "time", "semantic_label", "region", "relation", "modification"])
      || typeof event.event_id !== "string" || !event.event_id.length
      || !Array.isArray(event.source_event_refs) || !event.source_event_refs.length
      || !event.source_event_refs.every((ref) => typeof ref === "string" && ref.length > 0)
      || new Set(event.source_event_refs).size !== event.source_event_refs.length
      || !["ADD", "ERASE", "MODIFY", "CONNECT", "atomic_ERASE+ADD"].includes(event.operation)
      || !isRecord(event.time) || !exactKeys(event.time, ["start", "end"])
      || !finite(event.time.start) || !finite(event.time.end) || event.time.end <= event.time.start
      || typeof event.semantic_label !== "string" || !event.semantic_label.trim()))) throw new Error(`${label} accepted event is invalid`);
  if (value.disposition === "accept") {
    if (new Set(value.final_events.map((event) => event.event_id)).size !== value.final_events.length) throw new Error(`${label} accepted event IDs duplicate`);
    const canonicalEvents = [...value.final_events].sort((left, right) => left.time.start - right.time.start || left.event_id.localeCompare(right.event_id, "en"));
    if (canonical(value.final_events) !== canonical(canonicalEvents)) throw new Error(`${label} accepted events are not in canonical order`);
  }
  if (value.disposition !== "accept" && (value.selected_candidate_ids.length || value.final_events.length)) throw new Error(`${label} non-accept decision carries events`);
}

export function compileGoldDoubleReviewQualityReportV1(input: GoldDoubleReviewQualityCompilerInputV1): Record<string, unknown> {
  // This public function proves a caller-supplied plain-data projection and its declared roots are self-consistent.
  // Only reconcile-gold-independent-review.ts derives that projection from revalidated assessment bytes.
  input = safeSnapshot(input) as typeof input;
  if (!isRecord(input) || !exactKeys(input, [
    "protocol", "quality_protocol_json_sha256", "manifest_payload_sha256", "manifest_json_sha256", "review_package_sha256",
    "visual_assessment_sha256", "physics_assessment_sha256", "pairs",
  ])) throw new Error("quality compiler input fields are not exact");
  if (!validateGoldDoubleReviewQualityProtocolV1(input.protocol)) throw new Error("Gold double-review quality protocol invalid");
  for (const [key, value] of Object.entries({
    quality_protocol_json_sha256: input.quality_protocol_json_sha256,
    manifest_payload_sha256: input.manifest_payload_sha256,
    manifest_json_sha256: input.manifest_json_sha256,
    review_package_sha256: input.review_package_sha256,
    visual_assessment_sha256: input.visual_assessment_sha256,
    physics_assessment_sha256: input.physics_assessment_sha256,
  })) if (!sha(value)) throw new Error(`${key} invalid`);
  if (input.quality_protocol_json_sha256 !== GOLD_DOUBLE_REVIEW_QUALITY_PROTOCOL_JSON_SHA256_V1) throw new Error("quality protocol JSON bytes drifted");
  if (input.review_package_sha256 !== input.protocol.review_package_sha256) throw new Error("quality protocol/review package mismatch");
  if (!Array.isArray(input.pairs) || input.pairs.length !== input.protocol.denominator.group_count) throw new Error("quality report denominator drifted");
  const identities = new Set<string>();
  const cards = new Set<string>();
  const groups = new Set<string>();
  for (const [index, pair] of input.pairs.entries()) {
    if (!isRecord(pair) || !exactKeys(pair, ["card_sha256", "package_id", "group_id", "visual", "physics"])
      || !sha(pair.card_sha256) || typeof pair.package_id !== "string" || !pair.package_id.length
      || typeof pair.group_id !== "string" || !pair.group_id.length) throw new Error(`quality pair ${index} invalid`);
    const identity = `${pair.package_id}\0${pair.group_id}\0${pair.card_sha256}`;
    const groupIdentity = `${pair.package_id}\0${pair.group_id}`;
    if (identities.has(identity) || cards.has(pair.card_sha256) || groups.has(groupIdentity)) throw new Error("quality pair duplicated");
    identities.add(identity);
    cards.add(pair.card_sha256);
    groups.add(groupIdentity);
    assertDecision(pair.visual, `pairs[${index}].visual`);
    assertDecision(pair.physics, `pairs[${index}].physics`);
  }
  const visualDisposition = input.pairs.map((pair) => pair.visual.disposition);
  const physicsDisposition = input.pairs.map((pair) => pair.physics.disposition);
  const visualOperation = input.pairs.map((pair) => operationLabel(pair.visual));
  const physicsOperation = input.pairs.map((pair) => operationLabel(pair.physics));
  const dispositionKappa = kappa(visualDisposition, physicsDisposition, dispositionLabels);
  const operationKappa = kappa(visualOperation, physicsOperation);
  const binaryKappa = kappa(visualDisposition.map((value) => value === "accept" ? "accept" : "non_accept"), physicsDisposition.map((value) => value === "accept" ? "accept" : "non_accept"), ["accept", "non_accept"]);
  const exact = input.pairs.filter((pair) => equalGoldReviewScientificDecisionV1(pair.visual, pair.physics));
  const bothAccept = input.pairs.filter((pair) => pair.visual.disposition === "accept" && pair.physics.disposition === "accept");
  let sameCandidate = 0;
  let sameOperation = 0;
  let sameSemantic = 0;
  const starts: number[] = [];
  const ends: number[] = [];
  for (const pair of bothAccept) {
    if (canonical([...pair.visual.selected_candidate_ids].sort()) === canonical([...pair.physics.selected_candidate_ids].sort())) sameCandidate += 1;
    if (operationLabel(pair.visual) === operationLabel(pair.physics)) sameOperation += 1;
    if (JSON.stringify(pair.visual.final_events.map((event) => event.semantic_label)) === JSON.stringify(pair.physics.final_events.map((event) => event.semantic_label))) sameSemantic += 1;
    const rightById = new Map(pair.physics.final_events.map((event) => [event.event_id, event]));
    for (const event of pair.visual.final_events) {
      const right = rightById.get(event.event_id);
      if (right) {
        starts.push(Math.abs(event.time.start - right.time.start));
        ends.push(Math.abs(event.time.end - right.time.end));
      }
    }
  }
  const packages = [...new Set(input.pairs.map((pair) => pair.package_id))].sort();
  const perPackage = packages.map((packageId) => {
    const rows = input.pairs.filter((pair) => pair.package_id === packageId);
    const count = rows.filter((pair) => equalGoldReviewScientificDecisionV1(pair.visual, pair.physics)).length;
    return { package_id: packageId, group_count: rows.length, exact_agreement_count: count, exact_agreement_rate: count / rows.length };
  });
  let decision: GoldDoubleReviewQualityDecision;
  if (dispositionKappa.status === "not_estimable" || operationKappa.status === "not_estimable") decision = "BLOCKED_PRIMARY_KAPPA_NOT_ESTIMABLE";
  else if (dispositionKappa.value! < 0.67 || operationKappa.value! < 0.67) decision = "RELABEL_PILOT_REQUIRED";
  else if (dispositionKappa.value! < 0.8 || operationKappa.value! < 0.8) decision = "CONTINUE_FULL_CONFLICT_ADJUDICATION";
  else decision = "TARGET_RELIABILITY_MET";
  const payload = {
    schema_version: "gold-double-review-quality-report-v1",
    status: "pre_adjudication_reliability_evidence_not_gold",
    quality_protocol_sha256: input.protocol.quality_protocol_sha256,
    quality_protocol_json_sha256: input.quality_protocol_json_sha256,
    manifest_payload_sha256: input.manifest_payload_sha256,
    manifest_json_sha256: input.manifest_json_sha256,
    review_package_sha256: input.review_package_sha256,
    visual_assessment_sha256: input.visual_assessment_sha256,
    physics_assessment_sha256: input.physics_assessment_sha256,
    scientific_pair_projection_sha256: domainHash(GOLD_DOUBLE_REVIEW_SCIENTIFIC_PAIR_PROJECTION_DOMAIN_V1, input.pairs),
    denominator: { group_count: input.pairs.length, reviewer_count: 2 },
    primary_metrics: { cohen_kappa_disposition: dispositionKappa, cohen_kappa_operation_sequence: operationKappa },
    diagnostics: {
      exact_scientific_decision_agreement: { count: exact.length, rate: exact.length / input.pairs.length },
      binary_acceptance_kappa: binaryKappa,
      per_disposition_counts_by_reviewer: {
        visual_reviewer: countLabels(visualDisposition, dispositionLabels),
        physics_reviewer: countLabels(physicsDisposition, dispositionLabels),
      },
      per_package_exact_agreement: perPackage,
      both_accept: {
        count: bothAccept.length,
        same_candidate_set_count: sameCandidate,
        same_operation_sequence_count: sameOperation,
        same_semantic_sequence_count: sameSemantic,
      },
      paired_event_boundary_start_absolute_seconds: summary(starts),
      paired_event_boundary_end_absolute_seconds: summary(ends),
      conflict: { count: input.pairs.length - exact.length, rate: (input.pairs.length - exact.length) / input.pairs.length },
    },
    decision,
    scientific_boundary: input.protocol.scientific_boundary,
  };
  return { ...payload, quality_report_sha256: domainHash(GOLD_DOUBLE_REVIEW_QUALITY_REPORT_DOMAIN_V1, payload) };
}

export function validateGoldDoubleReviewQualityReportV1AgainstInputs(report: unknown, input: GoldDoubleReviewQualityCompilerInputV1): boolean {
  try {
    return canonical(safeSnapshot(report)) === canonical(compileGoldDoubleReviewQualityReportV1(input));
  } catch {
    return false;
  }
}
