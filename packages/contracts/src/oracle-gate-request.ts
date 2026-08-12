import { sha256Hex } from "./sha256.js";

export const FORMAL_ORACLE_PI_REQUEST_ENVELOPE_VERSION = "formal-oracle-pi-request-envelope-v1" as const;

export interface FormalOraclePiRequestEnvelopeVisualV1 {
  label: "visual-1";
  mime_type: "image/jpeg";
  sha256: string;
  byte_length: number;
  data_base64: string;
}

/** Canonical future-Pi-adapter envelope, not claimed provider wire bytes. */
export interface FormalOraclePiRequestEnvelopeV1 {
  schema_version: typeof FORMAL_ORACLE_PI_REQUEST_ENVELOPE_VERSION;
  request_id: string;
  schedule_index: number;
  case_id: string;
  arm: "transcript_only" | "static_final_board" | "uniform_frame" | "oracle_delta";
  model: string;
  system_prompt: string;
  system_prompt_sha256: string;
  rendered_user_prompt: string;
  rendered_user_prompt_sha256: string;
  user_template_sha256: string;
  output_schema_sha256: string;
  visuals: FormalOraclePiRequestEnvelopeVisualV1[];
  seed: number;
  temperature: 0;
  max_input_tokens: number;
  max_output_tokens: number;
  timeout_ms: number;
  max_attempts: number;
  transport: "pi";
  cache_retention: "none";
  tools_policy: "none";
  tools: [];
  provider_binding_status: "pending_external_runtime_binding";
  inner_provider_retries: 0;
  outer_retry_owner: "formal_run_store";
}

export interface FormalOraclePiRequestBuildInput {
  request_id: string;
  schedule_index: number;
  case_id: string;
  arm: FormalOraclePiRequestEnvelopeV1["arm"];
  model: string;
  system_prompt_bytes: Uint8Array;
  expected_system_prompt_sha256: string;
  rendered_user_prompt_bytes: Uint8Array;
  expected_rendered_user_prompt_sha256: string;
  user_template_bytes: Uint8Array;
  expected_user_template_sha256: string;
  output_schema_sha256: string;
  visuals: Array<{ label: "visual-1"; mime_type: "image/jpeg"; bytes: Uint8Array; expected_sha256: string; expected_byte_length: number }>;
  seed: number;
  temperature: 0;
  max_input_tokens: number;
  max_output_tokens: number;
  timeout_ms: number;
  max_attempts: number;
  transport: "pi";
  cache_retention: "none";
  tools_policy: "none";
}

export interface FormalOraclePiRequestArtifact {
  readonly envelope: Readonly<FormalOraclePiRequestEnvelopeV1>;
  readonly bytes: Uint8Array;
  readonly payload_sha256: string;
}

const activeArtifacts = new WeakSet<object>();
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function dense(value: unknown): value is unknown[] {
  return Array.isArray(value) && Object.keys(value).length === value.length
    && Object.keys(value).every((key, index) => key === String(index));
}
function keys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(label + " 字段集合无效");
}
function sha(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function id(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value); }
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 1; }
function uint32(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 0xffff_ffff; }
function utf8(bytes: Uint8Array, label: string): string {
  let value: string;
  try { value = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error(label + " 不是有效 UTF-8"); }
  if (!value.length) throw new Error(label + " 不能为空");
  return value;
}
function equal(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}
function assertUnicodeScalars(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error(label + " 含 unpaired surrogate");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error(label + " 含 unpaired surrogate");
    }
  }
}
function assertJsonUnicodeScalars(value: unknown, label = "Formal request"): void {
  if (typeof value === "string") { assertUnicodeScalars(value, label); return; }
  if (Array.isArray(value)) { value.forEach((child, index) => assertJsonUnicodeScalars(child, `${label}[${index}]`)); return; }
  if (record(value)) {
    for (const [key, child] of Object.entries(value)) {
      assertUnicodeScalars(key, label + " object key");
      assertJsonUnicodeScalars(child, `${label}.${key}`);
    }
  }
}
function base64(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index], b = index + 1 < bytes.length ? bytes[index + 1] : 0, c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    output += ALPHABET[a >> 2] + ALPHABET[((a & 3) << 4) | (b >> 4)];
    output += index + 1 < bytes.length ? ALPHABET[((b & 15) << 2) | (c >> 6)] : "=";
    output += index + 2 < bytes.length ? ALPHABET[c & 63] : "=";
  }
  return output;
}
function unbase64(value: string, label: string): Uint8Array {
  if (!value || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error(label + " 必须是 canonical base64");
  const output: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const chunk = value.slice(index, index + 4);
    const a = ALPHABET.indexOf(chunk[0]), b = ALPHABET.indexOf(chunk[1]), c = chunk[2] === "=" ? 0 : ALPHABET.indexOf(chunk[2]), d = chunk[3] === "=" ? 0 : ALPHABET.indexOf(chunk[3]);
    output.push((a << 2) | (b >> 4));
    if (chunk[2] !== "=") output.push(((b & 15) << 4) | (c >> 2));
    if (chunk[3] !== "=") output.push(((c & 3) << 6) | d);
  }
  const bytes = Uint8Array.from(output);
  if (base64(bytes) !== value) throw new Error(label + " 必须是 canonical base64");
  return bytes;
}
function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") { assertUnicodeScalars(value, "Formal request string"); return JSON.stringify(value); }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Formal request JSON 数值必须是安全整数");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (!dense(value)) throw new Error("Formal request JSON 数组必须稠密且无附加属性");
    return "[" + value.map(canonical).join(",") + "]";
  }
  if (record(value)) return "{" + Object.keys(value).sort().map((key) => {
    assertUnicodeScalars(key, "Formal request object key");
    return JSON.stringify(key) + ":" + canonical(value[key]);
  }).join(",") + "}";
  throw new Error("Formal request 只能包含 JSON 值");
}

class Scanner {
  private index = 0;
  constructor(private readonly source: string) {}
  scan(): void { this.ws(); this.value(); this.ws(); if (this.index !== this.source.length) throw new Error("Formal request 含 JSON 尾随内容"); }
  private ws(): void { while (/[\u0009\u000a\u000d\u0020]/.test(this.source[this.index] || "")) this.index += 1; }
  private value(): void {
    const token = this.source[this.index];
    if (token === "{") this.object(); else if (token === "[") this.array(); else if (token === '"') this.string();
    else if (token === "-" || (token >= "0" && token <= "9")) this.number();
    else if (this.source.startsWith("true", this.index)) this.index += 4;
    else if (this.source.startsWith("false", this.index)) this.index += 5;
    else if (this.source.startsWith("null", this.index)) this.index += 4;
    else throw new Error("Formal request 不是严格 JSON");
  }
  private object(): void {
    this.index += 1; this.ws(); const seen = new Set<string>();
    if (this.source[this.index] === "}") { this.index += 1; return; }
    while (true) {
      if (this.source[this.index] !== '"') throw new Error("Formal request object key 无效");
      const key = this.string(); if (seen.has(key)) throw new Error("Formal request 含 duplicate key：" + key); seen.add(key); this.ws();
      if (this.source[this.index] !== ":") throw new Error("Formal request object 缺少冒号");
      this.index += 1; this.ws(); this.value(); this.ws();
      if (this.source[this.index] === "}") { this.index += 1; return; }
      if (this.source[this.index] !== ",") throw new Error("Formal request object 分隔符无效");
      this.index += 1; this.ws();
    }
  }
  private array(): void {
    this.index += 1; this.ws(); if (this.source[this.index] === "]") { this.index += 1; return; }
    while (true) {
      this.value(); this.ws(); if (this.source[this.index] === "]") { this.index += 1; return; }
      if (this.source[this.index] !== ",") throw new Error("Formal request array 分隔符无效");
      this.index += 1; this.ws();
    }
  }
  private string(): string {
    const start = this.index; this.index += 1;
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      if (code === 0x22) { this.index += 1; return JSON.parse(this.source.slice(start, this.index)) as string; }
      if (code < 0x20) throw new Error("Formal request string 含未转义控制字符");
      if (code === 0x5c) {
        this.index += 1; const escaped = this.source[this.index];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(this.source.slice(this.index + 1, this.index + 5))) throw new Error("Formal request unicode escape 无效");
          this.index += 5; continue;
        }
        if (!escaped || !'"\\/bfnrt'.includes(escaped)) throw new Error("Formal request escape 无效");
      }
      this.index += 1;
    }
    throw new Error("Formal request string 未闭合");
  }
  private number(): void {
    const rest = this.source.slice(this.index), match = /^-?(?:0|[1-9]\d*)/.exec(rest);
    if (!match || rest[match[0].length] === "." || /[eE]/.test(rest[match[0].length] || "")) throw new Error("Formal request 数值只允许整数词法");
    this.index += match[0].length; if (!Number.isSafeInteger(Number(match[0]))) throw new Error("Formal request 数值必须是安全整数");
  }
}

function validate(value: unknown): asserts value is FormalOraclePiRequestEnvelopeV1 {
  if (!record(value)) throw new Error("Formal request envelope 必须是对象");
  keys(value, [
    "schema_version", "request_id", "schedule_index", "case_id", "arm", "model", "system_prompt", "system_prompt_sha256",
    "rendered_user_prompt", "rendered_user_prompt_sha256", "user_template_sha256", "output_schema_sha256", "visuals",
    "seed", "temperature", "max_input_tokens", "max_output_tokens", "timeout_ms", "max_attempts", "transport",
    "cache_retention", "tools_policy", "tools", "provider_binding_status", "inner_provider_retries", "outer_retry_owner",
  ], "Formal request envelope");
  if (value.schema_version !== FORMAL_ORACLE_PI_REQUEST_ENVELOPE_VERSION) throw new Error("Formal request schema_version 无效");
  if (!id(value.request_id) || !id(value.case_id) || typeof value.model !== "string" || !value.model.trim()) throw new Error("Formal request identity/model 无效");
  if (!Number.isSafeInteger(value.schedule_index) || Number(value.schedule_index) < 0) throw new Error("Formal request schedule_index 无效");
  if (!["transcript_only", "static_final_board", "uniform_frame", "oracle_delta"].includes(String(value.arm))) throw new Error("Formal request arm 无效");
  if (typeof value.system_prompt !== "string" || !value.system_prompt.length || typeof value.rendered_user_prompt !== "string" || !value.rendered_user_prompt.length) throw new Error("Formal request prompt 不能为空");
  for (const field of ["system_prompt_sha256", "rendered_user_prompt_sha256", "user_template_sha256", "output_schema_sha256"] as const) if (!sha(value[field])) throw new Error("Formal request " + field + " 无效");
  if (sha256Hex(new TextEncoder().encode(value.system_prompt)) !== value.system_prompt_sha256
    || sha256Hex(new TextEncoder().encode(value.rendered_user_prompt)) !== value.rendered_user_prompt_sha256) throw new Error("Formal request prompt text/hash 不匹配");
  if (!dense(value.visuals)) throw new Error("Formal request visuals 必须是稠密数组");
  const count = value.arm === "transcript_only" ? 0 : 1;
  if (value.visuals.length !== count) throw new Error("Formal request arm visual 数量无效");
  value.visuals.forEach((raw, index) => {
    if (!record(raw)) throw new Error("Formal request visual 必须是对象");
    keys(raw, ["label", "mime_type", "sha256", "byte_length", "data_base64"], "Formal request visual");
    if (raw.label !== "visual-1" || raw.mime_type !== "image/jpeg" || !sha(raw.sha256) || !positive(raw.byte_length) || typeof raw.data_base64 !== "string") throw new Error("Formal request visual metadata 无效");
    const bytes = unbase64(raw.data_base64, "Formal request visual data_base64");
    if (bytes.byteLength !== raw.byte_length || sha256Hex(bytes) !== raw.sha256) throw new Error("Formal request visual bytes/hash/length 不匹配");
    if (index !== 0) throw new Error("Formal request visual 顺序无效");
  });
  if (!uint32(value.seed) || value.temperature !== 0) throw new Error("Formal request seed/temperature 无效");
  for (const field of ["max_input_tokens", "max_output_tokens", "timeout_ms", "max_attempts"] as const) if (!positive(value[field])) throw new Error("Formal request " + field + " 无效");
  if (value.transport !== "pi" || value.cache_retention !== "none" || value.tools_policy !== "none" || !dense(value.tools) || value.tools.length !== 0) throw new Error("Formal request transport/cache/tools 无效");
  if (value.provider_binding_status !== "pending_external_runtime_binding" || value.inner_provider_retries !== 0 || value.outer_retry_owner !== "formal_run_store") throw new Error("Formal request provider/retry policy 无效");
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); }
  return value;
}
function artifact(envelope: FormalOraclePiRequestEnvelopeV1, bytes: Uint8Array): FormalOraclePiRequestArtifact {
  const frozenBytes = Uint8Array.from(bytes);
  const value = Object.freeze({ envelope: freeze(envelope), bytes: frozenBytes, payload_sha256: sha256Hex(frozenBytes) });
  activeArtifacts.add(value); return value;
}

export function buildFormalOraclePiRequestEnvelope(input: FormalOraclePiRequestBuildInput): FormalOraclePiRequestArtifact {
  const system = utf8(input.system_prompt_bytes, "system_prompt_bytes"), user = utf8(input.rendered_user_prompt_bytes, "rendered_user_prompt_bytes");
  utf8(input.user_template_bytes, "user_template_bytes");
  if (sha256Hex(input.system_prompt_bytes) !== input.expected_system_prompt_sha256
    || sha256Hex(input.rendered_user_prompt_bytes) !== input.expected_rendered_user_prompt_sha256
    || sha256Hex(input.user_template_bytes) !== input.expected_user_template_sha256) throw new Error("Formal request prompt/template bytes/hash 不匹配");
  const envelope: FormalOraclePiRequestEnvelopeV1 = {
    schema_version: FORMAL_ORACLE_PI_REQUEST_ENVELOPE_VERSION, request_id: input.request_id, schedule_index: input.schedule_index,
    case_id: input.case_id, arm: input.arm, model: input.model, system_prompt: system, system_prompt_sha256: input.expected_system_prompt_sha256,
    rendered_user_prompt: user, rendered_user_prompt_sha256: input.expected_rendered_user_prompt_sha256,
    user_template_sha256: input.expected_user_template_sha256, output_schema_sha256: input.output_schema_sha256,
    visuals: input.visuals.map((visual) => {
      const bytes = Uint8Array.from(visual.bytes);
      if (sha256Hex(bytes) !== visual.expected_sha256 || bytes.byteLength !== visual.expected_byte_length) throw new Error("Formal request visual bytes/hash/length 不匹配");
      return { label: visual.label, mime_type: visual.mime_type, sha256: visual.expected_sha256, byte_length: visual.expected_byte_length, data_base64: base64(bytes) };
    }),
    seed: input.seed, temperature: input.temperature, max_input_tokens: input.max_input_tokens, max_output_tokens: input.max_output_tokens,
    timeout_ms: input.timeout_ms, max_attempts: input.max_attempts, transport: input.transport, cache_retention: input.cache_retention,
    tools_policy: input.tools_policy, tools: [], provider_binding_status: "pending_external_runtime_binding",
    inner_provider_retries: 0, outer_retry_owner: "formal_run_store",
  };
  validate(envelope); const bytes = new TextEncoder().encode(canonical(envelope)); return artifact(envelope, bytes);
}

export function parseFormalOraclePiRequestEnvelopeBytes(bytes: Uint8Array): FormalOraclePiRequestArtifact {
  const source = utf8(bytes, "Formal request bytes"); new Scanner(source).scan(); const value = JSON.parse(source) as unknown;
  assertJsonUnicodeScalars(value); validate(value);
  const canonicalBytes = new TextEncoder().encode(canonical(value));
  if (!equal(canonicalBytes, bytes)) throw new Error("Formal request bytes 必须是 strict canonical JSON");
  return artifact(value, canonicalBytes);
}
export function assertFormalOraclePiRequestArtifact(value: FormalOraclePiRequestArtifact): void {
  if (!value || typeof value !== "object" || !activeArtifacts.has(value as object)) throw new Error("Formal Pi request artifact 无效或由调用方伪造");
}
