import { describe, expect, it } from "vitest";
import {
  hashFormalOracleCompositionAttestation,
  validateFormalOracleCompositionAttestation,
  type FormalOracleCompositionAttestationV1,
} from "./oracle-gate-composition.js";

function fixture(): FormalOracleCompositionAttestationV1 {
  const value: FormalOracleCompositionAttestationV1 = {
    schema_version: "formal-oracle-composition-attestation-v1",
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
    user_prompt_derivation_status: "completed",
    input_token_budget_status: "pending_model_specific_tokenizer",
    provider_wire_binding_status: "pending_prepared_transport_adapter",
    provider_account_endpoint_status: "pending_external_runtime_binding",
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
      { user_prompt_derivation_status: "pending" },
      { input_token_budget_status: "completed" },
      { provider_wire_binding_status: "completed" },
      { provider_account_endpoint_status: "completed" },
      { toolchain_capsule_status: "complete" },
      { composition_record_authenticity_status: "trusted" },
      { blind_package_status: "complete" },
      { statistics_status: "complete" },
    ]) {
      const value = { ...fixture(), ...patch };
      value.composition_sha256 = hashFormalOracleCompositionAttestation(value as FormalOracleCompositionAttestationV1);
      expect(validateFormalOracleCompositionAttestation(value).valid).toBe(false);
    }
  });
});
