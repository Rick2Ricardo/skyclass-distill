import { sha256Hex } from "./sha256.js";
import {
  hashCommittedRequest,
  hashRequestAttemptAudit,
  hashRequestIntent,
  validateCommittedRequest,
  validateRequestAttemptAudit,
  validateRequestIntent,
  type CommittedRequestV3,
  type RequestAttemptAuditV4,
  type RequestIntentV1,
} from "./oracle-gate-run.js";
import {
  hashFormalOracleExecutionLineageV2,
  type FormalOracleExecutionLineageV2Input,
} from "./oracle-gate-execution-v2.js";
import { snapshotFormalOraclePreregistrationV2PlainData } from "./oracle-gate-preregistration-v2.js";

export const FORMAL_ORACLE_REQUEST_INTENT_V3_DOMAIN = "skyclass/formal-oracle/request-intent/v3\0";
export const FORMAL_ORACLE_REQUEST_ATTEMPT_AUDIT_V5_DOMAIN = "skyclass/formal-oracle/request-attempt-audit/v5\0";
export const FORMAL_ORACLE_COMMITTED_REQUEST_V4_DOMAIN = "skyclass/formal-oracle/committed-request/v4\0";
export const FORMAL_ORACLE_TERMINAL_REASON_V2_DOMAIN = "skyclass/formal-oracle/terminal-reason/v2\0";

export interface FormalOracleExecutionRecordRootsV2 extends FormalOracleExecutionLineageV2Input {
  execution_lineage_sha256: string;
  run_contract_schema_version: "oracle-gate-formal-run-contract-v2";
  execution_record_version: "formal-oracle-execution-records-v2";
  api_execution_allowed: false;
}

export interface RequestIntentV3 extends Omit<RequestIntentV1, "schema_version" | "intent_sha256">,
  FormalOracleExecutionRecordRootsV2 {
  schema_version: "oracle-gate-request-intent-v3";
  intent_sha256: string;
}

export interface RequestAttemptAuditV5 extends Omit<RequestAttemptAuditV4, "schema_version" | "attempt_sha256" | "intent_sha256">,
  FormalOracleExecutionRecordRootsV2 {
  schema_version: "oracle-gate-request-attempt-audit-v5";
  attempt_sha256: string;
  intent_schema_version: "oracle-gate-request-intent-v3";
  intent_sha256: string;
}

export interface CommittedRequestV4 extends Omit<CommittedRequestV3, "schema_version" | "committed_request_sha256" | "intent_sha256" | "attempt_sha256">,
  FormalOracleExecutionRecordRootsV2 {
  schema_version: "oracle-gate-committed-request-v4";
  committed_request_sha256: string;
  intent_schema_version: "oracle-gate-request-intent-v3";
  intent_sha256: string;
  attempt_schema_version: "oracle-gate-request-attempt-audit-v5";
  attempt_sha256: string;
}

export type FormalOracleTerminalReasonCodeV2 =
  | "ambiguous_unknown_attempt"
  | "invalid_response_received"
  | "attempt_budget_exhausted";

export interface FormalOracleTerminalReasonV2 extends FormalOracleExecutionRecordRootsV2 {
  schema_version: "formal-oracle-terminal-reason-v2";
  terminal_reason_sha256: string;
  request_id: string;
  reason_code: FormalOracleTerminalReasonCodeV2;
  source_attempt_schema_version: "oracle-gate-request-attempt-audit-v5";
  source_attempt_sha256: string;
  detail_sha256: string;
  created_at: string;
}

export interface FormalOracleExecutionRecordValidationIssue { path: string; message: string }
export interface FormalOracleExecutionRecordValidationReport { valid: boolean; issues: FormalOracleExecutionRecordValidationIssue[] }

const SHA = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function report(issues: FormalOracleExecutionRecordValidationIssue[]): FormalOracleExecutionRecordValidationReport {
  return { valid: issues.length === 0, issues };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function stable(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error("execution record 数值无效");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  throw new Error("execution record JSON 值无效");
}

function without(value: object, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([field]) => field !== key));
}

function domainHash(domain: string, value: object, self: string): string {
  return sha256Hex(`${domain}${stable(without(value, self))}`);
}

function snapshot<T>(value: T): T {
  return snapshotFormalOraclePreregistrationV2PlainData(value);
}

function issue(issues: FormalOracleExecutionRecordValidationIssue[], condition: boolean, path: string, message: string): void {
  if (!condition) issues.push({ path, message });
}

function push(issues: FormalOracleExecutionRecordValidationIssue[], prefix: string, nested: { issues: Array<{ path: string; message: string }> }): void {
  nested.issues.forEach((item) => issues.push({ path: `${prefix}.${item.path}`, message: item.message }));
}

function canonicalTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

const ROOT_KEYS = [
  "run_sha256", "preregistration_bundle_sha256", "schedule_sha256", "execution_plan_sha256",
  "genesis_checkpoint_sha256", "execution_lineage_sha256", "run_contract_schema_version",
  "execution_record_version", "api_execution_allowed",
] as const;

const LEGACY_INTENT_KEYS = [
  "run_sha256","request_id","idempotency_key","schedule_index","attempt_ordinal","prepared_at","case_id","arm","seed","model",
  "request_envelope_sha256","request_envelope_object_uri","provider_body_sha256","provider_body_object_uri","provider_body_profile",
  "provider_body_dispatch_status","prepared_adapter_version","provider_token_field","system_prompt_sha256","user_prompt_sha256",
  "output_schema_sha256","visuals","transport","temperature","max_input_tokens","max_output_tokens","timeout_ms","max_attempts",
  "cache_retention","tools_policy",
] as const;

const LEGACY_ATTEMPT_KEYS = [
  "run_sha256","request_id","idempotency_key","attempt_ordinal","started_at","finished_at","latency_ms","provider_id",
  "provider_http_request_id","transport_capture_record_object_uri","transport_capture_record_sha256","response_http_status",
  "response_content_type","response_headers_commitment_sha256","response_capture_status","completion_id","request_envelope_sha256",
  "request_envelope_object_uri","provider_body_sha256","provider_body_object_uri","fetch_observed_sse_object_uri",
  "fetch_observed_sse_bytes_sha256","fetch_observed_sse_byte_length","sse_derivation_object_uri","sse_derivation_record_sha256",
  "sse_parser_version","assistant_content_object_uri","assistant_content_bytes_sha256","assistant_content_byte_length",
  "canonical_response_object_uri","canonical_response_bytes_sha256","canonical_response_commitment_sha256",
  "invalid_response_record_object_uri","invalid_response_record_sha256","invalid_response_record_version","submitted_visuals","model",
  "transport","temperature","max_input_tokens","max_output_tokens","timeout_ms","seed","cache_retention","tools_policy","outcome",
  "provider_response_received","stop_reason","error_code","error_message","usage","pricing_table_sha256","cost_microunits",
  "automatic_retry_allowed",
] as const;

const LEGACY_COMMIT_KEYS = [
  "run_sha256","request_id","idempotency_key","attempt_ordinal","canonical_response_object_uri",
  "canonical_response_bytes_sha256","canonical_response_commitment_sha256","validator_version",
  "transport_and_schema_verified_at","transport_and_schema_verified","semantic_review_status","provider_stop_confirmed",
] as const;

function validateRoots(input: Record<string, unknown>, issues: FormalOracleExecutionRecordValidationIssue[]): void {
  for (const field of ["run_sha256","preregistration_bundle_sha256","schedule_sha256","execution_plan_sha256","genesis_checkpoint_sha256","execution_lineage_sha256"] as const) {
    issue(issues, SHA.test(String(input[field])), field, "SHA 无效");
  }
  issue(issues, input.run_contract_schema_version === "oracle-gate-formal-run-contract-v2"
    && input.execution_record_version === "formal-oracle-execution-records-v2" && input.api_execution_allowed === false,
  "execution_record_version", "record/run 版本或安全门无效");
  if (["run_sha256","preregistration_bundle_sha256","schedule_sha256","execution_plan_sha256","genesis_checkpoint_sha256"].every((field) => SHA.test(String(input[field])))) {
    issue(issues, hashFormalOracleExecutionLineageV2(input as unknown as FormalOracleExecutionLineageV2Input) === input.execution_lineage_sha256,
      "execution_lineage_sha256", "lineage 根不匹配");
  }
}

function legacyIntent(value: RequestIntentV3): RequestIntentV1 {
  const output = Object.fromEntries(LEGACY_INTENT_KEYS.map((key) => [key, value[key]])) as unknown as RequestIntentV1;
  output.schema_version = "oracle-gate-request-intent-v2";
  output.intent_sha256 = "0".repeat(64);
  output.intent_sha256 = hashRequestIntent(output);
  return output;
}

function legacyAttempt(value: RequestAttemptAuditV5): RequestAttemptAuditV4 {
  const output = Object.fromEntries(LEGACY_ATTEMPT_KEYS.map((key) => [key, value[key]])) as unknown as RequestAttemptAuditV4;
  output.schema_version = "oracle-gate-request-attempt-audit-v4";
  output.intent_sha256 = "0".repeat(64);
  output.attempt_sha256 = "0".repeat(64);
  output.attempt_sha256 = hashRequestAttemptAudit(output);
  return output;
}

function legacyCommit(value: CommittedRequestV4): CommittedRequestV3 {
  const output = Object.fromEntries(LEGACY_COMMIT_KEYS.map((key) => [key, value[key]])) as unknown as CommittedRequestV3;
  output.schema_version = "oracle-gate-committed-request-v3";
  output.intent_sha256 = "0".repeat(64);
  output.attempt_sha256 = "0".repeat(64);
  output.committed_request_sha256 = "0".repeat(64);
  output.committed_request_sha256 = hashCommittedRequest(output);
  return output;
}

export function hashRequestIntentV3(input: RequestIntentV3): string {
  return domainHash(FORMAL_ORACLE_REQUEST_INTENT_V3_DOMAIN, input, "intent_sha256");
}

export function hashRequestAttemptAuditV5(input: RequestAttemptAuditV5): string {
  return domainHash(FORMAL_ORACLE_REQUEST_ATTEMPT_AUDIT_V5_DOMAIN, input, "attempt_sha256");
}

export function hashCommittedRequestV4(input: CommittedRequestV4): string {
  return domainHash(FORMAL_ORACLE_COMMITTED_REQUEST_V4_DOMAIN, input, "committed_request_sha256");
}

export function hashFormalOracleTerminalReasonV2(input: FormalOracleTerminalReasonV2): string {
  return domainHash(FORMAL_ORACLE_TERMINAL_REASON_V2_DOMAIN, input, "terminal_reason_sha256");
}

export function validateRequestIntentV3(input: unknown): FormalOracleExecutionRecordValidationReport {
  try { input = snapshot(input); } catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: FormalOracleExecutionRecordValidationIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须是 plain object" }]);
  issue(issues, exact(input, ["schema_version","intent_sha256",...ROOT_KEYS,...LEGACY_INTENT_KEYS.filter((key) => key !== "run_sha256")]), "$", "字段集合无效");
  issue(issues, input.schema_version === "oracle-gate-request-intent-v3", "schema_version", "版本无效");
  validateRoots(input, issues);
  if (issues.length === 0) {
    const value = input as unknown as RequestIntentV3;
    push(issues, "payload", validateRequestIntent(legacyIntent(value)));
    issue(issues, hashRequestIntentV3(value) === value.intent_sha256, "intent_sha256", "正文哈希不匹配");
  }
  return report(issues);
}

export function validateRequestAttemptAuditV5(input: unknown): FormalOracleExecutionRecordValidationReport {
  try { input = snapshot(input); } catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: FormalOracleExecutionRecordValidationIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须是 plain object" }]);
  issue(issues, exact(input, ["schema_version","attempt_sha256","intent_schema_version","intent_sha256",...ROOT_KEYS,...LEGACY_ATTEMPT_KEYS.filter((key) => key !== "run_sha256")]), "$", "字段集合无效");
  issue(issues, input.schema_version === "oracle-gate-request-attempt-audit-v5" && input.intent_schema_version === "oracle-gate-request-intent-v3", "schema_version", "版本无效");
  issue(issues, SHA.test(String(input.intent_sha256)), "intent_sha256", "SHA 无效");
  validateRoots(input, issues);
  if (issues.length === 0) {
    const value = input as unknown as RequestAttemptAuditV5;
    push(issues, "payload", validateRequestAttemptAudit(legacyAttempt(value)));
    issue(issues, hashRequestAttemptAuditV5(value) === value.attempt_sha256, "attempt_sha256", "正文哈希不匹配");
  }
  return report(issues);
}

export function validateCommittedRequestV4(input: unknown): FormalOracleExecutionRecordValidationReport {
  try { input = snapshot(input); } catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: FormalOracleExecutionRecordValidationIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须是 plain object" }]);
  issue(issues, exact(input, ["schema_version","committed_request_sha256","intent_schema_version","intent_sha256","attempt_schema_version","attempt_sha256",...ROOT_KEYS,...LEGACY_COMMIT_KEYS.filter((key) => key !== "run_sha256")]), "$", "字段集合无效");
  issue(issues, input.schema_version === "oracle-gate-committed-request-v4" && input.intent_schema_version === "oracle-gate-request-intent-v3" && input.attempt_schema_version === "oracle-gate-request-attempt-audit-v5", "schema_version", "版本无效");
  issue(issues, SHA.test(String(input.intent_sha256)) && SHA.test(String(input.attempt_sha256)), "provenance", "intent/attempt SHA 无效");
  validateRoots(input, issues);
  if (issues.length === 0) {
    const value = input as unknown as CommittedRequestV4;
    push(issues, "payload", validateCommittedRequest(legacyCommit(value)));
    issue(issues, hashCommittedRequestV4(value) === value.committed_request_sha256, "committed_request_sha256", "正文哈希不匹配");
  }
  return report(issues);
}

export function validateFormalOracleTerminalReasonV2(input: unknown): FormalOracleExecutionRecordValidationReport {
  try { input = snapshot(input); } catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: FormalOracleExecutionRecordValidationIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须是 plain object" }]);
  issue(issues, exact(input, ["schema_version","terminal_reason_sha256",...ROOT_KEYS,"request_id","reason_code","source_attempt_schema_version","source_attempt_sha256","detail_sha256","created_at"]), "$", "字段集合无效");
  issue(issues, input.schema_version === "formal-oracle-terminal-reason-v2" && input.source_attempt_schema_version === "oracle-gate-request-attempt-audit-v5", "schema_version", "版本无效");
  issue(issues, ID.test(String(input.request_id)) && ["ambiguous_unknown_attempt","invalid_response_received","attempt_budget_exhausted"].includes(String(input.reason_code)), "reason", "request/reason 无效");
  issue(issues, SHA.test(String(input.terminal_reason_sha256)) && SHA.test(String(input.source_attempt_sha256)) && SHA.test(String(input.detail_sha256)), "hashes", "SHA 无效");
  issue(issues, canonicalTime(input.created_at), "created_at", "时间无效");
  validateRoots(input, issues);
  if (issues.length === 0) issue(issues, hashFormalOracleTerminalReasonV2(input as unknown as FormalOracleTerminalReasonV2) === input.terminal_reason_sha256, "terminal_reason_sha256", "正文哈希不匹配");
  return report(issues);
}

export function validateRequestAttemptAuditV5AgainstIntentV3(intentInput: unknown, auditInput: unknown): FormalOracleExecutionRecordValidationReport {
  let intent: unknown, audit: unknown;
  try { intent = snapshot(intentInput); audit = snapshot(auditInput); } catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: FormalOracleExecutionRecordValidationIssue[] = [];
  push(issues, "intent", validateRequestIntentV3(intent)); push(issues, "audit", validateRequestAttemptAuditV5(audit));
  if (issues.length) return report(issues);
  const I = intent as RequestIntentV3, A = audit as RequestAttemptAuditV5;
  for (const field of ["run_sha256","preregistration_bundle_sha256","schedule_sha256","execution_plan_sha256","genesis_checkpoint_sha256","execution_lineage_sha256","execution_record_version"] as const) issue(issues, A[field] === I[field], field, "intent/audit lineage 漂移");
  issue(issues, A.intent_sha256 === I.intent_sha256 && A.request_id === I.request_id && A.idempotency_key === I.idempotency_key && A.attempt_ordinal === I.attempt_ordinal, "identity", "intent/audit identity 漂移");
  for (const field of ["request_envelope_sha256","request_envelope_object_uri","provider_body_sha256","provider_body_object_uri","model","transport","temperature","max_input_tokens","max_output_tokens","timeout_ms","seed","cache_retention","tools_policy"] as const) issue(issues, stable(A[field]) === stable(I[field]), field, "intent/audit request 字段漂移");
  issue(issues, stable(A.submitted_visuals) === stable(I.visuals), "submitted_visuals", "visuals 漂移");
  return report(issues);
}

export function validateCommittedRequestV4AgainstAttemptV5(
  intentInput: unknown,
  auditInput: unknown,
  committedInput: unknown,
): FormalOracleExecutionRecordValidationReport {
  let intent: unknown, audit: unknown, committed: unknown;
  try { intent = snapshot(intentInput); audit = snapshot(auditInput); committed = snapshot(committedInput); } catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: FormalOracleExecutionRecordValidationIssue[] = [];
  push(issues, "intent-audit", validateRequestAttemptAuditV5AgainstIntentV3(intent, audit));
  push(issues, "committed", validateCommittedRequestV4(committed));
  if (issues.length) return report(issues);
  const I = intent as RequestIntentV3, A = audit as RequestAttemptAuditV5, C = committed as CommittedRequestV4;
  for (const field of ["run_sha256","preregistration_bundle_sha256","schedule_sha256","execution_plan_sha256","genesis_checkpoint_sha256","execution_lineage_sha256","execution_record_version"] as const) issue(issues, C[field] === A[field], field, "attempt/commit lineage 漂移");
  issue(issues, C.intent_sha256 === I.intent_sha256 && C.attempt_sha256 === A.attempt_sha256 && C.request_id === A.request_id && C.idempotency_key === A.idempotency_key && C.attempt_ordinal === A.attempt_ordinal, "identity", "commit provenance 漂移");
  issue(issues, A.outcome === "result_received" && A.stop_reason === "stop" && C.canonical_response_object_uri === A.canonical_response_object_uri && C.canonical_response_bytes_sha256 === A.canonical_response_bytes_sha256 && C.canonical_response_commitment_sha256 === A.canonical_response_commitment_sha256, "response", "commit 未绑定 strict result A-D");
  return report(issues);
}
