import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { chmod, link, mkdtemp, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FormalOracleTransportAuthorityStore } from "./formalOracleTransportAuthorityStore.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(): Promise<{
  data: string;
  store: FormalOracleTransportAuthorityStore;
  trusted: { publicKey: KeyObject; privateKey: KeyObject };
}> {
  const data = await mkdtemp(join(tmpdir(), "formal-transport-store-"));
  roots.push(data);
  return {
    data,
    store: new FormalOracleTransportAuthorityStore(data),
    trusted: generateKeyPairSync("ed25519"),
  };
}

function input(validity: "current" | "future" | "expired" = "current") {
  const now = Date.now();
  const issued = validity === "future" ? now + 3_600_000 : now - 3_600_000;
  const expires = validity === "expired" ? now - 1_000 : validity === "future" ? now + 7_200_000 : now + 3_600_000;
  return {
    sequence: 1,
    issued_at: new Date(issued).toISOString(),
    expires_at: new Date(expires).toISOString(),
    created_by: "formal-owner",
    ledger_registry_sha256: "1".repeat(64),
    composition_sha256: "2".repeat(64),
    run_sha256: "3".repeat(64),
    execution_plan_sha256: "4".repeat(64),
    model: "gpt-5.5",
    endpoint_base_url: "https://api.example.com/v1",
    provider_id: "formal-provider",
    account_key_id: "formal-account",
    credential_key_id: "formal-credential",
  };
}

describe("FormalOracleTransportAuthorityStore", () => {
  it("freezes canonical signed bytes and loads only during the validity window", async () => {
    const { data, store, trusted } = await fixture();
    const registry = await store.freezeRegistry(input(), { key_id: "transport-key", private_key: trusted.privateKey });
    expect(registry.gates).toMatchObject({ endpoint_account_attested: true, api_execution_allowed: false });
    await expect(store.loadPinnedRegistry(registry.registry_sha256, new Map([["transport-key", trusted.publicKey]])))
      .resolves.toMatchObject({ registry_sha256: registry.registry_sha256, model: "gpt-5.5" });
    const future = await store.freezeRegistry(input("future"), { key_id: "transport-key", private_key: trusted.privateKey });
    await expect(store.loadPinnedRegistry(future.registry_sha256, new Map([["transport-key", trusted.publicKey]])))
      .rejects.toThrow("尚未生效或已过期");
    const expired = await store.freezeRegistry(input("expired"), { key_id: "transport-key", private_key: trusted.privateKey });
    await expect(store.loadPinnedRegistry(expired.registry_sha256, new Map([["transport-key", trusted.publicKey]])))
      .rejects.toThrow("尚未生效或已过期");
    expect((await stat(join(data, store.rootUri, "registries", registry.registry_sha256))).mode & 0o777).toBe(0o700);
    expect((await stat(join(data, store.rootUri, "registries", registry.registry_sha256, "registry.json"))).mode & 0o777).toBe(0o600);
  });

  it("rejects untrusted keys, wrong algorithms, hardlinks and wide permissions", async () => {
    const { data, store, trusted } = await fixture();
    const registry = await store.freezeRegistry(input(), { key_id: "transport-key", private_key: trusted.privateKey });
    const attacker = generateKeyPairSync("ed25519");
    await expect(store.loadPinnedRegistry(registry.registry_sha256, new Map([["attacker", attacker.publicKey]])))
      .rejects.toThrow("trusted key");
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await expect(store.loadPinnedRegistry(registry.registry_sha256, new Map([["transport-key", rsa.publicKey]])))
      .rejects.toThrow("Ed25519");
    const path = join(data, store.rootUri, "registries", registry.registry_sha256, "registry.json");
    const hardlink = `${path}.hardlink`;
    await link(path, hardlink);
    await expect(store.loadPinnedRegistry(registry.registry_sha256, new Map([["transport-key", trusted.publicKey]])))
      .rejects.toThrow("单链接");
    await unlink(hardlink);
    await chmod(path, 0o644);
    await expect(store.loadPinnedRegistry(registry.registry_sha256, new Map([["transport-key", trusted.publicKey]])))
      .rejects.toThrow("0600");
  });

  it("serializes revocation against active callbacks and then fails closed", async () => {
    const { data, store, trusted } = await fixture();
    const registry = await store.freezeRegistry(input(), { key_id: "transport-key", private_key: trusted.privateKey });
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const active = new Promise<void>((resolve) => { started = resolve; });
    const use = store.withPinnedRegistry(
      registry.registry_sha256,
      new Map([["transport-key", trusted.publicKey]]),
      async () => { started(); await waiting; return "used"; },
    );
    await active;
    let revoked = false;
    const second = new FormalOracleTransportAuthorityStore(data);
    const revoke = second.revokeRegistry({
      registry_sha256: registry.registry_sha256,
      reason: "Endpoint account authority explicitly withdrawn.",
      revoked_at: "2026-08-13T00:40:00.000Z",
    }, { key_id: "transport-key", private_key: trusted.privateKey }).then(() => { revoked = true; });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(revoked).toBe(false);
    release();
    await expect(use).resolves.toBe("used");
    await revoke;
    await expect(store.loadPinnedRegistry(registry.registry_sha256, new Map([["transport-key", trusted.publicKey]])))
      .rejects.toThrow("已撤销");
  });

  it("prevents an unrelated signer from squatting the create-once revocation path", async () => {
    const { store, trusted } = await fixture();
    const registry = await store.freezeRegistry(input(), { key_id: "transport-key", private_key: trusted.privateKey });
    const attacker = generateKeyPairSync("ed25519");
    await expect(store.revokeRegistry({
      registry_sha256: registry.registry_sha256,
      reason: "Attacker must not occupy the revocation marker.",
      revoked_at: "2026-08-13T00:40:00.000Z",
    }, { key_id: "transport-key", private_key: attacker.privateKey })).rejects.toThrow("未绑定原 registry");
    await expect(store.revokeRegistry({
      registry_sha256: registry.registry_sha256,
      reason: "Trusted signer explicitly withdraws this authority.",
      revoked_at: "2026-08-13T00:41:00.000Z",
    }, { key_id: "transport-key", private_key: trusted.privateKey })).resolves.toMatchObject({ registry_sha256: registry.registry_sha256 });
  });
});
