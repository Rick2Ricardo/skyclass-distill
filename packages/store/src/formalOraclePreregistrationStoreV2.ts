import {
  hashFormalOraclePreregistrationBundleV2,
  hashFormalRunContractV2,
  validateFormalOraclePreregistrationBundleV2,
  validateFormalRunContractV2,
  validateFormalRunContractV2AgainstPreregistrationBundle,
  type FormalOraclePreregistrationBundleV2,
  type FormalRunContractV2,
} from "../../contracts/src/oracle-gate-preregistration-v2.js";
import {
  hashRunCheckpoint,
  validateRunCheckpoint,
  type OracleGateCheckpointEntryV1,
  type RunCheckpointV1,
} from "../../contracts/src/oracle-gate-run.js";
import {
  hashFormalOracleExecutionLineageV2,
  hashFormalOracleExecutionMigrationV1,
  hashFormalOracleRunHeadV2,
  hashRunCheckpointV2,
  validateFormalOracleExecutionMigrationBridgeV1,
  validateFormalOracleExecutionMigrationV1,
  validateFormalOracleHeadPinV2AgainstHead,
  validateFormalOracleRunHeadV2,
  validateRunCheckpointV2,
  validateRunCheckpointTransitionV2,
  type FormalOracleExecutionMigrationV1,
  type FormalOracleHeadPinV2,
  type FormalOracleRunHeadV2,
  type RunCheckpointV2,
} from "../../contracts/src/oracle-gate-execution-v2.js";
import {
  hashCommittedRequestV4,
  hashFormalOracleTerminalReasonV2,
  hashRequestAttemptAuditV5,
  hashRequestIntentV3,
  validateCommittedRequestV4AgainstAttemptV5,
  validateFormalOracleTerminalReasonV2,
  validateRequestAttemptAuditV5,
  validateRequestAttemptAuditV5AgainstIntentV3,
  validateRequestIntentV3,
  type CommittedRequestV4,
  type FormalOracleTerminalReasonCodeV2,
  type FormalOracleTerminalReasonV2,
  type RequestAttemptAuditV5,
  type RequestIntentV3,
} from "../../contracts/src/oracle-gate-execution-records-v2.js";
import {
  ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  ORACLE_GATE_RESPONSE_VALIDATOR_VERSION,
  canonicalOracleGateResponseBytes,
  parseOracleGateResponseBytes,
  validateOracleGateResponse,
} from "../../contracts/src/oracle-gate-response.js";
import {
  FORMAL_ORACLE_PI_RESPONSE_STREAM_VERSION,
  assertFormalOraclePiResponseStreamArtifactV1,
  createFormalOraclePiResponseStreamArtifactV1,
  hashFormalOraclePiResponseStreamProofV1,
  revalidateFormalOraclePiResponseStreamArtifactV1,
  type FormalOraclePiResponseStreamArtifactV1,
  type FormalOraclePiResponseStreamProofV1,
} from "../../contracts/src/oracle-gate-pi-response-stream.js";
import {
  assertFormalOracleInvalidResponseArtifactV1,
  assertFormalOracleInvalidResponseRecordV1,
  createFormalOracleInvalidResponseArtifactV1,
  createFormalOracleTransportMetadataInvalidResponseArtifactV1,
  hashFormalOracleInvalidResponseRecordV1,
  revalidateFormalOracleInvalidResponseArtifactV1,
  type FormalOracleInvalidResponseArtifactV1,
  type FormalOracleInvalidResponseRecordV1,
} from "../../contracts/src/oracle-gate-invalid-response.js";
import {
  hashFormalOracleResponsePublicHeadersV1,
  hashFormalOracleTransportCaptureRecordV1,
  revalidateFormalOracleTransportCaptureArtifactV1,
  validateFormalOracleTransportCaptureRecordV1,
  type FormalOracleTransportCaptureRecordV1,
} from "../../contracts/src/oracle-gate-transport-capture.js";
import {
  assertFormalOraclePiRequestArtifact,
  parseFormalOraclePiRequestEnvelopeBytes,
  type FormalOraclePiRequestArtifact,
  type FormalOraclePiRequestEnvelopeV1,
} from "../../contracts/src/oracle-gate-request.js";
import {
  assertFormalOraclePreparedProviderRequestArtifact,
  parseFormalOraclePreparedProviderRequestBytes,
  type FormalOraclePreparedProviderRequestArtifactV1,
} from "../../contracts/src/oracle-gate-provider-request.js";
import { parseFormalOracleUserPromptBytes } from "../../contracts/src/oracle-gate-user-prompt.js";
import { createHash } from "node:crypto";
import {
  assertFormalOracleExecutionPlanAgainstRun,
  assertFormalOracleGenesisMatchesPlans,
  assertFormalOracleStructuralScheduleAgainstRun,
  hashFormalOracleExecutionPlan,
  hashFormalOracleStructuralSchedule,
  type FormalOracleExecutionPlanV1,
  type FormalOracleHeadPinV1,
  type FormalOracleStructuralScheduleV1,
} from "./formalOracleRunStore.js";
import { hashPublicBlindResponse } from "../../contracts/src/oracle-gate-run.js";
import {
  assertFormalOracleAuthoritativeTransportCaptureArtifactV1,
  type FormalOracleAuthoritativeTransportCaptureArtifactV1,
} from "../../llm/src/formalOracleSingleConsumeSender.js";
import {
  assertPrivateSha256,
  privateCanonicalJsonBytes,
  PrivateContentAddressedFs,
  type PrivateContentAddressedFsOptions,
} from "./privateContentAddressedFs.js";

interface FormalOraclePreregisteredRunHeadV2 {
  schema_version: "formal-oracle-preregistered-run-head-v2";
  run_sha256: string;
  generation: 0;
  checkpoint_sha256: string;
  updated_at: string;
  execution_migration_status: "pending_formal_run_store_v2_execution_pipeline";
  api_execution_allowed: false;
}

export interface CreateFormalOraclePreregisteredRunV2Input {
  run: FormalRunContractV2;
  preregistration_bundle: FormalOraclePreregistrationBundleV2;
  structural_schedule: FormalOracleStructuralScheduleV1;
  execution_plan: FormalOracleExecutionPlanV1;
  initial_checkpoint: RunCheckpointV1;
}

export interface FormalOraclePreregisteredRunV2Snapshot {
  readonly schema_version: "formal-oracle-preregistered-run-snapshot-v2";
  readonly run: Readonly<FormalRunContractV2>;
  readonly preregistration_bundle: Readonly<FormalOraclePreregistrationBundleV2>;
  readonly structural_schedule: Readonly<FormalOracleStructuralScheduleV1>;
  readonly execution_plan: Readonly<FormalOracleExecutionPlanV1>;
  readonly initial_checkpoint: Readonly<RunCheckpointV1>;
  readonly head_pin: Readonly<FormalOracleHeadPinV1>;
  readonly execution_migration_status: "pending_formal_run_store_v2_execution_pipeline";
  readonly external_monotonic_worm_status: "pending_external_monotonic_worm";
  readonly api_execution_allowed: false;
}

export interface MigrateFormalOraclePreregisteredRunV2Input {
  run_sha256: string;
  expected_genesis_head: FormalOracleHeadPinV1;
  migrated_at: string;
}

export interface FormalOracleExecutionV2Snapshot {
  readonly schema_version: "formal-oracle-execution-snapshot-v2";
  readonly run: Readonly<FormalRunContractV2>;
  readonly preregistration_bundle: Readonly<FormalOraclePreregistrationBundleV2>;
  readonly structural_schedule: Readonly<FormalOracleStructuralScheduleV1>;
  readonly execution_plan: Readonly<FormalOracleExecutionPlanV1>;
  readonly genesis_checkpoint: Readonly<RunCheckpointV1>;
  readonly migration: Readonly<FormalOracleExecutionMigrationV1>;
  readonly checkpoint: Readonly<RunCheckpointV2>;
  readonly checkpoints: ReadonlyArray<Readonly<RunCheckpointV2>>;
  readonly head: Readonly<FormalOracleRunHeadV2>;
  readonly head_pin: Readonly<FormalOracleHeadPinV2>;
  readonly execution_status: FormalOracleRunHeadV2["execution_status"];
  readonly external_monotonic_worm_status: "pending_external_monotonic_worm";
  readonly api_execution_allowed: false;
}

export interface CommitFormalOracleDispatchIntentV2Input {
  run_sha256: string;
  expected_head: FormalOracleHeadPinV2;
  expected_checkpoint_sha256: string;
  intent: RequestIntentV3;
  request_envelope: FormalOraclePiRequestArtifact;
  prepared_provider_request: FormalOraclePreparedProviderRequestArtifactV1;
  created_at: string;
}

export interface CommitFormalOracleAttemptAuditV2Input {
  run_sha256: string;
  expected_head: FormalOracleHeadPinV2;
  expected_checkpoint_sha256: string;
  audit: RequestAttemptAuditV5;
  response_artifact?: FormalOraclePiResponseStreamArtifactV1;
  invalid_response_artifact?: FormalOracleInvalidResponseArtifactV1;
  transport_capture_artifact?: FormalOracleAuthoritativeTransportCaptureArtifactV1;
  parsed_response?: Record<string, unknown>;
  created_at: string;
}

export interface FormalOracleExecutionMutationV2Input {
  run_sha256: string;
  expected_head: FormalOracleHeadPinV2;
  expected_checkpoint_sha256: string;
  request_id: string;
  created_at: string;
}

export interface CommitFormalOracleSchemaValidatedRequestV2Input extends FormalOracleExecutionMutationV2Input {
  committed_request: CommittedRequestV4;
}

export interface CompleteFormalOracleRunV2Input {
  run_sha256: string;
  expected_head: FormalOracleHeadPinV2;
  expected_checkpoint_sha256: string;
  created_at: string;
}

export interface FormalOracleCompletedTransportSchemaRunV2 {
  readonly schema_version: "formal-oracle-completed-transport-schema-run-v2";
  readonly status: "completed_v2_transport_and_schema_chain_revalidated";
  readonly run: Readonly<FormalRunContractV2>;
  readonly preregistration_bundle: Readonly<FormalOraclePreregistrationBundleV2>;
  readonly structural_schedule: Readonly<FormalOracleStructuralScheduleV1>;
  readonly execution_plan: Readonly<FormalOracleExecutionPlanV1>;
  readonly genesis_checkpoint: Readonly<RunCheckpointV1>;
  readonly migration: Readonly<FormalOracleExecutionMigrationV1>;
  readonly head_pin: Readonly<FormalOracleHeadPinV2>;
  readonly checkpoints: ReadonlyArray<Readonly<RunCheckpointV2>>;
  readonly intents: ReadonlyArray<Readonly<RequestIntentV3>>;
  readonly attempts: ReadonlyArray<Readonly<RequestAttemptAuditV5>>;
  readonly committed_requests: ReadonlyArray<Readonly<CommittedRequestV4>>;
  readonly canonical_responses: ReadonlyArray<Readonly<{
    request_id: string;
    schedule_index: number;
    canonical_response_bytes_sha256: string;
    canonical_response_commitment_sha256: string;
    response: Readonly<Record<string, unknown>>;
  }>>;
  readonly external_monotonic_worm_status: "pending_external_monotonic_worm";
  readonly semantic_review_status: "pending_external_blind_review";
  readonly api_execution_allowed: false;
}

export interface FormalOracleCompletedRunCapabilityV2 {
  readonly stage: "completed_v2_transport_schema_run_locked";
  readonly completed_run: Readonly<FormalOracleCompletedTransportSchemaRunV2>;
  readonly api_execution_allowed: false;
}

const activeCompletedRunCapabilitiesV2 = new WeakSet<object>();

class CompletedRunCapabilityV2 implements FormalOracleCompletedRunCapabilityV2 {
  readonly stage = "completed_v2_transport_schema_run_locked" as const;
  readonly api_execution_allowed = false as const;
  constructor(readonly completed_run: Readonly<FormalOracleCompletedTransportSchemaRunV2>) { Object.freeze(this); }
  toJSON(): never { throw new Error("Formal Oracle V2 completed capability 是 callback 内临时能力，不得序列化"); }
}

export function assertActiveFormalOracleCompletedRunCapabilityV2(value: FormalOracleCompletedRunCapabilityV2): void {
  if (!value || typeof value !== "object" || !activeCompletedRunCapabilitiesV2.has(value as object)) {
    throw new Error("Formal Oracle V2 completed capability 无效、已过期或来自 JSON 伪造");
  }
}

export interface FormalOracleResumePlanV2 {
  readonly run_sha256: string;
  readonly checkpoint_sha256: string;
  readonly generation: number;
  readonly run_state: RunCheckpointV2["run_state"];
  readonly blocked_ambiguous: boolean;
  readonly requests: ReadonlyArray<Readonly<Pick<OracleGateCheckpointEntryV1, "request_id" | "state" | "resume_action">>>;
  readonly api_execution_allowed: false;
}

export interface FormalOracleSingleConsumeDispatchLeaseV2 {
  readonly stage: "durable_dispatch_intent_v2_single_consume_lease";
  readonly run_sha256: string;
  readonly execution_plan_sha256: string;
  readonly request_id: string;
  readonly intent_sha256: string;
  readonly attempt_ordinal: number;
  readonly request_envelope_sha256: string;
  readonly provider_body_sha256: string;
  readonly dispatch_head: Readonly<FormalOracleHeadPinV2>;
  readonly credential_present: false;
  readonly provider_contact_authorized: false;
  readonly api_execution_allowed: false;
}

export interface FormalOracleConsumedDispatchLeaseV2 {
  readonly stage: "durable_dispatch_intent_v2_lease_consumed";
  readonly run_sha256: string;
  readonly execution_plan_sha256: string;
  readonly request_id: string;
  readonly intent_sha256: string;
  readonly attempt_ordinal: number;
  readonly request_envelope_sha256: string;
  readonly provider_body_sha256: string;
  readonly dispatch_head: Readonly<FormalOracleHeadPinV2>;
}

type DispatchLeaseStateV2 = { status: "available" | "consumed"; receipt: FormalOracleConsumedDispatchLeaseV2 | null };
const activeDispatchLeasesV2 = new WeakMap<object, DispatchLeaseStateV2>();
const activeConsumedDispatchLeasesV2 = new WeakSet<object>();

class SingleConsumeDispatchLeaseV2 implements FormalOracleSingleConsumeDispatchLeaseV2 {
  readonly stage = "durable_dispatch_intent_v2_single_consume_lease" as const;
  readonly credential_present = false as const;
  readonly provider_contact_authorized = false as const;
  readonly api_execution_allowed = false as const;
  constructor(
    readonly run_sha256: string,
    readonly execution_plan_sha256: string,
    readonly request_id: string,
    readonly intent_sha256: string,
    readonly attempt_ordinal: number,
    readonly request_envelope_sha256: string,
    readonly provider_body_sha256: string,
    readonly dispatch_head: Readonly<FormalOracleHeadPinV2>,
  ) { Object.freeze(this); }
  toJSON(): never { throw new Error("Formal Oracle V2 dispatch lease 是 callback 内临时能力，不得序列化"); }
}

class ConsumedDispatchLeaseV2 implements FormalOracleConsumedDispatchLeaseV2 {
  readonly stage = "durable_dispatch_intent_v2_lease_consumed" as const;
  readonly run_sha256!: string;
  readonly execution_plan_sha256!: string;
  readonly request_id!: string;
  readonly intent_sha256!: string;
  readonly attempt_ordinal!: number;
  readonly request_envelope_sha256!: string;
  readonly provider_body_sha256!: string;
  readonly dispatch_head!: Readonly<FormalOracleHeadPinV2>;
  constructor(lease: FormalOracleSingleConsumeDispatchLeaseV2) {
    this.run_sha256 = lease.run_sha256;
    this.execution_plan_sha256 = lease.execution_plan_sha256;
    this.request_id = lease.request_id;
    this.intent_sha256 = lease.intent_sha256;
    this.attempt_ordinal = lease.attempt_ordinal;
    this.request_envelope_sha256 = lease.request_envelope_sha256;
    this.provider_body_sha256 = lease.provider_body_sha256;
    this.dispatch_head = lease.dispatch_head;
    Object.freeze(this);
  }
  toJSON(): never { throw new Error("Formal Oracle V2 consumed dispatch lease 不得序列化"); }
}

function issueFormalOracleSingleConsumeDispatchLeaseV2(input: Omit<FormalOracleSingleConsumeDispatchLeaseV2,
  "stage" | "credential_present" | "provider_contact_authorized" | "api_execution_allowed">): FormalOracleSingleConsumeDispatchLeaseV2 {
  const lease = new SingleConsumeDispatchLeaseV2(input.run_sha256, input.execution_plan_sha256, input.request_id,
    input.intent_sha256, input.attempt_ordinal, input.request_envelope_sha256, input.provider_body_sha256, input.dispatch_head);
  activeDispatchLeasesV2.set(lease, { status: "available", receipt: null });
  return lease;
}

export function consumeFormalOracleSingleConsumeDispatchLeaseV2(
  value: FormalOracleSingleConsumeDispatchLeaseV2,
): FormalOracleConsumedDispatchLeaseV2 {
  const state = value && typeof value === "object" ? activeDispatchLeasesV2.get(value as object) : undefined;
  if (!state || state.status !== "available") throw new Error("Formal Oracle V2 dispatch lease 无效、未经 durable HEAD CAS 或已经消费");
  const receipt = new ConsumedDispatchLeaseV2(value);
  state.status = "consumed";
  state.receipt = receipt;
  activeConsumedDispatchLeasesV2.add(receipt);
  return receipt;
}

export function assertActiveFormalOracleConsumedDispatchLeaseV2(value: FormalOracleConsumedDispatchLeaseV2): void {
  if (!value || typeof value !== "object" || !activeConsumedDispatchLeasesV2.has(value as object)) {
    throw new Error("Formal Oracle V2 consumed dispatch lease 无效、已过期或来自 JSON 伪造");
  }
}

function revokeFormalOracleDispatchLeaseV2(value: FormalOracleSingleConsumeDispatchLeaseV2): void {
  const state = activeDispatchLeasesV2.get(value as object);
  activeDispatchLeasesV2.delete(value as object);
  if (state?.receipt) activeConsumedDispatchLeasesV2.delete(state.receipt as object);
}

const DEFAULT_STORE_URI = "board2skill/formal-oracle/preregistered-run-store-v2";

function validationError(label: string, report: { valid: boolean; issues: Array<{ path: string; message: string }> }): void {
  if (!report.valid) throw new Error(`${label} 无效：${report.issues[0]?.path} ${report.issues[0]?.message}`);
}

function parseCanonical<T>(bytes: Buffer, label: string): T {
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error(`${label} 不是 JSON`); }
  if (!privateCanonicalJsonBytes(value).equals(bytes)) throw new Error(`${label} 不是 canonical JSON bytes`);
  return value as T;
}

function canonicalTime(value: string, label: string): void {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) throw new Error(`${label} 不是 canonical ISO 时间`);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function clonePlainData<T>(value: T, label: string): T {
  const clone = (input: unknown, path: string): unknown => {
    if (input === null || typeof input === "string" || typeof input === "boolean") return input;
    if (typeof input === "number") {
      if (!Number.isFinite(input) || Math.abs(input) > Number.MAX_SAFE_INTEGER || Object.is(input, -0)) throw new Error(`${label}${path} 数值无效`);
      return input;
    }
    if (!input || typeof input !== "object" || Object.getOwnPropertySymbols(input).length) throw new Error(`${label}${path} 不是 plain data`);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Array.isArray(input)) {
      if (Object.getPrototypeOf(input) !== Array.prototype) throw new Error(`${label}${path} array prototype 无效`);
      const keys = Object.keys(descriptors).filter((key) => key !== "length");
      if (keys.length !== input.length || keys.some((key, index) => key !== String(index))) throw new Error(`${label}${path} 是稀疏/附加字段数组`);
      return keys.map((key) => {
        const descriptor = descriptors[key];
        if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) throw new Error(`${label}${path} 含 accessor`);
        return clone(descriptor.value, `${path}[${key}]`);
      });
    }
    if (Object.getPrototypeOf(input) !== Object.prototype || Object.hasOwn(input, "toJSON")) throw new Error(`${label}${path} prototype/toJSON 无效`);
    const output: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!("value" in descriptor) || descriptor.enumerable !== true) throw new Error(`${label}${path}.${key} 含 accessor/隐藏字段`);
      output[key] = clone(descriptor.value, `${path}.${key}`);
    }
    return output;
  };
  return clone(value, "") as T;
}

function cloneExecutionAttemptInput(input: CommitFormalOracleAttemptAuditV2Input): CommitFormalOracleAttemptAuditV2Input {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype
    || Object.getOwnPropertySymbols(input).length || Object.hasOwn(input, "toJSON")) {
    throw new Error("V2 attempt input 必须是 plain object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const required = ["run_sha256", "expected_head", "expected_checkpoint_sha256", "audit", "created_at"];
  const optional = ["response_artifact", "invalid_response_artifact", "transport_capture_artifact", "parsed_response"];
  const keys = Object.keys(descriptors);
  if (required.some((key) => !keys.includes(key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new Error("V2 attempt input 字段集合无效");
  }
  const read = (key: string): unknown => {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) throw new Error(`V2 attempt input.${key} 含 accessor/隐藏字段`);
    return descriptor.value;
  };
  const output: CommitFormalOracleAttemptAuditV2Input = {
    run_sha256: clonePlainData(read("run_sha256"), "V2 attempt run") as string,
    expected_head: deepFreezePlain(clonePlainData(read("expected_head"), "V2 attempt head")) as FormalOracleHeadPinV2,
    expected_checkpoint_sha256: clonePlainData(read("expected_checkpoint_sha256"), "V2 attempt checkpoint") as string,
    audit: deepFreezePlain(clonePlainData(read("audit"), "V2 attempt audit")) as RequestAttemptAuditV5,
    created_at: clonePlainData(read("created_at"), "V2 attempt created_at") as string,
  };
  if (descriptors.response_artifact) output.response_artifact = read("response_artifact") as FormalOraclePiResponseStreamArtifactV1;
  if (descriptors.invalid_response_artifact) output.invalid_response_artifact = read("invalid_response_artifact") as FormalOracleInvalidResponseArtifactV1;
  if (descriptors.transport_capture_artifact) output.transport_capture_artifact = read("transport_capture_artifact") as FormalOracleAuthoritativeTransportCaptureArtifactV1;
  if (descriptors.parsed_response) output.parsed_response = deepFreezePlain(clonePlainData(read("parsed_response"), "V2 parsed response")) as Record<string, unknown>;
  return Object.freeze(output);
}

function cloneCompletedRunGateInput<T>(input: {
  run_sha256: string;
  expected_head: FormalOracleHeadPinV2;
  callback: (capability: FormalOracleCompletedRunCapabilityV2) => Promise<T>;
}): {
  readonly run_sha256: string;
  readonly expected_head: FormalOracleHeadPinV2;
  readonly callback: (capability: FormalOracleCompletedRunCapabilityV2) => Promise<T>;
} {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype
    || Object.getOwnPropertySymbols(input).length || Object.hasOwn(input, "toJSON")) {
    throw new Error("V2 completed gate input 必须是 plain object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const expected = ["run_sha256", "expected_head", "callback"];
  if (JSON.stringify(Object.keys(descriptors).sort()) !== JSON.stringify(expected.slice().sort())) {
    throw new Error("V2 completed gate input 字段集合无效");
  }
  const read = (key: string): unknown => {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      throw new Error(`V2 completed gate input.${key} 含 accessor/隐藏字段`);
    }
    return descriptor.value;
  };
  const callback = read("callback");
  if (typeof callback !== "function") throw new Error("V2 completed callback 必须是函数");
  return Object.freeze({
    run_sha256: clonePlainData(read("run_sha256"), "V2 completed run") as string,
    expected_head: deepFreezePlain(clonePlainData(read("expected_head"), "V2 completed HEAD")) as FormalOracleHeadPinV2,
    callback: callback as (capability: FormalOracleCompletedRunCapabilityV2) => Promise<T>,
  });
}

function cloneExecutionDispatchInput(input: CommitFormalOracleDispatchIntentV2Input): CommitFormalOracleDispatchIntentV2Input {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype
    || Object.getOwnPropertySymbols(input).length || Object.hasOwn(input, "toJSON")) {
    throw new Error("V2 dispatch input 必须是 plain object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const expected = ["run_sha256", "expected_head", "expected_checkpoint_sha256", "intent", "request_envelope", "prepared_provider_request", "created_at"];
  if (JSON.stringify(Object.keys(descriptors).sort()) !== JSON.stringify(expected.slice().sort())) throw new Error("V2 dispatch input 字段集合无效");
  const read = (key: string): unknown => {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) throw new Error(`V2 dispatch input.${key} 含 accessor/隐藏字段`);
    return descriptor.value;
  };
  return Object.freeze({
    run_sha256: clonePlainData(read("run_sha256"), "V2 dispatch run") as string,
    expected_head: deepFreezePlain(clonePlainData(read("expected_head"), "V2 dispatch head")) as FormalOracleHeadPinV2,
    expected_checkpoint_sha256: clonePlainData(read("expected_checkpoint_sha256"), "V2 dispatch checkpoint") as string,
    intent: deepFreezePlain(clonePlainData(read("intent"), "V2 dispatch intent")) as RequestIntentV3,
    request_envelope: read("request_envelope") as FormalOraclePiRequestArtifact,
    prepared_provider_request: read("prepared_provider_request") as FormalOraclePreparedProviderRequestArtifactV1,
    created_at: clonePlainData(read("created_at"), "V2 dispatch created_at") as string,
  });
}

function deepFreezePlain<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreezePlain(child);
    Object.freeze(value);
  }
  return value;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function checkpointCounts(entries: OracleGateCheckpointEntryV1[]): RunCheckpointV2["counts"] {
  return {
    pending: entries.filter((entry) => entry.state === "PENDING").length,
    retry_ready: entries.filter((entry) => entry.state === "RETRY_READY").length,
    dispatch_intent_committed: entries.filter((entry) => entry.state === "DISPATCH_INTENT_COMMITTED").length,
    receipt_committed: entries.filter((entry) => entry.state === "RECEIPT_COMMITTED").length,
    schema_validated_committed: entries.filter((entry) => entry.state === "SCHEMA_VALIDATED_COMMITTED").length,
    blocked_ambiguous: entries.filter((entry) => entry.state === "BLOCKED_AMBIGUOUS").length,
    failed_closed: entries.filter((entry) => entry.state === "FAILED_CLOSED").length,
  };
}

function assertIntentRoots(intent: RequestIntentV3, snapshot: FormalOracleExecutionV2Snapshot): void {
  const run = snapshot.run;
  if (intent.run_sha256 !== run.run_sha256
    || intent.preregistration_bundle_sha256 !== run.preregistration_bundle_sha256
    || intent.schedule_sha256 !== run.schedule_sha256
    || intent.execution_plan_sha256 !== run.execution_plan_sha256
    || intent.genesis_checkpoint_sha256 !== snapshot.genesis_checkpoint.checkpoint_sha256
    || intent.execution_lineage_sha256 !== snapshot.migration.execution_lineage_sha256) {
    throw new Error("V2 request intent 未绑定当前 preregistration/execution lineage");
  }
}

function assertIntentMatchesExecutionPlanV2(intent: RequestIntentV3, expected: FormalOracleExecutionPlanV1["items"][number]): void {
  const projected = {
    request_id:intent.request_id,idempotency_key:intent.idempotency_key,schedule_index:intent.schedule_index,case_id:intent.case_id,
    arm:intent.arm,seed:intent.seed,model:intent.model,request_envelope_sha256:intent.request_envelope_sha256,
    provider_body_sha256:intent.provider_body_sha256,provider_body_profile:intent.provider_body_profile,
    provider_body_dispatch_status:intent.provider_body_dispatch_status,prepared_adapter_version:intent.prepared_adapter_version,
    provider_token_field:intent.provider_token_field,system_prompt_sha256:intent.system_prompt_sha256,user_prompt_sha256:intent.user_prompt_sha256,
    output_schema_sha256:intent.output_schema_sha256,visuals:intent.visuals,transport:intent.transport,temperature:intent.temperature,
    max_input_tokens:intent.max_input_tokens,max_output_tokens:intent.max_output_tokens,timeout_ms:intent.timeout_ms,
    max_attempts:intent.max_attempts,cache_retention:intent.cache_retention,tools_policy:intent.tools_policy,
  };
  if (!privateCanonicalJsonBytes(projected).equals(privateCanonicalJsonBytes(expected))) {
    throw new Error(`V2 request intent ${intent.request_id} 与 frozen execution plan 漂移`);
  }
}

function assertEnvelopeMatchesExecutionPlanV2(
  envelope: FormalOraclePiRequestEnvelopeV1,
  expected: FormalOracleExecutionPlanV1["items"][number],
  spec: FormalOraclePreregistrationBundleV2["formal_spec"],
): void {
  const parsedUser = parseFormalOracleUserPromptBytes(new TextEncoder().encode(envelope.rendered_user_prompt));
  if (envelope.request_id !== expected.request_id || envelope.schedule_index !== expected.schedule_index
    || envelope.case_id !== expected.case_id || envelope.arm !== expected.arm || envelope.model !== expected.model
    || envelope.system_prompt_sha256 !== expected.system_prompt_sha256 || envelope.rendered_user_prompt_sha256 !== expected.user_prompt_sha256
    || envelope.user_template_sha256 !== spec.prompt.user_template_sha256 || envelope.output_schema_sha256 !== expected.output_schema_sha256
    || envelope.seed !== expected.seed || envelope.temperature !== expected.temperature || envelope.max_input_tokens !== expected.max_input_tokens
    || envelope.max_output_tokens !== expected.max_output_tokens || envelope.timeout_ms !== expected.timeout_ms
    || envelope.max_attempts !== expected.max_attempts || envelope.transport !== expected.transport
    || envelope.cache_retention !== expected.cache_retention || envelope.tools_policy !== expected.tools_policy
    || envelope.inner_provider_retries !== 0 || envelope.outer_retry_owner !== "formal_run_store"
    || envelope.provider_binding_status !== "pending_external_runtime_binding"
    || parsedUser.evidence_availability["visual-1"] !== (expected.arm !== "transcript_only")
    || envelope.visuals.length !== expected.visuals.length
    || envelope.visuals.some((visual,index)=>{const planned=expected.visuals[index];return !planned||visual.label!==planned.label
      ||visual.mime_type!==planned.mime_type||visual.sha256!==planned.sha256||visual.byte_length!==planned.byte_length;})) {
    throw new Error("V2 request envelope 未逐字段绑定 execution plan/formal spec");
  }
}

function terminalDetailHashV2(audit: RequestAttemptAuditV5): string {
  return digest(privateCanonicalJsonBytes({
    attempt_sha256: audit.attempt_sha256,
    error_code: audit.error_code,
    error_message: audit.error_message,
    outcome: audit.outcome,
    stop_reason: audit.stop_reason,
  }));
}

function terminalReasonV2(
  snapshot: FormalOracleExecutionV2Snapshot,
  audit: RequestAttemptAuditV5,
  reasonCode: FormalOracleTerminalReasonCodeV2,
  createdAt: string,
): FormalOracleTerminalReasonV2 {
  const reason: FormalOracleTerminalReasonV2 = {
    schema_version: "formal-oracle-terminal-reason-v2",
    terminal_reason_sha256: "0".repeat(64),
    run_sha256: snapshot.run.run_sha256,
    preregistration_bundle_sha256: snapshot.run.preregistration_bundle_sha256,
    schedule_sha256: snapshot.run.schedule_sha256,
    execution_plan_sha256: snapshot.run.execution_plan_sha256,
    genesis_checkpoint_sha256: snapshot.genesis_checkpoint.checkpoint_sha256,
    execution_lineage_sha256: snapshot.migration.execution_lineage_sha256,
    run_contract_schema_version: "oracle-gate-formal-run-contract-v2",
    execution_record_version: "formal-oracle-execution-records-v2",
    api_execution_allowed: false,
    request_id: audit.request_id,
    reason_code: reasonCode,
    source_attempt_schema_version: "oracle-gate-request-attempt-audit-v5",
    source_attempt_sha256: audit.attempt_sha256,
    detail_sha256: terminalDetailHashV2(audit),
    created_at: createdAt,
  };
  reason.terminal_reason_sha256 = hashFormalOracleTerminalReasonV2(reason);
  validationError("V2 terminal reason", validateFormalOracleTerminalReasonV2(reason));
  return reason;
}

function exactPin(expected: FormalOracleHeadPinV1, actual: FormalOraclePreregisteredRunHeadV2): void {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)
    || !exactKeys(expected as unknown as Record<string, unknown>, ["schema_version", "run_sha256", "generation", "checkpoint_sha256"])
    || expected.schema_version !== "formal-oracle-head-pin-v1" || expected.run_sha256 !== actual.run_sha256
    || expected.generation !== 0 || expected.checkpoint_sha256 !== actual.checkpoint_sha256) {
    throw new Error("V2 preregistration HEAD pin 不匹配：检测到 stale caller 或 rollback");
  }
}

function assertInput(input: CreateFormalOraclePreregisteredRunV2Input, runStoreUri: string): void {
  validationError("V2 preregistration bundle", validateFormalOraclePreregistrationBundleV2(input.preregistration_bundle));
  validationError("V2 run", validateFormalRunContractV2(input.run));
  validationError("V2 run/bundle", validateFormalRunContractV2AgainstPreregistrationBundle(input.run, input.preregistration_bundle));
  validationError("V2 genesis checkpoint", validateRunCheckpoint(input.initial_checkpoint));
  if (input.run.run_store_uri !== runStoreUri) throw new Error("V2 run_store_uri 与 preregistration store 根不一致");
  if (input.initial_checkpoint.generation !== 0 || input.initial_checkpoint.previous_checkpoint_sha256 !== null
    || input.initial_checkpoint.run_state !== "SEALED_READY" || input.initial_checkpoint.terminal_reason_sha256 !== null) {
    throw new Error("V2 preregistration 只接受 generation-0 SEALED_READY genesis");
  }
  if (input.initial_checkpoint.run_sha256 !== input.run.run_sha256
    || input.initial_checkpoint.schedule_sha256 !== input.run.schedule_sha256
    || input.initial_checkpoint.request_count !== input.run.request_count
    || hashRunCheckpoint(input.initial_checkpoint) !== input.initial_checkpoint.checkpoint_sha256) {
    throw new Error("V2 genesis 未绑定 run/schedule/request_count");
  }
  assertFormalOracleStructuralScheduleAgainstRun(input.structural_schedule, input.preregistration_bundle.formal_spec, input.run);
  assertFormalOracleExecutionPlanAgainstRun(input.execution_plan, input.structural_schedule, input.preregistration_bundle.formal_spec, input.run);
  assertFormalOracleGenesisMatchesPlans(input.initial_checkpoint, input.structural_schedule, input.execution_plan);
  const genesisTime = Date.parse(input.initial_checkpoint.created_at);
  if (Date.parse(input.preregistration_bundle.rating_plan.created_at) > genesisTime) throw new Error("rating plan 必须在 generation-0 前预注册");
}

/**
 * Create-once private store for the V2 preregistration DAG, its exact genesis,
 * and the breaking V2 transport/schema execution lineage that migrates the
 * same sole HEAD. External WORM, evidence authenticity, semantic blind review,
 * statistics and the formal batch orchestrator remain separate fail-closed
 * gates. No method authorizes an API call.
 */
export class FormalOraclePreregistrationStoreV2 {
  readonly runStoreUri: string;
  readonly privateFs: PrivateContentAddressedFs;

  constructor(readonly dataDir: string, options: PrivateContentAddressedFsOptions & { run_store_uri?: string } = {}) {
    this.runStoreUri = options.run_store_uri ?? DEFAULT_STORE_URI;
    this.privateFs = new PrivateContentAddressedFs(dataDir, this.runStoreUri, options);
  }

  async createPreregisteredGenesis(input: CreateFormalOraclePreregisteredRunV2Input): Promise<FormalOraclePreregisteredRunV2Snapshot> {
    const frozenInput = deepFreezePlain(clonePlainData(input, "V2 preregistration input"));
    assertInput(frozenInput, this.runStoreUri);
    return this.withLock(frozenInput.run.run_sha256, () => this.createUnlocked(frozenInput));
  }

  /**
   * Create and reload genesis while retaining the same owner-nonce lock for
   * the caller's callback. The callback receives only the exact externally
   * expected generation-0 pin. Throwing from the callback never rewinds HEAD;
   * it merely prevents any callback-scoped composition capability escaping.
   */
  async createPreregisteredGenesisWithPinnedSnapshot<T>(
    input: CreateFormalOraclePreregisteredRunV2Input,
    expectedHead: FormalOracleHeadPinV1,
    callback: (snapshot: FormalOraclePreregisteredRunV2Snapshot) => Promise<T>,
  ): Promise<T> {
    if (typeof callback !== "function") throw new Error("V2 preregistration callback 必须是函数");
    const frozenInput = deepFreezePlain(clonePlainData(input, "V2 preregistration input"));
    const frozenExpectedHead = deepFreezePlain(clonePlainData(expectedHead, "V2 expected genesis HEAD"));
    assertInput(frozenInput, this.runStoreUri);
    exactPin(frozenExpectedHead, {
      schema_version: "formal-oracle-preregistered-run-head-v2",
      run_sha256: frozenInput.run.run_sha256,
      generation: 0,
      checkpoint_sha256: frozenInput.initial_checkpoint.checkpoint_sha256,
      updated_at: frozenInput.initial_checkpoint.created_at,
      execution_migration_status: "pending_formal_run_store_v2_execution_pipeline",
      api_execution_allowed: false,
    });
    return this.withLock(frozenInput.run.run_sha256, async () => callback(await this.createUnlocked(frozenInput)));
  }

  async inspectPreregisteredGenesis(runSha256: string, expectedHead: FormalOracleHeadPinV1): Promise<FormalOraclePreregisteredRunV2Snapshot> {
    assertPrivateSha256(runSha256, "run_sha256");
    const frozenHead = deepFreezePlain(clonePlainData(expectedHead, "V2 expected HEAD"));
    if (!frozenHead || typeof frozenHead !== "object" || Array.isArray(frozenHead)
      || !exactKeys(frozenHead as unknown as Record<string, unknown>, ["schema_version","run_sha256","generation","checkpoint_sha256"])) {
      throw new Error("V2 expected HEAD 字段集合无效");
    }
    return this.withLock(runSha256, () => this.load(runSha256, frozenHead));
  }

  /**
   * One-time, same-HEAD migration from the sealed V2 preregistration genesis to
   * the breaking V2 execution lineage. No execution record is copied to a V1
   * store and no second HEAD is created. This initializes a non-executable
   * state machine only; it does not mint a dispatch/network capability.
   */
  async migratePreregisteredGenesisToExecutionV2(
    rawInput: MigrateFormalOraclePreregisteredRunV2Input,
  ): Promise<FormalOracleExecutionV2Snapshot> {
    const input = deepFreezePlain(clonePlainData(rawInput, "V2 execution migration input"));
    assertPrivateSha256(input.run_sha256, "run_sha256");
    canonicalTime(input.migrated_at, "migrated_at");
    return this.withLock(input.run_sha256, async () => {
      const preregistered = await this.load(input.run_sha256, input.expected_genesis_head);
      if (Date.parse(input.migrated_at) < Date.parse(preregistered.initial_checkpoint.created_at)) {
        throw new Error("V2 execution migration 时间不得早于 genesis");
      }
      const lineageInput = {
        run_sha256: preregistered.run.run_sha256,
        preregistration_bundle_sha256: preregistered.preregistration_bundle.preregistration_bundle_sha256,
        schedule_sha256: preregistered.run.schedule_sha256,
        execution_plan_sha256: preregistered.execution_plan.execution_plan_sha256,
        genesis_checkpoint_sha256: preregistered.initial_checkpoint.checkpoint_sha256,
      };
      const executionLineageSha256 = hashFormalOracleExecutionLineageV2(lineageInput);
      const migration: FormalOracleExecutionMigrationV1 = {
        schema_version: "formal-oracle-execution-migration-v1",
        migration_sha256: "0".repeat(64),
        ...lineageInput,
        execution_lineage_sha256: executionLineageSha256,
        from_head_schema_version: "formal-oracle-preregistered-run-head-v2",
        from_generation: 0,
        from_checkpoint_sha256: preregistered.initial_checkpoint.checkpoint_sha256,
        to_checkpoint_schema_version: "oracle-gate-run-checkpoint-v2",
        to_generation: 1,
        migrated_at: input.migrated_at,
        migration_status: "execution_v2_state_machine_initialized_non_executable",
        external_monotonic_worm_status: "pending_external_monotonic_worm",
        api_execution_allowed: false,
      };
      migration.migration_sha256 = hashFormalOracleExecutionMigrationV1(migration);
      validationError("V2 execution migration", validateFormalOracleExecutionMigrationV1(migration));
      const checkpoint: RunCheckpointV2 = {
        schema_version: "oracle-gate-run-checkpoint-v2",
        checkpoint_sha256: "0".repeat(64),
        run_sha256: preregistered.run.run_sha256,
        preregistration_bundle_sha256: preregistered.preregistration_bundle.preregistration_bundle_sha256,
        execution_plan_sha256: preregistered.execution_plan.execution_plan_sha256,
        genesis_checkpoint_sha256: preregistered.initial_checkpoint.checkpoint_sha256,
        execution_lineage_sha256: executionLineageSha256,
        migration_sha256: migration.migration_sha256,
        schedule_sha256: preregistered.run.schedule_sha256,
        generation: 1,
        previous_checkpoint_sha256: preregistered.initial_checkpoint.checkpoint_sha256,
        created_at: input.migrated_at,
        run_state: "SEALED_READY",
        terminal_reason_sha256: null,
        request_count: preregistered.run.request_count,
        counts: clonePlainData(preregistered.initial_checkpoint.counts, "V2 migration counts"),
        entries: clonePlainData(preregistered.initial_checkpoint.entries, "V2 migration entries"),
        execution_record_version: "formal-oracle-execution-records-v2",
        api_execution_allowed: false,
      };
      checkpoint.checkpoint_sha256 = hashRunCheckpointV2(checkpoint);
      validationError("V2 migration checkpoint", validateRunCheckpointV2(checkpoint));
      validationError("V2 execution migration bridge", validateFormalOracleExecutionMigrationBridgeV1({
        genesis: preregistered.initial_checkpoint, migration, checkpoint,
      }));
      const head: FormalOracleRunHeadV2 = {
        schema_version: "formal-oracle-run-head-v2",
        head_record_sha256: "0".repeat(64),
        run_sha256: preregistered.run.run_sha256,
        preregistration_bundle_sha256: preregistered.preregistration_bundle.preregistration_bundle_sha256,
        execution_lineage_sha256: executionLineageSha256,
        genesis_checkpoint_sha256: preregistered.initial_checkpoint.checkpoint_sha256,
        migration_sha256: migration.migration_sha256,
        generation: 1,
        checkpoint_sha256: checkpoint.checkpoint_sha256,
        updated_at: input.migrated_at,
        execution_status: "execution_v2_initialized_non_executable",
        external_monotonic_worm_status: "pending_external_monotonic_worm",
        api_execution_allowed: false,
      };
      head.head_record_sha256 = hashFormalOracleRunHeadV2(head);
      validationError("V2 execution HEAD", validateFormalOracleRunHeadV2(head));
      await this.privateFs.publishImmutableObject(
        this.objectDirectory(input.run_sha256, "execution-migrations", migration.migration_sha256),
        "migration.json",
        privateCanonicalJsonBytes(migration),
      );
      await this.privateFs.publishImmutableObject(
        this.objectDirectory(input.run_sha256, "checkpoints", checkpoint.checkpoint_sha256),
        "checkpoint.json",
        privateCanonicalJsonBytes(checkpoint),
      );
      const current = parseCanonical<FormalOraclePreregisteredRunHeadV2>(
        await this.privateFs.readFile(this.headPath(input.run_sha256)),
        "V2 preregistration HEAD CAS",
      );
      exactPin(input.expected_genesis_head, current);
      await this.privateFs.replaceFileAtomic(this.headPath(input.run_sha256), privateCanonicalJsonBytes(head));
      return this.loadExecutionInitialized(input.run_sha256, this.pinFromExecutionHead(head));
    });
  }

  async inspectExecutionV2(
    runSha256: string,
    expectedHead: FormalOracleHeadPinV2,
  ): Promise<FormalOracleExecutionV2Snapshot> {
    assertPrivateSha256(runSha256, "run_sha256");
    const frozenHead = deepFreezePlain(clonePlainData(expectedHead, "V2 expected execution HEAD"));
    return this.withLock(runSha256, () => this.loadExecutionInitialized(runSha256, frozenHead));
  }

  async resumeExecutionV2(runSha256: string, expectedHead: FormalOracleHeadPinV2): Promise<FormalOracleResumePlanV2> {
    assertPrivateSha256(runSha256, "run_sha256");
    const frozenHead = deepFreezePlain(clonePlainData(expectedHead, "V2 resume HEAD"));
    return this.withLock(runSha256, async () => {
      const snapshot = await this.loadExecutionInitialized(runSha256, frozenHead);
      const requests = snapshot.checkpoint.entries.map((entry) => ({
        request_id: entry.request_id,
        state: entry.state,
        resume_action: entry.resume_action,
      }));
      return deepFreezePlain({
        run_sha256: snapshot.run.run_sha256,
        checkpoint_sha256: snapshot.checkpoint.checkpoint_sha256,
        generation: snapshot.checkpoint.generation,
        run_state: snapshot.checkpoint.run_state,
        blocked_ambiguous: requests.some((entry) => entry.state === "DISPATCH_INTENT_COMMITTED"
          || entry.state === "BLOCKED_AMBIGUOUS" || entry.resume_action === "block_ambiguous"),
        requests,
        api_execution_allowed: false as const,
      });
    });
  }

  async withPinnedCompletedRunV2<T>(input: {
    run_sha256: string;
    expected_head: FormalOracleHeadPinV2;
    callback: (capability: FormalOracleCompletedRunCapabilityV2) => Promise<T>;
  }): Promise<T> {
    const frozenInput = cloneCompletedRunGateInput(input);
    assertPrivateSha256(frozenInput.run_sha256, "run_sha256");
    return this.withLock(frozenInput.run_sha256, async () => {
      const snapshot = await this.loadExecutionInitialized(frozenInput.run_sha256, frozenInput.expected_head);
      if (snapshot.checkpoint.run_state !== "EXECUTION_COMPLETE" || snapshot.checkpoint.terminal_reason_sha256 !== null
        || snapshot.checkpoint.entries.some((entry) => entry.state !== "SCHEMA_VALIDATED_COMMITTED"
          || !entry.active_intent_sha256 || !entry.latest_attempt_audit_sha256 || !entry.committed_request_sha256)) {
        throw new Error("V2 completed gate 只接受全部 request transport/schema committed 的 terminal HEAD");
      }
      const intentsBySha = new Map<string, RequestIntentV3>();
      const attemptsBySha = new Map<string, RequestAttemptAuditV5>();
      for (const checkpoint of snapshot.checkpoints) {
        for (const [index, entry] of checkpoint.entries.entries()) {
          if (entry.active_intent_sha256 && !intentsBySha.has(entry.active_intent_sha256)) {
            const intent = await this.loadIntentV2(snapshot.run, snapshot.preregistration_bundle, snapshot.execution_plan, index, entry.active_intent_sha256);
            intentsBySha.set(intent.intent_sha256, intent);
          }
          if (entry.latest_attempt_audit_sha256 && !attemptsBySha.has(entry.latest_attempt_audit_sha256)) {
            const audit = await this.loadAttemptV2(snapshot, index, entry.latest_attempt_audit_sha256);
            attemptsBySha.set(audit.attempt_sha256, audit);
          }
        }
      }
      const intents = [...intentsBySha.values()].sort((left, right) => left.schedule_index - right.schedule_index
        || left.attempt_ordinal - right.attempt_ordinal);
      const attempts = intents.map((intent) => {
        const audit = [...attemptsBySha.values()].find((candidate) => candidate.intent_sha256 === intent.intent_sha256);
        if (!audit) throw new Error(`V2 completed gate 缺少 intent ${intent.intent_sha256} 的 audit`);
        return audit;
      });
      const commits: CommittedRequestV4[] = [];
      const responses: FormalOracleCompletedTransportSchemaRunV2["canonical_responses"][number][] = [];
      for (const [index, entry] of snapshot.checkpoint.entries.entries()) {
        const committed = await this.loadCommittedRequestV2(snapshot, index, entry.committed_request_sha256!);
        const intent = intentsBySha.get(committed.intent_sha256), audit = attemptsBySha.get(committed.attempt_sha256);
        if (!intent || !audit) throw new Error(`V2 completed request ${entry.request_id} provenance 不完整`);
        commits.push(committed);
        responses.push({ request_id: entry.request_id, schedule_index: index,
          canonical_response_bytes_sha256: committed.canonical_response_bytes_sha256,
          canonical_response_commitment_sha256: committed.canonical_response_commitment_sha256,
          response: await this.verifyResponseObjectsV2(snapshot, intent, audit) });
      }
      const completed = deepFreezePlain({
        schema_version: "formal-oracle-completed-transport-schema-run-v2" as const,
        status: "completed_v2_transport_and_schema_chain_revalidated" as const,
        run: clonePlainData(snapshot.run, "V2 completed run"),
        preregistration_bundle: clonePlainData(snapshot.preregistration_bundle, "V2 completed bundle"),
        structural_schedule: clonePlainData(snapshot.structural_schedule, "V2 completed schedule"),
        execution_plan: clonePlainData(snapshot.execution_plan, "V2 completed plan"),
        genesis_checkpoint: clonePlainData(snapshot.genesis_checkpoint, "V2 completed genesis"),
        migration: clonePlainData(snapshot.migration, "V2 completed migration"),
        head_pin: clonePlainData(snapshot.head_pin, "V2 completed head"),
        checkpoints: clonePlainData(snapshot.checkpoints, "V2 completed checkpoints"),
        intents: clonePlainData(intents, "V2 completed intents"),
        attempts: clonePlainData(attempts, "V2 completed attempts"),
        committed_requests: clonePlainData(commits, "V2 completed commits"),
        canonical_responses: clonePlainData(responses, "V2 completed responses"),
        external_monotonic_worm_status: "pending_external_monotonic_worm" as const,
        semantic_review_status: "pending_external_blind_review" as const,
        api_execution_allowed: false as const,
      }) as Readonly<FormalOracleCompletedTransportSchemaRunV2>;
      const capability = new CompletedRunCapabilityV2(completed);
      activeCompletedRunCapabilitiesV2.add(capability);
      try { return await frozenInput.callback(capability); }
      finally { activeCompletedRunCapabilitiesV2.delete(capability); }
    });
  }

  requestEnvelopeObjectUriV2(runSha256: string, requestEnvelopeSha256: string): string {
    assertPrivateSha256(runSha256, "run_sha256"); assertPrivateSha256(requestEnvelopeSha256, "request_envelope_sha256");
    return this.objectPath(runSha256, "request-envelopes", requestEnvelopeSha256, "request-envelope.json");
  }

  providerBodyObjectUriV2(runSha256: string, providerBodySha256: string): string {
    assertPrivateSha256(runSha256, "run_sha256"); assertPrivateSha256(providerBodySha256, "provider_body_sha256");
    return this.objectPath(runSha256, "provider-bodies", providerBodySha256, "provider-body.json");
  }

  async commitDispatchIntentV2(rawInput: CommitFormalOracleDispatchIntentV2Input): Promise<FormalOracleExecutionV2Snapshot> {
    const input = cloneExecutionDispatchInput(rawInput);
    assertPrivateSha256(input.run_sha256,"run_sha256");assertPrivateSha256(input.expected_checkpoint_sha256,"expected_checkpoint_sha256");
    canonicalTime(input.created_at,"created_at");validationError("V2 request intent",validateRequestIntentV3(input.intent));
    return this.withLock(input.run_sha256,async()=>{
      const snapshot=await this.loadExecutionInitialized(input.run_sha256,input.expected_head);
      if(input.expected_head.checkpoint_sha256!==input.expected_checkpoint_sha256
        ||snapshot.checkpoint.checkpoint_sha256!==input.expected_checkpoint_sha256)throw new Error("V2 expected HEAD/checkpoint CAS 不一致");
      if(snapshot.head.execution_status!=="execution_v2_initialized_non_executable"&&snapshot.head.execution_status!=="execution_v2_active_non_executable")throw new Error("V2 terminal HEAD 不得 dispatch");
      const entryIndex=snapshot.checkpoint.entries.findIndex((entry)=>entry.request_id===input.intent.request_id);
      if(entryIndex<0)throw new Error("V2 request intent 不在 frozen schedule");const prior=snapshot.checkpoint.entries[entryIndex];
      if((prior.state!=="PENDING"&&prior.state!=="RETRY_READY")||prior.resume_action!=="dispatch_new_attempt"||prior.attempts_used>=prior.max_attempts)throw new Error("V2 dispatch 只允许有预算的 PENDING/RETRY_READY");
      if(input.intent.idempotency_key!==prior.idempotency_key||input.intent.max_attempts!==prior.max_attempts
        ||input.intent.attempt_ordinal!==prior.attempts_used+1||input.intent.schedule_index!==entryIndex)throw new Error("V2 intent 未绑定当前 request/ordinal");
      assertIntentRoots(input.intent,snapshot);assertIntentMatchesExecutionPlanV2(input.intent,snapshot.execution_plan.items[entryIndex]);
      if(Date.parse(input.intent.prepared_at)<Date.parse(snapshot.checkpoint.created_at)||Date.parse(input.intent.prepared_at)>Date.parse(input.created_at))throw new Error("V2 dispatch 时间未闭合");
      assertFormalOraclePiRequestArtifact(input.request_envelope);assertFormalOraclePreparedProviderRequestArtifact(input.prepared_provider_request);
      const envelope=parseFormalOraclePiRequestEnvelopeBytes(input.request_envelope.bytes);if(envelope.payload_sha256!==input.request_envelope.payload_sha256)throw new Error("V2 envelope branded hash 漂移");
      assertEnvelopeMatchesExecutionPlanV2(envelope.envelope,snapshot.execution_plan.items[entryIndex],snapshot.preregistration_bundle.formal_spec);
      const prepared=parseFormalOraclePreparedProviderRequestBytes({request_envelope:envelope,provider_body_bytes:input.prepared_provider_request.body_bytes});
      const envelopeBytes=Buffer.from(envelope.bytes),bodyBytes=Buffer.from(prepared.body_bytes);
      if(digest(envelopeBytes)!==input.intent.request_envelope_sha256||digest(bodyBytes)!==input.intent.provider_body_sha256
        ||input.intent.request_envelope_object_uri!==this.requestEnvelopeObjectUriV2(input.run_sha256,input.intent.request_envelope_sha256)
        ||input.intent.provider_body_object_uri!==this.providerBodyObjectUriV2(input.run_sha256,input.intent.provider_body_sha256))throw new Error("V2 envelope/body bytes 或 URI 未绑定 intent");
      await this.privateFs.publishImmutableObject(this.objectDirectory(input.run_sha256,"request-envelopes",input.intent.request_envelope_sha256),"request-envelope.json",envelopeBytes);
      await this.privateFs.publishImmutableObject(this.objectDirectory(input.run_sha256,"provider-bodies",input.intent.provider_body_sha256),"provider-body.json",bodyBytes);
      await this.privateFs.publishImmutableObject(this.objectDirectory(input.run_sha256,"request-intents-v3",input.intent.intent_sha256),"intent.json",privateCanonicalJsonBytes(input.intent));
      const entries=snapshot.checkpoint.entries.map((entry,index):OracleGateCheckpointEntryV1=>index===entryIndex?{...entry,state:"DISPATCH_INTENT_COMMITTED",resume_action:"block_ambiguous",active_intent_sha256:input.intent.intent_sha256}:{...entry});
      const next=this.nextExecutionCheckpoint(snapshot,entries,input.created_at,"RUNNING",null);
      return this.commitExecutionCheckpointUnlocked(snapshot,next);
    });
  }

  async withSingleConsumeDispatchLeaseV2<T>(
    input: CommitFormalOracleDispatchIntentV2Input,
    callback: (lease: FormalOracleSingleConsumeDispatchLeaseV2, snapshot: FormalOracleExecutionV2Snapshot) => Promise<T>,
  ): Promise<T> {
    if (typeof callback !== "function") throw new Error("Formal Oracle V2 dispatch lease callback 必须是函数");
    const frozenInput = cloneExecutionDispatchInput(input);
    const snapshot = await this.commitDispatchIntentV2(frozenInput);
    const lease = issueFormalOracleSingleConsumeDispatchLeaseV2({
      run_sha256: snapshot.run.run_sha256,
      execution_plan_sha256: snapshot.execution_plan.execution_plan_sha256,
      request_id: frozenInput.intent.request_id,
      intent_sha256: frozenInput.intent.intent_sha256,
      attempt_ordinal: frozenInput.intent.attempt_ordinal,
      request_envelope_sha256: frozenInput.intent.request_envelope_sha256,
      provider_body_sha256: frozenInput.intent.provider_body_sha256,
      dispatch_head: Object.freeze({ ...snapshot.head_pin }),
    });
    try { return await callback(lease, snapshot); }
    finally { revokeFormalOracleDispatchLeaseV2(lease); }
  }

  async commitAttemptAuditV2(rawInput: CommitFormalOracleAttemptAuditV2Input): Promise<FormalOracleExecutionV2Snapshot> {
    const input = cloneExecutionAttemptInput(rawInput);
    assertPrivateSha256(input.run_sha256, "run_sha256");
    assertPrivateSha256(input.expected_checkpoint_sha256, "expected_checkpoint_sha256");
    canonicalTime(input.created_at, "created_at");
    validationError("V2 attempt audit", validateRequestAttemptAuditV5(input.audit));
    return this.withLock(input.run_sha256, async () => {
      const snapshot = await this.loadExecutionInitialized(input.run_sha256, input.expected_head);
      this.assertExpectedExecutionCheckpoint(snapshot, input.expected_checkpoint_sha256);
      const entryIndex = snapshot.checkpoint.entries.findIndex((entry) => entry.request_id === input.audit.request_id);
      if (entryIndex < 0) throw new Error("V2 attempt request 不在 frozen schedule");
      const entry = snapshot.checkpoint.entries[entryIndex];
      if (entry.state !== "DISPATCH_INTENT_COMMITTED" || !entry.active_intent_sha256) {
        throw new Error("V2 attempt audit 只能从 durable DISPATCH_INTENT_COMMITTED 提交");
      }
      const intent = await this.loadIntentV2(snapshot.run, snapshot.preregistration_bundle, snapshot.execution_plan, entryIndex, entry.active_intent_sha256);
      validationError("V2 attempt against intent", validateRequestAttemptAuditV5AgainstIntentV3(intent, input.audit));
      if (input.audit.attempt_sha256 !== hashRequestAttemptAuditV5(input.audit)
        || input.audit.attempt_ordinal !== entry.attempts_used + 1
        || Date.parse(input.audit.started_at) < Date.parse(snapshot.checkpoint.created_at)
        || Date.parse(input.audit.finished_at) > Date.parse(input.created_at)
        || Date.parse(snapshot.checkpoint.created_at) > Date.parse(input.created_at)) {
        throw new Error("V2 attempt ordinal/time 未闭合 durable dispatch checkpoint");
      }
      const durableEnvelope = await this.privateFs.readFile(intent.request_envelope_object_uri);
      const durableBody = await this.privateFs.readFile(intent.provider_body_object_uri);
      if (digest(durableEnvelope) !== intent.request_envelope_sha256 || digest(durableBody) !== intent.provider_body_sha256) {
        throw new Error("V2 attempt 未绑定 durable envelope/provider body");
      }
      if (input.audit.outcome === "result_received" || input.audit.outcome === "invalid_response_received"
        || (input.audit.outcome === "unknown" && input.transport_capture_artifact !== undefined)) {
        await this.persistAndVerifyTransportCaptureV2(snapshot, intent, input.audit, input.transport_capture_artifact);
      } else if (input.transport_capture_artifact !== undefined || input.audit.transport_capture_record_sha256 !== null
        || input.audit.transport_capture_record_object_uri !== null) {
        throw new Error("V2 无网络 capture 的 attempt 不得携带 transport capture");
      }
      if (input.audit.outcome === "result_received") {
        await this.persistValidResponseV2(snapshot, intent, input.audit, input.response_artifact, input.parsed_response);
        if (input.invalid_response_artifact !== undefined) throw new Error("V2 valid result 不得携带 invalid artifact");
      } else if (input.audit.outcome === "invalid_response_received") {
        await this.persistInvalidResponseV2(snapshot, intent, input.audit, input.invalid_response_artifact, entryIndex);
        if (input.response_artifact !== undefined || input.parsed_response !== undefined) throw new Error("V2 invalid response 不得携带 valid response");
      } else if (input.response_artifact !== undefined || input.invalid_response_artifact !== undefined || input.parsed_response !== undefined) {
        throw new Error("V2 非 response outcome 不得携带 response objects");
      }
      await this.privateFs.publishImmutableObject(
        this.objectDirectory(input.run_sha256, "attempt-audits-v5", input.audit.attempt_sha256),
        "attempt-audit.json",
        privateCanonicalJsonBytes(input.audit),
      );
      const unknown = input.audit.outcome === "unknown";
      const invalid = input.audit.outcome === "invalid_response_received";
      const reason = unknown || invalid
        ? terminalReasonV2(snapshot, input.audit, invalid ? "invalid_response_received" : "ambiguous_unknown_attempt", input.created_at)
        : null;
      if (reason) await this.persistTerminalReasonV2(input.run_sha256, reason);
      const entries = snapshot.checkpoint.entries.map((prior, index): OracleGateCheckpointEntryV1 => index === entryIndex ? {
        ...prior,
        state: unknown ? "BLOCKED_AMBIGUOUS" : invalid ? "FAILED_CLOSED" : "RECEIPT_COMMITTED",
        resume_action: unknown ? "block_ambiguous" : invalid ? "block_failed" : "verify_receipt",
        attempts_used: prior.attempts_used + 1,
        latest_attempt_audit_sha256: input.audit.attempt_sha256,
      } : { ...prior });
      const next = this.nextExecutionCheckpoint(snapshot, entries, input.created_at,
        unknown ? "BLOCKED_AMBIGUOUS" : invalid ? "FAILED_CLOSED" : "RUNNING",
        reason?.terminal_reason_sha256 ?? null);
      return this.commitExecutionCheckpointUnlocked(snapshot, next);
    });
  }

  async markRetryReadyV2(rawInput: FormalOracleExecutionMutationV2Input): Promise<FormalOracleExecutionV2Snapshot> {
    const input = deepFreezePlain(clonePlainData(rawInput, "V2 retry input"));
    canonicalTime(input.created_at, "created_at");
    return this.withLock(input.run_sha256, async () => {
      const snapshot = await this.loadExecutionInitialized(input.run_sha256, input.expected_head);
      this.assertExpectedExecutionCheckpoint(snapshot, input.expected_checkpoint_sha256);
      const index = snapshot.checkpoint.entries.findIndex((entry) => entry.request_id === input.request_id);
      if (index < 0) throw new Error("V2 retry request 不在 schedule");
      const entry = snapshot.checkpoint.entries[index];
      if (entry.state !== "RECEIPT_COMMITTED" || !entry.latest_attempt_audit_sha256) throw new Error("V2 retry 只允许 RECEIPT_COMMITTED");
      const audit = await this.loadAttemptV2(snapshot, index, entry.latest_attempt_audit_sha256);
      if (audit.outcome !== "not_sent" && audit.outcome !== "no_result_confirmed") throw new Error("V2 retry 仅允许明确无结果");
      if (Date.parse(audit.finished_at) > Date.parse(input.created_at) || Date.parse(snapshot.checkpoint.created_at) > Date.parse(input.created_at)) {
        throw new Error("V2 retry checkpoint 时间回退");
      }
      const exhausted = entry.attempts_used >= entry.max_attempts;
      if (!exhausted && audit.automatic_retry_allowed !== true) throw new Error("V2 retry 未获 audit 明确允许");
      const reason = exhausted ? terminalReasonV2(snapshot, audit, "attempt_budget_exhausted", input.created_at) : null;
      if (reason) await this.persistTerminalReasonV2(input.run_sha256, reason);
      const entries = snapshot.checkpoint.entries.map((prior, entryIndex): OracleGateCheckpointEntryV1 => entryIndex === index ? {
        ...prior,
        state: exhausted ? "FAILED_CLOSED" : "RETRY_READY",
        resume_action: exhausted ? "block_failed" : "dispatch_new_attempt",
      } : { ...prior });
      return this.commitExecutionCheckpointUnlocked(snapshot, this.nextExecutionCheckpoint(snapshot, entries, input.created_at,
        exhausted ? "FAILED_CLOSED" : "RUNNING", reason?.terminal_reason_sha256 ?? null));
    });
  }

  async commitSchemaValidatedRequestV2(rawInput: CommitFormalOracleSchemaValidatedRequestV2Input): Promise<FormalOracleExecutionV2Snapshot> {
    const input = deepFreezePlain(clonePlainData(rawInput, "V2 schema commit input"));
    canonicalTime(input.created_at, "created_at");
    return this.withLock(input.run_sha256, async () => {
      const snapshot = await this.loadExecutionInitialized(input.run_sha256, input.expected_head);
      this.assertExpectedExecutionCheckpoint(snapshot, input.expected_checkpoint_sha256);
      const index = snapshot.checkpoint.entries.findIndex((entry) => entry.request_id === input.request_id);
      if (index < 0) throw new Error("V2 schema commit request 不在 schedule");
      const entry = snapshot.checkpoint.entries[index];
      if (entry.state !== "RECEIPT_COMMITTED" || !entry.active_intent_sha256 || !entry.latest_attempt_audit_sha256) {
        throw new Error("V2 schema commit 只允许 RECEIPT_COMMITTED");
      }
      const intent = await this.loadIntentV2(snapshot.run, snapshot.preregistration_bundle, snapshot.execution_plan, index, entry.active_intent_sha256);
      const audit = await this.loadAttemptV2(snapshot, index, entry.latest_attempt_audit_sha256);
      validationError("V2 committed request", validateCommittedRequestV4AgainstAttemptV5(intent, audit, input.committed_request));
      if (input.committed_request.committed_request_sha256 !== hashCommittedRequestV4(input.committed_request)
        || input.committed_request.validator_version !== ORACLE_GATE_RESPONSE_VALIDATOR_VERSION
        || snapshot.execution_plan.items[index].output_schema_sha256 !== ORACLE_GATE_RESPONSE_SCHEMA_SHA256
        || Date.parse(input.committed_request.transport_and_schema_verified_at) < Date.parse(audit.finished_at)
        || Date.parse(input.committed_request.transport_and_schema_verified_at) > Date.parse(input.created_at)) {
        throw new Error("V2 commit validator/schema/time 未闭合");
      }
      const parsed = await this.verifyResponseObjectsV2(snapshot, intent, audit);
      validateOracleGateResponse(parsed, snapshot.execution_plan.items[index].arm);
      await this.privateFs.publishImmutableObject(
        this.objectDirectory(input.run_sha256, "committed-requests-v4", input.committed_request.committed_request_sha256),
        "committed-request.json",
        privateCanonicalJsonBytes(input.committed_request),
      );
      const entries = snapshot.checkpoint.entries.map((prior, entryIndex): OracleGateCheckpointEntryV1 => entryIndex === index ? {
        ...prior,
        state: "SCHEMA_VALIDATED_COMMITTED",
        resume_action: "skip_schema_validated",
        committed_request_sha256: input.committed_request.committed_request_sha256,
      } : { ...prior });
      return this.commitExecutionCheckpointUnlocked(snapshot,
        this.nextExecutionCheckpoint(snapshot, entries, input.created_at, "RUNNING", null));
    });
  }

  async failRunRequestV2(rawInput: FormalOracleExecutionMutationV2Input): Promise<FormalOracleExecutionV2Snapshot> {
    const input = deepFreezePlain(clonePlainData(rawInput, "V2 failure input"));
    canonicalTime(input.created_at, "created_at");
    return this.withLock(input.run_sha256, async () => {
      const snapshot = await this.loadExecutionInitialized(input.run_sha256, input.expected_head);
      this.assertExpectedExecutionCheckpoint(snapshot, input.expected_checkpoint_sha256);
      const index = snapshot.checkpoint.entries.findIndex((entry) => entry.request_id === input.request_id);
      if (index < 0) throw new Error("V2 failed request 不在 schedule");
      const entry = snapshot.checkpoint.entries[index];
      if (entry.state !== "RECEIPT_COMMITTED" || entry.attempts_used < entry.max_attempts || !entry.latest_attempt_audit_sha256) {
        throw new Error("V2 failRunRequest 只允许已耗尽 attempt 的 receipt");
      }
      const audit = await this.loadAttemptV2(snapshot, index, entry.latest_attempt_audit_sha256);
      if (audit.outcome !== "not_sent" && audit.outcome !== "no_result_confirmed") throw new Error("V2 exhausted failure 必须来自明确无结果");
      if (Date.parse(audit.finished_at) > Date.parse(input.created_at)
        || Date.parse(snapshot.checkpoint.created_at) > Date.parse(input.created_at)) {
        throw new Error("V2 exhausted failure 时间回退");
      }
      const reason = terminalReasonV2(snapshot, audit, "attempt_budget_exhausted", input.created_at);
      await this.persistTerminalReasonV2(input.run_sha256, reason);
      const entries = snapshot.checkpoint.entries.map((prior, entryIndex): OracleGateCheckpointEntryV1 => entryIndex === index ? {
        ...prior,
        state: "FAILED_CLOSED",
        resume_action: "block_failed",
      } : { ...prior });
      return this.commitExecutionCheckpointUnlocked(snapshot,
        this.nextExecutionCheckpoint(snapshot, entries, input.created_at, "FAILED_CLOSED", reason.terminal_reason_sha256));
    });
  }

  async completeRunV2(rawInput: CompleteFormalOracleRunV2Input): Promise<FormalOracleExecutionV2Snapshot> {
    const input = deepFreezePlain(clonePlainData(rawInput, "V2 complete input"));
    canonicalTime(input.created_at, "created_at");
    return this.withLock(input.run_sha256, async () => {
      const snapshot = await this.loadExecutionInitialized(input.run_sha256, input.expected_head);
      this.assertExpectedExecutionCheckpoint(snapshot, input.expected_checkpoint_sha256);
      if (snapshot.checkpoint.run_state !== "RUNNING"
        || snapshot.checkpoint.entries.some((entry) => entry.state !== "SCHEMA_VALIDATED_COMMITTED" || !entry.committed_request_sha256)) {
        throw new Error("V2 execution complete 要求全部 request 达到 SCHEMA_VALIDATED_COMMITTED");
      }
      if (Date.parse(snapshot.checkpoint.created_at) > Date.parse(input.created_at)) throw new Error("V2 complete 时间回退");
      return this.commitExecutionCheckpointUnlocked(snapshot,
        this.nextExecutionCheckpoint(snapshot, snapshot.checkpoint.entries.map((entry) => ({ ...entry })), input.created_at, "EXECUTION_COMPLETE", null));
    });
  }

  private assertExpectedExecutionCheckpoint(snapshot: FormalOracleExecutionV2Snapshot, expectedCheckpointSha256: string): void {
    assertPrivateSha256(expectedCheckpointSha256, "expected_checkpoint_sha256");
    if (snapshot.head.checkpoint_sha256 !== expectedCheckpointSha256
      || snapshot.checkpoint.checkpoint_sha256 !== expectedCheckpointSha256) {
      throw new Error("V2 HEAD CAS 失败：expected checkpoint 已过期");
    }
  }

  private async persistAndVerifyTransportCaptureV2(
    snapshot: FormalOracleExecutionV2Snapshot,
    intent: RequestIntentV3,
    audit: RequestAttemptAuditV5,
    artifact: FormalOracleAuthoritativeTransportCaptureArtifactV1 | undefined,
  ): Promise<void> {
    if (!artifact || audit.transport_capture_record_sha256 === null
      || audit.transport_capture_record_object_uri !== this.transportCaptureRecordObjectUriV2(snapshot.run.run_sha256, audit.transport_capture_record_sha256)) {
      throw new Error("V2 response/partial unknown 必须携带 authoritative transport capture");
    }
    assertFormalOracleAuthoritativeTransportCaptureArtifactV1(artifact);
    const captureArtifact = revalidateFormalOracleTransportCaptureArtifactV1(artifact);
    const capture = captureArtifact.record;
    validationError("V2 transport capture", validateFormalOracleTransportCaptureRecordV1(capture));
    const entity = captureArtifact.captured_entity_bytes;
    if (capture.capture_record_sha256 !== audit.transport_capture_record_sha256
      || hashFormalOracleTransportCaptureRecordV1(capture) !== capture.capture_record_sha256
      || capture.run_sha256 !== snapshot.run.run_sha256
      || capture.execution_plan_sha256 !== snapshot.execution_plan.execution_plan_sha256
      || capture.request_id !== intent.request_id || capture.intent_sha256 !== intent.intent_sha256
      || capture.attempt_ordinal !== intent.attempt_ordinal
      || capture.request_envelope_sha256 !== intent.request_envelope_sha256
      || capture.provider_body_sha256 !== intent.provider_body_sha256 || capture.model !== intent.model
      || capture.account.provider_id !== audit.provider_id
      || capture.provider_http_request_id !== audit.provider_http_request_id
      || capture.response_http_status !== audit.response_http_status
      || capture.response_content_type !== audit.response_content_type
      || capture.response_headers_commitment_sha256 !== audit.response_headers_commitment_sha256
      || Date.parse(capture.request_started_at) < Date.parse(audit.started_at)
      || Date.parse(capture.capture_finished_at) > Date.parse(audit.finished_at)
      || (capture.response_headers_received_at !== null
        && (Date.parse(capture.response_headers_received_at) < Date.parse(audit.started_at)
          || Date.parse(capture.response_headers_received_at) > Date.parse(audit.finished_at)))
      || (audit.response_headers_commitment_sha256 !== null
        && hashFormalOracleResponsePublicHeadersV1([...capture.response_public_headers]) !== audit.response_headers_commitment_sha256)
      || (entity === null) !== (capture.captured_entity_bytes_sha256 === null)
      || (entity !== null && (digest(entity) !== capture.captured_entity_bytes_sha256
        || entity.byteLength !== capture.captured_entity_byte_length))
      || ((audit.outcome === "result_received" || audit.outcome === "invalid_response_received")
        && (capture.capture_status !== "complete_fetch_entity" || capture.captured_entity_bytes_sha256 !== audit.fetch_observed_sse_bytes_sha256))
      || (audit.outcome === "unknown" && capture.capture_status === "complete_fetch_entity")) {
      throw new Error("V2 transport capture 未绑定 run/intent/audit/entity");
    }
    if (entity !== null && capture.captured_entity_bytes_sha256 !== null) {
      await this.privateFs.publishImmutableObject(
        this.objectDirectory(snapshot.run.run_sha256, "transport-captured-entities", capture.captured_entity_bytes_sha256),
        "entity.bin",
        entity,
      );
    }
    await this.privateFs.publishImmutableObject(
      this.objectDirectory(snapshot.run.run_sha256, "transport-captures", capture.capture_record_sha256),
      "capture.json",
      privateCanonicalJsonBytes(capture),
    );
  }

  private async persistValidResponseV2(
    snapshot: FormalOracleExecutionV2Snapshot,
    intent: RequestIntentV3,
    audit: RequestAttemptAuditV5,
    artifact: FormalOraclePiResponseStreamArtifactV1 | undefined,
    parsedResponse: Record<string, unknown> | undefined,
  ): Promise<void> {
    if (!artifact || !parsedResponse || audit.fetch_observed_sse_bytes_sha256 === null
      || audit.sse_derivation_record_sha256 === null || audit.assistant_content_bytes_sha256 === null
      || audit.canonical_response_bytes_sha256 === null
      || audit.fetch_observed_sse_object_uri !== this.fetchObservedSseObjectUriV2(snapshot.run.run_sha256, audit.fetch_observed_sse_bytes_sha256)
      || audit.sse_derivation_object_uri !== this.sseDerivationObjectUriV2(snapshot.run.run_sha256, audit.sse_derivation_record_sha256)
      || audit.assistant_content_object_uri !== this.assistantContentObjectUriV2(snapshot.run.run_sha256, audit.assistant_content_bytes_sha256)
      || audit.canonical_response_object_uri !== this.canonicalResponseObjectUriV2(snapshot.run.run_sha256, audit.canonical_response_bytes_sha256)) {
      throw new Error("V2 result_received 必须携带 branded A/B/C/D chain");
    }
    assertFormalOraclePiResponseStreamArtifactV1(artifact);
    const response = revalidateFormalOraclePiResponseStreamArtifactV1(artifact);
    const parsedFromAssistant = parseOracleGateResponseBytes(response.assistant_content_bytes);
    const canonical = Buffer.from(canonicalOracleGateResponseBytes(parsedFromAssistant));
    if (!canonical.equals(Buffer.from(canonicalOracleGateResponseBytes(parsedResponse)))) throw new Error("V2 canonical response 与 assistant content 不一致");
    const proof = response.proof;
    if (proof.request_envelope_sha256 !== intent.request_envelope_sha256
      || proof.provider_body_sha256 !== intent.provider_body_sha256 || proof.model !== intent.model
      || proof.response_id !== audit.completion_id || proof.finish_reason !== audit.stop_reason
      || proof.expected_max_input_tokens !== intent.max_input_tokens || proof.expected_max_output_tokens !== intent.max_output_tokens
      || privateCanonicalJsonBytes(proof.normalized_usage).compare(privateCanonicalJsonBytes(audit.usage)) !== 0
      || proof.raw_sse_sha256 !== audit.fetch_observed_sse_bytes_sha256 || proof.raw_sse_byte_length !== audit.fetch_observed_sse_byte_length
      || proof.proof_sha256 !== audit.sse_derivation_record_sha256 || hashFormalOraclePiResponseStreamProofV1(proof) !== proof.proof_sha256
      || proof.assistant_content_sha256 !== audit.assistant_content_bytes_sha256
      || proof.assistant_content_byte_length !== audit.assistant_content_byte_length
      || digest(canonical) !== audit.canonical_response_bytes_sha256
      || hashPublicBlindResponse(parsedFromAssistant) !== audit.canonical_response_commitment_sha256) {
      throw new Error("V2 A/B/C/D response chain 未闭合 proof/audit/intent");
    }
    await this.privateFs.publishImmutableObject(this.objectDirectory(snapshot.run.run_sha256, "fetch-observed-sse", proof.raw_sse_sha256), "response.sse", response.raw_sse_bytes);
    await this.privateFs.publishImmutableObject(this.objectDirectory(snapshot.run.run_sha256, "sse-derivations", proof.proof_sha256), "derivation.json", privateCanonicalJsonBytes(proof));
    await this.privateFs.publishImmutableObject(this.objectDirectory(snapshot.run.run_sha256, "assistant-content", proof.assistant_content_sha256), "assistant-content.utf8", response.assistant_content_bytes);
    await this.privateFs.publishImmutableObject(this.objectDirectory(snapshot.run.run_sha256, "canonical-responses", audit.canonical_response_bytes_sha256), "canonical-response.json", canonical);
  }

  private async persistInvalidResponseV2(
    snapshot: FormalOracleExecutionV2Snapshot,
    intent: RequestIntentV3,
    audit: RequestAttemptAuditV5,
    artifact: FormalOracleInvalidResponseArtifactV1 | undefined,
    entryIndex: number,
  ): Promise<void> {
    if (!artifact || audit.invalid_response_record_sha256 === null || audit.fetch_observed_sse_bytes_sha256 === null
      || audit.invalid_response_record_object_uri !== this.invalidResponseRecordObjectUriV2(snapshot.run.run_sha256, audit.invalid_response_record_sha256)) {
      throw new Error("V2 invalid response 必须携带 branded invalid artifact");
    }
    assertFormalOracleInvalidResponseArtifactV1(artifact);
    const invalid = revalidateFormalOracleInvalidResponseArtifactV1(artifact);
    const record = invalid.record;
    const expected = snapshot.execution_plan.items[entryIndex];
    const hasDerived = record.sse_derivation_record_sha256 !== null;
    if (audit.fetch_observed_sse_object_uri !== this.fetchObservedSseObjectUriV2(snapshot.run.run_sha256, record.fetch_observed_sse_bytes_sha256)
      || (hasDerived && (audit.sse_derivation_object_uri !== this.sseDerivationObjectUriV2(snapshot.run.run_sha256, record.sse_derivation_record_sha256!)
        || audit.assistant_content_object_uri !== this.assistantContentObjectUriV2(snapshot.run.run_sha256, record.assistant_content_bytes_sha256!)
        || audit.sse_parser_version !== FORMAL_ORACLE_PI_RESPONSE_STREAM_VERSION))
      || (!hasDerived && (audit.sse_derivation_object_uri !== null || audit.assistant_content_object_uri !== null || audit.sse_parser_version !== null))
      || record.request_envelope_sha256 !== intent.request_envelope_sha256
      || record.provider_body_sha256 !== intent.provider_body_sha256 || record.expected_model !== intent.model
      || record.expected_arm !== expected.arm || record.expected_max_input_tokens !== intent.max_input_tokens
      || record.expected_max_output_tokens !== intent.max_output_tokens
      || record.fetch_observed_sse_bytes_sha256 !== audit.fetch_observed_sse_bytes_sha256
      || record.fetch_observed_sse_byte_length !== audit.fetch_observed_sse_byte_length
      || record.invalid_response_record_sha256 !== audit.invalid_response_record_sha256
      || hashFormalOracleInvalidResponseRecordV1(record) !== record.invalid_response_record_sha256
      || record.sse_derivation_record_sha256 !== audit.sse_derivation_record_sha256
      || record.assistant_content_bytes_sha256 !== audit.assistant_content_bytes_sha256
      || record.assistant_content_byte_length !== audit.assistant_content_byte_length) {
      throw new Error("V2 invalid response A/B/C/record 未闭合 audit/intent");
    }
    await this.privateFs.publishImmutableObject(this.objectDirectory(snapshot.run.run_sha256, "fetch-observed-sse", record.fetch_observed_sse_bytes_sha256), "response.sse", invalid.raw_sse_bytes);
    if (invalid.sse_derivation && invalid.assistant_content_bytes) {
      await this.privateFs.publishImmutableObject(this.objectDirectory(snapshot.run.run_sha256, "sse-derivations", invalid.sse_derivation.proof_sha256), "derivation.json", privateCanonicalJsonBytes(invalid.sse_derivation));
      await this.privateFs.publishImmutableObject(this.objectDirectory(snapshot.run.run_sha256, "assistant-content", invalid.sse_derivation.assistant_content_sha256), "assistant-content.utf8", invalid.assistant_content_bytes);
    }
    await this.privateFs.publishImmutableObject(this.objectDirectory(snapshot.run.run_sha256, "invalid-response-records", record.invalid_response_record_sha256), "invalid-response.json", privateCanonicalJsonBytes(record));
  }

  private async loadAttemptV2(snapshot: FormalOracleExecutionV2Snapshot, entryIndex: number, attemptSha256: string): Promise<RequestAttemptAuditV5> {
    const audit = parseCanonical<RequestAttemptAuditV5>(
      await this.privateFs.readFile(this.objectPath(snapshot.run.run_sha256, "attempt-audits-v5", attemptSha256, "attempt-audit.json")),
      "V2 attempt audit",
    );
    validationError("V2 attempt audit", validateRequestAttemptAuditV5(audit));
    if (audit.attempt_sha256 !== attemptSha256 || hashRequestAttemptAuditV5(audit) !== attemptSha256) throw new Error("V2 attempt 内容地址漂移");
    const intent = await this.loadIntentV2(snapshot.run, snapshot.preregistration_bundle, snapshot.execution_plan, entryIndex, audit.intent_sha256);
    validationError("V2 attempt/intent", validateRequestAttemptAuditV5AgainstIntentV3(intent, audit));
    if (audit.transport_capture_record_sha256 !== null) await this.verifyDurableTransportCaptureV2(snapshot, intent, audit);
    else if (audit.outcome === "result_received" || audit.outcome === "invalid_response_received"
      || audit.response_capture_status === "response_entity_incomplete_unknown") throw new Error("V2 attempt 缺少 mandatory transport capture");
    if (audit.outcome === "result_received") await this.verifyResponseObjectsV2(snapshot, intent, audit);
    if (audit.outcome === "invalid_response_received") await this.verifyInvalidResponseObjectsV2(snapshot, intent, audit, entryIndex);
    return audit;
  }

  private async loadCommittedRequestV2(snapshot: FormalOracleExecutionV2Snapshot, entryIndex: number, committedSha256: string): Promise<CommittedRequestV4> {
    const committed = parseCanonical<CommittedRequestV4>(
      await this.privateFs.readFile(this.objectPath(snapshot.run.run_sha256, "committed-requests-v4", committedSha256, "committed-request.json")),
      "V2 committed request",
    );
    if (committed.committed_request_sha256 !== committedSha256 || hashCommittedRequestV4(committed) !== committedSha256) throw new Error("V2 committed request 内容地址漂移");
    const intent = await this.loadIntentV2(snapshot.run, snapshot.preregistration_bundle, snapshot.execution_plan, entryIndex, committed.intent_sha256);
    const audit = await this.loadAttemptV2(snapshot, entryIndex, committed.attempt_sha256);
    validationError("V2 committed request chain", validateCommittedRequestV4AgainstAttemptV5(intent, audit, committed));
    if (committed.validator_version !== ORACLE_GATE_RESPONSE_VALIDATOR_VERSION
      || snapshot.execution_plan.items[entryIndex].output_schema_sha256 !== ORACLE_GATE_RESPONSE_SCHEMA_SHA256) {
      throw new Error("V2 committed request schema/validator 漂移");
    }
    const parsed = await this.verifyResponseObjectsV2(snapshot, intent, audit);
    validateOracleGateResponse(parsed, snapshot.execution_plan.items[entryIndex].arm);
    return committed;
  }

  private async verifyDurableTransportCaptureV2(snapshot: FormalOracleExecutionV2Snapshot, intent: RequestIntentV3, audit: RequestAttemptAuditV5): Promise<void> {
    if (audit.transport_capture_record_sha256 === null
      || audit.transport_capture_record_object_uri !== this.transportCaptureRecordObjectUriV2(snapshot.run.run_sha256, audit.transport_capture_record_sha256)) {
      throw new Error("V2 durable capture URI 无效");
    }
    const capture = parseCanonical<FormalOracleTransportCaptureRecordV1>(await this.privateFs.readFile(audit.transport_capture_record_object_uri), "V2 transport capture");
    validationError("V2 durable transport capture", validateFormalOracleTransportCaptureRecordV1(capture));
    const entity = capture.captured_entity_object_uri === null ? null : await this.privateFs.readFile(capture.captured_entity_object_uri);
    if (capture.capture_record_sha256 !== audit.transport_capture_record_sha256
      || hashFormalOracleTransportCaptureRecordV1(capture) !== audit.transport_capture_record_sha256
      || capture.run_sha256 !== snapshot.run.run_sha256 || capture.execution_plan_sha256 !== snapshot.execution_plan.execution_plan_sha256
      || capture.request_id !== intent.request_id || capture.intent_sha256 !== intent.intent_sha256
      || capture.attempt_ordinal !== intent.attempt_ordinal || capture.request_envelope_sha256 !== intent.request_envelope_sha256
      || capture.provider_body_sha256 !== intent.provider_body_sha256 || capture.model !== intent.model
      || capture.account.provider_id !== audit.provider_id || capture.provider_http_request_id !== audit.provider_http_request_id
      || capture.response_http_status !== audit.response_http_status || capture.response_content_type !== audit.response_content_type
      || capture.response_headers_commitment_sha256 !== audit.response_headers_commitment_sha256
      || Date.parse(capture.request_started_at) < Date.parse(audit.started_at)
      || Date.parse(capture.capture_finished_at) > Date.parse(audit.finished_at)
      || (capture.response_headers_received_at !== null
        && (Date.parse(capture.response_headers_received_at) < Date.parse(audit.started_at)
          || Date.parse(capture.response_headers_received_at) > Date.parse(audit.finished_at)))
      || (entity === null) !== (capture.captured_entity_bytes_sha256 === null)
      || (entity !== null && (digest(entity) !== capture.captured_entity_bytes_sha256 || entity.byteLength !== capture.captured_entity_byte_length))
      || ((audit.outcome === "result_received" || audit.outcome === "invalid_response_received")
        && (capture.capture_status !== "complete_fetch_entity" || capture.captured_entity_bytes_sha256 !== audit.fetch_observed_sse_bytes_sha256))
      || (audit.outcome === "unknown" && capture.capture_status === "complete_fetch_entity")) {
      throw new Error("V2 durable transport capture 无法绑定 run/intent/audit/entity");
    }
  }

  private async verifyResponseObjectsV2(
    snapshot: FormalOracleExecutionV2Snapshot,
    intent: RequestIntentV3,
    audit: RequestAttemptAuditV5,
  ): Promise<Record<string, unknown>> {
    if (audit.outcome !== "result_received" || !audit.fetch_observed_sse_bytes_sha256 || !audit.sse_derivation_record_sha256
      || !audit.assistant_content_bytes_sha256 || !audit.canonical_response_bytes_sha256 || !audit.canonical_response_commitment_sha256
      || audit.fetch_observed_sse_object_uri !== this.fetchObservedSseObjectUriV2(snapshot.run.run_sha256, audit.fetch_observed_sse_bytes_sha256)
      || audit.sse_derivation_object_uri !== this.sseDerivationObjectUriV2(snapshot.run.run_sha256, audit.sse_derivation_record_sha256)
      || audit.assistant_content_object_uri !== this.assistantContentObjectUriV2(snapshot.run.run_sha256, audit.assistant_content_bytes_sha256)
      || audit.canonical_response_object_uri !== this.canonicalResponseObjectUriV2(snapshot.run.run_sha256, audit.canonical_response_bytes_sha256)) {
      throw new Error("V2 result audit A/B/C/D refs 无效");
    }
    const raw = await this.privateFs.readFile(audit.fetch_observed_sse_object_uri);
    const derived = createFormalOraclePiResponseStreamArtifactV1({ raw_sse_bytes: raw, expected_model: intent.model,
      request_envelope_sha256: intent.request_envelope_sha256, provider_body_sha256: intent.provider_body_sha256,
      expected_max_input_tokens: intent.max_input_tokens, expected_max_output_tokens: intent.max_output_tokens });
    const proofBytes = await this.privateFs.readFile(audit.sse_derivation_object_uri);
    const durableProof = parseCanonical<FormalOraclePiResponseStreamProofV1>(proofBytes, "V2 SSE derivation");
    const assistant = await this.privateFs.readFile(audit.assistant_content_object_uri);
    const canonical = await this.privateFs.readFile(audit.canonical_response_object_uri);
    const parsedFromAssistant = parseOracleGateResponseBytes(derived.assistant_content_bytes);
    const expectedCanonical = Buffer.from(canonicalOracleGateResponseBytes(parsedFromAssistant));
    const parsed = parseOracleGateResponseBytes(canonical);
    if (digest(raw) !== audit.fetch_observed_sse_bytes_sha256 || raw.byteLength !== audit.fetch_observed_sse_byte_length
      || derived.proof.proof_sha256 !== audit.sse_derivation_record_sha256
      || hashFormalOraclePiResponseStreamProofV1(durableProof) !== durableProof.proof_sha256
      || !privateCanonicalJsonBytes(derived.proof).equals(proofBytes)
      || digest(assistant) !== audit.assistant_content_bytes_sha256 || assistant.byteLength !== audit.assistant_content_byte_length
      || !assistant.equals(Buffer.from(derived.assistant_content_bytes))
      || digest(canonical) !== audit.canonical_response_bytes_sha256 || !canonical.equals(expectedCanonical)
      || !canonical.equals(Buffer.from(canonicalOracleGateResponseBytes(parsed)))
      || hashPublicBlindResponse(parsed) !== audit.canonical_response_commitment_sha256
      || derived.proof.response_id !== audit.completion_id || derived.proof.finish_reason !== audit.stop_reason
      || derived.proof.model !== audit.model || derived.proof.expected_max_input_tokens !== audit.max_input_tokens
      || derived.proof.expected_max_output_tokens !== audit.max_output_tokens
      || !privateCanonicalJsonBytes(derived.proof.normalized_usage).equals(privateCanonicalJsonBytes(audit.usage))) {
      throw new Error("V2 durable A/B/C/D 无法从 raw SSE 重派生");
    }
    return parsed;
  }

  private async verifyInvalidResponseObjectsV2(
    snapshot: FormalOracleExecutionV2Snapshot,
    intent: RequestIntentV3,
    audit: RequestAttemptAuditV5,
    entryIndex: number,
  ): Promise<void> {
    if (audit.outcome !== "invalid_response_received" || !audit.fetch_observed_sse_object_uri
      || !audit.fetch_observed_sse_bytes_sha256 || !audit.invalid_response_record_object_uri || !audit.invalid_response_record_sha256
      || audit.fetch_observed_sse_object_uri !== this.fetchObservedSseObjectUriV2(snapshot.run.run_sha256, audit.fetch_observed_sse_bytes_sha256)
      || audit.invalid_response_record_object_uri !== this.invalidResponseRecordObjectUriV2(snapshot.run.run_sha256, audit.invalid_response_record_sha256)) {
      throw new Error("V2 invalid response refs 无效");
    }
    const raw = await this.privateFs.readFile(audit.fetch_observed_sse_object_uri);
    const expected = snapshot.execution_plan.items[entryIndex];
    const rebuild = { raw_sse_bytes: raw, expected_model: intent.model, expected_arm: expected.arm,
      request_envelope_sha256: intent.request_envelope_sha256, provider_body_sha256: intent.provider_body_sha256,
      expected_max_input_tokens: intent.max_input_tokens, expected_max_output_tokens: intent.max_output_tokens };
    const recordBytes = await this.privateFs.readFile(audit.invalid_response_record_object_uri);
    const record = parseCanonical<FormalOracleInvalidResponseRecordV1>(recordBytes, "V2 invalid response record");
    assertFormalOracleInvalidResponseRecordV1(record);
    const derived = record.failure_stage === "transport_metadata_invalid"
      ? createFormalOracleTransportMetadataInvalidResponseArtifactV1(rebuild)
      : createFormalOracleInvalidResponseArtifactV1(rebuild);
    if (digest(raw) !== audit.fetch_observed_sse_bytes_sha256 || raw.byteLength !== audit.fetch_observed_sse_byte_length
      || derived.record.invalid_response_record_sha256 !== audit.invalid_response_record_sha256
      || hashFormalOracleInvalidResponseRecordV1(record) !== record.invalid_response_record_sha256
      || !privateCanonicalJsonBytes(derived.record).equals(recordBytes)
      || derived.record.sse_derivation_record_sha256 !== audit.sse_derivation_record_sha256
      || derived.record.assistant_content_bytes_sha256 !== audit.assistant_content_bytes_sha256
      || derived.record.assistant_content_byte_length !== audit.assistant_content_byte_length) {
      throw new Error("V2 durable invalid response 无法从 raw SSE 重派生");
    }
    if (derived.sse_derivation && derived.assistant_content_bytes) {
      if (!audit.sse_derivation_object_uri || !audit.assistant_content_object_uri
        || audit.sse_derivation_object_uri !== this.sseDerivationObjectUriV2(snapshot.run.run_sha256, derived.sse_derivation.proof_sha256)
        || audit.assistant_content_object_uri !== this.assistantContentObjectUriV2(snapshot.run.run_sha256, derived.sse_derivation.assistant_content_sha256)
        || audit.sse_parser_version !== FORMAL_ORACLE_PI_RESPONSE_STREAM_VERSION) throw new Error("V2 invalid B/C refs 无效");
      const proof = await this.privateFs.readFile(audit.sse_derivation_object_uri);
      const assistant = await this.privateFs.readFile(audit.assistant_content_object_uri);
      if (!proof.equals(privateCanonicalJsonBytes(derived.sse_derivation)) || !assistant.equals(Buffer.from(derived.assistant_content_bytes))) {
        throw new Error("V2 durable invalid B/C 漂移");
      }
    } else if (audit.sse_derivation_object_uri !== null || audit.assistant_content_object_uri !== null) {
      throw new Error("V2 SSE protocol invalid 不得伪造 B/C");
    }
  }

  private async persistTerminalReasonV2(runSha256: string, reason: FormalOracleTerminalReasonV2): Promise<void> {
    validationError("V2 terminal reason", validateFormalOracleTerminalReasonV2(reason));
    await this.privateFs.publishImmutableObject(this.objectDirectory(runSha256, "terminal-reasons-v2", reason.terminal_reason_sha256), "terminal-reason.json", privateCanonicalJsonBytes(reason));
  }

  private async loadTerminalReasonV2(snapshot: FormalOracleExecutionV2Snapshot, reasonSha256: string): Promise<FormalOracleTerminalReasonV2> {
    const reason = parseCanonical<FormalOracleTerminalReasonV2>(
      await this.privateFs.readFile(this.objectPath(snapshot.run.run_sha256, "terminal-reasons-v2", reasonSha256, "terminal-reason.json")),
      "V2 terminal reason",
    );
    validationError("V2 terminal reason", validateFormalOracleTerminalReasonV2(reason));
    if (reason.terminal_reason_sha256 !== reasonSha256 || reason.run_sha256 !== snapshot.run.run_sha256
      || reason.preregistration_bundle_sha256 !== snapshot.run.preregistration_bundle_sha256
      || reason.execution_plan_sha256 !== snapshot.execution_plan.execution_plan_sha256
      || reason.execution_lineage_sha256 !== snapshot.migration.execution_lineage_sha256) throw new Error("V2 terminal reason lineage 漂移");
    return reason;
  }

  fetchObservedSseObjectUriV2(runSha256: string, sha256: string): string { return this.objectPath(runSha256, "fetch-observed-sse", sha256, "response.sse"); }
  sseDerivationObjectUriV2(runSha256: string, sha256: string): string { return this.objectPath(runSha256, "sse-derivations", sha256, "derivation.json"); }
  assistantContentObjectUriV2(runSha256: string, sha256: string): string { return this.objectPath(runSha256, "assistant-content", sha256, "assistant-content.utf8"); }
  canonicalResponseObjectUriV2(runSha256: string, sha256: string): string { return this.objectPath(runSha256, "canonical-responses", sha256, "canonical-response.json"); }
  invalidResponseRecordObjectUriV2(runSha256: string, sha256: string): string { return this.objectPath(runSha256, "invalid-response-records", sha256, "invalid-response.json"); }
  transportCaptureRecordObjectUriV2(runSha256: string, sha256: string): string { return this.objectPath(runSha256, "transport-captures", sha256, "capture.json"); }

  private async publish(input: CreateFormalOraclePreregisteredRunV2Input): Promise<void> {
    const run = input.run, bundle = input.preregistration_bundle;
    await this.privateFs.ensureDirectory(this.runPath(run.run_sha256));
    const objects: Array<[string, string, unknown]> = [
      [this.objectDirectory(run.run_sha256, "run-contracts", run.run_sha256), "run.json", run],
      [this.objectDirectory(run.run_sha256, "preregistration-bundles", bundle.preregistration_bundle_sha256), "bundle.json", bundle],
      [this.objectDirectory(run.run_sha256, "evidence-policies", bundle.public_evidence_derivation_policy_sha256), "policy.json", bundle.policy],
      [this.objectDirectory(run.run_sha256, "statistics-plans", bundle.statistics_plan_sha256), "statistics-plan.json", bundle.statistics_plan],
      [this.objectDirectory(run.run_sha256, "formal-specs", bundle.formal_spec_sha256), "formal-spec.json", bundle.formal_spec],
      [this.objectDirectory(run.run_sha256, "rating-plans", bundle.rating_plan_sha256), "rating-plan.json", bundle.rating_plan],
      [this.objectDirectory(run.run_sha256, "structural-schedules", run.schedule_sha256), "schedule.json", input.structural_schedule],
      [this.objectDirectory(run.run_sha256, "execution-plans", run.execution_plan_sha256), "execution-plan.json", input.execution_plan],
      [this.objectDirectory(run.run_sha256, "checkpoints", input.initial_checkpoint.checkpoint_sha256), "checkpoint.json", input.initial_checkpoint],
    ];
    for (const [directory, name, value] of objects) await this.privateFs.publishImmutableObject(directory, name, privateCanonicalJsonBytes(value));
  }

  private async createUnlocked(input: CreateFormalOraclePreregisteredRunV2Input): Promise<FormalOraclePreregisteredRunV2Snapshot> {
    if (await this.privateFs.readOptionalFile(this.headPath(input.run.run_sha256))) throw new Error("V2 preregistration HEAD 已存在；严格 create-once");
    await this.publish(input);
    const head: FormalOraclePreregisteredRunHeadV2 = {
      schema_version: "formal-oracle-preregistered-run-head-v2",
      run_sha256: input.run.run_sha256,
      generation: 0,
      checkpoint_sha256: input.initial_checkpoint.checkpoint_sha256,
      updated_at: input.initial_checkpoint.created_at,
      execution_migration_status: "pending_formal_run_store_v2_execution_pipeline",
      api_execution_allowed: false,
    };
    await this.privateFs.replaceFileAtomic(this.headPath(input.run.run_sha256), privateCanonicalJsonBytes(head));
    return this.load(input.run.run_sha256, {
      schema_version: "formal-oracle-head-pin-v1",
      run_sha256: input.run.run_sha256,
      generation: 0,
      checkpoint_sha256: input.initial_checkpoint.checkpoint_sha256,
    });
  }

  private async load(runSha256: string, expectedHead: FormalOracleHeadPinV1): Promise<FormalOraclePreregisteredRunV2Snapshot> {
    const headBytes = await this.privateFs.readFile(this.headPath(runSha256));
    const head = parseCanonical<FormalOraclePreregisteredRunHeadV2>(headBytes, "V2 preregistration HEAD");
    if (!head || typeof head !== "object" || Array.isArray(head)
      || !exactKeys(head as unknown as Record<string, unknown>, ["schema_version","run_sha256","generation","checkpoint_sha256","updated_at","execution_migration_status","api_execution_allowed"])
      || head.schema_version !== "formal-oracle-preregistered-run-head-v2" || head.run_sha256 !== runSha256
      || head.generation !== 0 || head.execution_migration_status !== "pending_formal_run_store_v2_execution_pipeline"
      || head.api_execution_allowed !== false) throw new Error("V2 preregistration HEAD schema/status 无效");
    canonicalTime(head.updated_at, "V2 preregistration HEAD updated_at"); exactPin(expectedHead, head);
    const run = parseCanonical<FormalRunContractV2>(await this.privateFs.readFile(this.objectPath(runSha256, "run-contracts", runSha256, "run.json")), "V2 run");
    validationError("V2 run", validateFormalRunContractV2(run));
    if (run.run_sha256 !== runSha256 || hashFormalRunContractV2(run) !== runSha256) throw new Error("V2 run 内容地址漂移");
    const bundle = parseCanonical<FormalOraclePreregistrationBundleV2>(await this.privateFs.readFile(this.objectPath(runSha256, "preregistration-bundles", run.preregistration_bundle_sha256, "bundle.json")), "V2 bundle");
    validationError("V2 bundle", validateFormalOraclePreregistrationBundleV2(bundle));
    validationError("V2 run/bundle", validateFormalRunContractV2AgainstPreregistrationBundle(run, bundle));
    if (hashFormalOraclePreregistrationBundleV2(bundle) !== run.preregistration_bundle_sha256) throw new Error("V2 bundle 内容地址漂移");
    const documents: Array<[string, string, string, unknown]> = [
      ["evidence-policies", bundle.public_evidence_derivation_policy_sha256, "policy.json", bundle.policy],
      ["statistics-plans", bundle.statistics_plan_sha256, "statistics-plan.json", bundle.statistics_plan],
      ["formal-specs", bundle.formal_spec_sha256, "formal-spec.json", bundle.formal_spec],
      ["rating-plans", bundle.rating_plan_sha256, "rating-plan.json", bundle.rating_plan],
    ];
    for (const [kind, hash, name, embedded] of documents) {
      const bytes = await this.privateFs.readFile(this.objectPath(runSha256, kind, hash, name));
      if (!privateCanonicalJsonBytes(embedded).equals(bytes)) throw new Error(`V2 ${kind} 正文与 bundle 不一致`);
    }
    const schedule = parseCanonical<FormalOracleStructuralScheduleV1>(await this.privateFs.readFile(this.objectPath(runSha256, "structural-schedules", run.schedule_sha256, "schedule.json")), "V2 schedule");
    const plan = parseCanonical<FormalOracleExecutionPlanV1>(await this.privateFs.readFile(this.objectPath(runSha256, "execution-plans", run.execution_plan_sha256, "execution-plan.json")), "V2 execution plan");
    const checkpoint = parseCanonical<RunCheckpointV1>(await this.privateFs.readFile(this.objectPath(runSha256, "checkpoints", head.checkpoint_sha256, "checkpoint.json")), "V2 genesis");
    assertInput({ run, preregistration_bundle: bundle, structural_schedule: schedule, execution_plan: plan, initial_checkpoint: checkpoint }, this.runStoreUri);
    if (hashFormalOracleStructuralSchedule(schedule) !== run.schedule_sha256 || hashFormalOracleExecutionPlan(plan) !== run.execution_plan_sha256
      || checkpoint.checkpoint_sha256 !== head.checkpoint_sha256 || checkpoint.created_at !== head.updated_at) throw new Error("V2 HEAD/schedule/plan/genesis 根漂移");
    return deepFreezePlain({
      schema_version: "formal-oracle-preregistered-run-snapshot-v2" as const,
      run, preregistration_bundle: bundle, structural_schedule: schedule,
      execution_plan: plan, initial_checkpoint: checkpoint,
      head_pin: { schema_version: "formal-oracle-head-pin-v1" as const, run_sha256: runSha256, generation: 0 as const, checkpoint_sha256: head.checkpoint_sha256 },
      execution_migration_status: "pending_formal_run_store_v2_execution_pipeline" as const,
      external_monotonic_worm_status: "pending_external_monotonic_worm" as const,
      api_execution_allowed: false as const,
    });
  }

  private async loadExecutionInitialized(
    runSha256: string,
    expectedHead: FormalOracleHeadPinV2,
  ): Promise<FormalOracleExecutionV2Snapshot> {
    const head = parseCanonical<FormalOracleRunHeadV2>(
      await this.privateFs.readFile(this.headPath(runSha256)),
      "V2 execution HEAD",
    );
    validationError("V2 execution HEAD", validateFormalOracleRunHeadV2(head));
    validationError("V2 execution HEAD pin", validateFormalOracleHeadPinV2AgainstHead(expectedHead, head));
    if (head.run_sha256 !== runSha256) {
      throw new Error("V2 execution HEAD run/status 无效");
    }
    const run = parseCanonical<FormalRunContractV2>(
      await this.privateFs.readFile(this.objectPath(runSha256, "run-contracts", runSha256, "run.json")),
      "V2 run",
    );
    validationError("V2 run", validateFormalRunContractV2(run));
    if (run.run_sha256 !== runSha256 || hashFormalRunContractV2(run) !== runSha256 || run.run_store_uri !== this.runStoreUri) {
      throw new Error("V2 run 内容地址/store root 漂移");
    }
    const bundle = parseCanonical<FormalOraclePreregistrationBundleV2>(
      await this.privateFs.readFile(this.objectPath(runSha256, "preregistration-bundles", run.preregistration_bundle_sha256, "bundle.json")),
      "V2 bundle",
    );
    validationError("V2 bundle", validateFormalOraclePreregistrationBundleV2(bundle));
    validationError("V2 run/bundle", validateFormalRunContractV2AgainstPreregistrationBundle(run, bundle));
    if (bundle.preregistration_bundle_sha256 !== head.preregistration_bundle_sha256) throw new Error("V2 HEAD/bundle 根漂移");
    for (const [kind, hash, name, embedded] of [
      ["evidence-policies", bundle.public_evidence_derivation_policy_sha256, "policy.json", bundle.policy],
      ["statistics-plans", bundle.statistics_plan_sha256, "statistics-plan.json", bundle.statistics_plan],
      ["formal-specs", bundle.formal_spec_sha256, "formal-spec.json", bundle.formal_spec],
      ["rating-plans", bundle.rating_plan_sha256, "rating-plan.json", bundle.rating_plan],
    ] as const) {
      const bytes = await this.privateFs.readFile(this.objectPath(runSha256, kind, hash, name));
      if (!privateCanonicalJsonBytes(embedded).equals(bytes)) throw new Error(`V2 ${kind} 正文与 bundle 不一致`);
    }
    const schedule = parseCanonical<FormalOracleStructuralScheduleV1>(
      await this.privateFs.readFile(this.objectPath(runSha256, "structural-schedules", run.schedule_sha256, "schedule.json")),
      "V2 schedule",
    );
    const plan = parseCanonical<FormalOracleExecutionPlanV1>(
      await this.privateFs.readFile(this.objectPath(runSha256, "execution-plans", run.execution_plan_sha256, "execution-plan.json")),
      "V2 execution plan",
    );
    const genesis = parseCanonical<RunCheckpointV1>(
      await this.privateFs.readFile(this.objectPath(runSha256, "checkpoints", head.genesis_checkpoint_sha256, "checkpoint.json")),
      "V2 genesis",
    );
    assertInput({ run, preregistration_bundle: bundle, structural_schedule: schedule, execution_plan: plan, initial_checkpoint: genesis }, this.runStoreUri);
    const migration = parseCanonical<FormalOracleExecutionMigrationV1>(
      await this.privateFs.readFile(this.objectPath(runSha256, "execution-migrations", head.migration_sha256, "migration.json")),
      "V2 execution migration",
    );
    const reversed:RunCheckpointV2[]=[];const seen=new Set<string>();let cursor=head.checkpoint_sha256;
    while(cursor!==head.genesis_checkpoint_sha256){if(seen.has(cursor))throw new Error("V2 checkpoint history 存在循环");seen.add(cursor);
      const current=parseCanonical<RunCheckpointV2>(await this.privateFs.readFile(this.objectPath(runSha256,"checkpoints",cursor,"checkpoint.json")),"V2 execution checkpoint");
      validationError("V2 execution checkpoint",validateRunCheckpointV2(current));if(current.checkpoint_sha256!==cursor)throw new Error("V2 checkpoint 内容地址漂移");
      reversed.push(current);cursor=current.previous_checkpoint_sha256;if(reversed.length>head.generation)throw new Error("V2 checkpoint history 超过 HEAD generation");}
    const checkpoints=reversed.reverse();if(checkpoints.length!==head.generation||checkpoints[0]?.generation!==1||checkpoints.at(-1)?.generation!==head.generation)throw new Error("V2 HEAD 未绑定完整 checkpoint 历史");
    const checkpoint=checkpoints.at(-1)!;
    validationError("V2 execution migration bridge", validateFormalOracleExecutionMigrationBridgeV1({ genesis, migration, checkpoint:checkpoints[0] }));
    for(let index=1;index<checkpoints.length;index+=1)validationError("V2 checkpoint transition",validateRunCheckpointTransitionV2(checkpoints[index-1],checkpoints[index]));
    const referenceSnapshot = {
      schema_version: "formal-oracle-execution-snapshot-v2" as const,
      run, preregistration_bundle: bundle, structural_schedule: schedule, execution_plan: plan,
      genesis_checkpoint: genesis, migration, checkpoint, checkpoints, head,
      head_pin: this.pinFromExecutionHead(head), execution_status: head.execution_status,
      external_monotonic_worm_status: "pending_external_monotonic_worm" as const,
      api_execution_allowed: false as const,
    } satisfies FormalOracleExecutionV2Snapshot;
    const referenceCache = {
      intents: new Map<string, RequestIntentV3>(),
      attempts: new Map<string, RequestAttemptAuditV5>(),
      commits: new Map<string, CommittedRequestV4>(),
      terminalReasons: new Map<string, FormalOracleTerminalReasonV2>(),
    };
    for(const [index,item] of checkpoints.entries()) await this.validateCheckpointReferencesV2(
      referenceSnapshot, item, index > 0 ? checkpoints[index - 1] : null, referenceCache,
    );
    if (checkpoint.checkpoint_sha256 !== head.checkpoint_sha256 || checkpoint.created_at !== head.updated_at
      || checkpoint.execution_lineage_sha256 !== head.execution_lineage_sha256
      || checkpoint.migration_sha256 !== head.migration_sha256) {
      throw new Error("V2 execution HEAD/checkpoint/lineage 漂移");
    }
    const expectedExecutionStatus: FormalOracleRunHeadV2["execution_status"] =
      ["BLOCKED_AMBIGUOUS", "FAILED_CLOSED", "EXECUTION_COMPLETE"].includes(checkpoint.run_state)
        ? "execution_v2_terminal_non_executable"
        : checkpoint.generation === 1 && checkpoint.run_state === "SEALED_READY"
          ? "execution_v2_initialized_non_executable"
          : "execution_v2_active_non_executable";
    if (head.execution_status !== expectedExecutionStatus) {
      throw new Error("V2 execution HEAD status 未绑定当前 checkpoint run_state");
    }
    return deepFreezePlain({
      schema_version: "formal-oracle-execution-snapshot-v2" as const,
      run, preregistration_bundle: bundle, structural_schedule: schedule, execution_plan: plan,
      genesis_checkpoint: genesis, migration, checkpoint,checkpoints,
      head, head_pin: this.pinFromExecutionHead(head),
      execution_status: head.execution_status,
      external_monotonic_worm_status: "pending_external_monotonic_worm" as const,
      api_execution_allowed: false as const,
    });
  }

  private async validateCheckpointReferencesV2(
    snapshot: FormalOracleExecutionV2Snapshot,
    checkpoint: RunCheckpointV2,
    previous: RunCheckpointV2 | null,
    cache: {
      intents: Map<string, RequestIntentV3>;
      attempts: Map<string, RequestAttemptAuditV5>;
      commits: Map<string, CommittedRequestV4>;
      terminalReasons: Map<string, FormalOracleTerminalReasonV2>;
    },
  ): Promise<void> {
    for (const [index, entry] of checkpoint.entries.entries()) {
      const intent = entry.active_intent_sha256
        ? cache.intents.get(entry.active_intent_sha256)
          ?? await this.loadIntentV2(snapshot.run, snapshot.preregistration_bundle, snapshot.execution_plan, index, entry.active_intent_sha256)
        : null;
      if (intent) cache.intents.set(intent.intent_sha256, intent);
      if (intent && (intent.request_id !== entry.request_id || intent.idempotency_key !== entry.idempotency_key
        || intent.max_attempts !== entry.max_attempts || Date.parse(intent.prepared_at) > Date.parse(checkpoint.created_at))) {
        throw new Error("V2 checkpoint active intent 未绑定 request/time");
      }
      const audit = entry.latest_attempt_audit_sha256
        ? cache.attempts.get(entry.latest_attempt_audit_sha256) ?? await this.loadAttemptV2(snapshot, index, entry.latest_attempt_audit_sha256)
        : null;
      if (audit) cache.attempts.set(audit.attempt_sha256, audit);
      if (audit && (audit.request_id !== entry.request_id || audit.idempotency_key !== entry.idempotency_key
        || audit.attempt_ordinal !== entry.attempts_used || Date.parse(audit.finished_at) > Date.parse(checkpoint.created_at))) {
        throw new Error("V2 checkpoint attempt 未绑定 request/ordinal/time");
      }
      const previousEntry = previous?.entries[index];
      if (entry.state === "DISPATCH_INTENT_COMMITTED"
        && (!intent || intent.attempt_ordinal !== entry.attempts_used + 1)) throw new Error("V2 dispatch checkpoint 未绑定下一 ordinal intent");
      if (entry.state === "DISPATCH_INTENT_COMMITTED" && previousEntry
        && Date.parse(intent!.prepared_at) < Date.parse(previous!.created_at)) throw new Error("V2 dispatch intent 早于前驱 checkpoint");
      if (["RECEIPT_COMMITTED","RETRY_READY","BLOCKED_AMBIGUOUS","FAILED_CLOSED","SCHEMA_VALIDATED_COMMITTED"].includes(entry.state)
        && (!intent || !audit || intent.intent_sha256 !== audit.intent_sha256 || intent.attempt_ordinal !== entry.attempts_used)) {
        throw new Error("V2 receipt-derived checkpoint 未绑定同序号 intent/audit");
      }
      if ((entry.state === "RECEIPT_COMMITTED" || entry.state === "BLOCKED_AMBIGUOUS" || entry.state === "FAILED_CLOSED")
        && previousEntry?.state === "DISPATCH_INTENT_COMMITTED" && audit
        && Date.parse(audit.started_at) < Date.parse(previous!.created_at)) throw new Error("V2 provider attempt 早于 durable dispatch");
      if (entry.state === "RETRY_READY" && audit
        && (!(audit.outcome === "not_sent" || audit.outcome === "no_result_confirmed")
          || audit.automatic_retry_allowed !== true || entry.attempts_used >= entry.max_attempts)) throw new Error("V2 retry checkpoint provenance 无效");
      if (entry.state === "BLOCKED_AMBIGUOUS" && audit?.outcome !== "unknown") throw new Error("V2 blocked checkpoint 未绑定 unknown");
      if (entry.state === "RECEIPT_COMMITTED" && audit?.outcome === "unknown") throw new Error("V2 unknown 不得进入 receipt committed");
      if (entry.committed_request_sha256) {
        const committed = cache.commits.get(entry.committed_request_sha256)
          ?? await this.loadCommittedRequestV2(snapshot, index, entry.committed_request_sha256);
        cache.commits.set(committed.committed_request_sha256, committed);
        if (entry.state !== "SCHEMA_VALIDATED_COMMITTED" || committed.request_id !== entry.request_id
          || committed.attempt_sha256 !== audit?.attempt_sha256 || committed.intent_sha256 !== intent?.intent_sha256
          || Date.parse(committed.transport_and_schema_verified_at) > Date.parse(checkpoint.created_at)) {
          throw new Error("V2 committed checkpoint provenance/time 无效");
        }
      } else if (entry.state === "SCHEMA_VALIDATED_COMMITTED") throw new Error("V2 schema-validated checkpoint 缺少 commit");
      if (!intent && (entry.latest_attempt_audit_sha256 !== null || entry.committed_request_sha256 !== null)) {
        throw new Error("V2 checkpoint 引用 attempt/commit 但缺少 intent");
      }
    }
    if (checkpoint.terminal_reason_sha256 !== null) {
      const reason = cache.terminalReasons.get(checkpoint.terminal_reason_sha256)
        ?? await this.loadTerminalReasonV2(snapshot, checkpoint.terminal_reason_sha256);
      cache.terminalReasons.set(reason.terminal_reason_sha256, reason);
      const index = checkpoint.entries.findIndex((entry) => entry.request_id === reason.request_id);
      const entry = checkpoint.entries[index];
      if (!entry || !entry.latest_attempt_audit_sha256 || entry.latest_attempt_audit_sha256 !== reason.source_attempt_sha256
        || !["BLOCKED_AMBIGUOUS","FAILED_CLOSED"].includes(entry.state)
        || Date.parse(reason.created_at) > Date.parse(checkpoint.created_at)) throw new Error("V2 terminal reason 未绑定 terminal checkpoint");
      const audit = cache.attempts.get(reason.source_attempt_sha256) ?? await this.loadAttemptV2(snapshot, index, reason.source_attempt_sha256);
      cache.attempts.set(audit.attempt_sha256, audit);
      if (terminalDetailHashV2(audit) !== reason.detail_sha256
        || (reason.reason_code === "ambiguous_unknown_attempt" && audit.outcome !== "unknown")
        || (reason.reason_code === "invalid_response_received" && audit.outcome !== "invalid_response_received")
        || (reason.reason_code === "attempt_budget_exhausted"
          && !((audit.outcome === "not_sent" || audit.outcome === "no_result_confirmed") && entry.attempts_used >= entry.max_attempts))) {
        throw new Error("V2 terminal reason code/detail 未绑定 audit");
      }
    }
  }

  private async loadIntentV2(run:FormalRunContractV2,bundle:FormalOraclePreregistrationBundleV2,plan:FormalOracleExecutionPlanV1,index:number,intentSha:string):Promise<RequestIntentV3>{
    const intent=parseCanonical<RequestIntentV3>(await this.privateFs.readFile(this.objectPath(run.run_sha256,"request-intents-v3",intentSha,"intent.json")),"V2 request intent");
    validationError("V2 request intent",validateRequestIntentV3(intent));if(intent.intent_sha256!==intentSha||hashRequestIntentV3(intent)!==intentSha||intent.schedule_index!==index)throw new Error("V2 request intent 内容地址/schedule 漂移");
    const syntheticSnapshot={run,preregistration_bundle:bundle,execution_plan:plan,genesis_checkpoint:{checkpoint_sha256:intent.genesis_checkpoint_sha256},migration:{execution_lineage_sha256:intent.execution_lineage_sha256}} as unknown as FormalOracleExecutionV2Snapshot;
    assertIntentRoots(intent,syntheticSnapshot);assertIntentMatchesExecutionPlanV2(intent,plan.items[index]);
    const envelopeBytes=await this.privateFs.readFile(intent.request_envelope_object_uri),bodyBytes=await this.privateFs.readFile(intent.provider_body_object_uri);
    if(intent.request_envelope_object_uri!==this.requestEnvelopeObjectUriV2(run.run_sha256,intent.request_envelope_sha256)||digest(envelopeBytes)!==intent.request_envelope_sha256
      ||intent.provider_body_object_uri!==this.providerBodyObjectUriV2(run.run_sha256,intent.provider_body_sha256)||digest(bodyBytes)!==intent.provider_body_sha256)throw new Error("V2 durable envelope/body 漂移");
    const envelope=parseFormalOraclePiRequestEnvelopeBytes(envelopeBytes);parseFormalOraclePreparedProviderRequestBytes({request_envelope:envelope,provider_body_bytes:bodyBytes});
    assertEnvelopeMatchesExecutionPlanV2(envelope.envelope,plan.items[index],bundle.formal_spec);return intent;
  }

  private nextExecutionCheckpoint(snapshot:FormalOracleExecutionV2Snapshot,entries:OracleGateCheckpointEntryV1[],createdAt:string,runState:RunCheckpointV2["run_state"],terminalReasonSha:string|null):RunCheckpointV2{
    const next:RunCheckpointV2={...snapshot.checkpoint,schema_version:"oracle-gate-run-checkpoint-v2",checkpoint_sha256:"0".repeat(64),generation:snapshot.checkpoint.generation+1,previous_checkpoint_sha256:snapshot.checkpoint.checkpoint_sha256,created_at:createdAt,run_state:runState,terminal_reason_sha256:terminalReasonSha,counts:checkpointCounts(entries),entries,api_execution_allowed:false};
    next.checkpoint_sha256=hashRunCheckpointV2(next);validationError("V2 next checkpoint",validateRunCheckpointV2(next));validationError("V2 next transition",validateRunCheckpointTransitionV2(snapshot.checkpoint,next));return next;
  }

  private async commitExecutionCheckpointUnlocked(snapshot:FormalOracleExecutionV2Snapshot,next:RunCheckpointV2):Promise<FormalOracleExecutionV2Snapshot>{
    await this.privateFs.publishImmutableObject(this.objectDirectory(snapshot.run.run_sha256,"checkpoints",next.checkpoint_sha256),"checkpoint.json",privateCanonicalJsonBytes(next));
    const current=parseCanonical<FormalOracleRunHeadV2>(await this.privateFs.readFile(this.headPath(snapshot.run.run_sha256)),"V2 HEAD CAS");validationError("V2 HEAD CAS",validateFormalOracleRunHeadV2(current));
    if(current.head_record_sha256!==snapshot.head.head_record_sha256||current.generation!==snapshot.head.generation||current.checkpoint_sha256!==snapshot.head.checkpoint_sha256)throw new Error("V2 HEAD CAS 失败：orphan 不得自动采用");
    const terminal=["BLOCKED_AMBIGUOUS","FAILED_CLOSED","EXECUTION_COMPLETE"].includes(next.run_state);
    const head:FormalOracleRunHeadV2={...current,head_record_sha256:"0".repeat(64),generation:next.generation,checkpoint_sha256:next.checkpoint_sha256,updated_at:next.created_at,execution_status:terminal?"execution_v2_terminal_non_executable":"execution_v2_active_non_executable"};
    head.head_record_sha256=hashFormalOracleRunHeadV2(head);validationError("V2 next HEAD",validateFormalOracleRunHeadV2(head));await this.privateFs.replaceFileAtomic(this.headPath(snapshot.run.run_sha256),privateCanonicalJsonBytes(head));return this.loadExecutionInitialized(snapshot.run.run_sha256,this.pinFromExecutionHead(head));
  }

  private pinFromExecutionHead(head: FormalOracleRunHeadV2): FormalOracleHeadPinV2 {
    return {
      schema_version: "formal-oracle-head-pin-v2",
      head_record_sha256: head.head_record_sha256,
      run_sha256: head.run_sha256,
      preregistration_bundle_sha256: head.preregistration_bundle_sha256,
      execution_lineage_sha256: head.execution_lineage_sha256,
      genesis_checkpoint_sha256: head.genesis_checkpoint_sha256,
      migration_sha256: head.migration_sha256,
      generation: head.generation,
      checkpoint_sha256: head.checkpoint_sha256,
    };
  }

  private withLock<T>(runSha256: string, operation: () => Promise<T>): Promise<T> {
    return this.privateFs.withExclusiveLock(`locks/${runSha256}.lock`, `preregistered-run-v2:${runSha256}`, operation);
  }
  private runPath(runSha256: string): string { return `runs/${runSha256}`; }
  private headPath(runSha256: string): string { return `${this.runPath(runSha256)}/HEAD`; }
  private objectDirectory(runSha256: string, kind: string, hash: string): string { return `${this.runPath(runSha256)}/objects/${kind}/${hash}`; }
  private objectPath(runSha256: string, kind: string, hash: string, name: string): string { return `${this.objectDirectory(runSha256, kind, hash)}/${name}`; }
}

/** Breaking V2 execution-store name; the legacy export remains source-compatible for genesis callers. */
export { FormalOraclePreregistrationStoreV2 as FormalOracleRunStoreV2 };
