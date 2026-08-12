import { sha256Hex } from "./sha256.js";

export type OracleGateRunArm = "transcript_only" | "static_final_board" | "uniform_frame" | "oracle_delta";
export type OracleGateRequestState =
  | "PENDING"
  | "RETRY_READY"
  | "DISPATCH_INTENT_COMMITTED"
  | "RECEIPT_COMMITTED"
  | "SCHEMA_VALIDATED_COMMITTED"
  | "BLOCKED_AMBIGUOUS"
  | "FAILED_CLOSED";
export type OracleGateResumeAction =
  | "dispatch_new_attempt"
  | "block_ambiguous"
  | "verify_receipt"
  | "skip_schema_validated"
  | "block_failed";
export type OracleGateRunState =
  | "SEALED_READY"
  | "RUNNING"
  | "INTERRUPTED_SAFE"
  | "BLOCKED_AMBIGUOUS"
  | "FAILED_CLOSED"
  | "EXECUTION_COMPLETE";

export interface OracleGateRunVisualV1 {
  label: "visual-1";
  object_uri: string;
  sha256: string;
  mime_type: "image/jpeg";
  width: 1920;
  height: 360;
  byte_length: number;
}

export interface FormalRunContractV1 {
  schema_version: "oracle-gate-formal-run-contract-v1";
  run_sha256: string;
  canonicalization: "oracle-gate-run-canonical-json-v1";
  signed_gold_dataset_sha256: string;
  formal_input_manifest_sha256: string;
  formal_spec_sha256: string;
  schedule_sha256: string;
  execution_plan_sha256: string;
  ledger_registry_sha256: string;
  media_attestation_sha256: string;
  speech_attestation_sha256: string;
  code_revision: string;
  build_artifact_sha256: string;
  blinding_secret_commitment_sha256: string;
  blinding_scheme: "hmac-sha256-run-request-v1";
  rating_plan_sha256: string;
  statistics_plan_sha256: string;
  run_store_uri: string;
  request_count: number;
  directory_mode: "0700";
  file_mode: "0600";
  lock_scheme: "exclusive-create-owner-nonce-v1";
  checkpoint_scheme: "immutable-hash-chain-head-v1";
  remote_idempotency_mode: "provider_enforced" | "local_only_fail_closed";
  api_execution_allowed: false;
}

export interface RequestIntentV1 {
  schema_version: "oracle-gate-request-intent-v2";
  intent_sha256: string;
  run_sha256: string;
  request_id: string;
  idempotency_key: string;
  schedule_index: number;
  attempt_ordinal: number;
  prepared_at: string;
  case_id: string;
  arm: OracleGateRunArm;
  seed: number;
  model: string;
  request_envelope_sha256: string;
  request_envelope_object_uri: string;
  provider_body_sha256: string;
  provider_body_object_uri: string;
  provider_body_profile: "openai-chat-completions-direct-serialization-v1";
  provider_body_dispatch_status: "not_dispatchable_transport_mismatch";
  prepared_adapter_version: "formal-oracle-prepared-provider-adapter-v1";
  provider_token_field: "max_completion_tokens";
  system_prompt_sha256: string;
  user_prompt_sha256: string;
  output_schema_sha256: string;
  visuals: OracleGateRunVisualV1[];
  transport: "pi";
  temperature: 0;
  max_input_tokens: number;
  max_output_tokens: number;
  timeout_ms: number;
  max_attempts: number;
  cache_retention: "none";
  tools_policy: "none";
}

export interface OracleGateRunTokenUsageV1 {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export type OracleGateAttemptOutcome = "result_received" | "not_sent" | "no_result_confirmed" | "unknown";

export interface RequestAttemptAuditV1 {
  schema_version: "oracle-gate-request-attempt-audit-v1";
  attempt_sha256: string;
  run_sha256: string;
  request_id: string;
  idempotency_key: string;
  intent_sha256: string;
  attempt_ordinal: number;
  started_at: string;
  finished_at: string;
  latency_ms: number;
  provider_id: string;
  provider_request_id: string | null;
  request_sha256: string;
  request_object_uri: string;
  /** Immutable provider-original JSON UTF-8 bytes. */
  response_object_uri: string | null;
  response_bytes_sha256: string | null;
  /** Immutable canonical JSON object deterministically parsed from response_object_uri. */
  parsed_response_object_uri: string | null;
  parsed_response_sha256: string | null;
  submitted_visuals: OracleGateRunVisualV1[];
  model: string;
  transport: "pi";
  temperature: 0;
  max_input_tokens: number;
  max_output_tokens: number;
  timeout_ms: number;
  seed: number;
  cache_retention: "none";
  tools_policy: "none";
  outcome: OracleGateAttemptOutcome;
  provider_response_received: boolean;
  stop_reason: "stop" | "length" | "error" | null;
  error_code: string | null;
  error_message: string | null;
  usage: OracleGateRunTokenUsageV1 | null;
  pricing_table_sha256: string | null;
  cost_microunits: number | null;
  automatic_retry_allowed: boolean;
}

/** Structural/transport commitment only; semantic acceptance is deliberately pending. */
export interface CommittedRequestV1 {
  schema_version: "oracle-gate-committed-request-v1";
  committed_request_sha256: string;
  run_sha256: string;
  request_id: string;
  idempotency_key: string;
  intent_sha256: string;
  attempt_sha256: string;
  attempt_ordinal: number;
  response_object_uri: string;
  response_sha256: string;
  validator_version: string;
  transport_and_schema_verified_at: string;
  transport_and_schema_verified: true;
  semantic_review_status: "pending_external_blind_review";
  provider_stop_confirmed: true;
}

export interface OracleGateCheckpointEntryV1 {
  request_id: string;
  idempotency_key: string;
  state: OracleGateRequestState;
  resume_action: OracleGateResumeAction;
  max_attempts: number;
  attempts_used: number;
  active_intent_sha256: string | null;
  latest_attempt_audit_sha256: string | null;
  committed_request_sha256: string | null;
}

export interface OracleGateCheckpointCountsV1 {
  pending: number;
  retry_ready: number;
  dispatch_intent_committed: number;
  receipt_committed: number;
  schema_validated_committed: number;
  blocked_ambiguous: number;
  failed_closed: number;
}

export interface RunCheckpointV1 {
  schema_version: "oracle-gate-run-checkpoint-v1";
  checkpoint_sha256: string;
  run_sha256: string;
  schedule_sha256: string;
  generation: number;
  previous_checkpoint_sha256: string | null;
  created_at: string;
  run_state: OracleGateRunState;
  terminal_reason_sha256: string | null;
  request_count: number;
  counts: OracleGateCheckpointCountsV1;
  entries: OracleGateCheckpointEntryV1[];
}

export interface OracleGatePrivateAnswerKeyEntryV1 {
  blind_id: string;
  request_id: string;
  idempotency_key: string;
  case_id: string;
  arm: OracleGateRunArm;
  seed: number;
  teacher_id: string;
  source_video_id: string;
  window_id: string;
  response_sha256: string;
}

export interface PrivateAnswerKeyV1 {
  schema_version: "oracle-gate-private-answer-key-v1";
  answer_key_sha256: string;
  run_sha256: string;
  public_package_sha256: string;
  blind_secret_commitment_sha256: string;
  blinding_scheme: "hmac-sha256-run-request-v1";
  created_at: string;
  entries: OracleGatePrivateAnswerKeyEntryV1[];
}

export interface OracleGatePublicBlindItemV1 {
  blind_id: string;
  response: Record<string, unknown>;
  response_sha256: string;
}

export interface PublicBlindPackageV1 {
  schema_version: "oracle-gate-public-blind-package-v1";
  package_sha256: string;
  run_commitment_sha256: string;
  rubric_version: string;
  rubric_sha256: string;
  blinding_statement: "metadata_blinded_no_pairing_exposed";
  item_count: number;
  items: OracleGatePublicBlindItemV1[];
}

export interface OracleGateRunValidationIssue {
  path: string;
  message: string;
}

export interface OracleGateRunValidationReport {
  valid: boolean;
  issues: OracleGateRunValidationIssue[];
}

export const FORMAL_RUN_CONTRACT_DOMAIN = "skyclass/formal-oracle/run-contract/v1\0";
export const REQUEST_INTENT_DOMAIN = "skyclass/formal-oracle/request-intent/v1\0";
export const REQUEST_ATTEMPT_AUDIT_DOMAIN = "skyclass/formal-oracle/request-attempt-audit/v1\0";
export const COMMITTED_REQUEST_DOMAIN = "skyclass/formal-oracle/committed-request/v1\0";
export const RUN_CHECKPOINT_DOMAIN = "skyclass/formal-oracle/run-checkpoint/v1\0";
export const PRIVATE_ANSWER_KEY_DOMAIN = "skyclass/formal-oracle/private-answer-key/v1\0";
export const PUBLIC_BLIND_PACKAGE_DOMAIN = "skyclass/formal-oracle/public-blind-package/v1\0";
export const PUBLIC_BLIND_RESPONSE_DOMAIN = "skyclass/formal-oracle/public-blind-response/v1\0";

const UINT32_MAX = 0xffff_ffff;
const ARMS = new Set<OracleGateRunArm>(["transcript_only", "static_final_board", "uniform_frame", "oracle_delta"]);
const PUBLIC_FORBIDDEN_KEYS = new Set([
  "arm", "caseid", "conditionsha256", "idempotencykey", "intentsha256", "model", "pairedcaseid",
  "providerrequestid", "requestid", "runsha256", "seed", "seedindex", "sourcevideoid", "teacherid", "windowid",
]);

const PRIVATE_VALUE_PATTERN = /(?:transcript_only|static_final_board|uniform_frame|oracle_delta|(?:arm|case[_ -]?id|seed(?:[_ -]?index)?|teacher[_ -]?id|source[_ -]?video[_ -]?id|window[_ -]?id|request[_ -]?id|idempotency[_ -]?key)\s*[:=])/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
    && Object.keys(value).length === value.length
    && Object.keys(value).every((key, index) => key === String(index));
}

function stableJson(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error("非安全有限数值");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (!isDenseArray(value)) throw new Error("稀疏数组或额外数组属性");
    if (seen.has(value)) throw new Error("循环引用");
    seen.add(value);
    try { return `[${value.map((item) => stableJson(item, seen)).join(",")}]`; } finally { seen.delete(value); }
  }
  if (isRecord(value)) {
    if (seen.has(value)) throw new Error("循环引用");
    seen.add(value);
    try {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key], seen)}`).join(",")}}`;
    } finally { seen.delete(value); }
  }
  throw new Error("非 JSON 值");
}

function domainHash(domain: string, payload: string): string {
  return sha256Hex(`${domain}${payload}`);
}

function withoutField(input: object, field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([key]) => key !== field));
}

export function canonicalFormalRunContractPayload(input: FormalRunContractV1): string {
  return stableJson(withoutField(input, "run_sha256"));
}

export function hashFormalRunContract(input: FormalRunContractV1): string {
  return domainHash(FORMAL_RUN_CONTRACT_DOMAIN, canonicalFormalRunContractPayload(input));
}

export function canonicalRequestIntentPayload(input: RequestIntentV1): string {
  return stableJson(withoutField(input, "intent_sha256"));
}

export function hashRequestIntent(input: RequestIntentV1): string {
  return domainHash(REQUEST_INTENT_DOMAIN, canonicalRequestIntentPayload(input));
}

export function canonicalRequestAttemptAuditPayload(input: RequestAttemptAuditV1): string {
  return stableJson(withoutField(input, "attempt_sha256"));
}

export function hashRequestAttemptAudit(input: RequestAttemptAuditV1): string {
  return domainHash(REQUEST_ATTEMPT_AUDIT_DOMAIN, canonicalRequestAttemptAuditPayload(input));
}

export function canonicalCommittedRequestPayload(input: CommittedRequestV1): string {
  return stableJson(withoutField(input, "committed_request_sha256"));
}

export function hashCommittedRequest(input: CommittedRequestV1): string {
  return domainHash(COMMITTED_REQUEST_DOMAIN, canonicalCommittedRequestPayload(input));
}

export function canonicalRunCheckpointPayload(input: RunCheckpointV1): string {
  return stableJson(withoutField(input, "checkpoint_sha256"));
}

export function hashRunCheckpoint(input: RunCheckpointV1): string {
  return domainHash(RUN_CHECKPOINT_DOMAIN, canonicalRunCheckpointPayload(input));
}

export function canonicalPrivateAnswerKeyPayload(input: PrivateAnswerKeyV1): string {
  return stableJson(withoutField(input, "answer_key_sha256"));
}

export function hashPrivateAnswerKey(input: PrivateAnswerKeyV1): string {
  return domainHash(PRIVATE_ANSWER_KEY_DOMAIN, canonicalPrivateAnswerKeyPayload(input));
}

export function canonicalPublicBlindPackagePayload(input: PublicBlindPackageV1): string {
  return stableJson(withoutField(input, "package_sha256"));
}

export function hashPublicBlindPackage(input: PublicBlindPackageV1): string {
  return domainHash(PUBLIC_BLIND_PACKAGE_DOMAIN, canonicalPublicBlindPackagePayload(input));
}

export function canonicalPublicBlindResponsePayload(input: Record<string, unknown>): string {
  return stableJson(input);
}

export function hashPublicBlindResponse(input: Record<string, unknown>): string {
  return domainHash(PUBLIC_BLIND_RESPONSE_DOMAIN, canonicalPublicBlindResponsePayload(input));
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function isSha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function isId(value: unknown): value is string {
  return isNonEmpty(value) && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value);
}

function isBlindId(value: unknown): value is string {
  return typeof value === "string" && /^B-[a-f0-9]{64}$/.test(value);
}

function isCanonicalTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isUint32(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= UINT32_MAX;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1;
}

function isSafeUri(value: unknown): value is string {
  if (!isNonEmpty(value) || value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
  let decoded = value;
  let stable = false;
  try {
    for (let index = 0; index < 16; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) { stable = true; break; }
      decoded = next;
    }
  } catch { return false; }
  return stable && Boolean(decoded) && !decoded.includes("\\") && !decoded.includes("\0")
    && !decoded.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(decoded)
    && decoded.split("/").every((part) => Boolean(part) && part !== "." && part !== "..");
}

function report(issues: OracleGateRunValidationIssue[]): OracleGateRunValidationReport {
  return { valid: issues.length === 0, issues };
}

function addHashIssue<T>(
  issues: OracleGateRunValidationIssue[],
  input: T,
  actual: unknown,
  path: string,
  hash: (value: T) => string,
): void {
  if (!isSha(actual)) return;
  try { if (actual !== hash(input)) issues.push({ path, message: "内容寻址哈希不匹配" }); }
  catch { issues.push({ path, message: "内容不能规范序列化" }); }
}

function validateVisual(raw: unknown, path: string, issues: OracleGateRunValidationIssue[]): void {
  const issue = (suffix: string, message: string): void => { issues.push({ path: suffix ? `${path}.${suffix}` : path, message }); };
  if (!isRecord(raw)) { issue("", "必须是对象"); return; }
  if (!exactKeys(raw, ["label", "object_uri", "sha256", "mime_type", "width", "height", "byte_length"])) issue("", "字段集合无效");
  if (raw.label !== "visual-1") issue("label", "必须是 visual-1");
  if (!isSafeUri(raw.object_uri)) issue("object_uri", "必须是受控相对路径");
  if (!isSha(raw.sha256)) issue("sha256", "必须是 SHA-256");
  if (raw.mime_type !== "image/jpeg" || raw.width !== 1920 || raw.height !== 360) issue("canvas", "必须是 1920x360 image/jpeg");
  if (!isPositiveSafeInteger(raw.byte_length)) issue("byte_length", "必须是正安全整数");
}

function validateJsonValue(
  value: unknown,
  path: string,
  issues: OracleGateRunValidationIssue[],
  seen = new Set<object>(),
): void {
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) issues.push({ path, message: "数值必须有限且在安全范围内" });
    return;
  }
  if (Array.isArray(value)) {
    if (!isDenseArray(value)) { issues.push({ path, message: "不得包含稀疏数组或额外数组属性" }); return; }
    if (seen.has(value)) { issues.push({ path, message: "不得包含循环引用" }); return; }
    seen.add(value);
    value.forEach((item, index) => validateJsonValue(item, `${path}[${index}]`, issues, seen));
    seen.delete(value);
    return;
  }
  if (isRecord(value)) {
    if (seen.has(value)) { issues.push({ path, message: "不得包含循环引用" }); return; }
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (PUBLIC_FORBIDDEN_KEYS.has(normalizedKey)) issues.push({ path: `${path}.${key}`, message: "公开响应不得包含私有实验元数据键" });
      validateJsonValue(child, `${path}.${key}`, issues, seen);
    }
    seen.delete(value);
    return;
  }
  issues.push({ path, message: "必须是 JSON 值" });
}

function validatePublicStringLeakage(value: unknown, path: string, issues: OracleGateRunValidationIssue[]): void {
  if (typeof value === "string" && PRIVATE_VALUE_PATTERN.test(value)) {
    issues.push({ path, message: "公开响应文本疑似泄漏私有实验元数据" });
    return;
  }
  if (Array.isArray(value)) value.forEach((item, index) => validatePublicStringLeakage(item, `${path}[${index}]`, issues));
  else if (isRecord(value)) for (const [key, child] of Object.entries(value)) validatePublicStringLeakage(child, `${path}.${key}`, issues);
}

export function validateFormalRunContract(input: unknown): OracleGateRunValidationReport {
  const issues: OracleGateRunValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return report([{ path: "$", message: "必须是对象" }]);
  const keys = ["schema_version", "run_sha256", "canonicalization", "signed_gold_dataset_sha256", "formal_input_manifest_sha256", "formal_spec_sha256", "schedule_sha256", "execution_plan_sha256", "ledger_registry_sha256", "media_attestation_sha256", "speech_attestation_sha256", "code_revision", "build_artifact_sha256", "blinding_secret_commitment_sha256", "blinding_scheme", "rating_plan_sha256", "statistics_plan_sha256", "run_store_uri", "request_count", "directory_mode", "file_mode", "lock_scheme", "checkpoint_scheme", "remote_idempotency_mode", "api_execution_allowed"];
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== "oracle-gate-formal-run-contract-v1" || input.canonicalization !== "oracle-gate-run-canonical-json-v1") issue("schema_version", "版本或规范序列化算法无效");
  for (const field of ["run_sha256", "signed_gold_dataset_sha256", "formal_input_manifest_sha256", "formal_spec_sha256", "schedule_sha256", "execution_plan_sha256", "ledger_registry_sha256", "media_attestation_sha256", "speech_attestation_sha256", "build_artifact_sha256", "blinding_secret_commitment_sha256", "rating_plan_sha256", "statistics_plan_sha256"] as const) if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  if (!/^[a-f0-9]{40}$/.test(String(input.code_revision))) issue("code_revision", "必须是完整小写 Git commit");
  if (input.blinding_scheme !== "hmac-sha256-run-request-v1") issue("blinding_scheme", "值无效");
  if (!isSafeUri(input.run_store_uri)) issue("run_store_uri", "必须是受控相对路径");
  if (!isPositiveSafeInteger(input.request_count)) issue("request_count", "必须是正安全整数");
  if (input.directory_mode !== "0700" || input.file_mode !== "0600") issue("permissions", "私有目录/文件必须固定为 0700/0600");
  if (input.lock_scheme !== "exclusive-create-owner-nonce-v1" || input.checkpoint_scheme !== "immutable-hash-chain-head-v1") issue("store_protocol", "锁或 checkpoint 协议无效");
  if (input.remote_idempotency_mode !== "provider_enforced" && input.remote_idempotency_mode !== "local_only_fail_closed") issue("remote_idempotency_mode", "值无效");
  if (input.api_execution_allowed !== false) issue("api_execution_allowed", "run contract 不能授权 API 执行");
  addHashIssue(issues, input as unknown as FormalRunContractV1, input.run_sha256, "run_sha256", hashFormalRunContract);
  return report(issues);
}

export function validateRequestIntent(input: unknown): OracleGateRunValidationReport {
  const issues: OracleGateRunValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return report([{ path: "$", message: "必须是对象" }]);
  const keys = ["schema_version", "intent_sha256", "run_sha256", "request_id", "idempotency_key", "schedule_index", "attempt_ordinal", "prepared_at", "case_id", "arm", "seed", "model", "request_envelope_sha256", "request_envelope_object_uri", "provider_body_sha256", "provider_body_object_uri", "provider_body_profile", "provider_body_dispatch_status", "prepared_adapter_version", "provider_token_field", "system_prompt_sha256", "user_prompt_sha256", "output_schema_sha256", "visuals", "transport", "temperature", "max_input_tokens", "max_output_tokens", "timeout_ms", "max_attempts", "cache_retention", "tools_policy"];
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== "oracle-gate-request-intent-v2") issue("schema_version", "版本无效");
  for (const field of ["intent_sha256", "run_sha256", "idempotency_key", "request_envelope_sha256", "provider_body_sha256", "system_prompt_sha256", "user_prompt_sha256", "output_schema_sha256"] as const) if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  if (!isId(input.request_id) || !isId(input.case_id) || !isNonEmpty(input.model)) issue("identity", "request_id/case_id/model 格式无效");
  if (!isNonNegativeSafeInteger(input.schedule_index)) issue("schedule_index", "必须是非负安全整数");
  if (!isPositiveSafeInteger(input.attempt_ordinal)) issue("attempt_ordinal", "必须是正安全整数");
  if (!isCanonicalTime(input.prepared_at)) issue("prepared_at", "必须是 canonical ISO 时间");
  if (!ARMS.has(input.arm as OracleGateRunArm)) issue("arm", "值无效");
  if (!isUint32(input.seed)) issue("seed", "必须是 0..2^32-1 安全整数");
  if (!isSafeUri(input.request_envelope_object_uri) || !isSafeUri(input.provider_body_object_uri)) issue("request_objects", "envelope/body 必须是受控相对路径");
  if (input.provider_body_profile !== "openai-chat-completions-direct-serialization-v1"
    || input.provider_body_dispatch_status !== "not_dispatchable_transport_mismatch"
    || input.prepared_adapter_version !== "formal-oracle-prepared-provider-adapter-v1"
    || input.provider_token_field !== "max_completion_tokens") issue("prepared_profile", "必须冻结 direct provider profile/adapter/token field");
  if (!isDenseArray(input.visuals)) issue("visuals", "必须是稠密数组且不得有额外属性");
  else {
    input.visuals.forEach((visual, index) => validateVisual(visual, `visuals[${index}]`, issues));
    const expected = input.arm === "transcript_only" ? 0 : 1;
    if (input.visuals.length !== expected) issue("visuals", `该 arm 必须恰好包含 ${expected} 张 canonical canvas`);
  }
  if (input.transport !== "pi" || input.temperature !== 0 || input.cache_retention !== "none" || input.tools_policy !== "none") issue("protocol", "必须冻结为 Pi、temperature=0、无缓存、无工具");
  for (const field of ["max_input_tokens", "max_output_tokens", "timeout_ms", "max_attempts"] as const) if (!isPositiveSafeInteger(input[field])) issue(field, "必须是正安全整数");
  if (isPositiveSafeInteger(input.attempt_ordinal) && isPositiveSafeInteger(input.max_attempts) && input.attempt_ordinal > input.max_attempts) issue("attempt_ordinal", "不得超过 max_attempts");
  addHashIssue(issues, input as unknown as RequestIntentV1, input.intent_sha256, "intent_sha256", hashRequestIntent);
  return report(issues);
}

function validateUsage(raw: unknown, path: string, issues: OracleGateRunValidationIssue[]): void {
  if (!isRecord(raw)) { issues.push({ path, message: "必须是对象" }); return; }
  if (!exactKeys(raw, ["input_tokens", "output_tokens", "total_tokens", "cache_read_tokens", "cache_write_tokens"])) issues.push({ path, message: "字段集合无效" });
  for (const field of ["input_tokens", "output_tokens", "total_tokens", "cache_read_tokens", "cache_write_tokens"] as const) if (!isNonNegativeSafeInteger(raw[field])) issues.push({ path: `${path}.${field}`, message: "必须是非负安全整数" });
  if (isNonNegativeSafeInteger(raw.total_tokens) && isNonNegativeSafeInteger(raw.input_tokens) && isNonNegativeSafeInteger(raw.output_tokens)
    && raw.total_tokens !== raw.input_tokens + raw.output_tokens) issues.push({ path: `${path}.total_tokens`, message: "必须等于 input + output" });
}

export function validateRequestAttemptAudit(input: unknown): OracleGateRunValidationReport {
  const issues: OracleGateRunValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return report([{ path: "$", message: "必须是对象" }]);
  const keys = ["schema_version", "attempt_sha256", "run_sha256", "request_id", "idempotency_key", "intent_sha256", "attempt_ordinal", "started_at", "finished_at", "latency_ms", "provider_id", "provider_request_id", "request_sha256", "request_object_uri", "response_object_uri", "response_bytes_sha256", "parsed_response_object_uri", "parsed_response_sha256", "submitted_visuals", "model", "transport", "temperature", "max_input_tokens", "max_output_tokens", "timeout_ms", "seed", "cache_retention", "tools_policy", "outcome", "provider_response_received", "stop_reason", "error_code", "error_message", "usage", "pricing_table_sha256", "cost_microunits", "automatic_retry_allowed"];
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== "oracle-gate-request-attempt-audit-v1") issue("schema_version", "版本无效");
  for (const field of ["attempt_sha256", "run_sha256", "idempotency_key", "intent_sha256", "request_sha256"] as const) if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  if (!isId(input.request_id) || !isNonEmpty(input.provider_id) || !isNonEmpty(input.model)) issue("identity", "request/provider/model 格式无效");
  if (!isPositiveSafeInteger(input.attempt_ordinal)) issue("attempt_ordinal", "必须是正安全整数");
  if (!isCanonicalTime(input.started_at) || !isCanonicalTime(input.finished_at) || (isCanonicalTime(input.started_at) && isCanonicalTime(input.finished_at) && Date.parse(input.finished_at) < Date.parse(input.started_at))) issue("time", "时间必须 canonical 且 finished_at 不早于 started_at");
  if (!isNonNegativeSafeInteger(input.latency_ms)) issue("latency_ms", "必须是非负安全整数");
  if (input.provider_request_id !== null && !isNonEmpty(input.provider_request_id)) issue("provider_request_id", "必须为 null 或非空字符串");
  if (!isSafeUri(input.request_object_uri)) issue("request_object_uri", "必须是受控相对路径");
  if (input.response_object_uri !== null && !isSafeUri(input.response_object_uri)) issue("response_object_uri", "必须为 null 或受控相对路径");
  if (input.parsed_response_object_uri !== null && !isSafeUri(input.parsed_response_object_uri)) issue("parsed_response_object_uri", "必须为 null 或受控相对路径");
  for (const field of ["response_bytes_sha256", "parsed_response_sha256", "pricing_table_sha256"] as const) if (input[field] !== null && !isSha(input[field])) issue(field, "必须为 null 或 SHA-256");
  if (!isDenseArray(input.submitted_visuals)) issue("submitted_visuals", "必须是稠密数组且不得有额外属性");
  else input.submitted_visuals.forEach((visual, index) => validateVisual(visual, `submitted_visuals[${index}]`, issues));
  if (input.transport !== "pi" || input.temperature !== 0 || input.cache_retention !== "none" || input.tools_policy !== "none") issue("protocol", "必须冻结为 Pi、temperature=0、无缓存、无工具");
  for (const field of ["max_input_tokens", "max_output_tokens", "timeout_ms"] as const) if (!isPositiveSafeInteger(input[field])) issue(field, "必须是正安全整数");
  if (!isUint32(input.seed)) issue("seed", "必须是 0..2^32-1 安全整数");
  if (!["result_received", "not_sent", "no_result_confirmed", "unknown"].includes(String(input.outcome))) issue("outcome", "值无效");
  if (typeof input.provider_response_received !== "boolean") issue("provider_response_received", "必须是 boolean");
  if (!["stop", "length", "error", null].includes(input.stop_reason as never)) issue("stop_reason", "值无效");
  if (input.error_code !== null && !isNonEmpty(input.error_code)) issue("error_code", "必须为 null 或非空字符串");
  if (input.error_message !== null && !isNonEmpty(input.error_message)) issue("error_message", "必须为 null 或非空字符串");
  if (input.usage !== null) validateUsage(input.usage, "usage", issues);
  if (input.cost_microunits !== null && !isNonNegativeSafeInteger(input.cost_microunits)) issue("cost_microunits", "必须为 null 或非负安全整数");
  if ((input.cost_microunits === null) !== (input.pricing_table_sha256 === null)) issue("cost", "cost 与 pricing table 必须同时存在或同时为空");
  if (typeof input.automatic_retry_allowed !== "boolean") issue("automatic_retry_allowed", "必须是 boolean");

  if (input.outcome === "result_received") {
    if (input.provider_response_received !== true || !isSafeUri(input.response_object_uri) || !isSha(input.response_bytes_sha256)
      || !isSafeUri(input.parsed_response_object_uri) || !isSha(input.parsed_response_sha256) || input.usage === null) issue("outcome", "result_received 必须具有完整 raw/parsed 响应、hash 与 usage");
    if (!isNonEmpty(input.provider_request_id) || !["stop", "length", "error"].includes(String(input.stop_reason))) issue("outcome", "result_received 必须具有 provider request ID 与明确 stop reason");
    if (!isSha(input.pricing_table_sha256) || !isNonNegativeSafeInteger(input.cost_microunits)) issue("cost", "result_received 必须具有冻结 pricing table 与 cost");
    if (isRecord(input.usage) && (input.usage.cache_read_tokens !== 0 || input.usage.cache_write_tokens !== 0)) issue("usage", "cache_retention=none 时 cache token 必须为 0");
    if (input.automatic_retry_allowed !== false || input.error_code !== null || input.error_message !== null) issue("automatic_retry_allowed", "已收到结果不得自动重试或携带 error");
  } else if (input.outcome === "not_sent" || input.outcome === "no_result_confirmed") {
    if (input.provider_response_received !== false || input.response_object_uri !== null || input.response_bytes_sha256 !== null
      || input.parsed_response_object_uri !== null || input.parsed_response_sha256 !== null || input.usage !== null || input.stop_reason !== null || input.pricing_table_sha256 !== null || input.cost_microunits !== null) issue("outcome", "确认无结果时不得声称存在响应、stop、usage 或 cost");
    if (typeof input.automatic_retry_allowed !== "boolean" || !isNonEmpty(input.error_code) || !isNonEmpty(input.error_message)) issue("automatic_retry_allowed", "确认无结果的失败必须记录错误；是否重试由 intent 预算决定");
    if (input.outcome === "not_sent" && input.provider_request_id !== null) issue("provider_request_id", "not_sent 不得声称 provider request ID");
  } else if (input.outcome === "unknown") {
    if (input.provider_response_received !== false || input.response_object_uri !== null || input.response_bytes_sha256 !== null
      || input.parsed_response_object_uri !== null || input.parsed_response_sha256 !== null || input.usage !== null || input.stop_reason !== null || input.pricing_table_sha256 !== null || input.cost_microunits !== null) issue("outcome", "unknown 不得声称存在可验证响应、stop、usage 或 cost");
    if (input.automatic_retry_allowed !== false || !isNonEmpty(input.error_code) || !isNonEmpty(input.error_message)) issue("automatic_retry_allowed", "ambiguous/unknown 必须禁止自动重试并记录错误");
  }
  addHashIssue(issues, input as unknown as RequestAttemptAuditV1, input.attempt_sha256, "attempt_sha256", hashRequestAttemptAudit);
  return report(issues);
}

export function validateCommittedRequest(input: unknown): OracleGateRunValidationReport {
  const issues: OracleGateRunValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return report([{ path: "$", message: "必须是对象" }]);
  const keys = ["schema_version", "committed_request_sha256", "run_sha256", "request_id", "idempotency_key", "intent_sha256", "attempt_sha256", "attempt_ordinal", "response_object_uri", "response_sha256", "validator_version", "transport_and_schema_verified_at", "transport_and_schema_verified", "semantic_review_status", "provider_stop_confirmed"];
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== "oracle-gate-committed-request-v1") issue("schema_version", "版本无效");
  for (const field of ["committed_request_sha256", "run_sha256", "idempotency_key", "intent_sha256", "attempt_sha256", "response_sha256"] as const) if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  if (!isId(input.request_id) || !isNonEmpty(input.validator_version)) issue("identity", "request_id/validator_version 格式无效");
  if (!isPositiveSafeInteger(input.attempt_ordinal)) issue("attempt_ordinal", "必须是正安全整数");
  if (!isSafeUri(input.response_object_uri)) issue("response_object_uri", "必须是受控相对路径");
  if (!isCanonicalTime(input.transport_and_schema_verified_at)) issue("transport_and_schema_verified_at", "必须是 canonical ISO 时间");
  if (input.transport_and_schema_verified !== true || input.provider_stop_confirmed !== true) issue("transport_and_schema_verified", "committed request 必须完成 transport/schema 验证且 provider stop 已确认");
  if (input.semantic_review_status !== "pending_external_blind_review") issue("semantic_review_status", "语义结论必须留给 external blind review");
  addHashIssue(issues, input as unknown as CommittedRequestV1, input.committed_request_sha256, "committed_request_sha256", hashCommittedRequest);
  return report(issues);
}

const RESUME_ACTION_BY_STATE: Record<OracleGateRequestState, OracleGateResumeAction> = {
  PENDING: "dispatch_new_attempt",
  RETRY_READY: "dispatch_new_attempt",
  DISPATCH_INTENT_COMMITTED: "block_ambiguous",
  RECEIPT_COMMITTED: "verify_receipt",
  SCHEMA_VALIDATED_COMMITTED: "skip_schema_validated",
  BLOCKED_AMBIGUOUS: "block_ambiguous",
  FAILED_CLOSED: "block_failed",
};

function validateCheckpointEntry(raw: unknown, path: string, issues: OracleGateRunValidationIssue[]): void {
  const issue = (suffix: string, message: string): void => { issues.push({ path: suffix ? `${path}.${suffix}` : path, message }); };
  if (!isRecord(raw)) { issue("", "必须是对象"); return; }
  if (!exactKeys(raw, ["request_id", "idempotency_key", "state", "resume_action", "max_attempts", "attempts_used", "active_intent_sha256", "latest_attempt_audit_sha256", "committed_request_sha256"])) issue("", "字段集合无效");
  if (!isId(raw.request_id) || !isSha(raw.idempotency_key)) issue("identity", "request_id/idempotency_key 格式无效");
  if (!Object.hasOwn(RESUME_ACTION_BY_STATE, String(raw.state))) { issue("state", "值无效"); return; }
  const state = raw.state as OracleGateRequestState;
  if (raw.resume_action !== RESUME_ACTION_BY_STATE[state]) issue("resume_action", "必须与 request state 的 fail-closed 动作一致");
  if (!isPositiveSafeInteger(raw.max_attempts)) issue("max_attempts", "必须是正安全整数");
  if (!isNonNegativeSafeInteger(raw.attempts_used)) issue("attempts_used", "必须是非负安全整数");
  if (isPositiveSafeInteger(raw.max_attempts) && isNonNegativeSafeInteger(raw.attempts_used) && raw.attempts_used > raw.max_attempts) issue("attempts_used", "不得超过 max_attempts");
  for (const field of ["active_intent_sha256", "latest_attempt_audit_sha256", "committed_request_sha256"] as const) if (raw[field] !== null && !isSha(raw[field])) issue(field, "必须为 null 或 SHA-256");
  if (state === "PENDING" && (raw.attempts_used !== 0 || raw.active_intent_sha256 !== null || raw.latest_attempt_audit_sha256 !== null || raw.committed_request_sha256 !== null)) issue("state", "初始 PENDING 必须是无历史干净状态");
  if (state === "RETRY_READY" && (!isPositiveSafeInteger(raw.attempts_used) || !isPositiveSafeInteger(raw.max_attempts) || raw.attempts_used >= raw.max_attempts || !isSha(raw.active_intent_sha256) || !isSha(raw.latest_attempt_audit_sha256) || raw.committed_request_sha256 !== null)) issue("state", "RETRY_READY 必须保留已确认无结果的 intent/audit 且仍有 attempt 预算");
  if (state === "DISPATCH_INTENT_COMMITTED" && (!isSha(raw.active_intent_sha256) || raw.committed_request_sha256 !== null)) issue("state", "dispatch intent 状态必须且只能具有 active intent");
  if (state === "RECEIPT_COMMITTED" && (!isSha(raw.active_intent_sha256) || !isSha(raw.latest_attempt_audit_sha256) || raw.committed_request_sha256 !== null || !isPositiveSafeInteger(raw.attempts_used))) issue("state", "receipt 状态必须具有 intent、attempt audit 和正 attempt 计数");
  if (state === "SCHEMA_VALIDATED_COMMITTED" && (!isSha(raw.active_intent_sha256) || !isSha(raw.latest_attempt_audit_sha256) || !isSha(raw.committed_request_sha256) || !isPositiveSafeInteger(raw.attempts_used))) issue("state", "schema-validated 状态必须具有完整引用");
  if (state === "BLOCKED_AMBIGUOUS" && (!isSha(raw.active_intent_sha256) || !isSha(raw.latest_attempt_audit_sha256)
    || !isPositiveSafeInteger(raw.attempts_used) || raw.committed_request_sha256 !== null)) {
    issue("state", "ambiguous 状态必须保留 intent、unknown attempt audit 和正 attempt 计数，且不得具有 commit");
  }
  if (state === "FAILED_CLOSED" && raw.committed_request_sha256 !== null) issue("state", "failed 状态不得具有 commit");
}

function checkpointCounts(entries: OracleGateCheckpointEntryV1[]): OracleGateCheckpointCountsV1 {
  return {
    pending: entries.filter((item) => item.state === "PENDING").length,
    retry_ready: entries.filter((item) => item.state === "RETRY_READY").length,
    dispatch_intent_committed: entries.filter((item) => item.state === "DISPATCH_INTENT_COMMITTED").length,
    receipt_committed: entries.filter((item) => item.state === "RECEIPT_COMMITTED").length,
    schema_validated_committed: entries.filter((item) => item.state === "SCHEMA_VALIDATED_COMMITTED").length,
    blocked_ambiguous: entries.filter((item) => item.state === "BLOCKED_AMBIGUOUS").length,
    failed_closed: entries.filter((item) => item.state === "FAILED_CLOSED").length,
  };
}

export function validateRunCheckpoint(input: unknown): OracleGateRunValidationReport {
  const issues: OracleGateRunValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return report([{ path: "$", message: "必须是对象" }]);
  const keys = ["schema_version", "checkpoint_sha256", "run_sha256", "schedule_sha256", "generation", "previous_checkpoint_sha256", "created_at", "run_state", "terminal_reason_sha256", "request_count", "counts", "entries"];
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== "oracle-gate-run-checkpoint-v1") issue("schema_version", "版本无效");
  for (const field of ["checkpoint_sha256", "run_sha256", "schedule_sha256"] as const) if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  if (!isNonNegativeSafeInteger(input.generation)) issue("generation", "必须是非负安全整数");
  if (input.previous_checkpoint_sha256 !== null && !isSha(input.previous_checkpoint_sha256)) issue("previous_checkpoint_sha256", "必须为 null 或 SHA-256");
  if (input.generation === 0 ? input.previous_checkpoint_sha256 !== null : !isSha(input.previous_checkpoint_sha256)) issue("previous_checkpoint_sha256", "generation 0 必须为 null，后续 generation 必须有前驱 hash");
  if (!isCanonicalTime(input.created_at)) issue("created_at", "必须是 canonical ISO 时间");
  if (!["SEALED_READY", "RUNNING", "INTERRUPTED_SAFE", "BLOCKED_AMBIGUOUS", "FAILED_CLOSED", "EXECUTION_COMPLETE"].includes(String(input.run_state))) issue("run_state", "值无效");
  if (input.terminal_reason_sha256 !== null && !isSha(input.terminal_reason_sha256)) issue("terminal_reason_sha256", "必须为 null 或 SHA-256");
  if (!isPositiveSafeInteger(input.request_count)) issue("request_count", "必须是正安全整数");
  if (!isRecord(input.counts) || !exactKeys(input.counts, ["pending", "retry_ready", "dispatch_intent_committed", "receipt_committed", "schema_validated_committed", "blocked_ambiguous", "failed_closed"])) issue("counts", "字段集合无效");
  else for (const [field, value] of Object.entries(input.counts)) if (!isNonNegativeSafeInteger(value)) issue(`counts.${field}`, "必须是非负安全整数");
  if (!isDenseArray(input.entries)) issue("entries", "必须是稠密数组且不得有额外属性");
  else {
    input.entries.forEach((entry, index) => validateCheckpointEntry(entry, `entries[${index}]`, issues));
    if (isPositiveSafeInteger(input.request_count) && input.entries.length !== input.request_count) issue("entries", "必须精确覆盖 request_count");
    const entryRecords = input.entries.filter(isRecord);
    const requestIds = entryRecords.map((entry) => entry.request_id);
    const keysSeen = entryRecords.map((entry) => entry.idempotency_key);
    if (new Set(requestIds).size !== requestIds.length || new Set(keysSeen).size !== keysSeen.length) issue("entries", "request_id 与 idempotency_key 必须唯一");
    if (entryRecords.length === input.entries.length && isRecord(input.counts)) {
      const expected = checkpointCounts(input.entries as OracleGateCheckpointEntryV1[]);
      if (stableJson(input.counts) !== stableJson(expected)) issue("counts", "必须由 entries 精确派生");
    }
    const states = entryRecords.map((entry) => entry.state);
    if (input.generation === 0 && (input.run_state !== "SEALED_READY" || states.some((state) => state !== "PENDING"))) issue("generation", "generation 0 必须是全量干净 PENDING 的 SEALED_READY");
    if (input.run_state === "SEALED_READY" && states.some((state) => state !== "PENDING")) issue("run_state", "SEALED_READY 只能包含 PENDING");
    if (input.run_state === "EXECUTION_COMPLETE" && states.some((state) => state !== "SCHEMA_VALIDATED_COMMITTED")) issue("run_state", "EXECUTION_COMPLETE 仅表示全部请求 transport/schema validated；不表示语义 review 通过");
    if (input.run_state === "BLOCKED_AMBIGUOUS" && !states.includes("BLOCKED_AMBIGUOUS")) issue("run_state", "BLOCKED_AMBIGUOUS 必须至少有一个 ambiguous request");
    if (input.run_state === "RUNNING" && states.some((state) => state === "BLOCKED_AMBIGUOUS" || state === "FAILED_CLOSED")) issue("run_state", "RUNNING 不得包含 blocked/failed request");
    if (input.run_state === "FAILED_CLOSED" && !states.includes("FAILED_CLOSED")) issue("run_state", "FAILED_CLOSED 必须至少有一个 failed request");
    if (input.run_state === "INTERRUPTED_SAFE" && states.some((state) => state === "DISPATCH_INTENT_COMMITTED" || state === "BLOCKED_AMBIGUOUS" || state === "FAILED_CLOSED")) issue("run_state", "安全中断不得遗留 dispatch intent、ambiguous 或 failed request");
  }
  const terminal = input.run_state === "BLOCKED_AMBIGUOUS" || input.run_state === "FAILED_CLOSED";
  if (terminal !== isSha(input.terminal_reason_sha256)) issue("terminal_reason_sha256", "blocked/failed 必须有原因 hash，非终止状态不得有");
  addHashIssue(issues, input as unknown as RunCheckpointV1, input.checkpoint_sha256, "checkpoint_sha256", hashRunCheckpoint);
  return report(issues);
}

const REQUEST_TRANSITIONS: Record<OracleGateRequestState, ReadonlySet<OracleGateRequestState>> = {
  PENDING: new Set(["PENDING", "DISPATCH_INTENT_COMMITTED", "FAILED_CLOSED"]),
  RETRY_READY: new Set(["RETRY_READY", "DISPATCH_INTENT_COMMITTED", "FAILED_CLOSED"]),
  DISPATCH_INTENT_COMMITTED: new Set(["DISPATCH_INTENT_COMMITTED", "RECEIPT_COMMITTED", "BLOCKED_AMBIGUOUS", "FAILED_CLOSED"]),
  RECEIPT_COMMITTED: new Set(["RECEIPT_COMMITTED", "RETRY_READY", "SCHEMA_VALIDATED_COMMITTED", "FAILED_CLOSED"]),
  SCHEMA_VALIDATED_COMMITTED: new Set(["SCHEMA_VALIDATED_COMMITTED"]),
  BLOCKED_AMBIGUOUS: new Set(["BLOCKED_AMBIGUOUS", "FAILED_CLOSED"]),
  FAILED_CLOSED: new Set(["FAILED_CLOSED"]),
};

const RUN_TRANSITIONS: Record<OracleGateRunState, ReadonlySet<OracleGateRunState>> = {
  SEALED_READY: new Set(["SEALED_READY", "RUNNING", "FAILED_CLOSED"]),
  RUNNING: new Set(["RUNNING", "INTERRUPTED_SAFE", "BLOCKED_AMBIGUOUS", "FAILED_CLOSED", "EXECUTION_COMPLETE"]),
  INTERRUPTED_SAFE: new Set(["INTERRUPTED_SAFE", "RUNNING", "FAILED_CLOSED"]),
  BLOCKED_AMBIGUOUS: new Set(["BLOCKED_AMBIGUOUS", "FAILED_CLOSED"]),
  FAILED_CLOSED: new Set(["FAILED_CLOSED"]),
  EXECUTION_COMPLETE: new Set(["EXECUTION_COMPLETE"]),
};

export function validateRunCheckpointTransition(previous: unknown, next: unknown): OracleGateRunValidationReport {
  const issues: OracleGateRunValidationIssue[] = [];
  const previousReport = validateRunCheckpoint(previous);
  const nextReport = validateRunCheckpoint(next);
  previousReport.issues.forEach((item) => issues.push({ path: `previous.${item.path}`, message: item.message }));
  nextReport.issues.forEach((item) => issues.push({ path: `next.${item.path}`, message: item.message }));
  if (!previousReport.valid || !nextReport.valid) return report(issues);
  const left = previous as RunCheckpointV1;
  const right = next as RunCheckpointV1;
  if (right.generation !== left.generation + 1 || right.previous_checkpoint_sha256 !== left.checkpoint_sha256) issues.push({ path: "next.previous_checkpoint_sha256", message: "必须形成连续 checkpoint hash chain" });
  if (Date.parse(right.created_at) < Date.parse(left.created_at)) issues.push({ path: "next.created_at", message: "checkpoint 时间不得回退" });
  if (right.run_sha256 !== left.run_sha256 || right.schedule_sha256 !== left.schedule_sha256 || right.request_count !== left.request_count) issues.push({ path: "next", message: "run/schedule/request_count 不得漂移" });
  if (!RUN_TRANSITIONS[left.run_state].has(right.run_state)) issues.push({ path: "next.run_state", message: `非法 run 状态转换：${left.run_state} -> ${right.run_state}` });
  const rightByRequest = new Map(right.entries.map((entry) => [entry.request_id, entry]));
  for (const prior of left.entries) {
    const current = rightByRequest.get(prior.request_id);
    if (!current) { issues.push({ path: "next.entries", message: `缺少 request ${prior.request_id}` }); continue; }
    if (current.idempotency_key !== prior.idempotency_key) issues.push({ path: `next.entries.${prior.request_id}.idempotency_key`, message: "不得漂移" });
    if (current.max_attempts !== prior.max_attempts) issues.push({ path: `next.entries.${prior.request_id}.max_attempts`, message: "不得漂移" });
    if (!REQUEST_TRANSITIONS[prior.state].has(current.state)) issues.push({ path: `next.entries.${prior.request_id}.state`, message: `非法 request 状态转换：${prior.state} -> ${current.state}` });
    if (current.attempts_used < prior.attempts_used) issues.push({ path: `next.entries.${prior.request_id}.attempts_used`, message: "累计 attempts 不得回退" });
    if (prior.state === current.state && stableJson(prior) !== stableJson(current)) issues.push({ path: `next.entries.${prior.request_id}`, message: "同状态 checkpoint 不得重绑定 provenance" });
    if (prior.state === "SCHEMA_VALIDATED_COMMITTED" && stableJson(prior) !== stableJson(current)) issues.push({ path: `next.entries.${prior.request_id}`, message: "schema-validated entry 必须逐字段不可变" });
    if (prior.state === "PENDING" && current.state === "DISPATCH_INTENT_COMMITTED"
      && (current.attempts_used !== 0 || current.latest_attempt_audit_sha256 !== null)) {
      issues.push({ path: `next.entries.${prior.request_id}`, message: "首次 dispatch 必须从干净 PENDING 开始" });
    }
    if (prior.state === "DISPATCH_INTENT_COMMITTED" && current.state === "RECEIPT_COMMITTED"
      && (current.active_intent_sha256 !== prior.active_intent_sha256
        || !isSha(current.latest_attempt_audit_sha256)
        || current.latest_attempt_audit_sha256 === prior.latest_attempt_audit_sha256
        || current.attempts_used !== prior.attempts_used + 1)) {
      issues.push({ path: `next.entries.${prior.request_id}`, message: "receipt 必须绑定同一 intent 并只增加一次 attempt" });
    }
    if (prior.state === "DISPATCH_INTENT_COMMITTED" && current.state === "BLOCKED_AMBIGUOUS"
      && (current.active_intent_sha256 !== prior.active_intent_sha256
        || !isSha(current.latest_attempt_audit_sha256)
        || current.latest_attempt_audit_sha256 === prior.latest_attempt_audit_sha256
        || current.attempts_used !== prior.attempts_used + 1)) {
      issues.push({ path: `next.entries.${prior.request_id}`, message: "ambiguous 必须绑定本次 unknown attempt audit" });
    }
    if (prior.state === "RECEIPT_COMMITTED" && (current.state === "RETRY_READY" || current.state === "SCHEMA_VALIDATED_COMMITTED")
      && (current.active_intent_sha256 !== prior.active_intent_sha256
        || current.latest_attempt_audit_sha256 !== prior.latest_attempt_audit_sha256
        || current.attempts_used !== prior.attempts_used)) {
      issues.push({ path: `next.entries.${prior.request_id}`, message: "receipt 后续状态必须保留 intent/audit provenance" });
    }
    if (prior.state === "RETRY_READY" && current.state === "DISPATCH_INTENT_COMMITTED" && current.latest_attempt_audit_sha256 !== prior.latest_attempt_audit_sha256) issues.push({ path: `next.entries.${prior.request_id}.latest_attempt_audit_sha256`, message: "retry dispatch 必须保留上一 attempt audit" });
    if (prior.state === "RETRY_READY" && current.state === "DISPATCH_INTENT_COMMITTED" && current.attempts_used !== prior.attempts_used) issues.push({ path: `next.entries.${prior.request_id}.attempts_used`, message: "retry dispatch 不得预先增加 attempt 计数" });
    if (prior.state === "RETRY_READY" && current.state === "DISPATCH_INTENT_COMMITTED" && current.active_intent_sha256 === prior.active_intent_sha256) issues.push({ path: `next.entries.${prior.request_id}.active_intent_sha256`, message: "retry dispatch 必须绑定新的 attempt intent" });
    if (prior.state === "PENDING" && current.state === "FAILED_CLOSED"
      && (current.active_intent_sha256 !== null || current.latest_attempt_audit_sha256 !== null || current.attempts_used !== 0)) {
      issues.push({ path: `next.entries.${prior.request_id}`, message: "未 dispatch 的 fail-closed 必须保持干净 provenance" });
    }
    if (current.state === "FAILED_CLOSED" && prior.state !== "PENDING"
      && (current.active_intent_sha256 !== prior.active_intent_sha256
        || current.latest_attempt_audit_sha256 !== prior.latest_attempt_audit_sha256
        || current.attempts_used !== prior.attempts_used)) {
      issues.push({ path: `next.entries.${prior.request_id}`, message: "fail-closed 必须保留已有 provenance" });
    }
  }
  return report(issues);
}

export function validatePrivateAnswerKey(input: unknown): OracleGateRunValidationReport {
  const issues: OracleGateRunValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return report([{ path: "$", message: "必须是对象" }]);
  const keys = ["schema_version", "answer_key_sha256", "run_sha256", "public_package_sha256", "blind_secret_commitment_sha256", "blinding_scheme", "created_at", "entries"];
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== "oracle-gate-private-answer-key-v1") issue("schema_version", "版本无效");
  for (const field of ["answer_key_sha256", "run_sha256", "public_package_sha256", "blind_secret_commitment_sha256"] as const) if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  if (input.blinding_scheme !== "hmac-sha256-run-request-v1") issue("blinding_scheme", "值无效");
  if (!isCanonicalTime(input.created_at)) issue("created_at", "必须是 canonical ISO 时间");
  if (!isDenseArray(input.entries) || !input.entries.length) issue("entries", "必须是非空稠密数组且不得有额外属性");
  const blindIds: unknown[] = [];
  const requestIds: unknown[] = [];
  const idempotencyKeys: unknown[] = [];
  for (const [index, raw] of (Array.isArray(input.entries) ? input.entries : []).entries()) {
    const path = `entries[${index}]`;
    if (!isRecord(raw)) { issue(path, "必须是对象"); continue; }
    if (!exactKeys(raw, ["blind_id", "request_id", "idempotency_key", "case_id", "arm", "seed", "teacher_id", "source_video_id", "window_id", "response_sha256"])) issue(path, "字段集合无效");
    if (!isBlindId(raw.blind_id)) issue(`${path}.blind_id`, "必须是完整 HMAC 派生 blind ID");
    if (!isId(raw.request_id) || !isId(raw.case_id) || !isId(raw.teacher_id) || !isId(raw.source_video_id) || !isId(raw.window_id)) issue(`${path}.identity`, "标识格式无效");
    if (!isSha(raw.idempotency_key) || !isSha(raw.response_sha256)) issue(`${path}.hash`, "必须是 SHA-256");
    if (!ARMS.has(raw.arm as OracleGateRunArm)) issue(`${path}.arm`, "值无效");
    if (!isUint32(raw.seed)) issue(`${path}.seed`, "必须是 0..2^32-1 安全整数");
    blindIds.push(raw.blind_id); requestIds.push(raw.request_id); idempotencyKeys.push(raw.idempotency_key);
  }
  if (new Set(blindIds).size !== blindIds.length || new Set(requestIds).size !== requestIds.length || new Set(idempotencyKeys).size !== idempotencyKeys.length) issue("entries", "blind_id、request_id、idempotency_key 必须分别唯一");
  addHashIssue(issues, input as unknown as PrivateAnswerKeyV1, input.answer_key_sha256, "answer_key_sha256", hashPrivateAnswerKey);
  return report(issues);
}

export function validatePublicBlindPackage(input: unknown): OracleGateRunValidationReport {
  const issues: OracleGateRunValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return report([{ path: "$", message: "必须是对象" }]);
  if (!exactKeys(input, ["schema_version", "package_sha256", "run_commitment_sha256", "rubric_version", "rubric_sha256", "blinding_statement", "item_count", "items"])) issue("$", "字段集合无效");
  if (input.schema_version !== "oracle-gate-public-blind-package-v1") issue("schema_version", "版本无效");
  for (const field of ["package_sha256", "run_commitment_sha256", "rubric_sha256"] as const) if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  if (!isNonEmpty(input.rubric_version)) issue("rubric_version", "不能为空");
  if (input.blinding_statement !== "metadata_blinded_no_pairing_exposed") issue("blinding_statement", "值无效");
  if (!isPositiveSafeInteger(input.item_count)) issue("item_count", "必须是正安全整数");
  if (!isDenseArray(input.items) || !input.items.length) issue("items", "必须是非空稠密数组且不得有额外属性");
  const blindIds: unknown[] = [];
  for (const [index, raw] of (Array.isArray(input.items) ? input.items : []).entries()) {
    const path = `items[${index}]`;
    if (!isRecord(raw)) { issue(path, "必须是对象"); continue; }
    if (!exactKeys(raw, ["blind_id", "response", "response_sha256"])) issue(path, "公开 blind item 只允许 blind_id/response/response_sha256");
    if (!isBlindId(raw.blind_id)) issue(`${path}.blind_id`, "必须是完整 HMAC 派生 blind ID");
    if (!isRecord(raw.response)) issue(`${path}.response`, "必须是 JSON 对象");
    else {
      validateJsonValue(raw.response, `${path}.response`, issues);
      validatePublicStringLeakage(raw.response, `${path}.response`, issues);
      if (isSha(raw.response_sha256)) {
        try { if (raw.response_sha256 !== hashPublicBlindResponse(raw.response)) issue(`${path}.response_sha256`, "公开响应内容寻址哈希不匹配"); }
        catch { issue(`${path}.response_sha256`, "响应不能规范序列化"); }
      }
    }
    if (!isSha(raw.response_sha256)) issue(`${path}.response_sha256`, "必须是 SHA-256");
    blindIds.push(raw.blind_id);
  }
  if (new Set(blindIds).size !== blindIds.length) issue("items", "blind_id 必须唯一");
  if (Array.isArray(input.items) && isPositiveSafeInteger(input.item_count) && input.items.length !== input.item_count) issue("item_count", "必须与 items 长度一致");
  addHashIssue(issues, input as unknown as PublicBlindPackageV1, input.package_sha256, "package_sha256", hashPublicBlindPackage);
  return report(issues);
}

export function validateRequestAttemptAgainstIntent(intent: unknown, audit: unknown): OracleGateRunValidationReport {
  const issues: OracleGateRunValidationIssue[] = [];
  const intentReport = validateRequestIntent(intent);
  const auditReport = validateRequestAttemptAudit(audit);
  intentReport.issues.forEach((item) => issues.push({ path: `intent.${item.path}`, message: item.message }));
  auditReport.issues.forEach((item) => issues.push({ path: `audit.${item.path}`, message: item.message }));
  if (!intentReport.valid || !auditReport.valid) return report(issues);
  const expected = intent as RequestIntentV1;
  const actual = audit as RequestAttemptAuditV1;
  const equalFields: Array<keyof RequestIntentV1 & keyof RequestAttemptAuditV1> = ["run_sha256", "request_id", "idempotency_key", "attempt_ordinal", "model", "transport", "temperature", "max_input_tokens", "max_output_tokens", "timeout_ms", "seed", "cache_retention", "tools_policy"];
  for (const field of equalFields) if (expected[field] !== actual[field]) issues.push({ path: `audit.${field}`, message: "与 request intent 不一致" });
  if (actual.intent_sha256 !== expected.intent_sha256 || actual.request_sha256 !== expected.provider_body_sha256 || actual.request_object_uri !== expected.provider_body_object_uri) issues.push({ path: "audit.request", message: "intent/provider body 内容绑定不一致" });
  if (stableJson(actual.submitted_visuals) !== stableJson(expected.visuals)) issues.push({ path: "audit.submitted_visuals", message: "与 request intent 不一致" });
  if (isRecord(actual.usage) && (Number(actual.usage.input_tokens) > expected.max_input_tokens || Number(actual.usage.output_tokens) > expected.max_output_tokens)) issues.push({ path: "audit.usage", message: "token usage 超过 request intent 冻结预算" });
  if ((actual.outcome === "not_sent" || actual.outcome === "no_result_confirmed")
    && actual.automatic_retry_allowed !== (actual.attempt_ordinal < expected.max_attempts)) {
    issues.push({ path: "audit.automatic_retry_allowed", message: "必须由 attempt_ordinal 与 max_attempts 精确派生" });
  }
  if (Date.parse(actual.started_at) < Date.parse(expected.prepared_at)) issues.push({ path: "audit.started_at", message: "不得早于 intent prepared_at" });
  if (Date.parse(actual.finished_at) - Date.parse(actual.started_at) !== actual.latency_ms) issues.push({ path: "audit.latency_ms", message: "必须与 started_at/finished_at 精确一致" });
  return report(issues);
}

export function validateCommittedRequestAgainstAttempt(
  intent: unknown,
  audit: unknown,
  committed: unknown,
): OracleGateRunValidationReport {
  const issues = [...validateRequestAttemptAgainstIntent(intent, audit).issues];
  const committedReport = validateCommittedRequest(committed);
  committedReport.issues.forEach((item) => issues.push({ path: `committed.${item.path}`, message: item.message }));
  if (issues.length) return report(issues);
  const request = intent as RequestIntentV1;
  const attempt = audit as RequestAttemptAuditV1;
  const record = committed as CommittedRequestV1;
  if (attempt.outcome !== "result_received" || attempt.stop_reason !== "stop") issues.push({ path: "audit", message: "只有 stop 完成的 result_received 才能 commit" });
  if (record.run_sha256 !== request.run_sha256 || record.request_id !== request.request_id || record.idempotency_key !== request.idempotency_key || record.intent_sha256 !== request.intent_sha256) issues.push({ path: "committed.identity", message: "与 intent 不一致" });
  if (record.attempt_sha256 !== attempt.attempt_sha256 || record.attempt_ordinal !== attempt.attempt_ordinal
    || record.response_object_uri !== attempt.parsed_response_object_uri || record.response_sha256 !== attempt.parsed_response_sha256) {
    issues.push({ path: "committed.response", message: "与 attempt parsed response receipt 不一致" });
  }
  if (Date.parse(record.transport_and_schema_verified_at) < Date.parse(attempt.finished_at)) issues.push({ path: "committed.transport_and_schema_verified_at", message: "不得早于 attempt finished_at" });
  return report(issues);
}

export function validatePrivateAnswerKeyAgainstPublicPackage(
  answerKey: unknown,
  publicPackage: unknown,
): OracleGateRunValidationReport {
  const issues: OracleGateRunValidationIssue[] = [];
  const keyReport = validatePrivateAnswerKey(answerKey);
  const packageReport = validatePublicBlindPackage(publicPackage);
  keyReport.issues.forEach((item) => issues.push({ path: `answer_key.${item.path}`, message: item.message }));
  packageReport.issues.forEach((item) => issues.push({ path: `public_package.${item.path}`, message: item.message }));
  if (!keyReport.valid || !packageReport.valid) return report(issues);
  const key = answerKey as PrivateAnswerKeyV1;
  const published = publicPackage as PublicBlindPackageV1;
  if (key.public_package_sha256 !== published.package_sha256 || key.run_sha256 !== published.run_commitment_sha256) issues.push({ path: "$", message: "private/public package commitment 不一致" });
  const publicByBlindId = new Map(published.items.map((item) => [item.blind_id, item]));
  if (key.entries.length !== published.items.length) issues.push({ path: "$", message: "private/public item 数量不一致" });
  for (const entry of key.entries) {
    const item = publicByBlindId.get(entry.blind_id);
    if (!item || item.response_sha256 !== entry.response_sha256) issues.push({ path: `entries.${entry.blind_id}`, message: "private/public blind mapping 不一致" });
  }
  return report(issues);
}

/**
 * Cross-validates a completed, single immutable run artifact set. This does not
 * authorize execution; it proves that the stored intents, receipts, commits,
 * terminal checkpoint and blind packages all descend from the same root run.
 */
export function validateCompletedFormalRunArtifactChain(input: {
  run: unknown;
  intents: unknown[];
  attempts: unknown[];
  committed_requests: unknown[];
  checkpoints: unknown[];
  private_answer_key: unknown;
  public_blind_package: unknown;
}): OracleGateRunValidationReport {
  const issues: OracleGateRunValidationIssue[] = [];
  const push = (prefix: string, result: OracleGateRunValidationReport): void => {
    result.issues.forEach((item) => issues.push({ path: `${prefix}.${item.path}`, message: item.message }));
  };
  if (!isRecord(input)) return report([{ path: "$", message: "必须是对象" }]);
  if (!isDenseArray(input.intents) || !isDenseArray(input.attempts) || !isDenseArray(input.committed_requests)
    || !isDenseArray(input.checkpoints) || !input.checkpoints.length) {
    return report([{ path: "$", message: "intents/attempts/committed_requests/checkpoints 必须是稠密数组，且 checkpoint 历史不能为空" }]);
  }
  push("run", validateFormalRunContract(input.run));
  input.intents.forEach((item, index) => push(`intents[${index}]`, validateRequestIntent(item)));
  input.attempts.forEach((item, index) => push(`attempts[${index}]`, validateRequestAttemptAudit(item)));
  input.committed_requests.forEach((item, index) => push(`committed_requests[${index}]`, validateCommittedRequest(item)));
  input.checkpoints.forEach((item, index) => push(`checkpoints[${index}]`, validateRunCheckpoint(item)));
  for (let index = 1; index < input.checkpoints.length; index += 1) {
    push(`checkpoints[${index}]`, validateRunCheckpointTransition(input.checkpoints[index - 1], input.checkpoints[index]));
  }
  push("blind", validatePrivateAnswerKeyAgainstPublicPackage(input.private_answer_key, input.public_blind_package));
  if (issues.length) return report(issues);

  const run = input.run as FormalRunContractV1;
  const intents = input.intents as RequestIntentV1[];
  const attempts = input.attempts as RequestAttemptAuditV1[];
  const committed = input.committed_requests as CommittedRequestV1[];
  const checkpoints = input.checkpoints as RunCheckpointV1[];
  const checkpoint = checkpoints.at(-1)!;
  const answerKey = input.private_answer_key as PrivateAnswerKeyV1;
  const published = input.public_blind_package as PublicBlindPackageV1;
  if (checkpoints[0].generation !== 0 || checkpoints[0].previous_checkpoint_sha256 !== null
    || checkpoints[0].run_state !== "SEALED_READY") {
    issues.push({ path: "checkpoints[0]", message: "完整链必须从 generation 0 的 SEALED_READY 开始" });
  }
  if (checkpoints.some((item) => item.run_sha256 !== run.run_sha256 || item.schedule_sha256 !== run.schedule_sha256
    || item.request_count !== run.request_count)) {
    issues.push({ path: "checkpoints", message: "全部 checkpoint 必须绑定同一根 run/schedule/request_count" });
  }
  if (run.api_execution_allowed !== false) issues.push({ path: "run.api_execution_allowed", message: "cross-validator 不能授权 API" });
  if (checkpoint.run_state !== "EXECUTION_COMPLETE" || checkpoint.run_sha256 !== run.run_sha256
    || checkpoint.schedule_sha256 !== run.schedule_sha256 || checkpoint.request_count !== run.request_count) {
    issues.push({ path: "checkpoint", message: "必须是绑定根 run 的完整终态 checkpoint" });
  }
  if (answerKey.run_sha256 !== run.run_sha256 || answerKey.blind_secret_commitment_sha256 !== run.blinding_secret_commitment_sha256
    || published.run_commitment_sha256 !== run.run_sha256) {
    issues.push({ path: "blind", message: "private/public blind artifacts 未绑定根 run" });
  }

  const intentsByRequest = new Map<string, RequestIntentV1[]>();
  for (const intent of intents) {
    if (intent.run_sha256 !== run.run_sha256) issues.push({ path: `intents.${intent.request_id}.run_sha256`, message: "未绑定根 run" });
    const group = intentsByRequest.get(intent.request_id) ?? [];
    group.push(intent);
    intentsByRequest.set(intent.request_id, group);
  }
  if (intentsByRequest.size !== run.request_count) issues.push({ path: "intents", message: "必须精确覆盖根 run 的 request_count" });
  const scheduleIndexes = [...intentsByRequest.values()].map((group) => group[0]?.schedule_index).sort((a, b) => Number(a) - Number(b));
  if (JSON.stringify(scheduleIndexes) !== JSON.stringify(Array.from({ length: run.request_count }, (_, index) => index))) {
    issues.push({ path: "intents.schedule_index", message: "必须精确覆盖 0..request_count-1" });
  }

  const attemptsByIntent = new Map(attempts.map((item) => [item.intent_sha256, item]));
  const intentsBySha = new Map(intents.map((item) => [item.intent_sha256, item]));
  const attemptsBySha = new Map(attempts.map((item) => [item.attempt_sha256, item]));
  const commitsBySha = new Map(committed.map((item) => [item.committed_request_sha256, item]));
  const commitsByRequest = new Map(committed.map((item) => [item.request_id, item]));
  if (attemptsByIntent.size !== attempts.length || commitsByRequest.size !== committed.length || committed.length !== run.request_count) {
    issues.push({ path: "attempts", message: "attempt intent 与每 request 最终 commit 必须唯一" });
  }
  const checkpointByRequest = new Map(checkpoint.entries.map((item) => [item.request_id, item]));
  const answerByRequest = new Map(answerKey.entries.map((item) => [item.request_id, item]));

  for (const [checkpointIndex, historical] of checkpoints.entries()) {
    const checkpointTime = Date.parse(historical.created_at);
    for (const entry of historical.entries) {
      const path = `checkpoints[${checkpointIndex}].entries.${entry.request_id}`;
      const activeIntent = entry.active_intent_sha256 ? intentsBySha.get(entry.active_intent_sha256) : undefined;
      const latestAudit = entry.latest_attempt_audit_sha256 ? attemptsBySha.get(entry.latest_attempt_audit_sha256) : undefined;
      const committedRecord = entry.committed_request_sha256 ? commitsBySha.get(entry.committed_request_sha256) : undefined;
      if (entry.active_intent_sha256 && (!activeIntent || activeIntent.request_id !== entry.request_id
        || activeIntent.idempotency_key !== entry.idempotency_key)) {
        issues.push({ path: `${path}.active_intent_sha256`, message: "checkpoint active intent 必须引用本 request 的真实 intent" });
      }
      if (entry.latest_attempt_audit_sha256 && (!latestAudit || latestAudit.request_id !== entry.request_id
        || latestAudit.idempotency_key !== entry.idempotency_key)) {
        issues.push({ path: `${path}.latest_attempt_audit_sha256`, message: "checkpoint latest audit 必须引用本 request 的真实 attempt" });
      }
      if (entry.committed_request_sha256 && (!committedRecord || committedRecord.request_id !== entry.request_id
        || committedRecord.idempotency_key !== entry.idempotency_key)) {
        issues.push({ path: `${path}.committed_request_sha256`, message: "checkpoint commit 必须引用本 request 的真实 commit" });
      }
      if (entry.state === "DISPATCH_INTENT_COMMITTED" && activeIntent) {
        if (activeIntent.attempt_ordinal !== entry.attempts_used + 1
          || Date.parse(activeIntent.prepared_at) > checkpointTime) {
          issues.push({ path, message: "dispatch checkpoint 必须绑定下一序号且已持久化的 intent" });
        }
        const dispatchedAttempt = attemptsByIntent.get(activeIntent.intent_sha256);
        if (dispatchedAttempt && Date.parse(dispatchedAttempt.started_at) < checkpointTime) {
          issues.push({ path, message: "provider attempt 不得早于 dispatch intent checkpoint" });
        }
        if (entry.attempts_used === 0 && entry.latest_attempt_audit_sha256 !== null) {
          issues.push({ path, message: "首次 dispatch 不得引用旧 audit" });
        }
        if (entry.attempts_used > 0 && (!latestAudit || latestAudit.attempt_ordinal !== entry.attempts_used
          || latestAudit.request_id !== entry.request_id)) {
          issues.push({ path, message: "retry dispatch 必须精确保留上一 attempt audit" });
        }
      }
      if (["RECEIPT_COMMITTED", "RETRY_READY", "BLOCKED_AMBIGUOUS", "SCHEMA_VALIDATED_COMMITTED"].includes(entry.state)) {
        if (!activeIntent || !latestAudit || activeIntent.attempt_ordinal !== entry.attempts_used
          || latestAudit.attempt_ordinal !== entry.attempts_used || latestAudit.intent_sha256 !== activeIntent.intent_sha256
          || Date.parse(latestAudit.finished_at) > checkpointTime) {
          issues.push({ path, message: "checkpoint 状态必须精确绑定同序号 intent/audit 且回执先于 checkpoint" });
        }
      }
      if (entry.state === "RETRY_READY" && latestAudit
        && (!(["not_sent", "no_result_confirmed"] as const).includes(latestAudit.outcome as "not_sent" | "no_result_confirmed")
          || latestAudit.automatic_retry_allowed !== true)) {
        issues.push({ path, message: "RETRY_READY 只能来自明确无结果且允许重试的 audit" });
      }
      if (entry.state === "BLOCKED_AMBIGUOUS" && latestAudit && latestAudit.outcome !== "unknown") {
        issues.push({ path, message: "BLOCKED_AMBIGUOUS 必须来自 unknown audit" });
      }
      if (entry.state === "SCHEMA_VALIDATED_COMMITTED" && committedRecord
        && (!latestAudit || committedRecord.attempt_sha256 !== latestAudit.attempt_sha256
          || committedRecord.intent_sha256 !== activeIntent?.intent_sha256
          || Date.parse(committedRecord.transport_and_schema_verified_at) > checkpointTime)) {
        issues.push({ path, message: "SCHEMA_VALIDATED_COMMITTED 必须绑定当前 intent/audit/commit 且结构验证先于 checkpoint" });
      }
    }
  }

  for (const [requestId, group] of intentsByRequest) {
    group.sort((left, right) => left.attempt_ordinal - right.attempt_ordinal);
    const first = group[0];
    if (!first || group.some((item, index) => item.attempt_ordinal !== index + 1)) {
      issues.push({ path: `intents.${requestId}`, message: "attempt ordinal 必须从 1 连续递增" });
      continue;
    }
    const invariant = (item: RequestIntentV1): string => stableJson({
      run_sha256: item.run_sha256,
      request_id: item.request_id,
      idempotency_key: item.idempotency_key,
      schedule_index: item.schedule_index,
      case_id: item.case_id,
      arm: item.arm,
      seed: item.seed,
      model: item.model,
      request_envelope_sha256: item.request_envelope_sha256,
      request_envelope_object_uri: item.request_envelope_object_uri,
      provider_body_sha256: item.provider_body_sha256,
      provider_body_object_uri: item.provider_body_object_uri,
      provider_body_profile: item.provider_body_profile,
      provider_body_dispatch_status: item.provider_body_dispatch_status,
      prepared_adapter_version: item.prepared_adapter_version,
      provider_token_field: item.provider_token_field,
      system_prompt_sha256: item.system_prompt_sha256,
      user_prompt_sha256: item.user_prompt_sha256,
      output_schema_sha256: item.output_schema_sha256,
      visuals: item.visuals,
      transport: item.transport,
      temperature: item.temperature,
      max_input_tokens: item.max_input_tokens,
      max_output_tokens: item.max_output_tokens,
      timeout_ms: item.timeout_ms,
      max_attempts: item.max_attempts,
      cache_retention: item.cache_retention,
      tools_policy: item.tools_policy,
    });
    if (group.some((item) => invariant(item) !== invariant(first))) issues.push({ path: `intents.${requestId}`, message: "retry 不得改变冻结请求语义" });
    if (group.length > first.max_attempts) issues.push({ path: `intents.${requestId}`, message: "attempt 数超过 max_attempts" });
    for (const [intentIndex, intent] of group.entries()) {
      const audit = attemptsByIntent.get(intent.intent_sha256);
      if (!audit) issues.push({ path: `attempts.${intent.intent_sha256}`, message: "缺少 intent 对应 attempt audit" });
      else {
        push(`attempts.${intent.intent_sha256}`, validateRequestAttemptAgainstIntent(intent, audit));
        if (intentIndex < group.length - 1 && (!(["not_sent", "no_result_confirmed"] as const).includes(audit.outcome as "not_sent" | "no_result_confirmed")
          || audit.automatic_retry_allowed !== true)) {
          issues.push({ path: `attempts.${intent.intent_sha256}`, message: "只有明确未发送/确认无结果且允许自动重试的 attempt 才能产生下一 attempt" });
        }
        const nextIntent = group[intentIndex + 1];
        if (nextIntent && Date.parse(nextIntent.prepared_at) < Date.parse(audit.finished_at)) {
          issues.push({ path: `intents.${nextIntent.intent_sha256}.prepared_at`, message: "retry intent 不得早于上一 attempt 完成时间" });
        }
      }
    }
    const latestIntent = group.at(-1)!;
    const latestAttempt = attemptsByIntent.get(latestIntent.intent_sha256);
    const record = commitsByRequest.get(requestId);
    const entry = checkpointByRequest.get(requestId);
    const keyEntry = answerByRequest.get(requestId);
    if (!latestAttempt || !record) {
      issues.push({ path: `committed.${requestId}`, message: "缺少最终 attempt 或 commit" });
      continue;
    }
    push(`committed.${requestId}`, validateCommittedRequestAgainstAttempt(latestIntent, latestAttempt, record));
    if (Date.parse(checkpoint.created_at) < Date.parse(record.transport_and_schema_verified_at)
      || Date.parse(answerKey.created_at) < Date.parse(record.transport_and_schema_verified_at)) {
      issues.push({ path: `committed.${requestId}`, message: "terminal checkpoint 与 answer key 不得早于 transport/schema validated response" });
    }
    if (!entry || entry.state !== "SCHEMA_VALIDATED_COMMITTED" || entry.active_intent_sha256 !== latestIntent.intent_sha256
      || entry.latest_attempt_audit_sha256 !== latestAttempt.attempt_sha256
      || entry.committed_request_sha256 !== record.committed_request_sha256
      || entry.attempts_used !== group.length || entry.max_attempts !== latestIntent.max_attempts) {
      issues.push({ path: `checkpoint.entries.${requestId}`, message: "未精确绑定最终 intent/audit/commit" });
    }
    if (!keyEntry || keyEntry.idempotency_key !== latestIntent.idempotency_key || keyEntry.case_id !== latestIntent.case_id
      || keyEntry.arm !== latestIntent.arm || keyEntry.seed !== latestIntent.seed || keyEntry.response_sha256 !== record.response_sha256) {
      issues.push({ path: `answer_key.${requestId}`, message: "未精确绑定最终请求与响应" });
    }
  }
  if (attempts.length !== intents.length || answerKey.entries.length !== run.request_count || published.items.length !== run.request_count) {
    issues.push({ path: "$", message: "intent/attempt/commit/blind 数量未形成完整 run" });
  }

  const privateTokens = answerKey.entries.flatMap((item) => [
    item.request_id, item.idempotency_key, item.case_id, item.arm,
    item.teacher_id, item.source_video_id, item.window_id,
  ]).filter((item) => item.length >= 3);
  for (const item of published.items) {
    const serialized = stableJson(item.response);
    const normalized = serialized.toLocaleLowerCase("en-US");
    if (privateTokens.some((token) => normalized.includes(token.toLocaleLowerCase("en-US")))) {
      issues.push({ path: `public.${item.blind_id}`, message: "公开响应包含 private answer-key 值" });
    }
  }
  return report(issues);
}
