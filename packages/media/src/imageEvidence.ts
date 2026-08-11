import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { inflateSync } from "node:zlib";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

export type SupportedImageMime = "image/jpeg" | "image/png";

export interface VerifiedImageEvidence {
  path: string;
  bytes: Buffer;
  mime_type: SupportedImageMime;
  sha256: string;
  width: number;
  height: number;
  byte_length: number;
}

export interface CanonicalImagePixels {
  mime_type: SupportedImageMime;
  width: number;
  height: number;
  rgba: Buffer;
  canonical_pixel_sha256: string;
}

export const CANONICAL_PIXEL_HASH_VERSION = "oracle-rgba8-v1" as const;
export const CANONICAL_PIXEL_HASH_DOMAIN = "oracle-rgba8-v1\0" as const;

export interface VerifyImageEvidenceOptions {
  root: string;
  assetUri: string;
  expectedSha256: string;
  maxBytes?: number;
  maxPixels?: number;
}

function inside(root: string, candidate: string): boolean {
  const value = relative(root, candidate);
  return value === "" || (!value.startsWith(`..${sep}`) && value !== ".." && !isAbsolute(value));
}

export function decodeControlledAssetUri(value: string): string {
  if (!value || value.trim() !== value || value.includes("\\") || value.includes("\0") || isAbsolute(value)) {
    throw new Error("asset_uri 必须是受控相对路径");
  }
  let decoded = value;
  let stable = false;
  try {
    for (let index = 0; index < 16; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) { stable = true; break; }
      decoded = next;
    }
  } catch {
    throw new Error("asset_uri 编码无效");
  }
  if (!stable || !decoded || decoded.includes("\\") || decoded.includes("\0") || isAbsolute(decoded)
    || /^[a-z][a-z0-9+.-]*:/i.test(decoded)
    || decoded.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("asset_uri 必须是受控相对路径");
  }
  return decoded;
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw new Error("JPEG 缺少完整 EOI");
  const raw = Buffer.from(bytes);
  if (raw.indexOf(Buffer.from([0xff, 0xda])) < 0) throw new Error("JPEG 缺少图像扫描数据");
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  let dimensions: { width: number; height: number } | null = null;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if (sof.has(marker) && length >= 7) {
      dimensions = {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
      break;
    }
    offset += length;
  }
  return dimensions;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const raw = Buffer.from(bytes);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (raw.length < 8 || !raw.subarray(0, 8).equals(signature)) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let sawHeader = false;
  let sawEnd = false;
  const imageData: Buffer[] = [];
  while (offset + 12 <= raw.length) {
    const length = raw.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (length > raw.length || chunkEnd > raw.length) throw new Error("PNG chunk 被截断");
    const type = raw.subarray(offset + 4, offset + 8).toString("ascii");
    const payload = raw.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = raw.readUInt32BE(offset + 8 + length);
    if (crc32(raw.subarray(offset + 4, offset + 8 + length)) !== expectedCrc) throw new Error(`PNG ${type} CRC 无效`);
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) throw new Error("PNG 首个 chunk 必须是完整 IHDR");
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      bitDepth = payload[8];
      colorType = payload[9];
      if (payload[10] !== 0 || payload[11] !== 0 || payload[12] !== 0) throw new Error("PNG 只接受标准压缩、过滤和非交错像素");
      sawHeader = true;
    } else if (type === "IDAT") imageData.push(Buffer.from(payload));
    else if (type === "IEND") {
      if (length !== 0) throw new Error("PNG IEND 长度无效");
      sawEnd = true;
      offset = chunkEnd;
      break;
    }
    offset = chunkEnd;
  }
  if (!sawHeader || !imageData.length || !sawEnd || offset !== raw.length) throw new Error("PNG 必须包含完整 IHDR、IDAT 和 IEND，且不得有尾随数据");
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (!channels || ![1, 2, 4, 8, 16].includes(bitDepth)) throw new Error("PNG 色彩类型或位深不受支持");
  const legalBitDepths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  if (!legalBitDepths[colorType]?.includes(bitDepth)) throw new Error("PNG 色彩类型与位深组合不符合规范");
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels <= 0 || pixels > 16_000_000) throw new Error("PNG 像素尺寸无效或超过限制");
  const decompressed = inflateSync(Buffer.concat(imageData), { maxOutputLength: 64 * 1024 * 1024 });
  const expectedBytes = (Math.ceil(width * channels * bitDepth / 8) + 1) * height;
  if (decompressed.byteLength !== expectedBytes) throw new Error("PNG 解压像素长度与 IHDR 不一致");
  try {
    const decoded = PNG.sync.read(raw, { checkCRC: true });
    if (decoded.width !== width || decoded.height !== height || decoded.data.byteLength === 0) {
      throw new Error("PNG 解码尺寸与 IHDR 不一致");
    }
  } catch (error) {
    throw new Error(`PNG 像素解码失败：${error instanceof Error ? error.message : String(error)}`);
  }
  return { width, height };
}

export function inspectImageBytes(bytes: Uint8Array): { mime_type: SupportedImageMime; width: number; height: number } {
  const png = pngDimensions(bytes);
  if (png) return { mime_type: "image/png", ...png };
  const dimensions = jpegDimensions(bytes);
  if (dimensions) {
    const pixels = dimensions.width * dimensions.height;
    if (!Number.isSafeInteger(pixels) || pixels <= 0 || pixels > 16_000_000) throw new Error("JPEG 像素尺寸无效或超过限制");
    try {
      const decoded = jpeg.decode(Buffer.from(bytes), { useTArray: true, formatAsRGBA: false, tolerantDecoding: false });
      if (decoded.width !== dimensions.width || decoded.height !== dimensions.height || decoded.data.byteLength === 0) {
        throw new Error("JPEG 解码尺寸与 SOF 不一致");
      }
    } catch (error) {
      throw new Error(`JPEG 像素解码失败：${error instanceof Error ? error.message : String(error)}`);
    }
    return { mime_type: "image/jpeg", ...dimensions };
  }
  throw new Error("只允许可完整解码的 PNG 或 JPEG 图像");
}

/**
 * Decodes supported images to the single pixel representation used by Formal
 * Oracle byte attestation. The hash is encoding-independent: PNG and JPEG bytes
 * with identical decoded RGBA8 pixels produce the same digest.
 */
export function canonicalImagePixels(bytes: Uint8Array): CanonicalImagePixels {
  const inspected = inspectImageBytes(bytes);
  const decoded = inspected.mime_type === "image/png"
    ? PNG.sync.read(Buffer.from(bytes), { checkCRC: true })
    : jpeg.decode(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true, tolerantDecoding: false });
  const rgba = Buffer.from(decoded.data);
  if (decoded.width !== inspected.width || decoded.height !== inspected.height
    || rgba.byteLength !== inspected.width * inspected.height * 4) {
    throw new Error("图像 RGBA8 解码长度或尺寸无效");
  }
  const dimensions = Buffer.alloc(8);
  dimensions.writeUInt32BE(inspected.width, 0);
  dimensions.writeUInt32BE(inspected.height, 4);
  const canonical_pixel_sha256 = createHash("sha256")
    .update(Buffer.from(CANONICAL_PIXEL_HASH_DOMAIN, "utf8"))
    .update(dimensions)
    .update(rgba)
    .digest("hex");
  return { ...inspected, rgba, canonical_pixel_sha256 };
}

export async function verifyImageEvidence(options: VerifyImageEvidenceOptions): Promise<VerifiedImageEvidence> {
  const controlled = decodeControlledAssetUri(options.assetUri);
  const root = await realpath(options.root).catch(() => { throw new Error("evidence package 目录不存在"); });
  const candidate = resolve(root, controlled);
  if (!inside(root, candidate)) throw new Error("视觉证据路径超出 evidence package");
  const resolved = await realpath(candidate).catch(() => { throw new Error(`视觉证据不存在：${options.assetUri}`); });
  if (!inside(root, resolved)) throw new Error("视觉证据路径超出 evidence package");

  const handle = await open(resolved, "r");
  let bytes: Buffer;
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error("视觉证据必须是普通文件");
    const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
    if (info.size <= 0 || info.size > maxBytes) throw new Error(`视觉证据大小必须在 1–${maxBytes} 字节之间`);
    bytes = await handle.readFile();
  } finally {
    await handle.close();
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== options.expectedSha256) throw new Error(`视觉证据 SHA-256 不匹配：${options.assetUri}`);
  const inspected = inspectImageBytes(bytes);
  if (!Number.isInteger(inspected.width) || !Number.isInteger(inspected.height) || inspected.width <= 0 || inspected.height <= 0) {
    throw new Error("视觉证据尺寸无效");
  }
  const pixels = inspected.width * inspected.height;
  const maxPixels = options.maxPixels ?? 16_000_000;
  if (!Number.isSafeInteger(pixels) || pixels > maxPixels) throw new Error(`视觉证据像素超过 ${maxPixels} 限制`);
  return {
    path: resolved,
    bytes,
    mime_type: inspected.mime_type,
    sha256,
    width: inspected.width,
    height: inspected.height,
    byte_length: bytes.byteLength,
  };
}
