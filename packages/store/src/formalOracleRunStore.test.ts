import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, link, mkdtemp, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { OracleGateFormalSpec } from "../../contracts/src/oracle-gate-formal.js";
import { canonicalOracleGateFormalSpecPayload } from "../../contracts/src/oracle-gate-formal.js";
import {
  ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  ORACLE_GATE_RESPONSE_VALIDATOR_VERSION,
} from "../../contracts/src/oracle-gate-response.js";
import {
  buildFormalOraclePiRequestEnvelope,
  type FormalOraclePiRequestArtifact,
} from "../../contracts/src/oracle-gate-request.js";
import type {
  CommittedRequestV1,
  FormalRunContractV1,
  OracleGateAttemptOutcome,
  RequestAttemptAuditV1,
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
  FormalOracleRunStore,
  hashFormalOracleExecutionPlan,
  hashFormalOracleStructuralSchedule,
  type CreateSealedRunInput,
  type FormalOracleExecutionPlanV1,
  type FormalOracleStructuralScheduleV1,
} from "./formalOracleRunStore.js";
import { privateCanonicalJsonBytes, PrivateContentAddressedFs } from "./privateContentAddressedFs.js";

const RUN_STORE_URI = "board2skill/formal-oracle/run-store";
const created: string[] = [];
const SYSTEM_PROMPT_BYTES = Buffer.from("frozen formal system prompt\n", "utf8");
const USER_TEMPLATE_BYTES = Buffer.from("frozen formal user template {{case}}\n", "utf8");

afterEach(async () => {
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
      version: "formal-prompt-v1",
      system_sha256: sha(SYSTEM_PROMPT_BYTES),
      user_template_sha256: sha(USER_TEMPLATE_BYTES),
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
  return Buffer.from(`rendered-user-prompt-${index}`, "utf8");
}

function visualBytes(arm: string, seed: number): Buffer {
  return Buffer.from(`canonical-visual-${arm}-${seed}`, "utf8");
}

function requestPayload(index: number, drift: { model?: string; seed?: number; max_output_tokens?: number } = {}): FormalOraclePiRequestArtifact {
  const spec = formalSpec();
  const scheduled = structuralSchedule(spec)[index];
  const rendered = renderedUserPrompt(index);
  const visual = scheduled.arm === "transcript_only" ? undefined : visualBytes(scheduled.arm, scheduled.seed);
  return buildFormalOraclePiRequestEnvelope({
    request_id: scheduled.request_id, schedule_index: index, case_id: scheduled.case_id, arm: scheduled.arm,
    model: drift.model ?? spec.model, system_prompt_bytes: SYSTEM_PROMPT_BYTES, expected_system_prompt_sha256: spec.prompt.system_sha256,
    rendered_user_prompt_bytes: rendered, expected_rendered_user_prompt_sha256: sha(rendered),
    user_template_bytes: USER_TEMPLATE_BYTES, expected_user_template_sha256: spec.prompt.user_template_sha256,
    output_schema_sha256: spec.prompt.output_schema_sha256,
    visuals: visual ? [{ label: "visual-1", mime_type: "image/jpeg", bytes: visual, expected_sha256: sha(visual), expected_byte_length: visual.byteLength }] : [],
    seed: drift.seed ?? scheduled.seed, temperature: spec.temperature, max_input_tokens: spec.budget.max_input_tokens,
    max_output_tokens: drift.max_output_tokens ?? spec.budget.max_output_tokens, timeout_ms: spec.budget.timeout_ms,
    max_attempts: spec.budget.max_attempts, transport: spec.transport, cache_retention: spec.cache_retention,
    tools_policy: spec.tools_policy,
  });
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
    schema_version: "formal-oracle-execution-plan-v1",
    execution_plan_sha256: "0".repeat(64),
    items: schedule.map((item, index) => ({
      request_id: item.request_id,
      idempotency_key: item.idempotency_key,
      schedule_index: index,
      case_id: item.case_id,
      arm: item.arm,
      seed: item.seed,
      model: spec.model,
      request_payload_sha256: requestPayload(index).payload_sha256,
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
  const request: RequestIntentV1 = {
    schema_version: "oracle-gate-request-intent-v1",
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
    request_payload_sha256: payload.payload_sha256,
    request_object_uri: store.requestObjectUri(input.run.run_sha256, payload.payload_sha256),
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

function attemptAudit(
  intent: RequestIntentV1,
  store: FormalOracleRunStore,
  outcome: OracleGateAttemptOutcome,
  options: {
    started_at?: string;
    finished_at?: string;
    stop_reason?: "stop" | "length" | "error";
    response_bytes?: Buffer;
    parsed_response?: Record<string, unknown>;
  } = {},
): { audit: RequestAttemptAuditV1; response_bytes?: Buffer; parsed_response?: Record<string, unknown> } {
  const startedAt = options.started_at ?? "2026-08-12T00:00:03.000Z";
  const finishedAt = options.finished_at ?? "2026-08-12T00:00:04.000Z";
  const parsedResponse = outcome === "result_received" ? (options.parsed_response ?? oracleResponse()) : undefined;
  const responseBytes = outcome === "result_received"
    ? (options.response_bytes ?? Buffer.from(JSON.stringify(parsedResponse), "utf8"))
    : undefined;
  const result = outcome === "result_received";
  const audit: RequestAttemptAuditV1 = {
    schema_version: "oracle-gate-request-attempt-audit-v1",
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
    provider_request_id: outcome === "not_sent" ? null : `provider-${intent.attempt_ordinal}`,
    request_sha256: intent.request_payload_sha256,
    request_object_uri: intent.request_object_uri,
    response_object_uri: result ? store.responseObjectUri(intent.run_sha256, sha(responseBytes!)) : null,
    response_bytes_sha256: result ? sha(responseBytes!) : null,
    parsed_response_object_uri: result ? store.parsedResponseObjectUri(intent.run_sha256, hashPublicBlindResponse(parsedResponse!)) : null,
    parsed_response_sha256: result ? hashPublicBlindResponse(parsedResponse!) : null,
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
    stop_reason: result ? (options.stop_reason ?? "stop") : null,
    error_code: result ? null : `${outcome}_fixture`,
    error_message: result ? null : `${outcome} was recorded by fixture`,
    usage: result ? { input_tokens: 100, output_tokens: 20, total_tokens: 120, cache_read_tokens: 0, cache_write_tokens: 0 } : null,
    pricing_table_sha256: result ? "4".repeat(64) : null,
    cost_microunits: result ? 123 : null,
    automatic_retry_allowed: (outcome === "not_sent" || outcome === "no_result_confirmed")
      && intent.attempt_ordinal < intent.max_attempts,
  };
  audit.attempt_sha256 = hashRequestAttemptAudit(audit);
  return { audit, response_bytes: responseBytes, parsed_response: parsedResponse };
}

function committedRequest(intent: RequestIntentV1, audit: RequestAttemptAuditV1, schemaValidatedAt: string): CommittedRequestV1 {
  const committed: CommittedRequestV1 = {
    schema_version: "oracle-gate-committed-request-v1",
    committed_request_sha256: "0".repeat(64),
    run_sha256: intent.run_sha256,
    request_id: intent.request_id,
    idempotency_key: intent.idempotency_key,
    intent_sha256: intent.intent_sha256,
    attempt_sha256: audit.attempt_sha256,
    attempt_ordinal: audit.attempt_ordinal,
    response_object_uri: String(audit.parsed_response_object_uri),
    response_sha256: String(audit.parsed_response_sha256),
    validator_version: ORACLE_GATE_RESPONSE_VALIDATOR_VERSION,
    transport_and_schema_verified_at: schemaValidatedAt,
    transport_and_schema_verified: true,
    semantic_review_status: "pending_external_blind_review",
    provider_stop_confirmed: true,
  };
  committed.committed_request_sha256 = hashCommittedRequest(committed);
  return committed;
}

function oracleResponse(note?: string): Record<string, unknown> {
  return {
    schema_version: "oracle-gate-response-v1",
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
  });

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
      request_payload: payload,
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
      request_payload: payload,
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
  });

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
        request_payload: payload,
        created_at: "2026-08-12T00:00:02.000Z",
      })).rejects.toThrow(/execution plan|绑定当前 run|不在 sealed checkpoint|Request intent 无效/);
    }
    await expect(store.commitDispatchIntent({
      run_sha256: input.run.run_sha256,
      expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
      intent: base,
      request_payload: {
        envelope: payload.envelope,
        bytes: Buffer.from("wrong bytes", "utf8"),
        payload_sha256: sha("wrong bytes"),
      } as FormalOraclePiRequestArtifact,
      created_at: "2026-08-12T00:00:02.000Z",
    })).rejects.toThrow("伪造");
    const mutatedBrandedPayload = requestPayload(1);
    mutatedBrandedPayload.bytes[0] ^= 1;
    await expect(store.commitDispatchIntent({
      run_sha256: input.run.run_sha256,
      expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
      intent: base,
      request_payload: mutatedBrandedPayload,
      created_at: "2026-08-12T00:00:02.000Z",
    })).rejects.toThrow();
    const selfConsistentWrongPayload = requestPayload(0);
    await expect(store.commitDispatchIntent({
      run_sha256: input.run.run_sha256,
      expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
      intent: requestIntent(input, selfConsistentWrongPayload, store),
      request_payload: selfConsistentWrongPayload,
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
        request_payload: envelopeDrift,
        created_at: "2026-08-12T00:00:02.000Z",
      })).rejects.toThrow(/execution plan|envelope/);
    }
    const committed = await store.commitDispatchIntent({
      run_sha256: input.run.run_sha256,
      expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
      intent: base,
      request_payload: payload,
      created_at: "2026-08-12T00:00:02.000Z",
    });
    expect(committed.checkpoint.entries[1]).toMatchObject({ state: "DISPATCH_INTENT_COMMITTED", resume_action: "block_ambiguous" });
    await expect(store.commitDispatchIntent({
      run_sha256: input.run.run_sha256,
      expected_head: committed.head_pin,
      expected_checkpoint_sha256: committed.head_pin.checkpoint_sha256,
      intent: base,
      request_payload: payload,
      created_at: "2026-08-12T00:00:03.000Z",
    })).rejects.toThrow("不得自动 retry");
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
    await expect(wrongSchema.store.createSealedRun(wrongSchema.input)).rejects.toThrow("共享 Oracle Gate response schema");
  });

  it("persists raw and parsed response objects before structurally validating a successful request", async () => {
    const { dataDir, store, input } = await fixture();
    let snapshot = await store.createSealedRun(input);
    const payload = requestPayload(1);
    const intent = requestIntent(input, payload, store, 1, 1, time(1));
    snapshot = await store.commitDispatchIntent({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      intent, request_payload: payload, created_at: time(2),
    });
    const receipt = attemptAudit(intent, store, "result_received", { started_at: time(3), finished_at: time(4) });
    snapshot = await store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: receipt.audit, response_bytes: receipt.response_bytes,
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
      intent: firstIntent, request_payload: payload, created_at: time(2),
    });
    const noSend = attemptAudit(firstIntent, store, "not_sent", { started_at: time(3), finished_at: time(4) });
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
      intent: secondIntent, request_payload: payload, created_at: time(8),
    });
    expect(snapshot.checkpoint.entries[1]).toMatchObject({
      state: "DISPATCH_INTENT_COMMITTED",
      attempts_used: 1,
      latest_attempt_audit_sha256: noSend.audit.attempt_sha256,
      active_intent_sha256: secondIntent.intent_sha256,
    });
    const success = attemptAudit(secondIntent, store, "result_received", { started_at: time(9), finished_at: time(10) });
    snapshot = await store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: success.audit, response_bytes: success.response_bytes,
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
      intent: safeIntent, request_payload: safePayload, created_at: time(2),
    });
    const noResult = attemptAudit(safeIntent, confirmed.store, "no_result_confirmed", { started_at: time(3), finished_at: time(4) });
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
      intent: ambiguousIntent, request_payload: ambiguousPayload, created_at: time(2),
    });
    const unknown = attemptAudit(ambiguousIntent, ambiguous.store, "unknown", { started_at: time(3), finished_at: time(4) });
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

  it("fails closed on length/error and on exhausted no-result attempts", async () => {
    for (const stopReason of ["length", "error"] as const) {
      const current = await fixture();
      let snapshot = await current.store.createSealedRun(current.input);
      const payload = requestPayload(1);
      const intent = requestIntent(current.input, payload, current.store, 1, 1, time(1));
      snapshot = await current.store.commitDispatchIntent({
        run_sha256: current.input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        intent, request_payload: payload, created_at: time(2),
      });
      const receipt = attemptAudit(intent, current.store, "result_received", {
        started_at: time(3), finished_at: time(4), stop_reason: stopReason,
      });
      snapshot = await current.store.commitAttemptAudit({
        run_sha256: current.input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        audit: receipt.audit, response_bytes: receipt.response_bytes,
        parsed_response: receipt.parsed_response, created_at: time(5),
      });
      await expect(current.store.commitSchemaValidatedRequest({
        run_sha256: current.input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        committed_request: committedRequest(intent, receipt.audit, time(6)), created_at: time(7),
      })).rejects.toThrow("只有 stop");
      snapshot = await current.store.failRunRequest({
        run_sha256: current.input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        request_id: intent.request_id, created_at: time(7),
      });
      expect(snapshot.checkpoint).toMatchObject({ run_state: "FAILED_CLOSED" });
      expect(snapshot.checkpoint.entries[1].state).toBe("FAILED_CLOSED");
    }

    const exhausted = await fixture();
    let snapshot = await exhausted.store.createSealedRun(exhausted.input);
    const payload = requestPayload(1);
    const firstIntent = requestIntent(exhausted.input, payload, exhausted.store, 1, 1, time(1));
    snapshot = await exhausted.store.commitDispatchIntent({
      run_sha256: exhausted.input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      intent: firstIntent, request_payload: payload, created_at: time(2),
    });
    const firstAudit = attemptAudit(firstIntent, exhausted.store, "not_sent", { started_at: time(3), finished_at: time(4) });
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
      intent: secondIntent, request_payload: payload, created_at: time(8),
    });
    const finalAudit = attemptAudit(secondIntent, exhausted.store, "no_result_confirmed", { started_at: time(9), finished_at: time(10) });
    snapshot = await exhausted.store.commitAttemptAudit({
      run_sha256: exhausted.input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, audit: finalAudit.audit, created_at: time(11),
    });
    snapshot = await exhausted.store.markRetryReady({
      run_sha256: exhausted.input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256, request_id: secondIntent.request_id, created_at: time(12),
    });
    expect(snapshot.checkpoint).toMatchObject({ run_state: "FAILED_CLOSED" });
    expect(snapshot.checkpoint.entries[1]).toMatchObject({ state: "FAILED_CLOSED", attempts_used: 2 });
  });

  it("rejects forged raw/parsed bytes, duplicate keys, invalid UTF-8, URI, usage, model, ordinal and time", async () => {
    const { store, input } = await fixture();
    let snapshot = await store.createSealedRun(input);
    const payload = requestPayload(1);
    const intent = requestIntent(input, payload, store, 1, 1, time(1));
    snapshot = await store.commitDispatchIntent({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      intent, request_payload: payload, created_at: time(2),
    });
    const base = attemptAudit(intent, store, "result_received", { started_at: time(3), finished_at: time(4) });
    await expect(store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: base.audit, response_bytes: Buffer.from("wrong raw"), parsed_response: base.parsed_response, created_at: time(5),
    })).rejects.toThrow("Raw response");
    await expect(store.commitAttemptAudit({
      run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
      expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
      audit: base.audit, response_bytes: base.response_bytes, parsed_response: { score: 999 }, created_at: time(5),
    })).rejects.toThrow("Parsed response");
    for (const [raw, message] of [
      [Buffer.from('{"x":1,"x":2}', "utf8"), "duplicate key"],
      [Buffer.from('{"x":{"y":1,"y":2}}', "utf8"), "duplicate key"],
      [Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d]), "有效 UTF-8"],
    ] as const) {
      const malformed = attemptAudit(intent, store, "result_received", {
        started_at: time(3), finished_at: time(4), response_bytes: raw, parsed_response: oracleResponse(),
      });
      await expect(store.commitAttemptAudit({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        audit: malformed.audit, response_bytes: malformed.response_bytes,
        parsed_response: malformed.parsed_response, created_at: time(5),
      })).rejects.toThrow(message);
    }
    const mutators: Array<(audit: RequestAttemptAuditV1) => void> = [
      (audit) => { audit.response_object_uri = "objects/forged-response.bin"; },
      (audit) => { audit.parsed_response_object_uri = "objects/forged-parsed-response.json"; },
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
        audit, response_bytes: base.response_bytes, parsed_response: base.parsed_response, created_at: time(5),
      })).rejects.toThrow();
    }
  });

  it("validates durable parsed responses with the shared arm schema and frozen validator", async () => {
    async function prepareReceipt(response: Record<string, unknown>, scheduleIndex = 0) {
      const current = await fixture();
      let snapshot = await current.store.createSealedRun(current.input);
      const payload = requestPayload(scheduleIndex);
      const intent = requestIntent(current.input, payload, current.store, scheduleIndex, 1, time(1));
      snapshot = await current.store.commitDispatchIntent({
        run_sha256: current.input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        intent, request_payload: payload, created_at: time(2),
      });
      const receipt = attemptAudit(intent, current.store, "result_received", {
        started_at: time(3), finished_at: time(4), parsed_response: response,
      });
      snapshot = await current.store.commitAttemptAudit({
        run_sha256: current.input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        audit: receipt.audit, response_bytes: receipt.response_bytes,
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
      schema_version: "oracle-gate-response-v1",
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
      (record: CommittedRequestV1): void => { record.response_object_uri = String(wrongValidator.audit.response_object_uri); },
      (record: CommittedRequestV1): void => { record.response_sha256 = "f".repeat(64); },
    ]) {
      const record = committedRequest(wrongValidator.intent, wrongValidator.audit, time(6));
      mutate(record);
      record.committed_request_sha256 = hashCommittedRequest(record);
      await expect(wrongValidator.store.commitSchemaValidatedRequest({
        run_sha256: wrongValidator.input.run.run_sha256, expected_head: wrongValidator.snapshot.head_pin,
        expected_checkpoint_sha256: wrongValidator.snapshot.head_pin.checkpoint_sha256,
        committed_request: record, created_at: time(7),
      })).rejects.toThrow("parsed response receipt");
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
      intent, request_payload: payload, created_at: time(2),
    });
    const audit = attemptAudit(intent, store, "not_sent", { started_at: time(3), finished_at: time(4) });
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
      `runs/${input.run.run_sha256}/objects/request-payloads/${intent.request_payload_sha256}`,
      "request.bin",
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
        intent, request_payload: payload, created_at: time(second + 1),
      });
      const receipt = attemptAudit(intent, store, "result_received", {
        started_at: time(second + 2), finished_at: time(second + 3),
        parsed_response: oracleResponse(`fixture-${index}`),
      });
      snapshot = await store.commitAttemptAudit({
        run_sha256: input.run.run_sha256, expected_head: snapshot.head_pin,
        expected_checkpoint_sha256: snapshot.head_pin.checkpoint_sha256,
        audit: receipt.audit, response_bytes: receipt.response_bytes,
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
