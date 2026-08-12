import { sha256Hex } from "./sha256.js";
import {
  FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
  FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
} from "./oracle-gate-provider-request.js";

export const FORMAL_ORACLE_TRANSPORT_CAPTURE_VERSION = "formal-oracle-transport-capture-v1" as const;
export const FORMAL_ORACLE_TRANSPORT_CAPTURE_DOMAIN = "skyclass/formal-oracle/transport-capture/v1\0";

export type FormalOracleTransportCaptureStatus =
  | "complete_fetch_entity"
  | "partial_fetch_entity_unknown"
  | "request_started_no_response_unknown";

export interface FormalOracleResolvedAddressV1 {
  address: string;
  family: 4 | 6;
}

export interface FormalOracleCapturedPublicHeaderV1 {
  name: "content-type" | "x-request-id" | "request-id" | "openai-request-id";
  value: string;
}

export interface FormalOracleTransportCaptureRecordV1 {
  schema_version: typeof FORMAL_ORACLE_TRANSPORT_CAPTURE_VERSION;
  capture_record_sha256: string;
  transport_registry_sha256: string;
  run_sha256: string;
  execution_plan_sha256: string;
  request_id: string;
  intent_sha256: string;
  attempt_ordinal: number;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  provider_body_profile: typeof FORMAL_ORACLE_PROVIDER_BODY_PROFILE;
  prepared_adapter_version: typeof FORMAL_ORACLE_PREPARED_ADAPTER_VERSION;
  transport: "pi";
  model: string;
  endpoint: {
    base_url: string;
    chat_completions_url: string;
    method: "POST";
    redirect_policy: "error";
    tls_required: true;
  };
  account: {
    provider_id: string;
    account_key_id: string;
    credential_key_id: string;
  };
  dns_resolution_policy: "all_answers_public_selected_address_pinned_lookup-v1";
  resolved_addresses: FormalOracleResolvedAddressV1[];
  selected_address: string;
  selected_family: 4 | 6;
  request_started_at: string;
  response_headers_received_at: string | null;
  capture_finished_at: string;
  network_request_started: true;
  capture_status: FormalOracleTransportCaptureStatus;
  response_http_status: number | null;
  response_public_headers: FormalOracleCapturedPublicHeaderV1[];
  response_headers_commitment_sha256: string | null;
  provider_http_request_id: string | null;
  response_content_type: string | null;
  /** Durable exact fetch-observed entity bytes; present for complete and partial captures. */
  captured_entity_object_uri: string | null;
  captured_entity_bytes_sha256: string | null;
  captured_entity_byte_length: number | null;
  error_code: "transport_response_incomplete_or_unknown" | null;
  provenance_status: "runtime_https_pinned_lookup_capture_external_worm_pending";
  api_execution_allowed: false;
}

export interface FormalOracleTransportCaptureArtifactV1 {
  readonly record: Readonly<FormalOracleTransportCaptureRecordV1>;
  readonly captured_entity_bytes: Uint8Array | null;
}


export interface FormalOracleTransportCaptureValidationReport {
  valid: boolean;
  issues: Array<{ path: string; message: string }>;
}

const activeArtifacts = new WeakSet<object>();
const artifactInputs = new WeakMap<object, FormalOracleTransportCaptureBuildInputV1>();
const HEADER_NAMES = ["content-type", "openai-request-id", "request-id", "x-request-id"] as const;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dense(value: unknown): value is unknown[] {
  return Array.isArray(value) && Object.keys(value).length === value.length
    && Object.keys(value).every((key, index) => key === String(index));
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function isSha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value);
}

function isCanonicalTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isUnicodeScalarString(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.trim() !== value) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("transport capture 数值必须是安全整数");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (!dense(value)) throw new Error("transport capture 数组必须稠密");
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  throw new Error("transport capture 只能包含 JSON 值");
}

function ipv4Parts(value: string): number[] | null {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  return parts.every((part) => part <= 255) ? parts : null;
}

function ipv6Parts(value: string): number[] | null {
  if (value !== value.toLowerCase() || value.includes("%") || value.includes(".")) return null;
  if (!/^[0-9a-f:]+$/.test(value) || (value.match(/::/g) ?? []).length > 1) return null;
  const sides = value.split("::");
  const left = sides[0] ? sides[0].split(":") : [];
  const right = sides.length === 2 && sides[1] ? sides[1].split(":") : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if (sides.length === 1 ? missing !== 0 : missing < 1) return null;
  return [...left.map((part) => parseInt(part, 16)), ...Array(missing).fill(0), ...right.map((part) => parseInt(part, 16))];
}

/** Conservative public-address policy used by the pinned HTTPS lookup. */
export function isPublicFormalOracleIpAddress(value: string, family?: 4 | 6): boolean {
  const v4 = ipv4Parts(value);
  if (v4) {
    if (family === 6) return false;
    const [a, b, c] = v4;
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && c === 0)
      || (a === 192 && b === 0 && c === 2)
      || (a === 192 && b === 88 && c === 99)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113));
  }
  const v6 = ipv6Parts(value);
  if (!v6 || family === 4) return false;
  // Only conservative global-unicast 2000::/3; exclude documentation,
  // legacy 6to4 and low 2001 special-purpose allocations.
  return v6[0] >= 0x2000 && v6[0] <= 0x3fff
    && !(v6[0] === 0x2001 && (v6[1] <= 0x01ff || v6[1] === 0x0db8))
    && v6[0] !== 0x2002 && v6[0] !== 0x3ffe;
}

function canonicalHeaders(headers: FormalOracleCapturedPublicHeaderV1[]): FormalOracleCapturedPublicHeaderV1[] {
  if (!dense(headers)) throw new Error("response public headers 必须是稠密数组");
  const cloned = headers.map((item) => ({ name: item.name, value: item.value }));
  for (const item of cloned) {
    if (!HEADER_NAMES.includes(item.name) || !isUnicodeScalarString(item.value) || /[\r\n]/.test(item.value)) {
      throw new Error("response public header 不在 frozen allowlist 或值无效");
    }
  }
  cloned.sort((a, b) => a.name.localeCompare(b.name) || a.value.localeCompare(b.value));
  if (new Set(cloned.map((item) => item.name)).size !== cloned.length) throw new Error("response public header name 必须唯一");
  return cloned;
}

export function hashFormalOracleResponsePublicHeadersV1(headers: FormalOracleCapturedPublicHeaderV1[]): string {
  return sha256Hex(`skyclass/formal-oracle/response-public-headers/v1\0${stableJson(canonicalHeaders(headers))}`);
}

export function formalOracleCapturedEntityObjectUri(runSha256: string, entitySha256: string): string {
  if (!isSha(runSha256) || !isSha(entitySha256)) throw new Error("captured entity run/hash 无效");
  return `runs/${runSha256}/objects/transport-captured-entities/${entitySha256}/entity.bin`;
}

export function canonicalFormalOracleTransportCapturePayload(input: FormalOracleTransportCaptureRecordV1): string {
  const { capture_record_sha256: _hash, ...payload } = input;
  return stableJson(payload);
}

export function hashFormalOracleTransportCaptureRecordV1(input: FormalOracleTransportCaptureRecordV1): string {
  return sha256Hex(`${FORMAL_ORACLE_TRANSPORT_CAPTURE_DOMAIN}${canonicalFormalOracleTransportCapturePayload(input)}`);
}

export function validateFormalOracleTransportCaptureRecordV1(input: unknown): FormalOracleTransportCaptureValidationReport {
  const issues: FormalOracleTransportCaptureValidationReport["issues"] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!record(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  const keys = ["schema_version", "capture_record_sha256", "transport_registry_sha256", "run_sha256", "execution_plan_sha256", "request_id", "intent_sha256", "attempt_ordinal", "request_envelope_sha256", "provider_body_sha256", "provider_body_profile", "prepared_adapter_version", "transport", "model", "endpoint", "account", "dns_resolution_policy", "resolved_addresses", "selected_address", "selected_family", "request_started_at", "response_headers_received_at", "capture_finished_at", "network_request_started", "capture_status", "response_http_status", "response_public_headers", "response_headers_commitment_sha256", "provider_http_request_id", "response_content_type", "captured_entity_object_uri", "captured_entity_bytes_sha256", "captured_entity_byte_length", "error_code", "provenance_status", "api_execution_allowed"];
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== FORMAL_ORACLE_TRANSPORT_CAPTURE_VERSION) issue("schema_version", "版本无效");
  for (const field of ["capture_record_sha256", "transport_registry_sha256", "run_sha256", "execution_plan_sha256", "intent_sha256", "request_envelope_sha256", "provider_body_sha256"] as const) if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  if (!isId(input.request_id) || !isUnicodeScalarString(input.model) || !Number.isSafeInteger(input.attempt_ordinal) || Number(input.attempt_ordinal) < 1) issue("identity", "request/model/ordinal 无效");
  if (input.provider_body_profile !== FORMAL_ORACLE_PROVIDER_BODY_PROFILE || input.prepared_adapter_version !== FORMAL_ORACLE_PREPARED_ADAPTER_VERSION || input.transport !== "pi") issue("profile", "profile/adapter/transport 无效");
  if (!record(input.endpoint) || !exactKeys(input.endpoint, ["base_url", "chat_completions_url", "method", "redirect_policy", "tls_required"])
    || typeof input.endpoint.base_url !== "string" || input.endpoint.chat_completions_url !== `${input.endpoint.base_url}/chat/completions`
    || input.endpoint.method !== "POST" || input.endpoint.redirect_policy !== "error" || input.endpoint.tls_required !== true) issue("endpoint", "endpoint binding 无效");
  if (!record(input.account) || !exactKeys(input.account, ["provider_id", "account_key_id", "credential_key_id"])
    || !isId(input.account.provider_id) || !isId(input.account.account_key_id) || !isId(input.account.credential_key_id)) issue("account", "account binding 无效");
  if (input.dns_resolution_policy !== "all_answers_public_selected_address_pinned_lookup-v1" || !dense(input.resolved_addresses) || !input.resolved_addresses.length) issue("resolved_addresses", "DNS policy/answers 无效");
  else {
    const values: string[] = [];
    for (const [index, raw] of input.resolved_addresses.entries()) {
      if (!record(raw) || !exactKeys(raw, ["address", "family"]) || (raw.family !== 4 && raw.family !== 6)
        || typeof raw.address !== "string" || !isPublicFormalOracleIpAddress(raw.address, raw.family)) issue(`resolved_addresses[${index}]`, "必须是 canonical public IP");
      else values.push(`${raw.family}:${raw.address}`);
    }
    if (new Set(values).size !== values.length || JSON.stringify(values) !== JSON.stringify([...values].sort())) issue("resolved_addresses", "必须唯一且按 family/address 排序");
  }
  if ((input.selected_family !== 4 && input.selected_family !== 6) || typeof input.selected_address !== "string"
    || !isPublicFormalOracleIpAddress(input.selected_address, input.selected_family)
    || !Array.isArray(input.resolved_addresses) || !input.resolved_addresses.some((item) => record(item) && item.address === input.selected_address && item.family === input.selected_family)) issue("selected_address", "selected address 未绑定 public DNS answers");
  if (!isCanonicalTime(input.request_started_at) || !isCanonicalTime(input.capture_finished_at)
    || Date.parse(String(input.capture_finished_at)) < Date.parse(String(input.request_started_at))
    || (input.response_headers_received_at !== null && (!isCanonicalTime(input.response_headers_received_at)
      || Date.parse(String(input.response_headers_received_at)) < Date.parse(String(input.request_started_at))
      || Date.parse(String(input.response_headers_received_at)) > Date.parse(String(input.capture_finished_at))))) issue("time", "capture 时间无效");
  if (input.network_request_started !== true || !["complete_fetch_entity", "partial_fetch_entity_unknown", "request_started_no_response_unknown"].includes(String(input.capture_status))) issue("capture_status", "状态无效");
  let headers: FormalOracleCapturedPublicHeaderV1[] = [];
  try { headers = canonicalHeaders(input.response_public_headers as FormalOracleCapturedPublicHeaderV1[]); }
  catch { issue("response_public_headers", "headers allowlist/canonical form 无效"); }
  if (JSON.stringify(headers) !== JSON.stringify(input.response_public_headers)) issue("response_public_headers", "headers 必须 canonical 排序");
  const status = input.capture_status as FormalOracleTransportCaptureStatus;
  if (status === "request_started_no_response_unknown") {
    if (input.response_headers_received_at !== null || input.response_http_status !== null || headers.length || input.response_headers_commitment_sha256 !== null
      || input.provider_http_request_id !== null || input.response_content_type !== null || input.captured_entity_object_uri !== null || input.captured_entity_bytes_sha256 !== null
      || input.captured_entity_byte_length !== null || input.error_code !== "transport_response_incomplete_or_unknown") issue("capture", "no-response unknown 不得声称 headers/entity");
  } else {
    if (!isCanonicalTime(input.response_headers_received_at) || !Number.isSafeInteger(input.response_http_status)
      || Number(input.response_http_status) < 100 || Number(input.response_http_status) > 599
      || input.response_headers_commitment_sha256 !== hashFormalOracleResponsePublicHeadersV1(headers)
      || (input.response_content_type !== null && (!isUnicodeScalarString(input.response_content_type) || input.response_content_type !== input.response_content_type.toLowerCase()))
      || !isSha(input.captured_entity_bytes_sha256) || input.captured_entity_object_uri !== formalOracleCapturedEntityObjectUri(String(input.run_sha256), String(input.captured_entity_bytes_sha256))
      || !Number.isSafeInteger(input.captured_entity_byte_length) || Number(input.captured_entity_byte_length) < 0) issue("capture", "response headers/entity binding 无效");
    const contentType = headers.find((item) => item.name === "content-type")?.value.split(";", 1)[0]?.trim().toLowerCase() ?? null;
    const requestId = headers.find((item) => item.name === "x-request-id")?.value
      ?? headers.find((item) => item.name === "request-id")?.value
      ?? headers.find((item) => item.name === "openai-request-id")?.value ?? null;
    if (contentType !== input.response_content_type || requestId !== input.provider_http_request_id) issue("capture", "content-type/provider request ID 未由 headers 精确派生");
    if (status === "complete_fetch_entity" ? input.error_code !== null : input.error_code !== "transport_response_incomplete_or_unknown") issue("error_code", "必须由 complete/partial 状态派生");
  }
  if (input.provenance_status !== "runtime_https_pinned_lookup_capture_external_worm_pending" || input.api_execution_allowed !== false) issue("gates", "capture 不得提升 WORM/API gate");
  if (isSha(input.capture_record_sha256) && hashFormalOracleTransportCaptureRecordV1(input as unknown as FormalOracleTransportCaptureRecordV1) !== input.capture_record_sha256) issue("capture_record_sha256", "内容地址不匹配");
  return { valid: issues.length === 0, issues };
}

export interface FormalOracleTransportCaptureBuildInputV1 extends Omit<FormalOracleTransportCaptureRecordV1,
  "schema_version" | "capture_record_sha256" | "captured_entity_object_uri" | "captured_entity_bytes_sha256" | "captured_entity_byte_length" | "response_headers_commitment_sha256"> {
  captured_entity_bytes: Uint8Array | null;
}

export function createFormalOracleTransportCaptureArtifactV1(
  input: FormalOracleTransportCaptureBuildInputV1,
): FormalOracleTransportCaptureArtifactV1 {
  const bytes = input.captured_entity_bytes === null ? null : Uint8Array.from(input.captured_entity_bytes);
  const publicHeaders = canonicalHeaders(input.response_public_headers);
  const draft: FormalOracleTransportCaptureRecordV1 = {
    ...structuredClone(input),
    schema_version: FORMAL_ORACLE_TRANSPORT_CAPTURE_VERSION,
    capture_record_sha256: "0".repeat(64),
    resolved_addresses: structuredClone(input.resolved_addresses).sort((a, b) => `${a.family}:${a.address}`.localeCompare(`${b.family}:${b.address}`)),
    response_public_headers: publicHeaders,
    response_headers_commitment_sha256: input.response_headers_received_at === null ? null : hashFormalOracleResponsePublicHeadersV1(publicHeaders),
    captured_entity_object_uri: bytes === null ? null : formalOracleCapturedEntityObjectUri(input.run_sha256, sha256Hex(bytes)),
    captured_entity_bytes_sha256: bytes === null ? null : sha256Hex(bytes),
    captured_entity_byte_length: bytes?.byteLength ?? null,
  };
  delete (draft as unknown as Record<string, unknown>).captured_entity_bytes;
  draft.capture_record_sha256 = hashFormalOracleTransportCaptureRecordV1(draft);
  const report = validateFormalOracleTransportCaptureRecordV1(draft);
  if (!report.valid) throw new Error(`Formal transport capture 无效：${report.issues[0]?.path} ${report.issues[0]?.message}`);
  const artifact = Object.freeze({ record: Object.freeze(draft), captured_entity_bytes: bytes });
  activeArtifacts.add(artifact);
  artifactInputs.set(artifact, { ...structuredClone(input), captured_entity_bytes: bytes === null ? null : Uint8Array.from(bytes) });
  return artifact;
}

export function assertFormalOracleTransportCaptureArtifactV1(value: FormalOracleTransportCaptureArtifactV1): void {
  if (!value || typeof value !== "object" || !activeArtifacts.has(value as object)) throw new Error("Formal transport capture artifact 无效或由调用方伪造");
}

export function revalidateFormalOracleTransportCaptureArtifactV1(
  value: FormalOracleTransportCaptureArtifactV1,
): FormalOracleTransportCaptureArtifactV1 {
  assertFormalOracleTransportCaptureArtifactV1(value);
  const input = artifactInputs.get(value as object);
  if (!input) throw new Error("Formal transport capture artifact 缺少进程内 provenance");
  const rebuilt = createFormalOracleTransportCaptureArtifactV1({ ...input, captured_entity_bytes: value.captured_entity_bytes });
  const bytesEqual = rebuilt.captured_entity_bytes === null && value.captured_entity_bytes === null
    || rebuilt.captured_entity_bytes !== null && value.captured_entity_bytes !== null
      && rebuilt.captured_entity_bytes.byteLength === value.captured_entity_bytes.byteLength
      && rebuilt.captured_entity_bytes.every((byte, index) => byte === value.captured_entity_bytes![index]);
  if (JSON.stringify(rebuilt.record) !== JSON.stringify(value.record) || !bytesEqual) throw new Error("Formal transport capture record/entity 漂移");
  return rebuilt;
}
