import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { decodeControlledAssetUri } from "./imageEvidence.js";

export interface ControlledByteRef {
  asset_uri: string;
  sha256: string;
  byte_length: number;
}

export interface VerifiedControlledByteEvidence {
  path: string;
  sha256: string;
  byte_length: number;
  bytes?: Buffer;
  file_identity: {
    dev: number;
    ino: number;
    size: number;
    mtime_ms: number;
  };
}

function inside(root: string, candidate: string): boolean {
  const value = relative(root, candidate);
  return value === "" || (!value.startsWith(`..${sep}`) && value !== ".." && !isAbsolute(value));
}

async function assertLexicalChainHasNoSymlink(rootReal: string, controlled: string, label: string): Promise<void> {
  let current = rootReal;
  for (const component of controlled.split("/")) {
    current = resolve(current, component);
    const info = await lstat(current).catch(() => { throw new Error(`${label} 文件不存在`); });
    if (info.isSymbolicLink()) throw new Error(`${label} 路径不得包含符号链接`);
  }
}

function validRef(ref: ControlledByteRef): boolean {
  return /^[a-f0-9]{64}$/.test(ref.sha256)
    && Number.isSafeInteger(ref.byte_length)
    && ref.byte_length > 0;
}

/**
 * Reads a controlled artifact through one O_NOFOLLOW handle, hashes it while
 * streaming, and checks that its identity did not change during the read.
 * Large source videos can be verified without retaining their bytes in memory.
 */
export async function verifyControlledByteEvidence(input: {
  root: string;
  ref: ControlledByteRef;
  label: string;
  max_bytes: number;
  retain_bytes?: boolean;
  required_magic?: { offset: number; bytes: Uint8Array };
}): Promise<VerifiedControlledByteEvidence> {
  if (!validRef(input.ref)) throw new Error(`${input.label} 字节声明无效`);
  if (!Number.isSafeInteger(input.max_bytes) || input.max_bytes < 1 || input.ref.byte_length > input.max_bytes) {
    throw new Error(`${input.label} 超过冻结字节上限`);
  }
  const controlled = decodeControlledAssetUri(input.ref.asset_uri);
  const rootReal = await realpath(input.root).catch(() => { throw new Error(`${input.label} evidence root 不存在`); });
  await assertLexicalChainHasNoSymlink(rootReal, controlled, input.label);
  const lexical = resolve(rootReal, controlled);
  if (!inside(rootReal, lexical)) throw new Error(`${input.label} 路径超出 evidence root`);
  const path = await realpath(lexical).catch(() => { throw new Error(`${input.label} 文件不存在`); });
  if (!inside(rootReal, path)) throw new Error(`${input.label} 路径超出 evidence root`);

  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1) throw new Error(`${input.label} 必须是唯一链接普通文件`);
    if (before.size !== input.ref.byte_length) throw new Error(`${input.label} byte_length 不匹配`);

    const hash = createHash("sha256");
    const chunks: Buffer[] = [];
    const magic = input.required_magic;
    if (magic && (!Number.isSafeInteger(magic.offset) || magic.offset < 0
      || magic.bytes.byteLength < 1 || magic.offset + magic.bytes.byteLength > before.size)) {
      throw new Error(`${input.label} 文件签名声明无效`);
    }
    const capturedMagic = magic ? Buffer.alloc(magic.bytes.byteLength) : Buffer.alloc(0);
    let capturedMagicBytes = 0;
    let position = 0;
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    while (position < before.size) {
      const length = Math.min(buffer.byteLength, before.size - position);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      if (bytesRead <= 0) throw new Error(`${input.label} 读取提前结束`);
      const chunk = Buffer.from(buffer.subarray(0, bytesRead));
      hash.update(chunk);
      if (input.retain_bytes) chunks.push(chunk);
      if (magic) {
        const chunkStart = position;
        const chunkEnd = position + bytesRead;
        const magicStart = magic.offset;
        const magicEnd = magic.offset + magic.bytes.byteLength;
        const overlapStart = Math.max(chunkStart, magicStart);
        const overlapEnd = Math.min(chunkEnd, magicEnd);
        if (overlapEnd > overlapStart) {
          const sourceStart = overlapStart - chunkStart;
          const targetStart = overlapStart - magicStart;
          chunk.copy(capturedMagic, targetStart, sourceStart, sourceStart + overlapEnd - overlapStart);
          capturedMagicBytes += overlapEnd - overlapStart;
        }
      }
      position += bytesRead;
    }
    const after = await handle.stat();
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || position !== after.size) {
      throw new Error(`${input.label} 在验证期间发生变化`);
    }
    if (magic && (capturedMagicBytes !== magic.bytes.byteLength || !capturedMagic.equals(Buffer.from(magic.bytes)))) {
      throw new Error(`${input.label} 文件签名无效`);
    }
    const sha256 = hash.digest("hex");
    if (sha256 !== input.ref.sha256) throw new Error(`${input.label} SHA-256 不匹配`);
    return {
      path,
      sha256,
      byte_length: position,
      ...(input.retain_bytes ? { bytes: Buffer.concat(chunks, position) } : {}),
      file_identity: { dev: before.dev, ino: before.ino, size: before.size, mtime_ms: before.mtimeMs },
    };
  } finally {
    await handle.close();
  }
}

export async function assertControlledByteEvidenceUnchanged(
  verified: VerifiedControlledByteEvidence,
  label: string,
): Promise<void> {
  const info = await lstat(verified.path).catch(() => { throw new Error(`${label} 在后续处理前消失`); });
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1
    || info.dev !== verified.file_identity.dev || info.ino !== verified.file_identity.ino
    || info.size !== verified.file_identity.size || info.mtimeMs !== verified.file_identity.mtime_ms) {
    throw new Error(`${label} 在字节验证后发生变化`);
  }
}
