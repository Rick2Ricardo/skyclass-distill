import { describe, expect, it } from "vitest";
import {
  FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
  FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
} from "./oracle-gate-provider-request.js";
import {
  hashFormalOracleTransportRegistry,
  normalizeFormalOracleEndpointBaseUrl,
  validateFormalOracleTransportRegistry,
  type FormalOracleTransportRegistryV1,
} from "./oracle-gate-transport-authority.js";

function fixture(): FormalOracleTransportRegistryV1 {
  const registry: FormalOracleTransportRegistryV1 = {
    schema_version: "formal-oracle-transport-registry-v1",
    registry_id: "formal-transport-0000000000000000",
    registry_sha256: "0".repeat(64),
    status: "endpoint_account_attested_only",
    sequence: 1,
    issued_at: "2026-08-13T00:00:00.000Z",
    expires_at: "2026-08-13T01:00:00.000Z",
    created_by: "formal-owner",
    ledger_registry_sha256: "1".repeat(64),
    composition_sha256: "2".repeat(64),
    run_sha256: "3".repeat(64),
    execution_plan_sha256: "4".repeat(64),
    provider_body_profile: FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
    prepared_adapter_version: FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
    transport: "pi",
    model: "gpt-5.5",
    endpoint: {
      base_url: "https://api.example.com/v1",
      chat_completions_url: "https://api.example.com/v1/chat/completions",
      method: "POST",
      redirect_policy: "error",
      tls_required: true,
    },
    account: {
      provider_id: "formal-provider",
      account_key_id: "formal-account",
      credential_key_id: "formal-credential",
      auth_scheme: "bearer",
      credential_source: "external_callback_only",
      secret_persistence_allowed: false,
    },
    retry_policy: {
      provider_inner_retries: 0,
      attempt_owner: "formal_run_store",
      provider_idempotency_support: "not_available_for_chat_completions",
      single_consume_dispatch_required: true,
      post_fetch_uncertainty: "unknown_block_no_automatic_retry",
    },
    gates: {
      endpoint_account_attested: true,
      provider_wire_captured: false,
      single_consume_dispatch_proved: false,
      response_capture_proved: false,
      toolchain_capsule_attested: false,
      api_execution_allowed: false,
    },
    signer_key_id: "transport-key",
    signature_algorithm: "ed25519",
    signature_base64: `${"A".repeat(86)}==`,
  };
  registry.registry_sha256 = hashFormalOracleTransportRegistry(registry);
  registry.registry_id = `formal-transport-${registry.registry_sha256.slice(0, 16)}`;
  return registry;
}

describe("Formal Oracle transport authority contract", () => {
  it("validates the exact endpoint/account-only non-execution boundary", () => {
    const registry = fixture();
    expect(validateFormalOracleTransportRegistry(registry)).toEqual({ valid: true, issues: [] });
    const api = structuredClone(registry) as FormalOracleTransportRegistryV1;
    api.gates.api_execution_allowed = true as false;
    api.registry_sha256 = hashFormalOracleTransportRegistry(api);
    api.registry_id = `formal-transport-${api.registry_sha256.slice(0, 16)}`;
    expect(validateFormalOracleTransportRegistry(api).issues.map((item) => item.path)).toContain("gates");
  });

  it("rejects endpoint ambiguity, private targets, redirects and root mixing", () => {
    for (const value of [
      "http://api.example.com/v1",
      "https://api.example.com/v1/",
      "https://user@api.example.com/v1",
      "https://api.example.com/v1?x=1",
      "https://api.example.com/v1#x",
      "https://127.0.0.1/v1",
      "https://10.0.0.2/v1",
      "https://api.local/v1",
      "https://[::1]/v1",
      "https://2130706433/v1",
      "https://API.example.com/v1",
      "https://api.example.com/%76%31",
    ]) expect(() => normalizeFormalOracleEndpointBaseUrl(value)).toThrow();

    const registry = fixture();
    registry.endpoint.chat_completions_url = "https://other.example.com/v1/chat/completions";
    registry.registry_sha256 = hashFormalOracleTransportRegistry(registry);
    registry.registry_id = `formal-transport-${registry.registry_sha256.slice(0, 16)}`;
    expect(validateFormalOracleTransportRegistry(registry).issues.map((item) => item.path)).toContain("endpoint");
  });

  it("rejects sparse/extra fields and retry or secret persistence drift", () => {
    const extra = fixture() as FormalOracleTransportRegistryV1 & { api_key?: string };
    extra.api_key = "must-never-persist";
    expect(validateFormalOracleTransportRegistry(extra).issues.map((item) => item.path)).toContain("$");
    const retry = fixture();
    retry.retry_policy.provider_inner_retries = 1 as 0;
    retry.account.secret_persistence_allowed = true as false;
    expect(validateFormalOracleTransportRegistry(retry).issues.map((item) => item.path)).toEqual(expect.arrayContaining(["account", "retry_policy"]));
  });
});
