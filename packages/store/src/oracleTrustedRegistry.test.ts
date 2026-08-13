import { createHash, generateKeyPairSync } from "node:crypto";
import { chmod, link, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalOracleGateLedgerRegistryDocument, type OracleGateLedgerRegistryV1 } from "../../contracts/src/index.js";
import {
  assertActiveOracleLedgerCapability,
  withLedgerAttestedOracleRegistry,
} from "../../distillation/src/oracleTrustedPreflight.js";
import { FrozenOracleRegistryStore } from "./frozenOracleRegistryStore.js";
import { GoldLedgerAttestor } from "./goldLedgerAttestor.js";
import { GoldReviewStore } from "./goldReviewStore.js";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function sha(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function signedStoreFixture(): Promise<{
  root: string;
  data: string;
  store: GoldReviewStore;
  attestor: GoldLedgerAttestor;
  datasetSha256: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "trusted-gold-root-"));
  const data = await mkdtemp(join(tmpdir(), "trusted-gold-data-"));
  created.push(root, data);
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const manifestPath = join(root, "research/board2skill/oracle_pilot_clips.json");
  const intakePath = join(root, "research/board2skill/intake.json");
  const imagePath = join(root, "data/evidence.png");
  await Promise.all([mkdir(dirname(manifestPath), { recursive: true }), mkdir(dirname(imagePath), { recursive: true })]);
  await writeFile(imagePath, image);
  await writeFile(manifestPath, JSON.stringify({ clips: [{ oracle_annotation: { adjudication_intake_path: "research/board2skill/intake.json" } }] }));
  const candidates = Array.from({ length: 30 }, (_, index) => ({
    candidate_id: `G01-C${String(index + 1).padStart(2, "0")}`,
    source_event_refs: ["a-1", "b-1"],
    operation: "add",
    time: { start: index * 2, end: index * 2 + 1 },
    semantic_label: `新增板书对象 ${index + 1}`,
  }));
  await writeFile(intakePath, JSON.stringify({
    schema_version: "temporal-board-adjudication-intake-v1",
    package_id: "package-1",
    source_video_id: "video-1",
    items: [{
      group_id: "G01",
      alignment_class: "matched",
      alignment_window: { start: 0, end: 60 },
      a_side: { events: [{ event_id: "a-1", operation: "add", time: { start: 0, end: 60 }, semantic_label: "连续新增板书", status: "needs_review" }] },
      b_side: { events: [{ event_id: "b-1", operation: "add", time: { start: 0, end: 60 }, semantic_label: "连续新增板书", status: "needs_review" }] },
      evidence_assets: [{ side: "shared", kind: "comparison", label: "before/delta/after", path: "data/evidence.png", sha256: sha(image) }],
      proposal: { candidate_events: candidates },
      unresolved_fields: [],
    }],
  }));
  const store = new GoldReviewStore(root, data);
  await store.decide({
    package_id: "package-1",
    group_id: "G01",
    disposition: "accept",
    selected_candidate_ids: candidates.map((item) => item.candidate_id),
    adjudicator_id: "visual-expert",
    adjudicator_role: "visual-reviewer",
    rationale: "逐一核对三十个可见板书新增事件和冻结证据。",
  });
  await store.decide({
    package_id: "package-1",
    group_id: "G01",
    disposition: "accept",
    selected_candidate_ids: candidates.map((item) => item.candidate_id),
    adjudicator_id: "visual-expert",
    adjudicator_role: "visual-reviewer",
    rationale: "复核全部冻结图像后保留相同三十个事件，并把这一版作为包级签字正文。",
  });
  await store.signPackage({
    package_id: "package-1",
    signoff_role: "visual_adjudicator",
    adjudicator_id: "visual-expert",
    adjudicator_role: "visual-reviewer",
    statement: "确认本包全部视觉事件、边界和证据已经完成冻结复核。",
  });
  await store.signPackage({
    package_id: "package-1",
    signoff_role: "physics_reviewer",
    adjudicator_id: "physics-expert",
    adjudicator_role: "physics-reviewer",
    statement: "确认本包全部物理语义和最终事件已经完成独立复核。",
  });
  const compiled = await store.compileDataset();
  return { root, data, store, attestor: new GoldLedgerAttestor(store), datasetSha256: compiled.dataset.dataset_sha256 };
}

describe("trusted Formal Oracle ledger registry", () => {
  it("captures every current ledger byte and lends only a callback-scoped capability", async () => {
    const fixture = await signedStoreFixture();
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const registryStore = new FrozenOracleRegistryStore(fixture.data);
    const snapshot = await fixture.attestor.withCurrentSnapshot(fixture.datasetSha256, async (context) => context.snapshot);
    expect(snapshot).toMatchObject({ package_count: 1, reviewed_group_count: 1, accepted_event_count: 30 });
    expect(snapshot.entries.map((item) => item.kind).sort()).toEqual([
      "adjudication_intake",
      "decision_revision",
      "decision_revision",
      "gold_manifest",
      "package_signoff",
      "package_signoff",
    ]);
    expect(snapshot.entries.filter((item) => item.kind === "decision_revision")).toHaveLength(2);
    expect(snapshot.entries.filter((item) => item.kind === "package_signoff")).toHaveLength(2);

    const registry = await registryStore.freezeLedgerRegistry({
      sequence: 1,
      frozen_at: "2026-08-12T06:00:00.000Z",
      created_by: "formal-oracle-owner",
      ledger_snapshot: snapshot,
      formal_input_manifest_sha256: "1".repeat(64),
      formal_spec_sha256: "2".repeat(64),
      resource_manifest_sha256: "3".repeat(64),
      schedule_sha256: "4".repeat(64),
      code_revision: "5".repeat(40),
      build_artifact_sha256: "6".repeat(64),
      case_count: 1,
      event_count: 30,
      request_count: 12,
    }, { key_id: "formal-key-1", private_key: privateKey });
    expect(registry.gates).toEqual({
      ledger_attested: true,
      media_bytes_verified: false,
      speech_bytes_verified: false,
      run_store_verified: false,
      api_execution_allowed: false,
    });
    expect((await stat(join(fixture.data, "board2skill/formal-oracle/registries", registry.registry_sha256))).mode & 0o777).toBe(0o700);
    expect((await stat(join(fixture.data, "board2skill/formal-oracle/registries", registry.registry_sha256, "registry.json"))).mode & 0o777).toBe(0o600);

    let borrowed: unknown;
    const value = await withLedgerAttestedOracleRegistry({
      attestor: fixture.attestor,
      registryStore,
      pinned_registry_sha256: registry.registry_sha256,
      trusted_public_keys: new Map([["formal-key-1", publicKey]]),
      callback: async (capability) => {
        assertActiveOracleLedgerCapability(capability);
        borrowed = capability;
        expect(() => JSON.stringify(capability)).toThrow("不得序列化");
        expect(() => { (capability as { dataset_sha256: string }).dataset_sha256 = "forged"; }).toThrow();
        expect(capability.dataset_sha256).toBe(fixture.datasetSha256);
        expect(capability.dataset.dataset_sha256).toBe(fixture.datasetSha256);
        expect(Object.isFrozen(capability.dataset.packages)).toBe(true);
        expect(() => { (capability.dataset.packages as unknown[]).push({}); }).toThrow();
        return capability.dataset_sha256;
      },
    });
    expect(value).toBe(fixture.datasetSha256);
    expect(() => assertActiveOracleLedgerCapability(borrowed as never)).toThrow("无效、已过期");
    expect(() => assertActiveOracleLedgerCapability(JSON.parse(JSON.stringify({ stage: "ledger_attested_only" })))).toThrow("JSON 伪造");
  });

  it("rejects untrusted signers, ledger drift, revocation, hardlinks and wide permissions", async () => {
    const fixture = await signedStoreFixture();
    const trusted = generateKeyPairSync("ed25519");
    const attacker = generateKeyPairSync("ed25519");
    const registryStore = new FrozenOracleRegistryStore(fixture.data);
    const snapshot = await fixture.attestor.withCurrentSnapshot(fixture.datasetSha256, async (context) => context.snapshot);
    const registry = await registryStore.freezeLedgerRegistry({
      sequence: 1,
      frozen_at: "2026-08-12T06:00:00.000Z",
      created_by: "formal-oracle-owner",
      ledger_snapshot: snapshot,
      formal_input_manifest_sha256: "1".repeat(64), formal_spec_sha256: "2".repeat(64),
      resource_manifest_sha256: "3".repeat(64), schedule_sha256: "4".repeat(64),
      code_revision: "5".repeat(40), build_artifact_sha256: "6".repeat(64),
      case_count: 1, event_count: 30, request_count: 12,
    }, { key_id: "formal-key-1", private_key: trusted.privateKey });
    await expect(registryStore.loadPinnedLedgerRegistry(registry.registry_sha256, new Map([["attacker", attacker.publicKey]])))
      .rejects.toThrow("trusted key");

    const registryFile = join(fixture.data, "board2skill/formal-oracle/registries", registry.registry_sha256, "registry.json");
    const hardlinkPath = `${registryFile}.hardlink`;
    await link(registryFile, hardlinkPath);
    await expect(registryStore.loadPinnedLedgerRegistry(registry.registry_sha256, new Map([["formal-key-1", trusted.publicKey]])))
      .rejects.toThrow("非链接普通文件");
    await unlink(hardlinkPath);

    const originalRegistryText = await readFile(registryFile, "utf8");
    const nonCanonical = structuredClone(registry) as OracleGateLedgerRegistryV1;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const finalDataIndex = nonCanonical.signature_base64.length - 3;
    const canonicalIndex = alphabet.indexOf(nonCanonical.signature_base64[finalDataIndex]);
    nonCanonical.signature_base64 = `${nonCanonical.signature_base64.slice(0, finalDataIndex)}${alphabet[canonicalIndex + 1]}==`;
    expect(Buffer.from(nonCanonical.signature_base64, "base64")).toEqual(Buffer.from(registry.signature_base64, "base64"));
    await writeFile(registryFile, `${canonicalOracleGateLedgerRegistryDocument(nonCanonical)}\n`, { mode: 0o600 });
    await expect(registryStore.loadPinnedLedgerRegistry(registry.registry_sha256, new Map([["formal-key-1", trusted.publicKey]])))
      .rejects.toThrow("signature");
    await writeFile(registryFile, originalRegistryText, { mode: 0o600 });

    const manifestPath = join(fixture.root, "research/board2skill/oracle_pilot_clips.json");
    await writeFile(manifestPath, `${await readFile(manifestPath, "utf8")} `);
    let driftCallbackCalled = false;
    await expect(withLedgerAttestedOracleRegistry({
      attestor: fixture.attestor,
      registryStore,
      pinned_registry_sha256: registry.registry_sha256,
      trusted_public_keys: new Map([["formal-key-1", trusted.publicKey]]),
      callback: async () => { driftCallbackCalled = true; return "should-not-run"; },
    })).rejects.toThrow("漂移");
    expect(driftCallbackCalled).toBe(false);

    await registryStore.revokeRegistry({
      registry_sha256: registry.registry_sha256,
      reason: "冻结输入已由负责人显式撤销。",
      revoked_at: "2026-08-12T06:10:00.000Z",
    }, { key_id: "formal-key-1", private_key: trusted.privateKey });
    await expect(registryStore.loadPinnedLedgerRegistry(registry.registry_sha256, new Map([["formal-key-1", trusted.publicKey]])))
      .rejects.toThrow("已撤销");

    const revocationDirectory = join(registryStore.revocationRoot, registry.registry_sha256);
    const savedRevocationDirectory = `${revocationDirectory}.saved`;
    const emptyDirectory = join(fixture.data, "empty-revocations");
    await mkdir(emptyDirectory, { mode: 0o700 });
    await rename(revocationDirectory, savedRevocationDirectory);
    await symlink(emptyDirectory, revocationDirectory);
    await expect(registryStore.loadPinnedLedgerRegistry(registry.registry_sha256, new Map([["formal-key-1", trusted.publicKey]])))
      .rejects.toThrow("符号链接");
    await unlink(revocationDirectory);
    await rename(savedRevocationDirectory, revocationDirectory);

    await chmod(registryFile, 0o644);
    await expect(registryStore.loadPinnedLedgerRegistry(registry.registry_sha256, new Map([["formal-key-1", trusted.publicKey]])))
      .rejects.toThrow("权限过宽");
  });

  it("serializes snapshots against mutations across separate store instances", async () => {
    const fixture = await signedStoreFixture();
    const second = new GoldReviewStore(fixture.root, fixture.data);
    let active = 0;
    let maxActive = 0;
    const critical = async (): Promise<void> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolveWait) => setTimeout(resolveWait, 60));
      active -= 1;
    };
    await Promise.all([
      fixture.store.withLedgerSnapshot(critical),
      second.withLedgerSnapshot(critical),
    ]);
    expect(maxActive).toBe(1);
  });

  it("fails closed instead of repairing a pre-existing wide private registry root", async () => {
    const fixture = await signedStoreFixture();
    const { privateKey } = generateKeyPairSync("ed25519");
    const registryStore = new FrozenOracleRegistryStore(fixture.data);
    const snapshot = await fixture.attestor.withCurrentSnapshot(fixture.datasetSha256, async (context) => context.snapshot);
    await mkdir(registryStore.privateRoot, { recursive: true, mode: 0o755 });
    await chmod(registryStore.privateRoot, 0o755);
    await expect(registryStore.freezeLedgerRegistry({
      sequence: 1,
      frozen_at: "2026-08-12T06:00:00.000Z",
      created_by: "formal-oracle-owner",
      ledger_snapshot: snapshot,
      formal_input_manifest_sha256: "1".repeat(64), formal_spec_sha256: "2".repeat(64),
      resource_manifest_sha256: "3".repeat(64), schedule_sha256: "4".repeat(64),
      code_revision: "5".repeat(40), build_artifact_sha256: "6".repeat(64),
      case_count: 1, event_count: 30, request_count: 12,
    }, { key_id: "formal-key-1", private_key: privateKey })).rejects.toThrow("权限或类型无效");
  });

  it("rejects non-Ed25519 signer and trusted-key algorithm confusion", async () => {
    const fixture = await signedStoreFixture();
    const registryStore = new FrozenOracleRegistryStore(fixture.data);
    const snapshot = await fixture.attestor.withCurrentSnapshot(fixture.datasetSha256, async (context) => context.snapshot);
    const registryInput = {
      sequence: 1,
      frozen_at: "2026-08-12T06:00:00.000Z",
      created_by: "formal-oracle-owner",
      ledger_snapshot: snapshot,
      formal_input_manifest_sha256: "1".repeat(64), formal_spec_sha256: "2".repeat(64),
      resource_manifest_sha256: "3".repeat(64), schedule_sha256: "4".repeat(64),
      code_revision: "5".repeat(40), build_artifact_sha256: "6".repeat(64),
      case_count: 1, event_count: 30, request_count: 12,
    };
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await expect(registryStore.freezeLedgerRegistry(registryInput, { key_id: "formal-key-1", private_key: rsa.privateKey }))
      .rejects.toThrow("Ed25519");
    const ed25519 = generateKeyPairSync("ed25519");
    const registry = await registryStore.freezeLedgerRegistry(registryInput, { key_id: "formal-key-1", private_key: ed25519.privateKey });
    await expect(registryStore.loadPinnedLedgerRegistry(registry.registry_sha256, new Map([["formal-key-1", rsa.publicKey]])))
      .rejects.toThrow("Ed25519");
  });

  it("rejects a board2skill ancestor symlink before writing outside dataDir", async () => {
    const fixture = await signedStoreFixture();
    const { privateKey } = generateKeyPairSync("ed25519");
    const snapshot = await fixture.attestor.withCurrentSnapshot(fixture.datasetSha256, async (context) => context.snapshot);
    const outside = await mkdtemp(join(tmpdir(), "trusted-gold-outside-"));
    created.push(outside);
    const boardRoot = join(fixture.data, "board2skill");
    await rm(boardRoot, { recursive: true, force: true });
    await symlink(outside, boardRoot);
    const registryStore = new FrozenOracleRegistryStore(fixture.data);
    await expect(registryStore.freezeLedgerRegistry({
      sequence: 1,
      frozen_at: "2026-08-12T06:00:00.000Z",
      created_by: "formal-oracle-owner",
      ledger_snapshot: snapshot,
      formal_input_manifest_sha256: "1".repeat(64), formal_spec_sha256: "2".repeat(64),
      resource_manifest_sha256: "3".repeat(64), schedule_sha256: "4".repeat(64),
      code_revision: "5".repeat(40), build_artifact_sha256: "6".repeat(64),
      case_count: 1, event_count: 30, request_count: 12,
    }, { key_id: "formal-key-1", private_key: privateKey })).rejects.toThrow("祖先不得是符号链接");
    await expect(fixture.store.withLedgerSnapshot(async () => undefined)).rejects.toThrow("祖先不得是符号链接");
  });

  it("keeps revocation serialized until a borrowed capability callback finishes", async () => {
    const fixture = await signedStoreFixture();
    const trusted = generateKeyPairSync("ed25519");
    const registryStore = new FrozenOracleRegistryStore(fixture.data);
    const snapshot = await fixture.attestor.withCurrentSnapshot(fixture.datasetSha256, async (context) => context.snapshot);
    const registry = await registryStore.freezeLedgerRegistry({
      sequence: 1,
      frozen_at: "2026-08-12T06:00:00.000Z",
      created_by: "formal-oracle-owner",
      ledger_snapshot: snapshot,
      formal_input_manifest_sha256: "1".repeat(64), formal_spec_sha256: "2".repeat(64),
      resource_manifest_sha256: "3".repeat(64), schedule_sha256: "4".repeat(64),
      code_revision: "5".repeat(40), build_artifact_sha256: "6".repeat(64),
      case_count: 1, event_count: 30, request_count: 12,
    }, { key_id: "formal-key-1", private_key: trusted.privateKey });
    let releaseCallback!: () => void;
    let callbackStarted!: () => void;
    const started = new Promise<void>((resolveStarted) => { callbackStarted = resolveStarted; });
    const release = new Promise<void>((resolveRelease) => { releaseCallback = resolveRelease; });
    const use = withLedgerAttestedOracleRegistry({
      attestor: fixture.attestor,
      registryStore,
      pinned_registry_sha256: registry.registry_sha256,
      trusted_public_keys: new Map([["formal-key-1", trusted.publicKey]]),
      callback: async () => { callbackStarted(); await release; return "used"; },
    });
    await started;
    let revocationFinished = false;
    const secondStore = new FrozenOracleRegistryStore(fixture.data);
    const revoke = secondStore.revokeRegistry({
      registry_sha256: registry.registry_sha256,
      reason: "冻结输入已由负责人显式撤销。",
      revoked_at: "2026-08-12T06:10:00.000Z",
    }, { key_id: "formal-key-1", private_key: trusted.privateKey }).then(() => { revocationFinished = true; });
    await new Promise((resolveWait) => setTimeout(resolveWait, 60));
    expect(revocationFinished).toBe(false);
    releaseCallback();
    await expect(use).resolves.toBe("used");
    await revoke;
    await expect(registryStore.loadPinnedLedgerRegistry(registry.registry_sha256, new Map([["formal-key-1", trusted.publicKey]])))
      .rejects.toThrow("已撤销");
  });

  it("rejects wide nested decision directories from the trusted snapshot", async () => {
    const fixture = await signedStoreFixture();
    await chmod(join(fixture.store.decisionRoot, "package-1", "G01"), 0o755);
    await expect(fixture.attestor.withCurrentSnapshot(fixture.datasetSha256, async () => undefined))
      .rejects.toThrow("子目录权限");
  });
});
