import { containsFabricatedLearnerOutcome } from "./signed-gold.js";

export type GoldIndependentReviewerSlot = "visual_reviewer" | "physics_reviewer";

export interface GoldIndependentReviewEvidence {
  evidence_index: number;
  evidence_id: string;
  side: string;
  kind: string;
  label: string;
  asset_uri: string;
  sha256: string;
  byte_length: number;
}

export interface GoldIndependentReviewCandidate {
  candidate_id: string;
  event_id: string;
  source_event_refs: string[];
  operation: "ADD" | "ERASE" | "MODIFY" | "CONNECT" | "atomic_ERASE+ADD" | "unknown";
  time: { start: number; end: number };
  semantic_label: string;
  region: unknown;
  relation: unknown;
  modification: unknown;
  acceptance_ready: boolean;
  acceptance_blockers: string[];
}

export interface GoldIndependentReviewCard {
  card_sha256: string;
  package_id: string;
  source_video_id: string;
  group_id: string;
  alignment_class: string;
  group_time: { start: number; end: number };
  source_events: Array<{ event_id: string; side: string; operation: string; time: { start: number; end: number } | null; semantic_label: string }>;
  candidates: GoldIndependentReviewCandidate[];
  evidence: GoldIndependentReviewEvidence[];
  unresolved_fields: string[];
  speech_context: { text: string; status: "context_not_gold" };
}

export interface GoldIndependentReviewPacket {
  schema_version: "gold-independent-review-workspace-packet-v1";
  status: "read_only_frozen_evidence_local_draft_only";
  reviewer_slot: GoldIndependentReviewerSlot;
  manifest_payload_sha256: string;
  manifest_json_sha256: string;
  template_json_sha256: string;
  review_package_sha256: string;
  assessment_header: {
    schema_version: "gold-independent-assessment-v1";
    manifest_payload_sha256: string;
    manifest_json_sha256: string;
    reviewer_slot: GoldIndependentReviewerSlot;
    instructions: Record<string, unknown>;
  };
  counts: { item_count: 52; evidence_asset_count: number; evidence_byte_length: number };
  items: Array<{ presentation_index: number; card_sha256: string; package_id: string; group_id: string; card: GoldIndependentReviewCard }>;
  invariants: {
    server_write_allowed: false;
    gold_decision_created: false;
    peer_completed_assessment_exposed: false;
    browser_draft_is_not_gold: true;
    reviewer_identity_is_external_governance: true;
  };
}

export type GoldIndependentReviewDisposition = "accept" | "reject" | "not_an_event" | "unknown";

export interface GoldIndependentReviewFinalEvent {
  event_id: string;
  source_event_refs: string[];
  operation: Exclude<GoldIndependentReviewCandidate["operation"], "unknown">;
  time: { start: number; end: number };
  semantic_label: string;
  region: unknown;
  relation: unknown;
  modification: unknown;
}

export interface GoldIndependentReviewDecision {
  disposition: GoldIndependentReviewDisposition;
  selected_candidate_ids: string[];
  final_events: GoldIndependentReviewFinalEvent[];
  rationale: string;
  reviewed_at: string;
}

export interface GoldIndependentAssessmentV1 {
  schema_version: "gold-independent-assessment-v1";
  manifest_payload_sha256: string;
  manifest_json_sha256: string;
  reviewer_slot: GoldIndependentReviewerSlot;
  status: "completed_independent_assessment";
  reviewer_id: string;
  reviewer_role: string;
  instructions: Record<string, unknown>;
  items: Array<{
    presentation_index: number;
    card_sha256: string;
    package_id: string;
    group_id: string;
    decision: GoldIndependentReviewDecision;
  }>;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const resolvedOperations = ["ADD", "ERASE", "MODIFY", "CONNECT", "atomic_ERASE+ADD"] as const;

function finalEventForCandidate(card: GoldIndependentReviewCard, candidate: GoldIndependentReviewCandidate, event: GoldIndependentReviewFinalEvent): void {
  if (event.event_id !== candidate.event_id
    || JSON.stringify([...event.source_event_refs].sort()) !== JSON.stringify([...candidate.source_event_refs].sort())) throw new Error("最终事件没有闭合所选候选");
  if (!(resolvedOperations as readonly unknown[]).includes(event.operation)) throw new Error("最终事件操作无效");
  if (candidate.operation !== "unknown" && event.operation !== candidate.operation) throw new Error("不得改写已冻结的候选操作");
  if (!Number.isFinite(event.time.start) || !Number.isFinite(event.time.end) || event.time.end <= event.time.start) throw new Error("最终事件时间无效");
  if (event.time.start < card.group_time.start - 2 || event.time.end > card.group_time.end + 2) throw new Error("最终事件时间离开证据窗口");
  if (!nonempty(event.semantic_label) || containsFabricatedLearnerOutcome(event.semantic_label)) throw new Error("最终事件语义标签无效");
  if (JSON.stringify(event.region) !== JSON.stringify(candidate.region)
    || JSON.stringify(event.relation) !== JSON.stringify(candidate.relation)
    || JSON.stringify(event.modification) !== JSON.stringify(candidate.modification)) throw new Error("最终事件结构不得漂移");
  if ((event.operation === "CONNECT") !== Boolean(event.relation)
    || (event.operation === "MODIFY") !== Boolean(event.modification)) throw new Error("最终事件操作与关系/修改结构不一致");
}

/**
 * Browser-only export builder. It never writes Gold state; the CLI reconciler
 * remains the authoritative validator before joint human confirmation.
 */
export function buildGoldIndependentAssessmentV1(input: {
  packet: GoldIndependentReviewPacket;
  reviewer_id: string;
  reviewer_role: string;
  decisions: Record<string, GoldIndependentReviewDecision | undefined>;
}): GoldIndependentAssessmentV1 {
  const reviewerId = input.reviewer_id.trim();
  const reviewerRole = input.reviewer_role.trim();
  if (reviewerId.length < 2 || reviewerRole.length < 2) throw new Error("请填写评审者身份和角色");
  const items = input.packet.items.map((item) => {
    const decision = input.decisions[item.card_sha256];
    if (!decision) throw new Error(`第 ${item.presentation_index} 项尚未完成`);
    if (!(["accept", "reject", "not_an_event", "unknown"] as string[]).includes(decision.disposition)
      || decision.rationale.trim().length < 8 || !Number.isFinite(Date.parse(decision.reviewed_at))) throw new Error(`第 ${item.presentation_index} 项的结论、理由或时间无效`);
    if (new Set(decision.selected_candidate_ids).size !== decision.selected_candidate_ids.length) throw new Error(`第 ${item.presentation_index} 项重复选择候选`);
    if (decision.disposition !== "accept") {
      if (decision.selected_candidate_ids.length || decision.final_events.length) throw new Error(`第 ${item.presentation_index} 项非接受结论不得携带事件`);
    } else {
      if (!decision.selected_candidate_ids.length || decision.selected_candidate_ids.length !== decision.final_events.length) throw new Error(`第 ${item.presentation_index} 项接受结论必须逐候选闭合`);
      const candidates = new Map(item.card.candidates.map((candidate) => [candidate.candidate_id, candidate]));
      for (const [index, candidateId] of decision.selected_candidate_ids.entries()) {
        const candidate = candidates.get(candidateId);
        const event = decision.final_events[index];
        if (!candidate || !event) throw new Error(`第 ${item.presentation_index} 项包含未知候选`);
        finalEventForCandidate(item.card, candidate, event);
      }
      const ordered = [...decision.final_events].sort((left, right) => left.time.start - right.time.start || left.event_id.localeCompare(right.event_id, "en"));
      if (JSON.stringify(ordered) !== JSON.stringify(decision.final_events)) throw new Error(`第 ${item.presentation_index} 项事件必须按时间排序`);
    }
    return {
      presentation_index: item.presentation_index,
      card_sha256: item.card_sha256,
      package_id: item.package_id,
      group_id: item.group_id,
      decision,
    };
  });
  return {
    schema_version: input.packet.assessment_header.schema_version,
    manifest_payload_sha256: input.packet.manifest_payload_sha256,
    manifest_json_sha256: input.packet.manifest_json_sha256,
    reviewer_slot: input.packet.reviewer_slot,
    status: "completed_independent_assessment",
    reviewer_id: reviewerId,
    reviewer_role: reviewerRole,
    instructions: input.packet.assessment_header.instructions,
    items,
  };
}
