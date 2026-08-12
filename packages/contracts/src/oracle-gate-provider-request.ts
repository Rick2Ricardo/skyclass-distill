import { sha256Hex } from "./sha256.js";
import {
  assertFormalOraclePiRequestArtifact,
  parseFormalOraclePiRequestEnvelopeBytes,
  type FormalOraclePiRequestArtifact,
  type FormalOraclePiRequestEnvelopeV1,
} from "./oracle-gate-request.js";

export const FORMAL_ORACLE_PROVIDER_BODY_PROFILE = "openai-chat-completions-direct-serialization-v1" as const;
export const FORMAL_ORACLE_PROVIDER_TOKEN_FIELD = "max_completion_tokens" as const;
export const FORMAL_ORACLE_PREPARED_ADAPTER_VERSION = "formal-oracle-prepared-provider-adapter-v1" as const;

export interface FormalOracleOpenAICompatibleBodyV1 {
  model: string;
  messages: [
    { role: "system"; content: string },
    { role: "user"; content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > },
  ];
  stream: true;
  stream_options: { include_usage: true };
  max_completion_tokens: number;
  temperature: 0;
  seed: number;
  store: false;
  tools: [];
}

export interface FormalOraclePreparedProviderRequestArtifactV1 {
  readonly provider_body_profile: typeof FORMAL_ORACLE_PROVIDER_BODY_PROFILE;
  readonly provider_body_dispatch_status: "not_dispatchable_transport_mismatch";
  readonly adapter_version: typeof FORMAL_ORACLE_PREPARED_ADAPTER_VERSION;
  readonly token_field: typeof FORMAL_ORACLE_PROVIDER_TOKEN_FIELD;
  readonly request_envelope_sha256: string;
  readonly provider_body_sha256: string;
  readonly timeout_ms: number;
  readonly http_method: "POST";
  readonly content_type: "application/json";
  readonly redirect_policy: "error";
  readonly hidden_provider_retries: 0;
  readonly body: Readonly<FormalOracleOpenAICompatibleBodyV1>;
  readonly body_bytes: Uint8Array;
  readonly pi_sdk_wire_equivalence_status: "pending_not_used_by_direct_profile";
  readonly provider_endpoint_account_status: "pending_external_runtime_binding";
  readonly formal_transport_compatibility_status: "pending_pi_or_direct_profile_selection";
  readonly runtime_toolchain_status: "pending_external_immutable_capsule";
  readonly provider_response_capture_status: "pending_strict_sse_capture_contract";
  readonly api_execution_allowed: false;
}

const activePrepared = new WeakSet<object>();
const preparedEnvelopes = new WeakMap<object, FormalOraclePiRequestArtifact>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function dense(value: unknown): value is unknown[] {
  return Array.isArray(value) && Object.keys(value).length === value.length
    && Object.keys(value).every((key, index) => key === String(index));
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} 字段集合无效`);
}
function scalar(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error(`${label} 含 unpaired surrogate`);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error(`${label} 含 unpaired surrogate`);
  }
}
function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") { scalar(value, "Prepared provider body string"); return JSON.stringify(value); }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Prepared provider body 数值必须是安全整数");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (!dense(value)) throw new Error("Prepared provider body 数组必须稠密且无附加属性");
    return `[${value.map(canonical).join(",")}]`;
  }
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => {
    scalar(key, "Prepared provider body object key");
    return `${JSON.stringify(key)}:${canonical(value[key])}`;
  }).join(",")}}`;
  throw new Error("Prepared provider body 只能包含 JSON 值");
}

class Scanner {
  private index = 0;
  constructor(private readonly source: string) {}
  scan(): void { this.ws(); this.value(); this.ws(); if (this.index !== this.source.length) throw new Error("Prepared provider body 含 JSON 尾随内容"); }
  private ws(): void { while (/[\u0009\u000a\u000d\u0020]/.test(this.source[this.index] || "")) this.index += 1; }
  private value(): void {
    const token = this.source[this.index];
    if (token === "{") this.object(); else if (token === "[") this.array(); else if (token === '"') this.string();
    else if (token === "-" || (token >= "0" && token <= "9")) this.number();
    else if (this.source.startsWith("true", this.index)) this.index += 4;
    else if (this.source.startsWith("false", this.index)) this.index += 5;
    else if (this.source.startsWith("null", this.index)) this.index += 4;
    else throw new Error("Prepared provider body 不是严格 JSON");
  }
  private object(): void {
    this.index += 1; this.ws(); const seen = new Set<string>();
    if (this.source[this.index] === "}") { this.index += 1; return; }
    while (true) {
      if (this.source[this.index] !== '"') throw new Error("Prepared provider body object key 无效");
      const key = this.string(); if (seen.has(key)) throw new Error(`Prepared provider body 含 duplicate key：${key}`); seen.add(key); this.ws();
      if (this.source[this.index] !== ":") throw new Error("Prepared provider body object 缺少冒号");
      this.index += 1; this.ws(); this.value(); this.ws();
      if (this.source[this.index] === "}") { this.index += 1; return; }
      if (this.source[this.index] !== ",") throw new Error("Prepared provider body object 分隔符无效");
      this.index += 1; this.ws();
    }
  }
  private array(): void {
    this.index += 1; this.ws(); if (this.source[this.index] === "]") { this.index += 1; return; }
    while (true) {
      this.value(); this.ws(); if (this.source[this.index] === "]") { this.index += 1; return; }
      if (this.source[this.index] !== ",") throw new Error("Prepared provider body array 分隔符无效");
      this.index += 1; this.ws();
    }
  }
  private string(): string {
    const start = this.index; this.index += 1;
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      if (code === 0x22) { this.index += 1; const value = JSON.parse(this.source.slice(start, this.index)) as string; scalar(value, "Prepared provider body string"); return value; }
      if (code < 0x20) throw new Error("Prepared provider body string 含未转义控制字符");
      if (code === 0x5c) {
        this.index += 1; const escaped = this.source[this.index];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(this.source.slice(this.index + 1, this.index + 5))) throw new Error("Prepared provider body unicode escape 无效");
          this.index += 5; continue;
        }
        if (!escaped || !'"\\/bfnrt'.includes(escaped)) throw new Error("Prepared provider body escape 无效");
      }
      this.index += 1;
    }
    throw new Error("Prepared provider body string 未闭合");
  }
  private number(): void {
    const rest = this.source.slice(this.index), match = /^-?(?:0|[1-9]\d*)/.exec(rest);
    if (!match || rest[match[0].length] === "." || /[eE]/.test(rest[match[0].length] || "")) throw new Error("Prepared provider body 数值只允许整数词法");
    this.index += match[0].length; if (!Number.isSafeInteger(Number(match[0]))) throw new Error("Prepared provider body 数值必须是安全整数");
  }
}

function strictUtf8(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Prepared provider body 不是有效 UTF-8"); }
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function bodyFromEnvelope(envelope: FormalOraclePiRequestEnvelopeV1): FormalOracleOpenAICompatibleBodyV1 {
  const content: FormalOracleOpenAICompatibleBodyV1["messages"][1]["content"] = [
    { type: "text", text: envelope.rendered_user_prompt },
  ];
  for (const visual of envelope.visuals) {
    content.push({ type: "text", text: `[VISUAL ${visual.label} sha256=${visual.sha256}]` });
    content.push({ type: "image_url", image_url: { url: `data:${visual.mime_type};base64,${visual.data_base64}` } });
  }
  return {
    model: envelope.model,
    messages: [{ role: "system", content: envelope.system_prompt }, { role: "user", content }],
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: envelope.max_output_tokens,
    temperature: envelope.temperature,
    seed: envelope.seed,
    store: false,
    tools: [],
  };
}
function validateBody(value: unknown, envelope: FormalOraclePiRequestEnvelopeV1): asserts value is FormalOracleOpenAICompatibleBodyV1 {
  if (!isRecord(value)) throw new Error("Prepared provider body 顶层必须是对象");
  exactKeys(value, ["model", "messages", "stream", "stream_options", "max_completion_tokens", "temperature", "seed", "store", "tools"], "Prepared provider body");
  if (value.model !== envelope.model || value.stream !== true || value.store !== false
    || value.max_completion_tokens !== envelope.max_output_tokens || value.temperature !== 0 || value.seed !== envelope.seed) {
    throw new Error("Prepared provider body model/stream/store/token/temperature/seed 未绑定 envelope");
  }
  if (!isRecord(value.stream_options)) throw new Error("Prepared provider body stream usage 无效");
  exactKeys(value.stream_options, ["include_usage"], "Prepared provider body stream_options");
  if (value.stream_options.include_usage !== true) throw new Error("Prepared provider body stream usage 无效");
  if (!dense(value.tools) || value.tools.length !== 0 || !dense(value.messages) || value.messages.length !== 2) throw new Error("Prepared provider body tools/messages 无效");
  const expected = bodyFromEnvelope(envelope);
  if (canonical(value) !== canonical(expected)) throw new Error("Prepared provider body 未逐字段绑定 request envelope");
}

function createArtifact(envelope: FormalOraclePiRequestArtifact, body: FormalOracleOpenAICompatibleBodyV1, bytes: Uint8Array): FormalOraclePreparedProviderRequestArtifactV1 {
  const value = Object.freeze({
    provider_body_profile: FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
    provider_body_dispatch_status: "not_dispatchable_transport_mismatch" as const,
    adapter_version: FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
    token_field: FORMAL_ORACLE_PROVIDER_TOKEN_FIELD,
    request_envelope_sha256: envelope.payload_sha256,
    provider_body_sha256: sha256Hex(bytes),
    timeout_ms: envelope.envelope.timeout_ms,
    http_method: "POST" as const,
    content_type: "application/json" as const,
    redirect_policy: "error" as const,
    hidden_provider_retries: 0 as const,
    body: freeze(body),
    body_bytes: Uint8Array.from(bytes),
    pi_sdk_wire_equivalence_status: "pending_not_used_by_direct_profile" as const,
    provider_endpoint_account_status: "pending_external_runtime_binding" as const,
    formal_transport_compatibility_status: "pending_pi_or_direct_profile_selection" as const,
    runtime_toolchain_status: "pending_external_immutable_capsule" as const,
    provider_response_capture_status: "pending_strict_sse_capture_contract" as const,
    api_execution_allowed: false as const,
  });
  activePrepared.add(value);
  preparedEnvelopes.set(value, envelope);
  return value;
}

export function buildFormalOraclePreparedProviderRequest(
  requestEnvelope: FormalOraclePiRequestArtifact,
): FormalOraclePreparedProviderRequestArtifactV1 {
  assertFormalOraclePiRequestArtifact(requestEnvelope);
  const reparsed = parseFormalOraclePiRequestEnvelopeBytes(requestEnvelope.bytes);
  if (reparsed.payload_sha256 !== requestEnvelope.payload_sha256) throw new Error("Prepared provider request envelope bytes/hash 漂移");
  const body = bodyFromEnvelope(reparsed.envelope);
  const bytes = new TextEncoder().encode(canonical(body));
  return createArtifact(reparsed, body, bytes);
}

export function parseFormalOraclePreparedProviderRequestBytes(input: {
  request_envelope: FormalOraclePiRequestArtifact;
  provider_body_bytes: Uint8Array;
}): FormalOraclePreparedProviderRequestArtifactV1 {
  assertFormalOraclePiRequestArtifact(input.request_envelope);
  const envelope = parseFormalOraclePiRequestEnvelopeBytes(input.request_envelope.bytes);
  const source = strictUtf8(input.provider_body_bytes);
  new Scanner(source).scan();
  const value = JSON.parse(source) as unknown;
  validateBody(value, envelope.envelope);
  const canonicalBytes = new TextEncoder().encode(canonical(value));
  if (canonicalBytes.byteLength !== input.provider_body_bytes.byteLength
    || !canonicalBytes.every((byte, index) => byte === input.provider_body_bytes[index])) {
    throw new Error("Prepared provider body 必须是 strict canonical JSON");
  }
  return createArtifact(envelope, value, canonicalBytes);
}

export function assertFormalOraclePreparedProviderRequestArtifact(
  value: FormalOraclePreparedProviderRequestArtifactV1,
): void {
  if (!value || typeof value !== "object" || !activePrepared.has(value as object)) {
    throw new Error("Prepared provider request artifact 无效或由调用方伪造");
  }
}

export function revalidateFormalOraclePreparedProviderRequestArtifact(
  value: FormalOraclePreparedProviderRequestArtifactV1,
): FormalOraclePreparedProviderRequestArtifactV1 {
  assertFormalOraclePreparedProviderRequestArtifact(value);
  const envelope = preparedEnvelopes.get(value as object);
  if (!envelope) throw new Error("Prepared provider request 缺少进程内 envelope provenance");
  if (value.provider_body_profile !== FORMAL_ORACLE_PROVIDER_BODY_PROFILE
    || value.provider_body_dispatch_status !== "not_dispatchable_transport_mismatch"
    || value.adapter_version !== FORMAL_ORACLE_PREPARED_ADAPTER_VERSION
    || value.token_field !== FORMAL_ORACLE_PROVIDER_TOKEN_FIELD || value.request_envelope_sha256 !== envelope.payload_sha256
    || value.http_method !== "POST" || value.content_type !== "application/json" || value.redirect_policy !== "error"
    || value.hidden_provider_retries !== 0
    || value.pi_sdk_wire_equivalence_status !== "pending_not_used_by_direct_profile"
    || value.provider_endpoint_account_status !== "pending_external_runtime_binding" || value.api_execution_allowed !== false) {
    throw new Error("Prepared provider request profile/provenance/status 漂移");
  }
  if (value.runtime_toolchain_status !== "pending_external_immutable_capsule"
    || value.provider_response_capture_status !== "pending_strict_sse_capture_contract"
    || value.formal_transport_compatibility_status !== "pending_pi_or_direct_profile_selection") {
    throw new Error("Prepared provider request runtime/response capture 尚未闭合");
  }
  const reparsed = parseFormalOraclePreparedProviderRequestBytes({ request_envelope: envelope, provider_body_bytes: value.body_bytes });
  if (reparsed.provider_body_sha256 !== value.provider_body_sha256 || canonical(reparsed.body) !== canonical(value.body)) {
    throw new Error("Prepared provider request body bytes/hash/object 漂移");
  }
  return reparsed;
}
