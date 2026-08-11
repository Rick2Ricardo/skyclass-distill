import { createHash } from "node:crypto";
import { link, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertControlledByteEvidenceUnchanged, verifyControlledByteEvidence } from "./byteEvidence.js";

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("controlled byte evidence", () => {
  it("streams a file without retaining it and can freeze its identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "byte-evidence-"));
    const bytes = Buffer.from("\0\0\0\x18ftypisomsource-video");
    await writeFile(join(root, "source.mp4"), bytes);
    const verified = await verifyControlledByteEvidence({
      root,
      ref: { asset_uri: "source.mp4", sha256: sha(bytes), byte_length: bytes.byteLength },
      label: "source",
      max_bytes: 1024,
      required_magic: { offset: 4, bytes: Buffer.from("ftyp") },
    });
    expect(verified.bytes).toBeUndefined();
    await expect(assertControlledByteEvidenceUnchanged(verified, "source")).resolves.toBeUndefined();
    await writeFile(join(root, "source.mp4"), Buffer.from("changed"));
    await expect(assertControlledByteEvidenceUnchanged(verified, "source")).rejects.toThrow("发生变化");
  });

  it("rejects ancestor symlinks, hardlinks, bad hashes, and bad signatures", async () => {
    const root = await mkdtemp(join(tmpdir(), "byte-evidence-root-"));
    const outside = await mkdtemp(join(tmpdir(), "byte-evidence-outside-"));
    const bytes = Buffer.from("safe bytes");
    await writeFile(join(outside, "outside.bin"), bytes);
    await symlink(outside, join(root, "escape"));
    await expect(verifyControlledByteEvidence({
      root,
      ref: { asset_uri: "escape/outside.bin", sha256: sha(bytes), byte_length: bytes.byteLength },
      label: "escape",
      max_bytes: 1024,
    })).rejects.toThrow("符号链接");

    await writeFile(join(root, "one.bin"), bytes);
    await link(join(root, "one.bin"), join(root, "two.bin"));
    await expect(verifyControlledByteEvidence({
      root,
      ref: { asset_uri: "one.bin", sha256: sha(bytes), byte_length: bytes.byteLength },
      label: "hardlink",
      max_bytes: 1024,
    })).rejects.toThrow("唯一链接");

    await writeFile(join(root, "plain.bin"), bytes);
    await expect(verifyControlledByteEvidence({
      root,
      ref: { asset_uri: "plain.bin", sha256: "0".repeat(64), byte_length: bytes.byteLength },
      label: "hash",
      max_bytes: 1024,
    })).rejects.toThrow("SHA-256");
    await expect(verifyControlledByteEvidence({
      root,
      ref: { asset_uri: "plain.bin", sha256: sha(bytes), byte_length: bytes.byteLength },
      label: "signature",
      max_bytes: 1024,
      required_magic: { offset: 0, bytes: Buffer.from("ftyp") },
    })).rejects.toThrow("文件签名");
  });
});
