import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ORACLE_GATE_BYTE_INVENTORY_SHA256_DOMAIN,
  ORACLE_GATE_BYTE_TOOLCHAIN,
  canonicalOracleGateByteInventoryPayload,
  oracleGateByteInventorySha256Preimage,
  type OracleGateByteInventory,
  validateOracleGateByteInventory,
} from "./oracle-gate-bytes.js";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function byteRef(stem: string, hash: string) {
  return { asset_uri: `speech/${stem}`, sha256: hash.repeat(64), byte_length: 128 };
}

function imageRef(stem: string, hash: string, pixelHash: string) {
  return {
    asset_uri: `assets/${stem}.png`,
    sha256: hash.repeat(64),
    byte_length: 4096,
    mime_type: "image/png" as const,
    width: 1280,
    height: 720,
    canonical_pixel_sha256: pixelHash.repeat(64),
  };
}

function fixture(): OracleGateByteInventory {
  const inventory: OracleGateByteInventory = {
    schema_version: "oracle-gate-byte-inventory-v1",
    inventory_sha256: "0".repeat(64),
    status: "untrusted_inventory",
    api_execution_allowed: false,
    reason: "inventory_not_byte_verified_or_attested",
    input_manifest_sha256: "1".repeat(64),
    signed_gold_dataset_sha256: "2".repeat(64),
    toolchain: {
      ...ORACLE_GATE_BYTE_TOOLCHAIN,
      ffmpeg_binary_sha256: "3".repeat(64),
      ffprobe_binary_sha256: "4".repeat(64),
      ffmpeg_version_sha256: "5".repeat(64),
      ffprobe_version_sha256: "6".repeat(64),
    },
    sources: [
      {
        source_video_id: "video-1",
        video: {
          asset_uri: "sources/video-1.mp4",
          sha256: "4".repeat(64),
          byte_length: 1_000_000,
          mime_type: "video/mp4",
          duration_us: 120_000_000,
          width: 1280,
          height: 720,
          video_stream_index: 0,
        },
      },
      {
        source_video_id: "video-2",
        video: {
          asset_uri: "sources/video-2.mp4",
          sha256: "5".repeat(64),
          byte_length: 2_000_000,
          mime_type: "video/mp4",
          duration_us: 240_000_000,
          width: 1920,
          height: 1080,
          video_stream_index: 1,
        },
      },
    ],
    cases: [
      {
        case_id: "case-1",
        source_video_id: "video-1",
        static_final: { ...imageRef("static-1", "6", "7"), timestamp_us: 60_000_000 },
        uniform_frame: { ...imageRef("uniform-1", "8", "9"), timestamp_us: 55_000_000 },
        oracle_comparison: { ...imageRef("oracle-1", "a", "b"), evidence_id: "evidence-1" },
        speech: {
          clip_start_us: 50_000_000,
          clip_end_us: 65_000_000,
          alignment_ledger: byteRef("case-1.alignment.json", "0"),
          raw: byteRef("case-1.raw.json", "c"),
          index: byteRef("case-1.index.json", "d"),
          srt: byteRef("case-1.srt", "e"),
          txt: byteRef("case-1.txt", "f"),
          selected_segment_indexes: [2, 3, 5],
          selected_transcript_sha256: "1".repeat(64),
          selected_transcript_byte_length: 96,
        },
      },
      {
        case_id: "case-2",
        source_video_id: "video-2",
        static_final: { ...imageRef("static-2", "2", "3"), timestamp_us: 100_000_000 },
        uniform_frame: { ...imageRef("uniform-2", "4", "5"), timestamp_us: 95_000_000 },
        oracle_comparison: { ...imageRef("oracle-2", "6", "7"), evidence_id: "evidence-2" },
        speech: {
          clip_start_us: 90_000_000,
          clip_end_us: 105_000_000,
          alignment_ledger: byteRef("case-2.alignment.json", "7"),
          raw: byteRef("case-2.raw.json", "8"),
          index: byteRef("case-2.index.json", "9"),
          srt: byteRef("case-2.srt", "a"),
          txt: byteRef("case-2.txt", "b"),
          selected_segment_indexes: [0, 1],
          selected_transcript_sha256: "c".repeat(64),
          selected_transcript_byte_length: 64,
        },
      },
    ],
  };
  inventory.inventory_sha256 = digest(oracleGateByteInventorySha256Preimage(inventory));
  return inventory;
}

function messages(value: unknown): string {
  return validateOracleGateByteInventory(value).issues.map((item) => `${item.path} ${item.message}`).join("\n");
}

describe("oracle-gate-byte-inventory-v1", () => {
  it("accepts a complete untrusted inventory and exposes a domain-separated canonical preimage", () => {
    const inventory = fixture();
    expect(validateOracleGateByteInventory(inventory)).toEqual({ valid: true, issues: [] });
    expect(canonicalOracleGateByteInventoryPayload(inventory)).not.toContain(inventory.inventory_sha256);
    expect(oracleGateByteInventorySha256Preimage(inventory).startsWith(ORACLE_GATE_BYTE_INVENTORY_SHA256_DOMAIN)).toBe(true);
    expect(digest(oracleGateByteInventorySha256Preimage(inventory))).toBe(inventory.inventory_sha256);
  });

  it("requires exact keys at every registered object boundary", () => {
    const extra = fixture() as any;
    extra.cases[0].static_final.unregistered = true;
    expect(messages(extra)).toContain("$.cases[0].static_final.unregistered 包含未注册字段");

    const missing = fixture() as any;
    delete missing.cases[0].speech.txt.byte_length;
    expect(messages(missing)).toContain("$.cases[0].speech.txt.byte_length 缺少必需字段");
  });

  it("never permits a trusted status or API execution", () => {
    const input = fixture() as any;
    input.status = "verified";
    input.api_execution_allowed = true;
    input.reason = "ready";
    const result = messages(input);
    expect(result).toContain("只能是 untrusted_inventory");
    expect(result).toContain("绝不得允许 API 执行");
    expect(result).toContain("尚未完成字节验证或 attestation");
  });

  it("rejects traversal, schemes, encoded traversal, backslashes, NULs, and unstable deep encoding", () => {
    const invalid = [
      "../secret.mp4",
      "%252e%252e%252fsecret.mp4",
      "file:///tmp/secret.mp4",
      "\\\\server\\share.mp4",
      "assets/%00.png",
      `${"%25".repeat(17)}2e`,
    ];
    for (const uri of invalid) {
      const input = fixture() as any;
      input.sources[0].video.asset_uri = uri;
      expect(messages(input), uri).toContain("必须是受控相对路径");
    }
  });

  it("requires unique sources and cases and closes every source reference", () => {
    const duplicateSource = fixture() as any;
    duplicateSource.sources[1].source_video_id = "video-1";
    duplicateSource.cases[1].source_video_id = "video-1";
    expect(messages(duplicateSource)).toContain("$.sources[1].source_video_id 不得重复");

    const duplicateCase = fixture() as any;
    duplicateCase.cases[1].case_id = "case-1";
    expect(messages(duplicateCase)).toContain("$.cases[1].case_id 不得重复");

    const unknown = fixture() as any;
    unknown.cases[0].source_video_id = "video-missing";
    expect(messages(unknown)).toContain("必须引用 sources 中的来源");

    const unused = fixture() as any;
    unused.cases = unused.cases.filter((item: any) => item.source_video_id === "video-1");
    expect(messages(unused)).toContain("来源未被任何 case 使用：video-2");
  });

  it("rejects non-finite, unsafe, negative, reversed, or out-of-duration times and lengths", () => {
    const input = fixture() as any;
    input.sources[0].video.byte_length = 0;
    input.sources[0].video.duration_us = Number.MAX_SAFE_INTEGER + 1;
    input.cases[0].static_final.timestamp_us = Number.POSITIVE_INFINITY;
    input.cases[0].uniform_frame.timestamp_us = -1;
    input.cases[0].speech.clip_start_us = 80_000_000;
    input.cases[0].speech.clip_end_us = 70_000_000;
    input.cases[0].speech.selected_transcript_byte_length = 0;
    const result = messages(input);
    expect(result).toContain("byte_length 必须是正安全整数");
    expect(result).toContain("duration_us 必须是正安全整数");
    expect(result).toContain("timestamp_us 必须是非负安全整数微秒");
    expect(result).toContain("clip_start_us 必须小于 clip_end_us");
    expect(result).toContain("selected_transcript_byte_length 必须是正安全整数");

    const outside = fixture() as any;
    outside.cases[0].static_final.timestamp_us = 120_000_000;
    outside.cases[0].speech.clip_end_us = 120_000_001;
    expect(messages(outside)).toMatch(/必须落在来源视频时长内|不得超过来源视频时长/);
  });

  it("strictly freezes image metadata, dimensions, pixel hashes, and cross-arm separation", () => {
    const input = fixture() as any;
    input.cases[0].static_final.mime_type = "image/webp";
    input.cases[0].static_final.width = 0;
    input.cases[0].uniform_frame.canonical_pixel_sha256 = "BAD";
    input.cases[0].oracle_comparison.evidence_id = "";
    const result = messages(input);
    expect(result).toContain("只允许 PNG/JPEG");
    expect(result).toContain("width 必须是正安全整数");
    expect(result).toContain("canonical_pixel_sha256 必须是小写 SHA-256");
    expect(result).toContain("evidence_id 不能为空");

    const reuse = fixture() as any;
    reuse.cases[0].uniform_frame.sha256 = reuse.cases[0].static_final.sha256;
    reuse.cases[0].oracle_comparison.canonical_pixel_sha256 = reuse.cases[0].static_final.canonical_pixel_sha256;
    expect(messages(reuse)).toMatch(/不得复用同一图像字节|不得复用同一 canonical 像素/);
  });

  it("requires four distinct, hashed, non-empty speech files and ordered selected indexes", () => {
    const input = fixture() as any;
    input.cases[0].speech.index.asset_uri = input.cases[0].speech.raw.asset_uri;
    input.cases[0].speech.srt.sha256 = input.cases[0].speech.raw.sha256;
    input.cases[0].speech.txt.byte_length = 0;
    input.cases[0].speech.selected_segment_indexes = [2, 2, 1, -1];
    input.cases[0].speech.selected_transcript_sha256 = "not-a-hash";
    const result = messages(input);
    expect(result).toContain("alignment/raw/index/srt/txt 必须引用五个不同路径");
    expect(result).toContain("alignment/raw/index/srt/txt 必须具有五个不同文件 SHA");
    expect(result).toContain("byte_length 必须是正安全整数");
    expect(result).toContain("必须严格递增且不得重复");
    expect(result).toContain("必须是非负安全整数");
    expect(result).toContain("selected_transcript_sha256 必须是小写 SHA-256");
  });

  it("rejects toolchain drift and malformed binding hashes", () => {
    const input = fixture() as any;
    input.toolchain.image_decoder_version = "latest";
    input.toolchain.ffmpeg_binary_sha256 = "f".repeat(63);
    input.input_manifest_sha256 = "A".repeat(64);
    const result = messages(input);
    expect(result).toContain(`必须冻结为 ${ORACLE_GATE_BYTE_TOOLCHAIN.image_decoder_version}`);
    expect(result).toContain("ffmpeg_binary_sha256 必须是小写 SHA-256");
    expect(result).toContain("input_manifest_sha256 必须是小写 SHA-256");
  });
});
