import type { KeyLike } from "node:crypto";
import type {
  OracleGateByteInventory,
  OracleGateFormalInputManifest,
  OracleGateFormalSpec,
  OracleGateFormalSpecV2,
  OracleGateFrameDerivationCaseV1,
  OracleGateFrameDerivationPreflightV1,
  OracleGateFrameDerivationProofV1,
  OracleGateFrameRole,
  SignedGoldDataset,
} from "../../contracts/src/index.js";
import {
  ORACLE_GATE_FRAME_DERIVATION,
  hashOracleGateFramePreflight,
  hashOracleGateFrameProof,
  hashOracleGateFrameProofSet,
  validateOracleGateFrameDerivationPreflight,
} from "../../contracts/src/oracle-gate-frame-derivation.js";
import {
  assertControlledByteEvidenceUnchanged,
  verifyControlledByteEvidence,
} from "../../media/src/byteEvidence.js";
import { canonicalImagePixels, encodeCanonicalRgbaPng } from "../../media/src/imageEvidence.js";
import type { OracleGateDerivedFrame, OracleGateFrameDeriver } from "../../media/src/videoEvidence.js";
import { prepareOracleGateBytePreflight } from "./oracleBytePreflight.js";

const MAX_SOURCE_VIDEO_BYTES = 32 * 1024 * 1024 * 1024;

function outputRef(image: OracleGateByteInventory["cases"][number]["static_final"]) {
  return {
    asset_uri: image.asset_uri,
    sha256: image.sha256,
    byte_length: image.byte_length,
    mime_type: image.mime_type,
    width: image.width,
    height: image.height,
    canonical_pixel_sha256: image.canonical_pixel_sha256,
  };
}

function buildProof(input: {
  case_id: string;
  source_video_id: string;
  role: OracleGateFrameRole;
  source_sha256: string;
  stream_index: number;
  requested_timestamp_us: number;
  timestamp_choice_rule_version: string;
  expected: OracleGateByteInventory["cases"][number]["static_final"];
  expected_bytes: Buffer;
  derived: OracleGateDerivedFrame;
  ffmpeg_binary_sha256: string;
  ffmpeg_version_sha256: string;
}): OracleGateFrameDerivationProofV1 {
  if (input.expected.mime_type !== "image/png") throw new Error(`${input.case_id}.${input.role} 必须迁移为 lossless canonical PNG`);
  if (input.derived.request_id !== `${input.case_id}:${input.role}`
    || input.derived.width !== input.expected.width || input.derived.height !== input.expected.height) {
    throw new Error(`${input.case_id}.${input.role} 派生帧未绑定正确请求或尺寸`);
  }
  const canonicalPng = encodeCanonicalRgbaPng(input.derived.width, input.derived.height, input.derived.rgba);
  if (!canonicalPng.equals(input.expected_bytes)) {
    throw new Error(`${input.case_id}.${input.role} 源视频派生 canonical PNG 字节与冻结资产不一致`);
  }
  const pixels = canonicalImagePixels(canonicalPng);
  if (pixels.canonical_pixel_sha256 !== input.expected.canonical_pixel_sha256) {
    throw new Error(`${input.case_id}.${input.role} 源视频派生 canonical 像素与冻结资产不一致`);
  }
  const proof: OracleGateFrameDerivationProofV1 = {
    schema_version: "oracle-frame-derivation-proof-v1",
    proof_sha256: "0".repeat(64),
    case_id: input.case_id,
    role: input.role,
    source_video_id: input.source_video_id,
    source_video_sha256: input.source_sha256,
    video_stream_index: input.stream_index,
    requested_timestamp_us: input.requested_timestamp_us,
    previous_normalized_pts_us: input.derived.previous_normalized_pts_us,
    selected_normalized_pts_us: input.derived.selected_normalized_pts_us,
    selected_frame_ordinal: input.derived.selected_frame_ordinal,
    timestamp_choice_rule_version: input.timestamp_choice_rule_version,
    frame_extraction_rule_version: ORACLE_GATE_FRAME_DERIVATION.extraction_rule_version,
    time_origin_version: ORACLE_GATE_FRAME_DERIVATION.time_origin_version,
    raster_rule_version: ORACLE_GATE_FRAME_DERIVATION.raster_rule_version,
    png_rule_version: ORACLE_GATE_FRAME_DERIVATION.png_rule_version,
    ffmpeg_binary_sha256: input.ffmpeg_binary_sha256,
    ffmpeg_version_sha256: input.ffmpeg_version_sha256,
    argv_sha256: input.derived.argv_sha256,
    output: outputRef(input.expected) as OracleGateFrameDerivationProofV1["output"],
  };
  proof.proof_sha256 = hashOracleGateFrameProof(proof);
  return proof;
}

/**
 * Fourth, still non-executable Formal Oracle layer. It proves that each frozen
 * Static/Uniform PNG is the deterministic first normalized presentation frame
 * at or after its signed timestamp. It never returns an API capability.
 */
export async function prepareOracleGateFrameDerivationPreflight(input: {
  root: string;
  dataset: SignedGoldDataset;
  manifest: OracleGateFormalInputManifest;
  spec: OracleGateFormalSpec | OracleGateFormalSpecV2;
  inventory: OracleGateByteInventory;
  frame_deriver: OracleGateFrameDeriver;
  trusted_speech_reviewer_keys: ReadonlyMap<string, KeyLike>;
}): Promise<OracleGateFrameDerivationPreflightV1> {
  const bytePreflight = await prepareOracleGateBytePreflight({
    root: input.root,
    dataset: input.dataset,
    manifest: input.manifest,
    spec: input.spec,
    inventory: input.inventory,
    video_probe: input.frame_deriver,
    trusted_speech_reviewer_keys: input.trusted_speech_reviewer_keys,
  });
  const verifiedCaseById = new Map(bytePreflight.cases.map((item) => [item.case_id, item]));
  const formalCaseById = new Map(input.manifest.cases.map((item) => [item.case_id, item]));
  const inventoryCaseById = new Map(input.inventory.cases.map((item) => [item.case_id, item]));
  const cases: OracleGateFrameDerivationCaseV1[] = [];

  for (const source of input.inventory.sources) {
    const verifiedSource = await verifyControlledByteEvidence({
      root: input.root,
      ref: source.video,
      label: `frame derivation source ${source.source_video_id}`,
      max_bytes: MAX_SOURCE_VIDEO_BYTES,
      required_magic: { offset: 4, bytes: Buffer.from("ftyp") },
    });
    const sourceCases = input.inventory.cases
      .filter((item) => item.source_video_id === source.source_video_id)
      .sort((left, right) => left.case_id.localeCompare(right.case_id));
    for (const item of sourceCases) {
      for (const [role, image] of [["static_final", item.static_final], ["uniform_frame", item.uniform_frame]] as const) {
        if (BigInt(source.video.width) * BigInt(image.height) !== BigInt(source.video.height) * BigInt(image.width)) {
          throw new Error(`${item.case_id}.${role} 输出尺寸必须保持来源视频宽高比`);
        }
      }
    }
    const requests = sourceCases.flatMap((item) => ([
      { request_id: `${item.case_id}:static_final`, timestamp_us: item.static_final.timestamp_us, output_width: item.static_final.width, output_height: item.static_final.height },
      { request_id: `${item.case_id}:uniform_frame`, timestamp_us: item.uniform_frame.timestamp_us, output_width: item.uniform_frame.width, output_height: item.uniform_frame.height },
    ]));
    const derived = await input.frame_deriver.derive_frames({
      path: verifiedSource.path,
      source_sha256: source.video.sha256,
      source_byte_length: source.video.byte_length,
      source_width: source.video.width,
      source_height: source.video.height,
      video_stream_index: source.video.video_stream_index,
      requests,
    });
    await assertControlledByteEvidenceUnchanged(verifiedSource, `frame derivation source ${source.source_video_id}`);
    const derivedById = new Map(derived.map((item) => [item.request_id, item]));
    if (derivedById.size !== requests.length || derived.length !== requests.length) throw new Error(`source ${source.source_video_id} 抽帧结果数量或 request_id 无效`);

    for (const inventoryCase of sourceCases) {
      const formalCase = formalCaseById.get(inventoryCase.case_id);
      const verifiedCase = verifiedCaseById.get(inventoryCase.case_id);
      if (!formalCase || !verifiedCase || inventoryCaseById.get(inventoryCase.case_id) !== inventoryCase) {
        throw new Error(`case ${inventoryCase.case_id} 未闭合到 byte preflight`);
      }
      const staticDerived = derivedById.get(`${inventoryCase.case_id}:static_final`);
      const uniformDerived = derivedById.get(`${inventoryCase.case_id}:uniform_frame`);
      if (!staticDerived || !uniformDerived) throw new Error(`case ${inventoryCase.case_id} 缺少 Static/Uniform 派生帧`);
      cases.push({
        case_id: inventoryCase.case_id,
        source_video_id: source.source_video_id,
        static_final: buildProof({
          case_id: inventoryCase.case_id,
          source_video_id: source.source_video_id,
          role: "static_final",
          source_sha256: source.video.sha256,
          stream_index: source.video.video_stream_index,
          requested_timestamp_us: inventoryCase.static_final.timestamp_us,
          timestamp_choice_rule_version: formalCase.static_final.selection_rule_version,
          expected: inventoryCase.static_final,
          expected_bytes: verifiedCase.static_final.bytes,
          derived: staticDerived,
          ffmpeg_binary_sha256: input.frame_deriver.toolchain.ffmpeg_binary_sha256,
          ffmpeg_version_sha256: input.frame_deriver.toolchain.ffmpeg_version_sha256,
        }),
        uniform_frame: buildProof({
          case_id: inventoryCase.case_id,
          source_video_id: source.source_video_id,
          role: "uniform_frame",
          source_sha256: source.video.sha256,
          stream_index: source.video.video_stream_index,
          requested_timestamp_us: inventoryCase.uniform_frame.timestamp_us,
          timestamp_choice_rule_version: formalCase.uniform_frame.selection_rule_version,
          expected: inventoryCase.uniform_frame,
          expected_bytes: verifiedCase.uniform_frame.bytes,
          derived: uniformDerived,
          ffmpeg_binary_sha256: input.frame_deriver.toolchain.ffmpeg_binary_sha256,
          ffmpeg_version_sha256: input.frame_deriver.toolchain.ffmpeg_version_sha256,
        }),
      });
    }
  }
  cases.sort((left, right) => left.case_id.localeCompare(right.case_id));
  const preflight: OracleGateFrameDerivationPreflightV1 = {
    schema_version: "oracle-gate-frame-derivation-preflight-v1",
    preflight_sha256: "0".repeat(64),
    status: "untrusted_source_frame_derivation_valid",
    source_frame_derivation_verified: true,
    api_execution_allowed: false,
    reason: "external_media_attestation_and_run_store_pending",
    inventory_sha256: input.inventory.inventory_sha256,
    input_manifest_sha256: input.manifest.manifest_sha256,
    signed_gold_dataset_sha256: input.dataset.dataset_sha256,
    case_count: cases.length,
    proof_set_sha256: hashOracleGateFrameProofSet(cases),
    cases,
  };
  preflight.preflight_sha256 = hashOracleGateFramePreflight(preflight);
  const report = validateOracleGateFrameDerivationPreflight(preflight);
  if (!report.valid) throw new Error(`Formal Oracle frame derivation preflight 无效：${report.issues.slice(0, 8).join("；")}`);
  return preflight;
}
