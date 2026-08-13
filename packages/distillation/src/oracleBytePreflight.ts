import { createHash, type KeyLike } from "node:crypto";
import type {
  OracleGateByteInventory,
  OracleGateImageBytePixelRef,
  OracleGateFormalAsset,
  OracleGateFormalInputManifest,
  OracleGateFormalSpec,
  OracleGateFormalSpecV2,
  SignedGoldDataset,
} from "../../contracts/src/index.js";
import {
  oracleGateByteInventorySha256Preimage,
  validateOracleGateByteInventory,
} from "../../contracts/src/oracle-gate-bytes.js";
import {
  assertControlledByteEvidenceUnchanged,
  verifyControlledByteEvidence,
} from "../../media/src/byteEvidence.js";
import { canonicalImagePixels } from "../../media/src/imageEvidence.js";
import {
  renderSelectedSpeech,
  verifySignedSpeechAlignmentLedgerBytes,
  verifyWhisperCppSpeechEvidence,
} from "../../media/src/speechEvidence.js";
import type { OracleGateVideoProbe } from "../../media/src/videoEvidence.js";
import { prepareOracleGateFormalStructuralPreflight } from "./oracleFormalPreflight.js";

const MAX_SOURCE_VIDEO_BYTES = 32 * 1024 * 1024 * 1024;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

export interface OracleGateVerifiedImage {
  asset_uri: string;
  sha256: string;
  byte_length: number;
  mime_type: "image/png" | "image/jpeg";
  width: number;
  height: number;
  canonical_pixel_sha256: string;
  bytes: Buffer;
}

export interface OracleGateVerifiedByteCase {
  case_id: string;
  source_video_id: string;
  static_final: OracleGateVerifiedImage;
  uniform_frame: OracleGateVerifiedImage;
  oracle_comparison: OracleGateVerifiedImage & { evidence_id: string };
  speech: {
    selected_segment_ids: string[];
    selected_segment_indexes: number[];
    selected_transcript: string;
    selected_transcript_sha256: string;
    selected_transcript_byte_length: number;
  };
}

export interface OracleGateBytePreflight {
  schema_version: "oracle-gate-byte-preflight-v1";
  status: "untrusted_media_bytes_valid";
  api_execution_allowed: false;
  reason: "source_frame_derivation_external_attestation_and_run_store_pending";
  source_frame_derivation_verified: false;
  inventory_sha256: string;
  dataset_sha256: string;
  input_manifest_sha256: string;
  spec_sha256: string;
  schedule_sha256: string;
  source_count: number;
  case_count: number;
  cases: OracleGateVerifiedByteCase[];
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactObject(left: Record<string, unknown>, right: Record<string, unknown>, label: string): void {
  for (const [key, expected] of Object.entries(right)) {
    if (left[key] !== expected) throw new Error(`${label}.${key} 未与冻结来源闭合`);
  }
}

function secondsToUs(value: number, label: string): number {
  const result = value * 1_000_000;
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`${label} 不能无损转换为整数微秒`);
  return result;
}

async function verifyImage(input: {
  root: string;
  inventory: OracleGateImageBytePixelRef;
  expected: OracleGateFormalAsset | Record<string, unknown>;
  label: string;
}): Promise<OracleGateVerifiedImage> {
  exactObject(input.inventory as unknown as Record<string, unknown>, {
    asset_uri: input.expected.asset_uri,
    sha256: input.expected.sha256,
    byte_length: input.expected.byte_length,
    mime_type: input.expected.mime_type,
    width: input.expected.width,
    height: input.expected.height,
  }, input.label);
  const verified = await verifyControlledByteEvidence({
    root: input.root,
    ref: input.inventory,
    label: input.label,
    max_bytes: MAX_IMAGE_BYTES,
    retain_bytes: true,
  });
  if (!verified.bytes) throw new Error(`${input.label} 未保留已验证图像字节`);
  const pixels = canonicalImagePixels(verified.bytes);
  if (pixels.mime_type !== input.inventory.mime_type || pixels.width !== input.inventory.width
    || pixels.height !== input.inventory.height) {
    throw new Error(`${input.label} 实际 MIME 或尺寸与 inventory 不匹配`);
  }
  if (pixels.canonical_pixel_sha256 !== input.inventory.canonical_pixel_sha256) {
    throw new Error(`${input.label} canonical 像素 SHA-256 不匹配`);
  }
  return {
    asset_uri: input.inventory.asset_uri,
    sha256: verified.sha256,
    byte_length: verified.byte_length,
    mime_type: pixels.mime_type,
    width: pixels.width,
    height: pixels.height,
    canonical_pixel_sha256: pixels.canonical_pixel_sha256,
    bytes: verified.bytes,
  };
}

function sameIds(actual: string[], expected: string[], label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} 未按冻结顺序精确闭合`);
}

/**
 * Reads and verifies every declared source/image/speech byte before returning
 * any usable case. This is deliberately not an execution gate: source-frame
 * derivation, external registry composition and the private run store are still
 * separate prerequisites.
 */
export async function prepareOracleGateBytePreflight(input: {
  root: string;
  dataset: SignedGoldDataset;
  manifest: OracleGateFormalInputManifest;
  spec: OracleGateFormalSpec | OracleGateFormalSpecV2;
  inventory: OracleGateByteInventory;
  video_probe: OracleGateVideoProbe;
  trusted_speech_reviewer_keys: ReadonlyMap<string, KeyLike>;
}): Promise<OracleGateBytePreflight> {
  const structural = prepareOracleGateFormalStructuralPreflight({
    dataset: input.dataset,
    manifest: input.manifest,
    spec: input.spec,
  });
  const report = validateOracleGateByteInventory(input.inventory);
  if (!report.valid) {
    throw new Error(`Formal Oracle byte inventory 无效：${report.issues.slice(0, 8).map((item) => `${item.path} ${item.message}`).join("；")}`);
  }
  if (digest(oracleGateByteInventorySha256Preimage(input.inventory)) !== input.inventory.inventory_sha256) {
    throw new Error("Formal Oracle byte inventory 内容哈希不匹配");
  }
  if (input.inventory.input_manifest_sha256 !== input.manifest.manifest_sha256
    || input.inventory.signed_gold_dataset_sha256 !== input.dataset.dataset_sha256) {
    throw new Error("Formal Oracle byte inventory 未绑定当前输入或 Signed Gold");
  }
  exactObject(input.video_probe.toolchain as unknown as Record<string, unknown>, {
    ffmpeg_binary_sha256: input.inventory.toolchain.ffmpeg_binary_sha256,
    ffprobe_binary_sha256: input.inventory.toolchain.ffprobe_binary_sha256,
    ffmpeg_version_sha256: input.inventory.toolchain.ffmpeg_version_sha256,
    ffprobe_version_sha256: input.inventory.toolchain.ffprobe_version_sha256,
  }, "toolchain");

  const formalSourceIds = input.manifest.sources.map((item) => item.source_video_id).sort();
  const inventorySourceIds = input.inventory.sources.map((item) => item.source_video_id).sort();
  sameIds(inventorySourceIds, formalSourceIds, "source_video_ids");
  const sourceById = new Map(input.inventory.sources.map((item) => [item.source_video_id, item.video]));
  for (const sourceId of formalSourceIds) {
    const video = sourceById.get(sourceId);
    if (!video) throw new Error(`缺少 source video inventory：${sourceId}`);
    const verified = await verifyControlledByteEvidence({
      root: input.root,
      ref: video,
      label: `source ${sourceId}`,
      max_bytes: MAX_SOURCE_VIDEO_BYTES,
      required_magic: { offset: 4, bytes: Buffer.from("ftyp") },
    });
    const metadata = await input.video_probe.probe(verified.path);
    await input.video_probe.verify_decodable(verified.path, video.video_stream_index);
    await assertControlledByteEvidenceUnchanged(verified, `source ${sourceId}`);
    exactObject(metadata as unknown as Record<string, unknown>, {
      mime_type: video.mime_type,
      duration_us: video.duration_us,
      width: video.width,
      height: video.height,
      video_stream_index: video.video_stream_index,
    }, `source ${sourceId}`);
  }

  const formalCaseIds = input.manifest.cases.map((item) => item.case_id).sort();
  const inventoryCaseIds = input.inventory.cases.map((item) => item.case_id).sort();
  sameIds(inventoryCaseIds, formalCaseIds, "case_ids");
  const inventoryByCase = new Map(input.inventory.cases.map((item) => [item.case_id, item]));
  const packageById = new Map(input.dataset.packages.map((item) => [item.package_id, item]));
  const verifiedCases: OracleGateVerifiedByteCase[] = [];

  for (const formalCase of input.manifest.cases) {
    const inventoryCase = inventoryByCase.get(formalCase.case_id);
    if (!inventoryCase || inventoryCase.source_video_id !== formalCase.source_video_id) {
      throw new Error(`case ${formalCase.case_id} 未绑定正确 source video`);
    }
    if (inventoryCase.static_final.timestamp_us !== secondsToUs(formalCase.static_final.timestamp, `${formalCase.case_id}.static_final.timestamp`)
      || inventoryCase.uniform_frame.timestamp_us !== secondsToUs(formalCase.uniform_frame.timestamp, `${formalCase.case_id}.uniform_frame.timestamp`)) {
      throw new Error(`case ${formalCase.case_id} 帧时间戳未与 Formal manifest 精确闭合`);
    }
    const packageRecord = packageById.get(formalCase.package_id);
    const group = packageRecord?.groups.find((item) => item.group_id === formalCase.group_id);
    const oracleEvidence = group?.visual_evidence.find((item) => item.evidence_id === group.canonical_visual_evidence_id);
    if (!group || !oracleEvidence || inventoryCase.oracle_comparison.evidence_id !== formalCase.oracle_comparison_evidence_id
      || inventoryCase.oracle_comparison.evidence_id !== oracleEvidence.evidence_id) {
      throw new Error(`case ${formalCase.case_id} canonical Oracle evidence 未闭合`);
    }

    exactObject(inventoryCase.speech.alignment_ledger as unknown as Record<string, unknown>, {
      asset_uri: formalCase.speech.ledger_uri,
      sha256: formalCase.speech.ledger_sha256,
    }, `${formalCase.case_id}.speech.alignment_ledger`);
    const [staticFinal, uniformFrame, oracleComparison, speech, alignmentLedger] = await Promise.all([
      verifyImage({ root: input.root, inventory: inventoryCase.static_final, expected: formalCase.static_final, label: `${formalCase.case_id}.static_final` }),
      verifyImage({ root: input.root, inventory: inventoryCase.uniform_frame, expected: formalCase.uniform_frame, label: `${formalCase.case_id}.uniform_frame` }),
      verifyImage({ root: input.root, inventory: inventoryCase.oracle_comparison, expected: oracleEvidence, label: `${formalCase.case_id}.oracle_comparison` }),
      verifyWhisperCppSpeechEvidence({
        root: input.root,
        files: {
          raw: inventoryCase.speech.raw,
          index: inventoryCase.speech.index,
          srt: inventoryCase.speech.srt,
          text: inventoryCase.speech.txt,
        },
        selected_segment_indexes: inventoryCase.speech.selected_segment_indexes,
        expected_selected_transcript_sha256: inventoryCase.speech.selected_transcript_sha256,
      }),
      verifyControlledByteEvidence({
        root: input.root,
        ref: inventoryCase.speech.alignment_ledger,
        label: `${formalCase.case_id}.speech.alignment_ledger`,
        max_bytes: 16 * 1024 * 1024,
        retain_bytes: true,
      }),
    ]);
    if (alignmentLedger.sha256 !== formalCase.speech.ledger_sha256) {
      throw new Error(`case ${formalCase.case_id} speech alignment ledger SHA-256 不匹配`);
    }
    const selectedSegments = speech.selected_segment_indexes.map((index) => speech.segments[index]);
    if (selectedSegments.some((item) => !item)) throw new Error(`case ${formalCase.case_id} selected speech segment 不存在`);
    const selectedSegmentIds = selectedSegments.map((item) => item.segment_id);
    sameIds(selectedSegmentIds, formalCase.speech.segment_ids, `${formalCase.case_id}.speech.segment_ids`);
    if (speech.selected_transcript_sha256 !== formalCase.speech.transcript_sha256
      || Buffer.byteLength(speech.selected_transcript) !== inventoryCase.speech.selected_transcript_byte_length
      || renderSelectedSpeech(speech.segments, speech.selected_segment_indexes) !== speech.selected_transcript) {
      throw new Error(`case ${formalCase.case_id} selected transcript 未与签字文本闭合`);
    }
    if (!alignmentLedger.bytes) throw new Error(`case ${formalCase.case_id} speech alignment ledger 字节未保留`);
    verifySignedSpeechAlignmentLedgerBytes({
      bytes: alignmentLedger.bytes,
      trusted_public_keys: input.trusted_speech_reviewer_keys,
      expected: {
        case_id: formalCase.case_id,
        source_video_id: formalCase.source_video_id,
        clip_start_us: inventoryCase.speech.clip_start_us,
        clip_end_us: inventoryCase.speech.clip_end_us,
        files: {
          raw: inventoryCase.speech.raw,
          index: inventoryCase.speech.index,
          srt: inventoryCase.speech.srt,
          text: inventoryCase.speech.txt,
        },
        selected_segments: selectedSegments.map((item) => ({
          segment_id: item.segment_id,
          segment_index: item.segment_index,
          start_ms: item.start_ms,
          end_ms: item.end_ms,
          text_sha256: digest(Buffer.from(item.text, "utf8")),
        })),
        selected_transcript_sha256: speech.selected_transcript_sha256,
        selected_transcript_byte_length: Buffer.byteLength(speech.selected_transcript),
      },
    });
    const eventStartUs = secondsToUs(formalCase.event_window.start, `${formalCase.case_id}.event_window.start`);
    const eventEndUs = secondsToUs(formalCase.event_window.end, `${formalCase.case_id}.event_window.end`);
    if (inventoryCase.speech.clip_start_us > eventStartUs || inventoryCase.speech.clip_end_us < eventEndUs) {
      throw new Error(`case ${formalCase.case_id} speech clip 未覆盖签字事件窗`);
    }
    if (selectedSegments.some((item) => inventoryCase.speech.clip_start_us + item.start_ms * 1000 < inventoryCase.speech.clip_start_us
      || inventoryCase.speech.clip_start_us + item.end_ms * 1000 > inventoryCase.speech.clip_end_us)) {
      throw new Error(`case ${formalCase.case_id} selected speech segment 超出声明 clip`);
    }
    verifiedCases.push({
      case_id: formalCase.case_id,
      source_video_id: formalCase.source_video_id,
      static_final: staticFinal,
      uniform_frame: uniformFrame,
      oracle_comparison: { ...oracleComparison, evidence_id: inventoryCase.oracle_comparison.evidence_id },
      speech: {
        selected_segment_ids: selectedSegmentIds,
        selected_segment_indexes: [...speech.selected_segment_indexes],
        selected_transcript: speech.selected_transcript,
        selected_transcript_sha256: speech.selected_transcript_sha256,
        selected_transcript_byte_length: Buffer.byteLength(speech.selected_transcript),
      },
    });
  }
  return {
    schema_version: "oracle-gate-byte-preflight-v1",
    status: "untrusted_media_bytes_valid",
    api_execution_allowed: false,
    reason: "source_frame_derivation_external_attestation_and_run_store_pending",
    source_frame_derivation_verified: false,
    inventory_sha256: input.inventory.inventory_sha256,
    dataset_sha256: input.dataset.dataset_sha256,
    input_manifest_sha256: input.manifest.manifest_sha256,
    spec_sha256: input.spec.spec_sha256,
    schedule_sha256: structural.schedule_sha256,
    source_count: formalSourceIds.length,
    case_count: verifiedCases.length,
    cases: verifiedCases,
  };
}
