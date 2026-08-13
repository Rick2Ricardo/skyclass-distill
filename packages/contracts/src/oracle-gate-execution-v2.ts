import { sha256Hex } from "./sha256.js";
import {
  hashRunCheckpoint,
  validateRunCheckpoint,
  validateRunCheckpointTransition,
  type OracleGateCheckpointCountsV1,
  type OracleGateCheckpointEntryV1,
  type OracleGateRunState,
  type RunCheckpointV1,
} from "./oracle-gate-run.js";
import { snapshotFormalOraclePreregistrationV2PlainData } from "./oracle-gate-preregistration-v2.js";

export const FORMAL_ORACLE_EXECUTION_LINEAGE_V2_DOMAIN = "skyclass/formal-oracle/execution-lineage/v2\0";
export const FORMAL_ORACLE_EXECUTION_MIGRATION_V1_DOMAIN = "skyclass/formal-oracle/execution-migration/v1\0";
export const FORMAL_ORACLE_RUN_CHECKPOINT_V2_DOMAIN = "skyclass/formal-oracle/run-checkpoint/v2\0";
export const FORMAL_ORACLE_RUN_HEAD_V2_DOMAIN = "skyclass/formal-oracle/run-head/v2\0";

export interface FormalOracleExecutionLineageV2Input {
  run_sha256: string;
  preregistration_bundle_sha256: string;
  schedule_sha256: string;
  execution_plan_sha256: string;
  genesis_checkpoint_sha256: string;
}

export interface FormalOracleExecutionMigrationV1 extends FormalOracleExecutionLineageV2Input {
  schema_version: "formal-oracle-execution-migration-v1";
  migration_sha256: string;
  execution_lineage_sha256: string;
  from_head_schema_version: "formal-oracle-preregistered-run-head-v2";
  from_generation: 0;
  from_checkpoint_sha256: string;
  to_checkpoint_schema_version: "oracle-gate-run-checkpoint-v2";
  to_generation: 1;
  migrated_at: string;
  migration_status: "execution_v2_state_machine_initialized_non_executable";
  external_monotonic_worm_status: "pending_external_monotonic_worm";
  api_execution_allowed: false;
}

export interface RunCheckpointV2 {
  schema_version: "oracle-gate-run-checkpoint-v2";
  checkpoint_sha256: string;
  run_sha256: string;
  preregistration_bundle_sha256: string;
  execution_plan_sha256: string;
  genesis_checkpoint_sha256: string;
  execution_lineage_sha256: string;
  migration_sha256: string;
  schedule_sha256: string;
  generation: number;
  previous_checkpoint_sha256: string;
  created_at: string;
  run_state: OracleGateRunState;
  terminal_reason_sha256: string | null;
  request_count: number;
  counts: OracleGateCheckpointCountsV1;
  entries: OracleGateCheckpointEntryV1[];
  execution_record_version: "formal-oracle-execution-records-v2";
  api_execution_allowed: false;
}

export interface FormalOracleRunHeadV2 {
  schema_version: "formal-oracle-run-head-v2";
  head_record_sha256: string;
  run_sha256: string;
  preregistration_bundle_sha256: string;
  execution_lineage_sha256: string;
  genesis_checkpoint_sha256: string;
  migration_sha256: string;
  generation: number;
  checkpoint_sha256: string;
  updated_at: string;
  execution_status: "execution_v2_initialized_non_executable" | "execution_v2_active_non_executable" | "execution_v2_terminal_non_executable";
  external_monotonic_worm_status: "pending_external_monotonic_worm";
  api_execution_allowed: false;
}

export interface FormalOracleHeadPinV2 {
  schema_version: "formal-oracle-head-pin-v2";
  head_record_sha256: string;
  run_sha256: string;
  preregistration_bundle_sha256: string;
  execution_lineage_sha256: string;
  genesis_checkpoint_sha256: string;
  migration_sha256: string;
  generation: number;
  checkpoint_sha256: string;
}

export interface FormalOracleExecutionV2ValidationIssue { path: string; message: string }
export interface FormalOracleExecutionV2ValidationReport { valid: boolean; issues: FormalOracleExecutionV2ValidationIssue[] }

const SHA = /^[a-f0-9]{64}$/;

function report(issues: FormalOracleExecutionV2ValidationIssue[]): FormalOracleExecutionV2ValidationReport {
  return { valid: issues.length === 0, issues };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function canonicalTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function stable(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error("execution v2 canonical number 无效");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  throw new Error("execution v2 canonical value 无效");
}

function without(value: object, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([field]) => field !== key));
}

function domainHash(domain: string, value: unknown): string {
  return sha256Hex(`${domain}${stable(value)}`);
}

function snapshot<T>(value: T): T {
  return snapshotFormalOraclePreregistrationV2PlainData(value);
}

function issue(issues: FormalOracleExecutionV2ValidationIssue[], condition: boolean, path: string, message: string): void {
  if (!condition) issues.push({ path, message });
}

function push(issues: FormalOracleExecutionV2ValidationIssue[], prefix: string, nested: { issues: Array<{ path: string; message: string }> }): void {
  nested.issues.forEach((item) => issues.push({ path: `${prefix}.${item.path}`, message: item.message }));
}

export function hashFormalOracleExecutionLineageV2(input: FormalOracleExecutionLineageV2Input): string {
  return domainHash(FORMAL_ORACLE_EXECUTION_LINEAGE_V2_DOMAIN, {
    run_sha256: input.run_sha256,
    preregistration_bundle_sha256: input.preregistration_bundle_sha256,
    schedule_sha256: input.schedule_sha256,
    execution_plan_sha256: input.execution_plan_sha256,
    genesis_checkpoint_sha256: input.genesis_checkpoint_sha256,
  });
}

export function hashFormalOracleExecutionMigrationV1(input: FormalOracleExecutionMigrationV1): string {
  return domainHash(FORMAL_ORACLE_EXECUTION_MIGRATION_V1_DOMAIN, without(input, "migration_sha256"));
}

export function hashRunCheckpointV2(input: RunCheckpointV2): string {
  return domainHash(FORMAL_ORACLE_RUN_CHECKPOINT_V2_DOMAIN, without(input, "checkpoint_sha256"));
}

export function hashFormalOracleRunHeadV2(input: FormalOracleRunHeadV2): string {
  return domainHash(FORMAL_ORACLE_RUN_HEAD_V2_DOMAIN, without(input, "head_record_sha256"));
}

function legacyProjection(input: RunCheckpointV2): RunCheckpointV1 {
  const projected: RunCheckpointV1 = {
    schema_version: "oracle-gate-run-checkpoint-v1",
    checkpoint_sha256: "0".repeat(64),
    run_sha256: input.run_sha256,
    schedule_sha256: input.schedule_sha256,
    generation: input.generation,
    previous_checkpoint_sha256: input.previous_checkpoint_sha256,
    created_at: input.created_at,
    run_state: input.run_state,
    terminal_reason_sha256: input.terminal_reason_sha256,
    request_count: input.request_count,
    counts: input.counts,
    entries: input.entries,
  };
  projected.checkpoint_sha256 = hashRunCheckpoint(projected);
  return projected;
}

export function validateFormalOracleExecutionMigrationV1(input: unknown): FormalOracleExecutionV2ValidationReport {
  try { input = snapshot(input); } catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: FormalOracleExecutionV2ValidationIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须是 plain object" }]);
  issue(issues, exact(input, ["schema_version","migration_sha256","run_sha256","preregistration_bundle_sha256","schedule_sha256","execution_plan_sha256","genesis_checkpoint_sha256","execution_lineage_sha256","from_head_schema_version","from_generation","from_checkpoint_sha256","to_checkpoint_schema_version","to_generation","migrated_at","migration_status","external_monotonic_worm_status","api_execution_allowed"]), "$", "字段集合无效");
  for (const field of ["migration_sha256","run_sha256","preregistration_bundle_sha256","schedule_sha256","execution_plan_sha256","genesis_checkpoint_sha256","execution_lineage_sha256","from_checkpoint_sha256"] as const) issue(issues, SHA.test(String(input[field])), field, "SHA 无效");
  issue(issues, input.schema_version === "formal-oracle-execution-migration-v1" && input.from_head_schema_version === "formal-oracle-preregistered-run-head-v2" && input.from_generation === 0 && input.to_checkpoint_schema_version === "oracle-gate-run-checkpoint-v2" && input.to_generation === 1, "version", "migration bridge 版本/代数无效");
  issue(issues, input.genesis_checkpoint_sha256 === input.from_checkpoint_sha256, "from_checkpoint_sha256", "必须绑定唯一 genesis");
  issue(issues, input.migration_status === "execution_v2_state_machine_initialized_non_executable" && input.external_monotonic_worm_status === "pending_external_monotonic_worm" && input.api_execution_allowed === false && canonicalTime(input.migrated_at), "status", "状态、时间或安全门无效");
  if (issues.length === 0) {
    const value = input as unknown as FormalOracleExecutionMigrationV1;
    issue(issues, hashFormalOracleExecutionLineageV2(value) === value.execution_lineage_sha256, "execution_lineage_sha256", "lineage 根不匹配");
    issue(issues, hashFormalOracleExecutionMigrationV1(value) === value.migration_sha256, "migration_sha256", "正文哈希不匹配");
  }
  return report(issues);
}

export function validateRunCheckpointV2(input: unknown): FormalOracleExecutionV2ValidationReport {
  try { input = snapshot(input); } catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: FormalOracleExecutionV2ValidationIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须是 plain object" }]);
  issue(issues, exact(input, ["schema_version","checkpoint_sha256","run_sha256","preregistration_bundle_sha256","execution_plan_sha256","genesis_checkpoint_sha256","execution_lineage_sha256","migration_sha256","schedule_sha256","generation","previous_checkpoint_sha256","created_at","run_state","terminal_reason_sha256","request_count","counts","entries","execution_record_version","api_execution_allowed"]), "$", "字段集合无效");
  for (const field of ["checkpoint_sha256","run_sha256","preregistration_bundle_sha256","execution_plan_sha256","genesis_checkpoint_sha256","execution_lineage_sha256","migration_sha256","schedule_sha256","previous_checkpoint_sha256"] as const) issue(issues, SHA.test(String(input[field])), field, "SHA 无效");
  issue(issues, input.schema_version === "oracle-gate-run-checkpoint-v2" && input.execution_record_version === "formal-oracle-execution-records-v2", "schema_version", "版本无效");
  issue(issues, Number.isSafeInteger(input.generation) && Number(input.generation) >= 1, "generation", "V2 checkpoint generation 必须 >=1");
  issue(issues, input.api_execution_allowed === false, "api_execution_allowed", "必须 false");
  if (record(input) && Array.isArray(input.entries) && record(input.counts)) {
    const projected = legacyProjection(input as unknown as RunCheckpointV2);
    push(issues, "state", validateRunCheckpoint(projected));
  }
  if (issues.length === 0) issue(issues, hashRunCheckpointV2(input as unknown as RunCheckpointV2) === input.checkpoint_sha256, "checkpoint_sha256", "正文哈希不匹配");
  return report(issues);
}

export function validateFormalOracleExecutionMigrationBridgeV1(input: {
  genesis: unknown;
  migration: unknown;
  checkpoint: unknown;
}): FormalOracleExecutionV2ValidationReport {
  let value: typeof input;
  try { value = snapshot(input); } catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: FormalOracleExecutionV2ValidationIssue[] = [];
  if (!record(value) || !exact(value, ["genesis", "migration", "checkpoint"])) {
    return report([{ path: "$", message: "bridge 字段集合无效" }]);
  }
  push(issues, "genesis", validateRunCheckpoint(value.genesis));
  push(issues, "migration", validateFormalOracleExecutionMigrationV1(value.migration));
  push(issues, "checkpoint", validateRunCheckpointV2(value.checkpoint));
  if (issues.length) return report(issues);
  const genesis = value.genesis as RunCheckpointV1;
  const migration = value.migration as FormalOracleExecutionMigrationV1;
  const checkpoint = value.checkpoint as RunCheckpointV2;
  issue(issues, genesis.generation === 0 && genesis.previous_checkpoint_sha256 === null && genesis.run_state === "SEALED_READY" && genesis.terminal_reason_sha256 === null, "genesis", "bridge 只能起于 generation-0 SEALED_READY");
  issue(issues, migration.run_sha256 === genesis.run_sha256 && migration.genesis_checkpoint_sha256 === genesis.checkpoint_sha256 && checkpoint.run_sha256 === genesis.run_sha256 && checkpoint.genesis_checkpoint_sha256 === genesis.checkpoint_sha256, "roots", "run/genesis 根不闭合");
  issue(issues, checkpoint.preregistration_bundle_sha256 === migration.preregistration_bundle_sha256 && checkpoint.execution_plan_sha256 === migration.execution_plan_sha256 && checkpoint.schedule_sha256 === migration.schedule_sha256 && checkpoint.execution_lineage_sha256 === migration.execution_lineage_sha256 && checkpoint.migration_sha256 === migration.migration_sha256, "roots", "migration/checkpoint 根不闭合");
  issue(issues, checkpoint.generation === 1 && checkpoint.previous_checkpoint_sha256 === genesis.checkpoint_sha256 && checkpoint.run_state === "SEALED_READY" && checkpoint.terminal_reason_sha256 === null, "checkpoint", "bridge 目标必须是 generation-1 SEALED_READY");
  issue(issues, stable(checkpoint.entries) === stable(genesis.entries) && stable(checkpoint.counts) === stable(genesis.counts) && checkpoint.request_count === genesis.request_count, "checkpoint.entries", "migration 不得改变请求状态");
  issue(issues, Date.parse(genesis.created_at) <= Date.parse(migration.migrated_at) && migration.migrated_at === checkpoint.created_at, "time", "migration/checkpoint 时间未闭合");
  return report(issues);
}

export function validateRunCheckpointTransitionV2(previousInput: unknown, nextInput: unknown): FormalOracleExecutionV2ValidationReport {
  let previous: unknown, next: unknown;
  try { previous = snapshot(previousInput); next = snapshot(nextInput); } catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: FormalOracleExecutionV2ValidationIssue[] = [];
  push(issues, "previous", validateRunCheckpointV2(previous));
  push(issues, "next", validateRunCheckpointV2(next));
  if (issues.length) return report(issues);
  const left = previous as RunCheckpointV2, right = next as RunCheckpointV2;
  issue(issues, right.generation === left.generation + 1 && right.previous_checkpoint_sha256 === left.checkpoint_sha256, "next.previous_checkpoint_sha256", "必须形成连续 V2 checkpoint 链");
  for (const field of ["run_sha256","preregistration_bundle_sha256","execution_plan_sha256","genesis_checkpoint_sha256","execution_lineage_sha256","migration_sha256","schedule_sha256","request_count","execution_record_version"] as const) issue(issues, right[field] === left[field], `next.${field}`, "不得漂移");
  const projectedLeft = legacyProjection(left), projectedRight = legacyProjection(right);
  projectedRight.previous_checkpoint_sha256 = projectedLeft.checkpoint_sha256;
  projectedRight.checkpoint_sha256 = hashRunCheckpoint(projectedRight);
  push(issues, "state", validateRunCheckpointTransition(projectedLeft, projectedRight));
  return report(issues);
}

export function validateFormalOracleRunHeadV2(input: unknown): FormalOracleExecutionV2ValidationReport {
  try { input = snapshot(input); } catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: FormalOracleExecutionV2ValidationIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须是 plain object" }]);
  issue(issues, exact(input, ["schema_version","head_record_sha256","run_sha256","preregistration_bundle_sha256","execution_lineage_sha256","genesis_checkpoint_sha256","migration_sha256","generation","checkpoint_sha256","updated_at","execution_status","external_monotonic_worm_status","api_execution_allowed"]), "$", "字段集合无效");
  for (const field of ["head_record_sha256","run_sha256","preregistration_bundle_sha256","execution_lineage_sha256","genesis_checkpoint_sha256","migration_sha256","checkpoint_sha256"] as const) issue(issues, SHA.test(String(input[field])), field, "SHA 无效");
  issue(issues, input.schema_version === "formal-oracle-run-head-v2" && Number.isSafeInteger(input.generation) && Number(input.generation) >= 1 && canonicalTime(input.updated_at), "head", "版本、generation 或时间无效");
  issue(issues, ["execution_v2_initialized_non_executable","execution_v2_active_non_executable","execution_v2_terminal_non_executable"].includes(String(input.execution_status)) && input.external_monotonic_worm_status === "pending_external_monotonic_worm" && input.api_execution_allowed === false, "status", "状态或安全门无效");
  if (issues.length === 0) issue(issues, hashFormalOracleRunHeadV2(input as unknown as FormalOracleRunHeadV2) === input.head_record_sha256, "head_record_sha256", "正文哈希不匹配");
  return report(issues);
}

export function validateFormalOracleHeadPinV2(input: unknown): FormalOracleExecutionV2ValidationReport {
  try { input = snapshot(input); } catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: FormalOracleExecutionV2ValidationIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须是 plain object" }]);
  issue(issues, exact(input, ["schema_version","head_record_sha256","run_sha256","preregistration_bundle_sha256","execution_lineage_sha256","genesis_checkpoint_sha256","migration_sha256","generation","checkpoint_sha256"]), "$", "字段集合无效");
  for (const field of ["head_record_sha256","run_sha256","preregistration_bundle_sha256","execution_lineage_sha256","genesis_checkpoint_sha256","migration_sha256","checkpoint_sha256"] as const) issue(issues, SHA.test(String(input[field])), field, "SHA 无效");
  issue(issues, input.schema_version === "formal-oracle-head-pin-v2" && Number.isSafeInteger(input.generation) && Number(input.generation) >= 1, "pin", "版本或 generation 无效");
  return report(issues);
}

export function validateFormalOracleHeadPinV2AgainstHead(pinInput: unknown, headInput: unknown): FormalOracleExecutionV2ValidationReport {
  let pin: unknown, head: unknown;
  try { pin = snapshot(pinInput); head = snapshot(headInput); } catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: FormalOracleExecutionV2ValidationIssue[] = [];
  push(issues, "pin", validateFormalOracleHeadPinV2(pin));
  push(issues, "head", validateFormalOracleRunHeadV2(head));
  if (!issues.length) {
    const P = pin as FormalOracleHeadPinV2, H = head as FormalOracleRunHeadV2;
    for (const field of ["head_record_sha256","run_sha256","preregistration_bundle_sha256","execution_lineage_sha256","genesis_checkpoint_sha256","migration_sha256","generation","checkpoint_sha256"] as const) issue(issues, P[field] === H[field], field, "pin 与 HEAD 不匹配");
  }
  return report(issues);
}
