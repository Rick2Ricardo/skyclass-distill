import { sha256Hex } from "./sha256.js";
import type { OracleGateImageBytePixelRef } from "./oracle-gate-bytes.js";

export const ORACLE_GATE_FRAME_DERIVATION = {
  extraction_rule_version: "first-normalized-presentation-pts-gte-v2",
  time_origin_version: "first-decoded-frame-pts-zero-v1",
  raster_rule_version: "ffmpeg-software-rgba8-nearest-native-aspect-v1",
  png_rule_version: "pngjs-7.0.0-rgba8-default-v1",
} as const;

export const ORACLE_GATE_FRAME_PROOF_SHA256_DOMAIN = "oracle-frame-derivation-proof-v1\0";
export const ORACLE_GATE_FRAME_PREFLIGHT_SHA256_DOMAIN = "oracle-gate-frame-derivation-preflight-v1\0";

export type OracleGateFrameRole = "static_final" | "uniform_frame";

export interface OracleGateFrameDerivationProofV1 {
  schema_version: "oracle-frame-derivation-proof-v1";
  proof_sha256: string;
  case_id: string;
  role: OracleGateFrameRole;
  source_video_id: string;
  source_video_sha256: string;
  video_stream_index: number;
  requested_timestamp_us: number;
  previous_normalized_pts_us: number | null;
  selected_normalized_pts_us: number;
  selected_frame_ordinal: number;
  timestamp_choice_rule_version: string;
  frame_extraction_rule_version: typeof ORACLE_GATE_FRAME_DERIVATION.extraction_rule_version;
  time_origin_version: typeof ORACLE_GATE_FRAME_DERIVATION.time_origin_version;
  raster_rule_version: typeof ORACLE_GATE_FRAME_DERIVATION.raster_rule_version;
  png_rule_version: typeof ORACLE_GATE_FRAME_DERIVATION.png_rule_version;
  ffmpeg_binary_sha256: string;
  ffmpeg_version_sha256: string;
  argv_sha256: string;
  output: OracleGateImageBytePixelRef & { mime_type: "image/png" };
}

export interface OracleGateFrameDerivationCaseV1 {
  case_id: string;
  source_video_id: string;
  static_final: OracleGateFrameDerivationProofV1;
  uniform_frame: OracleGateFrameDerivationProofV1;
}

export interface OracleGateFrameDerivationPreflightV1 {
  schema_version: "oracle-gate-frame-derivation-preflight-v1";
  preflight_sha256: string;
  status: "untrusted_source_frame_derivation_valid";
  source_frame_derivation_verified: true;
  api_execution_allowed: false;
  reason: "external_media_attestation_and_run_store_pending";
  inventory_sha256: string;
  input_manifest_sha256: string;
  signed_gold_dataset_sha256: string;
  case_count: number;
  proof_set_sha256: string;
  cases: OracleGateFrameDerivationCaseV1[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return "null";
}

export function canonicalOracleGateFrameProofPayload(input: OracleGateFrameDerivationProofV1): string {
  const { proof_sha256: _proofSha, ...payload } = input;
  return stableJson(payload);
}

export function hashOracleGateFrameProof(input: OracleGateFrameDerivationProofV1): string {
  return sha256Hex(`${ORACLE_GATE_FRAME_PROOF_SHA256_DOMAIN}${canonicalOracleGateFrameProofPayload(input)}`);
}

export function canonicalOracleGateFramePreflightPayload(input: OracleGateFrameDerivationPreflightV1): string {
  const { preflight_sha256: _preflightSha, ...payload } = input;
  return stableJson(payload);
}

export function hashOracleGateFramePreflight(input: OracleGateFrameDerivationPreflightV1): string {
  return sha256Hex(`${ORACLE_GATE_FRAME_PREFLIGHT_SHA256_DOMAIN}${canonicalOracleGateFramePreflightPayload(input)}`);
}

export function hashOracleGateFrameProofSet(cases: OracleGateFrameDerivationCaseV1[]): string {
  const ordered = [...cases].sort((left, right) => left.case_id.localeCompare(right.case_id));
  return sha256Hex(`${ORACLE_GATE_FRAME_PROOF_SHA256_DOMAIN}set\0${stableJson(ordered.map((item) => ({
    case_id: item.case_id,
    source_video_id: item.source_video_id,
    static_final: item.static_final.proof_sha256,
    uniform_frame: item.uniform_frame.proof_sha256,
  })))}`);
}

function exactKeys(raw: Record<string, unknown>, expected: readonly string[], path: string, issues: string[]): void {
  const allowed = new Set(expected);
  for (const key of expected) if (!Object.prototype.hasOwnProperty.call(raw, key)) issues.push(`${path}.${key} 缺少必需字段`);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) issues.push(`${path}.${key} 包含未注册字段`);
}

function isSha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function isInt(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function isSafeRelativeUri(value: unknown): value is string {
  if (!isText(value) || value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
  let decoded = value;
  let stable = false;
  try {
    for (let index = 0; index < 16; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) { stable = true; break; }
      decoded = next;
    }
  } catch {
    return false;
  }
  return stable && Boolean(decoded) && !decoded.includes("\\") && !decoded.includes("\0") && !decoded.startsWith("/")
    && !/^[a-z][a-z0-9+.-]*:/i.test(decoded)
    && decoded.split("/").every((part) => Boolean(part) && part !== "." && part !== "..");
}

function validateOutput(raw: unknown, path: string, issues: string[]): void {
  if (!isRecord(raw)) { issues.push(`${path} 必须是对象`); return; }
  exactKeys(raw, ["asset_uri", "sha256", "byte_length", "mime_type", "width", "height", "canonical_pixel_sha256"], path, issues);
  if (!isSafeRelativeUri(raw.asset_uri)) issues.push(`${path}.asset_uri 必须是受控相对路径`);
  if (!isSha(raw.sha256)) issues.push(`${path}.sha256 无效`);
  if (!isInt(raw.byte_length, 1)) issues.push(`${path}.byte_length 无效`);
  if (raw.mime_type !== "image/png") issues.push(`${path}.mime_type 必须是 image/png`);
  if (!isInt(raw.width, 1) || !isInt(raw.height, 1)) issues.push(`${path} 尺寸无效`);
  if (!isSha(raw.canonical_pixel_sha256)) issues.push(`${path}.canonical_pixel_sha256 无效`);
}

function validateProof(raw: unknown, path: string, role: OracleGateFrameRole, issues: string[]): void {
  if (!isRecord(raw)) { issues.push(`${path} 必须是对象`); return; }
  exactKeys(raw, [
    "schema_version", "proof_sha256", "case_id", "role", "source_video_id", "source_video_sha256",
    "video_stream_index", "requested_timestamp_us", "previous_normalized_pts_us", "selected_normalized_pts_us",
    "selected_frame_ordinal", "timestamp_choice_rule_version", "frame_extraction_rule_version", "time_origin_version",
    "raster_rule_version", "png_rule_version", "ffmpeg_binary_sha256", "ffmpeg_version_sha256", "argv_sha256", "output",
  ], path, issues);
  if (raw.schema_version !== "oracle-frame-derivation-proof-v1") issues.push(`${path}.schema_version 无效`);
  if (!isSha(raw.proof_sha256)) issues.push(`${path}.proof_sha256 无效`);
  if (!isText(raw.case_id) || !isText(raw.source_video_id)) issues.push(`${path} case/source 不能为空`);
  if (raw.role !== role) issues.push(`${path}.role 必须是 ${role}`);
  for (const field of ["source_video_sha256", "ffmpeg_binary_sha256", "ffmpeg_version_sha256", "argv_sha256"] as const) if (!isSha(raw[field])) issues.push(`${path}.${field} 无效`);
  for (const field of ["video_stream_index", "requested_timestamp_us", "selected_normalized_pts_us", "selected_frame_ordinal"] as const) if (!isInt(raw[field], 0)) issues.push(`${path}.${field} 无效`);
  if (raw.previous_normalized_pts_us !== null && !isInt(raw.previous_normalized_pts_us, 0)) issues.push(`${path}.previous_normalized_pts_us 无效`);
  if (isInt(raw.requested_timestamp_us, 0) && isInt(raw.selected_normalized_pts_us, 0) && raw.selected_normalized_pts_us < raw.requested_timestamp_us) issues.push(`${path} selected PTS 必须不早于 requested PTS`);
  if (isInt(raw.previous_normalized_pts_us, 0) && isInt(raw.requested_timestamp_us, 0) && raw.previous_normalized_pts_us >= raw.requested_timestamp_us) issues.push(`${path} previous PTS 必须早于 requested PTS`);
  if (isInt(raw.selected_frame_ordinal, 0) && ((raw.selected_frame_ordinal === 0) !== (raw.previous_normalized_pts_us === null))) issues.push(`${path} previous PTS 必须与 selected ordinal 闭合`);
  if (raw.selected_frame_ordinal === 0 && raw.selected_normalized_pts_us !== 0) issues.push(`${path} normalized 首帧必须是 PTS 0`);
  if (!isText(raw.timestamp_choice_rule_version)) issues.push(`${path}.timestamp_choice_rule_version 不能为空`);
  if (raw.frame_extraction_rule_version !== ORACLE_GATE_FRAME_DERIVATION.extraction_rule_version) issues.push(`${path}.frame_extraction_rule_version 无效`);
  if (raw.time_origin_version !== ORACLE_GATE_FRAME_DERIVATION.time_origin_version) issues.push(`${path}.time_origin_version 无效`);
  if (raw.raster_rule_version !== ORACLE_GATE_FRAME_DERIVATION.raster_rule_version) issues.push(`${path}.raster_rule_version 无效`);
  if (raw.png_rule_version !== ORACLE_GATE_FRAME_DERIVATION.png_rule_version) issues.push(`${path}.png_rule_version 无效`);
  validateOutput(raw.output, `${path}.output`, issues);
  if (isSha(raw.proof_sha256) && hashOracleGateFrameProof(raw as unknown as OracleGateFrameDerivationProofV1) !== raw.proof_sha256) issues.push(`${path}.proof_sha256 内容哈希不匹配`);
}

export function validateOracleGateFrameDerivationPreflight(input: unknown): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!isRecord(input)) return { valid: false, issues: ["$ 必须是对象"] };
  exactKeys(input, [
    "schema_version", "preflight_sha256", "status", "source_frame_derivation_verified", "api_execution_allowed", "reason",
    "inventory_sha256", "input_manifest_sha256", "signed_gold_dataset_sha256", "case_count", "proof_set_sha256", "cases",
  ], "$", issues);
  if (input.schema_version !== "oracle-gate-frame-derivation-preflight-v1") issues.push("$.schema_version 无效");
  if (input.status !== "untrusted_source_frame_derivation_valid") issues.push("$.status 无效");
  if (input.source_frame_derivation_verified !== true) issues.push("$.source_frame_derivation_verified 必须为 true");
  if (input.api_execution_allowed !== false) issues.push("$.api_execution_allowed 必须为 false");
  if (input.reason !== "external_media_attestation_and_run_store_pending") issues.push("$.reason 无效");
  for (const field of ["preflight_sha256", "inventory_sha256", "input_manifest_sha256", "signed_gold_dataset_sha256", "proof_set_sha256"] as const) if (!isSha(input[field])) issues.push(`$.${field} 无效`);
  if (!Array.isArray(input.cases) || !input.cases.length) issues.push("$.cases 必须是非空数组");
  const seen = new Set<string>();
  const sourceBindings = new Map<string, string>();
  let previousCaseId = "";
  for (const [index, raw] of (Array.isArray(input.cases) ? input.cases : []).entries()) {
    const path = `$.cases[${index}]`;
    if (!isRecord(raw)) { issues.push(`${path} 必须是对象`); continue; }
    exactKeys(raw, ["case_id", "source_video_id", "static_final", "uniform_frame"], path, issues);
    if (!isText(raw.case_id) || seen.has(String(raw.case_id))) issues.push(`${path}.case_id 不能为空或重复`);
    else {
      if (previousCaseId && raw.case_id.localeCompare(previousCaseId) <= 0) issues.push(`${path}.case_id 必须严格按字典序排列`);
      previousCaseId = raw.case_id;
      seen.add(raw.case_id);
    }
    if (!isText(raw.source_video_id)) issues.push(`${path}.source_video_id 不能为空`);
    validateProof(raw.static_final, `${path}.static_final`, "static_final", issues);
    validateProof(raw.uniform_frame, `${path}.uniform_frame`, "uniform_frame", issues);
    for (const proof of [raw.static_final, raw.uniform_frame]) {
      if (isRecord(proof) && (proof.case_id !== raw.case_id || proof.source_video_id !== raw.source_video_id)) issues.push(`${path} proof 未绑定所属 case/source`);
    }
    if (isRecord(raw.static_final) && isRecord(raw.uniform_frame)) {
      const staticProof = raw.static_final;
      const uniformProof = raw.uniform_frame;
      if (staticProof.proof_sha256 === uniformProof.proof_sha256) issues.push(`${path} Static/Uniform proof 不得重复`);
      const staticOutput = isRecord(staticProof.output) ? staticProof.output : null;
      const uniformOutput = isRecord(uniformProof.output) ? uniformProof.output : null;
      if (staticOutput && uniformOutput && (staticOutput.sha256 === uniformOutput.sha256
        || staticOutput.canonical_pixel_sha256 === uniformOutput.canonical_pixel_sha256)) issues.push(`${path} Static/Uniform 输出不得复用同一字节或像素`);
      const bindingFields = ["source_video_sha256", "video_stream_index", "ffmpeg_binary_sha256", "ffmpeg_version_sha256"] as const;
      if (bindingFields.some((field) => staticProof[field] !== uniformProof[field])) issues.push(`${path} Static/Uniform 必须绑定同一 source/stream/toolchain`);
      if (isText(raw.source_video_id)) {
        const binding = JSON.stringify(bindingFields.map((field) => staticProof[field]));
        const existing = sourceBindings.get(raw.source_video_id);
        if (existing && existing !== binding) issues.push(`${path} 同一 source_video_id 的 source/stream/toolchain 绑定不得漂移`);
        else sourceBindings.set(raw.source_video_id, binding);
      }
    }
  }
  if (!isInt(input.case_count, 1) || (Array.isArray(input.cases) && input.case_count !== input.cases.length)) issues.push("$.case_count 与 cases 不一致");
  if (Array.isArray(input.cases)) {
    const typed = input.cases as unknown as OracleGateFrameDerivationCaseV1[];
    if (isSha(input.proof_set_sha256) && hashOracleGateFrameProofSet(typed) !== input.proof_set_sha256) issues.push("$.proof_set_sha256 内容哈希不匹配");
    if (isSha(input.preflight_sha256) && hashOracleGateFramePreflight(input as unknown as OracleGateFrameDerivationPreflightV1) !== input.preflight_sha256) issues.push("$.preflight_sha256 内容哈希不匹配");
  }
  return { valid: issues.length === 0, issues };
}
