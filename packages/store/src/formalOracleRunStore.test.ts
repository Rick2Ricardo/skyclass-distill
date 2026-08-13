import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, link, mkdtemp, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OracleGateFormalSpec } from "../../contracts/src/oracle-gate-formal.js";
import { canonicalOracleGateFormalSpecPayload } from "../../contracts/src/oracle-gate-formal.js";
import {
  ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  ORACLE_GATE_RESPONSE_VALIDATOR_VERSION,
  canonicalOracleGateResponseBytes,
} from "../../contracts/src/oracle-gate-response.js";
import {
  buildFormalOraclePiResponseStreamFixtureV1,
  createFormalOraclePiResponseStreamArtifactV1,
  type FormalOraclePiResponseStreamArtifactV1,
} from "../../contracts/src/oracle-gate-pi-response-stream.js";
import {
  createFormalOracleInvalidResponseArtifactV1,
  type FormalOracleInvalidResponseArtifactV1,
} from "../../contracts/src/oracle-gate-invalid-response.js";
import { revalidateFormalOracleTransportCaptureArtifactV1 } from "../../contracts/src/oracle-gate-transport-capture.js";
import {
  buildFormalOraclePiRequestEnvelope,
  type FormalOraclePiRequestArtifact,
} from "../../contracts/src/oracle-gate-request.js";
import {
  FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
  FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
  FORMAL_ORACLE_PROVIDER_TOKEN_FIELD,
  buildFormalOraclePreparedProviderRequest,
  type FormalOraclePreparedProviderRequestArtifactV1,
} from "../../contracts/src/oracle-gate-provider-request.js";
import {
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES,
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
  FORMAL_ORACLE_USER_PROMPT_VERSION,
  renderFormalOracleUserPrompt,
} from "../../contracts/src/oracle-gate-user-prompt.js";
import type {
  CommittedRequestV3,
  FormalRunContractV1,
  OracleGateRunArm,
  OracleGateAttemptOutcome,
  RequestAttemptAuditV3,
  RequestIntentV1,
  RunCheckpointV1,
} from "../../contracts/src/oracle-gate-run.js";
import {
  hashCommittedRequest,
  hashFormalRunContract,
  hashPublicBlindResponse,
  hashRequestAttemptAudit,
  hashRequestIntent,
  hashRunCheckpoint,
} from "../../contracts/src/oracle-gate-run.js";
import {
  assertActiveFormalOracleConsumedDispatchLease,
  consumeFormalOracleSingleConsumeDispatchLease,
  FormalOracleRunStore,
  assertActiveFormalOracleCompletedRunCapability,
  hashFormalOracleExecutionPlan,
  hashFormalOracleStructuralSchedule,
  type CreateSealedRunInput,
  type FormalOracleConsumedDispatchLease,
  type FormalOracleExecutionPlanV1,
  type FormalOracleSingleConsumeDispatchLease,
  type FormalOracleStructuralScheduleV1,
} from "./formalOracleRunStore.js";
import { privateCanonicalJsonBytes, PrivateContentAddressedFs } from "./privateContentAddressedFs.js";
import { generateKeyPairSync } from "node:crypto";
import { FormalOracleTransportAuthorityStore } from "./formalOracleTransportAuthorityStore.js";
import { withPinnedFormalOracleTransportAuthority } from "../../distillation/src/oracleTransportAuthorityGate.js";
import {
  sendFormalOracleSingleConsumeRequestV1,
  type FormalOracleCredentialProvider,
  type FormalOracleAuthoritativeTransportCaptureArtifactV1,
  type FormalOraclePinnedHttpsRequestV1,
  type FormalOraclePinnedHttpsResponseV1,
} from "../../llm/src/formalOracleSingleConsumeSender.js";

type SenderTestRuntime = {
  resolveAll(hostname: string): Promise<Array<{ address: string; family: 4 | 6 }>>;
  sendPinned(input: FormalOraclePinnedHttpsRequestV1): Promise<FormalOraclePinnedHttpsResponseV1>;
};

const senderBoundary = vi.hoisted(() => ({
  runtime: null as SenderTestRuntime | null,
}));

vi.mock("node:dns/promises", () => ({
  lookup: (hostname: string) => {
    if (!senderBoundary.runtime) throw new Error("Sender test DNS runtime 未安装");
    return senderBoundary.runtime.resolveAll(hostname);
  },
}));

vi.mock("node:https", async () => {
  const { EventEmitter } = await import("node:events");
  return ({
  request: (url: URL, options: Record<string, unknown>, onResponse: (response: InstanceType<typeof EventEmitter> & Record<string, unknown>) => void) => {
    const request = new EventEmitter() as InstanceType<typeof EventEmitter> & { end(body: Uint8Array): void; destroy(error: Error): void };
    request.destroy = (error: Error) => queueMicrotask(() => request.emit("error", error));
    request.end = (body: Uint8Array) => {
      queueMicrotask(async () => {
        try {
          if (!senderBoundary.runtime) throw new Error("Sender test HTTPS runtime 未安装");
          let selectedAddress = "", selectedFamily: 4 | 6 = 4;
          const lookup = options.lookup as (hostname: string, options: unknown, callback: (error: Error | null, address: string, family: 4 | 6) => void) => void;
          lookup(url.hostname, {}, (error, address, family) => {
            if (error) throw error;
            selectedAddress = address;
            selectedFamily = family;
          });
          const headers = new Headers(options.headers as HeadersInit);
          const result = await senderBoundary.runtime.sendPinned({
            url: url.toString(), method: "POST", headers, body: Uint8Array.from(body), selected_address: selectedAddress,
            selected_family: selectedFamily, timeout_ms: Number(options.timeout), max_response_bytes: Number.MAX_SAFE_INTEGER,
            signal: options.signal as AbortSignal | undefined,
          });
          const response = new EventEmitter() as InstanceType<typeof EventEmitter> & Record<string, unknown>;
          response.statusCode = result.status;
          response.headers = Object.fromEntries(result.headers.map(({ name, value }) => [name, value]));
          response.socket = { remoteAddress: selectedAddress, remoteFamily: selectedFamily === 4 ? "IPv4" : "IPv6" };
          onResponse(response);
          if (result.body.byteLength) response.emit("data", Buffer.from(result.body));
          result.complete ? response.emit("end") : response.emit("aborted");
        } catch (error) {
          request.emit("error", error);
        }
      });
    };
    return request;
  },
});
});

const RUN_STORE_URI = "board2skill/formal-oracle/run-store";
const created: string[] = [];
const SYSTEM_PROMPT_BYTES = Buffer.from("frozen formal system prompt\n", "utf8");
const USER_TEMPLATE_BYTES = Buffer.from(FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES);
const SELECTED_TRANSCRIPT_BYTES = Buffer.from("[00:00:00.000 --> 00:00:00.750] 先观察板书\n", "utf8");

afterEach(async () => {
  senderBoundary.runtime = null;
  vi.useRealTimers();
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function sha(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function time(second: number): string {
  return new Date(Date.parse("2026-08-12T00:00:00.000Z") + second * 1000).toISOString();
}

function formalSpec(): OracleGateFormalSpec {
  const spec: OracleGateFormalSpec = {
    schema_version: "oracle-gate-formal-spec-v1",
    spec_sha256: "0".repeat(64),
    input_manifest_sha256: "2".repeat(64),
    signed_gold_dataset_sha256: "1".repeat(64),
    code_revision: "8".repeat(40),
    model: "fixture-model",
    transport: "pi",
    cache_retention: "none",
    tools_policy: "none",
    temperature: 0,
    seeds: [17, 23, 41],
    prompt: {
      version: FORMAL_ORACLE_USER_PROMPT_VERSION,
      system_sha256: sha(SYSTEM_PROMPT_BYTES),
      user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
      output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
    },
    budget: {
      max_input_tokens: 8192,
      max_output_tokens: 2048,
      visual_items_per_visual_arm: 1,
      canvas: { mime_type: "image/jpeg", width: 1920, height: 360, quality: 88 },
      timeout_ms: 120_000,
      max_attempts: 2,
    },
    evaluation: {
      rubric_version: "rubric-v1",
      rubric_sha256: "b".repeat(64),
      rating_schema_version: "oracle-gate-rating-v1",
      independent_raters: 2,
      primary_ci: 0.8,
      descriptive_ci: 0.95,
      bootstrap_seed: 71,
      strongest_non_oracle_rule: "best_pre_registered_non_oracle_on_development",
      missing_request_policy: "fail_closed_no_partial_decision",
    },
  };
  spec.spec_sha256 = sha(canonicalOracleGateFormalSpecPayload(spec));
  return spec;
}

function renderedUserPrompt(index: number): Buffer {
  const arm = structuralSchedule(formalSpec())[index].arm;
  return Buffer.from(renderFormalOracleUserPrompt({
    prompt_version: FORMAL_ORACLE_USER_PROMPT_VERSION,
    user_template_bytes: USER_TEMPLATE_BYTES,
    expected_user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
    selected_transcript_bytes: SELECTED_TRANSCRIPT_BYTES,
    expected_selected_transcript_sha256: sha(SELECTED_TRANSCRIPT_BYTES),
    expected_selected_transcript_byte_length: SELECTED_TRANSCRIPT_BYTES.byteLength,
    visual_input_available: arm !== "transcript_only",
    output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  }).bytes);
}

function visualBytes(arm: string, seed: number): Buffer {
  return Buffer.from(`canonical-visual-${arm}-${seed}`, "utf8");
}

function requestPayload(index: number, drift: { model?: string; seed?: number; max_output_tokens?: number } = {}): FormalOraclePiRequestArtifact {
  const spec = formalSpec();
  const scheduled = structuralSchedule(spec)[index];
  const rendered = renderedUserPrompt(index);
  const userPrompt = renderFormalOracleUserPrompt({
    prompt_version: FORMAL_ORACLE_USER_PROMPT_VERSION,
    user_template_bytes: USER_TEMPLATE_BYTES,
    expected_user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
    selected_transcript_bytes: SELECTED_TRANSCRIPT_BYTES,
    expected_selected_transcript_sha256: sha(SELECTED_TRANSCRIPT_BYTES),
    expected_selected_transcript_byte_length: SELECTED_TRANSCRIPT_BYTES.byteLength,
    visual_input_available: scheduled.arm !== "transcript_only",
    output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  });
  const visual = scheduled.arm === "transcript_only" ? undefined : visualBytes(scheduled.arm, scheduled.seed);
  return buildFormalOraclePiRequestEnvelope({
    request_id: scheduled.request_id, schedule_index: index, case_id: scheduled.case_id, arm: scheduled.arm,
    model: drift.model ?? spec.model, system_prompt_bytes: SYSTEM_PROMPT_BYTES, expected_system_prompt_sha256: spec.prompt.system_sha256,
    user_prompt: userPrompt, expected_rendered_user_prompt_sha256: sha(rendered),
    expected_user_template_sha256: spec.prompt.user_template_sha256,
    output_schema_sha256: spec.prompt.output_schema_sha256,
    visuals: visual ? [{ label: "visual-1", mime_type: "image/jpeg", bytes: visual, expected_sha256: sha(visual), expected_byte_length: visual.byteLength }] : [],
    seed: drift.seed ?? scheduled.seed, temperature: spec.temperature, max_input_tokens: spec.budget.max_input_tokens,
    max_output_tokens: drift.max_output_tokens ?? spec.budget.max_output_tokens, timeout_ms: spec.budget.timeout_ms,
    max_attempts: spec.budget.max_attempts, transport: spec.transport, cache_retention: spec.cache_retention,
    tools_policy: spec.tools_policy,
  });
}

function preparedPayload(payload: FormalOraclePiRequestArtifact): FormalOraclePreparedProviderRequestArtifactV1 {
  return buildFormalOraclePreparedProviderRequest(payload);
}

function structuralSchedule(spec: OracleGateFormalSpec): FormalOracleStructuralScheduleV1 {
  const arms = ["transcript_only", "static_final_board", "uniform_frame", "oracle_delta"] as const;
  return spec.seeds.flatMap((seed) => arms.map((arm, armIndex) => {
    const index = spec.seeds.indexOf(seed) * arms.length + armIndex;
    return {
      request_id: `FREQ-store-${String(index).padStart(3, "0")}`,
      idempotency_key: sha(`idempotency-${index}`),
      case_id: "FCASE-store-001",
      package_id: "package-001",
      group_id: "group-001",
      source_video_id: "video-001",
      arm,
      seed,
    };
  }));
}

function executionPlan(spec: OracleGateFormalSpec, schedule: FormalOracleStructuralScheduleV1): FormalOracleExecutionPlanV1 {
  const plan: FormalOracleExecutionPlanV1 = {
    schema_version: "formal-oracle-execution-plan-v2",
    execution_plan_sha256: "0".repeat(64),
    items: schedule.map((item, index) => ({
      request_id: item.request_id,
      idempotency_key: item.idempotency_key,
      schedule_index: index,
      case_id: item.case_id,
      arm: item.arm,
      seed: item.seed,
      model: spec.model,
      request_envelope_sha256: requestPayload(index).payload_sha256,
      provider_body_sha256: preparedPayload(requestPayload(index)).provider_body_sha256,
      provider_body_profile: FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
      provider_body_dispatch_status: "pending_local_pi_fetch_boundary_proof_non_executable",
      prepared_adapter_version: FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
      provider_token_field: FORMAL_ORACLE_PROVIDER_TOKEN_FIELD,
      system_prompt_sha256: spec.prompt.system_sha256,
      // Rendered request prompt is intentionally different from the template hash.
      user_prompt_sha256: sha(renderedUserPrompt(index)),
      output_schema_sha256: spec.prompt.output_schema_sha256,
      visuals: item.arm === "transcript_only" ? [] : [{
        label: "visual-1",
        object_uri: `frozen-assets/${item.arm}-${item.seed}.jpg`,
        sha256: sha(visualBytes(item.arm, item.seed)),
        mime_type: "image/jpeg",
        width: 1920,
        height: 360,
        byte_length: visualBytes(item.arm, item.seed).byteLength,
      }],
      transport: spec.transport,
      temperature: spec.temperature,
      max_input_tokens: spec.budget.max_input_tokens,
      max_output_tokens: spec.budget.max_output_tokens,
      timeout_ms: spec.budget.timeout_ms,
      max_attempts: spec.budget.max_attempts,
      cache_retention: spec.cache_retention,
      tools_policy: spec.tools_policy,
    })),
  };
  plan.execution_plan_sha256 = hashFormalOracleExecutionPlan(plan);
  return plan;
}

function formalRun(
  spec: OracleGateFormalSpec,
  schedule: FormalOracleStructuralScheduleV1,
  plan: FormalOracleExecutionPlanV1,
): FormalRunContractV1 {
  const run: FormalRunContractV1 = {
    schema_version: "oracle-gate-formal-run-contract-v1",
    run_sha256: "0".repeat(64),
    canonicalization: "oracle-gate-run-canonical-json-v1",
    signed_gold_dataset_sha256: spec.signed_gold_dataset_sha256,
    formal_input_manifest_sha256: spec.input_manifest_sha256,
    formal_spec_sha256: spec.spec_sha256,
    schedule_sha256: hashFormalOracleStructuralSchedule(schedule),
    execution_plan_sha256: plan.execution_plan_sha256,
    ledger_registry_sha256: "5".repeat(64),
    media_attestation_sha256: "6".repeat(64),
    speech_attestation_sha256: "7".repeat(64),
    code_revision: spec.code_revision,
    build_artifact_sha256: "9".repeat(64),
    blinding_secret_commitment_sha256: "a".repeat(64),
    blinding_scheme: "hmac-sha256-run-request-v1",
    rating_plan_sha256: "b".repeat(64),
    statistics_plan_sha256: "c".repeat(64),
    run_store_uri: RUN_STORE_URI,
    request_count: schedule.length,
    directory_mode: "0700",
    file_mode: "0600",
    lock_scheme: "exclusive-create-owner-nonce-v1",
    checkpoint_scheme: "immutable-hash-chain-head-v1",
    remote_idempotency_mode: "local_only_fail_closed",
    api_execution_allowed: false,
  };
  run.run_sha256 = hashFormalRunContract(run);
  return run;
}

function initialCheckpoint(run: FormalRunContractV1, plan: FormalOracleExecutionPlanV1): RunCheckpointV1 {
  const checkpoint: RunCheckpointV1 = {
    schema_version: "oracle-gate-run-checkpoint-v1",
    checkpoint_sha256: "0".repeat(64),
    run_sha256: run.run_sha256,
    schedule_sha256: run.schedule_sha256,
    generation: 0,
    previous_checkpoint_sha256: null,
    created_at: "2026-08-12T00:00:00.000Z",
    run_state: "SEALED_READY",
    terminal_reason_sha256: null,
    request_count: run.request_count,
    counts: {
      pending: run.request_count, retry_ready: 0, dispatch_intent_committed: 0, receipt_committed: 0,
      schema_validated_committed: 0, blocked_ambiguous: 0, failed_closed: 0,
    },
    entries: plan.items.map((item) => ({
      request_id: item.request_id,
      idempotency_key: item.idempotency_key,
      state: "PENDING",
      resume_action: "dispatch_new_attempt",
      max_attempts: item.max_attempts,
      attempts_used: 0,
      active_intent_sha256: null,
      latest_attempt_audit_sha256: null,
      committed_request_sha256: null,
    })),
  };
  checkpoint.checkpoint_sha256 = hashRunCheckpoint(checkpoint);
  return checkpoint;
}

function sealedInputFrom(spec: OracleGateFormalSpec, structural: FormalOracleStructuralScheduleV1): CreateSealedRunInput {
  const plan = executionPlan(spec, structural);
  const run = formalRun(spec, structural, plan);
  return { run, formal_spec: spec, structural_schedule: structural, execution_plan: plan, initial_checkpoint: initialCheckpoint(run, plan) };
}

function sealedInput(): CreateSealedRunInput {
  const spec = formalSpec();
  return sealedInputFrom(spec, structuralSchedule(spec));
}

function requestIntent(
  input: CreateSealedRunInput,
  payload: FormalOraclePiRequestArtifact,
  store: FormalOracleRunStore,
  index = 1,
  attemptOrdinal = 1,
  preparedAt = "2026-08-12T00:00:01.000Z",
): RequestIntentV1 {
  const expected = input.execution_plan.items[index];
  const prepared = preparedPayload(payload);
  const request: RequestIntentV1 = {
    schema_version: "oracle-gate-request-intent-v2",
    intent_sha256: "0".repeat(64),
    run_sha256: input.run.run_sha256,
    request_id: expected.request_id,
    idempotency_key: expected.idempotency_key,
    schedule_index: expected.schedule_index,
    attempt_ordinal: attemptOrdinal,
    prepared_at: preparedAt,
    case_id: expected.case_id,
    arm: expected.arm,
    seed: expected.seed,
    model: expected.model,
    request_envelope_sha256: payload.payload_sha256,
    request_envelope_object_uri: store.requestObjectUri(input.run.run_sha256, payload.payload_sha256),
    provider_body_sha256: prepared.provider_body_sha256,
    provider_body_object_uri: store.providerBodyObjectUri(input.run.run_sha256, prepared.provider_body_sha256),
    provider_body_profile: FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
    provider_body_dispatch_status: "pending_local_pi_fetch_boundary_proof_non_executable",
    prepared_adapter_version: FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
    provider_token_field: FORMAL_ORACLE_PROVIDER_TOKEN_FIELD,
    system_prompt_sha256: expected.system_prompt_sha256,
    user_prompt_sha256: expected.user_prompt_sha256,
    output_schema_sha256: expected.output_schema_sha256,
    visuals: structuredClone(expected.visuals),
    transport: expected.transport,
    temperature: expected.temperature,
    max_input_tokens: expected.max_input_tokens,
    max_output_tokens: expected.max_output_tokens,
    timeout_ms: expected.timeout_ms,
    max_attempts: expected.max_attempts,
    cache_retention: expected.cache_retention,
    tools_policy: expected.tools_policy,
  };
  request.intent_sha256 = hashRequestIntent(request);
  return request;
}

async function attemptAudit(
  intent: RequestIntentV1,
  store: FormalOracleRunStore,
  executionPlanSha256: string,
  outcome: OracleGateAttemptOutcome,
  options: {
    started_at?: string;
    finished_at?: string;
    response_bytes?: Buffer;
    parsed_response?: Record<string, unknown>;
  } = {},
  authorizeCapture = true,
): Promise<{ audit: RequestAttemptAuditV3; response_artifact?: FormalOraclePiResponseStreamArtifactV1; transport_capture_artifact?: FormalOracleAuthoritativeTransportCaptureArtifactV1; parsed_response?: Record<string, unknown> }> {
  const startedAt = options.started_at ?? "2026-08-12T00:00:03.000Z";
  const finishedAt = options.finished_at ?? "2026-08-12T00:00:04.000Z";
  const parsedResponse = outcome === "result_received" ? (options.parsed_response ?? oracleResponse()) : undefined;
  const result = outcome === "result_received";
  const canonicalResponseBytes = result ? Buffer.from(canonicalOracleGateResponseBytes(parsedResponse!)) : undefined;
  const rawSseBytes = result ? (options.response_bytes ?? Buffer.from(buildFormalOraclePiResponseStreamFixtureV1({
    response_id: `chatcmpl-fixture-${intent.attempt_ordinal}`,
    model: intent.model,
    created: 1,
    content_chunks: [canonicalResponseBytes!.toString("utf8")],
    usage: {
      prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
      prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 },
    },
  }))) : undefined;
  const sent = result && authorizeCapture ? await senderScenario({
    resolveAll: async () => [{ address: "8.8.8.8", family: 4 }],
    sendPinned: async () => ({ status: 200,
      headers: [{ name: "content-type", value: "text/event-stream" }, { name: "x-request-id", value: `provider-http-${intent.attempt_ordinal}` }],
      body: rawSseBytes!, complete: true }),
  }, intent.arm, { attempt_ordinal: intent.attempt_ordinal, schedule_index: intent.schedule_index,
    prepared_at: intent.prepared_at, started_at: startedAt }) : undefined;
  const responseArtifact = sent?.response_artifact ?? (result ? createFormalOraclePiResponseStreamArtifactV1({
    raw_sse_bytes: rawSseBytes!, expected_model: intent.model,
    request_envelope_sha256: intent.request_envelope_sha256, provider_body_sha256: intent.provider_body_sha256,
    expected_max_input_tokens: intent.max_input_tokens, expected_max_output_tokens: intent.max_output_tokens,
  }) : undefined);
  const proof = responseArtifact?.proof;
  const capture = sent?.capture_artifact ?? undefined;
  const audit: RequestAttemptAuditV3 = {
    schema_version: "oracle-gate-request-attempt-audit-v4",
    attempt_sha256: "0".repeat(64),
    run_sha256: intent.run_sha256,
    request_id: intent.request_id,
    idempotency_key: intent.idempotency_key,
    intent_sha256: intent.intent_sha256,
    attempt_ordinal: intent.attempt_ordinal,
    started_at: startedAt,
    finished_at: finishedAt,
    latency_ms: Date.parse(finishedAt) - Date.parse(startedAt),
    provider_id: "fixture-provider",
    provider_http_request_id: result || outcome === "invalid_response_received" ? `provider-http-${intent.attempt_ordinal}` : null,
    transport_capture_record_object_uri: capture ? store.transportCaptureRecordObjectUri(intent.run_sha256, capture.record.capture_record_sha256) : null,
    transport_capture_record_sha256: capture?.record.capture_record_sha256 ?? null,
    response_http_status: result ? 200 : null,
    response_content_type: result ? "text/event-stream" : null,
    response_headers_commitment_sha256: capture?.record.response_headers_commitment_sha256 ?? null,
    response_capture_status: result ? "fetch_observed_complete_entity" : "no_response_headers",
    completion_id: proof?.response_id ?? null,
    request_envelope_sha256: intent.request_envelope_sha256,
    request_envelope_object_uri: intent.request_envelope_object_uri,
    provider_body_sha256: intent.provider_body_sha256,
    provider_body_object_uri: intent.provider_body_object_uri,
    fetch_observed_sse_object_uri: proof ? store.fetchObservedSseObjectUri(intent.run_sha256, proof.raw_sse_sha256) : null,
    fetch_observed_sse_bytes_sha256: proof?.raw_sse_sha256 ?? null,
    fetch_observed_sse_byte_length: proof?.raw_sse_byte_length ?? null,
    sse_derivation_object_uri: proof ? store.sseDerivationObjectUri(intent.run_sha256, proof.proof_sha256) : null,
    sse_derivation_record_sha256: proof?.proof_sha256 ?? null,
    sse_parser_version: proof?.schema_version ?? null,
    assistant_content_object_uri: proof ? store.assistantContentObjectUri(intent.run_sha256, proof.assistant_content_sha256) : null,
    assistant_content_bytes_sha256: proof?.assistant_content_sha256 ?? null,
    assistant_content_byte_length: proof?.assistant_content_byte_length ?? null,
    canonical_response_object_uri: result ? store.canonicalResponseObjectUri(intent.run_sha256, sha(canonicalResponseBytes!)) : null,
    canonical_response_bytes_sha256: result ? sha(canonicalResponseBytes!) : null,
    canonical_response_commitment_sha256: result ? hashPublicBlindResponse(parsedResponse!) : null,
    invalid_response_record_object_uri: null,
    invalid_response_record_sha256: null,
    invalid_response_record_version: null,
    submitted_visuals: structuredClone(intent.visuals),
    model: intent.model,
    transport: intent.transport,
    temperature: intent.temperature,
    max_input_tokens: intent.max_input_tokens,
    max_output_tokens: intent.max_output_tokens,
    timeout_ms: intent.timeout_ms,
    seed: intent.seed,
    cache_retention: intent.cache_retention,
    tools_policy: intent.tools_policy,
    outcome,
    provider_response_received: result,
    stop_reason: result ? "stop" : null,
    error_code: result ? null : `${outcome}_fixture`,
    error_message: result ? null : `${outcome} was recorded by fixture`,
    usage: result ? { input_tokens: 100, output_tokens: 20, total_tokens: 120, cache_read_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0 } : null,
    pricing_table_sha256: result ? "4".repeat(64) : null,
    cost_microunits: result ? 123 : null,
    automatic_retry_allowed: (outcome === "not_sent" || outcome === "no_result_confirmed")
      && intent.attempt_ordinal < intent.max_attempts,
  };
  audit.attempt_sha256 = hashRequestAttemptAudit(audit);
  return { audit, response_artifact: responseArtifact, transport_capture_artifact: capture, parsed_response: parsedResponse };
}

function committedRequest(intent: RequestIntentV1, audit: RequestAttemptAuditV3, schemaValidatedAt: string): CommittedRequestV3 {
  const committed: CommittedRequestV3 = {
    schema_version: "oracle-gate-committed-request-v3",
    committed_request_sha256: "0".repeat(64),
    run_sha256: intent.run_sha256,
    request_id: intent.request_id,
    idempotency_key: intent.idempotency_key,
    intent_sha256: intent.intent_sha256,
    attempt_sha256: audit.attempt_sha256,
    attempt_ordinal: audit.attempt_ordinal,
    canonical_response_object_uri: String(audit.canonical_response_object_uri),
    canonical_response_bytes_sha256: String(audit.canonical_response_bytes_sha256),
    canonical_response_commitment_sha256: String(audit.canonical_response_commitment_sha256),
    validator_version: ORACLE_GATE_RESPONSE_VALIDATOR_VERSION,
    transport_and_schema_verified_at: schemaValidatedAt,
    transport_and_schema_verified: true,
    semantic_review_status: "pending_external_blind_review",
    provider_stop_confirmed: true,
  };
  committed.committed_request_sha256 = hashCommittedRequest(committed);
  return committed;
}

async function partialUnknownAttemptAudit(
  intent: RequestIntentV1,
  store: FormalOracleRunStore,
  executionPlanSha256: string,
): Promise<{ audit: RequestAttemptAuditV3; transport_capture_artifact: FormalOracleAuthoritativeTransportCaptureArtifactV1 }> {
  const startedAt = time(3), finishedAt = time(4);
  const sent = await senderScenario({ resolveAll: async () => [{ address: "8.8.8.8", family: 4 }],
    sendPinned: async () => ({ status: 200,
      headers: [{ name: "content-type", value: "text/event-stream" }, { name: "x-request-id", value: "provider-http-partial" }],
      body: new TextEncoder().encode("data: {\"partial\":"), complete: false }),
  }, intent.arm, { attempt_ordinal: intent.attempt_ordinal, schedule_index: intent.schedule_index,
    prepared_at: intent.prepared_at, started_at: startedAt });
  const capture = sent.capture_artifact!;
  const base = (await attemptAudit(intent, store, executionPlanSha256, "unknown", { started_at: startedAt, finished_at: finishedAt })).audit;
  const audit: RequestAttemptAuditV3 = {
    ...base,
    attempt_sha256: "0".repeat(64), provider_http_request_id: "provider-http-partial",
    transport_capture_record_object_uri: store.transportCaptureRecordObjectUri(intent.run_sha256, capture.record.capture_record_sha256),
    transport_capture_record_sha256: capture.record.capture_record_sha256,
    response_http_status: 200, response_content_type: "text/event-stream",
    response_headers_commitment_sha256: capture.record.response_headers_commitment_sha256,
    response_capture_status: "response_entity_incomplete_unknown",
  };
  audit.attempt_sha256 = hashRequestAttemptAudit(audit);
  return { audit, transport_capture_artifact: capture };
}

async function invalidAttemptAudit(
  intent: RequestIntentV1,
  store: FormalOracleRunStore,
  executionPlanSha256: string,
  raw: Uint8Array,
  arm: OracleGateRunArm,
  startedAt = "2026-08-12T00:00:03.000Z",
  finishedAt = "2026-08-12T00:00:04.000Z",
): Promise<{ audit: RequestAttemptAuditV3; invalid_response_artifact: FormalOracleInvalidResponseArtifactV1; transport_capture_artifact: FormalOracleAuthoritativeTransportCaptureArtifactV1 }> {
  const sent = await senderScenario({ resolveAll: async () => [{ address: "8.8.8.8", family: 4 }],
    sendPinned: async () => ({ status: 200,
      headers: [{ name: "content-type", value: "text/event-stream" }, { name: "x-request-id", value: `provider-http-${intent.attempt_ordinal}` }],
      body: raw, complete: true }),
  }, arm, { attempt_ordinal: intent.attempt_ordinal, schedule_index: intent.schedule_index,
    prepared_at: intent.prepared_at, started_at: startedAt });
  const artifact = sent.invalid_response_artifact!;
  const record = artifact.record;
  const capture = sent.capture_artifact!;
  const audit: RequestAttemptAuditV3 = {
    schema_version: "oracle-gate-request-attempt-audit-v4", attempt_sha256: "0".repeat(64),
    run_sha256: intent.run_sha256, request_id: intent.request_id, idempotency_key: intent.idempotency_key,
    intent_sha256: intent.intent_sha256, attempt_ordinal: intent.attempt_ordinal,
    started_at: startedAt, finished_at: finishedAt, latency_ms: Date.parse(finishedAt) - Date.parse(startedAt),
    provider_id: "fixture-provider", provider_http_request_id: `provider-http-${intent.attempt_ordinal}`,
    transport_capture_record_object_uri: store.transportCaptureRecordObjectUri(intent.run_sha256, capture.record.capture_record_sha256),
    transport_capture_record_sha256: capture.record.capture_record_sha256,
    response_http_status: 200, response_content_type: "text/event-stream",
    response_headers_commitment_sha256: capture.record.response_headers_commitment_sha256, response_capture_status: "fetch_observed_complete_entity",
    completion_id: null,
    request_envelope_sha256: intent.request_envelope_sha256, request_envelope_object_uri: intent.request_envelope_object_uri,
    provider_body_sha256: intent.provider_body_sha256, provider_body_object_uri: intent.provider_body_object_uri,
    fetch_observed_sse_object_uri: store.fetchObservedSseObjectUri(intent.run_sha256, record.fetch_observed_sse_bytes_sha256),
    fetch_observed_sse_bytes_sha256: record.fetch_observed_sse_bytes_sha256,
    fetch_observed_sse_byte_length: record.fetch_observed_sse_byte_length,
    sse_derivation_object_uri: record.sse_derivation_record_sha256 ? store.sseDerivationObjectUri(intent.run_sha256, record.sse_derivation_record_sha256) : null,
    sse_derivation_record_sha256: record.sse_derivation_record_sha256,
    sse_parser_version: record.sse_derivation_record_sha256 ? "formal-oracle-pi-response-stream-v1" : null,
    assistant_content_object_uri: record.assistant_content_bytes_sha256 ? store.assistantContentObjectUri(intent.run_sha256, record.assistant_content_bytes_sha256) : null,
    assistant_content_bytes_sha256: record.assistant_content_bytes_sha256,
    assistant_content_byte_length: record.assistant_content_byte_length,
    canonical_response_object_uri: null, canonical_response_bytes_sha256: null, canonical_response_commitment_sha256: null,
    invalid_response_record_object_uri: store.invalidResponseRecordObjectUri(intent.run_sha256, record.invalid_response_record_sha256),
    invalid_response_record_sha256: record.invalid_response_record_sha256, invalid_response_record_version: record.schema_version,
    submitted_visuals: structuredClone(intent.visuals), model: intent.model, transport: "pi", temperature: 0,
    max_input_tokens: intent.max_input_tokens, max_output_tokens: intent.max_output_tokens, timeout_ms: intent.timeout_ms,
    seed: intent.seed, cache_retention: "none", tools_policy: "none", outcome: "invalid_response_received",
    provider_response_received: true, stop_reason: null, error_code: "invalid_response_received", error_message: null,
    usage: null, pricing_table_sha256: null, cost_microunits: null, automatic_retry_allowed: false,
  };
  audit.attempt_sha256 = hashRequestAttemptAudit(audit);
  return { audit, invalid_response_artifact: artifact, transport_capture_artifact: capture };
}

async function metadataInvalidAttemptAudit(
  intent: RequestIntentV1,
  store: FormalOracleRunStore,
  raw: Uint8Array,
  arm: OracleGateRunArm,
  startedAt = time(3),
  finishedAt = time(4),
): Promise<{ audit: RequestAttemptAuditV3; invalid_response_artifact: FormalOracleInvalidResponseArtifactV1; transport_capture_artifact: FormalOracleAuthoritativeTransportCaptureArtifactV1 }> {
  const sent = await senderScenario({ resolveAll: async () => [{ address: "8.8.8.8", family: 4 }],
    sendPinned: async () => ({ status: 200, headers: [{ name: "x-request-id", value: `provider-http-${intent.attempt_ordinal}` }],
      body: raw, complete: true }),
  }, arm, { attempt_ordinal: intent.attempt_ordinal, schedule_index: intent.schedule_index,
    prepared_at: intent.prepared_at, started_at: startedAt });
  const artifact = sent.invalid_response_artifact!, capture = sent.capture_artifact!, record = artifact.record;
  const audit: RequestAttemptAuditV3 = {
    schema_version: "oracle-gate-request-attempt-audit-v4", attempt_sha256: "0".repeat(64), run_sha256: intent.run_sha256,
    request_id: intent.request_id, idempotency_key: intent.idempotency_key, intent_sha256: intent.intent_sha256,
    attempt_ordinal: intent.attempt_ordinal, started_at: startedAt, finished_at: finishedAt,
    latency_ms: Date.parse(finishedAt) - Date.parse(startedAt), provider_id: "fixture-provider",
    provider_http_request_id: `provider-http-${intent.attempt_ordinal}`,
    transport_capture_record_object_uri: store.transportCaptureRecordObjectUri(intent.run_sha256, capture.record.capture_record_sha256),
    transport_capture_record_sha256: capture.record.capture_record_sha256, response_http_status: 200, response_content_type: null,
    response_headers_commitment_sha256: capture.record.response_headers_commitment_sha256,
    response_capture_status: "fetch_observed_complete_entity", completion_id: null,
    request_envelope_sha256: intent.request_envelope_sha256, request_envelope_object_uri: intent.request_envelope_object_uri,
    provider_body_sha256: intent.provider_body_sha256, provider_body_object_uri: intent.provider_body_object_uri,
    fetch_observed_sse_object_uri: store.fetchObservedSseObjectUri(intent.run_sha256, record.fetch_observed_sse_bytes_sha256),
    fetch_observed_sse_bytes_sha256: record.fetch_observed_sse_bytes_sha256, fetch_observed_sse_byte_length: record.fetch_observed_sse_byte_length,
    sse_derivation_object_uri: null, sse_derivation_record_sha256: null, sse_parser_version: null,
    assistant_content_object_uri: null, assistant_content_bytes_sha256: null, assistant_content_byte_length: null,
    canonical_response_object_uri: null, canonical_response_bytes_sha256: null, canonical_response_commitment_sha256: null,
    invalid_response_record_object_uri: store.invalidResponseRecordObjectUri(intent.run_sha256, record.invalid_response_record_sha256),
    invalid_response_record_sha256: record.invalid_response_record_sha256, invalid_response_record_version: record.schema_version,
    submitted_visuals: structuredClone(intent.visuals), model: intent.model, transport: "pi", temperature: 0,
    max_input_tokens: intent.max_input_tokens, max_output_tokens: intent.max_output_tokens, timeout_ms: intent.timeout_ms,
    seed: intent.seed, cache_retention: "none", tools_policy: "none", outcome: "invalid_response_received",
    provider_response_received: true, stop_reason: null, error_code: "invalid_response_received", error_message: null,
    usage: null, pricing_table_sha256: null, cost_microunits: null, automatic_retry_allowed: false,
  };
  audit.attempt_sha256 = hashRequestAttemptAudit(audit);
  return { audit, invalid_response_artifact: artifact, transport_capture_artifact: capture };
}

function oracleResponse(note?: string): Record<string, unknown> {
  return {
    schema_version: "teacher-evidence-response-v1",
    observed_board_actions: [],
    generalized_teaching_capability: {
      name: "证据约束讲解",
      mechanism: "先观察再抽象",
      action_program: ["确认可见变化"],
    },
    evidence_claims: [],
    uncertainties: note ? [note] : [],
  };
}

async function fixture(): Promise<{ dataDir: string; store: FormalOracleRunStore; input: CreateSealedRunInput }> {
  const dataDir = await mkdtemp(join(tmpdir(), "formal-run-store-"));
  created.push(dataDir);
  return { dataDir, store: new FormalOracleRunStore(dataDir), input: sealedInput() };
}

async function senderScenario(
  runtime: SenderTestRuntime,
  expectedArm: OracleGateRunArm = "transcript_only",
  options: { attempt_ordinal?: number; schedule_index?: number; prepared_at?: string; started_at?: string } = {},
) {
  const { dataDir, store, input } = await fixture();
  let snapshot = await store.createSealedRun(input);
  const scheduleIndex = options.schedule_index ?? 1;
  const payload = requestPayload(scheduleIndex), prepared = preparedPayload(payload);
  const externalPreparedAt = options.prepared_at ?? time(1);
  let intent = requestIntent(input, payload, store, scheduleIndex, 1,
    options.attempt_ordinal === 2 ? time(1) : externalPreparedAt);
  if (options.attempt_ordinal === 2) {
    snapshot = await store.commitDispatchIntent({ run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, intent, request_envelope: payload,
      prepared_provider_request: prepared, created_at: time(2) });
    const noSend = await attemptAudit(intent, store, input.execution_plan.execution_plan_sha256, "not_sent", {
      started_at: time(3), finished_at: time(4),
    }, false);
    snapshot = await store.commitAttemptAudit({ run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, audit: noSend.audit, created_at: time(5) });
    snapshot = await store.markRetryReady({ run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, request_id: intent.request_id, created_at: time(6) });
    intent = requestIntent(input, payload, store, scheduleIndex, 2, time(7));
  }
  const keys = generateKeyPairSync("ed25519"), authorityStore = new FormalOracleTransportAuthorityStore(dataDir);
  const expected = { ledger_registry_sha256: input.run.ledger_registry_sha256, composition_sha256: "d".repeat(64),
    run_sha256: input.run.run_sha256, execution_plan_sha256: input.execution_plan.execution_plan_sha256, model: intent.model };
  const effectiveAt = Date.parse(options.started_at ?? time(options.attempt_ordinal === 2 ? 9 : 3));
  vi.useFakeTimers();
  vi.setSystemTime(new Date(effectiveAt));
  const registry = await authorityStore.freezeRegistry({ sequence: 1, issued_at: new Date(effectiveAt - 60_000).toISOString(),
    expires_at: new Date(effectiveAt + 3_600_000).toISOString(), created_by: "formal-owner", ...expected,
    endpoint_base_url: "https://api.example.com/v1", provider_id: "fixture-provider", account_key_id: "account-1",
    credential_key_id: "credential-1" }, { key_id: "transport-key", private_key: keys.privateKey });
  const credentialProvider: FormalOracleCredentialProvider = { withCredential: async (_binding, callback) => callback("runtime-secret-never-persist") };
  senderBoundary.runtime = runtime;
  try {
    return await withPinnedFormalOracleTransportAuthority({ transport_store: authorityStore, pinned_transport_registry_sha256: registry.registry_sha256,
    trusted_transport_public_keys: new Map([["transport-key", keys.publicKey]]), expected,
    callback: async (authority) => store.withSingleConsumeDispatchLease({ run_sha256: input.run.run_sha256,
      expected_head: snapshot.head_pin, expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, intent,
      request_envelope: payload, prepared_provider_request: prepared,
      created_at: options.attempt_ordinal === 2 ? time(8) : externalPreparedAt }, (lease) =>
      sendFormalOracleSingleConsumeRequestV1({ authority, dispatch_lease: lease, prepared, credential_provider: credentialProvider,
        expected_arm: expectedArm })) });
  } finally {
    senderBoundary.runtime = null;
    vi.useRealTimers();
  }
}

describe("FormalOracleRunStore", () => {
  it("seals strict spec, real structural schedule and separately anchored execution plan", async () => {
    const { dataDir, store, input } = await fixture();
    expect(input.run.schedule_sha256).toBe(sha(JSON.stringify(input.structural_schedule)));
    const snapshot = await store.createSealedRun(input);
    expect(snapshot).toMatchObject({
      run: { run_sha256: input.run.run_sha256, api_execution_allowed: false },
      head: { generation: 0, api_execution_allowed: false },
      head_pin: { schema_version: "formal-oracle-head-pin-v1", generation: 0 },
      formal_spec: { spec_sha256: input.formal_spec.spec_sha256 },
      execution_plan: { execution_plan_sha256: input.execution_plan.execution_plan_sha256 },
      api_execution_allowed: false,
    });
    await expect(store.createSealedRun(input)).rejects.toThrow("create-once");
    expect((await store.inspectRun(input.run.run_sha256, snapshot.head_pin)).checkpoints).toHaveLength(1);

    const rebooted = new FormalOracleRunStore(dataDir);
    expect((await rebooted.inspectRun(input.run.run_sha256, snapshot.head_pin)).head_pin).toEqual(snapshot.head_pin);
    const root = join(dataDir, RUN_STORE_URI);
    const runRoot = join(root, "runs", input.run.run_sha256);
    for (const directory of [root, join(root, "locks"), join(root, "runs"), runRoot, join(runRoot, "objects")]) {
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
    }
    for (const file of [
      join(runRoot, "HEAD"),
      join(runRoot, "objects", "run-contracts", input.run.run_sha256, "run.json"),
      join(runRoot, "objects", "formal-specs", input.formal_spec.spec_sha256, "formal-spec.json"),
      join(runRoot, "objects", "structural-schedules", input.run.schedule_sha256, "schedule.json"),
      join(runRoot, "objects", "execution-plans", input.run.execution_plan_sha256, "execution-plan.json"),
    ]) expect((await stat(file)).mode & 0o777).toBe(0o600);
  }, 20_000);

  it("requires external HEAD pins and detects rollback against the newest pin", async () => {
    const { dataDir, store, input } = await fixture();
    const sealed = await store.createSealedRun(input);
    const headPath = join(dataDir, RUN_STORE_URI, "runs", input.run.run_sha256, "HEAD");
    const oldHeadBytes = await readFile(headPath);
    const payload = requestPayload(1);
    const intent = requestIntent(input, payload, store);
    const committed = await store.commitDispatchIntent({
      run_sha256: input.run.run_sha256,
      expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
      intent,
      request_envelope: payload, prepared_provider_request: preparedPayload(payload),
      created_at: "2026-08-12T00:00:02.000Z",
    });
    const currentHeadBytes = await readFile(headPath);
    await expect(store.inspectRun(input.run.run_sha256, sealed.head_pin)).rejects.toThrow("HEAD pin");
    await expect(store.resumeRun(input.run.run_sha256, sealed.head_pin)).rejects.toThrow("HEAD pin");
    await expect(store.commitDispatchIntent({
      run_sha256: input.run.run_sha256,
      expected_head: committed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
      intent,
      request_envelope: payload, prepared_provider_request: preparedPayload(payload),
      created_at: "2026-08-12T00:00:03.000Z",
    })).rejects.toThrow("expected_head 与 expected_checkpoint");
    await expect(store.createSealedRun(input)).rejects.toThrow("create-once");

    // Same-UID rollback: newest external/WORM pin detects it. An old pin alone cannot;
    // callers must never allow their external monotonic pin to regress.
    await writeFile(headPath, oldHeadBytes, { mode: 0o600 });
    await expect(store.inspectRun(input.run.run_sha256, committed.head_pin)).rejects.toThrow(/HEAD pin|rollback/);
    expect((await store.inspectRun(input.run.run_sha256, sealed.head_pin)).api_execution_allowed).toBe(false);
    await writeFile(headPath, currentHeadBytes, { mode: 0o600 });
    expect((await store.resumeRun(input.run.run_sha256, committed.head_pin)).blocked_ambiguous).toBe(true);
  }, 20_000);

  it("rejects case, seed, model, prompt, visual and budget drift before durable dispatch", async () => {
    const { store, input } = await fixture();
    const sealed = await store.createSealedRun(input);
    const payload = requestPayload(1);
    const base = requestIntent(input, payload, store);
    const drifts: Array<(intent: RequestIntentV1) => void> = [
      (intent) => { intent.request_id = "FREQ-drift"; },
      (intent) => { intent.idempotency_key = "2".repeat(64); },
      (intent) => { intent.schedule_index = 2; },
      (intent) => { intent.case_id = "FCASE-drift"; },
      (intent) => { intent.seed = 23; },
      (intent) => { intent.model = "other-model"; },
      (intent) => { intent.system_prompt_sha256 = "2".repeat(64); },
      (intent) => { intent.user_prompt_sha256 = "2".repeat(64); },
      (intent) => { intent.output_schema_sha256 = "2".repeat(64); },
      (intent) => { intent.visuals[0].sha256 = "2".repeat(64); },
      (intent) => { intent.max_input_tokens += 1; },
      (intent) => { intent.max_output_tokens += 1; },
      (intent) => { intent.timeout_ms += 1; },
      (intent) => { intent.max_attempts += 1; },
      (intent) => { intent.transport = "http" as "pi"; },
      (intent) => { intent.temperature = 1 as 0; },
      (intent) => { intent.cache_retention = "local" as "none"; },
      (intent) => { intent.tools_policy = "allow" as "none"; },
    ];
    for (const mutate of drifts) {
      const intent = structuredClone(base);
      mutate(intent);
      intent.intent_sha256 = hashRequestIntent(intent);
      await expect(store.commitDispatchIntent({
        run_sha256: input.run.run_sha256,
        expected_head: sealed.head_pin,
        expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
        intent,
        request_envelope: payload, prepared_provider_request: preparedPayload(payload),
        created_at: "2026-08-12T00:00:02.000Z",
      })).rejects.toThrow(/execution plan|绑定当前 run|不在 sealed checkpoint|Request intent 无效/);
    }
    for (const mutate of [
      (intent: RequestIntentV1) => { intent.request_envelope_sha256 = "2".repeat(64); },
      (intent: RequestIntentV1) => { intent.provider_body_sha256 = "2".repeat(64); },
      (intent: RequestIntentV1) => { intent.provider_body_profile = "drift" as typeof intent.provider_body_profile; },
      (intent: RequestIntentV1) => { intent.provider_token_field = "max_tokens" as typeof intent.provider_token_field; },
    ]) {
      const intent = structuredClone(base);
      mutate(intent);
      intent.intent_sha256 = hashRequestIntent(intent);
      await expect(store.commitDispatchIntent({
        run_sha256: input.run.run_sha256, expected_head: sealed.head_pin,
        expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256, intent,
        request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(2),
      })).rejects.toThrow();
    }
    const wrongBody = preparedPayload(requestPayload(0));
    await expect(store.commitDispatchIntent({
      run_sha256: input.run.run_sha256, expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256, intent: base,
      request_envelope: payload, prepared_provider_request: wrongBody, created_at: time(2),
    })).rejects.toThrow(/provider body|绑定/);
    const mutatedBody = preparedPayload(payload);
    mutatedBody.body_bytes[0] ^= 1;
    await expect(store.commitDispatchIntent({
      run_sha256: input.run.run_sha256, expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256, intent: base,
      request_envelope: payload, prepared_provider_request: mutatedBody, created_at: time(2),
    })).rejects.toThrow();
    await expect(store.commitDispatchIntent({
      run_sha256: input.run.run_sha256,
      expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
      intent: base,
      request_envelope: {
        envelope: payload.envelope,
        bytes: Buffer.from("wrong bytes", "utf8"),
        payload_sha256: sha("wrong bytes"),
      } as FormalOraclePiRequestArtifact,
      prepared_provider_request: preparedPayload(payload),
      created_at: "2026-08-12T00:00:02.000Z",
    })).rejects.toThrow("伪造");
    const mutatedBrandedPayload = requestPayload(1);
    const preparedBeforeMutation = preparedPayload(mutatedBrandedPayload);
    mutatedBrandedPayload.bytes[0] ^= 1;
    await expect(store.commitDispatchIntent({
      run_sha256: input.run.run_sha256,
      expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
      intent: base,
      request_envelope: mutatedBrandedPayload, prepared_provider_request: preparedBeforeMutation,
      created_at: "2026-08-12T00:00:02.000Z",
    })).rejects.toThrow();
    const selfConsistentWrongPayload = requestPayload(0);
    await expect(store.commitDispatchIntent({
      run_sha256: input.run.run_sha256,
      expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
      intent: requestIntent(input, selfConsistentWrongPayload, store),
      request_envelope: selfConsistentWrongPayload, prepared_provider_request: preparedPayload(selfConsistentWrongPayload),
      created_at: "2026-08-12T00:00:02.000Z",
    })).rejects.toThrow(/execution plan|envelope/);
    for (const envelopeDrift of [
      requestPayload(1, { model: "other-model" }),
      requestPayload(1, { seed: 99 }),
      requestPayload(1, { max_output_tokens: input.formal_spec.budget.max_output_tokens + 1 }),
    ]) {
      await expect(store.commitDispatchIntent({
        run_sha256: input.run.run_sha256,
        expected_head: sealed.head_pin,
        expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
        intent: base,
        request_envelope: envelopeDrift, prepared_provider_request: preparedPayload(envelopeDrift),
        created_at: "2026-08-12T00:00:02.000Z",
      })).rejects.toThrow(/execution plan|envelope/);
    }
    const committed = await store.commitDispatchIntent({
      run_sha256: input.run.run_sha256,
      expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
      intent: base,
      request_envelope: payload, prepared_provider_request: preparedPayload(payload),
      created_at: "2026-08-12T00:00:02.000Z",
    });
    expect(committed.checkpoint.entries[1]).toMatchObject({ state: "DISPATCH_INTENT_COMMITTED", resume_action: "block_ambiguous" });
    await expect(store.commitDispatchIntent({
      run_sha256: input.run.run_sha256,
      expected_head: committed.head_pin,
      expected_checkpoint_sha256: committed.head_pin.checkpoint_sha256,
      intent: base,
      request_envelope: payload, prepared_provider_request: preparedPayload(payload),
      created_at: "2026-08-12T00:00:03.000Z",
    })).rejects.toThrow("不得自动 retry");
  });

  it("issues one callback-scoped lease only to the durable HEAD-CAS winner", async () => {
    const { store, input } = await fixture();
    const sealed = await store.createSealedRun(input);
    const payload = requestPayload(1);
    const intent = requestIntent(input, payload, store);
    const dispatch = {
      run_sha256: input.run.run_sha256,
      expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
      intent,
      request_envelope: payload,
      prepared_provider_request: preparedPayload(payload),
      created_at: time(2),
    };
    let escapedLease: FormalOracleSingleConsumeDispatchLease | null = null;
    let escapedReceipt: FormalOracleConsumedDispatchLease | null = null;
    const result = await store.withSingleConsumeDispatchLease(dispatch, async (lease, snapshot) => {
      escapedLease = lease;
      expect(snapshot.checkpoint.entries[1]).toMatchObject({
        state: "DISPATCH_INTENT_COMMITTED",
        resume_action: "block_ambiguous",
        active_intent_sha256: intent.intent_sha256,
      });
      expect(lease).toMatchObject({
        stage: "durable_dispatch_intent_single_consume_lease",
        run_sha256: input.run.run_sha256,
        execution_plan_sha256: input.execution_plan.execution_plan_sha256,
        request_id: intent.request_id,
        intent_sha256: intent.intent_sha256,
        attempt_ordinal: 1,
        request_envelope_sha256: intent.request_envelope_sha256,
        provider_body_sha256: intent.provider_body_sha256,
        dispatch_head: snapshot.head_pin,
        credential_present: false,
        provider_contact_authorized: false,
        api_execution_allowed: false,
      });
      expect(() => JSON.stringify(lease)).toThrow("不得序列化");
      const receipt = consumeFormalOracleSingleConsumeDispatchLease(lease);
      escapedReceipt = receipt;
      assertActiveFormalOracleConsumedDispatchLease(receipt);
      expect(() => consumeFormalOracleSingleConsumeDispatchLease(lease)).toThrow("已经消费");
      expect(() => JSON.stringify(receipt)).toThrow("不得序列化");
      expect(() => assertActiveFormalOracleConsumedDispatchLease(structuredClone({
        ...receipt,
      }) as FormalOracleConsumedDispatchLease)).toThrow("伪造");
      return "consumed";
    });
    expect(result).toBe("consumed");
    expect(() => consumeFormalOracleSingleConsumeDispatchLease(escapedLease!)).toThrow("已过期");
    expect(() => assertActiveFormalOracleConsumedDispatchLease(escapedReceipt!)).toThrow("已过期");
    await expect(store.withSingleConsumeDispatchLease(dispatch, async () => "duplicate"))
      .rejects.toThrow(/HEAD pin|durable dispatch|不得自动 retry/);
  });

  it("allows exactly one concurrent dispatch lease callback and fail-closes an unconsumed lease", async () => {
    const { store, input } = await fixture();
    const sealed = await store.createSealedRun(input);
    const payload = requestPayload(1);
    const intent = requestIntent(input, payload, store);
    const dispatch = {
      run_sha256: input.run.run_sha256,
      expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
      intent,
      request_envelope: payload,
      prepared_provider_request: preparedPayload(payload),
      created_at: time(2),
    };
    let callbackCount = 0;
    let winnerHead: { schema_version: "formal-oracle-head-pin-v1"; run_sha256: string; generation: number; checkpoint_sha256: string } | null = null;
    const attempts = await Promise.allSettled([
      store.withSingleConsumeDispatchLease(dispatch, async (_lease, snapshot) => {
        callbackCount += 1; winnerHead = { ...snapshot.head_pin }; return "winner-a";
      }),
      store.withSingleConsumeDispatchLease(dispatch, async (_lease, snapshot) => {
        callbackCount += 1; winnerHead = { ...snapshot.head_pin }; return "winner-b";
      }),
    ]);
    expect(callbackCount).toBe(1);
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((item) => item.status === "rejected")).toHaveLength(1);
    const head = attempts.find((item): item is PromiseFulfilledResult<string> => item.status === "fulfilled");
    expect(head?.value).toMatch(/^winner-/);
    // The winner did not burn the lease. Durable intent is nevertheless the
    // only published state and resume remains permanently ambiguous.
    expect(winnerHead).not.toBeNull();
    const resume = await store.resumeRun(input.run.run_sha256, winnerHead!);
    expect(resume.blocked_ambiguous).toBe(true);
    expect(resume.requests.find((item) => item.request_id === intent.request_id)).toMatchObject({
      state: "DISPATCH_INTENT_COMMITTED", resume_action: "block_ambiguous",
    });
    await expect(store.withSingleConsumeDispatchLease(dispatch, async () => "retry"))
      .rejects.toThrow(/HEAD pin|durable dispatch|不得自动 retry/);
  });

  it("rejects unanchored formal spec, structural schedule and execution plan bytes", async () => {
    const first = await fixture();
    first.input.formal_spec.model = "drifted-model";
    await expect(first.store.createSealedRun(first.input)).rejects.toThrow("Formal spec canonical hash");

    const second = await fixture();
    second.input.structural_schedule[0].request_id = "FREQ-drift";
    await expect(second.store.createSealedRun(second.input)).rejects.toThrow("schedule hash");

    const third = await fixture();
    third.input.execution_plan.items[0].user_prompt_sha256 = "2".repeat(64);
    third.input.execution_plan.execution_plan_sha256 = hashFormalOracleExecutionPlan(third.input.execution_plan);
    await expect(third.store.createSealedRun(third.input)).rejects.toThrow("run.execution_plan_sha256");

    const fourth = await fixture();
    const spec = formalSpec();
    const incomplete = sealedInputFrom(spec, structuralSchedule(spec).slice(0, 1));
    await expect(fourth.store.createSealedRun(incomplete)).rejects.toThrow("4 arms × formal spec 全部 seeds");

    const wrongSchema = await fixture();
    wrongSchema.input.formal_spec.prompt.output_schema_sha256 = "2".repeat(64);
    wrongSchema.input.formal_spec.spec_sha256 = sha(canonicalOracleGateFormalSpecPayload(wrongSchema.input.formal_spec));
    wrongSchema.input.execution_plan.items.forEach((item) => { item.output_schema_sha256 = "2".repeat(64); });
    wrongSchema.input.execution_plan.execution_plan_sha256 = hashFormalOracleExecutionPlan(wrongSchema.input.execution_plan);
    wrongSchema.input.run.formal_spec_sha256 = wrongSchema.input.formal_spec.spec_sha256;
    wrongSchema.input.run.execution_plan_sha256 = wrongSchema.input.execution_plan.execution_plan_sha256;
    wrongSchema.input.run.run_sha256 = hashFormalRunContract(wrongSchema.input.run);
    wrongSchema.input.initial_checkpoint = initialCheckpoint(wrongSchema.input.run, wrongSchema.input.execution_plan);
    await expect(wrongSchema.store.createSealedRun(wrongSchema.input)).rejects.toThrow(/response schema|shared deterministic renderer/);
  });

  it("composes authority, durable lease, callback secret, public DNS, exact Pi body, and complete SSE capture once", async () => {
    const { dataDir, store, input } = await fixture();
    const snapshot = await store.createSealedRun(input), payload = requestPayload(1);
    const intent = requestIntent(input, payload, store, 1, 1, time(1));
    const prepared = preparedPayload(payload);
    const keys = generateKeyPairSync("ed25519"), authorityStore = new FormalOracleTransportAuthorityStore(dataDir);
    const expected = { ledger_registry_sha256: input.run.ledger_registry_sha256, composition_sha256: "d".repeat(64),
      run_sha256: input.run.run_sha256, execution_plan_sha256: input.execution_plan.execution_plan_sha256, model: intent.model };
    vi.useFakeTimers();
    vi.setSystemTime(new Date(time(3)));
    const registry = await authorityStore.freezeRegistry({ sequence: 1, issued_at: new Date(Date.parse(time(3)) - 60_000).toISOString(), expires_at: new Date(Date.parse(time(3)) + 3_600_000).toISOString(),
      created_by: "formal-owner", ...expected, endpoint_base_url: "https://api.example.com/v1", provider_id: "fixture-provider",
      account_key_id: "account-1", credential_key_id: "credential-1" }, { key_id: "transport-key", private_key: keys.privateKey });
    const secret = "runtime-secret-never-persist";
    const credentialProvider: FormalOracleCredentialProvider = { withCredential: async (binding, callback) => {
      expect(binding.credential_key_id).toBe("credential-1"); return callback(secret);
    } };
    let networkCalls = 0;
    const runtime: SenderTestRuntime = {
      resolveAll: async (hostname) => { expect(hostname).toBe("api.example.com"); return [{ address: "8.8.8.8", family: 4 }]; },
      sendPinned: async (request) => {
        networkCalls += 1;
        expect(request).toMatchObject({ url: "https://api.example.com/v1/chat/completions", selected_address: "8.8.8.8", selected_family: 4 });
        expect(Buffer.from(request.body).equals(Buffer.from(prepared.body_bytes))).toBe(true);
        expect(request.headers.get("authorization")).toBe(`Bearer ${secret}`);
        const raw = buildFormalOraclePiResponseStreamFixtureV1({ response_id: "chatcmpl-real-sender", model: intent.model, created: 1,
          content_chunks: [JSON.stringify(oracleResponse())], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2,
            prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } } });
        return { status: 200, headers: [{ name: "content-type", value: "text/event-stream" }, { name: "x-request-id", value: "provider-http-1" }], body: raw, complete: true };
      },
    };
    senderBoundary.runtime = runtime;
    let result: Awaited<ReturnType<typeof sendFormalOracleSingleConsumeRequestV1>> | undefined;
    await withPinnedFormalOracleTransportAuthority({ transport_store: authorityStore, pinned_transport_registry_sha256: registry.registry_sha256,
      trusted_transport_public_keys: new Map([["transport-key", keys.publicKey]]), expected,
      callback: async (authority) => store.withSingleConsumeDispatchLease({ run_sha256: input.run.run_sha256,
        expected_head: snapshot.head_pin, expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, intent,
        request_envelope: payload, prepared_provider_request: prepared, created_at: time(2) }, async (lease) => {
          result = await sendFormalOracleSingleConsumeRequestV1({ authority, dispatch_lease: lease, prepared,
            credential_provider: credentialProvider, expected_arm: "transcript_only" });
          await expect(sendFormalOracleSingleConsumeRequestV1({ authority, dispatch_lease: lease, prepared,
            credential_provider: credentialProvider, expected_arm: "transcript_only" })).rejects.toThrow("已经消费");
        }) });
    senderBoundary.runtime = null;
    vi.useRealTimers();
    expect(result).toMatchObject({ request_started: true, provider_result_cross_check_status: "strict_complete_stop_cross_checked",
      response_artifact: { proof: { finish_reason: "stop" } }, invalid_response_artifact: null, error_code: null, api_execution_allowed: false });
    expect(result?.capture_artifact?.record).toMatchObject({ capture_status: "complete_fetch_entity", provider_http_request_id: "provider-http-1", selected_address: "8.8.8.8" });
    expect(networkCalls).toBe(1);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("rejects mixed private DNS before network and preserves partial/no-header requests as unknown captures", async () => {
    let calls = 0;
    const privateDns = await senderScenario({
      resolveAll: async () => [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }],
      sendPinned: async () => { calls += 1; throw new Error("must not send"); },
    });
    expect(privateDns).toMatchObject({ request_started: false, capture_artifact: null, error_code: "dns_resolution_failed_before_send" });
    expect(calls).toBe(0);

    const partial = await senderScenario({ resolveAll: async () => [{ address: "8.8.8.8", family: 4 }],
      sendPinned: async () => ({ status: 200, headers: [{ name: "content-type", value: "text/event-stream" }],
        body: new TextEncoder().encode("data: {\"partial\":"), complete: false }) });
    expect(partial).toMatchObject({ request_started: true, response_artifact: null, invalid_response_artifact: null,
      capture_artifact: { record: { capture_status: "partial_fetch_entity_unknown", captured_entity_byte_length: 17 } },
      error_code: "transport_response_incomplete_or_unknown" });

    const noHeaders = await senderScenario({ resolveAll: async () => [{ address: "8.8.8.8", family: 4 }],
      sendPinned: async () => { throw new Error("socket reset after write"); } });
    expect(noHeaders).toMatchObject({ request_started: true, response_artifact: null, invalid_response_artifact: null,
      capture_artifact: { record: { capture_status: "request_started_no_response_unknown", response_headers_received_at: null,
        captured_entity_object_uri: null } }, error_code: "transport_response_incomplete_or_unknown" });
  });

  it("preserves a complete entity with missing Content-Type as transport-metadata-invalid evidence", async () => {
    const raw = buildFormalOraclePiResponseStreamFixtureV1({
      response_id: "chatcmpl-missing-content-type", model: formalSpec().model, created: 1,
      content_chunks: [JSON.stringify(oracleResponse())],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2,
        prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } },
    });
    const result = await senderScenario({ resolveAll: async () => [{ address: "8.8.8.8", family: 4 }],
      sendPinned: async () => ({ status: 200, headers: [{ name: "x-request-id", value: "provider-http-missing-ct" }], body: raw, complete: true }),
    });
    expect(result).toMatchObject({ request_started: true, response_artifact: null,
      invalid_response_artifact: { record: { failure_stage: "transport_metadata_invalid",
        sse_derivation_record_sha256: null, assistant_content_bytes_sha256: null } },
      capture_artifact: { record: { capture_status: "complete_fetch_entity", response_content_type: null } },
      error_code: "transport_complete_entity_invalid", api_execution_allowed: false });
  });

  it("durably reloads missing-Content-Type and empty complete entities as failed-closed invalid receipts", async () => {
    const cases: Array<{ kind: "metadata" | "empty"; raw: Uint8Array }> = [
      { kind: "metadata", raw: buildFormalOraclePiResponseStreamFixtureV1({
        response_id: "chatcmpl-metadata-reload", model: formalSpec().model, created: 1,
        content_chunks: [JSON.stringify(oracleResponse())], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2,
          prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } },
      }) },
      { kind: "empty", raw: new Uint8Array() },
    ];
    for (const current of cases) {
      const { dataDir, store, input } = await fixture();
      let snapshot = await store.createSealedRun(input);
      const payload = requestPayload(1), intent = requestIntent(input, payload, store, 1, 1, time(1));
      snapshot = await store.commitDispatchIntent({ run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, intent, request_envelope: payload,
        prepared_provider_request: preparedPayload(payload), created_at: time(2) });
      const receipt = current.kind === "metadata"
        ? await metadataInvalidAttemptAudit(intent, store, current.raw, intent.arm)
        : await invalidAttemptAudit(intent, store, input.execution_plan.execution_plan_sha256, current.raw, intent.arm);
      expect(receipt.invalid_response_artifact.record.failure_stage).toBe(current.kind === "metadata"
        ? "transport_metadata_invalid" : "sse_protocol_invalid");
      snapshot = await store.commitAttemptAudit({ run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, audit: receipt.audit,
        invalid_response_artifact: receipt.invalid_response_artifact,
        transport_capture_artifact: receipt.transport_capture_artifact, created_at: time(5) });
      expect(snapshot.checkpoint.entries[1]).toMatchObject({ state: "FAILED_CLOSED", resume_action: "block_failed" });
      expect((await new FormalOracleRunStore(dataDir).inspectRun(input.run.run_sha256, snapshot.head_pin)).head_pin).toEqual(snapshot.head_pin);
    }
  }, 20_000);

  it("persists raw SSE, derived assistant bytes, and canonical response before structural validation", async () => {
    const { dataDir, store, input } = await fixture();
    let snapshot = await store.createSealedRun(input);
    const payload = requestPayload(1);
    const intent = requestIntent(input, payload, store, 1, 1, time(1));
    snapshot = await store.commitDispatchIntent({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      intent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(2),
    });
    const receipt = await attemptAudit(intent, store, input.execution_plan.execution_plan_sha256, "result_received", { started_at: time(3), finished_at: time(4) });
    snapshot = await store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: receipt.audit, response_artifact: receipt.response_artifact, transport_capture_artifact: receipt.transport_capture_artifact,
      parsed_response: receipt.parsed_response, created_at: time(5),
    });
    expect(snapshot.checkpoint.entries[1]).toMatchObject({ state: "RECEIPT_COMMITTED", attempts_used: 1 });
    const record = committedRequest(intent, receipt.audit, time(6));
    snapshot = await store.commitSchemaValidatedRequest({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      committed_request: record, created_at: time(7),
    });
    expect(snapshot.checkpoint.entries[1]).toMatchObject({
      state: "SCHEMA_VALIDATED_COMMITTED",
      committed_request_sha256: record.committed_request_sha256,
    });
    await expect(store.completeRun({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, created_at: time(8),
    })).rejects.toThrow("全部 requests");
    const rebooted = new FormalOracleRunStore(dataDir);
    expect((await rebooted.inspectRun(input.run.run_sha256, snapshot.head_pin)).checkpoint.entries[1].state).toBe("SCHEMA_VALIDATED_COMMITTED");
  });

  it("supports confirmed not_sent retry with a new ordinal and immutable same payload", async () => {
    const { dataDir, store, input } = await fixture();
    let snapshot = await store.createSealedRun(input);
    const payload = requestPayload(1);
    const firstIntent = requestIntent(input, payload, store, 1, 1, time(1));
    snapshot = await store.commitDispatchIntent({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      intent: firstIntent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(2),
    });
    const noSend = await attemptAudit(firstIntent, store, input.execution_plan.execution_plan_sha256, "not_sent", { started_at: time(3), finished_at: time(4) });
    snapshot = await store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: noSend.audit, created_at: time(5),
    });
    snapshot = await store.markRetryReady({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      request_id: firstIntent.request_id, created_at: time(6),
    });
    expect(snapshot.checkpoint.entries[1]).toMatchObject({ state: "RETRY_READY", attempts_used: 1 });
    const rebooted = new FormalOracleRunStore(dataDir);
    expect((await rebooted.resumeRun(input.run.run_sha256, snapshot.head_pin)).requests[1].resume_action).toBe("dispatch_new_attempt");
    const secondIntent = requestIntent(input, payload, store, 1, 2, time(7));
    snapshot = await store.commitDispatchIntent({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      intent: secondIntent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(8),
    });
    expect(snapshot.checkpoint.entries[1]).toMatchObject({
      state: "DISPATCH_INTENT_COMMITTED",
      attempts_used: 1,
      latest_attempt_audit_sha256: noSend.audit.attempt_sha256,
      active_intent_sha256: secondIntent.intent_sha256,
    });
    const success = await attemptAudit(secondIntent, store, input.execution_plan.execution_plan_sha256, "result_received", { started_at: time(9), finished_at: time(10) });
    snapshot = await store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: success.audit, response_artifact: success.response_artifact, transport_capture_artifact: success.transport_capture_artifact,
      parsed_response: success.parsed_response, created_at: time(11),
    });
    snapshot = await store.commitSchemaValidatedRequest({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      committed_request: committedRequest(secondIntent, success.audit, time(12)), created_at: time(13),
    });
    expect(snapshot.checkpoint.entries[1]).toMatchObject({ state: "SCHEMA_VALIDATED_COMMITTED", attempts_used: 2 });
  });

  it("accepts no_result_confirmed only as a safe retry receipt and blocks unknown immediately", async () => {
    const confirmed = await fixture();
    let safe = await confirmed.store.createSealedRun(confirmed.input);
    const safePayload = requestPayload(1);
    const safeIntent = requestIntent(confirmed.input, safePayload, confirmed.store, 1, 1, time(1));
    safe = await confirmed.store.commitDispatchIntent({
      run_sha256: confirmed.input.run.run_sha256, expected_head: safe.head_pin,
      expected_checkpoint_sha256: safe.head_pin.checkpoint_sha256,
      intent: safeIntent, request_envelope: safePayload, prepared_provider_request: preparedPayload(safePayload), created_at: time(2),
    });
    const noResult = await attemptAudit(safeIntent, confirmed.store, confirmed.input.execution_plan.execution_plan_sha256, "no_result_confirmed", { started_at: time(3), finished_at: time(4) });
    safe = await confirmed.store.commitAttemptAudit({
      run_sha256: confirmed.input.run.run_sha256, expected_head: safe.head_pin,
      expected_checkpoint_sha256: safe.head_pin.checkpoint_sha256,
      audit: noResult.audit, created_at: time(5),
    });
    safe = await confirmed.store.markRetryReady({
      run_sha256: confirmed.input.run.run_sha256, expected_head: safe.head_pin,
      expected_checkpoint_sha256: safe.head_pin.checkpoint_sha256,
      request_id: safeIntent.request_id, created_at: time(6),
    });
    expect(safe.checkpoint.entries[1].state).toBe("RETRY_READY");

    const ambiguous = await fixture();
    let blocked = await ambiguous.store.createSealedRun(ambiguous.input);
    const ambiguousPayload = requestPayload(1);
    const ambiguousIntent = requestIntent(ambiguous.input, ambiguousPayload, ambiguous.store, 1, 1, time(1));
    blocked = await ambiguous.store.commitDispatchIntent({
      run_sha256: ambiguous.input.run.run_sha256, expected_head: blocked.head_pin,
      expected_checkpoint_sha256: blocked.head_pin.checkpoint_sha256,
      intent: ambiguousIntent, request_envelope: ambiguousPayload, prepared_provider_request: preparedPayload(ambiguousPayload), created_at: time(2),
    });
    const unknown = await attemptAudit(ambiguousIntent, ambiguous.store, ambiguous.input.execution_plan.execution_plan_sha256, "unknown", { started_at: time(3), finished_at: time(4) });
    blocked = await ambiguous.store.commitAttemptAudit({
      run_sha256: ambiguous.input.run.run_sha256, expected_head: blocked.head_pin,
      expected_checkpoint_sha256: blocked.head_pin.checkpoint_sha256,
      audit: unknown.audit, created_at: time(5),
    });
    expect(blocked.checkpoint).toMatchObject({ run_state: "BLOCKED_AMBIGUOUS" });
    expect(blocked.checkpoint.entries[1]).toMatchObject({ state: "BLOCKED_AMBIGUOUS", attempts_used: 1 });
    expect((await ambiguous.store.resumeRun(ambiguous.input.run.run_sha256, blocked.head_pin)).blocked_ambiguous).toBe(true);
    await expect(ambiguous.store.markRetryReady({
      run_sha256: ambiguous.input.run.run_sha256, expected_head: blocked.head_pin,
      expected_checkpoint_sha256: blocked.head_pin.checkpoint_sha256,
      request_id: ambiguousIntent.request_id, created_at: time(6),
    })).rejects.toThrow("RECEIPT_COMMITTED");
  });

  it("persists partial fetch-observed bytes for unknown attempts and revalidates them after restart", async () => {
    const { dataDir, store, input } = await fixture();
    let snapshot = await store.createSealedRun(input);
    const payload = requestPayload(1);
    const intent = requestIntent(input, payload, store, 1, 1, time(1));
    snapshot = await store.commitDispatchIntent({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      intent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(2),
    });
    const partial = await partialUnknownAttemptAudit(intent, store, input.execution_plan.execution_plan_sha256);
    snapshot = await store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: partial.audit, transport_capture_artifact: partial.transport_capture_artifact, created_at: time(5),
    });
    expect(snapshot.checkpoint.entries[1]).toMatchObject({ state: "BLOCKED_AMBIGUOUS", attempts_used: 1 });
    expect((await new FormalOracleRunStore(dataDir).inspectRun(input.run.run_sha256, snapshot.head_pin)).head_pin).toEqual(snapshot.head_pin);
    await writeFile(join(dataDir, RUN_STORE_URI, String(partial.transport_capture_artifact.record.captured_entity_object_uri)), "tampered");
    await expect(new FormalOracleRunStore(dataDir).inspectRun(input.run.run_sha256, snapshot.head_pin)).rejects.toThrow(/capture|内容地址|entity/);
  });

  it("rejects non-stop complete SSE before receipt and fails closed on exhausted no-result attempts", async () => {
    for (const stopReason of ["length", "error"] as const) {
      const current = await fixture();
      let snapshot = await current.store.createSealedRun(current.input);
      const payload = requestPayload(1);
      const intent = requestIntent(current.input, payload, current.store, 1, 1, time(1));
      snapshot = await current.store.commitDispatchIntent({
        run_sha256: current.input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        intent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(2),
      });
      const receipt = await attemptAudit(intent, current.store, current.input.execution_plan.execution_plan_sha256, "result_received", {
        started_at: time(3), finished_at: time(4),
      });
      const invalidAudit = structuredClone(receipt.audit) as unknown as Record<string, unknown>;
      invalidAudit.stop_reason = stopReason;
      invalidAudit.attempt_sha256 = hashRequestAttemptAudit(invalidAudit as unknown as RequestAttemptAuditV3);
      await expect(current.store.commitAttemptAudit({
        run_sha256: current.input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        audit: invalidAudit as unknown as RequestAttemptAuditV3, response_artifact: receipt.response_artifact, transport_capture_artifact: receipt.transport_capture_artifact,
        parsed_response: receipt.parsed_response, created_at: time(5),
      })).rejects.toThrow("strict stop");
      expect((await current.store.inspectRun(current.input.run.run_sha256, snapshot.head_pin)).checkpoint.entries[1].state)
        .toBe("DISPATCH_INTENT_COMMITTED");
    }

    const exhausted = await fixture();
    let snapshot = await exhausted.store.createSealedRun(exhausted.input);
    const payload = requestPayload(1);
    const firstIntent = requestIntent(exhausted.input, payload, exhausted.store, 1, 1, time(1));
    snapshot = await exhausted.store.commitDispatchIntent({
      run_sha256: exhausted.input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      intent: firstIntent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(2),
    });
    const firstAudit = await attemptAudit(firstIntent, exhausted.store, exhausted.input.execution_plan.execution_plan_sha256, "not_sent", { started_at: time(3), finished_at: time(4) });
    snapshot = await exhausted.store.commitAttemptAudit({
      run_sha256: exhausted.input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, audit: firstAudit.audit, created_at: time(5),
    });
    snapshot = await exhausted.store.markRetryReady({
      run_sha256: exhausted.input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, request_id: firstIntent.request_id, created_at: time(6),
    });
    const secondIntent = requestIntent(exhausted.input, payload, exhausted.store, 1, 2, time(7));
    snapshot = await exhausted.store.commitDispatchIntent({
      run_sha256: exhausted.input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      intent: secondIntent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(8),
    });
    const finalAudit = await attemptAudit(secondIntent, exhausted.store, exhausted.input.execution_plan.execution_plan_sha256, "no_result_confirmed", { started_at: time(9), finished_at: time(10) });
    snapshot = await exhausted.store.commitAttemptAudit({
      run_sha256: exhausted.input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, audit: finalAudit.audit, created_at: time(11),
    });
    snapshot = await exhausted.store.failRunRequest({
      run_sha256: exhausted.input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, request_id: secondIntent.request_id, created_at: time(12),
    });
    expect(snapshot.checkpoint).toMatchObject({ run_state: "FAILED_CLOSED" });
    expect(snapshot.checkpoint.entries[1]).toMatchObject({ state: "FAILED_CLOSED", attempts_used: 2 });
  });

  it("persists a complete invalid response as an immediate non-retry terminal receipt", async () => {
    for (const raw of [
      new TextEncoder().encode("data: {}\n\n"),
      Uint8Array.from([0xff]),
      buildFormalOraclePiResponseStreamFixtureV1({
        response_id: "chatcmpl-invalid-json", model: "model-v1", created: 1,
        content_chunks: ['{"x":1,"x":2}'],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } },
      }),
      buildFormalOraclePiResponseStreamFixtureV1({
        response_id: "chatcmpl-invalid-schema", model: "model-v1", created: 1,
        content_chunks: ['{"schema_version":"nonsense"}'],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } },
      }),
    ]) {
      const { dataDir, store, input } = await fixture();
      let snapshot = await store.createSealedRun(input);
      const payload = requestPayload(1);
      const intent = requestIntent(input, payload, store, 1, 1, time(1));
      snapshot = await store.commitDispatchIntent({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        intent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(2),
      });
      const invalid = await invalidAttemptAudit(intent, store, input.execution_plan.execution_plan_sha256, raw, input.execution_plan.items[1].arm, time(3), time(4));
      snapshot = await store.commitAttemptAudit({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        audit: invalid.audit, invalid_response_artifact: invalid.invalid_response_artifact, transport_capture_artifact: invalid.transport_capture_artifact, created_at: time(5),
      });
      expect(snapshot.checkpoint).toMatchObject({ run_state: "FAILED_CLOSED", terminal_reason_sha256: expect.any(String) });
      expect(snapshot.checkpoint.entries[1]).toMatchObject({ state: "FAILED_CLOSED", resume_action: "block_failed", attempts_used: 1 });
      expect((await new FormalOracleRunStore(dataDir).inspectRun(input.run.run_sha256, snapshot.head_pin)).head_pin).toEqual(snapshot.head_pin);
      await expect(store.markRetryReady({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, request_id: intent.request_id, created_at: time(6),
      })).rejects.toThrow("RECEIPT_COMMITTED");
    }
  }, 20_000);

  it("rejects valid SSE as invalid and rejects forged/mixed invalid records before HEAD publication", async () => {
    const { store, input } = await fixture();
    let snapshot = await store.createSealedRun(input);
    const payload = requestPayload(1);
    const intent = requestIntent(input, payload, store, 1, 1, time(1));
    snapshot = await store.commitDispatchIntent({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      intent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(2),
    });
    const invalid = await invalidAttemptAudit(intent, store, input.execution_plan.execution_plan_sha256, new TextEncoder().encode("data: {}\n\n"), input.execution_plan.items[1].arm, time(3), time(4));
    const mixedAudit = structuredClone(invalid.audit);
    mixedAudit.invalid_response_record_sha256 = "f".repeat(64);
    mixedAudit.invalid_response_record_object_uri = store.invalidResponseRecordObjectUri(input.run.run_sha256, mixedAudit.invalid_response_record_sha256);
    mixedAudit.attempt_sha256 = hashRequestAttemptAudit(mixedAudit);
    await expect(store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: mixedAudit, invalid_response_artifact: invalid.invalid_response_artifact, transport_capture_artifact: invalid.transport_capture_artifact, created_at: time(5),
    })).rejects.toThrow("精确闭合");
    await expect(store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: invalid.audit, invalid_response_artifact: structuredClone(invalid.invalid_response_artifact),
      transport_capture_artifact: invalid.transport_capture_artifact, created_at: time(5),
    })).rejects.toThrow("伪造");
    for (const mutate of [
      (audit: RequestAttemptAuditV3) => { audit.fetch_observed_sse_object_uri = "objects/fetch-observed-sse/forged/response.sse"; },
      (audit: RequestAttemptAuditV3) => { audit.sse_derivation_object_uri = "objects/sse-derivations/forged/derivation.json"; },
      (audit: RequestAttemptAuditV3) => { audit.assistant_content_object_uri = "objects/assistant-content/forged/assistant-content.utf8"; },
    ]) {
      const forged = structuredClone(invalid.audit);
      mutate(forged);
      forged.attempt_sha256 = hashRequestAttemptAudit(forged);
      await expect(store.commitAttemptAudit({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        audit: forged, invalid_response_artifact: invalid.invalid_response_artifact, transport_capture_artifact: invalid.transport_capture_artifact, created_at: time(5),
      })).rejects.toThrow();
    }
    expect((await store.inspectRun(input.run.run_sha256, snapshot.head_pin)).head_pin).toEqual(snapshot.head_pin);
  });

  it("re-derives durable invalid A/B/C/record layers and rejects every substituted object", async () => {
    for (const layer of ["A", "B", "C", "record"] as const) {
      const { dataDir, store, input } = await fixture();
      let snapshot = await store.createSealedRun(input);
      const payload = requestPayload(1);
      const intent = requestIntent(input, payload, store, 1, 1, time(1));
      snapshot = await store.commitDispatchIntent({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        intent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(2),
      });
      const first = await invalidAttemptAudit(intent, store, input.execution_plan.execution_plan_sha256, buildFormalOraclePiResponseStreamFixtureV1({
        response_id: "chatcmpl-invalid-first", model: intent.model, created: 1,
        content_chunks: ['{"schema_version":"nonsense-one"}'],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } },
      }), input.execution_plan.items[1].arm, time(3), time(4));
      snapshot = await store.commitAttemptAudit({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        audit: first.audit, invalid_response_artifact: first.invalid_response_artifact, transport_capture_artifact: first.transport_capture_artifact, created_at: time(5),
      });
      const second = await invalidAttemptAudit(intent, store, input.execution_plan.execution_plan_sha256, buildFormalOraclePiResponseStreamFixtureV1({
        response_id: "chatcmpl-invalid-second", model: intent.model, created: 2,
        content_chunks: ['{"schema_version":"nonsense-two"}'],
        usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } },
      }), input.execution_plan.items[1].arm, time(3), time(4));
      const replacement = layer === "A" ? second.invalid_response_artifact.raw_sse_bytes
        : layer === "B" ? privateCanonicalJsonBytes(second.invalid_response_artifact.sse_derivation)
          : layer === "C" ? second.invalid_response_artifact.assistant_content_bytes!
            : privateCanonicalJsonBytes(second.invalid_response_artifact.record);
      const uri = layer === "A" ? first.audit.fetch_observed_sse_object_uri
        : layer === "B" ? first.audit.sse_derivation_object_uri
          : layer === "C" ? first.audit.assistant_content_object_uri
            : first.audit.invalid_response_record_object_uri;
      await writeFile(join(dataDir, RUN_STORE_URI, String(uri)), replacement);
      await expect(new FormalOracleRunStore(dataDir).inspectRun(input.run.run_sha256, snapshot.head_pin))
        .rejects.toThrow(/invalid response|Invalid response|内容地址|hash|重派生/);
    }
  }, 20_000);

  it("rejects forged raw SSE/assistant/canonical bytes, duplicate keys, invalid UTF-8, URI, usage, model, ordinal and time", async () => {
    const { store, input } = await fixture();
    let snapshot = await store.createSealedRun(input);
    const payload = requestPayload(1);
    const intent = requestIntent(input, payload, store, 1, 1, time(1));
    snapshot = await store.commitDispatchIntent({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      intent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(2),
    });
    const base = await attemptAudit(intent, store, input.execution_plan.execution_plan_sha256, "result_received", { started_at: time(3), finished_at: time(4) });
    await expect(store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: base.audit, response_artifact: structuredClone(base.response_artifact!),
      transport_capture_artifact: base.transport_capture_artifact, parsed_response: base.parsed_response, created_at: time(5),
    })).rejects.toThrow("伪造");
    const genericCapture = revalidateFormalOracleTransportCaptureArtifactV1(base.transport_capture_artifact!);
    await expect(store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: base.audit, response_artifact: base.response_artifact,
      transport_capture_artifact: genericCapture as unknown as FormalOracleAuthoritativeTransportCaptureArtifactV1,
      parsed_response: base.parsed_response, created_at: time(5),
    })).rejects.toThrow(/真实 sender|authoritative/);
    const oldV3Audit = { ...base.audit, schema_version: "oracle-gate-request-attempt-audit-v3" } as unknown as RequestAttemptAuditV3;
    oldV3Audit.attempt_sha256 = hashRequestAttemptAudit(oldV3Audit);
    await expect(store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: oldV3Audit, response_artifact: base.response_artifact,
      transport_capture_artifact: base.transport_capture_artifact,
      parsed_response: base.parsed_response, created_at: time(5),
    })).rejects.toThrow(/版本|Attempt audit/);
    await expect(store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: base.audit, response_artifact: base.response_artifact, transport_capture_artifact: base.transport_capture_artifact, parsed_response: { score: 999 }, created_at: time(5),
    })).rejects.toThrow("Canonical response");
    const mutators: Array<(audit: RequestAttemptAuditV3) => void> = [
      (audit) => { audit.fetch_observed_sse_object_uri = "objects/forged-response.bin"; },
      (audit) => { audit.sse_derivation_record_sha256 = "f".repeat(64); },
      (audit) => { audit.assistant_content_bytes_sha256 = "e".repeat(64); },
      (audit) => { audit.canonical_response_bytes_sha256 = "d".repeat(64); },
      (audit) => { audit.usage!.input_tokens = intent.max_input_tokens + 1; audit.usage!.total_tokens = audit.usage!.input_tokens + audit.usage!.output_tokens; },
      (audit) => { audit.model = "forged-model"; },
      (audit) => { audit.attempt_ordinal = 2; },
      (audit) => { audit.started_at = time(1); audit.latency_ms = Date.parse(audit.finished_at) - Date.parse(audit.started_at); },
      (audit) => { audit.finished_at = time(6); audit.latency_ms = Date.parse(audit.finished_at) - Date.parse(audit.started_at); },
    ];
    for (const mutate of mutators) {
      const audit = structuredClone(base.audit);
      mutate(audit);
      audit.attempt_sha256 = hashRequestAttemptAudit(audit);
      await expect(store.commitAttemptAudit({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        audit, response_artifact: base.response_artifact, transport_capture_artifact: base.transport_capture_artifact, parsed_response: base.parsed_response, created_at: time(5),
      })).rejects.toThrow();
    }
  });

  it("re-derives every durable A/B/C/D layer from raw SSE and rejects cross-layer substitution", async () => {
    for (const layer of ["A", "B", "C", "D"] as const) {
      const { dataDir, store, input } = await fixture();
      let snapshot = await store.createSealedRun(input);
      const payload = requestPayload(1);
      const intent = requestIntent(input, payload, store, 1, 1, time(1));
      snapshot = await store.commitDispatchIntent({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        intent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(2),
      });
      const accepted = await attemptAudit(intent, store, input.execution_plan.execution_plan_sha256, "result_received", {
        started_at: time(3), finished_at: time(4), parsed_response: oracleResponse("accepted"),
      });
      snapshot = await store.commitAttemptAudit({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        audit: accepted.audit, response_artifact: accepted.response_artifact, transport_capture_artifact: accepted.transport_capture_artifact,
        parsed_response: accepted.parsed_response, created_at: time(5),
      });
      const substituted = await attemptAudit(intent, store, input.execution_plan.execution_plan_sha256, "result_received", {
        started_at: time(3), finished_at: time(4), parsed_response: oracleResponse("substituted"),
      });
      const replacement = layer === "A" ? substituted.response_artifact!.raw_sse_bytes
        : layer === "B" ? privateCanonicalJsonBytes(substituted.response_artifact!.proof)
          : layer === "C" ? substituted.response_artifact!.assistant_content_bytes
            : canonicalOracleGateResponseBytes(substituted.parsed_response!);
      const uri = layer === "A" ? accepted.audit.fetch_observed_sse_object_uri
        : layer === "B" ? accepted.audit.sse_derivation_object_uri
          : layer === "C" ? accepted.audit.assistant_content_object_uri
            : accepted.audit.canonical_response_object_uri;
      await writeFile(join(dataDir, RUN_STORE_URI, String(uri)), replacement);
      await expect(new FormalOracleRunStore(dataDir).inspectRun(input.run.run_sha256, snapshot.head_pin))
        .rejects.toThrow(/A\/B\/C\/D|内容地址|hash|重派生/);
    }
  }, 20_000);

  it("validates durable parsed responses with the shared arm schema and frozen validator", async () => {
    async function prepareReceipt(response: Record<string, unknown>, scheduleIndex = 0) {
      const current = await fixture();
      let snapshot = await current.store.createSealedRun(current.input);
      const payload = requestPayload(scheduleIndex);
      const intent = requestIntent(current.input, payload, current.store, scheduleIndex, 1, time(1));
      snapshot = await current.store.commitDispatchIntent({
        run_sha256: current.input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        intent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(2),
      });
      const receipt = await attemptAudit(intent, current.store, current.input.execution_plan.execution_plan_sha256, "result_received", {
        started_at: time(3), finished_at: time(4), parsed_response: response,
      });
      snapshot = await current.store.commitAttemptAudit({
        run_sha256: current.input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        audit: receipt.audit, response_artifact: receipt.response_artifact, transport_capture_artifact: receipt.transport_capture_artifact,
        parsed_response: receipt.parsed_response, created_at: time(5),
      });
      return { ...current, snapshot, intent, audit: receipt.audit };
    }

    const invalidResponses = [
      { response: { ...oracleResponse(), nonsense: true }, message: "字段集合无效" },
      {
        response: { ...oracleResponse(), evidence_claims: [{ claim: "看到了图", evidence_slot: "visual-1" }] },
        message: "evidence_slot 无效",
      },
    ];
    for (const { response, message } of invalidResponses) {
      const current = await prepareReceipt(response);
      await expect(current.store.commitSchemaValidatedRequest({
        run_sha256: current.input.run.run_sha256, expected_head: current.snapshot.head_pin,
        expected_checkpoint_sha256: current.snapshot.head_pin.checkpoint_sha256,
        committed_request: committedRequest(current.intent, current.audit, time(6)), created_at: time(7),
      })).rejects.toThrow(message);
    }

    const semanticFailureSample = await prepareReceipt({
      schema_version: "teacher-evidence-response-v1",
      observed_board_actions: [{ sequence_index: 1, operation: "add", content: "小明拿到了满分", region: "学生区域" }],
      generalized_teaching_capability: { name: "Alice aced the test", mechanism: "学生题目全解对了", action_program: ["the class passed the exam"] },
      evidence_claims: [{ claim: "Alice passed the exam", evidence_slot: "transcript" }],
      uncertainties: ["小红通过了考试"],
    });
    const semanticRecord = committedRequest(semanticFailureSample.intent, semanticFailureSample.audit, time(6));
    await expect(semanticFailureSample.store.commitSchemaValidatedRequest({
      run_sha256: semanticFailureSample.input.run.run_sha256, expected_head: semanticFailureSample.snapshot.head_pin,
      expected_checkpoint_sha256: semanticFailureSample.snapshot.head_pin.checkpoint_sha256,
      committed_request: semanticRecord, created_at: time(7),
    })).resolves.toMatchObject({
      checkpoint: { entries: expect.arrayContaining([expect.objectContaining({ state: "SCHEMA_VALIDATED_COMMITTED" })]) },
    });
    expect(semanticRecord.semantic_review_status).toBe("pending_external_blind_review");

    const wrongValidator = await prepareReceipt(oracleResponse());
    const validatorDrift = committedRequest(wrongValidator.intent, wrongValidator.audit, time(6));
    validatorDrift.validator_version = "unfrozen-validator-v999";
    validatorDrift.committed_request_sha256 = hashCommittedRequest(validatorDrift);
    await expect(wrongValidator.store.commitSchemaValidatedRequest({
      run_sha256: wrongValidator.input.run.run_sha256, expected_head: wrongValidator.snapshot.head_pin,
      expected_checkpoint_sha256: wrongValidator.snapshot.head_pin.checkpoint_sha256,
      committed_request: validatorDrift, created_at: time(7),
    })).rejects.toThrow("frozen shared response schema/validator");

    for (const mutate of [
      (record: CommittedRequestV3): void => { record.canonical_response_object_uri = String(wrongValidator.audit.assistant_content_object_uri); },
      (record: CommittedRequestV3): void => { record.canonical_response_bytes_sha256 = "f".repeat(64); },
    ]) {
      const record = committedRequest(wrongValidator.intent, wrongValidator.audit, time(6));
      mutate(record);
      record.committed_request_sha256 = hashCommittedRequest(record);
      await expect(wrongValidator.store.commitSchemaValidatedRequest({
        run_sha256: wrongValidator.input.run.run_sha256, expected_head: wrongValidator.snapshot.head_pin,
        expected_checkpoint_sha256: wrongValidator.snapshot.head_pin.checkpoint_sha256,
        committed_request: record, created_at: time(7),
      })).rejects.toThrow("canonical response receipt");
    }
  }, 20_000);

  it("serializes cross-process competing attempt commits so exactly one HEAD CAS succeeds", async () => {
    const { dataDir, store, input } = await fixture();
    let snapshot = await store.createSealedRun(input);
    const payload = requestPayload(1);
    const intent = requestIntent(input, payload, store, 1, 1, time(1));
    snapshot = await store.commitDispatchIntent({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      intent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(2),
    });
    const audit = await attemptAudit(intent, store, input.execution_plan.execution_plan_sha256, "not_sent", { started_at: time(3), finished_at: time(4) });
    const common = {
      run_sha256: input.run.run_sha256,
      expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: audit.audit,
      created_at: time(5),
    };
    const moduleUrl = pathToFileURL(join(process.cwd(), "packages/store/src/formalOracleRunStore.ts")).href;
    const childScript = `
      import { FormalOracleRunStore } from ${JSON.stringify(moduleUrl)};
      const store = new FormalOracleRunStore(${JSON.stringify(dataDir)});
      process.stdout.write("READY\\n");
      await new Promise((resolve) => setTimeout(resolve, 20));
      try {
        await store.commitAttemptAudit(${JSON.stringify(common)});
        process.stdout.write("RESULT:fulfilled\\n");
      } catch {
        process.stdout.write("RESULT:rejected\\n");
      }
    `;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", childScript], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let childOutput = "";
    child.stdout.setEncoding("utf8");
    const exit = once(child, "exit") as Promise<[number]>;
    await new Promise<void>((resolveReady, rejectReady) => {
      const timeout = setTimeout(() => rejectReady(new Error("child run-store race timeout")), 2_000);
      child.stdout.on("data", (chunk: string) => {
        childOutput += chunk;
        if (childOutput.includes("READY\n")) { clearTimeout(timeout); resolveReady(); }
      });
      child.once("error", rejectReady);
    });
    const parentResult = await store.commitAttemptAudit(common).then(() => "fulfilled", () => "rejected");
    expect((await exit)[0]).toBe(0);
    const childResult = childOutput.includes("RESULT:fulfilled") ? "fulfilled" : "rejected";
    expect([parentResult, childResult].sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("does not adopt immutable intent/checkpoint orphans left before HEAD CAS", async () => {
    const { store, input } = await fixture();
    const sealed = await store.createSealedRun(input);
    const payload = requestPayload(1);
    const intent = requestIntent(input, payload, store, 1, 1, time(1));
    await store.privateFs.publishImmutableObject(
      `runs/${input.run.run_sha256}/objects/request-envelopes/${intent.request_envelope_sha256}`,
      "request-envelope.json",
      payload.bytes,
    );
    await store.privateFs.publishImmutableObject(
      `runs/${input.run.run_sha256}/objects/request-intents/${intent.intent_sha256}`,
      "intent.json",
      privateCanonicalJsonBytes(intent),
    );
    const entries = sealed.checkpoint.entries.map((entry, index) => index === 1 ? {
      ...entry,
      state: "DISPATCH_INTENT_COMMITTED" as const,
      resume_action: "block_ambiguous" as const,
      active_intent_sha256: intent.intent_sha256,
    } : { ...entry });
    const orphan: RunCheckpointV1 = {
      schema_version: "oracle-gate-run-checkpoint-v1",
      checkpoint_sha256: "0".repeat(64),
      run_sha256: input.run.run_sha256,
      schedule_sha256: input.run.schedule_sha256,
      generation: 1,
      previous_checkpoint_sha256: sealed.checkpoint.checkpoint_sha256,
      created_at: time(2),
      run_state: "RUNNING",
      terminal_reason_sha256: null,
      request_count: input.run.request_count,
      counts: {
        pending: 11, retry_ready: 0, dispatch_intent_committed: 1, receipt_committed: 0,
        schema_validated_committed: 0, blocked_ambiguous: 0, failed_closed: 0,
      },
      entries,
    };
    orphan.checkpoint_sha256 = hashRunCheckpoint(orphan);
    await store.privateFs.publishImmutableObject(
      `runs/${input.run.run_sha256}/objects/checkpoints/${orphan.checkpoint_sha256}`,
      "checkpoint.json",
      privateCanonicalJsonBytes(orphan),
    );
    const inspected = await store.inspectRun(input.run.run_sha256, sealed.head_pin);
    expect(inspected.head.generation).toBe(0);
    expect(inspected.checkpoints).toHaveLength(1);
    expect(inspected.checkpoints.map((item) => item.checkpoint_sha256)).not.toContain(orphan.checkpoint_sha256);
  });

  it("reaches EXECUTION_COMPLETE only after all 12 requests are durably transport/schema validated", async () => {
    const { store, input } = await fixture();
    let snapshot = await store.createSealedRun(input);
    let second = 1;
    for (let index = 0; index < input.run.request_count; index += 1) {
      const payload = requestPayload(index);
      const intent = requestIntent(input, payload, store, index, 1, time(second));
      snapshot = await store.commitDispatchIntent({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        intent, request_envelope: payload, prepared_provider_request: preparedPayload(payload), created_at: time(second + 1),
      });
      const receipt = await attemptAudit(intent, store, input.execution_plan.execution_plan_sha256, "result_received", {
        started_at: time(second + 2), finished_at: time(second + 3),
        parsed_response: oracleResponse(`fixture-${index}`),
      });
      snapshot = await store.commitAttemptAudit({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        audit: receipt.audit, response_artifact: receipt.response_artifact, transport_capture_artifact: receipt.transport_capture_artifact,
        parsed_response: receipt.parsed_response, created_at: time(second + 4),
      });
      snapshot = await store.commitSchemaValidatedRequest({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        committed_request: committedRequest(intent, receipt.audit, time(second + 5)), created_at: time(second + 6),
      });
      second += 7;
    }
    expect(snapshot.checkpoint.entries.every((entry) => entry.state === "SCHEMA_VALIDATED_COMMITTED")).toBe(true);
    snapshot = await store.completeRun({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, created_at: time(second),
    });
    expect(snapshot.checkpoint).toMatchObject({ run_state: "EXECUTION_COMPLETE", terminal_reason_sha256: null });
    expect(snapshot.api_execution_allowed).toBe(false);
    const terminalPin = snapshot.head_pin;
    const terminalHistoryLength = snapshot.checkpoints.length;
    await expect(store.completeRun({
      run_sha256: input.run.run_sha256, expected_head: terminalPin,
      expected_checkpoint_sha256: terminalPin.checkpoint_sha256, created_at: time(second + 1),
    })).rejects.toThrow("create-once 终态");
    snapshot = await store.inspectRun(input.run.run_sha256, terminalPin);
    expect(snapshot.head_pin).toEqual(terminalPin);
    expect(snapshot.checkpoints).toHaveLength(terminalHistoryLength);

    let borrowed: Parameters<typeof assertActiveFormalOracleCompletedRunCapability>[0] | null = null;
    await store.withPinnedCompletedRun({ run_sha256: input.run.run_sha256, expected_head: terminalPin, callback: async (capability) => {
      assertActiveFormalOracleCompletedRunCapability(capability); borrowed = capability;
      expect(capability.completed_run.intents).toHaveLength(12);
      expect(capability.completed_run.attempts).toHaveLength(12);
      expect(capability.completed_run.committed_requests).toHaveLength(12);
      expect(capability.completed_run.canonical_responses.map((item) => item.schedule_index)).toEqual([...Array(12).keys()]);
      expect(Object.isFrozen(capability.completed_run.canonical_responses[0].response)).toBe(true);
    }});
    expect(() => assertActiveFormalOracleCompletedRunCapability(borrowed!)).toThrow(/无效|过期/);
    const stalePin = { ...terminalPin, generation: terminalPin.generation - 1 };
    await expect(store.withPinnedCompletedRun({ run_sha256: input.run.run_sha256, expected_head: stalePin, callback: async () => undefined })).rejects.toThrow(/pin|HEAD|generation/i);
  }, 60_000);

  it("fails closed on symlinks, hardlinks, and widened private directories", async () => {
    const first = await fixture();
    const sealed = await first.store.createSealedRun(first.input);
    const runRoot = join(first.dataDir, RUN_STORE_URI, "runs", first.input.run.run_sha256);
    const headPath = join(runRoot, "HEAD");
    const external = join(first.dataDir, "external-head");
    await writeFile(external, "{}\n", { mode: 0o600 });
    await unlink(headPath);
    await symlink(external, headPath);
    await expect(first.store.inspectRun(first.input.run.run_sha256, sealed.head_pin)).rejects.toThrow();

    const second = await fixture();
    const secondSealed = await second.store.createSealedRun(second.input);
    await chmod(join(second.dataDir, RUN_STORE_URI, "runs"), 0o755);
    await expect(second.store.inspectRun(second.input.run.run_sha256, secondSealed.head_pin)).rejects.toThrow("0700");

    const third = await fixture();
    const thirdSealed = await third.store.createSealedRun(third.input);
    const runFile = join(third.dataDir, RUN_STORE_URI, "runs", third.input.run.run_sha256, "objects", "run-contracts", third.input.run.run_sha256, "run.json");
    await link(runFile, join(third.dataDir, "run-hardlink.json"));
    await expect(third.store.inspectRun(third.input.run.run_sha256, thirdSealed.head_pin)).rejects.toThrow("单链接");
  });

  it("uses a cross-process owner-nonce lock and never steals an occupied lock", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "formal-run-lock-"));
    created.push(dataDir);
    const moduleUrl = pathToFileURL(join(process.cwd(), "packages/store/src/privateContentAddressedFs.ts")).href;
    const childScript = `
      import { PrivateContentAddressedFs } from ${JSON.stringify(moduleUrl)};
      const store = new PrivateContentAddressedFs(${JSON.stringify(dataDir)}, "private-lock-test", { lock_timeout_ms: 2000, lock_poll_ms: 5 });
      await store.withExclusiveLock("locks/run.lock", "run:child", async () => {
        process.stdout.write("LOCKED\\n");
        await new Promise((resolve) => setTimeout(resolve, 350));
      });
    `;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", childScript], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    const exit = once(child, "exit") as Promise<[number]>;
    await new Promise<void>((resolveReady, rejectReady) => {
      const timeout = setTimeout(() => rejectReady(new Error("child lock timeout")), 2_000);
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
        if (output.includes("LOCKED\n")) { clearTimeout(timeout); resolveReady(); }
      });
      child.once("error", rejectReady);
    });
    const contender = new PrivateContentAddressedFs(dataDir, "private-lock-test", { lock_timeout_ms: 40, lock_poll_ms: 5 });
    await expect(contender.withExclusiveLock("locks/run.lock", "run:parent", async () => undefined)).rejects.toThrow("拒绝偷取");
    expect(await readFile(join(dataDir, "private-lock-test", "locks", "run.lock"), "utf8")).toContain("run:child");
    expect((await exit)[0]).toBe(0);
  });
});
