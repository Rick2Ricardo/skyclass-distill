import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FormalOracleTransportAuthorityStore } from "../../store/src/formalOracleTransportAuthorityStore.js";
import {
  assertActiveFormalOracleTransportAuthorityCapability,
  withPinnedFormalOracleTransportAuthority,
  type FormalOracleTransportAuthorityCapability,
} from "./oracleTransportAuthorityGate.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("Formal Oracle transport authority gate", () => {
  it("lends an immutable, non-serializable, expiring endpoint/account-only capability", async () => {
    const data = await mkdtemp(join(tmpdir(), "formal-transport-gate-")); roots.push(data);
    const keys = generateKeyPairSync("ed25519");
    const store = new FormalOracleTransportAuthorityStore(data);
    const now = Date.now();
    const expected = {
      ledger_registry_sha256: "1".repeat(64), composition_sha256: "2".repeat(64),
      run_sha256: "3".repeat(64), execution_plan_sha256: "4".repeat(64), model: "gpt-5.5",
    };
    const registry = await store.freezeRegistry({
      sequence: 1, issued_at: new Date(now - 60_000).toISOString(), expires_at: new Date(now + 3_600_000).toISOString(), created_by: "formal-owner",
      ...expected, endpoint_base_url: "https://api.example.com/v1", provider_id: "formal-provider",
      account_key_id: "formal-account", credential_key_id: "formal-credential",
    }, { key_id: "transport-key", private_key: keys.privateKey });
    let borrowed: FormalOracleTransportAuthorityCapability | undefined;
    const result = await withPinnedFormalOracleTransportAuthority({
      transport_store: store,
      pinned_transport_registry_sha256: registry.registry_sha256,
      trusted_transport_public_keys: new Map([["transport-key", keys.publicKey]]),
      expected,
      callback: async (capability) => {
        borrowed = capability;
        assertActiveFormalOracleTransportAuthorityCapability(capability);
        expect(() => JSON.stringify(capability)).toThrow("不得序列化");
        expect(() => { (capability.endpoint as { base_url: string }).base_url = "https://evil.example/v1"; }).toThrow();
        expect(capability).toMatchObject({
          stage: "transport_endpoint_account_attested_only",
          transport_registry_sha256: registry.registry_sha256,
          provider_wire_capture_status: "pending_single_consume_sender",
          response_capture_status: "pending_single_consume_sender",
          credential_availability_status: "pending_external_callback_secret",
          api_execution_allowed: false,
        });
        return capability.account.credential_key_id;
      },
    });
    expect(result).toBe("formal-credential");
    expect(() => assertActiveFormalOracleTransportAuthorityCapability(borrowed!)).toThrow("无效、已过期");
    expect(() => assertActiveFormalOracleTransportAuthorityCapability(JSON.parse(JSON.stringify({ stage: "transport_endpoint_account_attested_only" })))).toThrow("JSON 伪造");
  });

  it("rejects any root/model drift before invoking the callback", async () => {
    const data = await mkdtemp(join(tmpdir(), "formal-transport-gate-")); roots.push(data);
    const keys = generateKeyPairSync("ed25519"); const store = new FormalOracleTransportAuthorityStore(data); const now = Date.now();
    const expected = {
      ledger_registry_sha256: "1".repeat(64), composition_sha256: "2".repeat(64),
      run_sha256: "3".repeat(64), execution_plan_sha256: "4".repeat(64), model: "gpt-5.5",
    };
    const registry = await store.freezeRegistry({
      sequence: 1, issued_at: new Date(now - 60_000).toISOString(), expires_at: new Date(now + 3_600_000).toISOString(), created_by: "formal-owner",
      ...expected, endpoint_base_url: "https://api.example.com/v1", provider_id: "formal-provider",
      account_key_id: "formal-account", credential_key_id: "formal-credential",
    }, { key_id: "transport-key", private_key: keys.privateKey });
    let called = false;
    await expect(withPinnedFormalOracleTransportAuthority({
      transport_store: store, pinned_transport_registry_sha256: registry.registry_sha256,
      trusted_transport_public_keys: new Map([["transport-key", keys.publicKey]]),
      expected: { ...expected, run_sha256: "f".repeat(64) }, callback: async () => { called = true; },
    })).rejects.toThrow("未绑定当前 composition");
    expect(called).toBe(false);
  });

  it("expires inside a still-running callback and fails every later capability assertion", async () => {
    const data = await mkdtemp(join(tmpdir(), "formal-transport-gate-")); roots.push(data);
    const keys = generateKeyPairSync("ed25519"); const store = new FormalOracleTransportAuthorityStore(data); const now = Date.now();
    const expected = {
      ledger_registry_sha256: "1".repeat(64), composition_sha256: "2".repeat(64),
      run_sha256: "3".repeat(64), execution_plan_sha256: "4".repeat(64), model: "gpt-5.5",
    };
    const registry = await store.freezeRegistry({
      sequence: 1, issued_at: new Date(now - 60_000).toISOString(), expires_at: new Date(now + 300).toISOString(), created_by: "formal-owner",
      ...expected, endpoint_base_url: "https://api.example.com/v1", provider_id: "formal-provider",
      account_key_id: "formal-account", credential_key_id: "formal-credential",
    }, { key_id: "transport-key", private_key: keys.privateKey });
    await withPinnedFormalOracleTransportAuthority({
      transport_store: store, pinned_transport_registry_sha256: registry.registry_sha256,
      trusted_transport_public_keys: new Map([["transport-key", keys.publicKey]]), expected,
      callback: async (capability) => {
        assertActiveFormalOracleTransportAuthorityCapability(capability);
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect(() => assertActiveFormalOracleTransportAuthorityCapability(capability)).toThrow("超过签名有效期");
      },
    });
  });
});
