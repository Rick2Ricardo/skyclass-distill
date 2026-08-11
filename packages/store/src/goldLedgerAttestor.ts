import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type {
  GoldLedgerEntryKind,
  GoldLedgerSnapshotEntry,
  GoldLedgerSnapshotV1,
  GoldReviewQueue,
  SignedGoldDataset,
} from "../../contracts/src/index.js";
import { GOLD_LEDGER_SNAPSHOT_DOMAIN, canonicalGoldLedgerSnapshotPayload } from "../../contracts/src/index.js";
import { GoldReviewStore } from "./goldReviewStore.js";
import { buildSignedGoldDataset } from "./signedGoldCompiler.js";

const QUEUE_DOMAIN = "skyclass/formal-oracle/gold-review-queue/v1\0";
const LEDGER_TREE_DOMAIN = "skyclass/formal-oracle/gold-ledger-tree/v1\0";

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return "null";
}

function inside(root: string, candidate: string): boolean {
  const value = relative(resolve(root), resolve(candidate));
  return value === "" || (!value.startsWith("..") && !value.startsWith("/") && !value.startsWith("\\"));
}

function safeRelative(root: string, path: string, label: string): string {
  const value = relative(resolve(root), resolve(path)).split("\\").join("/");
  if (!value || value.startsWith("../") || value === ".." || value.startsWith("/")) throw new Error(`${label} 不在受控根目录内`);
  return value;
}

async function readFrozenFile(input: {
  root: string;
  path: string;
  storage: "repository" | "data";
  kind: GoldLedgerEntryKind;
  requirePrivate: boolean;
  requireCanonicalJson: boolean;
}): Promise<{ entry: GoldLedgerSnapshotEntry; bytes: Buffer }> {
  const rootLexical = resolve(input.root);
  const rootReal = await realpath(input.root);
  const candidate = resolve(input.path);
  if (!inside(rootLexical, candidate) && !inside(rootReal, candidate)) throw new Error(`${input.kind} 路径越界`);
  const resolved = await realpath(candidate).catch(() => { throw new Error(`${input.kind} 文件不存在`); });
  if (!inside(rootReal, resolved)) throw new Error(`${input.kind} 真实路径越界`);
  const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error(`${input.kind} 必须是普通文件`);
    if (before.nlink !== 1) throw new Error(`${input.kind} 不允许 hardlink`);
    if (input.requirePrivate && (before.mode & 0o077) !== 0) throw new Error(`${input.kind} 权限不得向 group/other 开放`);
    if (typeof process.getuid === "function" && before.uid !== process.getuid()) throw new Error(`${input.kind} owner 与服务进程不一致`);
    if (before.size < 1 || before.size > 64 * 1024 * 1024) throw new Error(`${input.kind} 文件大小无效`);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.byteLength !== after.size) {
      throw new Error(`${input.kind} 在快照读取期间发生变化`);
    }
    if (input.requireCanonicalJson) {
      const text = bytes.toString("utf8");
      const value = JSON.parse(text) as unknown;
      if (`${JSON.stringify(value, null, 2)}\n` !== text) throw new Error(`${input.kind} 必须使用冻结的 canonical pretty JSON 字节`);
    }
    return {
      bytes,
      entry: {
        storage: input.storage,
        kind: input.kind,
        uri: safeRelative(rootReal, resolved, input.kind),
        sha256: digest(bytes),
        byte_length: bytes.byteLength,
      },
    };
  } finally {
    await handle.close();
  }
}

async function listLedgerJson(directory: string): Promise<string[]> {
  const info = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return [];
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Gold 账本根必须是非符号链接目录");
  if ((info.mode & 0o077) !== 0) throw new Error("Gold 账本根权限不得向 group/other 开放");
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) throw new Error("Gold 账本根 owner 与服务进程不一致");
  const root = await realpath(directory);
  const output: string[] = [];
  const walk = async (current: string): Promise<void> => {
    if (!inside(root, current)) throw new Error("Gold 账本目录越界");
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const path = resolve(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Gold 账本目录不得包含符号链接");
      if (entry.isDirectory()) {
        const child = await lstat(path);
        if ((child.mode & 0o077) !== 0 || (typeof process.getuid === "function" && child.uid !== process.getuid())) throw new Error("Gold 账本子目录权限或 owner 无效");
        await walk(path);
      }
      else if (entry.isFile() && entry.name.endsWith(".json")) output.push(path);
      else throw new Error(`Gold 账本包含未注册条目：${entry.name}`);
    }
  };
  await walk(root);
  return output;
}

export interface CurrentGoldLedgerContext {
  snapshot: GoldLedgerSnapshotV1;
  dataset: SignedGoldDataset;
  queue: GoldReviewQueue;
}

export class GoldLedgerAttestor {
  constructor(readonly store: GoldReviewStore) {}

  /** Holds the cross-process ledger lock through the callback to prevent TOCTOU. */
  async withCurrentSnapshot<T>(
    expectedDatasetSha256: string,
    callback: (context: CurrentGoldLedgerContext) => Promise<T>,
  ): Promise<T> {
    if (!/^[a-f0-9]{64}$/.test(expectedDatasetSha256)) throw new Error("expectedDatasetSha256 格式无效");
    return this.store.withLedgerSnapshot(async () => {
      const queue = await this.store.queue();
      const dataset = await buildSignedGoldDataset(this.store.root, queue);
      if (dataset.dataset_sha256 !== expectedDatasetSha256) throw new Error("当前 GoldReviewStore 重编译数据集与 pinned registry 不一致");

      const entries: GoldLedgerSnapshotEntry[] = [];
      const manifest = await readFrozenFile({
        root: this.store.root,
        path: resolve(this.store.root, this.store.manifestPath),
        storage: "repository",
        kind: "gold_manifest",
        requirePrivate: false,
        requireCanonicalJson: false,
      });
      entries.push(manifest.entry);

      for (const reviewPackage of [...queue.packages].sort((left, right) => left.intake_path.localeCompare(right.intake_path, "en"))) {
        const intake = await readFrozenFile({
          root: this.store.root,
          path: resolve(this.store.root, reviewPackage.intake_path),
          storage: "repository",
          kind: "adjudication_intake",
          requirePrivate: false,
          requireCanonicalJson: false,
        });
        if (intake.entry.sha256 !== reviewPackage.intake_sha256) throw new Error(`仲裁输入 SHA 与当前队列不一致：${reviewPackage.package_id}`);
        entries.push(intake.entry);
      }

      for (const path of await listLedgerJson(this.store.decisionRoot)) {
        entries.push((await readFrozenFile({
          root: this.store.dataDir,
          path,
          storage: "data",
          kind: "decision_revision",
          requirePrivate: true,
          requireCanonicalJson: true,
        })).entry);
      }
      for (const path of await listLedgerJson(this.store.signoffRoot)) {
        entries.push((await readFrozenFile({
          root: this.store.dataDir,
          path,
          storage: "data",
          kind: "package_signoff",
          requirePrivate: true,
          requireCanonicalJson: true,
        })).entry);
      }
      entries.sort((left, right) => `${left.storage}:${left.uri}`.localeCompare(`${right.storage}:${right.uri}`, "en"));
      const draft: GoldLedgerSnapshotV1 = {
        schema_version: "gold-ledger-snapshot-v1",
        snapshot_sha256: "0".repeat(64),
        dataset_sha256: dataset.dataset_sha256,
        queue_sha256: digest(`${QUEUE_DOMAIN}${stableJson(queue)}`),
        gold_manifest_sha256: manifest.entry.sha256,
        ledger_tree_sha256: digest(`${LEDGER_TREE_DOMAIN}${stableJson(entries)}`),
        package_count: queue.summary.package_count,
        reviewed_group_count: queue.summary.group_count,
        accepted_event_count: queue.summary.accepted_event_count,
        entries,
      };
      draft.snapshot_sha256 = digest(`${GOLD_LEDGER_SNAPSHOT_DOMAIN}${canonicalGoldLedgerSnapshotPayload(draft)}`);
      return callback({ snapshot: draft, dataset, queue });
    });
  }
}
