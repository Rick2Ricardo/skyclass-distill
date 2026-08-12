import { parseOracleGateResponseBytes, validateOracleGateResponse, type OracleGateResponseArm } from "./oracle-gate-response.js";
import {
  FORMAL_ORACLE_PI_RESPONSE_STREAM_MAX_BYTES,
  FORMAL_ORACLE_PI_RESPONSE_STREAM_VERSION,
  createFormalOraclePiResponseStreamArtifactV1,
  type FormalOraclePiResponseStreamProofV1,
} from "./oracle-gate-pi-response-stream.js";
import { sha256Hex } from "./sha256.js";

export const FORMAL_ORACLE_INVALID_RESPONSE_VERSION = "formal-oracle-invalid-response-v1" as const;
export const FORMAL_ORACLE_INVALID_RESPONSE_DOMAIN = "skyclass/formal-oracle/invalid-response/v1\0";
export const FORMAL_ORACLE_INVALID_RESPONSE_DETAIL_DOMAIN = "skyclass/formal-oracle/invalid-response-detail/v1\0";

export type FormalOracleInvalidResponseFailureStage =
  | "transport_metadata_invalid"
  | "sse_protocol_invalid"
  | "assistant_json_invalid"
  | "response_schema_invalid";

export interface FormalOracleInvalidResponseRecordV1 {
  schema_version: typeof FORMAL_ORACLE_INVALID_RESPONSE_VERSION;
  invalid_response_record_sha256: string;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  fetch_observed_sse_bytes_sha256: string;
  fetch_observed_sse_byte_length: number;
  expected_model: string;
  expected_arm: OracleGateResponseArm;
  expected_max_input_tokens: number;
  expected_max_output_tokens: number;
  strict_sse_parser_version: typeof FORMAL_ORACLE_PI_RESPONSE_STREAM_VERSION;
  failure_stage: FormalOracleInvalidResponseFailureStage;
  failure_code: FormalOracleInvalidResponseFailureStage;
  failure_detail_commitment_sha256: string;
  sse_derivation_record_sha256: string | null;
  assistant_content_bytes_sha256: string | null;
  assistant_content_byte_length: number | null;
  provider_response_scope: "untrusted_complete_fetch_entity_invalid_derivation_only";
  external_provider_response_status: "transport_capture_record_required_for_authoritative_source";
  api_execution_allowed: false;
}

export interface FormalOracleInvalidResponseArtifactV1 {
  readonly record: Readonly<FormalOracleInvalidResponseRecordV1>;
  readonly raw_sse_bytes: Uint8Array;
  readonly sse_derivation: Readonly<FormalOraclePiResponseStreamProofV1> | null;
  readonly assistant_content_bytes: Uint8Array | null;
}

type JsonRecord = Record<string, unknown>;
const activeArtifacts = new WeakSet<object>();
const artifactInputs = new WeakMap<object, InvalidResponseInput>();

interface InvalidResponseInput {
  raw_sse_bytes: Uint8Array;
  expected_model: string;
  expected_arm: OracleGateResponseArm;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  expected_max_input_tokens: number;
  expected_max_output_tokens: number;
  failure_stage_override?: "transport_metadata_invalid";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function isSha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Invalid response record 仅允许安全整数");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  throw new Error("Invalid response record 含非 JSON 值");
}

export function canonicalFormalOracleInvalidResponseRecordPayloadV1(record: FormalOracleInvalidResponseRecordV1): string {
  return stableJson(Object.fromEntries(Object.entries(record).filter(([key]) => key !== "invalid_response_record_sha256")));
}

export function hashFormalOracleInvalidResponseRecordV1(record: FormalOracleInvalidResponseRecordV1): string {
  return sha256Hex(`${FORMAL_ORACLE_INVALID_RESPONSE_DOMAIN}${canonicalFormalOracleInvalidResponseRecordPayloadV1(record)}`);
}

function failureDetailCommitment(stage: FormalOracleInvalidResponseFailureStage): string {
  return sha256Hex(`${FORMAL_ORACLE_INVALID_RESPONSE_DETAIL_DOMAIN}${stableJson({ failure_code: stage, failure_stage: stage })}`);
}

function assertUnicodeScalarString(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error(`${label} 含 unpaired surrogate`);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error(`${label} 含 unpaired surrogate`);
    }
  }
}

function assertInputs(input: InvalidResponseInput): void {
  if (!(input.raw_sse_bytes instanceof Uint8Array)
    || input.raw_sse_bytes.byteLength > FORMAL_ORACLE_PI_RESPONSE_STREAM_MAX_BYTES) throw new Error("Invalid response raw bytes 长度无效或超限");
  if (!/^[a-f0-9]{64}$/.test(input.request_envelope_sha256) || !/^[a-f0-9]{64}$/.test(input.provider_body_sha256)) throw new Error("Invalid response 双请求根无效");
  if (!input.expected_model || input.expected_model.trim() !== input.expected_model || input.expected_model.length > 256) throw new Error("Invalid response expected model 无效");
  assertUnicodeScalarString(input.expected_model, "Invalid response expected model");
  if (!["transcript_only", "static_final_board", "uniform_frame", "oracle_delta"].includes(input.expected_arm)) throw new Error("Invalid response expected arm 无效");
  if (!Number.isSafeInteger(input.expected_max_input_tokens) || input.expected_max_input_tokens <= 0
    || !Number.isSafeInteger(input.expected_max_output_tokens) || input.expected_max_output_tokens <= 0) throw new Error("Invalid response token budgets 无效");
}

/** Strict public validator for the content-addressed record; raw-byte provenance is rechecked by the branded artifact validator. */
export function assertFormalOracleInvalidResponseRecordV1(value: unknown): asserts value is FormalOracleInvalidResponseRecordV1 {
  if (!isRecord(value) || !exactKeys(value, [
    "schema_version", "invalid_response_record_sha256", "request_envelope_sha256", "provider_body_sha256",
    "fetch_observed_sse_bytes_sha256", "fetch_observed_sse_byte_length", "expected_model", "expected_arm",
    "expected_max_input_tokens", "expected_max_output_tokens", "strict_sse_parser_version", "failure_stage",
    "failure_code", "failure_detail_commitment_sha256", "sse_derivation_record_sha256",
    "assistant_content_bytes_sha256", "assistant_content_byte_length", "provider_response_scope",
    "external_provider_response_status", "api_execution_allowed",
  ])) throw new Error("Invalid response record 字段集合无效");
  const record = value as unknown as FormalOracleInvalidResponseRecordV1;
  if (!Number.isSafeInteger(record.fetch_observed_sse_byte_length) || record.fetch_observed_sse_byte_length < 0
    || record.fetch_observed_sse_byte_length > FORMAL_ORACLE_PI_RESPONSE_STREAM_MAX_BYTES
    || !isSha(record.request_envelope_sha256) || !isSha(record.provider_body_sha256)
    || !record.expected_model || record.expected_model.trim() !== record.expected_model || record.expected_model.length > 256
    || !["transcript_only", "static_final_board", "uniform_frame", "oracle_delta"].includes(record.expected_arm)
    || !Number.isSafeInteger(record.expected_max_input_tokens) || record.expected_max_input_tokens <= 0
    || !Number.isSafeInteger(record.expected_max_output_tokens) || record.expected_max_output_tokens <= 0) {
    throw new Error("Invalid response record identity/budget/length 无效");
  }
  assertUnicodeScalarString(record.expected_model, "Invalid response record expected model");
  if (record.schema_version !== FORMAL_ORACLE_INVALID_RESPONSE_VERSION
    || record.strict_sse_parser_version !== FORMAL_ORACLE_PI_RESPONSE_STREAM_VERSION
    || !isSha(record.invalid_response_record_sha256) || !isSha(record.fetch_observed_sse_bytes_sha256)
    || !["transport_metadata_invalid", "sse_protocol_invalid", "assistant_json_invalid", "response_schema_invalid"].includes(record.failure_stage)
    || record.failure_code !== record.failure_stage
    || record.failure_detail_commitment_sha256 !== failureDetailCommitment(record.failure_stage)
    || record.provider_response_scope !== "untrusted_complete_fetch_entity_invalid_derivation_only"
    || record.external_provider_response_status !== "transport_capture_record_required_for_authoritative_source"
    || record.api_execution_allowed !== false) throw new Error("Invalid response record 固定字段或根绑定无效");
  const hasDerivedLayers = record.failure_stage === "assistant_json_invalid" || record.failure_stage === "response_schema_invalid";
  if ((hasDerivedLayers && (!isSha(record.sse_derivation_record_sha256) || !isSha(record.assistant_content_bytes_sha256)
      || !Number.isSafeInteger(record.assistant_content_byte_length) || Number(record.assistant_content_byte_length) <= 0))
    || (!hasDerivedLayers && (record.sse_derivation_record_sha256 !== null || record.assistant_content_bytes_sha256 !== null
      || record.assistant_content_byte_length !== null))) throw new Error("Invalid response record failure stage 与 B/C 绑定无效");
  if (hashFormalOracleInvalidResponseRecordV1(record) !== record.invalid_response_record_sha256) {
    throw new Error("Invalid response record 内容地址不匹配");
  }
}

function derive(input: InvalidResponseInput): {
  record: FormalOracleInvalidResponseRecordV1;
  sse_derivation: FormalOraclePiResponseStreamProofV1 | null;
  assistant_content_bytes: Uint8Array | null;
} {
  assertInputs(input);
  if (input.failure_stage_override === "transport_metadata_invalid") {
    return make("transport_metadata_invalid", input, null, null);
  }
  let stage: FormalOracleInvalidResponseFailureStage;
  let proof: FormalOraclePiResponseStreamProofV1 | null = null;
  let assistant: Uint8Array | null = null;
  try {
    const artifact = createFormalOraclePiResponseStreamArtifactV1(input);
    proof = artifact.proof;
    assistant = Uint8Array.from(artifact.assistant_content_bytes);
  } catch {
    stage = "sse_protocol_invalid";
    return make(stage, input, null, null);
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = parseOracleGateResponseBytes(assistant);
  } catch {
    stage = "assistant_json_invalid";
    return make(stage, input, proof, assistant);
  }
  try {
    validateOracleGateResponse(parsed, input.expected_arm);
  } catch {
    stage = "response_schema_invalid";
    return make(stage, input, proof, assistant);
  }
  throw new Error("完整 response 已通过 SSE/assistant JSON/arm schema，不能构造 invalid artifact");
}

function make(
  stage: FormalOracleInvalidResponseFailureStage,
  input: InvalidResponseInput,
  proof: FormalOraclePiResponseStreamProofV1 | null,
  assistant: Uint8Array | null,
): { record: FormalOracleInvalidResponseRecordV1; sse_derivation: FormalOraclePiResponseStreamProofV1 | null; assistant_content_bytes: Uint8Array | null } {
  const draft: FormalOracleInvalidResponseRecordV1 = {
    schema_version: FORMAL_ORACLE_INVALID_RESPONSE_VERSION,
    invalid_response_record_sha256: "0".repeat(64),
    request_envelope_sha256: input.request_envelope_sha256,
    provider_body_sha256: input.provider_body_sha256,
    fetch_observed_sse_bytes_sha256: sha256Hex(input.raw_sse_bytes),
    fetch_observed_sse_byte_length: input.raw_sse_bytes.byteLength,
    expected_model: input.expected_model,
    expected_arm: input.expected_arm,
    expected_max_input_tokens: input.expected_max_input_tokens,
    expected_max_output_tokens: input.expected_max_output_tokens,
    strict_sse_parser_version: FORMAL_ORACLE_PI_RESPONSE_STREAM_VERSION,
    failure_stage: stage,
    failure_code: stage,
    failure_detail_commitment_sha256: failureDetailCommitment(stage),
    sse_derivation_record_sha256: proof?.proof_sha256 ?? null,
    assistant_content_bytes_sha256: proof?.assistant_content_sha256 ?? null,
    assistant_content_byte_length: proof?.assistant_content_byte_length ?? null,
    provider_response_scope: "untrusted_complete_fetch_entity_invalid_derivation_only",
    external_provider_response_status: "transport_capture_record_required_for_authoritative_source",
    api_execution_allowed: false,
  };
  draft.invalid_response_record_sha256 = hashFormalOracleInvalidResponseRecordV1(draft);
  assertFormalOracleInvalidResponseRecordV1(draft);
  return { record: Object.freeze(draft), sse_derivation: proof, assistant_content_bytes: assistant };
}

export function createFormalOracleInvalidResponseArtifactV1(input: InvalidResponseInput): FormalOracleInvalidResponseArtifactV1 {
  const frozenInput = { ...input, raw_sse_bytes: Uint8Array.from(input.raw_sse_bytes) };
  const derived = derive(frozenInput);
  const artifact = Object.freeze({
    record: derived.record,
    raw_sse_bytes: Uint8Array.from(frozenInput.raw_sse_bytes),
    sse_derivation: derived.sse_derivation,
    assistant_content_bytes: derived.assistant_content_bytes ? Uint8Array.from(derived.assistant_content_bytes) : null,
  });
  activeArtifacts.add(artifact);
  artifactInputs.set(artifact, frozenInput);
  return artifact;
}

/**
 * Persists a complete fetch entity whose HTTP status or content type is outside
 * the frozen successful transport profile. The bytes remain evidence, but no
 * SSE, assistant-content, or schema authority is claimed.
 */
export function createFormalOracleTransportMetadataInvalidResponseArtifactV1(
  input: Omit<InvalidResponseInput, "failure_stage_override">,
): FormalOracleInvalidResponseArtifactV1 {
  const frozenInput: InvalidResponseInput = {
    ...input,
    raw_sse_bytes: Uint8Array.from(input.raw_sse_bytes),
    failure_stage_override: "transport_metadata_invalid",
  };
  const derived = derive(frozenInput);
  const artifact = Object.freeze({
    record: derived.record,
    raw_sse_bytes: Uint8Array.from(frozenInput.raw_sse_bytes),
    sse_derivation: null,
    assistant_content_bytes: null,
  });
  activeArtifacts.add(artifact);
  artifactInputs.set(artifact, frozenInput);
  return artifact;
}

export function assertFormalOracleInvalidResponseArtifactV1(value: FormalOracleInvalidResponseArtifactV1): void {
  if (!value || typeof value !== "object" || !activeArtifacts.has(value as object)) throw new Error("Invalid response artifact 无效或由调用方伪造");
}

export function revalidateFormalOracleInvalidResponseArtifactV1(value: FormalOracleInvalidResponseArtifactV1): FormalOracleInvalidResponseArtifactV1 {
  assertFormalOracleInvalidResponseArtifactV1(value);
  const inputs = artifactInputs.get(value as object);
  if (!inputs) throw new Error("Invalid response artifact 缺少进程内 provenance");
  const rebuilt = inputs.failure_stage_override === "transport_metadata_invalid"
    ? createFormalOracleTransportMetadataInvalidResponseArtifactV1({ ...inputs, raw_sse_bytes: value.raw_sse_bytes })
    : createFormalOracleInvalidResponseArtifactV1({ ...inputs, raw_sse_bytes: value.raw_sse_bytes });
  const sameAssistant = rebuilt.assistant_content_bytes === null && value.assistant_content_bytes === null
    || rebuilt.assistant_content_bytes !== null && value.assistant_content_bytes !== null
      && rebuilt.assistant_content_bytes.byteLength === value.assistant_content_bytes.byteLength
      && rebuilt.assistant_content_bytes.every((byte, index) => byte === value.assistant_content_bytes![index]);
  if (JSON.stringify(rebuilt.record) !== JSON.stringify(value.record)
    || JSON.stringify(rebuilt.sse_derivation) !== JSON.stringify(value.sse_derivation) || !sameAssistant) {
    throw new Error("Invalid response artifact raw/derivation/content/record 漂移");
  }
  return rebuilt;
}
