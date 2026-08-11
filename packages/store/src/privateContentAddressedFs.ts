import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const SHA256 = /^[a-f0-9]{64}$/;

export interface PrivateContentAddressedFsOptions {
  lock_timeout_ms?: number;
  lock_poll_ms?: number;
}

function isOwnedByCurrentUser(uid: number): boolean {
  return typeof process.getuid !== "function" || uid === process.getuid();
}

function isInside(root: string, candidate: string): boolean {
  const value = relative(resolve(root), resolve(candidate));
  return value === "" || (!value.startsWith("..") && !value.startsWith("/") && !value.startsWith("\\"));
}

function assertSafeRelativePath(value: string, label: string): string[] {
  if (!value || value.includes("\\") || value.includes("\0") || value.startsWith("/")) {
    throw new Error(`${label} 必须是受控相对路径`);
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || !/^[A-Za-z0-9._-]+$/.test(part))) {
    throw new Error(`${label} 必须是受控相对路径`);
  }
  return parts;
}

function assertSafeFileName(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) throw new Error("私有文件名无效");
}

function canonicalJsonValue(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error("canonical JSON 数值无效");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length || !Object.keys(value).every((key, index) => key === String(index))) {
      throw new Error("canonical JSON 数组必须稠密且无额外属性");
    }
    if (seen.has(value)) throw new Error("canonical JSON 不得循环引用");
    seen.add(value);
    try { return `[${value.map((item) => canonicalJsonValue(item, seen)).join(",")}]`; }
    finally { seen.delete(value); }
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) throw new Error("canonical JSON 不得循环引用");
    seen.add(value);
    try {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonValue(record[key], seen)}`).join(",")}}`;
    } finally { seen.delete(value); }
  }
  throw new Error("值不能 canonical JSON 序列化");
}

export function privateCanonicalJsonBytes(value: unknown): Buffer {
  return Buffer.from(`${canonicalJsonValue(value)}\n`, "utf8");
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}

/**
 * Minimal filesystem substrate for a private content-addressed store.
 *
 * It deliberately exposes no stale-lock stealing and no directory enumeration API.
 * Callers must recover only through an authenticated mutable head.
 */
export class PrivateContentAddressedFs {
  readonly rootPath: string;
  private readonly lockTimeoutMs: number;
  private readonly lockPollMs: number;
  private readonly localLocks = new Map<string, Promise<void>>();

  constructor(
    readonly dataDir: string,
    readonly rootRelativePath: string,
    options: PrivateContentAddressedFsOptions = {},
  ) {
    assertSafeRelativePath(rootRelativePath, "private root");
    this.rootPath = join(resolve(dataDir), ...rootRelativePath.split("/"));
    this.lockTimeoutMs = options.lock_timeout_ms ?? 10_000;
    this.lockPollMs = options.lock_poll_ms ?? 20;
    if (!Number.isSafeInteger(this.lockTimeoutMs) || this.lockTimeoutMs < 1) throw new Error("lock_timeout_ms 必须是正安全整数");
    if (!Number.isSafeInteger(this.lockPollMs) || this.lockPollMs < 1) throw new Error("lock_poll_ms 必须是正安全整数");
  }

  absolutePath(relativePath: string): string {
    const parts = assertSafeRelativePath(relativePath, "private object path");
    const candidate = join(this.rootPath, ...parts);
    if (!isInside(this.rootPath, candidate)) throw new Error("私有对象路径越界");
    return candidate;
  }

  async initialize(): Promise<void> {
    const dataRoot = resolve(this.dataDir);
    const rootInfo = await lstat(dataRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || !isOwnedByCurrentUser(rootInfo.uid)) {
      throw new Error("私有 store data root 类型或 owner 无效");
    }
    let current = dataRoot;
    for (const part of assertSafeRelativePath(this.rootRelativePath, "private root")) {
      current = join(current, part);
      try {
        await mkdir(current, { mode: PRIVATE_DIRECTORY_MODE });
        await syncDirectory(dirname(current));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      await this.assertPrivateDirectoryAbsolute(current);
    }
    const dataReal = await realpath(dataRoot);
    const rootReal = await realpath(this.rootPath);
    if (!isInside(dataReal, rootReal)) throw new Error("私有 store 真实路径越界");
  }

  async ensureDirectory(relativePath: string): Promise<void> {
    await this.initialize();
    if (relativePath === "") return;
    let current = this.rootPath;
    for (const part of assertSafeRelativePath(relativePath, "private directory")) {
      current = join(current, part);
      try {
        await mkdir(current, { mode: PRIVATE_DIRECTORY_MODE });
        await syncDirectory(dirname(current));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      await this.assertPrivateDirectoryAbsolute(current);
    }
  }

  async assertPrivateDirectory(relativePath: string): Promise<void> {
    await this.initialize();
    const target = this.absolutePath(relativePath);
    await this.assertPrivateChain(target);
    await this.assertPrivateDirectoryAbsolute(target);
  }

  async readFile(relativePath: string): Promise<Buffer> {
    await this.initialize();
    const target = this.absolutePath(relativePath);
    await this.assertPrivateChain(dirname(target));
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      this.assertPrivateFileInfo(before, relativePath);
      const bytes = await handle.readFile();
      const after = await handle.stat();
      this.assertPrivateFileInfo(after, relativePath);
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs || bytes.byteLength !== after.size) {
        throw new Error("私有文件在读取期间发生变化");
      }
      return bytes;
    } finally {
      await handle.close();
    }
  }

  async readOptionalFile(relativePath: string): Promise<Buffer | null> {
    try { return await this.readFile(relativePath); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async publishImmutableObject(relativeDirectory: string, fileName: string, bytes: Uint8Array): Promise<void> {
    assertSafeFileName(fileName);
    const directoryParts = assertSafeRelativePath(relativeDirectory, "content-addressed directory");
    await this.ensureDirectory(directoryParts.slice(0, -1).join("/"));
    const target = this.absolutePath(relativeDirectory);
    const stagingName = `.tmp-${process.pid}-${randomUUID()}`;
    const staging = join(dirname(target), stagingName);
    await mkdir(staging, { mode: PRIVATE_DIRECTORY_MODE });
    await this.assertPrivateDirectoryAbsolute(staging);
    const stagingFile = join(staging, fileName);
    const frozen = Buffer.from(bytes);
    try {
      const handle = await open(
        stagingFile,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        PRIVATE_FILE_MODE,
      );
      try {
        await handle.chmod(PRIVATE_FILE_MODE);
        await handle.writeFile(frozen);
        await handle.sync();
      } finally { await handle.close(); }
      await syncDirectory(staging);
      try {
        await rename(staging, target);
        await syncDirectory(dirname(target));
      } catch (error) {
        if (!new Set(["EEXIST", "ENOTEMPTY"]).has(String((error as NodeJS.ErrnoException).code))) throw error;
        await this.assertPrivateDirectoryAbsolute(target);
        const existing = await this.readFile(`${relativeDirectory}/${fileName}`);
        if (!existing.equals(frozen)) throw new Error("内容地址已存在但冻结字节不一致");
      }
    } finally {
      await this.removeOwnedStagingDirectory(staging, fileName);
    }
  }

  async replaceFileAtomic(relativePath: string, bytes: Uint8Array): Promise<void> {
    const parts = assertSafeRelativePath(relativePath, "mutable private file");
    const parentRelative = parts.slice(0, -1).join("/");
    const fileName = parts.at(-1)!;
    assertSafeFileName(fileName);
    await this.ensureDirectory(parentRelative);
    const target = this.absolutePath(relativePath);
    const temporary = join(dirname(target), `.tmp-${fileName}-${process.pid}-${randomUUID()}`);
    const frozen = Buffer.from(bytes);
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      const existing = await this.readOptionalFile(relativePath);
      if (existing) await this.assertPrivateChain(dirname(target));
      handle = await open(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        PRIVATE_FILE_MODE,
      );
      await handle.chmod(PRIVATE_FILE_MODE);
      await handle.writeFile(frozen);
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporary, target);
      await syncDirectory(dirname(target));
      const committed = await this.readFile(relativePath);
      if (!committed.equals(frozen)) throw new Error("原子文件提交后的字节校验失败");
    } finally {
      if (handle) await handle.close().catch(() => undefined);
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  async withExclusiveLock<T>(relativePath: string, resourceId: string, operation: () => Promise<T>): Promise<T> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(resourceId)) throw new Error("lock resource_id 无效");
    const key = this.absolutePath(relativePath);
    const previous = this.localLocks.get(key) ?? Promise.resolve();
    let releaseLocal!: () => void;
    const current = new Promise<void>((resolveLock) => { releaseLocal = resolveLock; });
    const queued = previous.then(() => current);
    this.localLocks.set(key, queued);
    await previous;
    try {
      return await this.withFilesystemLock(relativePath, resourceId, operation);
    } finally {
      releaseLocal();
      if (this.localLocks.get(key) === queued) this.localLocks.delete(key);
    }
  }

  private async withFilesystemLock<T>(relativePath: string, resourceId: string, operation: () => Promise<T>): Promise<T> {
    const parts = assertSafeRelativePath(relativePath, "lock path");
    const parentRelative = parts.slice(0, -1).join("/");
    await this.ensureDirectory(parentRelative);
    const lockPath = this.absolutePath(relativePath);
    const ownerNonce = randomUUID();
    const lockBytes = privateCanonicalJsonBytes({
      acquired_at: new Date().toISOString(),
      owner_nonce: ownerNonce,
      pid: process.pid,
      resource_id: resourceId,
      schema_version: "private-content-addressed-lock-v1",
    });
    const deadline = Date.now() + this.lockTimeoutMs;
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    while (!handle) {
      try {
        handle = await open(
          lockPath,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
          PRIVATE_FILE_MODE,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline) throw new Error("私有 store lock 被占用；拒绝偷取、覆盖或自动清理 stale lock");
        await new Promise((resolveWait) => setTimeout(resolveWait, this.lockPollMs));
      }
    }
    await handle.chmod(PRIVATE_FILE_MODE);
    await handle.writeFile(lockBytes);
    await handle.sync();
    await syncDirectory(dirname(lockPath));
    const ownerInfo = await handle.stat();
    this.assertPrivateFileInfo(ownerInfo, relativePath);
    try {
      return await operation();
    } finally {
      try {
        const currentBytes = await this.readFile(relativePath).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") throw new Error("私有 store lock 在持有期间被删除");
          throw error;
        });
        const currentHandle = await open(lockPath, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const currentInfo = await currentHandle.stat();
          this.assertPrivateFileInfo(currentInfo, relativePath);
          if (currentInfo.dev !== ownerInfo.dev || currentInfo.ino !== ownerInfo.ino || !currentBytes.equals(lockBytes)) {
            throw new Error("私有 store lock owner nonce 或 inode 不匹配，拒绝释放他人锁");
          }
        } finally { await currentHandle.close(); }
      } finally {
        await handle.close();
        handle = null;
      }
      await unlink(lockPath);
      await syncDirectory(dirname(lockPath));
    }
  }

  private async assertPrivateChain(target: string): Promise<void> {
    const root = resolve(this.rootPath);
    const candidate = resolve(target);
    if (!isInside(root, candidate)) throw new Error("私有路径越界");
    await this.assertPrivateDirectoryAbsolute(root);
    let current = root;
    for (const part of relative(root, candidate).split(/[\\/]/).filter(Boolean)) {
      current = join(current, part);
      await this.assertPrivateDirectoryAbsolute(current);
    }
  }

  private async assertPrivateDirectoryAbsolute(path: string): Promise<void> {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
      throw new Error("私有目录必须是 owner-only 0700 非符号链接目录");
    }
    if (!isOwnedByCurrentUser(info.uid)) throw new Error("私有目录 owner 无效");
  }

  private assertPrivateFileInfo(info: Stats, label: string): void {
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== PRIVATE_FILE_MODE) {
      throw new Error(`${label} 必须是 owner-only 0600 单链接普通文件`);
    }
    if (!isOwnedByCurrentUser(info.uid)) throw new Error(`${label} owner 无效`);
  }

  private async removeOwnedStagingDirectory(staging: string, expectedFileName: string): Promise<void> {
    const info = await lstat(staging).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!info) return;
    if (!info.isDirectory() || info.isSymbolicLink() || !isOwnedByCurrentUser(info.uid)
      || (info.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
      throw new Error("拒绝清理非本 store 创建的 staging 路径");
    }
    const entries = await readdir(staging);
    for (const name of entries) {
      if (name !== expectedFileName) throw new Error("staging 目录含未知内容，拒绝递归清理");
      const filePath = join(staging, name);
      const fileInfo = await lstat(filePath);
      this.assertPrivateFileInfo(fileInfo, "staging file");
      await unlink(filePath);
    }
    await rmdir(staging);
  }
}

export function assertPrivateSha256(value: string, label: string): void {
  if (!SHA256.test(value)) throw new Error(`${label} 必须是小写 SHA-256`);
}
