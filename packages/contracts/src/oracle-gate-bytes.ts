export const ORACLE_GATE_BYTE_INVENTORY_SHA256_DOMAIN = "oracle-gate-byte-inventory-v1\0";

export const ORACLE_GATE_BYTE_TOOLCHAIN = {
  pixel_hash_version: "oracle-rgba8-v1",
  image_decoder_version: "jpeg-js-0.4.4+pngjs-7.0.0",
  frame_selection_version: "first-pts-gte-v1",
  canvas_version: "oracle-canvas-1920x360-jpeg-q88-v1",
  speech_parser_version: "whisper-cpp-offset-locked-v1",
  transcript_render_version: "selected-segments-timestamped-v1",
} as const;

export interface OracleGateByteRef {
  asset_uri: string;
  sha256: string;
  byte_length: number;
}

export interface OracleGateSourceVideoByteRef extends OracleGateByteRef {
  mime_type: "video/mp4";
  duration_us: number;
  width: number;
  height: number;
  video_stream_index: number;
}

export interface OracleGateImageBytePixelRef extends OracleGateByteRef {
  mime_type: "image/png" | "image/jpeg";
  width: number;
  height: number;
  canonical_pixel_sha256: string;
}

export interface OracleGateTimestampedImageBytePixelRef extends OracleGateImageBytePixelRef {
  timestamp_us: number;
}

export interface OracleGateByteInventorySource {
  source_video_id: string;
  video: OracleGateSourceVideoByteRef;
}

export interface OracleGateSpeechByteRefs {
  clip_start_us: number;
  clip_end_us: number;
  alignment_ledger: OracleGateByteRef;
  raw: OracleGateByteRef;
  index: OracleGateByteRef;
  srt: OracleGateByteRef;
  txt: OracleGateByteRef;
  selected_segment_indexes: number[];
  selected_transcript_sha256: string;
  selected_transcript_byte_length: number;
}

export interface OracleGateByteInventoryCase {
  case_id: string;
  source_video_id: string;
  static_final: OracleGateTimestampedImageBytePixelRef;
  uniform_frame: OracleGateTimestampedImageBytePixelRef;
  oracle_comparison: OracleGateImageBytePixelRef & { evidence_id: string };
  speech: OracleGateSpeechByteRefs;
}

export interface OracleGateByteInventoryToolchain {
  pixel_hash_version: typeof ORACLE_GATE_BYTE_TOOLCHAIN.pixel_hash_version;
  image_decoder_version: typeof ORACLE_GATE_BYTE_TOOLCHAIN.image_decoder_version;
  frame_selection_version: typeof ORACLE_GATE_BYTE_TOOLCHAIN.frame_selection_version;
  canvas_version: typeof ORACLE_GATE_BYTE_TOOLCHAIN.canvas_version;
  speech_parser_version: typeof ORACLE_GATE_BYTE_TOOLCHAIN.speech_parser_version;
  transcript_render_version: typeof ORACLE_GATE_BYTE_TOOLCHAIN.transcript_render_version;
  ffmpeg_binary_sha256: string;
  ffprobe_binary_sha256: string;
  ffmpeg_version_sha256: string;
  ffprobe_version_sha256: string;
}

export interface OracleGateByteInventory {
  schema_version: "oracle-gate-byte-inventory-v1";
  inventory_sha256: string;
  status: "untrusted_inventory";
  api_execution_allowed: false;
  reason: "inventory_not_byte_verified_or_attested";
  input_manifest_sha256: string;
  signed_gold_dataset_sha256: string;
  toolchain: OracleGateByteInventoryToolchain;
  sources: OracleGateByteInventorySource[];
  cases: OracleGateByteInventoryCase[];
}

export interface OracleGateByteInventoryValidationIssue {
  path: string;
  message: string;
}

export interface OracleGateByteInventoryValidationReport {
  valid: boolean;
  issues: OracleGateByteInventoryValidationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isSafeIntegerAtLeast(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function isSafeRelativeUri(value: unknown): value is string {
  if (!isNonEmpty(value) || value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
  let decoded = value;
  let stable = false;
  try {
    for (let index = 0; index < 16; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        stable = true;
        break;
      }
      decoded = next;
    }
  } catch {
    return false;
  }
  if (!stable || !decoded || decoded.includes("\\") || decoded.includes("\0") || decoded.startsWith("/")
    || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) return false;
  return decoded.split("/").every((part) => Boolean(part) && part !== "." && part !== "..");
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

/** Canonical inventory content; the self-addressing inventory_sha256 field is excluded. */
export function canonicalOracleGateByteInventoryPayload(input: OracleGateByteInventory): string {
  const { inventory_sha256: _inventorySha256, ...payload } = input;
  return stableJson(payload);
}

/** Domain-separated SHA-256 preimage. Hash this UTF-8 string, never the bare canonical JSON. */
export function oracleGateByteInventorySha256Preimage(input: OracleGateByteInventory): string {
  return `${ORACLE_GATE_BYTE_INVENTORY_SHA256_DOMAIN}${canonicalOracleGateByteInventoryPayload(input)}`;
}

type Issue = (path: string, message: string) => void;

function exactKeys(raw: Record<string, unknown>, expected: readonly string[], path: string, issue: Issue): void {
  const allowed = new Set(expected);
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) issue(`${path}.${key}`, "缺少必需字段");
  }
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) issue(`${path}.${key}`, "包含未注册字段");
  }
}

function validateByteRef(raw: unknown, path: string, issue: Issue): raw is Record<string, unknown> {
  if (!isRecord(raw)) {
    issue(path, "必须是对象");
    return false;
  }
  exactKeys(raw, ["asset_uri", "sha256", "byte_length"], path, issue);
  if (!isSafeRelativeUri(raw.asset_uri)) issue(`${path}.asset_uri`, "必须是受控相对路径");
  if (!isSha256(raw.sha256)) issue(`${path}.sha256`, "必须是小写 SHA-256");
  if (!isSafeIntegerAtLeast(raw.byte_length, 1)) issue(`${path}.byte_length`, "必须是正安全整数");
  return true;
}

function validateImageRef(raw: unknown, path: string, issue: Issue, timestamped: boolean, oracle: boolean): void {
  if (!isRecord(raw)) {
    issue(path, "必须是对象");
    return;
  }
  const expected = [
    "asset_uri",
    "sha256",
    "byte_length",
    "mime_type",
    "width",
    "height",
    "canonical_pixel_sha256",
    ...(timestamped ? ["timestamp_us"] : []),
    ...(oracle ? ["evidence_id"] : []),
  ];
  exactKeys(raw, expected, path, issue);
  if (!isSafeRelativeUri(raw.asset_uri)) issue(`${path}.asset_uri`, "必须是受控相对路径");
  if (!isSha256(raw.sha256)) issue(`${path}.sha256`, "必须是小写 SHA-256");
  if (!isSafeIntegerAtLeast(raw.byte_length, 1)) issue(`${path}.byte_length`, "必须是正安全整数");
  if (raw.mime_type !== "image/png" && raw.mime_type !== "image/jpeg") issue(`${path}.mime_type`, "只允许 PNG/JPEG");
  if (!isSafeIntegerAtLeast(raw.width, 1)) issue(`${path}.width`, "必须是正安全整数");
  if (!isSafeIntegerAtLeast(raw.height, 1)) issue(`${path}.height`, "必须是正安全整数");
  if (isSafeIntegerAtLeast(raw.width, 1) && isSafeIntegerAtLeast(raw.height, 1)
    && !Number.isSafeInteger(raw.width * raw.height)) issue(path, "图像像素数必须是安全整数");
  if (!isSha256(raw.canonical_pixel_sha256)) issue(`${path}.canonical_pixel_sha256`, "必须是小写 SHA-256");
  if (timestamped && !isSafeIntegerAtLeast(raw.timestamp_us, 0)) issue(`${path}.timestamp_us`, "必须是非负安全整数微秒");
  if (oracle && !isNonEmpty(raw.evidence_id)) issue(`${path}.evidence_id`, "不能为空");
}

function validateVideoRef(raw: unknown, path: string, issue: Issue): void {
  if (!isRecord(raw)) {
    issue(path, "必须是对象");
    return;
  }
  exactKeys(raw, [
    "asset_uri",
    "sha256",
    "byte_length",
    "mime_type",
    "duration_us",
    "width",
    "height",
    "video_stream_index",
  ], path, issue);
  if (!isSafeRelativeUri(raw.asset_uri)) issue(`${path}.asset_uri`, "必须是受控相对路径");
  if (!isSha256(raw.sha256)) issue(`${path}.sha256`, "必须是小写 SHA-256");
  if (!isSafeIntegerAtLeast(raw.byte_length, 1)) issue(`${path}.byte_length`, "必须是正安全整数");
  if (raw.mime_type !== "video/mp4") issue(`${path}.mime_type`, "只允许 video/mp4");
  for (const field of ["duration_us", "width", "height"] as const) {
    if (!isSafeIntegerAtLeast(raw[field], 1)) issue(`${path}.${field}`, "必须是正安全整数");
  }
  if (!isSafeIntegerAtLeast(raw.video_stream_index, 0)) issue(`${path}.video_stream_index`, "必须是非负安全整数");
}

function validateSpeech(raw: unknown, path: string, durationUs: number | undefined, issue: Issue): void {
  if (!isRecord(raw)) {
    issue(path, "必须是对象");
    return;
  }
  exactKeys(raw, [
    "clip_start_us",
    "clip_end_us",
    "alignment_ledger",
    "raw",
    "index",
    "srt",
    "txt",
    "selected_segment_indexes",
    "selected_transcript_sha256",
    "selected_transcript_byte_length",
  ], path, issue);
  if (!isSafeIntegerAtLeast(raw.clip_start_us, 0)) issue(`${path}.clip_start_us`, "必须是非负安全整数微秒");
  if (!isSafeIntegerAtLeast(raw.clip_end_us, 1)) issue(`${path}.clip_end_us`, "必须是正安全整数微秒");
  if (isSafeIntegerAtLeast(raw.clip_start_us, 0) && isSafeIntegerAtLeast(raw.clip_end_us, 1)
    && raw.clip_start_us >= raw.clip_end_us) issue(path, "clip_start_us 必须小于 clip_end_us");
  if (durationUs !== undefined && isSafeIntegerAtLeast(raw.clip_end_us, 1) && raw.clip_end_us > durationUs) {
    issue(`${path}.clip_end_us`, "不得超过来源视频时长");
  }
  const artifactUris: string[] = [];
  const artifactHashes: string[] = [];
  for (const field of ["alignment_ledger", "raw", "index", "srt", "txt"] as const) {
    if (validateByteRef(raw[field], `${path}.${field}`, issue)) {
      const ref = raw[field] as Record<string, unknown>;
      if (typeof ref.asset_uri === "string") artifactUris.push(ref.asset_uri);
      if (typeof ref.sha256 === "string") artifactHashes.push(ref.sha256);
    }
  }
  if (new Set(artifactUris).size !== artifactUris.length) issue(path, "alignment/raw/index/srt/txt 必须引用五个不同路径");
  if (new Set(artifactHashes).size !== artifactHashes.length) issue(path, "alignment/raw/index/srt/txt 必须具有五个不同文件 SHA");
  if (!Array.isArray(raw.selected_segment_indexes) || !raw.selected_segment_indexes.length) {
    issue(`${path}.selected_segment_indexes`, "必须是非空数组");
  } else {
    let previous = -1;
    raw.selected_segment_indexes.forEach((value, index) => {
      if (!isSafeIntegerAtLeast(value, 0)) issue(`${path}.selected_segment_indexes[${index}]`, "必须是非负安全整数");
      else if (value <= previous) issue(`${path}.selected_segment_indexes[${index}]`, "必须严格递增且不得重复");
      previous = typeof value === "number" ? value : previous;
    });
  }
  if (!isSha256(raw.selected_transcript_sha256)) issue(`${path}.selected_transcript_sha256`, "必须是小写 SHA-256");
  if (!isSafeIntegerAtLeast(raw.selected_transcript_byte_length, 1)) issue(`${path}.selected_transcript_byte_length`, "必须是正安全整数");
}

function validateToolchain(raw: unknown, path: string, issue: Issue): void {
  if (!isRecord(raw)) {
    issue(path, "必须是对象");
    return;
  }
  exactKeys(raw, [
    "pixel_hash_version",
    "image_decoder_version",
    "frame_selection_version",
    "canvas_version",
    "speech_parser_version",
    "transcript_render_version",
    "ffmpeg_binary_sha256",
    "ffprobe_binary_sha256",
    "ffmpeg_version_sha256",
    "ffprobe_version_sha256",
  ], path, issue);
  for (const [field, expected] of Object.entries(ORACLE_GATE_BYTE_TOOLCHAIN)) {
    if (raw[field] !== expected) issue(`${path}.${field}`, `必须冻结为 ${expected}`);
  }
  for (const field of ["ffmpeg_binary_sha256", "ffprobe_binary_sha256", "ffmpeg_version_sha256", "ffprobe_version_sha256"] as const) {
    if (!isSha256(raw[field])) issue(`${path}.${field}`, "必须是小写 SHA-256");
  }
}

/**
 * Strictly validates an untrusted byte inventory. Passing this validator does
 * not read, decode, or attest any asset and therefore can never open API use.
 */
export function validateOracleGateByteInventory(input: unknown): OracleGateByteInventoryValidationReport {
  const issues: OracleGateByteInventoryValidationIssue[] = [];
  const issue: Issue = (path, message) => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  exactKeys(input, [
    "schema_version",
    "inventory_sha256",
    "status",
    "api_execution_allowed",
    "reason",
    "input_manifest_sha256",
    "signed_gold_dataset_sha256",
    "toolchain",
    "sources",
    "cases",
  ], "$", issue);
  if (input.schema_version !== "oracle-gate-byte-inventory-v1") issue("$.schema_version", "版本无效");
  if (!isSha256(input.inventory_sha256)) issue("$.inventory_sha256", "必须是小写 SHA-256");
  if (input.status !== "untrusted_inventory") issue("$.status", "只能是 untrusted_inventory");
  if (input.api_execution_allowed !== false) issue("$.api_execution_allowed", "inventory 绝不得允许 API 执行");
  if (input.reason !== "inventory_not_byte_verified_or_attested") issue("$.reason", "必须明确尚未完成字节验证或 attestation");
  if (!isSha256(input.input_manifest_sha256)) issue("$.input_manifest_sha256", "必须是小写 SHA-256");
  if (!isSha256(input.signed_gold_dataset_sha256)) issue("$.signed_gold_dataset_sha256", "必须是小写 SHA-256");
  validateToolchain(input.toolchain, "$.toolchain", issue);

  const sources = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(input.sources) || !input.sources.length) issue("$.sources", "至少需要一个来源");
  for (const [index, raw] of (Array.isArray(input.sources) ? input.sources : []).entries()) {
    const path = `$.sources[${index}]`;
    if (!isRecord(raw)) {
      issue(path, "必须是对象");
      continue;
    }
    exactKeys(raw, ["source_video_id", "video"], path, issue);
    if (!isNonEmpty(raw.source_video_id)) issue(`${path}.source_video_id`, "不能为空");
    else if (sources.has(raw.source_video_id)) issue(`${path}.source_video_id`, "不得重复");
    else sources.set(raw.source_video_id, raw);
    validateVideoRef(raw.video, `${path}.video`, issue);
  }

  const caseIds = new Set<string>();
  const usedSourceIds = new Set<string>();
  if (!Array.isArray(input.cases) || !input.cases.length) issue("$.cases", "至少需要一个 case");
  for (const [index, raw] of (Array.isArray(input.cases) ? input.cases : []).entries()) {
    const path = `$.cases[${index}]`;
    if (!isRecord(raw)) {
      issue(path, "必须是对象");
      continue;
    }
    exactKeys(raw, ["case_id", "source_video_id", "static_final", "uniform_frame", "oracle_comparison", "speech"], path, issue);
    if (!isNonEmpty(raw.case_id)) issue(`${path}.case_id`, "不能为空");
    else if (caseIds.has(raw.case_id)) issue(`${path}.case_id`, "不得重复");
    else caseIds.add(raw.case_id);
    let durationUs: number | undefined;
    if (!isNonEmpty(raw.source_video_id) || !sources.has(String(raw.source_video_id))) {
      issue(`${path}.source_video_id`, "必须引用 sources 中的来源");
    } else {
      usedSourceIds.add(raw.source_video_id);
      const source = sources.get(raw.source_video_id);
      const video = source && isRecord(source.video) ? source.video : undefined;
      if (video && isSafeIntegerAtLeast(video.duration_us, 1)) durationUs = video.duration_us;
    }
    validateImageRef(raw.static_final, `${path}.static_final`, issue, true, false);
    validateImageRef(raw.uniform_frame, `${path}.uniform_frame`, issue, true, false);
    validateImageRef(raw.oracle_comparison, `${path}.oracle_comparison`, issue, false, true);
    for (const field of ["static_final", "uniform_frame"] as const) {
      const image = raw[field];
      if (durationUs !== undefined && isRecord(image) && isSafeIntegerAtLeast(image.timestamp_us, 0)
        && image.timestamp_us >= durationUs) issue(`${path}.${field}.timestamp_us`, "必须落在来源视频时长内");
    }
    const images = [raw.static_final, raw.uniform_frame, raw.oracle_comparison].filter(isRecord);
    const imageHashes = images.map((image) => image.sha256).filter(isSha256);
    const pixelHashes = images.map((image) => image.canonical_pixel_sha256).filter(isSha256);
    if (imageHashes.length === 3 && new Set(imageHashes).size !== 3) issue(path, "static/uniform/oracle 不得复用同一图像字节");
    if (pixelHashes.length === 3 && new Set(pixelHashes).size !== 3) issue(path, "static/uniform/oracle 不得复用同一 canonical 像素");
    validateSpeech(raw.speech, `${path}.speech`, durationUs, issue);
  }
  for (const sourceId of sources.keys()) {
    if (!usedSourceIds.has(sourceId)) issue("$.sources", `来源未被任何 case 使用：${sourceId}`);
  }
  return { valid: issues.length === 0, issues };
}
