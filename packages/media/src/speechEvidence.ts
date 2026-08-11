import {
  createHash,
  createPublicKey,
  KeyObject,
  verify,
  type KeyLike,
} from "node:crypto";
import { verifyControlledByteEvidence } from "./byteEvidence.js";

export interface SpeechByteFileRef {
  asset_uri: string;
  sha256: string;
  byte_length: number;
}

export interface WhisperCppSpeechFiles {
  raw: SpeechByteFileRef;
  index: SpeechByteFileRef;
  srt: SpeechByteFileRef;
  text: SpeechByteFileRef;
}

export interface VerifiedSpeechSegment {
  segment_index: number;
  segment_id: string;
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface VerifiedWhisperCppSpeech {
  files: Record<keyof WhisperCppSpeechFiles, { sha256: string; byte_length: number }>;
  segments: VerifiedSpeechSegment[];
  selected_segment_indexes: number[];
  selected_transcript: string;
  selected_transcript_sha256: string;
}

export interface SignedSpeechAlignmentSegment {
  segment_id: string;
  segment_index: number;
  start_ms: number;
  end_ms: number;
  text_sha256: string;
}

export interface SignedSpeechAlignmentSignoff {
  adjudicator_id: string;
  adjudicator_role: "speech_alignment_reviewer";
  reviewed_at: string;
  statement: string;
  ledger_content_sha256: string;
  signer_key_id: string;
  signature_algorithm: "ed25519";
  signature_base64: string;
}

export interface SignedSpeechAlignmentLedger {
  schema_version: "signed-speech-alignment-v1";
  status: "signed_alignment";
  case_id: string;
  source_video_id: string;
  clip_start_us: number;
  clip_end_us: number;
  files: WhisperCppSpeechFiles;
  selected_segments: SignedSpeechAlignmentSegment[];
  selected_transcript_sha256: string;
  selected_transcript_byte_length: number;
  signoff: SignedSpeechAlignmentSignoff;
}

export const WHISPER_CPP_STRICT_PARSER_VERSION = "whisper-cpp-offset-locked-v1" as const;
export const SPEECH_RENDER_VERSION = "selected-segments-timestamped-v1" as const;
export const SPEECH_ALIGNMENT_CONTENT_DOMAIN = "skyclass/signed-speech-alignment/content/v1\0" as const;
export const SPEECH_ALIGNMENT_SIGNOFF_DOMAIN = "skyclass/signed-speech-alignment/signoff/v1\0" as const;

function digest(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  throw new Error("speech alignment 只能包含 JSON 值");
}

export function hashSignedSpeechAlignmentContent(input: Omit<SignedSpeechAlignmentLedger, "signoff">): string {
  return digest(`${SPEECH_ALIGNMENT_CONTENT_DOMAIN}${stableJson(input)}`);
}

export function signedSpeechAlignmentSignoffPreimage(
  input: Omit<SignedSpeechAlignmentSignoff, "signature_base64">,
): string {
  return `${SPEECH_ALIGNMENT_SIGNOFF_DOMAIN}${stableJson(input)}`;
}

function exactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} 字段集合无效`);
}

function sha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

async function readControlledBytes(root: string, ref: SpeechByteFileRef, label: string): Promise<Buffer> {
  const verified = await verifyControlledByteEvidence({
    root,
    ref,
    label,
    max_bytes: 64 * 1024 * 1024,
    retain_bytes: true,
  });
  if (!verified.bytes) throw new Error(`${label} 未保留已验证字节`);
  return verified.bytes;
}

function assertNoDuplicateJsonKeys(text: string, label: string): void {
  let offset = 0;
  const whitespace = (): void => { while (/\s/.test(text[offset] ?? "")) offset += 1; };
  const stringToken = (): string => {
    whitespace();
    if (text[offset] !== '"') throw new Error(`${label} JSON 字符串无效`);
    const start = offset;
    offset += 1;
    while (offset < text.length) {
      if (text[offset] === "\\") { offset += 2; continue; }
      if (text[offset] === '"') {
        offset += 1;
        try { return JSON.parse(text.slice(start, offset)) as string; }
        catch { throw new Error(`${label} JSON 字符串转义无效`); }
      }
      if (text.charCodeAt(offset) < 0x20) throw new Error(`${label} JSON 字符串含控制字符`);
      offset += 1;
    }
    throw new Error(`${label} JSON 字符串未闭合`);
  };
  const value = (): void => {
    whitespace();
    if (text[offset] === "{") {
      offset += 1;
      const keys = new Set<string>();
      whitespace();
      if (text[offset] === "}") { offset += 1; return; }
      while (offset < text.length) {
        const key = stringToken();
        if (keys.has(key)) throw new Error(`${label} 包含重复 JSON key：${key}`);
        keys.add(key);
        whitespace();
        if (text[offset] !== ":") throw new Error(`${label} JSON object 缺少冒号`);
        offset += 1;
        value();
        whitespace();
        if (text[offset] === "}") { offset += 1; return; }
        if (text[offset] !== ",") throw new Error(`${label} JSON object 分隔符无效`);
        offset += 1;
      }
      throw new Error(`${label} JSON object 未闭合`);
    }
    if (text[offset] === "[") {
      offset += 1;
      whitespace();
      if (text[offset] === "]") { offset += 1; return; }
      while (offset < text.length) {
        value();
        whitespace();
        if (text[offset] === "]") { offset += 1; return; }
        if (text[offset] !== ",") throw new Error(`${label} JSON array 分隔符无效`);
        offset += 1;
      }
      throw new Error(`${label} JSON array 未闭合`);
    }
    if (text[offset] === '"') { stringToken(); return; }
    const token = text.slice(offset).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/)?.[0];
    if (!token) throw new Error(`${label} JSON value 无效`);
    offset += token.length;
  };
  value();
  whitespace();
  if (offset !== text.length) throw new Error(`${label} JSON 含尾随内容`);
}

function strictUtf8(bytes: Buffer, label: string): string {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) throw new Error(`${label} 不允许 UTF-8 BOM`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} 必须是严格 UTF-8`);
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
  return value as Record<string, unknown>;
}

function timestampMs(value: unknown, label: string): number {
  const match = typeof value === "string" ? value.match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/) : null;
  if (!match) throw new Error(`${label} 时间戳格式无效`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) throw new Error(`${label} 时间戳范围无效`);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + Number(match[4]);
}

function timestamp(valueMs: number, srt = false): string {
  const hours = Math.floor(valueMs / 3_600_000);
  const minutes = Math.floor((valueMs % 3_600_000) / 60_000);
  const seconds = Math.floor((valueMs % 60_000) / 1000);
  const millis = valueMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${srt ? "," : "."}${String(millis).padStart(3, "0")}`;
}

function parseRawWhisperCpp(raw: unknown): { index: Record<string, unknown>; segments: VerifiedSpeechSegment[] } {
  const root = object(raw, "Whisper raw");
  if (!Array.isArray(root.transcription) || !root.transcription.length) throw new Error("Whisper raw transcription 不能为空");
  const model = object(root.model, "Whisper raw model");
  const result = object(root.result, "Whisper raw result");
  if (typeof model.type !== "string" || !model.type.trim() || typeof result.language !== "string" || !result.language.trim()) {
    throw new Error("Whisper raw model/language 无效");
  }
  let previousStartMs = -1;
  const segments = root.transcription.map((entryValue, index): VerifiedSpeechSegment => {
    const entry = object(entryValue, `Whisper raw transcription[${index}]`);
    const timestamps = object(entry.timestamps, `Whisper raw transcription[${index}].timestamps`);
    const offsets = object(entry.offsets, `Whisper raw transcription[${index}].offsets`);
    const startMs = timestampMs(timestamps.from, `Whisper raw transcription[${index}].from`);
    const endMs = timestampMs(timestamps.to, `Whisper raw transcription[${index}].to`);
    if (!Number.isSafeInteger(offsets.from) || !Number.isSafeInteger(offsets.to)
      || Number(offsets.from) !== startMs || Number(offsets.to) !== endMs || startMs < 0 || startMs >= endMs) {
      throw new Error(`Whisper raw transcription[${index}] timestamp/offset 不一致`);
    }
    if (startMs < previousStartMs) throw new Error("Whisper raw segments 不是稳定时间顺序");
    previousStartMs = startMs;
    if (typeof entry.text !== "string" || !entry.text.trim()) throw new Error(`Whisper raw transcription[${index}].text 不能为空`);
    return {
      segment_index: index,
      segment_id: `segment-${String(index).padStart(6, "0")}`,
      start_ms: startMs,
      end_ms: endMs,
      text: entry.text.trim(),
    };
  });
  const transcriptSegments = segments.map((segment) => ({
    start: segment.start_ms / 1000,
    end: segment.end_ms / 1000,
    text: segment.text,
  }));
  const rawText = typeof root.text === "string" ? root.text.trim() : "";
  const joinedText = transcriptSegments.map((segment) => segment.text).join(" ");
  if (rawText && rawText.replace(/\s+/g, " ") !== joinedText.replace(/\s+/g, " ")) {
    throw new Error("Whisper raw 顶层 text 与 transcription 不一致");
  }
  return {
    segments,
    index: {
      text: rawText || joinedText,
      segments: transcriptSegments,
      language: result.language,
      duration: transcriptSegments.at(-1)?.end ?? 0,
      engine: "whisper.cpp",
      model: model.type,
    },
  };
}

export function renderWhisperCppIndex(index: Record<string, unknown>): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

export function renderWhisperCppText(segments: VerifiedSpeechSegment[]): string {
  return `${segments.map((segment) => `[${timestamp(segment.start_ms)}] ${segment.text}`).join("\n")}\n`;
}

export function renderWhisperCppSrt(segments: VerifiedSpeechSegment[]): string {
  return segments.map((segment, index) => `${index + 1}\n${timestamp(segment.start_ms, true)} --> ${timestamp(segment.end_ms, true)}\n${segment.text}\n`).join("\n");
}

export function renderSelectedSpeech(segments: VerifiedSpeechSegment[], indexes: number[]): string {
  return `${indexes.map((index) => {
    const segment = segments[index];
    if (!segment) throw new Error(`selected segment index 不存在：${index}`);
    return `[${timestamp(segment.start_ms)} --> ${timestamp(segment.end_ms)}] ${segment.text}`;
  }).join("\n")}\n`;
}

export function verifySignedSpeechAlignmentLedgerBytes(input: {
  bytes: Buffer;
  expected: Omit<SignedSpeechAlignmentLedger, "schema_version" | "status" | "signoff">;
  trusted_public_keys: ReadonlyMap<string, KeyLike>;
}): SignedSpeechAlignmentLedger {
  const text = strictUtf8(input.bytes, "speech alignment ledger");
  assertNoDuplicateJsonKeys(text, "speech alignment ledger");
  const raw = object(JSON.parse(text) as unknown, "speech alignment ledger");
  exactKeys(raw, ["schema_version", "status", "case_id", "source_video_id", "clip_start_us", "clip_end_us", "files", "selected_segments", "selected_transcript_sha256", "selected_transcript_byte_length", "signoff"], "speech alignment ledger");
  if (raw.schema_version !== "signed-speech-alignment-v1" || raw.status !== "signed_alignment") throw new Error("speech alignment ledger schema/status 无效");
  for (const field of ["case_id", "source_video_id", "clip_start_us", "clip_end_us", "selected_transcript_sha256", "selected_transcript_byte_length"] as const) {
    if (raw[field] !== input.expected[field]) throw new Error(`speech alignment ledger ${field} 未与 Formal case 闭合`);
  }
  const files = object(raw.files, "speech alignment ledger files");
  exactKeys(files, ["raw", "index", "srt", "text"], "speech alignment ledger files");
  for (const field of ["raw", "index", "srt", "text"] as const) {
    const ref = object(files[field], `speech alignment ledger files.${field}`);
    exactKeys(ref, ["asset_uri", "sha256", "byte_length"], `speech alignment ledger files.${field}`);
    if (stableJson(ref) !== stableJson(input.expected.files[field])) throw new Error(`speech alignment ledger ${field} 字节引用未闭合`);
  }
  if (!Array.isArray(raw.selected_segments) || stableJson(raw.selected_segments) !== stableJson(input.expected.selected_segments)) {
    throw new Error("speech alignment ledger selected_segments 未与验证后的 raw 对齐");
  }
  for (const [index, segment] of (raw.selected_segments as unknown[]).entries()) {
    const entry = object(segment, `speech alignment ledger selected_segments[${index}]`);
    exactKeys(entry, ["segment_id", "segment_index", "start_ms", "end_ms", "text_sha256"], `speech alignment ledger selected_segments[${index}]`);
    if (typeof entry.segment_id !== "string" || !Number.isSafeInteger(entry.segment_index)
      || !Number.isSafeInteger(entry.start_ms) || !Number.isSafeInteger(entry.end_ms) || !sha256(entry.text_sha256)) {
      throw new Error(`speech alignment ledger selected_segments[${index}] 字段无效`);
    }
  }
  const signoff = object(raw.signoff, "speech alignment ledger signoff");
  exactKeys(signoff, ["adjudicator_id", "adjudicator_role", "reviewed_at", "statement", "ledger_content_sha256", "signer_key_id", "signature_algorithm", "signature_base64"], "speech alignment ledger signoff");
  if (typeof signoff.adjudicator_id !== "string" || !signoff.adjudicator_id.trim()
    || signoff.adjudicator_role !== "speech_alignment_reviewer"
    || typeof signoff.reviewed_at !== "string" || new Date(signoff.reviewed_at).toISOString() !== signoff.reviewed_at
    || typeof signoff.statement !== "string" || !signoff.statement.trim()
    || !sha256(signoff.ledger_content_sha256)
    || typeof signoff.signer_key_id !== "string" || signoff.signer_key_id.trim() !== signoff.signer_key_id || !signoff.signer_key_id
    || signoff.signature_algorithm !== "ed25519"
    || typeof signoff.signature_base64 !== "string") {
    throw new Error("speech alignment ledger signoff 字段无效");
  }
  const { signoff: _signoff, ...ledgerContent } = raw as unknown as SignedSpeechAlignmentLedger;
  const contentSha256 = hashSignedSpeechAlignmentContent(ledgerContent);
  if (contentSha256 !== signoff.ledger_content_sha256) {
    throw new Error("speech alignment ledger signoff 未绑定当前账本正文");
  }
  const signature = Buffer.from(signoff.signature_base64, "base64");
  if (signature.byteLength !== 64 || signature.toString("base64") !== signoff.signature_base64) {
    throw new Error("speech alignment ledger signoff 必须是 canonical 64-byte Ed25519 签名");
  }
  const trustedKeyValue = input.trusted_public_keys.get(signoff.signer_key_id);
  if (!trustedKeyValue) throw new Error("speech alignment ledger signer 不在 trusted key 集合");
  const trustedKey = trustedKeyValue instanceof KeyObject ? trustedKeyValue : createPublicKey(trustedKeyValue);
  if (trustedKey.type !== "public" || trustedKey.asymmetricKeyType !== "ed25519") {
    throw new Error("speech alignment ledger trusted key 必须是 Ed25519 公钥");
  }
  const { signature_base64: _signature, ...signoffPayload } = signoff as unknown as SignedSpeechAlignmentSignoff;
  if (!verify(null, Buffer.from(signedSpeechAlignmentSignoffPreimage(signoffPayload), "utf8"), trustedKey, signature)) {
    throw new Error("speech alignment ledger Ed25519 签名无效");
  }
  return raw as unknown as SignedSpeechAlignmentLedger;
}

export async function verifyWhisperCppSpeechEvidence(input: {
  root: string;
  files: WhisperCppSpeechFiles;
  selected_segment_indexes: number[];
  expected_selected_transcript_sha256: string;
}): Promise<VerifiedWhisperCppSpeech> {
  if (!Array.isArray(input.selected_segment_indexes) || !input.selected_segment_indexes.length
    || !input.selected_segment_indexes.every((value) => Number.isSafeInteger(value) && value >= 0)
    || new Set(input.selected_segment_indexes).size !== input.selected_segment_indexes.length
    || input.selected_segment_indexes.some((value, index) => index > 0 && value <= input.selected_segment_indexes[index - 1])) {
    throw new Error("selected_segment_indexes 必须是非空、唯一、严格递增的非负安全整数");
  }
  if (!/^[a-f0-9]{64}$/.test(input.expected_selected_transcript_sha256)) throw new Error("selected transcript SHA-256 无效");
  const [rawBytes, indexBytes, srtBytes, textBytes] = await Promise.all([
    readControlledBytes(input.root, input.files.raw, "Whisper raw"),
    readControlledBytes(input.root, input.files.index, "Whisper index"),
    readControlledBytes(input.root, input.files.srt, "Whisper SRT"),
    readControlledBytes(input.root, input.files.text, "Whisper TXT"),
  ]);
  const rawText = strictUtf8(rawBytes, "Whisper raw");
  assertNoDuplicateJsonKeys(rawText, "Whisper raw");
  const parsed = parseRawWhisperCpp(JSON.parse(rawText) as unknown);
  if (strictUtf8(indexBytes, "Whisper index") !== renderWhisperCppIndex(parsed.index)) throw new Error("Whisper index 不能由 raw 按冻结 parser 逐字节重建");
  if (strictUtf8(srtBytes, "Whisper SRT") !== renderWhisperCppSrt(parsed.segments)) throw new Error("Whisper SRT 不能由 index 逐字节重建");
  if (strictUtf8(textBytes, "Whisper TXT") !== renderWhisperCppText(parsed.segments)) throw new Error("Whisper TXT 不能由 index 逐字节重建");
  const selectedTranscript = renderSelectedSpeech(parsed.segments, input.selected_segment_indexes);
  const selectedTranscriptSha256 = digest(selectedTranscript);
  if (selectedTranscriptSha256 !== input.expected_selected_transcript_sha256) throw new Error("selected transcript SHA-256 不匹配");
  return {
    files: {
      raw: { sha256: digest(rawBytes), byte_length: rawBytes.byteLength },
      index: { sha256: digest(indexBytes), byte_length: indexBytes.byteLength },
      srt: { sha256: digest(srtBytes), byte_length: srtBytes.byteLength },
      text: { sha256: digest(textBytes), byte_length: textBytes.byteLength },
    },
    segments: parsed.segments,
    selected_segment_indexes: [...input.selected_segment_indexes],
    selected_transcript: selectedTranscript,
    selected_transcript_sha256: selectedTranscriptSha256,
  };
}
