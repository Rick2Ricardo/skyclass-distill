import { createHash } from "node:crypto";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeControlledAssetUri, inspectImageBytes, verifyImageEvidence } from "./imageEvidence.js";

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, payload: Uint8Array): Buffer {
  const name = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + payload.byteLength);
  output.writeUInt32BE(payload.byteLength, 0);
  name.copy(output, 4);
  Buffer.from(payload).copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, Buffer.from(payload)])), 8 + payload.byteLength);
  return output;
}

function craftedPng(input: { bitDepth: number; colorType: number; scanline: number[]; palette?: boolean }): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = input.bitDepth;
  header[9] = input.colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    ...(input.palette ? [pngChunk("PLTE", Buffer.from([0, 0, 0]))] : []),
    pngChunk("IDAT", deflateSync(Buffer.from(input.scanline))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("verified image evidence", () => {
  it("reads a controlled content-addressed image once and reports true MIME and dimensions", async () => {
    const root = await mkdtemp(join(tmpdir(), "image-evidence-"));
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets", "comparison.jpg"), PNG_1X1);
    const verified = await verifyImageEvidence({
      root,
      assetUri: "assets/comparison.jpg",
      expectedSha256: digest(PNG_1X1),
    });
    expect(verified.mime_type).toBe("image/png");
    expect([verified.width, verified.height]).toEqual([1, 1]);
    expect(verified.sha256).toBe(digest(PNG_1X1));
  });

  it("rejects traversal, encoded traversal, schemes, UNC paths, and symlink escapes", async () => {
    for (const uri of ["../secret.png", "%252e%252e%252fsecret.png", "file:///tmp/secret.png", "\\\\server\\share.png"]) {
      expect(() => decodeControlledAssetUri(uri)).toThrow("受控相对路径");
    }
    const root = await mkdtemp(join(tmpdir(), "image-evidence-root-"));
    const outside = await mkdtemp(join(tmpdir(), "image-evidence-outside-"));
    await writeFile(join(outside, "secret.png"), PNG_1X1);
    await symlink(outside, join(root, "escape"));
    await expect(verifyImageEvidence({
      root,
      assetUri: "escape/secret.png",
      expectedSha256: digest(PNG_1X1),
    })).rejects.toThrow("超出 evidence package");
  });

  it("rejects a bad hash, disguised non-image content, and excessive pixel dimensions", async () => {
    const root = await mkdtemp(join(tmpdir(), "image-evidence-invalid-"));
    await writeFile(join(root, "good.png"), PNG_1X1);
    await expect(verifyImageEvidence({ root, assetUri: "good.png", expectedSha256: "0".repeat(64) }))
      .rejects.toThrow("SHA-256 不匹配");

    const html = Buffer.from("<html><script>alert(1)</script></html>");
    await writeFile(join(root, "fake.jpg"), html);
    await expect(verifyImageEvidence({ root, assetUri: "fake.jpg", expectedSha256: digest(html) }))
      .rejects.toThrow("只允许可完整解码");

    await expect(verifyImageEvidence({ root, assetUri: "good.png", expectedSha256: digest(PNG_1X1), maxPixels: 0 }))
      .rejects.toThrow("像素超过");
  });

  it("rejects truncated or unsupported image byte streams", () => {
    expect(() => inspectImageBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toThrow("只允许可完整解码");
    const headerOnly = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(headerOnly);
    headerOnly.writeUInt32BE(1, 16);
    headerOnly.writeUInt32BE(1, 20);
    expect(() => inspectImageBytes(headerOnly)).toThrow(/IHDR|IDAT|IEND|PNG/);
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x00, 0x01, 0x00, 0x01, 0xff, 0xda, 0xff, 0xd9]);
    expect(() => inspectImageBytes(fakeJpeg)).toThrow("JPEG 像素解码失败");
    expect(() => inspectImageBytes(craftedPng({ bitDepth: 8, colorType: 0, scanline: [5, 0] })))
      .toThrow("PNG 像素解码失败");
    expect(() => inspectImageBytes(craftedPng({ bitDepth: 16, colorType: 3, scanline: [0, 0, 0], palette: true })))
      .toThrow("色彩类型与位深组合");
  });
});
