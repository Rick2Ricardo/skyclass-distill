import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hashSignedSpeechAlignmentContent,
  renderSelectedSpeech,
  renderWhisperCppIndex,
  renderWhisperCppSrt,
  renderWhisperCppText,
  signedSpeechAlignmentSignoffPreimage,
  verifySignedSpeechAlignmentLedgerBytes,
  verifyWhisperCppSpeechEvidence,
  type SpeechByteFileRef,
  type VerifiedSpeechSegment,
} from "./speechEvidence.js";

function sha(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fixtureValues() {
  const segments: VerifiedSpeechSegment[] = [
    { segment_index: 0, segment_id: "segment-000000", start_ms: 0, end_ms: 760, text: "先画研究对象" },
    { segment_index: 1, segment_id: "segment-000001", start_ms: 1020, end_ms: 2300, text: "再标出外力" },
  ];
  const raw = `${JSON.stringify({
    model: { type: "small" },
    result: { language: "zh" },
    transcription: segments.map((segment) => ({
      timestamps: {
        from: segment.segment_index === 0 ? "00:00:00,000" : "00:00:01,020",
        to: segment.segment_index === 0 ? "00:00:00,760" : "00:00:02,300",
      },
      offsets: { from: segment.start_ms, to: segment.end_ms },
      text: segment.text,
    })),
  }, null, 2)}\n`;
  const index = {
    text: "先画研究对象 再标出外力",
    segments: segments.map((segment) => ({ start: segment.start_ms / 1000, end: segment.end_ms / 1000, text: segment.text })),
    language: "zh",
    duration: 2.3,
    engine: "whisper.cpp",
    model: "small",
  };
  return {
    segments,
    raw,
    index: renderWhisperCppIndex(index),
    srt: renderWhisperCppSrt(segments),
    text: renderWhisperCppText(segments),
    selected: renderSelectedSpeech(segments, [0, 1]),
  };
}

async function writeFixture() {
  const root = await mkdtemp(join(tmpdir(), "speech-evidence-"));
  await mkdir(join(root, "asr"));
  const values = fixtureValues();
  const files = {} as Record<"raw" | "index" | "srt" | "text", SpeechByteFileRef>;
  for (const [name, bytes] of Object.entries({ raw: values.raw, index: values.index, srt: values.srt, text: values.text })) {
    const asset_uri = `asr/${name}.txt`;
    await writeFile(join(root, asset_uri), bytes);
    files[name as keyof typeof files] = { asset_uri, sha256: sha(bytes), byte_length: Buffer.byteLength(bytes) };
  }
  return { root, files, values };
}

describe("strict Whisper.cpp speech evidence", () => {
  it("rebuilds index/SRT/TXT bytes and freezes selected transcript bytes", async () => {
    const fixture = await writeFixture();
    const verified = await verifyWhisperCppSpeechEvidence({
      root: fixture.root,
      files: fixture.files,
      selected_segment_indexes: [0, 1],
      expected_selected_transcript_sha256: sha(fixture.values.selected),
    });
    expect(verified.selected_transcript).toBe(fixture.values.selected);
    expect(verified.segments.map((item) => item.segment_id)).toEqual(["segment-000000", "segment-000001"]);
  });

  it("rejects timestamp/offset drift and derived-file drift", async () => {
    const fixture = await writeFixture();
    const badRaw = fixture.values.raw.replace('"to": 760', '"to": 761');
    await writeFile(join(fixture.root, fixture.files.raw.asset_uri), badRaw);
    fixture.files.raw = { ...fixture.files.raw, sha256: sha(badRaw), byte_length: Buffer.byteLength(badRaw) };
    await expect(verifyWhisperCppSpeechEvidence({
      root: fixture.root,
      files: fixture.files,
      selected_segment_indexes: [0],
      expected_selected_transcript_sha256: sha(renderSelectedSpeech(fixture.values.segments, [0])),
    })).rejects.toThrow("timestamp/offset 不一致");

    const derived = await writeFixture();
    const badText = derived.values.text.replace("再标出外力", "再标出内力");
    await writeFile(join(derived.root, derived.files.text.asset_uri), badText);
    derived.files.text = { ...derived.files.text, sha256: sha(badText), byte_length: Buffer.byteLength(badText) };
    await expect(verifyWhisperCppSpeechEvidence({
      root: derived.root,
      files: derived.files,
      selected_segment_indexes: [0, 1],
      expected_selected_transcript_sha256: sha(derived.values.selected),
    })).rejects.toThrow("TXT 不能由 index 逐字节重建");
  });

  it("rejects duplicate, unordered, missing, or transcript-hash-mismatched selections", async () => {
    const fixture = await writeFixture();
    await expect(verifyWhisperCppSpeechEvidence({
      root: fixture.root,
      files: fixture.files,
      selected_segment_indexes: [1, 0],
      expected_selected_transcript_sha256: sha(fixture.values.selected),
    })).rejects.toThrow("严格递增");
    await expect(verifyWhisperCppSpeechEvidence({
      root: fixture.root,
      files: fixture.files,
      selected_segment_indexes: [0, 2],
      expected_selected_transcript_sha256: sha(fixture.values.selected),
    })).rejects.toThrow("不存在");
    await expect(verifyWhisperCppSpeechEvidence({
      root: fixture.root,
      files: fixture.files,
      selected_segment_indexes: [0, 1],
      expected_selected_transcript_sha256: "0".repeat(64),
    })).rejects.toThrow("不匹配");
  });

  it("rejects duplicate JSON keys, conflicting top-level text, and in-root ancestor symlinks", async () => {
    const duplicate = await writeFixture();
    const duplicateRaw = duplicate.values.raw.replace('"text": "先画研究对象"', '"text": "shadow",\n      "text": "先画研究对象"');
    await writeFile(join(duplicate.root, duplicate.files.raw.asset_uri), duplicateRaw);
    duplicate.files.raw = { ...duplicate.files.raw, sha256: sha(duplicateRaw), byte_length: Buffer.byteLength(duplicateRaw) };
    await expect(verifyWhisperCppSpeechEvidence({
      root: duplicate.root,
      files: duplicate.files,
      selected_segment_indexes: [0, 1],
      expected_selected_transcript_sha256: sha(duplicate.values.selected),
    })).rejects.toThrow("重复 JSON key");

    const conflict = await writeFixture();
    const conflictRaw = conflict.values.raw.replace("{\n", '{\n  "text": "另一套转写",\n');
    await writeFile(join(conflict.root, conflict.files.raw.asset_uri), conflictRaw);
    conflict.files.raw = { ...conflict.files.raw, sha256: sha(conflictRaw), byte_length: Buffer.byteLength(conflictRaw) };
    await expect(verifyWhisperCppSpeechEvidence({
      root: conflict.root,
      files: conflict.files,
      selected_segment_indexes: [0, 1],
      expected_selected_transcript_sha256: sha(conflict.values.selected),
    })).rejects.toThrow("顶层 text 与 transcription 不一致");

    const linked = await writeFixture();
    await symlink(join(linked.root, "asr"), join(linked.root, "alias"));
    const linkedFiles = Object.fromEntries(Object.entries(linked.files).map(([key, value]) => [
      key,
      { ...value, asset_uri: value.asset_uri.replace("asr/", "alias/") },
    ])) as typeof linked.files;
    await expect(verifyWhisperCppSpeechEvidence({
      root: linked.root,
      files: linkedFiles,
      selected_segment_indexes: [0, 1],
      expected_selected_transcript_sha256: sha(linked.values.selected),
    })).rejects.toThrow("符号链接");
  });

  it("binds each alignment ledger body to a trusted Ed25519 reviewer signature", async () => {
    const fixture = await writeFixture();
    const reviewer = generateKeyPairSync("ed25519");
    const content = {
      schema_version: "signed-speech-alignment-v1" as const,
      status: "signed_alignment" as const,
      case_id: "case-a",
      source_video_id: "video-a",
      clip_start_us: 0,
      clip_end_us: 3_000_000,
      files: fixture.files,
      selected_segments: fixture.values.segments.map((segment) => ({
        segment_id: segment.segment_id,
        segment_index: segment.segment_index,
        start_ms: segment.start_ms,
        end_ms: segment.end_ms,
        text_sha256: sha(segment.text),
      })),
      selected_transcript_sha256: sha(fixture.values.selected),
      selected_transcript_byte_length: Buffer.byteLength(fixture.values.selected),
    };
    const signoff = {
      adjudicator_id: "reviewer-a",
      adjudicator_role: "speech_alignment_reviewer" as const,
      reviewed_at: "2026-08-12T02:30:00.000Z",
      statement: "确认本账本正文中的转写与片段。",
      ledger_content_sha256: hashSignedSpeechAlignmentContent(content),
      signer_key_id: "reviewer-key-a",
      signature_algorithm: "ed25519" as const,
    };
    const signature_base64 = sign(
      null,
      Buffer.from(signedSpeechAlignmentSignoffPreimage(signoff), "utf8"),
      reviewer.privateKey,
    ).toString("base64");
    const trusted_public_keys = new Map([["reviewer-key-a", reviewer.publicKey]]);
    const expected = {
      case_id: content.case_id,
      source_video_id: content.source_video_id,
      clip_start_us: content.clip_start_us,
      clip_end_us: content.clip_end_us,
      files: content.files,
      selected_segments: content.selected_segments,
      selected_transcript_sha256: content.selected_transcript_sha256,
      selected_transcript_byte_length: content.selected_transcript_byte_length,
    };
    const bytes = Buffer.from(JSON.stringify({ ...content, signoff: { ...signoff, signature_base64 } }));
    expect(verifySignedSpeechAlignmentLedgerBytes({ bytes, expected, trusted_public_keys }).case_id).toBe("case-a");

    const otherContent = { ...content, case_id: "case-b", source_video_id: "video-b" };
    const reusedSignatureBytes = Buffer.from(JSON.stringify({
      ...otherContent,
      signoff: { ...signoff, ledger_content_sha256: hashSignedSpeechAlignmentContent(otherContent), signature_base64 },
    }));
    await expect(Promise.resolve().then(() => verifySignedSpeechAlignmentLedgerBytes({
      bytes: reusedSignatureBytes,
      expected: { ...expected, case_id: "case-b", source_video_id: "video-b" },
      trusted_public_keys,
    }))).rejects.toThrow("Ed25519 签名无效");
  });
});
