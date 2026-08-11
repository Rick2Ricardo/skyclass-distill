import { createHash, createPrivateKey, createPublicKey, KeyObject, randomUUID, sign, verify, type KeyLike } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type {
  GoldLedgerSnapshotV1,
  OracleGateLedgerRegistryV1,
  OracleGateRegistryRevocationV1,
} from "../../contracts/src/index.js";
import {
  GOLD_LEDGER_SNAPSHOT_DOMAIN,
  ORACLE_LEDGER_REGISTRY_DOMAIN,
  ORACLE_REGISTRY_REVOCATION_DOMAIN,
  canonicalGoldLedgerSnapshotPayload,
  canonicalOracleGateLedgerRegistryDocument,
  canonicalOracleGateLedgerRegistryPayload,
  canonicalOracleGateRegistryRevocationDocument,
  canonicalOracleGateRegistryRevocationPayload,
  validateGoldLedgerSnapshot,
  validateOracleGateLedgerRegistry,
  validateOracleGateRegistryRevocation,
} from "../../contracts/src/index.js";

export interface OracleRegistrySigner {
  key_id: string;
  private_key: KeyLike;
}

export interface FreezeLedgerRegistryInput {
  sequence: number;
  frozen_at: string;
  created_by: string;
  ledger_snapshot: GoldLedgerSnapshotV1;
  formal_input_manifest_sha256: string;
  formal_spec_sha256: string;
  resource_manifest_sha256: string;
  schedule_sha256: string;
  code_revision: string;
  build_artifact_sha256: string;
  case_count: number;
  event_count: number;
  request_count: number;
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function inside(root: string, candidate: string): boolean {
  const value = relative(resolve(root), resolve(candidate));
  return value === "" || (!value.startsWith("..") && !value.startsWith("/") && !value.startsWith("\\"));
}

function assertSha(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} 必须是 SHA-256`);
}

function ed25519PrivateKey(value: KeyLike): KeyObject {
  const key = value instanceof KeyObject ? value : createPrivateKey(value);
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") throw new Error("Formal Oracle signer 必须使用 Ed25519 私钥");
  return key;
}

function ed25519PublicKey(value: KeyLike): KeyObject {
  const key = value instanceof KeyObject ? value : createPublicKey(value);
  if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") throw new Error("Formal Oracle trusted key 必须是 Ed25519 公钥");
  return key;
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

export class FrozenOracleRegistryStore {
  readonly privateRoot: string;
  readonly registryRoot: string;
  readonly revocationRoot: string;
  private registryLock = Promise.resolve();

  constructor(readonly dataDir: string) {
    this.privateRoot = join(dataDir, "board2skill", "formal-oracle");
    this.registryRoot = join(this.privateRoot, "registries");
    this.revocationRoot = join(this.privateRoot, "revocations");
  }

  private async assertDataRootChain(path: string, allowMissing: boolean): Promise<void> {
    const dataRoot = resolve(this.dataDir);
    const target = resolve(path);
    if (!inside(dataRoot, target)) throw new Error("Formal Oracle 私有路径超出 data root");
    const rootInfo = await lstat(dataRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("Formal Oracle data root 必须是非符号链接目录");
    if (typeof process.getuid === "function" && rootInfo.uid !== process.getuid()) throw new Error("Formal Oracle data root owner 无效");
    let current = dataRoot;
    for (const part of relative(dataRoot, target).split(/[\\/]/).filter(Boolean)) {
      current = join(current, part);
      const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
        if (allowMissing && error.code === "ENOENT") return null;
        throw error;
      });
      if (!info) break;
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Formal Oracle 私有路径祖先不得是符号链接或非目录");
      if (typeof process.getuid === "function" && info.uid !== process.getuid()) throw new Error("Formal Oracle 私有路径祖先 owner 无效");
    }
    if (!allowMissing) {
      const dataRootReal = await realpath(dataRoot);
      const targetReal = await realpath(target);
      if (!inside(dataRootReal, targetReal)) throw new Error("Formal Oracle 私有路径真实位置超出 data root");
    }
  }

  private async ensurePrivateDirectory(path: string): Promise<void> {
    await this.assertDataRootChain(path, true);
    await mkdir(path, { recursive: true, mode: 0o700 });
    await this.assertDataRootChain(path, false);
    await this.assertPrivateDirectory(path, "Formal Oracle 私有目录");
  }

  private async assertPrivateDirectory(path: string, label: string): Promise<void> {
    await this.assertDataRootChain(path, false);
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new Error("Formal Oracle 私有目录权限或类型无效");
    if (typeof process.getuid === "function" && info.uid !== process.getuid()) throw new Error(`${label} owner 无效`);
  }

  private async withRegistryLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.registryLock;
    let release!: () => void;
    this.registryLock = new Promise<void>((resolveLock) => { release = resolveLock; });
    await previous;
    try {
      await this.ensurePrivateDirectory(this.privateRoot);
      const lockPath = join(this.privateRoot, ".registry.lock");
      const deadline = Date.now() + 10_000;
      let handle: Awaited<ReturnType<typeof open>> | null = null;
      while (!handle) {
        try {
          handle = await open(lockPath, "wx", 0o600);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          if (Date.now() >= deadline) throw new Error("Formal Oracle registry 全局锁被占用；拒绝自动偷取或覆盖 stale lock");
          await new Promise((resolveWait) => setTimeout(resolveWait, 20));
        }
      }
      const lockBytes = `${JSON.stringify({ pid: process.pid, owner_nonce: randomUUID(), acquired_at: new Date().toISOString() })}\n`;
      try {
        await handle.writeFile(lockBytes, "utf8");
        await handle.sync();
        return await operation();
      } finally {
        await handle.close();
        const current = await readFile(lockPath, "utf8").catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") throw new Error("Formal Oracle registry 全局锁在持有期间被删除");
          throw error;
        });
        if (current !== lockBytes) throw new Error("Formal Oracle registry 全局锁 owner nonce 不匹配，拒绝释放他人锁");
        await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    } finally {
      release();
    }
  }

  private async writeImmutableDirectory(target: string, fileName: string, bytes: Buffer): Promise<void> {
    await this.ensurePrivateDirectory(this.privateRoot);
    if (target.startsWith(this.registryRoot)) await this.ensurePrivateDirectory(this.registryRoot);
    if (target.startsWith(this.revocationRoot)) await this.ensurePrivateDirectory(this.revocationRoot);
    await this.ensurePrivateDirectory(dirname(target));
    const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const staging = join(dirname(target), `.tmp-${nonce}`);
    await mkdir(staging, { mode: 0o700 });
    const stagingFile = join(staging, fileName);
    try {
      const handle = await open(stagingFile, "wx", 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      await syncDirectory(staging);
      try {
        await rename(staging, target);
        await syncDirectory(dirname(target));
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY"].includes(String((error as NodeJS.ErrnoException).code))) throw error;
        const targetInfo = await lstat(target);
        if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink() || (targetInfo.mode & 0o077) !== 0) throw new Error("Formal Oracle 内容地址目标不是受控私有目录");
        if (typeof process.getuid === "function" && targetInfo.uid !== process.getuid()) throw new Error("Formal Oracle 内容地址目标 owner 无效");
        const existing = await this.readPrivateCanonicalFile(join(target, fileName));
        if (!existing.equals(bytes)) throw new Error("已存在的 Formal Oracle 内容地址与冻结字节不一致");
      }
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  async freezeLedgerRegistry(input: FreezeLedgerRegistryInput, signer: OracleRegistrySigner): Promise<OracleGateLedgerRegistryV1> {
    if (!/^[a-z0-9][a-z0-9._-]{1,127}$/.test(signer.key_id)) throw new Error("registry signer key_id 无效");
    const snapshotReport = validateGoldLedgerSnapshot(input.ledger_snapshot);
    if (!snapshotReport.valid) throw new Error(`Gold ledger snapshot 无效：${snapshotReport.issues[0]?.path} ${snapshotReport.issues[0]?.message}`);
    const snapshotHash = digest(`${GOLD_LEDGER_SNAPSHOT_DOMAIN}${canonicalGoldLedgerSnapshotPayload(input.ledger_snapshot)}`);
    if (snapshotHash !== input.ledger_snapshot.snapshot_sha256) throw new Error("Gold ledger snapshot 内容哈希不匹配");
    for (const [label, value] of Object.entries({
      formal_input_manifest_sha256: input.formal_input_manifest_sha256,
      formal_spec_sha256: input.formal_spec_sha256,
      resource_manifest_sha256: input.resource_manifest_sha256,
      schedule_sha256: input.schedule_sha256,
      build_artifact_sha256: input.build_artifact_sha256,
    })) assertSha(value, label);
    const privateKey = ed25519PrivateKey(signer.private_key);
    const registry: OracleGateLedgerRegistryV1 = {
      schema_version: "oracle-gate-ledger-registry-v1",
      registry_id: "oracle-ledger-registry-0000000000000000",
      registry_sha256: "0".repeat(64),
      status: "frozen_ledger_attestation",
      sequence: input.sequence,
      frozen_at: input.frozen_at,
      created_by: input.created_by,
      ledger_snapshot: input.ledger_snapshot,
      formal_input_manifest_sha256: input.formal_input_manifest_sha256,
      formal_spec_sha256: input.formal_spec_sha256,
      resource_manifest_sha256: input.resource_manifest_sha256,
      schedule_sha256: input.schedule_sha256,
      code_revision: input.code_revision,
      build_artifact_sha256: input.build_artifact_sha256,
      case_count: input.case_count,
      event_count: input.event_count,
      request_count: input.request_count,
      gates: {
        ledger_attested: true,
        media_bytes_verified: false,
        speech_bytes_verified: false,
        run_store_verified: false,
        api_execution_allowed: false,
      },
      signer_key_id: signer.key_id,
      signature_algorithm: "ed25519",
      signature_base64: "AA==",
    };
    registry.registry_sha256 = digest(`${ORACLE_LEDGER_REGISTRY_DOMAIN}${canonicalOracleGateLedgerRegistryPayload(registry)}`);
    registry.registry_id = `oracle-ledger-registry-${registry.registry_sha256.slice(0, 16)}`;
    const signature = sign(null, Buffer.from(registry.registry_sha256, "hex"), privateKey);
    if (signature.byteLength !== 64) throw new Error("Formal Oracle Ed25519 签名长度无效");
    registry.signature_base64 = signature.toString("base64");
    const report = validateOracleGateLedgerRegistry(registry);
    if (!report.valid) throw new Error(`Formal Oracle registry 无效：${report.issues[0]?.path} ${report.issues[0]?.message}`);
    const bytes = Buffer.from(`${canonicalOracleGateLedgerRegistryDocument(registry)}\n`, "utf8");
    await this.writeImmutableDirectory(join(this.registryRoot, registry.registry_sha256), "registry.json", bytes);
    // Do not acquire the registry lock here: callers such as
    // freezeCurrentOracleLedgerRegistry already hold the Gold ledger lock, while
    // trusted consumption deliberately locks registry -> ledger. Taking the
    // registry lock here would invert that order and deadlock concurrent freeze/use.
    // The just-written content-addressed directory is immutable; later use still
    // performs the locked load + revocation check.
    return this.loadPinnedLedgerRegistryUnlocked(registry.registry_sha256, new Map([[signer.key_id, createPublicKey(privateKey)]]));
  }

  private async readPrivateCanonicalFile(path: string): Promise<Buffer> {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.nlink !== 1) throw new Error("Formal Oracle registry 必须是非链接普通文件");
      if ((before.mode & 0o077) !== 0) throw new Error("Formal Oracle registry 文件权限过宽");
      if (typeof process.getuid === "function" && before.uid !== process.getuid()) throw new Error("Formal Oracle registry 文件 owner 无效");
      const bytes = await handle.readFile();
      const after = await handle.stat();
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.byteLength !== after.size) {
        throw new Error("Formal Oracle registry 在读取期间发生变化");
      }
      return bytes;
    } finally {
      await handle.close();
    }
  }

  async loadPinnedLedgerRegistry(
    pinnedRegistrySha256: string,
    trustedPublicKeys: ReadonlyMap<string, KeyLike>,
  ): Promise<OracleGateLedgerRegistryV1> {
    return this.withRegistryLock(() => this.loadPinnedLedgerRegistryUnlocked(pinnedRegistrySha256, trustedPublicKeys));
  }

  async withPinnedLedgerRegistry<T>(
    pinnedRegistrySha256: string,
    trustedPublicKeys: ReadonlyMap<string, KeyLike>,
    callback: (registry: OracleGateLedgerRegistryV1) => Promise<T>,
  ): Promise<T> {
    return this.withRegistryLock(async () => callback(await this.loadPinnedLedgerRegistryUnlocked(pinnedRegistrySha256, trustedPublicKeys)));
  }

  private async loadPinnedLedgerRegistryUnlocked(
    pinnedRegistrySha256: string,
    trustedPublicKeys: ReadonlyMap<string, KeyLike>,
  ): Promise<OracleGateLedgerRegistryV1> {
    assertSha(pinnedRegistrySha256, "pinnedRegistrySha256");
    await this.assertPrivateDirectory(this.privateRoot, "Formal Oracle private root");
    await this.assertPrivateDirectory(this.registryRoot, "Formal Oracle registry root");
    const registryRoot = await realpath(this.registryRoot).catch(() => { throw new Error("Formal Oracle registry root 不存在"); });
    const directory = join(this.registryRoot, pinnedRegistrySha256);
    await this.assertPrivateDirectory(directory, "Pinned Formal Oracle registry 目录");
    const directoryReal = await realpath(directory).catch(() => { throw new Error("Pinned Formal Oracle registry 不存在"); });
    if (!inside(registryRoot, directoryReal)) throw new Error("Pinned Formal Oracle registry 路径越界");
    const bytes = await this.readPrivateCanonicalFile(join(directoryReal, "registry.json"));
    const text = bytes.toString("utf8");
    const registry = JSON.parse(text) as OracleGateLedgerRegistryV1;
    if (`${canonicalOracleGateLedgerRegistryDocument(registry)}\n` !== text) throw new Error("Formal Oracle registry 不是 canonical JSON 字节");
    const report = validateOracleGateLedgerRegistry(registry);
    if (!report.valid) throw new Error(`Formal Oracle registry 无效：${report.issues[0]?.path} ${report.issues[0]?.message}`);
    const snapshotHash = digest(`${GOLD_LEDGER_SNAPSHOT_DOMAIN}${canonicalGoldLedgerSnapshotPayload(registry.ledger_snapshot)}`);
    if (snapshotHash !== registry.ledger_snapshot.snapshot_sha256) throw new Error("Formal Oracle registry 内 Gold snapshot 哈希无效");
    const actualHash = digest(`${ORACLE_LEDGER_REGISTRY_DOMAIN}${canonicalOracleGateLedgerRegistryPayload(registry)}`);
    if (actualHash !== pinnedRegistrySha256 || registry.registry_sha256 !== pinnedRegistrySha256
      || registry.registry_id !== `oracle-ledger-registry-${pinnedRegistrySha256.slice(0, 16)}`) throw new Error("Formal Oracle registry 内容地址不匹配");
    const trustedKey = trustedPublicKeys.get(registry.signer_key_id);
    if (!trustedKey) throw new Error("Formal Oracle registry signer 不在外部 trusted key 集合");
    const publicKey = ed25519PublicKey(trustedKey);
    const signature = Buffer.from(registry.signature_base64, "base64");
    if (signature.byteLength !== 64 || !verify(null, Buffer.from(registry.registry_sha256, "hex"), publicKey, signature)) {
      throw new Error("Formal Oracle registry Ed25519 签名无效");
    }
    await this.assertNotRevoked(registry.registry_sha256, trustedPublicKeys);
    return registry;
  }

  async revokeRegistry(input: {
    registry_sha256: string;
    reason: string;
    revoked_at: string;
  }, signer: OracleRegistrySigner): Promise<OracleGateRegistryRevocationV1> {
    return this.withRegistryLock(() => this.revokeRegistryUnlocked(input, signer));
  }

  private async revokeRegistryUnlocked(input: {
    registry_sha256: string;
    reason: string;
    revoked_at: string;
  }, signer: OracleRegistrySigner): Promise<OracleGateRegistryRevocationV1> {
    assertSha(input.registry_sha256, "registry_sha256");
    const revocation: OracleGateRegistryRevocationV1 = {
      schema_version: "oracle-gate-registry-revocation-v1",
      revocation_sha256: "0".repeat(64),
      registry_sha256: input.registry_sha256,
      reason: input.reason,
      revoked_at: input.revoked_at,
      signer_key_id: signer.key_id,
      signature_algorithm: "ed25519",
      signature_base64: "AA==",
    };
    const privateKey = ed25519PrivateKey(signer.private_key);
    revocation.revocation_sha256 = digest(`${ORACLE_REGISTRY_REVOCATION_DOMAIN}${canonicalOracleGateRegistryRevocationPayload(revocation)}`);
    const signature = sign(null, Buffer.from(revocation.revocation_sha256, "hex"), privateKey);
    if (signature.byteLength !== 64) throw new Error("Formal Oracle revocation Ed25519 签名长度无效");
    revocation.signature_base64 = signature.toString("base64");
    const report = validateOracleGateRegistryRevocation(revocation);
    if (!report.valid) throw new Error(`Formal Oracle registry revocation 无效：${report.issues[0]?.path} ${report.issues[0]?.message}`);
    const bytes = Buffer.from(`${canonicalOracleGateRegistryRevocationDocument(revocation)}\n`, "utf8");
    await this.writeImmutableDirectory(join(this.revocationRoot, input.registry_sha256, revocation.revocation_sha256), "revocation.json", bytes);
    return revocation;
  }

  private async assertNotRevoked(registrySha256: string, trustedPublicKeys: ReadonlyMap<string, KeyLike>): Promise<void> {
    const revocationRootExists = await lstat(this.revocationRoot).then(() => true).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
    if (!revocationRootExists) return;
    await this.assertPrivateDirectory(this.privateRoot, "Formal Oracle private root");
    await this.assertPrivateDirectory(this.revocationRoot, "Formal Oracle revocation root");
    const revocationRootReal = await realpath(this.revocationRoot);
    const directory = join(this.revocationRoot, registrySha256);
    const directoryExists = await lstat(directory).then(() => true).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
    if (!directoryExists) return;
    await this.assertPrivateDirectory(directory, "Formal Oracle registry revocation 目录");
    const directoryReal = await realpath(directory);
    if (!inside(revocationRootReal, directoryReal)) throw new Error("Formal Oracle revocation 路径越界");
    const names = await readdir(directoryReal);
    for (const name of names.sort()) {
      if (!/^[a-f0-9]{64}$/.test(name)) throw new Error("Formal Oracle revocation 目录包含未注册条目");
      const recordDirectory = join(directory, name);
      await this.assertPrivateDirectory(recordDirectory, "Formal Oracle revocation 记录目录");
      const recordDirectoryReal = await realpath(recordDirectory);
      if (!inside(directoryReal, recordDirectoryReal)) throw new Error("Formal Oracle revocation 记录路径越界");
      const path = join(recordDirectoryReal, "revocation.json");
      const bytes = await this.readPrivateCanonicalFile(path);
      const text = bytes.toString("utf8");
      const revocation = JSON.parse(text) as OracleGateRegistryRevocationV1;
      if (`${canonicalOracleGateRegistryRevocationDocument(revocation)}\n` !== text) throw new Error("Formal Oracle revocation 不是 canonical JSON 字节");
      const report = validateOracleGateRegistryRevocation(revocation);
      if (!report.valid) throw new Error("Formal Oracle revocation 结构无效");
      const actualHash = digest(`${ORACLE_REGISTRY_REVOCATION_DOMAIN}${canonicalOracleGateRegistryRevocationPayload(revocation)}`);
      if (actualHash !== name || revocation.revocation_sha256 !== name || revocation.registry_sha256 !== registrySha256) throw new Error("Formal Oracle revocation 内容地址不匹配");
      const trustedKey = trustedPublicKeys.get(revocation.signer_key_id);
      if (!trustedKey) throw new Error("Formal Oracle revocation signer 不在外部 trusted key 集合");
      const publicKey = ed25519PublicKey(trustedKey);
      const signature = Buffer.from(revocation.signature_base64, "base64");
      if (signature.byteLength !== 64 || !verify(null, Buffer.from(actualHash, "hex"), publicKey, signature)) {
        throw new Error("Formal Oracle revocation 签名无效");
      }
      throw new Error(`Formal Oracle registry 已撤销：${revocation.reason}`);
    }
  }
}
