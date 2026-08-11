export type GoldReviewDisposition = "accept" | "reject" | "not_an_event" | "unknown";
export type GoldReviewSignoffRole = "visual_adjudicator" | "physics_reviewer";

export type GoldReviewOperation = "ADD" | "ERASE" | "MODIFY" | "CONNECT" | "atomic_ERASE+ADD" | "unknown";

export interface GoldReviewTimeRange {
  start: number;
  end: number;
}

export interface GoldReviewRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GoldReviewRelation {
  source_object_ids: string[];
  target_object_ids: string[];
  relation_type: string;
}

export interface GoldReviewModification {
  old_object_ids: string[];
  new_object_ids: string[];
  semantic_slot: string;
  change_description: string;
}

export interface GoldReviewEvent {
  event_id: string;
  source_event_refs: string[];
  operation: GoldReviewOperation;
  time: GoldReviewTimeRange;
  semantic_label: string;
  region: GoldReviewRegion | null;
  relation: GoldReviewRelation | null;
  modification: GoldReviewModification | null;
}

export interface GoldReviewEvidence {
  evidence_id: string;
  side: string;
  kind: string;
  label: string;
  path: string;
  sha256: string;
}

export interface GoldReviewCandidate extends GoldReviewEvent {
  candidate_id: string;
  acceptance_ready: boolean;
  acceptance_blockers: string[];
}

export interface GoldReviewSourceEvent {
  event_id: string;
  side: string;
  operation: GoldReviewOperation;
  time: GoldReviewTimeRange | null;
  semantic_label: string;
  region: GoldReviewRegion | null;
  status: string;
}

export interface GoldReviewDecisionRecord {
  schema_version: "gold-review-decision-v1";
  package_id: string;
  group_id: string;
  revision: number;
  parent_signature_sha256: string | null;
  source_intake_sha256: string;
  disposition: GoldReviewDisposition;
  selected_candidate_ids: string[];
  final_events: GoldReviewEvent[];
  adjudicator_id: string;
  adjudicator_role: string;
  rationale: string;
  decided_at: string;
  signature_sha256: string;
}

export interface GoldReviewPackageSignoff {
  schema_version: "gold-review-package-signoff-v1";
  package_id: string;
  signoff_role: GoldReviewSignoffRole;
  source_intake_sha256: string;
  decision_signatures: string[];
  adjudicator_id: string;
  adjudicator_role: string;
  statement: string;
  signed_at: string;
  signature_sha256: string;
}

export interface GoldReviewGroup {
  package_id: string;
  group_id: string;
  source_video_id: string;
  intake_path: string;
  alignment_class: string;
  time: GoldReviewTimeRange | null;
  speech_context: string;
  source_events: GoldReviewSourceEvent[];
  candidates: GoldReviewCandidate[];
  evidence: GoldReviewEvidence[];
  unresolved_fields: string[];
  current_decision: GoldReviewDecisionRecord | null;
  package_locked: boolean;
  package_signed: boolean;
}

export interface GoldReviewPackage {
  package_id: string;
  source_video_id: string;
  intake_path: string;
  intake_sha256: string;
  group_count: number;
  decided_count: number;
  accepted_event_count: number;
  package_signoffs: GoldReviewPackageSignoff[];
  fully_signed: boolean;
}

export interface GoldReviewQueue {
  schema_version: "gold-review-queue-v1";
  packages: GoldReviewPackage[];
  groups: GoldReviewGroup[];
  summary: {
    package_count: number;
    group_count: number;
    decided_count: number;
    accepted_event_count: number;
    minimum_required_event_count: number;
    signed_package_count: number;
    paper_gold_ready: boolean;
  };
}

export interface GoldReviewDecisionInput {
  package_id: string;
  group_id: string;
  disposition: GoldReviewDisposition;
  selected_candidate_ids?: string[];
  final_events?: GoldReviewEvent[];
  adjudicator_id: string;
  adjudicator_role: string;
  rationale: string;
}

export interface GoldReviewPackageSignoffInput {
  package_id: string;
  signoff_role: GoldReviewSignoffRole;
  adjudicator_id: string;
  adjudicator_role: string;
  statement: string;
}

/** Field order is frozen because review record signatures use JSON bytes. */
export function canonicalGoldReviewDecisionSignaturePayload(record: Omit<GoldReviewDecisionRecord, "signature_sha256"> | GoldReviewDecisionRecord): string {
  return JSON.stringify({
    schema_version: record.schema_version,
    package_id: record.package_id,
    group_id: record.group_id,
    revision: record.revision,
    parent_signature_sha256: record.parent_signature_sha256,
    source_intake_sha256: record.source_intake_sha256,
    disposition: record.disposition,
    selected_candidate_ids: record.selected_candidate_ids,
    final_events: record.final_events,
    adjudicator_id: record.adjudicator_id,
    adjudicator_role: record.adjudicator_role,
    rationale: record.rationale,
    decided_at: record.decided_at,
  });
}

/** Field order is frozen because package signoff signatures use JSON bytes. */
export function canonicalGoldReviewPackageSignoffSignaturePayload(record: Omit<GoldReviewPackageSignoff, "signature_sha256"> | GoldReviewPackageSignoff): string {
  return JSON.stringify({
    schema_version: record.schema_version,
    package_id: record.package_id,
    signoff_role: record.signoff_role,
    source_intake_sha256: record.source_intake_sha256,
    decision_signatures: record.decision_signatures,
    adjudicator_id: record.adjudicator_id,
    adjudicator_role: record.adjudicator_role,
    statement: record.statement,
    signed_at: record.signed_at,
  });
}
