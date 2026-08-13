import { describe, expect, it } from "vitest";
import {
  hashOracleGatePrivateEvidenceDerivationReceiptV2,
  hashOracleGateEvidenceProjectionV2,
  hashOracleGateUnderlyingEvidenceDenominatorV2,
  hashOracleGatePublicEvidenceDerivationPolicyV2,
  hashOracleGatePublicEvidenceItemV2,
  hashOracleGatePublicEvidencePackageV2,
  validateOracleGateEvidenceV2AgainstBlindArtifacts,
  validateOracleGatePrivateEvidenceDerivationReceiptV2,
  validateOracleGatePublicEvidenceDerivationPolicyV2,
  validateOracleGatePublicEvidencePackageV2,
  type OracleGatePrivateEvidenceDerivationReceiptV2,
  type OracleGatePublicEvidenceDerivationPolicyV2,
  type OracleGatePublicEvidencePackageV2,
} from "./oracle-gate-public-evidence-v2.js";
import {
  hashPrivateAnswerKey,
  hashPublicBlindPackage,
  hashPublicBlindResponse,
  type PrivateAnswerKeyV1,
  type PublicBlindPackageV1,
} from "./oracle-gate-run.js";

const sha = (character: string): string => character.repeat(64);
const opaque = (index: number): string => `u_${index.toString(16).padStart(32, "0")}`;

function policy(): OracleGatePublicEvidenceDerivationPolicyV2 {
  const value: OracleGatePublicEvidenceDerivationPolicyV2 = {
    schema_version: "oracle-gate-public-evidence-derivation-policy-v2",
    public_evidence_derivation_policy_sha256: sha("0"),
    claim_projection_version: "response-v1-fixed-json-pointer-assertion-slots-v1",
    claim_source_paths: [
      "/observed_board_actions/*/operation",
      "/observed_board_actions/*/content",
      "/observed_board_actions/*/region",
      "/generalized_teaching_capability/name",
      "/generalized_teaching_capability/mechanism",
      "/generalized_teaching_capability/action_program/*",
      "/evidence_claims/*/claim",
    ],
    uncertainty_policy: "not_a_scored_claim",
    speech_segmentation_version: "one_verified_selected_transcript_unit_per_case-v1",
    speech_gold_status: "context_not_gold",
    board_event_renderer_version: "signed-gold-final-event-semantic-projection-v1",
    board_event_projection: ["operation", "semantic_label", "region", "relation", "modification"],
    eligible_evidence_policy: "verified_transcript_plus_all_signed_gold_final_events-v1",
    board_edit_denominator_policy: "all_signed_gold_final_events-v1",
    temporal_pair_policy: "all_ordered_signed_gold_final_event_pairs-v1",
    single_event_temporal_policy: "metric_not_applicable_not_global_block-v1",
    public_reblinding_scheme: "opaque-item-local-id-uniqueness-only-v1",
    created_at: "2026-08-13T00:00:00.000Z",
    api_execution_allowed: false,
  };
  value.public_evidence_derivation_policy_sha256 = hashOracleGatePublicEvidenceDerivationPolicyV2(value);
  return value;
}

function blindArtifacts() {
  const responses: PublicBlindPackageV1 = {
    schema_version: "oracle-gate-public-blind-package-v1",
    package_sha256: sha("0"),
    run_commitment_sha256: sha("a"),
    rubric_version: "rubric-v1",
    rubric_sha256: sha("b"),
    blinding_statement: "metadata_blinded_no_pairing_exposed",
    item_count: 4,
    items: [0, 1, 2, 3].map((index) => {
      const response = {
        schema_version: "teacher-evidence-response-v1",
        observed_board_actions: [{ sequence_index: 1, operation: "add", content: `Observed content ${index}`, region: `Board region ${index}` }],
        generalized_teaching_capability: { name: `Capability ${index}`, mechanism: `Mechanism ${index}`, action_program: [`Program ${index}`] },
        evidence_claims: [{ claim: `Evidence claim ${index}`, evidence_slot: "transcript" }],
        uncertainties: [],
      };
      return { blind_id: `B-${String(index + 1).repeat(64)}`, response, response_sha256: hashPublicBlindResponse(response) };
    }),
  };
  responses.package_sha256 = hashPublicBlindPackage(responses);
  const arms = ["transcript_only", "static_final_board", "uniform_frame", "oracle_delta"] as const;
  const key: PrivateAnswerKeyV1 = {
    schema_version: "oracle-gate-private-answer-key-v1",
    answer_key_sha256: sha("0"),
    run_sha256: sha("a"),
    public_package_sha256: responses.package_sha256,
    blind_secret_commitment_sha256: sha("c"),
    blinding_scheme: "hmac-sha256-run-request-v1",
    created_at: "2026-08-13T01:00:00.000Z",
    entries: responses.items.map((item, index) => ({
      blind_id: item.blind_id,
      request_id: `request-${index}`,
      idempotency_key: String(index + 5).repeat(64),
      case_id: "case-1",
      arm: arms[index],
      seed: 7,
      teacher_id: "teacher-private",
      source_video_id: "video-private",
      window_id: "window-private",
      response_sha256: item.response_sha256,
    })),
  };
  key.answer_key_sha256 = hashPrivateAnswerKey(key);
  return { responses, key };
}

function fixture(singleEvent = false) {
  const p = policy(), { responses, key } = blindArtifacts();
  let id = 0;
  const packageValue: OracleGatePublicEvidencePackageV2 = {
    schema_version: "oracle-gate-public-evidence-package-v2",
    evidence_package_sha256: sha("0"),
    record_trust: "non_authoritative_public_blind_evidence_record",
    public_response_package_sha256: responses.package_sha256,
    public_evidence_derivation_policy_sha256: p.public_evidence_derivation_policy_sha256,
    rubric_version: responses.rubric_version,
    rubric_sha256: responses.rubric_sha256,
    blinding_statement: "opaque_item_local_ids_only_content_privacy_pending_external_review",
    distribution_independence_status: "pending_external_randomized_independent_sessions",
    item_count: responses.items.length,
    items: responses.items.map((response, armIndex) => {
      const claimContents=["add",`Observed content ${armIndex}`,`Board region ${armIndex}`,`Capability ${armIndex}`,`Mechanism ${armIndex}`,`Program ${armIndex}`,`Evidence claim ${armIndex}`],claimIds=claimContents.map(()=>opaque(id++)), speechId = opaque(id++), firstBoard = opaque(id++), secondBoard = singleEvent ? null : opaque(id++), pairId = secondBoard ? opaque(id++) : null;
      return {
        blind_id: response.blind_id,
        response_sha256: response.response_sha256,
        claim_units: claimContents.map((content,index)=>({claim_id:claimIds[index],claim_index:index,content})),
        evidence_units: [
          { unit_id: speechId, kind: "verified_speech_context" as const, sequence_index: 0, content: "Verified transcript" },
          { unit_id: firstBoard, kind: "signed_gold_board_event" as const, sequence_index: 1, content: "Signed event one" },
          ...(secondBoard ? [{ unit_id: secondBoard, kind: "signed_gold_board_event" as const, sequence_index: 2, content: "Signed event two" }] : []),
        ],
        eligible_evidence_unit_ids: [speechId, firstBoard, ...(secondBoard ? [secondBoard] : [])],
        board_edit_unit_ids: [firstBoard, ...(secondBoard ? [secondBoard] : [])],
        temporal_metric_status: secondBoard ? "eligible_multi_edit" as const : "not_applicable_single_event" as const,
        temporal_pairs: secondBoard && pairId ? [{ pair_id: pairId, before_unit_id: firstBoard, after_unit_id: secondBoard }] : [],
      };
    }),
    api_execution_allowed: false,
  };
  packageValue.evidence_package_sha256 = hashOracleGatePublicEvidencePackageV2(packageValue);
  const receipt: OracleGatePrivateEvidenceDerivationReceiptV2 = {
    schema_version: "oracle-gate-private-evidence-derivation-receipt-v2",
    derivation_receipt_sha256: sha("0"),
    record_trust: "non_authoritative_until_post_run_source_gate_and_external_worm",
    evidence_scope: "post_hoc_development_only",
    run_sha256: sha("a"), terminal_checkpoint_sha256: sha("e"), public_response_package_sha256: responses.package_sha256,
    private_answer_key_sha256: key.answer_key_sha256, public_evidence_package_sha256: packageValue.evidence_package_sha256,
    public_evidence_derivation_policy_sha256: p.public_evidence_derivation_policy_sha256, ledger_registry_sha256: sha("f"),
    signed_gold_dataset_sha256: sha("1"), formal_input_manifest_sha256: sha("2"), formal_spec_sha256: sha("3"),
    schedule_sha256: sha("4"), execution_plan_sha256: sha("5"), verified_byte_inventory_sha256: sha("6"),
    frame_derivation_preflight_sha256: sha("7"), rubric_sha256: responses.rubric_sha256,
    rights_publication_status: "pending_authoritative_resource_active_head", item_count: packageValue.items.length,
    items: packageValue.items.map((item) => ({
      blind_id: item.blind_id, response_sha256: item.response_sha256, public_evidence_item_sha256: hashOracleGatePublicEvidenceItemV2(item),
      case_id: "case-1", seed: 7,
      claim_sources: item.claim_units.map((claim, index) => ({ public_claim_id: claim.claim_id, response_json_pointer: ["/observed_board_actions/0/operation","/observed_board_actions/0/content","/observed_board_actions/0/region","/generalized_teaching_capability/name","/generalized_teaching_capability/mechanism","/generalized_teaching_capability/action_program/0","/evidence_claims/0/claim"][index], projected_value_sha256: hashOracleGateEvidenceProjectionV2(claim.content) })),
      evidence_sources: item.evidence_units.map((unit, index) => ({ public_unit_id: unit.unit_id, source_kind: index === 0 ? "verified_selected_transcript" as const : "signed_gold_final_event" as const, source_json_pointer: index === 0 ? "/cases/0/speech/selected_transcript" : `/groups/0/final_events/${index - 1}`, projected_value_sha256: hashOracleGateEvidenceProjectionV2(unit.content) })),
      temporal_sources: item.temporal_pairs.map((pair) => ({ public_pair_id: pair.pair_id, before_source_json_pointer: "/groups/0/final_events/0", after_source_json_pointer: "/groups/0/final_events/1" })),
      underlying_evidence_denominator_sha256: sha("0"),
    })), api_execution_allowed: false,
  };
  for(const item of receipt.items)item.underlying_evidence_denominator_sha256=hashOracleGateUnderlyingEvidenceDenominatorV2({public_evidence_derivation_policy_sha256:p.public_evidence_derivation_policy_sha256,evidence_sources:item.evidence_sources.map(({source_kind,source_json_pointer,projected_value_sha256})=>({source_kind,source_json_pointer,projected_value_sha256})),temporal_sources:item.temporal_sources.map(({before_source_json_pointer,after_source_json_pointer})=>({before_source_json_pointer,after_source_json_pointer}))});
  receipt.derivation_receipt_sha256 = hashOracleGatePrivateEvidenceDerivationReceiptV2(receipt);
  return { policy: p, public_evidence: packageValue, private_derivation: receipt, public_responses: responses, private_answer_key: key };
}

describe("Formal Oracle public evidence v2 contracts", () => {
  it("validates the frozen preregisterable derivation policy", () => {
    const value = policy();
    expect(validateOracleGatePublicEvidenceDerivationPolicyV2(value)).toEqual({ valid: true, issues: [] });
  });

  it("allows response-specific claims while requiring private shared denominators", () => {
    const value = fixture();
    expect(value.public_evidence.items.map((item) => item.claim_units[1].content)).toEqual([
      "Observed content 0", "Observed content 1", "Observed content 2", "Observed content 3",
    ]);
    expect(validateOracleGateEvidenceV2AgainstBlindArtifacts(value)).toEqual({ valid: true, issues: [] });
  });

  it("uses package-global opaque IDs so public arm pairing cannot reuse identifiers", () => {
    const value = fixture();
    value.public_evidence.items[1].evidence_units[0].unit_id = value.public_evidence.items[0].evidence_units[0].unit_id;
    value.public_evidence.items[1].eligible_evidence_unit_ids[0] = value.public_evidence.items[0].evidence_units[0].unit_id;
    value.public_evidence.evidence_package_sha256 = hashOracleGatePublicEvidencePackageV2(value.public_evidence);
    expect(validateOracleGatePublicEvidencePackageV2(value.public_evidence).valid).toBe(false);
  });

  it("marks a single-event case temporal metric not-applicable instead of rejecting the package", () => {
    const value = fixture(true);
    expect(validateOracleGatePublicEvidencePackageV2(value.public_evidence)).toEqual({ valid: true, issues: [] });
    expect(value.public_evidence.items.every((item) => item.temporal_metric_status === "not_applicable_single_event" && item.temporal_pairs.length === 0)).toBe(true);
  });

  it("rejects bottom-denominator drift even after every public/private hash is recomputed", () => {
    const value = fixture();
    value.private_derivation.items[3].underlying_evidence_denominator_sha256 = sha("e");
    value.private_derivation.derivation_receipt_sha256 = hashOracleGatePrivateEvidenceDerivationReceiptV2(value.private_derivation);
    const report = validateOracleGateEvidenceV2AgainstBlindArtifacts(value);
    expect(report.valid).toBe(false);
    expect(report.issues.some((entry) => entry.path.includes("underlying_evidence_denominator_sha256"))).toBe(true);
  });

  it("rejects fabricated claim projections even after every public/private hash is recomputed", () => {
    const value=fixture(),item=value.public_evidence.items[0],source=value.private_derivation.items[0];
    item.claim_units[0].content="Caller fabricated assertion";
    source.claim_sources[0].projected_value_sha256=hashOracleGateEvidenceProjectionV2(item.claim_units[0].content);
    source.public_evidence_item_sha256=hashOracleGatePublicEvidenceItemV2(item);
    value.public_evidence.evidence_package_sha256=hashOracleGatePublicEvidencePackageV2(value.public_evidence);
    value.private_derivation.public_evidence_package_sha256=value.public_evidence.evidence_package_sha256;
    value.private_derivation.derivation_receipt_sha256=hashOracleGatePrivateEvidenceDerivationReceiptV2(value.private_derivation);
    expect(validateOracleGateEvidenceV2AgainstBlindArtifacts(value).issues.some(entry=>entry.path.includes("claim_sources[0]"))).toBe(true);
  });

  it("allows no preregistered-formal claim until FormalSpec/Run/RatingPlan bind the policy root",()=>{
    const value=fixture();value.private_derivation.evidence_scope="preregistered_formal_candidate";value.private_derivation.derivation_receipt_sha256=hashOracleGatePrivateEvidenceDerivationReceiptV2(value.private_derivation);
    expect(validateOracleGatePrivateEvidenceDerivationReceiptV2(value.private_derivation).valid).toBe(false);
  });

  it("rejects explicit private values in public content even after Unicode obfuscation and rehashing",()=>{
    const value=fixture(),item=value.public_evidence.items[0],source=value.private_derivation.items[0];item.claim_units[0].content="teacher-pri\u2061vate";source.claim_sources[0].projected_value_sha256=hashOracleGateEvidenceProjectionV2(item.claim_units[0].content);source.public_evidence_item_sha256=hashOracleGatePublicEvidenceItemV2(item);value.public_evidence.evidence_package_sha256=hashOracleGatePublicEvidencePackageV2(value.public_evidence);value.private_derivation.public_evidence_package_sha256=value.public_evidence.evidence_package_sha256;value.private_derivation.derivation_receipt_sha256=hashOracleGatePrivateEvidenceDerivationReceiptV2(value.private_derivation);expect(validateOracleGateEvidenceV2AgainstBlindArtifacts(value).valid).toBe(false);
  });
  it("rejects public/private item swaps even after recomputing the receipt hash",()=>{const value=fixture();[value.private_derivation.items[0],value.private_derivation.items[1]]=[value.private_derivation.items[1],value.private_derivation.items[0]];value.private_derivation.derivation_receipt_sha256=hashOracleGatePrivateEvidenceDerivationReceiptV2(value.private_derivation);expect(validateOracleGateEvidenceV2AgainstBlindArtifacts(value).issues.some(entry=>entry.path==="items")).toBe(true);});
  it("closes rubric version and rejects repeated Gold event pointers",()=>{const value=fixture();value.public_evidence.rubric_version="different-rubric";value.public_evidence.evidence_package_sha256=hashOracleGatePublicEvidencePackageV2(value.public_evidence);expect(validateOracleGateEvidenceV2AgainstBlindArtifacts(value).issues.some(entry=>entry.path==="rubric")).toBe(true);const repeated=fixture(),source=repeated.private_derivation.items[0];source.evidence_sources[2].source_json_pointer=source.evidence_sources[1].source_json_pointer;source.underlying_evidence_denominator_sha256=hashOracleGateUnderlyingEvidenceDenominatorV2({public_evidence_derivation_policy_sha256:repeated.policy.public_evidence_derivation_policy_sha256,evidence_sources:source.evidence_sources.map(({source_kind,source_json_pointer,projected_value_sha256})=>({source_kind,source_json_pointer,projected_value_sha256})),temporal_sources:source.temporal_sources.map(({before_source_json_pointer,after_source_json_pointer})=>({before_source_json_pointer,after_source_json_pointer}))});repeated.private_derivation.derivation_receipt_sha256=hashOracleGatePrivateEvidenceDerivationReceiptV2(repeated.private_derivation);expect(validateOracleGateEvidenceV2AgainstBlindArtifacts(repeated).issues.some(entry=>entry.path.includes("evidence_sources"))).toBe(true);});

  it("rejects caller accessors before evaluating any nested value", () => {
    const value = fixture(); let hits = 0;
    Object.defineProperty(value.private_derivation, "schema_version", { enumerable: true, get() { hits += 1; return "oracle-gate-private-evidence-derivation-receipt-v2"; } });
    expect(validateOracleGatePrivateEvidenceDerivationReceiptV2(value.private_derivation).valid).toBe(false);
    expect(validateOracleGateEvidenceV2AgainstBlindArtifacts(value).valid).toBe(false);
    expect(hits).toBe(0);
  });
});
