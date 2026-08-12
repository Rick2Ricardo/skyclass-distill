import { createHash } from "node:crypto";
import type { OracleGateFormalSpec } from "../../contracts/src/oracle-gate-formal.js";
import {
  canonicalOracleGateFormalSpecPayload,
  validateOracleGateFormalSpec,
} from "../../contracts/src/oracle-gate-formal.js";
import {
  ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  ORACLE_GATE_RESPONSE_VALIDATOR_VERSION,
  canonicalOracleGateResponseBytes,
  parseOracleGateResponseBytes,
  validateOracleGateResponse,
} from "../../contracts/src/oracle-gate-response.js";
import type {
  FormalRunContractV1,
  CommittedRequestV1,
  OracleGateCheckpointCountsV1,
  OracleGateCheckpointEntryV1,
  OracleGateRunArm,
  OracleGateRunVisualV1,
  RequestAttemptAuditV1,
  RequestIntentV1,
  RunCheckpointV1,
} from "../../contracts/src/oracle-gate-run.js";
import {
  assertFormalOraclePiRequestArtifact,
  parseFormalOraclePiRequestEnvelopeBytes,
  type FormalOraclePiRequestArtifact,
  type FormalOraclePiRequestEnvelopeV1,
} from "../../contracts/src/oracle-gate-request.js";
import {
  FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
  FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
  FORMAL_ORACLE_PROVIDER_TOKEN_FIELD,
  assertFormalOraclePreparedProviderRequestArtifact,
  parseFormalOraclePreparedProviderRequestBytes,
  type FormalOraclePreparedProviderRequestArtifactV1,
} from "../../contracts/src/oracle-gate-provider-request.js";
import {
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
  FORMAL_ORACLE_USER_PROMPT_VERSION,
  parseFormalOracleUserPromptBytes,
} from "../../contracts/src/oracle-gate-user-prompt.js";
import {
  hashFormalRunContract,
  hashCommittedRequest,
  hashPublicBlindResponse,
  hashRequestAttemptAudit,
  hashRequestIntent,
  hashRunCheckpoint,
  validateFormalRunContract,
  validateCommittedRequestAgainstAttempt,
  validateRequestAttemptAgainstIntent,
  validateRequestIntent,
  validateRunCheckpoint,
  validateRunCheckpointTransition,
} from "../../contracts/src/oracle-gate-run.js";
import {
  assertPrivateSha256,
  privateCanonicalJsonBytes,
  PrivateContentAddressedFs,
  type PrivateContentAddressedFsOptions,
} from "./privateContentAddressedFs.js";

const DEFAULT_RUN_STORE_URI = "board2skill/formal-oracle/run-store";

interface FormalOracleRunHeadV1 {
  schema_version: "formal-oracle-run-head-v1";
  run_sha256: string;
  generation: number;
  checkpoint_sha256: string;
  updated_at: string;
  api_execution_allowed: false;
}

export interface FormalOracleHeadPinV1 {
  schema_version: "formal-oracle-head-pin-v1";
  run_sha256: string;
  generation: number;
  checkpoint_sha256: string;
}

export interface FormalOracleStructuralScheduleItemV1 {
  request_id: string;
  idempotency_key: string;
  case_id: string;
  package_id: string;
  group_id: string;
  source_video_id: string;
  arm: OracleGateRunArm;
  seed: number;
}

export type FormalOracleStructuralScheduleV1 = FormalOracleStructuralScheduleItemV1[];

export interface FormalOracleExecutionPlanItemV1 {
  request_id: string;
  idempotency_key: string;
  schedule_index: number;
  case_id: string;
  arm: OracleGateRunArm;
  seed: number;
  model: string;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  provider_body_profile: typeof FORMAL_ORACLE_PROVIDER_BODY_PROFILE;
  provider_body_dispatch_status: "not_dispatchable_transport_mismatch";
  prepared_adapter_version: typeof FORMAL_ORACLE_PREPARED_ADAPTER_VERSION;
  provider_token_field: typeof FORMAL_ORACLE_PROVIDER_TOKEN_FIELD;
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

export interface FormalOracleExecutionPlanV1 {
  schema_version: "formal-oracle-execution-plan-v2";
  execution_plan_sha256: string;
  items: FormalOracleExecutionPlanItemV1[];
}

export interface FormalOracleRunStoreOptions extends PrivateContentAddressedFsOptions {
  run_store_uri?: string;
}

export interface CreateSealedRunInput {
  run: FormalRunContractV1;
  formal_spec: OracleGateFormalSpec;
  structural_schedule: FormalOracleStructuralScheduleV1;
  execution_plan: FormalOracleExecutionPlanV1;
  initial_checkpoint: RunCheckpointV1;
}

export interface CommitDispatchIntentInput {
  run_sha256: string;
  expected_head: FormalOracleHeadPinV1;
  expected_checkpoint_sha256: string;
  intent: RequestIntentV1;
  request_envelope: FormalOraclePiRequestArtifact;
  prepared_provider_request: FormalOraclePreparedProviderRequestArtifactV1;
  created_at: string;
}

export interface CommitAttemptAuditInput {
  run_sha256: string;
  expected_head: FormalOracleHeadPinV1;
  expected_checkpoint_sha256: string;
  audit: RequestAttemptAuditV1;
  response_bytes?: Uint8Array;
  parsed_response?: Record<string, unknown>;
  created_at: string;
}

export interface MarkRetryReadyInput {
  run_sha256: string;
  expected_head: FormalOracleHeadPinV1;
  expected_checkpoint_sha256: string;
  request_id: string;
  created_at: string;
}

export interface CommitSchemaValidatedRequestInput {
  run_sha256: string;
  expected_head: FormalOracleHeadPinV1;
  expected_checkpoint_sha256: string;
  committed_request: CommittedRequestV1;
  created_at: string;
}

export interface FailRunRequestInput {
  run_sha256: string;
  expected_head: FormalOracleHeadPinV1;
  expected_checkpoint_sha256: string;
  request_id: string;
  created_at: string;
}

export interface CompleteRunInput {
  run_sha256: string;
  expected_head: FormalOracleHeadPinV1;
  expected_checkpoint_sha256: string;
  created_at: string;
}

export type FormalOracleTerminalReasonCode =
  | "ambiguous_unknown_attempt"
  | "provider_length"
  | "provider_error"
  | "attempt_budget_exhausted";

export interface FormalOracleTerminalReasonV1 {
  schema_version: "formal-oracle-terminal-reason-v1";
  terminal_reason_sha256: string;
  run_sha256: string;
  request_id: string;
  reason_code: FormalOracleTerminalReasonCode;
  source_attempt_sha256: string;
  detail_sha256: string;
  created_at: string;
  api_execution_allowed: false;
}

export interface FormalOracleRunSnapshot {
  run: FormalRunContractV1;
  formal_spec: OracleGateFormalSpec;
  structural_schedule: FormalOracleStructuralScheduleV1;
  execution_plan: FormalOracleExecutionPlanV1;
  head: Readonly<FormalOracleRunHeadV1>;
  head_pin: Readonly<FormalOracleHeadPinV1>;
  checkpoint: RunCheckpointV1;
  checkpoints: RunCheckpointV1[];
  api_execution_allowed: false;
}

export interface FormalOracleResumeRequest {
  request_id: string;
  state: OracleGateCheckpointEntryV1["state"];
  resume_action: OracleGateCheckpointEntryV1["resume_action"];
}

export interface FormalOracleResumePlan {
  run_sha256: string;
  checkpoint_sha256: string;
  generation: number;
  run_state: RunCheckpointV1["run_state"];
  blocked_ambiguous: boolean;
  requests: FormalOracleResumeRequest[];
  api_execution_allowed: false;
}

const EXECUTION_PLAN_DOMAIN = "skyclass/formal-oracle/execution-plan/v2\0";
const TERMINAL_REASON_DOMAIN = "skyclass/formal-oracle/terminal-reason/v1\0";
const ARMS = new Set<OracleGateRunArm>(["transcript_only", "static_final_board", "uniform_frame", "oracle_delta"]);

/**
 * A HEAD pin is an external monotonicity input, not an authorization to execute.
 * A local same-UID actor can delete and restore old bytes, so production callers
 * must retain the newest pin in a separate monotonic/WORM system. Every API in
 * this slice still returns api_execution_allowed=false.
 */
export function hashFormalOracleStructuralSchedule(schedule: FormalOracleStructuralScheduleV1): string {
  const canonical = schedule.map((item) => ({
    request_id: item.request_id,
    idempotency_key: item.idempotency_key,
    case_id: item.case_id,
    package_id: item.package_id,
    group_id: item.group_id,
    source_video_id: item.source_video_id,
    arm: item.arm,
    seed: item.seed,
  }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function canonicalFormalOracleExecutionPlanPayload(plan: FormalOracleExecutionPlanV1): string {
  const payload = { schema_version: plan.schema_version, items: plan.items };
  return privateCanonicalJsonBytes(payload).toString("utf8").slice(0, -1);
}

export function hashFormalOracleExecutionPlan(plan: FormalOracleExecutionPlanV1): string {
  return createHash("sha256").update(EXECUTION_PLAN_DOMAIN).update(canonicalFormalOracleExecutionPlanPayload(plan)).digest("hex");
}

export function canonicalFormalOracleTerminalReasonPayload(reason: FormalOracleTerminalReasonV1): string {
  const { terminal_reason_sha256: _hash, ...payload } = reason;
  return privateCanonicalJsonBytes(payload).toString("utf8").slice(0, -1);
}

export function hashFormalOracleTerminalReason(reason: FormalOracleTerminalReasonV1): string {
  return createHash("sha256").update(TERMINAL_REASON_DOMAIN).update(canonicalFormalOracleTerminalReasonPayload(reason)).digest("hex");
}

function validationError(label: string, report: { valid: boolean; issues: Array<{ path: string; message: string }> }): void {
  if (!report.valid) throw new Error(`${label} 无效：${report.issues[0]?.path} ${report.issues[0]?.message}`);
}

function canonicalTime(value: string, label: string): void {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${label} 必须是 canonical ISO 时间`);
  }
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function parseCanonicalDocument<T>(bytes: Buffer, label: string): T {
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error(`${label} 不是 JSON`); }
  if (!privateCanonicalJsonBytes(value).equals(bytes)) throw new Error(`${label} 不是 canonical JSON 字节`);
  return value as T;
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

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && Object.keys(value).length === value.length
    && Object.keys(value).every((key, index) => key === String(index));
}

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value);
}

function isSafeUri(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
  let decoded = value;
  let stable = false;
  try {
    for (let index = 0; index < 16; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) { stable = true; break; }
      decoded = next;
    }
  } catch { return false; }
  return stable && Boolean(decoded) && !decoded.includes("\\") && !decoded.includes("\0") && !decoded.startsWith("/")
    && !/^[a-z][a-z0-9+.-]*:/i.test(decoded)
    && decoded.split("/").every((part) => Boolean(part) && part !== "." && part !== "..");
}

function assertStrictFormalSpec(spec: OracleGateFormalSpec, run: FormalRunContractV1): void {
  validationError("Formal spec", validateOracleGateFormalSpec(spec));
  if (!exactKeys(spec as unknown as Record<string, unknown>, [
    "schema_version", "spec_sha256", "input_manifest_sha256", "signed_gold_dataset_sha256", "code_revision",
    "model", "transport", "cache_retention", "tools_policy", "temperature", "seeds", "prompt", "budget", "evaluation",
  ]) || !exactKeys(spec.prompt as unknown as Record<string, unknown>, ["version", "system_sha256", "user_template_sha256", "output_schema_sha256"])
    || !exactKeys(spec.budget as unknown as Record<string, unknown>, ["max_input_tokens", "max_output_tokens", "visual_items_per_visual_arm", "canvas", "timeout_ms", "max_attempts"])
    || !exactKeys(spec.budget.canvas as unknown as Record<string, unknown>, ["mime_type", "width", "height", "quality"])
    || !exactKeys(spec.evaluation as unknown as Record<string, unknown>, [
      "rubric_version", "rubric_sha256", "rating_schema_version", "independent_raters", "primary_ci", "descriptive_ci",
      "bootstrap_seed", "strongest_non_oracle_rule", "missing_request_policy",
    ]) || !isDenseArray(spec.seeds)) {
    throw new Error("Formal spec 必须使用 strict 字段集合与稠密 seeds");
  }
  const actualHash = digest(Buffer.from(canonicalOracleGateFormalSpecPayload(spec), "utf8"));
  if (actualHash !== spec.spec_sha256 || actualHash !== run.formal_spec_sha256) {
    throw new Error("Formal spec canonical hash 未绑定 run.formal_spec_sha256");
  }
  if (spec.input_manifest_sha256 !== run.formal_input_manifest_sha256
    || spec.signed_gold_dataset_sha256 !== run.signed_gold_dataset_sha256
    || spec.code_revision !== run.code_revision) {
    throw new Error("Formal spec 未绑定 run 的 input/gold/code revision");
  }
  if (spec.prompt.output_schema_sha256 !== ORACLE_GATE_RESPONSE_SCHEMA_SHA256) {
    throw new Error("Formal spec output_schema_sha256 未绑定共享 Oracle Gate response schema");
  }
  if (spec.prompt.version !== FORMAL_ORACLE_USER_PROMPT_VERSION
    || spec.prompt.user_template_sha256 !== FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256) {
    throw new Error("Formal spec prompt 未绑定 shared deterministic user prompt renderer/template");
  }
}

function assertScheduleVisual(raw: OracleGateRunVisualV1, label: string, spec: OracleGateFormalSpec): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)
    || !exactKeys(raw as unknown as Record<string, unknown>, ["label", "object_uri", "sha256", "mime_type", "width", "height", "byte_length"])
    || raw.label !== "visual-1" || !isSafeUri(raw.object_uri) || !/^[a-f0-9]{64}$/.test(raw.sha256)
    || raw.mime_type !== spec.budget.canvas.mime_type || raw.width !== spec.budget.canvas.width
    || raw.height !== spec.budget.canvas.height || !Number.isSafeInteger(raw.byte_length) || raw.byte_length < 1) {
    throw new Error(`${label} 未匹配 frozen visual reference/canvas budget`);
  }
}

function assertStructuralSchedule(
  schedule: FormalOracleStructuralScheduleV1,
  spec: OracleGateFormalSpec,
  run: FormalRunContractV1,
): void {
  if (!isDenseArray(schedule) || schedule.length !== run.request_count) {
    throw new Error("Structural schedule 必须是与 run.request_count 一致的稠密数组");
  }
  const requestIds = new Set<string>();
  const idempotencyKeys = new Set<string>();
  const identities = new Set<string>();
  const caseMetadata = new Map<string, string>();
  for (const [index, raw] of schedule.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || !exactKeys(raw as unknown as Record<string, unknown>, [
        "request_id", "idempotency_key", "case_id", "package_id", "group_id", "source_video_id", "arm", "seed",
      ]) || !isId(raw.request_id) || !/^[a-f0-9]{64}$/.test(raw.idempotency_key)
      || !isId(raw.case_id) || !isId(raw.package_id) || !isId(raw.group_id) || !isId(raw.source_video_id)
      || !ARMS.has(raw.arm) || !Number.isSafeInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xffff_ffff
      || !spec.seeds.includes(raw.seed)) {
      throw new Error(`Structural schedule item ${index} identity 无效`);
    }
    if (requestIds.has(raw.request_id) || idempotencyKeys.has(raw.idempotency_key)) throw new Error("Structural schedule request/idempotency 必须唯一");
    requestIds.add(raw.request_id);
    idempotencyKeys.add(raw.idempotency_key);
    const identity = `${raw.case_id}\0${raw.arm}\0${raw.seed}`;
    if (identities.has(identity)) throw new Error("Structural schedule case/arm/seed identity 必须唯一");
    identities.add(identity);
    const metadata = `${raw.package_id}\0${raw.group_id}\0${raw.source_video_id}`;
    const priorMetadata = caseMetadata.get(raw.case_id);
    if (priorMetadata !== undefined && priorMetadata !== metadata) throw new Error("Structural schedule 同一 case 的来源 metadata 漂移");
    caseMetadata.set(raw.case_id, metadata);
  }
  const expectedCount = caseMetadata.size * ARMS.size * spec.seeds.length;
  if (schedule.length !== expectedCount) {
    throw new Error("Structural schedule 必须让每个 case 精确覆盖 4 arms × formal spec 全部 seeds");
  }
  for (const caseId of caseMetadata.keys()) {
    for (const arm of ARMS) {
      for (const seed of spec.seeds) {
        if (!identities.has(`${caseId}\0${arm}\0${seed}`)) {
          throw new Error(`Structural schedule 缺少完整矩阵 identity：${caseId}/${arm}/${seed}`);
        }
      }
    }
  }
  if (hashFormalOracleStructuralSchedule(schedule) !== run.schedule_sha256) {
    throw new Error("Structural schedule hash 未绑定 run.schedule_sha256");
  }
}

function assertExecutionPlan(
  plan: FormalOracleExecutionPlanV1,
  schedule: FormalOracleStructuralScheduleV1,
  spec: OracleGateFormalSpec,
  run: FormalRunContractV1,
): void {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)
    || !exactKeys(plan as unknown as Record<string, unknown>, ["schema_version", "execution_plan_sha256", "items"])
    || plan.schema_version !== "formal-oracle-execution-plan-v2" || !/^[a-f0-9]{64}$/.test(plan.execution_plan_sha256)
    || !isDenseArray(plan.items) || plan.items.length !== schedule.length) {
    throw new Error("Execution plan schema/count 无效");
  }
  for (const [index, raw] of plan.items.entries()) {
    const scheduled = schedule[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || !exactKeys(raw as unknown as Record<string, unknown>, [
        "request_id", "idempotency_key", "schedule_index", "case_id", "arm", "seed", "model", "system_prompt_sha256",
        "request_envelope_sha256", "provider_body_sha256", "provider_body_profile", "provider_body_dispatch_status", "prepared_adapter_version", "provider_token_field",
        "user_prompt_sha256", "output_schema_sha256", "visuals", "transport", "temperature", "max_input_tokens",
        "max_output_tokens", "timeout_ms", "max_attempts", "cache_retention", "tools_policy",
      ]) || raw.request_id !== scheduled.request_id || raw.idempotency_key !== scheduled.idempotency_key
      || raw.schedule_index !== index || raw.case_id !== scheduled.case_id || raw.arm !== scheduled.arm || raw.seed !== scheduled.seed
      || raw.model !== spec.model || !/^[a-f0-9]{64}$/.test(raw.request_envelope_sha256) || !/^[a-f0-9]{64}$/.test(raw.provider_body_sha256)
      || raw.provider_body_profile !== FORMAL_ORACLE_PROVIDER_BODY_PROFILE
      || raw.provider_body_dispatch_status !== "not_dispatchable_transport_mismatch"
      || raw.prepared_adapter_version !== FORMAL_ORACLE_PREPARED_ADAPTER_VERSION
      || raw.provider_token_field !== FORMAL_ORACLE_PROVIDER_TOKEN_FIELD
      || raw.system_prompt_sha256 !== spec.prompt.system_sha256
      || !/^[a-f0-9]{64}$/.test(raw.user_prompt_sha256) || raw.output_schema_sha256 !== spec.prompt.output_schema_sha256
      || raw.transport !== spec.transport || raw.temperature !== spec.temperature
      || raw.max_input_tokens !== spec.budget.max_input_tokens || raw.max_output_tokens !== spec.budget.max_output_tokens
      || raw.timeout_ms !== spec.budget.timeout_ms || raw.max_attempts !== spec.budget.max_attempts
      || raw.cache_retention !== spec.cache_retention || raw.tools_policy !== spec.tools_policy || !isDenseArray(raw.visuals)) {
      throw new Error(`Execution plan item ${index} 未精确绑定 structural schedule/formal spec`);
    }
    const expectedVisualCount = raw.arm === "transcript_only" ? 0 : spec.budget.visual_items_per_visual_arm;
    if (raw.visuals.length !== expectedVisualCount) throw new Error(`Execution plan item ${index} visual 数量未匹配 spec`);
    raw.visuals.forEach((visual, visualIndex) => assertScheduleVisual(visual, `execution_plan.items[${index}].visuals[${visualIndex}]`, spec));
  }
  if (hashFormalOracleExecutionPlan(plan) !== plan.execution_plan_sha256
    || plan.execution_plan_sha256 !== run.execution_plan_sha256) {
    throw new Error("Execution plan canonical hash 未绑定 run.execution_plan_sha256");
  }
}

function assertGenesisMatchesPlans(
  checkpoint: RunCheckpointV1,
  schedule: FormalOracleStructuralScheduleV1,
  plan: FormalOracleExecutionPlanV1,
): void {
  if (checkpoint.entries.length !== schedule.length || checkpoint.entries.length !== plan.items.length) {
    throw new Error("Initial checkpoint 未精确覆盖 structural schedule/execution plan");
  }
  checkpoint.entries.forEach((entry, index) => {
    const scheduled = schedule[index];
    const execution = plan.items[index];
    if (entry.request_id !== scheduled.request_id || entry.idempotency_key !== scheduled.idempotency_key
      || entry.request_id !== execution.request_id || entry.idempotency_key !== execution.idempotency_key
      || entry.max_attempts !== execution.max_attempts || entry.state !== "PENDING"
      || entry.resume_action !== "dispatch_new_attempt" || entry.attempts_used !== 0
      || entry.active_intent_sha256 !== null || entry.latest_attempt_audit_sha256 !== null
      || entry.committed_request_sha256 !== null) {
      throw new Error(`Initial checkpoint entry ${index} 未精确对应 frozen plans`);
    }
  });
}

function assertHeadPin(runSha256: string, expected: FormalOracleHeadPinV1, actual: FormalOracleRunHeadV1): void {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)
    || !exactKeys(expected as unknown as Record<string, unknown>, ["schema_version", "run_sha256", "generation", "checkpoint_sha256"])
    || expected.schema_version !== "formal-oracle-head-pin-v1" || expected.run_sha256 !== runSha256
    || !Number.isSafeInteger(expected.generation) || expected.generation < 0
    || !/^[a-f0-9]{64}$/.test(expected.checkpoint_sha256)) {
    throw new Error("expected_head pin schema 无效");
  }
  if (actual.run_sha256 !== expected.run_sha256 || actual.generation !== expected.generation
    || actual.checkpoint_sha256 !== expected.checkpoint_sha256) {
    throw new Error("HEAD pin 不匹配：检测到 stale caller 或 rollback");
  }
}

function assertIntentMatchesExecutionPlan(intent: RequestIntentV1, expected: FormalOracleExecutionPlanItemV1): void {
  if (intent.request_id !== expected.request_id || intent.idempotency_key !== expected.idempotency_key
    || intent.schedule_index !== expected.schedule_index || intent.case_id !== expected.case_id || intent.arm !== expected.arm
    || intent.seed !== expected.seed || intent.model !== expected.model
    || intent.request_envelope_sha256 !== expected.request_envelope_sha256
    || intent.provider_body_sha256 !== expected.provider_body_sha256
    || intent.provider_body_profile !== expected.provider_body_profile
    || intent.provider_body_dispatch_status !== expected.provider_body_dispatch_status
    || intent.prepared_adapter_version !== expected.prepared_adapter_version
    || intent.provider_token_field !== expected.provider_token_field
    || intent.system_prompt_sha256 !== expected.system_prompt_sha256 || intent.user_prompt_sha256 !== expected.user_prompt_sha256
    || intent.output_schema_sha256 !== expected.output_schema_sha256
    || !privateCanonicalJsonBytes(intent.visuals).equals(privateCanonicalJsonBytes(expected.visuals))
    || intent.transport !== expected.transport || intent.temperature !== expected.temperature
    || intent.max_input_tokens !== expected.max_input_tokens || intent.max_output_tokens !== expected.max_output_tokens
    || intent.timeout_ms !== expected.timeout_ms || intent.max_attempts !== expected.max_attempts
    || intent.cache_retention !== expected.cache_retention || intent.tools_policy !== expected.tools_policy) {
    throw new Error(`Request intent ${intent.request_id} 与 frozen execution plan 漂移`);
  }
}

function assertEnvelopeMatchesExecutionPlan(
  envelope: FormalOraclePiRequestEnvelopeV1,
  expected: FormalOracleExecutionPlanItemV1,
  spec: OracleGateFormalSpec,
): void {
  const parsedUser = parseFormalOracleUserPromptBytes(new TextEncoder().encode(envelope.rendered_user_prompt));
  if (envelope.request_id !== expected.request_id || envelope.schedule_index !== expected.schedule_index
    || envelope.case_id !== expected.case_id || envelope.arm !== expected.arm || envelope.model !== expected.model
    || envelope.system_prompt_sha256 !== expected.system_prompt_sha256
    || envelope.rendered_user_prompt_sha256 !== expected.user_prompt_sha256
    || envelope.user_template_sha256 !== spec.prompt.user_template_sha256
    || envelope.output_schema_sha256 !== expected.output_schema_sha256
    || envelope.seed !== expected.seed || envelope.temperature !== expected.temperature
    || envelope.max_input_tokens !== expected.max_input_tokens || envelope.max_output_tokens !== expected.max_output_tokens
    || envelope.timeout_ms !== expected.timeout_ms || envelope.max_attempts !== expected.max_attempts
    || envelope.transport !== expected.transport || envelope.cache_retention !== expected.cache_retention
    || envelope.tools_policy !== expected.tools_policy || envelope.inner_provider_retries !== 0
    || envelope.outer_retry_owner !== "formal_run_store" || envelope.provider_binding_status !== "pending_external_runtime_binding"
    || parsedUser.evidence_availability["visual-1"] !== (expected.arm !== "transcript_only")
    || envelope.visuals.length !== expected.visuals.length
    || envelope.visuals.some((visual, index) => {
      const planned = expected.visuals[index];
      return !planned || visual.label !== planned.label || visual.mime_type !== planned.mime_type
        || visual.sha256 !== planned.sha256 || visual.byte_length !== planned.byte_length;
    })) {
    throw new Error("Formal request envelope 未逐字段绑定 execution plan/formal spec");
  }
}

function terminalDetailHash(audit: RequestAttemptAuditV1): string {
  return digest(Buffer.from(privateCanonicalJsonBytes({
    attempt_sha256: audit.attempt_sha256,
    error_code: audit.error_code,
    error_message: audit.error_message,
    outcome: audit.outcome,
    stop_reason: audit.stop_reason,
  })));
}

function terminalReason(
  runSha256: string,
  requestId: string,
  audit: RequestAttemptAuditV1,
  reasonCode: FormalOracleTerminalReasonCode,
  createdAt: string,
): FormalOracleTerminalReasonV1 {
  const reason: FormalOracleTerminalReasonV1 = {
    schema_version: "formal-oracle-terminal-reason-v1",
    terminal_reason_sha256: "0".repeat(64),
    run_sha256: runSha256,
    request_id: requestId,
    reason_code: reasonCode,
    source_attempt_sha256: audit.attempt_sha256,
    detail_sha256: terminalDetailHash(audit),
    created_at: createdAt,
    api_execution_allowed: false,
  };
  reason.terminal_reason_sha256 = hashFormalOracleTerminalReason(reason);
  return reason;
}

function assertTerminalReason(reason: FormalOracleTerminalReasonV1, runSha256: string): void {
  if (!reason || typeof reason !== "object" || Array.isArray(reason)
    || !exactKeys(reason as unknown as Record<string, unknown>, [
      "schema_version", "terminal_reason_sha256", "run_sha256", "request_id", "reason_code",
      "source_attempt_sha256", "detail_sha256", "created_at", "api_execution_allowed",
    ]) || reason.schema_version !== "formal-oracle-terminal-reason-v1" || reason.run_sha256 !== runSha256
    || !isId(reason.request_id) || !["ambiguous_unknown_attempt", "provider_length", "provider_error", "attempt_budget_exhausted"].includes(reason.reason_code)
    || !/^[a-f0-9]{64}$/.test(reason.terminal_reason_sha256) || !/^[a-f0-9]{64}$/.test(reason.source_attempt_sha256)
    || !/^[a-f0-9]{64}$/.test(reason.detail_sha256) || reason.api_execution_allowed !== false) {
    throw new Error("Terminal reason schema 或根绑定无效");
  }
  canonicalTime(reason.created_at, "terminal reason created_at");
  if (hashFormalOracleTerminalReason(reason) !== reason.terminal_reason_sha256) throw new Error("Terminal reason 内容地址不匹配");
}

/**
 * This store proves private-byte integrity, the complete case × arm × seed
 * schedule matrix, and execution-plan/checkpoint bindings only. It does not
 * independently prove Gold event counts, teacher diversity, or operation
 * coverage; those remain mandatory in the later pinned-ledger-registry
 * composition gate. No method in this class authorizes API execution.
 * SCHEMA_VALIDATED_COMMITTED proves only durable transport bytes, deterministic
 * raw-to-parsed equivalence, and the frozen structural schema/arm rules.
 * EXECUTION_COMPLETE means the entire frozen request matrix reached that state;
 * neither state asserts teaching correctness or teacher-only semantic quality.
 */
export class FormalOracleRunStore {
  readonly runStoreUri: string;
  readonly privateFs: PrivateContentAddressedFs;

  constructor(readonly dataDir: string, options: FormalOracleRunStoreOptions = {}) {
    this.runStoreUri = options.run_store_uri ?? DEFAULT_RUN_STORE_URI;
    this.privateFs = new PrivateContentAddressedFs(dataDir, this.runStoreUri, options);
  }

  requestObjectUri(runSha256: string, requestEnvelopeSha256: string): string {
    assertPrivateSha256(runSha256, "run_sha256");
    assertPrivateSha256(requestEnvelopeSha256, "request_envelope_sha256");
    return `runs/${runSha256}/objects/request-envelopes/${requestEnvelopeSha256}/request-envelope.json`;
  }

  providerBodyObjectUri(runSha256: string, providerBodySha256: string): string {
    assertPrivateSha256(runSha256, "run_sha256");
    assertPrivateSha256(providerBodySha256, "provider_body_sha256");
    return `runs/${runSha256}/objects/provider-bodies/${providerBodySha256}/provider-body.json`;
  }

  responseObjectUri(runSha256: string, responseBytesSha256: string): string {
    assertPrivateSha256(runSha256, "run_sha256");
    assertPrivateSha256(responseBytesSha256, "response_bytes_sha256");
    return `runs/${runSha256}/objects/responses/${responseBytesSha256}/response.json`;
  }

  parsedResponseObjectUri(runSha256: string, parsedResponseSha256: string): string {
    assertPrivateSha256(runSha256, "run_sha256");
    assertPrivateSha256(parsedResponseSha256, "parsed_response_sha256");
    return `runs/${runSha256}/objects/parsed-responses/${parsedResponseSha256}/parsed-response.json`;
  }

  async createSealedRun(input: CreateSealedRunInput): Promise<FormalOracleRunSnapshot> {
    this.assertCreateSealedRunInput(input);
    const runSha = input.run.run_sha256;
    return this.withRunLock(runSha, () => this.createSealedRunUnlocked(input));
  }

  /**
   * Creates genesis and lends the exact generation-0 snapshot without releasing
   * the run lock in between. Used by higher composition gates after they have
   * acquired registry -> ledger locks; callers must never invert that order.
   */
  async createSealedRunWithPinnedSnapshot<T>(
    input: CreateSealedRunInput,
    expectedGenesisHead: FormalOracleHeadPinV1,
    callback: (snapshot: FormalOracleRunSnapshot) => Promise<T>,
  ): Promise<T> {
    this.assertCreateSealedRunInput(input);
    assertHeadPin(input.run.run_sha256, expectedGenesisHead, {
      schema_version: "formal-oracle-run-head-v1",
      run_sha256: input.run.run_sha256,
      generation: input.initial_checkpoint.generation,
      checkpoint_sha256: input.initial_checkpoint.checkpoint_sha256,
      updated_at: input.initial_checkpoint.created_at,
      api_execution_allowed: false,
    });
    return this.withRunLock(input.run.run_sha256, async () => callback(await this.createSealedRunUnlocked(input)));
  }

  private assertCreateSealedRunInput(input: CreateSealedRunInput): void {
    validationError("Formal run contract", validateFormalRunContract(input.run));
    validationError("Initial checkpoint", validateRunCheckpoint(input.initial_checkpoint));
    assertStrictFormalSpec(input.formal_spec, input.run);
    assertStructuralSchedule(input.structural_schedule, input.formal_spec, input.run);
    assertExecutionPlan(input.execution_plan, input.structural_schedule, input.formal_spec, input.run);
    assertGenesisMatchesPlans(input.initial_checkpoint, input.structural_schedule, input.execution_plan);
    if (input.run.run_store_uri !== this.runStoreUri) throw new Error("run_store_uri 与私有 store 根不一致");
    if (input.initial_checkpoint.generation !== 0 || input.initial_checkpoint.previous_checkpoint_sha256 !== null
      || input.initial_checkpoint.run_state !== "SEALED_READY") {
      throw new Error("createSealedRun 只接受 generation 0 SEALED_READY checkpoint");
    }
    if (input.initial_checkpoint.run_sha256 !== input.run.run_sha256
      || input.initial_checkpoint.schedule_sha256 !== input.run.schedule_sha256
      || input.initial_checkpoint.request_count !== input.run.request_count) {
      throw new Error("Initial checkpoint 未绑定 Formal run contract");
    }
  }

  private async createSealedRunUnlocked(input: CreateSealedRunInput): Promise<FormalOracleRunSnapshot> {
      const runSha = input.run.run_sha256;
      const existingHead = await this.privateFs.readOptionalFile(this.headPath(runSha));
      if (existingHead) throw new Error("run HEAD 已存在；createSealedRun 严格 create-once，后续必须使用 external pin inspect");
      await this.privateFs.ensureDirectory(this.runPath(runSha));
      await this.privateFs.publishImmutableObject(
        this.runContractDirectory(runSha),
        "run.json",
        privateCanonicalJsonBytes(input.run),
      );
      await this.privateFs.publishImmutableObject(
        this.formalSpecDirectory(runSha, input.formal_spec.spec_sha256),
        "formal-spec.json",
        privateCanonicalJsonBytes(input.formal_spec),
      );
      await this.privateFs.publishImmutableObject(
        this.structuralScheduleDirectory(runSha, input.run.schedule_sha256),
        "schedule.json",
        privateCanonicalJsonBytes(input.structural_schedule),
      );
      await this.privateFs.publishImmutableObject(
        this.executionPlanDirectory(runSha, input.execution_plan.execution_plan_sha256),
        "execution-plan.json",
        privateCanonicalJsonBytes(input.execution_plan),
      );
      await this.privateFs.publishImmutableObject(
        this.checkpointDirectory(runSha, input.initial_checkpoint.checkpoint_sha256),
        "checkpoint.json",
        privateCanonicalJsonBytes(input.initial_checkpoint),
      );
      const head = this.makeHead(input.initial_checkpoint);
      await this.privateFs.replaceFileAtomic(this.headPath(runSha), privateCanonicalJsonBytes(head));
      return this.loadRunUnlocked(runSha, this.pinFromHead(head));
  }

  async inspectRun(runSha256: string, expectedHead: FormalOracleHeadPinV1): Promise<FormalOracleRunSnapshot> {
    assertPrivateSha256(runSha256, "run_sha256");
    return this.withRunLock(runSha256, () => this.loadRunUnlocked(runSha256, expectedHead));
  }

  /**
   * Holds the run's owner-nonce cross-process lock while lending an exact pinned
   * snapshot to a controlled callback. This does not make the local HEAD
   * monotonic: callers still need an external WORM/monotonic pin authority.
   */
  async withPinnedRunSnapshot<T>(
    runSha256: string,
    expectedHead: FormalOracleHeadPinV1,
    callback: (snapshot: FormalOracleRunSnapshot) => Promise<T>,
  ): Promise<T> {
    assertPrivateSha256(runSha256, "run_sha256");
    return this.withRunLock(runSha256, async () => callback(await this.loadRunUnlocked(runSha256, expectedHead)));
  }

  async resumeRun(runSha256: string, expectedHead: FormalOracleHeadPinV1): Promise<FormalOracleResumePlan> {
    assertPrivateSha256(runSha256, "run_sha256");
    return this.withRunLock(runSha256, async () => {
      const snapshot = await this.loadRunUnlocked(runSha256, expectedHead);
      const requests = snapshot.checkpoint.entries.map((entry) => ({
        request_id: entry.request_id,
        state: entry.state,
        resume_action: entry.resume_action,
      }));
      return {
        run_sha256: snapshot.run.run_sha256,
        checkpoint_sha256: snapshot.checkpoint.checkpoint_sha256,
        generation: snapshot.checkpoint.generation,
        run_state: snapshot.checkpoint.run_state,
        blocked_ambiguous: requests.some((item) => item.state === "DISPATCH_INTENT_COMMITTED"
          || item.state === "BLOCKED_AMBIGUOUS" || item.resume_action === "block_ambiguous"),
        requests,
        api_execution_allowed: false,
      };
    });
  }

  async commitDispatchIntent(input: CommitDispatchIntentInput): Promise<FormalOracleRunSnapshot> {
    assertPrivateSha256(input.run_sha256, "run_sha256");
    assertPrivateSha256(input.expected_checkpoint_sha256, "expected_checkpoint_sha256");
    validationError("Request intent", validateRequestIntent(input.intent));
    canonicalTime(input.created_at, "created_at");
    return this.withRunLock(input.run_sha256, async () => {
      const snapshot = await this.loadRunUnlocked(input.run_sha256, input.expected_head);
      if (input.expected_head.checkpoint_sha256 !== input.expected_checkpoint_sha256) {
        throw new Error("expected_head 与 expected_checkpoint_sha256 不一致");
      }
      if (snapshot.head.checkpoint_sha256 !== input.expected_checkpoint_sha256) {
        throw new Error("HEAD CAS 失败：expected checkpoint 已过期");
      }
      const entryIndex = snapshot.checkpoint.entries.findIndex((entry) => entry.request_id === input.intent.request_id);
      if (entryIndex < 0) throw new Error("Request intent 不在 sealed checkpoint 中");
      const previousEntry = snapshot.checkpoint.entries[entryIndex];
      if (previousEntry.state === "DISPATCH_INTENT_COMMITTED" || previousEntry.resume_action === "block_ambiguous") {
        throw new Error("Request 已 durable dispatch；结果不明时不得自动 retry");
      }
      if ((previousEntry.state !== "PENDING" && previousEntry.state !== "RETRY_READY")
        || previousEntry.resume_action !== "dispatch_new_attempt" || previousEntry.attempts_used >= previousEntry.max_attempts) {
        throw new Error("只允许从 PENDING/RETRY_READY 且仍有预算时 commit dispatch intent");
      }
      if (input.intent.run_sha256 !== snapshot.run.run_sha256
        || input.intent.idempotency_key !== previousEntry.idempotency_key
        || input.intent.max_attempts !== previousEntry.max_attempts
        || input.intent.attempt_ordinal !== previousEntry.attempts_used + 1
        || input.intent.schedule_index !== entryIndex) {
        throw new Error("Request intent 未绑定当前 run/request/attempt ordinal");
      }
      assertIntentMatchesExecutionPlan(input.intent, snapshot.execution_plan.items[entryIndex]);
      if (Date.parse(input.intent.prepared_at) < Date.parse(snapshot.checkpoint.created_at)
        || Date.parse(input.intent.prepared_at) > Date.parse(input.created_at)
        || Date.parse(snapshot.checkpoint.created_at) > Date.parse(input.created_at)) {
        throw new Error("Dispatch checkpoint 时间不得早于 intent 或上一 checkpoint");
      }
      assertFormalOraclePiRequestArtifact(input.request_envelope);
      assertFormalOraclePreparedProviderRequestArtifact(input.prepared_provider_request);
      const parsedEnvelope = parseFormalOraclePiRequestEnvelopeBytes(input.request_envelope.bytes);
      if (parsedEnvelope.payload_sha256 !== input.request_envelope.payload_sha256) throw new Error("Formal request envelope branded artifact hash 漂移");
      assertEnvelopeMatchesExecutionPlan(parsedEnvelope.envelope, snapshot.execution_plan.items[entryIndex], snapshot.formal_spec);
      const prepared = parseFormalOraclePreparedProviderRequestBytes({
        request_envelope: parsedEnvelope,
        provider_body_bytes: input.prepared_provider_request.body_bytes,
      });
      const envelopeBytes = Buffer.from(parsedEnvelope.bytes);
      const bodyBytes = Buffer.from(prepared.body_bytes);
      const envelopeSha256 = digest(envelopeBytes);
      const bodySha256 = digest(bodyBytes);
      if (envelopeSha256 !== snapshot.execution_plan.items[entryIndex].request_envelope_sha256
        || envelopeSha256 !== input.intent.request_envelope_sha256
        || bodySha256 !== snapshot.execution_plan.items[entryIndex].provider_body_sha256
        || bodySha256 !== input.intent.provider_body_sha256) {
        throw new Error("request envelope/provider body bytes 与 intent/execution plan 双 SHA-256 不匹配");
      }
      const expectedEnvelopeUri = this.requestObjectUri(input.run_sha256, input.intent.request_envelope_sha256);
      const expectedBodyUri = this.providerBodyObjectUri(input.run_sha256, input.intent.provider_body_sha256);
      if (input.intent.request_envelope_object_uri !== expectedEnvelopeUri || input.intent.provider_body_object_uri !== expectedBodyUri) {
        throw new Error("request envelope/provider body URI 不属于当前私有内容地址 run");
      }

      await this.privateFs.publishImmutableObject(
        this.requestPayloadDirectory(input.run_sha256, input.intent.request_envelope_sha256),
        "request-envelope.json",
        envelopeBytes,
      );
      await this.privateFs.publishImmutableObject(
        this.providerBodyDirectory(input.run_sha256, input.intent.provider_body_sha256),
        "provider-body.json",
        bodyBytes,
      );
      await this.privateFs.publishImmutableObject(
        this.intentDirectory(input.run_sha256, input.intent.intent_sha256),
        "intent.json",
        privateCanonicalJsonBytes(input.intent),
      );

      const entries = snapshot.checkpoint.entries.map((entry, index): OracleGateCheckpointEntryV1 => index === entryIndex ? {
        ...entry,
        state: "DISPATCH_INTENT_COMMITTED",
        resume_action: "block_ambiguous",
        active_intent_sha256: input.intent.intent_sha256,
      } : { ...entry });
      const next: RunCheckpointV1 = {
        schema_version: "oracle-gate-run-checkpoint-v1",
        checkpoint_sha256: "0".repeat(64),
        run_sha256: snapshot.run.run_sha256,
        schedule_sha256: snapshot.run.schedule_sha256,
        generation: snapshot.checkpoint.generation + 1,
        previous_checkpoint_sha256: snapshot.checkpoint.checkpoint_sha256,
        created_at: input.created_at,
        run_state: "RUNNING",
        terminal_reason_sha256: null,
        request_count: snapshot.run.request_count,
        counts: checkpointCounts(entries),
        entries,
      };
      next.checkpoint_sha256 = hashRunCheckpoint(next);
      validationError("Dispatch checkpoint", validateRunCheckpoint(next));
      validationError("Dispatch checkpoint transition", validateRunCheckpointTransition(snapshot.checkpoint, next));
      await this.privateFs.publishImmutableObject(
        this.checkpointDirectory(input.run_sha256, next.checkpoint_sha256),
        "checkpoint.json",
        privateCanonicalJsonBytes(next),
      );

      // The immutable writes above may survive a crash. Only this exact CAS publishes them.
      const currentHead = await this.loadHead(input.run_sha256);
      if (currentHead.checkpoint_sha256 !== input.expected_checkpoint_sha256
        || currentHead.generation !== snapshot.head.generation) {
        throw new Error("HEAD CAS 失败：immutable objects 保留为 orphan，拒绝自动采用");
      }
      const nextHead = this.makeHead(next);
      await this.privateFs.replaceFileAtomic(this.headPath(input.run_sha256), privateCanonicalJsonBytes(nextHead));
      return this.loadRunUnlocked(input.run_sha256, this.pinFromHead(nextHead));
    });
  }

  async commitAttemptAudit(input: CommitAttemptAuditInput): Promise<FormalOracleRunSnapshot> {
    assertPrivateSha256(input.run_sha256, "run_sha256");
    assertPrivateSha256(input.expected_checkpoint_sha256, "expected_checkpoint_sha256");
    canonicalTime(input.created_at, "created_at");
    return this.withRunLock(input.run_sha256, async () => {
      const snapshot = await this.loadRunUnlocked(input.run_sha256, input.expected_head);
      this.assertExpectedCheckpoint(snapshot, input.expected_head, input.expected_checkpoint_sha256);
      const entryIndex = snapshot.checkpoint.entries.findIndex((entry) => entry.request_id === input.audit.request_id);
      if (entryIndex < 0) throw new Error("Attempt audit request 不在 frozen schedule");
      const entry = snapshot.checkpoint.entries[entryIndex];
      if (entry.state !== "DISPATCH_INTENT_COMMITTED" || !entry.active_intent_sha256) {
        throw new Error("Attempt audit 只能从 durable DISPATCH_INTENT_COMMITTED 提交");
      }
      const intent = await this.loadIntentUnlocked(snapshot.run, snapshot.formal_spec, snapshot.execution_plan, entryIndex, entry.active_intent_sha256);
      validationError("Attempt audit against intent", validateRequestAttemptAgainstIntent(intent, input.audit));
      if (input.audit.attempt_sha256 !== hashRequestAttemptAudit(input.audit)
        || input.audit.attempt_ordinal !== entry.attempts_used + 1
        || Date.parse(input.audit.started_at) < Date.parse(snapshot.checkpoint.created_at)
        || Date.parse(input.audit.finished_at) > Date.parse(input.created_at)
        || Date.parse(snapshot.checkpoint.created_at) > Date.parse(input.created_at)) {
        throw new Error("Attempt audit ordinal/time 未闭合 durable dispatch checkpoint");
      }
      const durableRequest = await this.privateFs.readFile(intent.provider_body_object_uri);
      if (digest(durableRequest) !== intent.provider_body_sha256 || input.audit.request_sha256 !== digest(durableRequest)) {
        throw new Error("Attempt audit 未绑定 durable provider body bytes");
      }

      if (input.audit.outcome === "result_received") {
        if (input.response_bytes === undefined || input.parsed_response === undefined
          || !input.parsed_response || typeof input.parsed_response !== "object" || Array.isArray(input.parsed_response)
          || input.audit.response_object_uri !== this.responseObjectUri(input.run_sha256, String(input.audit.response_bytes_sha256))
          || input.audit.parsed_response_object_uri !== this.parsedResponseObjectUri(input.run_sha256, String(input.audit.parsed_response_sha256))) {
          throw new Error("result_received 必须携带 deterministic raw/parsed response objects");
        }
        const responseBytes = Buffer.from(input.response_bytes);
        if (digest(responseBytes) !== input.audit.response_bytes_sha256) throw new Error("Raw response bytes SHA-256 不匹配 audit");
        const parsedFromRaw = parseOracleGateResponseBytes(responseBytes);
        const parsedBytes = Buffer.from(canonicalOracleGateResponseBytes(parsedFromRaw));
        if (!parsedBytes.equals(Buffer.from(canonicalOracleGateResponseBytes(input.parsed_response)))) {
          throw new Error("Parsed response 与 provider raw JSON 不一致");
        }
        if (hashPublicBlindResponse(parsedFromRaw) !== input.audit.parsed_response_sha256) {
          throw new Error("Parsed response canonical hash 不匹配 audit");
        }
        await this.privateFs.publishImmutableObject(
          this.responseDirectory(input.run_sha256, input.audit.response_bytes_sha256),
          "response.json",
          responseBytes,
        );
        await this.privateFs.publishImmutableObject(
          this.parsedResponseDirectory(input.run_sha256, input.audit.parsed_response_sha256),
          "parsed-response.json",
          parsedBytes,
        );
      } else if (input.response_bytes !== undefined || input.parsed_response !== undefined) {
        throw new Error("非 result_received attempt 不得携带 response objects");
      }

      await this.privateFs.publishImmutableObject(
        this.attemptDirectory(input.run_sha256, input.audit.attempt_sha256),
        "attempt-audit.json",
        privateCanonicalJsonBytes(input.audit),
      );
      const unknown = input.audit.outcome === "unknown";
      const reason = unknown
        ? terminalReason(input.run_sha256, input.audit.request_id, input.audit, "ambiguous_unknown_attempt", input.created_at)
        : null;
      if (reason) await this.persistTerminalReason(input.run_sha256, reason);
      const entries = snapshot.checkpoint.entries.map((prior, index): OracleGateCheckpointEntryV1 => index === entryIndex ? {
        ...prior,
        state: unknown ? "BLOCKED_AMBIGUOUS" : "RECEIPT_COMMITTED",
        resume_action: unknown ? "block_ambiguous" : "verify_receipt",
        attempts_used: prior.attempts_used + 1,
        latest_attempt_audit_sha256: input.audit.attempt_sha256,
      } : { ...prior });
      const next = this.nextCheckpoint(
        snapshot,
        entries,
        input.created_at,
        unknown ? "BLOCKED_AMBIGUOUS" : "RUNNING",
        reason?.terminal_reason_sha256 ?? null,
      );
      return this.commitCheckpointUnlocked(snapshot, next);
    });
  }

  async markRetryReady(input: MarkRetryReadyInput): Promise<FormalOracleRunSnapshot> {
    assertPrivateSha256(input.run_sha256, "run_sha256");
    assertPrivateSha256(input.expected_checkpoint_sha256, "expected_checkpoint_sha256");
    canonicalTime(input.created_at, "created_at");
    return this.withRunLock(input.run_sha256, async () => {
      const snapshot = await this.loadRunUnlocked(input.run_sha256, input.expected_head);
      this.assertExpectedCheckpoint(snapshot, input.expected_head, input.expected_checkpoint_sha256);
      const entryIndex = snapshot.checkpoint.entries.findIndex((entry) => entry.request_id === input.request_id);
      if (entryIndex < 0) throw new Error("Retry request 不在 frozen schedule");
      const entry = snapshot.checkpoint.entries[entryIndex];
      if (entry.state !== "RECEIPT_COMMITTED" || !entry.latest_attempt_audit_sha256) {
        throw new Error("markRetryReady 只允许 RECEIPT_COMMITTED");
      }
      const audit = await this.loadAttemptUnlocked(snapshot.run, snapshot.formal_spec, snapshot.execution_plan, entryIndex, entry.latest_attempt_audit_sha256);
      if (audit.outcome !== "not_sent" && audit.outcome !== "no_result_confirmed") {
        throw new Error("只有明确 not_sent/no_result_confirmed 才能评估 retry");
      }
      if (Date.parse(audit.finished_at) > Date.parse(input.created_at)
        || Date.parse(snapshot.checkpoint.created_at) > Date.parse(input.created_at)) throw new Error("Retry checkpoint 时间回退");
      const exhausted = entry.attempts_used >= entry.max_attempts;
      if (!exhausted && audit.automatic_retry_allowed !== true) throw new Error("Retry 必须由 cross-validated audit 明确允许");
      const reason = exhausted
        ? terminalReason(input.run_sha256, input.request_id, audit, "attempt_budget_exhausted", input.created_at)
        : null;
      if (reason) await this.persistTerminalReason(input.run_sha256, reason);
      const entries = snapshot.checkpoint.entries.map((prior, index): OracleGateCheckpointEntryV1 => index === entryIndex ? {
        ...prior,
        state: exhausted ? "FAILED_CLOSED" : "RETRY_READY",
        resume_action: exhausted ? "block_failed" : "dispatch_new_attempt",
      } : { ...prior });
      const next = this.nextCheckpoint(
        snapshot,
        entries,
        input.created_at,
        exhausted ? "FAILED_CLOSED" : "RUNNING",
        reason?.terminal_reason_sha256 ?? null,
      );
      return this.commitCheckpointUnlocked(snapshot, next);
    });
  }

  async commitSchemaValidatedRequest(input: CommitSchemaValidatedRequestInput): Promise<FormalOracleRunSnapshot> {
    assertPrivateSha256(input.run_sha256, "run_sha256");
    assertPrivateSha256(input.expected_checkpoint_sha256, "expected_checkpoint_sha256");
    canonicalTime(input.created_at, "created_at");
    return this.withRunLock(input.run_sha256, async () => {
      const snapshot = await this.loadRunUnlocked(input.run_sha256, input.expected_head);
      this.assertExpectedCheckpoint(snapshot, input.expected_head, input.expected_checkpoint_sha256);
      const entryIndex = snapshot.checkpoint.entries.findIndex((entry) => entry.request_id === input.committed_request.request_id);
      if (entryIndex < 0) throw new Error("Committed request 不在 frozen schedule");
      const entry = snapshot.checkpoint.entries[entryIndex];
      if (entry.state !== "RECEIPT_COMMITTED" || !entry.active_intent_sha256 || !entry.latest_attempt_audit_sha256) {
        throw new Error("commitSchemaValidatedRequest 只允许 RECEIPT_COMMITTED");
      }
      const intent = await this.loadIntentUnlocked(snapshot.run, snapshot.formal_spec, snapshot.execution_plan, entryIndex, entry.active_intent_sha256);
      const audit = await this.loadAttemptUnlocked(snapshot.run, snapshot.formal_spec, snapshot.execution_plan, entryIndex, entry.latest_attempt_audit_sha256);
      validationError("Committed request against attempt", validateCommittedRequestAgainstAttempt(intent, audit, input.committed_request));
      if (input.committed_request.committed_request_sha256 !== hashCommittedRequest(input.committed_request)
        || Date.parse(input.committed_request.transport_and_schema_verified_at) > Date.parse(input.created_at)
        || Date.parse(snapshot.checkpoint.created_at) > Date.parse(input.created_at)) {
        throw new Error("Committed request hash/time 未闭合 receipt checkpoint");
      }
      const parsed = await this.verifyResponseObjects(snapshot.run.run_sha256, audit);
      if (snapshot.formal_spec.prompt.output_schema_sha256 !== ORACLE_GATE_RESPONSE_SCHEMA_SHA256
        || snapshot.execution_plan.items[entryIndex].output_schema_sha256 !== ORACLE_GATE_RESPONSE_SCHEMA_SHA256
        || input.committed_request.validator_version !== ORACLE_GATE_RESPONSE_VALIDATOR_VERSION) {
        throw new Error("Committed request 未绑定 frozen shared response schema/validator");
      }
      validateOracleGateResponse(parsed, snapshot.execution_plan.items[entryIndex].arm);
      await this.privateFs.publishImmutableObject(
        this.committedRequestDirectory(input.run_sha256, input.committed_request.committed_request_sha256),
        "committed-request.json",
        privateCanonicalJsonBytes(input.committed_request),
      );
      const entries = snapshot.checkpoint.entries.map((prior, index): OracleGateCheckpointEntryV1 => index === entryIndex ? {
        ...prior,
        state: "SCHEMA_VALIDATED_COMMITTED",
        resume_action: "skip_schema_validated",
        committed_request_sha256: input.committed_request.committed_request_sha256,
      } : { ...prior });
      const next = this.nextCheckpoint(snapshot, entries, input.created_at, "RUNNING", null);
      return this.commitCheckpointUnlocked(snapshot, next);
    });
  }

  async failRunRequest(input: FailRunRequestInput): Promise<FormalOracleRunSnapshot> {
    assertPrivateSha256(input.run_sha256, "run_sha256");
    assertPrivateSha256(input.expected_checkpoint_sha256, "expected_checkpoint_sha256");
    canonicalTime(input.created_at, "created_at");
    return this.withRunLock(input.run_sha256, async () => {
      const snapshot = await this.loadRunUnlocked(input.run_sha256, input.expected_head);
      this.assertExpectedCheckpoint(snapshot, input.expected_head, input.expected_checkpoint_sha256);
      const entryIndex = snapshot.checkpoint.entries.findIndex((entry) => entry.request_id === input.request_id);
      if (entryIndex < 0) throw new Error("Fail request 不在 frozen schedule");
      const entry = snapshot.checkpoint.entries[entryIndex];
      if (entry.state !== "RECEIPT_COMMITTED" || !entry.latest_attempt_audit_sha256) {
        throw new Error("failRunRequest 只允许具有 durable receipt 的 request");
      }
      const audit = await this.loadAttemptUnlocked(snapshot.run, snapshot.formal_spec, snapshot.execution_plan, entryIndex, entry.latest_attempt_audit_sha256);
      let reasonCode: FormalOracleTerminalReasonCode;
      if (audit.outcome === "result_received" && audit.stop_reason === "length") reasonCode = "provider_length";
      else if (audit.outcome === "result_received" && audit.stop_reason === "error") reasonCode = "provider_error";
      else if ((audit.outcome === "not_sent" || audit.outcome === "no_result_confirmed")
        && entry.attempts_used >= entry.max_attempts) reasonCode = "attempt_budget_exhausted";
      else throw new Error("只有 length/error 或 attempt 预算耗尽可以显式 FAILED_CLOSED");
      if (Date.parse(audit.finished_at) > Date.parse(input.created_at)
        || Date.parse(snapshot.checkpoint.created_at) > Date.parse(input.created_at)) throw new Error("Failed checkpoint 时间回退");
      const reason = terminalReason(input.run_sha256, input.request_id, audit, reasonCode, input.created_at);
      await this.persistTerminalReason(input.run_sha256, reason);
      const entries = snapshot.checkpoint.entries.map((prior, index): OracleGateCheckpointEntryV1 => index === entryIndex ? {
        ...prior,
        state: "FAILED_CLOSED",
        resume_action: "block_failed",
      } : { ...prior });
      const next = this.nextCheckpoint(snapshot, entries, input.created_at, "FAILED_CLOSED", reason.terminal_reason_sha256);
      return this.commitCheckpointUnlocked(snapshot, next);
    });
  }

  async completeRun(input: CompleteRunInput): Promise<FormalOracleRunSnapshot> {
    assertPrivateSha256(input.run_sha256, "run_sha256");
    assertPrivateSha256(input.expected_checkpoint_sha256, "expected_checkpoint_sha256");
    canonicalTime(input.created_at, "created_at");
    return this.withRunLock(input.run_sha256, async () => {
      const snapshot = await this.loadRunUnlocked(input.run_sha256, input.expected_head);
      this.assertExpectedCheckpoint(snapshot, input.expected_head, input.expected_checkpoint_sha256);
      if (snapshot.checkpoint.run_state === "EXECUTION_COMPLETE") {
        throw new Error("EXECUTION_COMPLETE 是 create-once 终态，不得重复追加 checkpoint");
      }
      if (snapshot.checkpoint.entries.some((entry) => entry.state !== "SCHEMA_VALIDATED_COMMITTED")) {
        throw new Error("只有全部 requests SCHEMA_VALIDATED_COMMITTED 才能 complete run；此终态不代表语义 review 通过");
      }
      if (Date.parse(snapshot.checkpoint.created_at) > Date.parse(input.created_at)) throw new Error("Complete checkpoint 时间回退");
      const next = this.nextCheckpoint(
        snapshot,
        snapshot.checkpoint.entries.map((entry) => ({ ...entry })),
        input.created_at,
        "EXECUTION_COMPLETE",
        null,
      );
      return this.commitCheckpointUnlocked(snapshot, next);
    });
  }

  private assertExpectedCheckpoint(
    snapshot: FormalOracleRunSnapshot,
    expectedHead: FormalOracleHeadPinV1,
    expectedCheckpointSha256: string,
  ): void {
    if (expectedHead.checkpoint_sha256 !== expectedCheckpointSha256
      || snapshot.head.checkpoint_sha256 !== expectedCheckpointSha256) {
      throw new Error("expected_head/expected_checkpoint/HEAD CAS 不一致");
    }
  }

  private nextCheckpoint(
    snapshot: FormalOracleRunSnapshot,
    entries: OracleGateCheckpointEntryV1[],
    createdAt: string,
    runState: RunCheckpointV1["run_state"],
    terminalReasonSha256: string | null,
  ): RunCheckpointV1 {
    const checkpoint: RunCheckpointV1 = {
      schema_version: "oracle-gate-run-checkpoint-v1",
      checkpoint_sha256: "0".repeat(64),
      run_sha256: snapshot.run.run_sha256,
      schedule_sha256: snapshot.run.schedule_sha256,
      generation: snapshot.checkpoint.generation + 1,
      previous_checkpoint_sha256: snapshot.checkpoint.checkpoint_sha256,
      created_at: createdAt,
      run_state: runState,
      terminal_reason_sha256: terminalReasonSha256,
      request_count: snapshot.run.request_count,
      counts: checkpointCounts(entries),
      entries,
    };
    checkpoint.checkpoint_sha256 = hashRunCheckpoint(checkpoint);
    validationError("Next checkpoint", validateRunCheckpoint(checkpoint));
    validationError("Next checkpoint transition", validateRunCheckpointTransition(snapshot.checkpoint, checkpoint));
    return checkpoint;
  }

  private async commitCheckpointUnlocked(
    snapshot: FormalOracleRunSnapshot,
    next: RunCheckpointV1,
  ): Promise<FormalOracleRunSnapshot> {
    await this.privateFs.publishImmutableObject(
      this.checkpointDirectory(snapshot.run.run_sha256, next.checkpoint_sha256),
      "checkpoint.json",
      privateCanonicalJsonBytes(next),
    );
    const currentHead = await this.loadHead(snapshot.run.run_sha256);
    if (currentHead.checkpoint_sha256 !== snapshot.head.checkpoint_sha256
      || currentHead.generation !== snapshot.head.generation) {
      throw new Error("HEAD CAS 失败：immutable objects 保留为 orphan，拒绝自动采用");
    }
    const nextHead = this.makeHead(next);
    await this.privateFs.replaceFileAtomic(this.headPath(snapshot.run.run_sha256), privateCanonicalJsonBytes(nextHead));
    return this.loadRunUnlocked(snapshot.run.run_sha256, this.pinFromHead(nextHead));
  }

  private async loadIntentUnlocked(
    run: FormalRunContractV1,
    formalSpec: OracleGateFormalSpec,
    executionPlan: FormalOracleExecutionPlanV1,
    entryIndex: number,
    intentSha256: string,
  ): Promise<RequestIntentV1> {
    const bytes = await this.privateFs.readFile(this.intentPath(run.run_sha256, intentSha256));
    const intent = parseCanonicalDocument<RequestIntentV1>(bytes, "Request intent");
    validationError("Request intent", validateRequestIntent(intent));
    if (intent.intent_sha256 !== intentSha256 || hashRequestIntent(intent) !== intentSha256
      || intent.run_sha256 !== run.run_sha256 || intent.schedule_index !== entryIndex) {
      throw new Error("Request intent 内容地址或 run/schedule binding 无效");
    }
    assertIntentMatchesExecutionPlan(intent, executionPlan.items[entryIndex]);
    const request = await this.privateFs.readFile(intent.request_envelope_object_uri);
    const providerBody = await this.privateFs.readFile(intent.provider_body_object_uri);
    if (intent.request_envelope_object_uri !== this.requestObjectUri(run.run_sha256, intent.request_envelope_sha256)
      || digest(request) !== intent.request_envelope_sha256
      || intent.provider_body_object_uri !== this.providerBodyObjectUri(run.run_sha256, intent.provider_body_sha256)
      || digest(providerBody) !== intent.provider_body_sha256) throw new Error("Request intent 未绑定 durable envelope/provider body bytes");
    const parsed = parseFormalOraclePiRequestEnvelopeBytes(request);
    if (parsed.payload_sha256 !== intent.request_envelope_sha256) throw new Error("Durable request envelope content address 无效");
    const prepared = parseFormalOraclePreparedProviderRequestBytes({ request_envelope: parsed, provider_body_bytes: providerBody });
    if (prepared.provider_body_sha256 !== intent.provider_body_sha256) throw new Error("Durable provider body content address 无效");
    assertEnvelopeMatchesExecutionPlan(parsed.envelope, executionPlan.items[entryIndex], formalSpec);
    return intent;
  }

  private async loadAttemptUnlocked(
    run: FormalRunContractV1,
    formalSpec: OracleGateFormalSpec,
    executionPlan: FormalOracleExecutionPlanV1,
    entryIndex: number,
    attemptSha256: string,
  ): Promise<RequestAttemptAuditV1> {
    const bytes = await this.privateFs.readFile(this.attemptPath(run.run_sha256, attemptSha256));
    const audit = parseCanonicalDocument<RequestAttemptAuditV1>(bytes, "Attempt audit");
    if (audit.attempt_sha256 !== attemptSha256 || hashRequestAttemptAudit(audit) !== attemptSha256) {
      throw new Error("Attempt audit 内容地址无效");
    }
    const intent = await this.loadIntentUnlocked(run, formalSpec, executionPlan, entryIndex, audit.intent_sha256);
    validationError("Attempt audit against intent", validateRequestAttemptAgainstIntent(intent, audit));
    if (audit.outcome === "result_received") await this.verifyResponseObjects(run.run_sha256, audit);
    return audit;
  }

  private async loadCommittedRequestUnlocked(
    run: FormalRunContractV1,
    formalSpec: OracleGateFormalSpec,
    executionPlan: FormalOracleExecutionPlanV1,
    entryIndex: number,
    committedSha256: string,
  ): Promise<CommittedRequestV1> {
    const bytes = await this.privateFs.readFile(this.committedRequestPath(run.run_sha256, committedSha256));
    const committed = parseCanonicalDocument<CommittedRequestV1>(bytes, "Committed request");
    if (committed.committed_request_sha256 !== committedSha256 || hashCommittedRequest(committed) !== committedSha256) {
      throw new Error("Committed request 内容地址无效");
    }
    const intent = await this.loadIntentUnlocked(run, formalSpec, executionPlan, entryIndex, committed.intent_sha256);
    const audit = await this.loadAttemptUnlocked(run, formalSpec, executionPlan, entryIndex, committed.attempt_sha256);
    validationError("Committed request against attempt", validateCommittedRequestAgainstAttempt(intent, audit, committed));
    if (executionPlan.items[entryIndex].output_schema_sha256 !== ORACLE_GATE_RESPONSE_SCHEMA_SHA256
      || committed.validator_version !== ORACLE_GATE_RESPONSE_VALIDATOR_VERSION) {
      throw new Error("Durable committed request 未绑定 frozen shared response schema/validator");
    }
    const parsed = await this.verifyResponseObjects(run.run_sha256, audit);
    validateOracleGateResponse(parsed, executionPlan.items[entryIndex].arm);
    return committed;
  }

  private async verifyResponseObjects(runSha256: string, audit: RequestAttemptAuditV1): Promise<Record<string, unknown>> {
    if (audit.outcome !== "result_received" || !audit.response_bytes_sha256 || !audit.parsed_response_sha256
      || audit.response_object_uri !== this.responseObjectUri(runSha256, audit.response_bytes_sha256)
      || audit.parsed_response_object_uri !== this.parsedResponseObjectUri(runSha256, audit.parsed_response_sha256)) {
      throw new Error("Result audit response refs 无效");
    }
    const raw = await this.privateFs.readFile(audit.response_object_uri);
    if (digest(raw) !== audit.response_bytes_sha256) throw new Error("Durable raw response hash 无效");
    const parsedFromRaw = parseOracleGateResponseBytes(raw);
    const parsedBytes = await this.privateFs.readFile(audit.parsed_response_object_uri);
    const parsed = parseOracleGateResponseBytes(parsedBytes);
    const canonicalFromRaw = Buffer.from(canonicalOracleGateResponseBytes(parsedFromRaw));
    if (!canonicalFromRaw.equals(parsedBytes)
      || !canonicalFromRaw.equals(Buffer.from(canonicalOracleGateResponseBytes(parsed)))
      || hashPublicBlindResponse(parsed) !== audit.parsed_response_sha256) {
      throw new Error("Durable parsed response hash 无效");
    }
    return parsed;
  }

  private async persistTerminalReason(runSha256: string, reason: FormalOracleTerminalReasonV1): Promise<void> {
    assertTerminalReason(reason, runSha256);
    await this.privateFs.publishImmutableObject(
      this.terminalReasonDirectory(runSha256, reason.terminal_reason_sha256),
      "terminal-reason.json",
      privateCanonicalJsonBytes(reason),
    );
  }

  private async loadTerminalReason(runSha256: string, reasonSha256: string): Promise<FormalOracleTerminalReasonV1> {
    const bytes = await this.privateFs.readFile(this.terminalReasonPath(runSha256, reasonSha256));
    const reason = parseCanonicalDocument<FormalOracleTerminalReasonV1>(bytes, "Terminal reason");
    assertTerminalReason(reason, runSha256);
    if (reason.terminal_reason_sha256 !== reasonSha256) throw new Error("Terminal reason path hash 不匹配");
    return reason;
  }

  private async loadRunUnlocked(runSha256: string, expectedHead: FormalOracleHeadPinV1): Promise<FormalOracleRunSnapshot> {
    const head = await this.loadHead(runSha256);
    assertHeadPin(runSha256, expectedHead, head);
    const runBytes = await this.privateFs.readFile(this.runContractPath(runSha256));
    const run = parseCanonicalDocument<FormalRunContractV1>(runBytes, "Formal run contract");
    validationError("Formal run contract", validateFormalRunContract(run));
    if (run.run_sha256 !== runSha256 || hashFormalRunContract(run) !== runSha256 || run.run_store_uri !== this.runStoreUri
      || run.api_execution_allowed !== false) {
      throw new Error("Formal run contract 与 store 地址或安全门不匹配");
    }
    const specBytes = await this.privateFs.readFile(this.formalSpecPath(runSha256, run.formal_spec_sha256));
    const formalSpec = parseCanonicalDocument<OracleGateFormalSpec>(specBytes, "Formal spec");
    assertStrictFormalSpec(formalSpec, run);
    const scheduleBytes = await this.privateFs.readFile(this.structuralSchedulePath(runSha256, run.schedule_sha256));
    const structuralSchedule = parseCanonicalDocument<FormalOracleStructuralScheduleV1>(scheduleBytes, "Structural schedule");
    assertStructuralSchedule(structuralSchedule, formalSpec, run);
    const executionPlanBytes = await this.privateFs.readFile(this.executionPlanPath(runSha256, run.execution_plan_sha256));
    const executionPlan = parseCanonicalDocument<FormalOracleExecutionPlanV1>(executionPlanBytes, "Execution plan");
    assertExecutionPlan(executionPlan, structuralSchedule, formalSpec, run);
    const reversed: RunCheckpointV1[] = [];
    const seen = new Set<string>();
    let cursor: string | null = head.checkpoint_sha256;
    while (cursor !== null) {
      if (seen.has(cursor)) throw new Error("Checkpoint hash chain 存在循环");
      seen.add(cursor);
      const checkpointBytes = await this.privateFs.readFile(this.checkpointPath(runSha256, cursor));
      const checkpoint = parseCanonicalDocument<RunCheckpointV1>(checkpointBytes, "Run checkpoint");
      validationError("Run checkpoint", validateRunCheckpoint(checkpoint));
      if (checkpoint.checkpoint_sha256 !== cursor || hashRunCheckpoint(checkpoint) !== cursor
        || checkpoint.run_sha256 !== run.run_sha256 || checkpoint.schedule_sha256 !== run.schedule_sha256
        || checkpoint.request_count !== run.request_count) {
        throw new Error("Checkpoint 内容地址或根绑定不匹配");
      }
      reversed.push(checkpoint);
      cursor = checkpoint.previous_checkpoint_sha256;
      if (reversed.length > head.generation + 1) throw new Error("Checkpoint history 超过 HEAD generation");
    }
    const checkpoints = reversed.reverse();
    if (checkpoints.length !== head.generation + 1 || checkpoints[0]?.generation !== 0
      || checkpoints.at(-1)?.checkpoint_sha256 !== head.checkpoint_sha256
      || checkpoints.at(-1)?.generation !== head.generation
      || checkpoints.at(-1)?.created_at !== head.updated_at) {
      throw new Error("HEAD 未绑定完整连续 checkpoint 历史");
    }
    for (let index = 1; index < checkpoints.length; index += 1) {
      validationError("Checkpoint history", validateRunCheckpointTransition(checkpoints[index - 1], checkpoints[index]));
    }
    assertGenesisMatchesPlans(checkpoints[0], structuralSchedule, executionPlan);
    for (const [index, checkpoint] of checkpoints.entries()) {
      await this.validateCheckpointReferences(run, formalSpec, executionPlan, checkpoint, index > 0 ? checkpoints[index - 1] : null);
    }
    return {
      run,
      formal_spec: formalSpec,
      structural_schedule: structuralSchedule,
      execution_plan: executionPlan,
      head: Object.freeze({ ...head }),
      head_pin: Object.freeze(this.pinFromHead(head)),
      checkpoint: checkpoints.at(-1)!,
      checkpoints,
      api_execution_allowed: false,
    };
  }

  private async validateCheckpointReferences(
    run: FormalRunContractV1,
    formalSpec: OracleGateFormalSpec,
    executionPlan: FormalOracleExecutionPlanV1,
    checkpoint: RunCheckpointV1,
    previous: RunCheckpointV1 | null,
  ): Promise<void> {
    for (const [entryIndex, entry] of checkpoint.entries.entries()) {
      const activeIntent = entry.active_intent_sha256
        ? await this.loadIntentUnlocked(run, formalSpec, executionPlan, entryIndex, entry.active_intent_sha256)
        : null;
      if (activeIntent && (activeIntent.request_id !== entry.request_id || activeIntent.idempotency_key !== entry.idempotency_key
        || activeIntent.max_attempts !== entry.max_attempts || Date.parse(activeIntent.prepared_at) > Date.parse(checkpoint.created_at))) {
        throw new Error("Checkpoint active intent 未绑定 request/idempotency/time");
      }
      const audit = entry.latest_attempt_audit_sha256
        ? await this.loadAttemptUnlocked(run, formalSpec, executionPlan, entryIndex, entry.latest_attempt_audit_sha256)
        : null;
      if (audit && (audit.request_id !== entry.request_id || audit.idempotency_key !== entry.idempotency_key
        || audit.attempt_ordinal !== entry.attempts_used || Date.parse(audit.finished_at) > Date.parse(checkpoint.created_at))) {
        throw new Error("Checkpoint latest audit 未绑定 request/ordinal/time");
      }
      if (entry.state === "DISPATCH_INTENT_COMMITTED"
        && (!activeIntent || activeIntent.attempt_ordinal !== entry.attempts_used + 1)) {
        throw new Error("Dispatch checkpoint 未绑定下一 attempt ordinal 的 durable intent");
      }
      const previousEntry = previous?.entries.find((item) => item.request_id === entry.request_id);
      if (entry.state === "DISPATCH_INTENT_COMMITTED" && previousEntry
        && Date.parse(activeIntent!.prepared_at) < Date.parse(previous!.created_at)) {
        throw new Error("Dispatch intent prepared_at 不得早于其前驱 checkpoint");
      }
      if (["RECEIPT_COMMITTED", "RETRY_READY", "BLOCKED_AMBIGUOUS", "SCHEMA_VALIDATED_COMMITTED"].includes(entry.state)
        && (!activeIntent || !audit || activeIntent.intent_sha256 !== audit.intent_sha256
          || activeIntent.attempt_ordinal !== entry.attempts_used)) {
        throw new Error("Receipt-derived checkpoint 未绑定同序号 intent/audit");
      }
      if (entry.state === "RECEIPT_COMMITTED" && audit?.outcome === "unknown") {
        throw new Error("unknown audit 不得进入 RECEIPT_COMMITTED");
      }
      if ((entry.state === "RECEIPT_COMMITTED" || entry.state === "BLOCKED_AMBIGUOUS")
        && previousEntry?.state === "DISPATCH_INTENT_COMMITTED" && audit
        && Date.parse(audit.started_at) < Date.parse(previous!.created_at)) {
        throw new Error("Provider attempt 不得早于 durable dispatch checkpoint");
      }
      if (entry.state === "RETRY_READY" && audit
        && (!(audit.outcome === "not_sent" || audit.outcome === "no_result_confirmed")
          || audit.automatic_retry_allowed !== true || entry.attempts_used >= entry.max_attempts)) {
        throw new Error("RETRY_READY 未绑定可安全 retry 的明确无结果 audit");
      }
      if (entry.state === "BLOCKED_AMBIGUOUS" && audit?.outcome !== "unknown") {
        throw new Error("BLOCKED_AMBIGUOUS 未绑定 unknown audit");
      }
      if (entry.committed_request_sha256) {
        const committed = await this.loadCommittedRequestUnlocked(run, formalSpec, executionPlan, entryIndex, entry.committed_request_sha256);
        if (entry.state !== "SCHEMA_VALIDATED_COMMITTED" || committed.request_id !== entry.request_id
          || committed.attempt_sha256 !== audit?.attempt_sha256 || committed.intent_sha256 !== activeIntent?.intent_sha256
          || Date.parse(committed.transport_and_schema_verified_at) > Date.parse(checkpoint.created_at)) {
          throw new Error("SCHEMA_VALIDATED_COMMITTED provenance/time 无效");
        }
      } else if (entry.state === "SCHEMA_VALIDATED_COMMITTED") {
        throw new Error("SCHEMA_VALIDATED_COMMITTED 缺少 committed object");
      }
    }
    if (checkpoint.terminal_reason_sha256) {
      const reason = await this.loadTerminalReason(run.run_sha256, checkpoint.terminal_reason_sha256);
      const entry = checkpoint.entries.find((item) => item.request_id === reason.request_id);
      if (!entry || !entry.latest_attempt_audit_sha256 || entry.latest_attempt_audit_sha256 !== reason.source_attempt_sha256
        || !["BLOCKED_AMBIGUOUS", "FAILED_CLOSED"].includes(entry.state)
        || Date.parse(reason.created_at) > Date.parse(checkpoint.created_at)) {
        throw new Error("Terminal reason 未绑定 terminal checkpoint/request/audit");
      }
      const audit = await this.loadAttemptUnlocked(
        run,
        formalSpec,
        executionPlan,
        checkpoint.entries.findIndex((item) => item.request_id === reason.request_id),
        reason.source_attempt_sha256,
      );
      if (terminalDetailHash(audit) !== reason.detail_sha256
        || (reason.reason_code === "ambiguous_unknown_attempt" && audit.outcome !== "unknown")
        || (reason.reason_code === "provider_length" && audit.stop_reason !== "length")
        || (reason.reason_code === "provider_error" && audit.stop_reason !== "error")
        || (reason.reason_code === "attempt_budget_exhausted"
          && !((audit.outcome === "not_sent" || audit.outcome === "no_result_confirmed")
            && entry.attempts_used >= entry.max_attempts))) {
        throw new Error("Terminal reason code/detail 与 attempt provenance 不一致");
      }
    }
  }

  private async loadHead(runSha256: string): Promise<FormalOracleRunHeadV1> {
    const bytes = await this.privateFs.readFile(this.headPath(runSha256));
    const value = parseCanonicalDocument<unknown>(bytes, "Formal run HEAD");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Formal run HEAD 必须是对象");
    const head = value as Record<string, unknown>;
    if (!exactKeys(head, ["schema_version", "run_sha256", "generation", "checkpoint_sha256", "updated_at", "api_execution_allowed"])
      || head.schema_version !== "formal-oracle-run-head-v1" || head.run_sha256 !== runSha256
      || !Number.isSafeInteger(head.generation) || Number(head.generation) < 0
      || typeof head.checkpoint_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(head.checkpoint_sha256)
      || typeof head.updated_at !== "string" || head.api_execution_allowed !== false) {
      throw new Error("Formal run HEAD schema 或安全门无效");
    }
    canonicalTime(head.updated_at, "HEAD updated_at");
    return head as unknown as FormalOracleRunHeadV1;
  }

  private makeHead(checkpoint: RunCheckpointV1): FormalOracleRunHeadV1 {
    return {
      schema_version: "formal-oracle-run-head-v1",
      run_sha256: checkpoint.run_sha256,
      generation: checkpoint.generation,
      checkpoint_sha256: checkpoint.checkpoint_sha256,
      updated_at: checkpoint.created_at,
      api_execution_allowed: false,
    };
  }

  private pinFromHead(head: FormalOracleRunHeadV1): FormalOracleHeadPinV1 {
    return {
      schema_version: "formal-oracle-head-pin-v1",
      run_sha256: head.run_sha256,
      generation: head.generation,
      checkpoint_sha256: head.checkpoint_sha256,
    };
  }

  private withRunLock<T>(runSha256: string, operation: () => Promise<T>): Promise<T> {
    return this.privateFs.withExclusiveLock(`locks/${runSha256}.lock`, `run:${runSha256}`, operation);
  }

  private runPath(runSha256: string): string { return `runs/${runSha256}`; }
  private headPath(runSha256: string): string { return `${this.runPath(runSha256)}/HEAD`; }
  private runContractDirectory(runSha256: string): string { return `${this.runPath(runSha256)}/objects/run-contracts/${runSha256}`; }
  private runContractPath(runSha256: string): string { return `${this.runContractDirectory(runSha256)}/run.json`; }
  private formalSpecDirectory(runSha256: string, specSha256: string): string {
    return `${this.runPath(runSha256)}/objects/formal-specs/${specSha256}`;
  }
  private formalSpecPath(runSha256: string, specSha256: string): string {
    return `${this.formalSpecDirectory(runSha256, specSha256)}/formal-spec.json`;
  }
  private structuralScheduleDirectory(runSha256: string, scheduleSha256: string): string {
    return `${this.runPath(runSha256)}/objects/structural-schedules/${scheduleSha256}`;
  }
  private structuralSchedulePath(runSha256: string, scheduleSha256: string): string {
    return `${this.structuralScheduleDirectory(runSha256, scheduleSha256)}/schedule.json`;
  }
  private executionPlanDirectory(runSha256: string, planSha256: string): string {
    return `${this.runPath(runSha256)}/objects/execution-plans/${planSha256}`;
  }
  private executionPlanPath(runSha256: string, planSha256: string): string {
    return `${this.executionPlanDirectory(runSha256, planSha256)}/execution-plan.json`;
  }
  private checkpointDirectory(runSha256: string, checkpointSha256: string): string {
    return `${this.runPath(runSha256)}/objects/checkpoints/${checkpointSha256}`;
  }
  private checkpointPath(runSha256: string, checkpointSha256: string): string {
    return `${this.checkpointDirectory(runSha256, checkpointSha256)}/checkpoint.json`;
  }
  private intentDirectory(runSha256: string, intentSha256: string): string {
    return `${this.runPath(runSha256)}/objects/request-intents/${intentSha256}`;
  }
  private intentPath(runSha256: string, intentSha256: string): string {
    return `${this.intentDirectory(runSha256, intentSha256)}/intent.json`;
  }
  private attemptDirectory(runSha256: string, attemptSha256: string): string {
    return `${this.runPath(runSha256)}/objects/attempt-audits/${attemptSha256}`;
  }
  private attemptPath(runSha256: string, attemptSha256: string): string {
    return `${this.attemptDirectory(runSha256, attemptSha256)}/attempt-audit.json`;
  }
  private responseDirectory(runSha256: string, responseSha256: string): string {
    return `${this.runPath(runSha256)}/objects/responses/${responseSha256}`;
  }
  private parsedResponseDirectory(runSha256: string, parsedSha256: string): string {
    return `${this.runPath(runSha256)}/objects/parsed-responses/${parsedSha256}`;
  }
  private parsedResponsePath(runSha256: string, parsedSha256: string): string {
    return this.parsedResponseObjectUri(runSha256, parsedSha256);
  }
  private committedRequestDirectory(runSha256: string, committedSha256: string): string {
    return `${this.runPath(runSha256)}/objects/committed-requests/${committedSha256}`;
  }
  private committedRequestPath(runSha256: string, committedSha256: string): string {
    return `${this.committedRequestDirectory(runSha256, committedSha256)}/committed-request.json`;
  }
  private terminalReasonDirectory(runSha256: string, reasonSha256: string): string {
    return `${this.runPath(runSha256)}/objects/terminal-reasons/${reasonSha256}`;
  }
  private terminalReasonPath(runSha256: string, reasonSha256: string): string {
    return `${this.terminalReasonDirectory(runSha256, reasonSha256)}/terminal-reason.json`;
  }
  private requestPayloadDirectory(runSha256: string, payloadSha256: string): string {
    return `${this.runPath(runSha256)}/objects/request-envelopes/${payloadSha256}`;
  }
  private providerBodyDirectory(runSha256: string, providerBodySha256: string): string {
    return `${this.runPath(runSha256)}/objects/provider-bodies/${providerBodySha256}`;
  }
}
