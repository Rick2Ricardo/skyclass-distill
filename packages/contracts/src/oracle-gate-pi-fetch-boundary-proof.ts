import { sha256Hex } from "./sha256.js";
import {
  validateFormalOraclePiResponseStreamProofV1,
  type FormalOraclePiResponseStreamProofV1,
} from "./oracle-gate-pi-response-stream.js";
import {
  FORMAL_ORACLE_PI_OBSERVED_LOCAL_DEPENDENCY_HASHES,
  FORMAL_ORACLE_REQUIRED_NODE_ENGINE,
} from "./oracle-gate-provider-request.js";

export const FORMAL_ORACLE_PI_FETCH_BOUNDARY_PROOF_VERSION = "formal-oracle-pi-fetch-boundary-proof-v1" as const;
export const FORMAL_ORACLE_PI_FETCH_BOUNDARY_PROOF_DOMAIN = "skyclass/formal-oracle/pi-fetch-boundary-proof/v1\0";

export interface FormalOraclePiFetchBoundaryProofV1 {
  schema_version: typeof FORMAL_ORACLE_PI_FETCH_BOUNDARY_PROOF_VERSION;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  captured_url: "https://example.invalid/v1/chat/completions";
  captured_method: "POST";
  fetch_count: 1;
  on_payload_count: 1;
  on_payload_replacement: false;
  sdk_retry_count_header: "0";
  completion_method: "models.complete_non_simple";
  requested_max_tokens: number;
  captured_max_completion_tokens: number;
  redirect_policy_status: "pending_not_bound_by_pi_sdk_fetch_boundary";
  runtime_node_version: string;
  required_node_engine: typeof FORMAL_ORACLE_REQUIRED_NODE_ENGINE;
  node_engine_status: "compatible_runtime_proved";
  runtime_toolchain_status: "runtime_engine_and_local_hashes_proved_external_immutable_capsule_pending";
  local_dependency_manifest_sha256: string;
  provider_endpoint_account_status: "pending_external_runtime_binding";
  local_fake_response_stream_proof: FormalOraclePiResponseStreamProofV1;
  provider_response_capture_status: "local_memory_fake_sse_proved_external_provider_pending";
  external_toolchain_authenticity_status: "pending_external_immutable_capsule";
  proof_status: "local_fake_fetch_exact_body_proved_non_executable";
  proof_sha256: string;
  api_execution_allowed: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Pi proof 数值必须是安全整数");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  throw new Error("Pi proof 只能包含 JSON 值");
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}
function sha(value: unknown): boolean { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function compatibleNode(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return false;
  const major = Number(match[1]), minor = Number(match[2]);
  return major > 22 || (major === 22 && minor >= 19);
}

export function hashFormalOraclePiFetchBoundaryProofV1(input: FormalOraclePiFetchBoundaryProofV1): string {
  const { proof_sha256: _hash, ...payload } = input;
  return sha256Hex(`${FORMAL_ORACLE_PI_FETCH_BOUNDARY_PROOF_DOMAIN}${stableJson(payload)}`);
}

/** A deterministic observation root, not an authenticated toolchain capsule. */
export function hashFormalOraclePiObservedLocalDependencyManifestV1(runtimeNodeVersion: string): string {
  if (!compatibleNode(runtimeNodeVersion)) throw new Error("Pi dependency manifest Node runtime 必须满足 >=22.19.0");
  return sha256Hex(stableJson({ ...FORMAL_ORACLE_PI_OBSERVED_LOCAL_DEPENDENCY_HASHES, runtime_node_version: runtimeNodeVersion }));
}

export function validateFormalOraclePiFetchBoundaryProofV1(input: unknown): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!isRecord(input)) return { valid: false, issues: ["proof 必须是对象"] };
  const keys = [
    "schema_version", "request_envelope_sha256", "provider_body_sha256", "captured_url", "captured_method",
    "fetch_count", "on_payload_count", "on_payload_replacement", "sdk_retry_count_header", "completion_method",
    "requested_max_tokens", "captured_max_completion_tokens", "redirect_policy_status", "runtime_node_version",
    "required_node_engine", "node_engine_status", "runtime_toolchain_status", "local_dependency_manifest_sha256",
    "provider_endpoint_account_status", "local_fake_response_stream_proof", "provider_response_capture_status",
    "external_toolchain_authenticity_status", "proof_status", "proof_sha256", "api_execution_allowed",
  ] as const;
  if (!exactKeys(input, keys)) issues.push("proof 字段集合无效");
  if (input.schema_version !== FORMAL_ORACLE_PI_FETCH_BOUNDARY_PROOF_VERSION) issues.push("proof 版本无效");
  if (!sha(input.request_envelope_sha256) || !sha(input.provider_body_sha256) || !sha(input.local_dependency_manifest_sha256) || !sha(input.proof_sha256)) issues.push("proof SHA 无效");
  if (input.captured_url !== "https://example.invalid/v1/chat/completions" || input.captured_method !== "POST") issues.push("proof 不是内部 example.invalid POST");
  if (input.fetch_count !== 1 || input.on_payload_count !== 1 || input.on_payload_replacement !== false || input.sdk_retry_count_header !== "0") issues.push("proof fetch/retry/onPayload 不变量无效");
  if (input.completion_method !== "models.complete_non_simple" || input.redirect_policy_status !== "pending_not_bound_by_pi_sdk_fetch_boundary") issues.push("proof Pi method/redirect 边界无效");
  if (!Number.isSafeInteger(input.requested_max_tokens) || Number(input.requested_max_tokens) <= 0 || input.captured_max_completion_tokens !== input.requested_max_tokens) issues.push("proof token 上限无效");
  if (!compatibleNode(input.runtime_node_version) || input.required_node_engine !== FORMAL_ORACLE_REQUIRED_NODE_ENGINE || input.node_engine_status !== "compatible_runtime_proved") issues.push("proof Node runtime 无效");
  else if (input.local_dependency_manifest_sha256 !== hashFormalOraclePiObservedLocalDependencyManifestV1(input.runtime_node_version as string)) issues.push("proof local dependency manifest 根未由冻结观察值重算");
  if (input.runtime_toolchain_status !== "runtime_engine_and_local_hashes_proved_external_immutable_capsule_pending"
    || input.provider_endpoint_account_status !== "pending_external_runtime_binding"
    || input.provider_response_capture_status !== "local_memory_fake_sse_proved_external_provider_pending"
    || input.external_toolchain_authenticity_status !== "pending_external_immutable_capsule"
    || input.proof_status !== "local_fake_fetch_exact_body_proved_non_executable" || input.api_execution_allowed !== false) issues.push("proof 非执行/pending 边界无效");
  if (!isRecord(input.local_fake_response_stream_proof)) issues.push("proof 缺少 SSE proof");
  else {
    const sse = input.local_fake_response_stream_proof as unknown as FormalOraclePiResponseStreamProofV1;
    const sseReport = validateFormalOraclePiResponseStreamProofV1(sse);
    if (sse.request_envelope_sha256 !== input.request_envelope_sha256 || sse.provider_body_sha256 !== input.provider_body_sha256
      || sse.expected_max_output_tokens !== input.requested_max_tokens || sse.finish_reason !== "stop" || sse.done_count !== 1
      || sse.api_execution_allowed !== false || !sseReport.valid) issues.push("proof 内嵌 SSE proof 未闭合");
  }
  try {
    if (sha(input.proof_sha256) && hashFormalOraclePiFetchBoundaryProofV1(input as unknown as FormalOraclePiFetchBoundaryProofV1) !== input.proof_sha256) issues.push("proof 内容寻址哈希不匹配");
  } catch { issues.push("proof 无法规范序列化"); }
  return { valid: issues.length === 0, issues };
}
