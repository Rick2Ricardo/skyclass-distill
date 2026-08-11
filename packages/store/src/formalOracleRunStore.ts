import { createHash } from "node:crypto";
import type { OracleGateFormalSpec } from "../../contracts/src/oracle-gate-formal.js";
import {
  canonicalOracleGateFormalSpecPayload,
  validateOracleGateFormalSpec,
} from "../../contracts/src/oracle-gate-formal.js";
import type {
  FormalRunContractV1,
  OracleGateCheckpointCountsV1,
  OracleGateCheckpointEntryV1,
  OracleGateRunArm,
  OracleGateRunVisualV1,
  RequestIntentV1,
  RunCheckpointV1,
} from "../../contracts/src/oracle-gate-run.js";
import {
  hashFormalRunContract,
  hashRequestIntent,
  hashRunCheckpoint,
  validateFormalRunContract,
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
  request_payload_sha256: string;
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
  schema_version: "formal-oracle-execution-plan-v1";
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
  request_payload: Uint8Array;
  created_at: string;
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

const EXECUTION_PLAN_DOMAIN = "skyclass/formal-oracle/execution-plan/v1\0";
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
    verified_committed: entries.filter((item) => item.state === "VERIFIED_COMMITTED").length,
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
    || plan.schema_version !== "formal-oracle-execution-plan-v1" || !/^[a-f0-9]{64}$/.test(plan.execution_plan_sha256)
    || !isDenseArray(plan.items) || plan.items.length !== schedule.length) {
    throw new Error("Execution plan schema/count 无效");
  }
  for (const [index, raw] of plan.items.entries()) {
    const scheduled = schedule[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || !exactKeys(raw as unknown as Record<string, unknown>, [
        "request_id", "idempotency_key", "schedule_index", "case_id", "arm", "seed", "model", "system_prompt_sha256",
        "request_payload_sha256", "user_prompt_sha256", "output_schema_sha256", "visuals", "transport", "temperature", "max_input_tokens",
        "max_output_tokens", "timeout_ms", "max_attempts", "cache_retention", "tools_policy",
      ]) || raw.request_id !== scheduled.request_id || raw.idempotency_key !== scheduled.idempotency_key
      || raw.schedule_index !== index || raw.case_id !== scheduled.case_id || raw.arm !== scheduled.arm || raw.seed !== scheduled.seed
      || raw.model !== spec.model || !/^[a-f0-9]{64}$/.test(raw.request_payload_sha256)
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
    || intent.request_payload_sha256 !== expected.request_payload_sha256
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

/**
 * This store proves private-byte integrity, the complete case × arm × seed
 * schedule matrix, and execution-plan/checkpoint bindings only. It does not
 * independently prove Gold event counts, teacher diversity, or operation
 * coverage; those remain mandatory in the later pinned-ledger-registry
 * composition gate. No method in this class authorizes API execution.
 */
export class FormalOracleRunStore {
  readonly runStoreUri: string;
  readonly privateFs: PrivateContentAddressedFs;

  constructor(readonly dataDir: string, options: FormalOracleRunStoreOptions = {}) {
    this.runStoreUri = options.run_store_uri ?? DEFAULT_RUN_STORE_URI;
    this.privateFs = new PrivateContentAddressedFs(dataDir, this.runStoreUri, options);
  }

  requestObjectUri(runSha256: string, requestPayloadSha256: string): string {
    assertPrivateSha256(runSha256, "run_sha256");
    assertPrivateSha256(requestPayloadSha256, "request_payload_sha256");
    return `runs/${runSha256}/objects/request-payloads/${requestPayloadSha256}/request.bin`;
  }

  async createSealedRun(input: CreateSealedRunInput): Promise<FormalOracleRunSnapshot> {
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
    const runSha = input.run.run_sha256;
    return this.withRunLock(runSha, async () => {
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
    });
  }

  async inspectRun(runSha256: string, expectedHead: FormalOracleHeadPinV1): Promise<FormalOracleRunSnapshot> {
    assertPrivateSha256(runSha256, "run_sha256");
    return this.withRunLock(runSha256, () => this.loadRunUnlocked(runSha256, expectedHead));
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
      if (previousEntry.state !== "PENDING" || previousEntry.resume_action !== "dispatch_new_attempt") {
        throw new Error("本薄片只允许从干净 PENDING commit dispatch intent");
      }
      if (input.intent.run_sha256 !== snapshot.run.run_sha256
        || input.intent.idempotency_key !== previousEntry.idempotency_key
        || input.intent.max_attempts !== previousEntry.max_attempts
        || input.intent.attempt_ordinal !== previousEntry.attempts_used + 1
        || input.intent.schedule_index !== entryIndex) {
        throw new Error("Request intent 未绑定当前 run/request/attempt ordinal");
      }
      assertIntentMatchesExecutionPlan(input.intent, snapshot.execution_plan.items[entryIndex]);
      if (Date.parse(input.intent.prepared_at) > Date.parse(input.created_at)
        || Date.parse(snapshot.checkpoint.created_at) > Date.parse(input.created_at)) {
        throw new Error("Dispatch checkpoint 时间不得早于 intent 或上一 checkpoint");
      }
      const payload = Buffer.from(input.request_payload);
      const payloadSha256 = digest(payload);
      if (payloadSha256 !== snapshot.execution_plan.items[entryIndex].request_payload_sha256
        || payloadSha256 !== input.intent.request_payload_sha256) {
        throw new Error("request payload bytes/intent/execution plan SHA-256 三方不匹配");
      }
      const expectedUri = this.requestObjectUri(input.run_sha256, input.intent.request_payload_sha256);
      if (input.intent.request_object_uri !== expectedUri) throw new Error("request_object_uri 不属于当前私有内容地址 run");

      await this.privateFs.publishImmutableObject(
        this.requestPayloadDirectory(input.run_sha256, input.intent.request_payload_sha256),
        "request.bin",
        payload,
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
    for (const checkpoint of checkpoints) await this.validateDispatchReferences(run, executionPlan, checkpoint);
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

  private async validateDispatchReferences(
    run: FormalRunContractV1,
    executionPlan: FormalOracleExecutionPlanV1,
    checkpoint: RunCheckpointV1,
  ): Promise<void> {
    for (const [entryIndex, entry] of checkpoint.entries.entries()) {
      if (!entry.active_intent_sha256) continue;
      const bytes = await this.privateFs.readFile(this.intentPath(run.run_sha256, entry.active_intent_sha256));
      const intent = parseCanonicalDocument<RequestIntentV1>(bytes, "Request intent");
      validationError("Request intent", validateRequestIntent(intent));
      if (intent.intent_sha256 !== entry.active_intent_sha256 || hashRequestIntent(intent) !== entry.active_intent_sha256
        || intent.run_sha256 !== run.run_sha256 || intent.request_id !== entry.request_id
        || intent.idempotency_key !== entry.idempotency_key || intent.max_attempts !== entry.max_attempts
        || intent.schedule_index !== entryIndex) {
        throw new Error("Checkpoint active intent 引用未绑定真实 request object");
      }
      assertIntentMatchesExecutionPlan(intent, executionPlan.items[entryIndex]);
      if (entry.state === "DISPATCH_INTENT_COMMITTED"
        && (intent.attempt_ordinal !== entry.attempts_used + 1
          || Date.parse(intent.prepared_at) > Date.parse(checkpoint.created_at))) {
        throw new Error("Dispatch checkpoint 未绑定下一 attempt ordinal 的 durable intent");
      }
      const expectedUri = this.requestObjectUri(run.run_sha256, intent.request_payload_sha256);
      if (intent.request_object_uri !== expectedUri) throw new Error("Intent request_object_uri 不属于当前 run");
      const payload = await this.privateFs.readFile(expectedUri);
      if (digest(payload) !== intent.request_payload_sha256) throw new Error("Durable request payload 内容地址不匹配");
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
  private requestPayloadDirectory(runSha256: string, payloadSha256: string): string {
    return `${this.runPath(runSha256)}/objects/request-payloads/${payloadSha256}`;
  }
}
