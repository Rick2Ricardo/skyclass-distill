import { sha256Hex } from "./sha256.js";
import { parseOracleGateResponseBytes } from "./oracle-gate-response.js";

export const FORMAL_ORACLE_PI_RESPONSE_STREAM_VERSION = "formal-oracle-pi-response-stream-v1" as const;
export const FORMAL_ORACLE_PI_RESPONSE_STREAM_PROOF_DOMAIN = "skyclass/formal-oracle/pi-response-stream-proof/v1\0";
export const FORMAL_ORACLE_PI_RESPONSE_STREAM_MAX_BYTES = 8 * 1024 * 1024;
export const FORMAL_ORACLE_PI_RESPONSE_STREAM_MAX_CONTENT_EVENTS = 1024;

export interface FormalOraclePiRawUsageV1 {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details: { cached_tokens: 0 };
  completion_tokens_details: { reasoning_tokens: 0 };
}

export interface FormalOraclePiNormalizedUsageV1 {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_read_tokens: 0;
  cache_write_tokens: 0;
  reasoning_tokens: 0;
}

export interface FormalOraclePiResponseStreamProofV1 {
  schema_version: typeof FORMAL_ORACLE_PI_RESPONSE_STREAM_VERSION;
  proof_sha256: string;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  raw_sse_sha256: string;
  raw_sse_byte_length: number;
  assistant_content_sha256: string;
  assistant_content_byte_length: number;
  response_id: string;
  model: string;
  created: number;
  role_prelude_count: 0 | 1;
  content_event_count: number;
  finish_reason: "stop";
  done_count: 1;
  expected_max_input_tokens: number;
  expected_max_output_tokens: number;
  raw_usage: FormalOraclePiRawUsageV1;
  normalized_usage: FormalOraclePiNormalizedUsageV1;
  provider_response_scope: "untrusted_sse_entity_strict_derivation_only";
  store_integration_status: "formal_run_store_v2_abcd_integrated";
  external_provider_response_status: "pending_endpoint_account_exactly_once_and_capture";
  api_execution_allowed: false;
}

export interface FormalOraclePiResponseStreamArtifactV1 {
  readonly proof: Readonly<FormalOraclePiResponseStreamProofV1>;
  /** Caller-supplied decoded SSE entity bytes; not a source/authenticity proof. */
  readonly raw_sse_bytes: Uint8Array;
  readonly assistant_content_bytes: Uint8Array;
}

const activeArtifacts = new WeakSet<object>();
const artifactInputs = new WeakMap<object, {
  expected_model: string;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  expected_max_input_tokens: number;
  expected_max_output_tokens: number;
}>();

type JsonRecord = Record<string, unknown>;

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Pi SSE proof 仅允许安全整数");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  throw new Error("Pi SSE proof 含非 JSON 值");
}

export function canonicalFormalOraclePiResponseStreamProofPayloadV1(
  proof: FormalOraclePiResponseStreamProofV1,
): string {
  return stableJson(Object.fromEntries(Object.entries(proof).filter(([key]) => key !== "proof_sha256")));
}

export function hashFormalOraclePiResponseStreamProofV1(proof: FormalOraclePiResponseStreamProofV1): string {
  return sha256Hex(`${FORMAL_ORACLE_PI_RESPONSE_STREAM_PROOF_DOMAIN}${canonicalFormalOraclePiResponseStreamProofPayloadV1(proof)}`);
}

/**
 * Validates a persisted derivation proof without trusting the code that
 * produced it. Raw SSE provenance is deliberately outside this pure contract;
 * the run store separately reparses the referenced raw bytes.
 */
export function validateFormalOraclePiResponseStreamProofV1(input: unknown): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!isRecord(input)) return { valid: false, issues: ["Pi SSE proof 必须是对象"] };
  const keys = [
    "schema_version", "proof_sha256", "request_envelope_sha256", "provider_body_sha256", "raw_sse_sha256",
    "raw_sse_byte_length", "assistant_content_sha256", "assistant_content_byte_length", "response_id", "model", "created",
    "role_prelude_count", "content_event_count", "finish_reason", "done_count", "expected_max_input_tokens",
    "expected_max_output_tokens", "raw_usage", "normalized_usage", "provider_response_scope", "store_integration_status",
    "external_provider_response_status", "api_execution_allowed",
  ] as const;
  try { exactKeys(input, keys, "Pi SSE proof"); } catch (error) { issues.push((error as Error).message); }
  const shaFields = ["proof_sha256", "request_envelope_sha256", "provider_body_sha256", "raw_sse_sha256", "assistant_content_sha256"] as const;
  for (const field of shaFields) if (typeof input[field] !== "string" || !/^[a-f0-9]{64}$/.test(input[field])) issues.push(`Pi SSE proof.${field} 无效`);
  if (input.schema_version !== FORMAL_ORACLE_PI_RESPONSE_STREAM_VERSION) issues.push("Pi SSE proof 版本无效");
  for (const field of ["raw_sse_byte_length", "assistant_content_byte_length", "content_event_count", "expected_max_input_tokens", "expected_max_output_tokens"] as const) {
    if (!Number.isSafeInteger(input[field]) || Number(input[field]) <= 0) issues.push(`Pi SSE proof.${field} 必须为正安全整数`);
  }
  if (!Number.isSafeInteger(input.created) || Number(input.created) < 0) issues.push("Pi SSE proof.created 无效");
  if (input.role_prelude_count !== 0 && input.role_prelude_count !== 1) issues.push("Pi SSE proof.role_prelude_count 无效");
  if (input.finish_reason !== "stop" || input.done_count !== 1) issues.push("Pi SSE proof stop/DONE 不变量无效");
  if (typeof input.response_id !== "string" || !/^chatcmpl-[A-Za-z0-9._-]+$/.test(input.response_id) || typeof input.model !== "string" || !input.model || input.model.trim() !== input.model) issues.push("Pi SSE proof id/model 无效");
  else {
    try { assertScalar(input.model, "Pi SSE proof.model"); } catch (error) { issues.push((error as Error).message); }
  }
  if (input.provider_response_scope !== "untrusted_sse_entity_strict_derivation_only"
    || input.store_integration_status !== "formal_run_store_v2_abcd_integrated"
    || input.external_provider_response_status !== "pending_endpoint_account_exactly_once_and_capture"
    || input.api_execution_allowed !== false) issues.push("Pi SSE proof 信任/API 边界无效");
  if (!isRecord(input.raw_usage) || !isRecord(input.normalized_usage)) issues.push("Pi SSE proof usage 缺失");
  else {
    try {
      exactKeys(input.raw_usage, ["prompt_tokens", "completion_tokens", "total_tokens", "prompt_tokens_details", "completion_tokens_details"], "Pi SSE proof.raw_usage");
      exactKeys(input.normalized_usage, ["input_tokens", "output_tokens", "total_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens"], "Pi SSE proof.normalized_usage");
      if (!isRecord(input.raw_usage.prompt_tokens_details) || !isRecord(input.raw_usage.completion_tokens_details)) throw new Error("Pi SSE proof usage details 无效");
      exactKeys(input.raw_usage.prompt_tokens_details, ["cached_tokens"], "Pi SSE proof.prompt_tokens_details");
      exactKeys(input.raw_usage.completion_tokens_details, ["reasoning_tokens"], "Pi SSE proof.completion_tokens_details");
      const rawInput = input.raw_usage.prompt_tokens;
      const rawOutput = input.raw_usage.completion_tokens;
      const rawTotal = input.raw_usage.total_tokens;
      if (![rawInput, rawOutput, rawTotal].every((value) => Number.isSafeInteger(value) && Number(value) >= 0)
        || rawTotal !== Number(rawInput) + Number(rawOutput)
        || Number(rawInput) > Number(input.expected_max_input_tokens)
        || Number(rawOutput) > Number(input.expected_max_output_tokens)
        || input.raw_usage.prompt_tokens_details.cached_tokens !== 0
        || input.raw_usage.completion_tokens_details.reasoning_tokens !== 0
        || input.normalized_usage.input_tokens !== rawInput || input.normalized_usage.output_tokens !== rawOutput
        || input.normalized_usage.total_tokens !== rawTotal || input.normalized_usage.cache_read_tokens !== 0
        || input.normalized_usage.cache_write_tokens !== 0 || input.normalized_usage.reasoning_tokens !== 0) {
        throw new Error("Pi SSE proof usage/budget 映射无效");
      }
    } catch (error) { issues.push((error as Error).message); }
  }
  try {
    if (typeof input.proof_sha256 === "string"
      && hashFormalOraclePiResponseStreamProofV1(input as unknown as FormalOraclePiResponseStreamProofV1) !== input.proof_sha256) issues.push("Pi SSE proof 内容寻址哈希不匹配");
  } catch { issues.push("Pi SSE proof 无法规范序列化"); }
  return { valid: issues.length === 0, issues };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: JsonRecord, expected: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} 字段集合无效`);
}

function assertSha(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} 必须是 SHA-256`);
}

function assertScalar(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error(`${label} 含 unpaired surrogate`);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error(`${label} 含 unpaired surrogate`);
  }
}

function assertJsonScalars(value: unknown, label: string): void {
  if (typeof value === "string") { assertScalar(value, label); return; }
  if (Array.isArray(value)) { value.forEach((item, index) => assertJsonScalars(item, `${label}[${index}]`)); return; }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      assertScalar(key, `${label} key`);
      assertJsonScalars(nested, `${label}.${key}`);
    }
  }
}

function parseStrictEvent(source: string, index: number): JsonRecord {
  if (!source.startsWith("data: ") || source.includes("\n")) throw new Error(`Pi SSE event ${index} 行规无效`);
  const json = source.slice(6);
  const bytes = new TextEncoder().encode(json);
  const value = parseOracleGateResponseBytes(bytes);
  if (!isRecord(value)) throw new Error(`Pi SSE event ${index} 必须是 JSON object`);
  assertJsonScalars(value, `Pi SSE event ${index}`);
  return value;
}

function assertCommonChunk(value: JsonRecord, input: {
  expected_model: string;
  response_id: string | null;
  created: number | null;
}, index: number, withUsage: boolean): { response_id: string; created: number } {
  exactKeys(value, withUsage ? ["id", "object", "created", "model", "choices", "usage"] : ["id", "object", "created", "model", "choices"], `Pi SSE event ${index}`);
  if (typeof value.id !== "string" || value.id.length > 256 || !/^chatcmpl-[A-Za-z0-9._-]+$/.test(value.id)) throw new Error(`Pi SSE event ${index} id 无效`);
  if (value.object !== "chat.completion.chunk" || value.model !== input.expected_model) throw new Error(`Pi SSE event ${index} object/model 漂移`);
  if (!Number.isSafeInteger(value.created) || Number(value.created) < 0) throw new Error(`Pi SSE event ${index} created 无效`);
  if (input.response_id !== null && value.id !== input.response_id) throw new Error(`Pi SSE event ${index} id 漂移`);
  if (input.created !== null && value.created !== input.created) throw new Error(`Pi SSE event ${index} created 漂移`);
  return { response_id: value.id, created: Number(value.created) };
}

function assertChoice(value: unknown, index: number): JsonRecord {
  if (!Array.isArray(value) || Object.keys(value).length !== 1 || value.length !== 1 || !isRecord(value[0])) {
    throw new Error(`Pi SSE event ${index} choices 必须恰有 index=0 的一个 choice`);
  }
  const choice = value[0];
  exactKeys(choice, ["index", "delta", "finish_reason"], `Pi SSE event ${index} choice`);
  if (choice.index !== 0 || !isRecord(choice.delta)) throw new Error(`Pi SSE event ${index} choice index/delta 无效`);
  return choice;
}

function assertRawUsage(value: unknown, index: number, maxInput: number, maxOutput: number): FormalOraclePiRawUsageV1 {
  if (!isRecord(value)) throw new Error(`Pi SSE event ${index} usage 无效`);
  exactKeys(value, ["prompt_tokens", "completion_tokens", "total_tokens", "prompt_tokens_details", "completion_tokens_details"], `Pi SSE event ${index} usage`);
  for (const field of ["prompt_tokens", "completion_tokens", "total_tokens"] as const) {
    if (!Number.isSafeInteger(value[field]) || Number(value[field]) < 0) throw new Error(`Pi SSE usage.${field} 必须是非负安全整数`);
  }
  if (value.total_tokens !== Number(value.prompt_tokens) + Number(value.completion_tokens)) throw new Error("Pi SSE usage.total_tokens 必须等于 prompt+completion");
  if (Number(value.prompt_tokens) > maxInput || Number(value.completion_tokens) > maxOutput) throw new Error("Pi SSE usage 超过冻结 input/output token budget");
  if (!isRecord(value.prompt_tokens_details) || !isRecord(value.completion_tokens_details)) throw new Error("Pi SSE usage details 无效");
  exactKeys(value.prompt_tokens_details, ["cached_tokens"], "Pi SSE prompt_tokens_details");
  exactKeys(value.completion_tokens_details, ["reasoning_tokens"], "Pi SSE completion_tokens_details");
  if (value.prompt_tokens_details.cached_tokens !== 0 || value.completion_tokens_details.reasoning_tokens !== 0) {
    throw new Error("Pi SSE formal cache/reasoning usage 必须为 0");
  }
  return value as unknown as FormalOraclePiRawUsageV1;
}

function parseStream(input: {
  raw_sse_bytes: Uint8Array;
  expected_model: string;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  expected_max_input_tokens: number;
  expected_max_output_tokens: number;
}): { proof: FormalOraclePiResponseStreamProofV1; assistant_content_bytes: Uint8Array } {
  assertSha(input.request_envelope_sha256, "request_envelope_sha256");
  assertSha(input.provider_body_sha256, "provider_body_sha256");
  if (!Number.isSafeInteger(input.expected_max_input_tokens) || input.expected_max_input_tokens <= 0
    || !Number.isSafeInteger(input.expected_max_output_tokens) || input.expected_max_output_tokens <= 0) throw new Error("Pi SSE expected token budgets 无效");
  if (!input.expected_model || input.expected_model.length > 256 || input.expected_model.trim() !== input.expected_model) throw new Error("expected_model 无效");
  assertScalar(input.expected_model, "expected_model");
  if (!(input.raw_sse_bytes instanceof Uint8Array) || input.raw_sse_bytes.byteLength === 0
    || input.raw_sse_bytes.byteLength > FORMAL_ORACLE_PI_RESPONSE_STREAM_MAX_BYTES) throw new Error("Pi SSE raw bytes 长度无效或超限");
  if (input.raw_sse_bytes.byteLength >= 3 && input.raw_sse_bytes[0] === 0xef
    && input.raw_sse_bytes[1] === 0xbb && input.raw_sse_bytes[2] === 0xbf) {
    throw new Error("Pi SSE v1 禁止 UTF-8 BOM");
  }
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(input.raw_sse_bytes); }
  catch { throw new Error("Pi SSE raw bytes 不是有效 UTF-8"); }
  if (source.includes("\r")) throw new Error("Pi SSE v1 只允许 LF 行规，拒绝 CRLF/CR");
  if (!source.endsWith("\n\n")) throw new Error("Pi SSE 必须以唯一 DONE event 的空行结束");
  const frames = source.slice(0, -2).split("\n\n");
  if (frames.length < 4 || frames.length > FORMAL_ORACLE_PI_RESPONSE_STREAM_MAX_CONTENT_EVENTS + 4) throw new Error("Pi SSE event 数量无效或超限");
  if (frames.at(-1) !== "data: [DONE]") throw new Error("Pi SSE 缺少或重复/错位 [DONE]");
  if (frames.slice(0, -1).some((frame) => frame === "data: [DONE]")) throw new Error("Pi SSE [DONE] 重复");

  const jsonFrames = frames.slice(0, -1).map((frame, index) => parseStrictEvent(frame, index));
  if (jsonFrames.length < 3) throw new Error("Pi SSE 必须包含 content、finish 与 usage event");
  const deltaFrames = jsonFrames.slice(0, -2);
  if (!deltaFrames.length || deltaFrames.length > FORMAL_ORACLE_PI_RESPONSE_STREAM_MAX_CONTENT_EVENTS + 1) throw new Error("Pi SSE delta event 数量无效");
  const common = { expected_model: input.expected_model, response_id: null as string | null, created: null as number | null };
  const chunks: string[] = [];
  let rolePreludeCount: 0 | 1 = 0;
  deltaFrames.forEach((event, index) => {
    const identity = assertCommonChunk(event, common, index, false);
    common.response_id ??= identity.response_id;
    common.created ??= identity.created;
    const choice = assertChoice(event.choices, index);
    if (choice.finish_reason !== null) throw new Error(`Pi SSE content event ${index} 不得携带 finish`);
    const delta = choice.delta as JsonRecord;
    if (index === 0 && Object.hasOwn(delta, "role")) {
      exactKeys(delta, ["role", "content"], "Pi SSE role prelude delta");
      if (delta.role !== "assistant" || delta.content !== "") throw new Error("Pi SSE 可选首帧 role prelude 必须是空 assistant content");
      rolePreludeCount = 1;
      return;
    }
    exactKeys(delta, ["content"], `Pi SSE content event ${index} delta`);
    if (typeof delta.content !== "string" || delta.content.length === 0) throw new Error(`Pi SSE content event ${index} 不得空洞`);
    assertScalar(delta.content, `Pi SSE content event ${index}`);
    chunks.push(delta.content);
  });
  if (!chunks.length || chunks.length > FORMAL_ORACLE_PI_RESPONSE_STREAM_MAX_CONTENT_EVENTS) throw new Error("Pi SSE 必须包含 1..N 个非空 content delta");

  const finishIndex = deltaFrames.length;
  const finish = jsonFrames.at(-2)!;
  assertCommonChunk(finish, common, finishIndex, false);
  const finishChoice = assertChoice(finish.choices, finishIndex);
  if (finishChoice.finish_reason !== "stop") throw new Error("Pi SSE finish_reason 必须唯一且为 stop，拒绝 length/error/tool");
  exactKeys(finishChoice.delta as JsonRecord, [], "Pi SSE finish delta");

  const usageIndex = deltaFrames.length + 1;
  const usageEvent = jsonFrames.at(-1)!;
  assertCommonChunk(usageEvent, common, usageIndex, true);
  if (!Array.isArray(usageEvent.choices) || usageEvent.choices.length !== 0 || Object.keys(usageEvent.choices).length !== 0) {
    throw new Error("Pi SSE usage-only event choices 必须为空");
  }
  const rawUsage = assertRawUsage(usageEvent.usage, usageIndex, input.expected_max_input_tokens, input.expected_max_output_tokens);
  const contentBytes = new TextEncoder().encode(chunks.join(""));
  if (contentBytes.byteLength === 0 || contentBytes.byteLength > FORMAL_ORACLE_PI_RESPONSE_STREAM_MAX_BYTES) throw new Error("Pi SSE assistant content 长度无效或超限");

  const proofDraft: FormalOraclePiResponseStreamProofV1 = {
    schema_version: FORMAL_ORACLE_PI_RESPONSE_STREAM_VERSION,
    proof_sha256: "0".repeat(64),
    request_envelope_sha256: input.request_envelope_sha256,
    provider_body_sha256: input.provider_body_sha256,
    raw_sse_sha256: sha256Hex(input.raw_sse_bytes),
    raw_sse_byte_length: input.raw_sse_bytes.byteLength,
    assistant_content_sha256: sha256Hex(contentBytes),
    assistant_content_byte_length: contentBytes.byteLength,
    response_id: common.response_id!,
    model: input.expected_model,
    created: common.created!,
    role_prelude_count: rolePreludeCount,
    content_event_count: chunks.length,
    finish_reason: "stop",
    done_count: 1,
    expected_max_input_tokens: input.expected_max_input_tokens,
    expected_max_output_tokens: input.expected_max_output_tokens,
    raw_usage: Object.freeze({ ...rawUsage, prompt_tokens_details: Object.freeze({ ...rawUsage.prompt_tokens_details }), completion_tokens_details: Object.freeze({ ...rawUsage.completion_tokens_details }) }),
    normalized_usage: Object.freeze({
      input_tokens: rawUsage.prompt_tokens,
      output_tokens: rawUsage.completion_tokens,
      total_tokens: rawUsage.total_tokens,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
    }),
    provider_response_scope: "untrusted_sse_entity_strict_derivation_only",
    store_integration_status: "formal_run_store_v2_abcd_integrated",
    external_provider_response_status: "pending_endpoint_account_exactly_once_and_capture",
    api_execution_allowed: false,
  };
  proofDraft.proof_sha256 = hashFormalOraclePiResponseStreamProofV1(proofDraft);
  const proof = Object.freeze(proofDraft);
  return { proof, assistant_content_bytes: contentBytes };
}

export function parseFormalOraclePiResponseStreamV1(input: {
  raw_sse_bytes: Uint8Array;
  expected_model: string;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  expected_max_input_tokens: number;
  expected_max_output_tokens: number;
}): FormalOraclePiResponseStreamProofV1 {
  return parseStream(input).proof;
}

export function createFormalOraclePiResponseStreamArtifactV1(input: {
  raw_sse_bytes: Uint8Array;
  expected_model: string;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  expected_max_input_tokens: number;
  expected_max_output_tokens: number;
}): FormalOraclePiResponseStreamArtifactV1 {
  const frozenRaw = Uint8Array.from(input.raw_sse_bytes);
  const parsed = parseStream({ ...input, raw_sse_bytes: frozenRaw });
  const artifact = Object.freeze({
    proof: parsed.proof,
    raw_sse_bytes: Uint8Array.from(frozenRaw),
    assistant_content_bytes: Uint8Array.from(parsed.assistant_content_bytes),
  });
  activeArtifacts.add(artifact);
  artifactInputs.set(artifact, {
    expected_model: input.expected_model,
    request_envelope_sha256: input.request_envelope_sha256,
    provider_body_sha256: input.provider_body_sha256,
    expected_max_input_tokens: input.expected_max_input_tokens,
    expected_max_output_tokens: input.expected_max_output_tokens,
  });
  return artifact;
}

export function assertFormalOraclePiResponseStreamArtifactV1(value: FormalOraclePiResponseStreamArtifactV1): void {
  if (!value || typeof value !== "object" || !activeArtifacts.has(value as object)) throw new Error("Pi SSE artifact 无效或由调用方伪造");
}

export function revalidateFormalOraclePiResponseStreamArtifactV1(
  value: FormalOraclePiResponseStreamArtifactV1,
): FormalOraclePiResponseStreamArtifactV1 {
  assertFormalOraclePiResponseStreamArtifactV1(value);
  const inputs = artifactInputs.get(value as object);
  if (!inputs) throw new Error("Pi SSE artifact 缺少进程内 provenance");
  const reparsed = createFormalOraclePiResponseStreamArtifactV1({ ...inputs, raw_sse_bytes: value.raw_sse_bytes });
  if (JSON.stringify(reparsed.proof) !== JSON.stringify(value.proof)
    || reparsed.assistant_content_bytes.byteLength !== value.assistant_content_bytes.byteLength
    || !reparsed.assistant_content_bytes.every((byte, index) => byte === value.assistant_content_bytes[index])
    || sha256Hex(value.assistant_content_bytes) !== value.proof.assistant_content_sha256) {
    throw new Error("Pi SSE artifact raw/content/proof 漂移");
  }
  return reparsed;
}

export function buildFormalOraclePiResponseStreamFixtureV1(input: {
  response_id: string;
  model: string;
  created: number;
  content_chunks: string[];
  usage: FormalOraclePiRawUsageV1;
}): Uint8Array {
  if (!Array.isArray(input.content_chunks) || !input.content_chunks.length) throw new Error("Pi SSE fixture content_chunks 无效");
  const common = { id: input.response_id, object: "chat.completion.chunk", created: input.created, model: input.model };
  const frames: unknown[] = [{
    ...common,
    choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
  }, ...input.content_chunks.map((content) => ({
    ...common,
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  }))];
  frames.push({ ...common, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] } as never);
  const values: unknown[] = [...frames, { ...common, choices: [], usage: input.usage }];
  return new TextEncoder().encode(`${values.map((value) => `data: ${JSON.stringify(value)}`).join("\n\n")}\n\ndata: [DONE]\n\n`);
}
