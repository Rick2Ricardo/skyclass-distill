import { describe, expect, it } from "vitest";
import {
  hashFormalOracleCompositionAttestation,
  hashFormalOracleLocalPiProofSet,
  validateFormalOracleCompositionAttestation,
  validateFormalOracleCompositionAttestationAgainstExecutionPlan,
  type FormalOracleCompositionAttestationV2,
} from "./oracle-gate-composition.js";
import {
  hashFormalOraclePiFetchBoundaryProofV1,
  hashFormalOraclePiObservedLocalDependencyManifestV1,
  type FormalOraclePiFetchBoundaryProofV1,
} from "./oracle-gate-pi-fetch-boundary-proof.js";
import { hashFormalOraclePiResponseStreamProofV1, type FormalOraclePiResponseStreamProofV1 } from "./oracle-gate-pi-response-stream.js";

function fullProof(): FormalOraclePiFetchBoundaryProofV1 {
  const sse: FormalOraclePiResponseStreamProofV1 = {
    schema_version: "formal-oracle-pi-response-stream-v1",
    proof_sha256: "0".repeat(64),
    request_envelope_sha256: "0".repeat(64),
    provider_body_sha256: "1".repeat(64),
    raw_sse_sha256: "4".repeat(64), raw_sse_byte_length: 10,
    assistant_content_sha256: "5".repeat(64), assistant_content_byte_length: 2,
    response_id: "chatcmpl-fixture", model: "gpt-5.5", created: 1,
    role_prelude_count: 1, content_event_count: 1, finish_reason: "stop", done_count: 1,
    expected_max_input_tokens: 1024, expected_max_output_tokens: 64,
    raw_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } },
    normalized_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, cache_read_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0 },
    provider_response_scope: "untrusted_sse_entity_strict_derivation_only",
    store_integration_status: "formal_run_store_v2_abcd_integrated",
    external_provider_response_status: "pending_endpoint_account_exactly_once_and_capture",
    api_execution_allowed: false,
  };
  sse.proof_sha256 = hashFormalOraclePiResponseStreamProofV1(sse);
  const proof: FormalOraclePiFetchBoundaryProofV1 = {
    schema_version: "formal-oracle-pi-fetch-boundary-proof-v1",
    request_envelope_sha256: sse.request_envelope_sha256, provider_body_sha256: sse.provider_body_sha256,
    captured_url: "https://example.invalid/v1/chat/completions", captured_method: "POST",
    fetch_count: 1, on_payload_count: 1, on_payload_replacement: false, sdk_retry_count_header: "0",
    completion_method: "models.complete_non_simple", requested_max_tokens: 64, captured_max_completion_tokens: 64,
    redirect_policy_status: "pending_not_bound_by_pi_sdk_fetch_boundary", runtime_node_version: "v24.14.0",
    required_node_engine: ">=22.19.0", node_engine_status: "compatible_runtime_proved",
    runtime_toolchain_status: "runtime_engine_and_local_hashes_proved_external_immutable_capsule_pending",
    local_dependency_manifest_sha256: hashFormalOraclePiObservedLocalDependencyManifestV1("v24.14.0"), provider_endpoint_account_status: "pending_external_runtime_binding",
    local_fake_response_stream_proof: sse, provider_response_capture_status: "local_memory_fake_sse_proved_external_provider_pending",
    external_toolchain_authenticity_status: "pending_external_immutable_capsule",
    proof_status: "local_fake_fetch_exact_body_proved_non_executable", proof_sha256: "0".repeat(64), api_execution_allowed: false,
  };
  proof.proof_sha256 = hashFormalOraclePiFetchBoundaryProofV1(proof);
  return proof;
}

function fixture(): FormalOracleCompositionAttestationV2 {
  const proofs = [{
    schedule_index: 0,
    request_id: "REQ-1",
    request_envelope_sha256: "0".repeat(64),
    provider_body_sha256: "1".repeat(64),
    proof: fullProof(),
  }];
  const value: FormalOracleCompositionAttestationV2 = {
    schema_version: "formal-oracle-composition-attestation-v2",
    composition_sha256: "0".repeat(64),
    record_trust: "non_authoritative_composition_record",
    status: "composition_attested_only",
    composed_at: "2026-08-12T10:00:00.000Z",
    ledger_registry_sha256: "1".repeat(64),
    ledger_snapshot_sha256: "2".repeat(64),
    signed_gold_dataset_sha256: "3".repeat(64),
    formal_input_manifest_sha256: "4".repeat(64),
    formal_spec_sha256: "5".repeat(64),
    resource_manifest_sha256: "6".repeat(64),
    schedule_sha256: "7".repeat(64),
    code_revision: "8".repeat(40),
    build_artifact_sha256: "9".repeat(64),
    byte_inventory_sha256: "a".repeat(64),
    source_frame_preflight_sha256: "b".repeat(64),
    source_frame_proof_set_sha256: "c".repeat(64),
    media_attestation_sha256: "b".repeat(64),
    speech_attestation_sha256: "a".repeat(64),
    run_sha256: "d".repeat(64),
    execution_plan_sha256: "e".repeat(64),
    request_count: 1,
    genesis_checkpoint_sha256: "f".repeat(64),
    genesis_generation: 0,
    head_pin: {
      schema_version: "formal-oracle-head-pin-v1",
      run_sha256: "d".repeat(64),
      generation: 0,
      checkpoint_sha256: "f".repeat(64),
    },
    run_store_uri: "board2skill/formal-oracle/run-store",
    rights_registry_status: "pending_external_authoritative_head",
    request_envelope_serialization_status: "completed",
    provider_body_serialization_status: "completed_pi_body_serialization_candidate",
    provider_body_transport_compatibility_status: "completed_per_request_local_fake_fetch_proof_non_executable",
    local_pi_fetch_boundary_proof_count: proofs.length,
    local_pi_fetch_boundary_proof_set_sha256: hashFormalOracleLocalPiProofSet(proofs),
    local_pi_fetch_boundary_proofs: proofs,
    local_pi_fetch_boundary_dependency_manifest_sha256: proofs[0].proof.local_dependency_manifest_sha256,
    user_prompt_derivation_status: "completed",
    input_token_budget_status: "pending_model_specific_tokenizer",
    provider_wire_binding_status: "pending_external_endpoint_account_validation",
    provider_account_endpoint_status: "pending_external_runtime_binding",
    provider_response_capture_status: "pending_strict_sse_capture_contract",
    provider_runtime_engine_status: "compatible_runtime_proved_external_capsule_pending",
    toolchain_capsule_status: "pending_external_immutable_capsule",
    composition_record_authenticity_status: "pending_external_trusted_signature_or_worm",
    external_head_pin_status: "pending_external_monotonic_worm",
    blind_package_status: "pending",
    statistics_status: "pending",
    api_execution_allowed: false,
  };
  value.composition_sha256 = hashFormalOracleCompositionAttestation(value);
  return value;
}

describe("Formal Oracle composition attestation contract", () => {
  it("accepts only the strict content-addressed non-execution record", () => {
    expect(validateFormalOracleCompositionAttestation(fixture())).toEqual({ valid: true, issues: [] });
    expect(validateFormalOracleCompositionAttestationAgainstExecutionPlan(fixture(), {
      execution_plan_sha256: "e".repeat(64),
      items: [{ schedule_index: 0, request_id: "REQ-1", request_envelope_sha256: "0".repeat(64), provider_body_sha256: "1".repeat(64),
        model: "gpt-5.5", max_input_tokens: 1024, max_output_tokens: 64 }],
    })).toEqual({ valid: true, issues: [] });
    const legacy = { ...fixture(), schema_version: "formal-oracle-composition-attestation-v1" };
    expect(validateFormalOracleCompositionAttestation(legacy).valid).toBe(false);
  });

  it("rejects reordered/rewritten plan bindings and arbitrary proof roots", () => {
    const first = fixture().local_pi_fetch_boundary_proofs[0];
    const second = structuredClone(first);
    second.schedule_index = 1;
    second.request_id = "REQ-2";
    const value = fixture();
    value.request_count = 2;
    value.local_pi_fetch_boundary_proof_count = 2;
    value.local_pi_fetch_boundary_proofs = [second, first];
    value.local_pi_fetch_boundary_proof_set_sha256 = hashFormalOracleLocalPiProofSet(value.local_pi_fetch_boundary_proofs);
    value.composition_sha256 = hashFormalOracleCompositionAttestation(value);
    expect(validateFormalOracleCompositionAttestation(value).valid).toBe(false);

    value.local_pi_fetch_boundary_proofs = [structuredClone(first), second];
    value.local_pi_fetch_boundary_proof_set_sha256 = hashFormalOracleLocalPiProofSet(value.local_pi_fetch_boundary_proofs);
    value.composition_sha256 = hashFormalOracleCompositionAttestation(value);
    const reversedPlan = [
      { schedule_index: 0, request_id: "REQ-2", request_envelope_sha256: "0".repeat(64), provider_body_sha256: "1".repeat(64), model: "gpt-5.5", max_input_tokens: 1024, max_output_tokens: 64 },
      { schedule_index: 1, request_id: "REQ-1", request_envelope_sha256: "0".repeat(64), provider_body_sha256: "1".repeat(64), model: "gpt-5.5", max_input_tokens: 1024, max_output_tokens: 64 },
    ];
    expect(validateFormalOracleCompositionAttestationAgainstExecutionPlan(value, {
      execution_plan_sha256: value.execution_plan_sha256,
      items: reversedPlan,
    }).valid).toBe(false);

    const forged = fixture();
    forged.local_pi_fetch_boundary_proofs[0].proof.proof_sha256 = "f".repeat(64);
    forged.local_pi_fetch_boundary_proof_set_sha256 = hashFormalOracleLocalPiProofSet(forged.local_pi_fetch_boundary_proofs);
    forged.composition_sha256 = hashFormalOracleCompositionAttestation(forged);
    expect(validateFormalOracleCompositionAttestation(forged).valid).toBe(false);

    const fakeDependency = fixture();
    fakeDependency.local_pi_fetch_boundary_proofs[0].proof.local_dependency_manifest_sha256 = "f".repeat(64);
    fakeDependency.local_pi_fetch_boundary_proofs[0].proof.proof_sha256 = hashFormalOraclePiFetchBoundaryProofV1(fakeDependency.local_pi_fetch_boundary_proofs[0].proof);
    fakeDependency.local_pi_fetch_boundary_dependency_manifest_sha256 = "f".repeat(64);
    fakeDependency.local_pi_fetch_boundary_proof_set_sha256 = hashFormalOracleLocalPiProofSet(fakeDependency.local_pi_fetch_boundary_proofs);
    fakeDependency.composition_sha256 = hashFormalOracleCompositionAttestation(fakeDependency);
    expect(validateFormalOracleCompositionAttestation(fakeDependency).valid).toBe(false);
  });

  it("rejects unknown fields, self-hash drift, unsafe numbers/URIs, and api=true", () => {
    const unknown = { ...fixture(), extra: true };
    expect(validateFormalOracleCompositionAttestation(unknown).issues.map((item) => item.message)).toContain("字段集合无效");

    const drift = fixture();
    drift.run_sha256 = "0".repeat(64);
    expect(validateFormalOracleCompositionAttestation(drift).issues.map((item) => item.path)).toContain("composition_sha256");

    const numeric = { ...fixture(), genesis_generation: Number.POSITIVE_INFINITY };
    expect(validateFormalOracleCompositionAttestation(numeric).valid).toBe(false);

    const uri = fixture();
    uri.run_store_uri = "%252e%252e/private";
    uri.composition_sha256 = hashFormalOracleCompositionAttestation(uri);
    expect(validateFormalOracleCompositionAttestation(uri).issues.map((item) => item.path)).toContain("run_store_uri");

    const api = { ...fixture(), api_execution_allowed: true };
    expect(validateFormalOracleCompositionAttestation(api).issues.map((item) => item.path)).toContain("api_execution_allowed");
  });

  it("freezes media/speech mappings and downstream pending gates", () => {
    for (const patch of [
      { media_attestation_sha256: "9".repeat(64) },
      { speech_attestation_sha256: "9".repeat(64) },
      { external_head_pin_status: "ready" },
      { rights_registry_status: "attested" },
      { request_envelope_serialization_status: "pending" },
      { provider_body_serialization_status: "pending" },
      { provider_body_transport_compatibility_status: "completed" },
      { local_pi_fetch_boundary_proof_count: 2 },
      { request_count: 2 },
      { local_pi_fetch_boundary_proof_set_sha256: "9".repeat(64) },
      { local_pi_fetch_boundary_proofs: [] },
      { local_pi_fetch_boundary_proofs: [{ ...fixture().local_pi_fetch_boundary_proofs[0], request_id: "REQ-X" }] },
      { local_pi_fetch_boundary_dependency_manifest_sha256: "9".repeat(64) },
      { user_prompt_derivation_status: "pending" },
      { input_token_budget_status: "completed" },
      { provider_wire_binding_status: "completed" },
      { provider_account_endpoint_status: "completed" },
      { provider_response_capture_status: "completed" },
      { toolchain_capsule_status: "complete" },
      { composition_record_authenticity_status: "trusted" },
      { blind_package_status: "complete" },
      { statistics_status: "complete" },
    ]) {
      const value = { ...fixture(), ...patch };
      value.composition_sha256 = hashFormalOracleCompositionAttestation(value as FormalOracleCompositionAttestationV2);
      expect(validateFormalOracleCompositionAttestation(value).valid).toBe(false);
    }
  });
});
