import { describe, expect, it } from "vitest";
import {
  hashCommittedRequest,
  hashFormalRunContract,
  hashPrivateAnswerKey,
  hashPublicBlindPackage,
  hashPublicBlindResponse,
  hashRequestAttemptAudit,
  hashRequestIntent,
  hashRunCheckpoint,
  validateCommittedRequestAgainstAttempt,
  validateCompletedFormalRunArtifactChain,
  validateFormalRunContract,
  validatePrivateAnswerKey,
  validatePrivateAnswerKeyAgainstPublicPackage,
  validatePublicBlindPackage,
  validateRequestAttemptAgainstIntent,
  validateRequestAttemptAudit,
  validateRequestIntent,
  validateRunCheckpoint,
  validateRunCheckpointTransition,
  type CommittedRequestV1,
  type FormalRunContractV1,
  type OracleGateCheckpointEntryV1,
  type PrivateAnswerKeyV1,
  type PublicBlindPackageV1,
  type RequestAttemptAuditV1,
  type RequestIntentV1,
  type RunCheckpointV1,
} from "./oracle-gate-run.js";
import { sha256Hex } from "./sha256.js";

const HASH = "a".repeat(64);
const BLIND_ID = `B-${"b".repeat(64)}`;
const TIME = "2026-08-12T00:00:00.000Z";

function formalRun(): FormalRunContractV1 {
  const value: FormalRunContractV1 = {
    schema_version: "oracle-gate-formal-run-contract-v1",
    run_sha256: HASH,
    canonicalization: "oracle-gate-run-canonical-json-v1",
    signed_gold_dataset_sha256: "1".repeat(64),
    formal_input_manifest_sha256: "2".repeat(64),
    formal_spec_sha256: "3".repeat(64),
    schedule_sha256: "4".repeat(64),
    execution_plan_sha256: "d".repeat(64),
    ledger_registry_sha256: "5".repeat(64),
    media_attestation_sha256: "6".repeat(64),
    speech_attestation_sha256: "7".repeat(64),
    code_revision: "8".repeat(40),
    build_artifact_sha256: "9".repeat(64),
    blinding_secret_commitment_sha256: "a".repeat(64),
    blinding_scheme: "hmac-sha256-run-request-v1",
    rating_plan_sha256: "b".repeat(64),
    statistics_plan_sha256: "c".repeat(64),
    run_store_uri: "formal-oracle/runs/private",
    request_count: 1,
    directory_mode: "0700",
    file_mode: "0600",
    lock_scheme: "exclusive-create-owner-nonce-v1",
    checkpoint_scheme: "immutable-hash-chain-head-v1",
    remote_idempotency_mode: "local_only_fail_closed",
    api_execution_allowed: false,
  };
  value.run_sha256 = hashFormalRunContract(value);
  return value;
}

function intent(run = formalRun()): RequestIntentV1 {
  const value: RequestIntentV1 = {
    schema_version: "oracle-gate-request-intent-v1",
    intent_sha256: HASH,
    run_sha256: run.run_sha256,
    request_id: "FREQ-fixture-001",
    idempotency_key: "d".repeat(64),
    schedule_index: 0,
    attempt_ordinal: 1,
    prepared_at: TIME,
    case_id: "FCASE-fixture-001",
    arm: "transcript_only",
    seed: 17,
    model: "vision-fixture",
    request_payload_sha256: "e".repeat(64),
    request_object_uri: "objects/requests/request-001.json",
    system_prompt_sha256: "f".repeat(64),
    user_prompt_sha256: "1".repeat(64),
    output_schema_sha256: "2".repeat(64),
    visuals: [],
    transport: "pi",
    temperature: 0,
    max_input_tokens: 8192,
    max_output_tokens: 2048,
    timeout_ms: 120_000,
    max_attempts: 2,
    cache_retention: "none",
    tools_policy: "none",
  };
  value.intent_sha256 = hashRequestIntent(value);
  return value;
}

function attempt(request = intent()): RequestAttemptAuditV1 {
  const value: RequestAttemptAuditV1 = {
    schema_version: "oracle-gate-request-attempt-audit-v1",
    attempt_sha256: HASH,
    run_sha256: request.run_sha256,
    request_id: request.request_id,
    idempotency_key: request.idempotency_key,
    intent_sha256: request.intent_sha256,
    attempt_ordinal: request.attempt_ordinal,
    started_at: "2026-08-12T00:00:01.000Z",
    finished_at: "2026-08-12T00:00:02.000Z",
    latency_ms: 1000,
    provider_id: "fixture-provider",
    provider_request_id: "provider-request-1",
    request_sha256: request.request_payload_sha256,
    request_object_uri: request.request_object_uri,
    response_object_uri: "objects/responses/response-001.json",
    response_bytes_sha256: "3".repeat(64),
    parsed_response_object_uri: "objects/parsed-responses/response-001.json",
    parsed_response_sha256: hashPublicBlindResponse({ schema_version: "fixture-v1", score: 1 }),
    submitted_visuals: request.visuals,
    model: request.model,
    transport: request.transport,
    temperature: request.temperature,
    max_input_tokens: request.max_input_tokens,
    max_output_tokens: request.max_output_tokens,
    timeout_ms: request.timeout_ms,
    seed: request.seed,
    cache_retention: request.cache_retention,
    tools_policy: request.tools_policy,
    outcome: "result_received",
    provider_response_received: true,
    stop_reason: "stop",
    error_code: null,
    error_message: null,
    usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120, cache_read_tokens: 0, cache_write_tokens: 0 },
    pricing_table_sha256: "4".repeat(64),
    cost_microunits: 123,
    automatic_retry_allowed: false,
  };
  value.attempt_sha256 = hashRequestAttemptAudit(value);
  return value;
}

function committed(request = intent(), receipt = attempt(request)): CommittedRequestV1 {
  const value: CommittedRequestV1 = {
    schema_version: "oracle-gate-committed-request-v1",
    committed_request_sha256: HASH,
    run_sha256: request.run_sha256,
    request_id: request.request_id,
    idempotency_key: request.idempotency_key,
    intent_sha256: request.intent_sha256,
    attempt_sha256: receipt.attempt_sha256,
    attempt_ordinal: receipt.attempt_ordinal,
    response_object_uri: String(receipt.parsed_response_object_uri),
    response_sha256: String(receipt.parsed_response_sha256),
    validator_version: "oracle-gate-response-structural-validator-v1",
    transport_and_schema_verified_at: "2026-08-12T00:00:03.000Z",
    transport_and_schema_verified: true,
    semantic_review_status: "pending_external_blind_review",
    provider_stop_confirmed: true,
  };
  value.committed_request_sha256 = hashCommittedRequest(value);
  return value;
}

function entry(state: OracleGateCheckpointEntryV1["state"], request = intent(), receipt = attempt(request), record = committed(request, receipt)): OracleGateCheckpointEntryV1 {
  const common = { request_id: request.request_id, idempotency_key: request.idempotency_key, max_attempts: request.max_attempts };
  if (state === "PENDING") return { ...common, state, resume_action: "dispatch_new_attempt", attempts_used: 0, active_intent_sha256: null, latest_attempt_audit_sha256: null, committed_request_sha256: null };
  if (state === "RETRY_READY") return { ...common, state, resume_action: "dispatch_new_attempt", attempts_used: 1, active_intent_sha256: request.intent_sha256, latest_attempt_audit_sha256: receipt.attempt_sha256, committed_request_sha256: null };
  if (state === "DISPATCH_INTENT_COMMITTED") return { ...common, state, resume_action: "block_ambiguous", attempts_used: 0, active_intent_sha256: request.intent_sha256, latest_attempt_audit_sha256: null, committed_request_sha256: null };
  if (state === "RECEIPT_COMMITTED") return { ...common, state, resume_action: "verify_receipt", attempts_used: 1, active_intent_sha256: request.intent_sha256, latest_attempt_audit_sha256: receipt.attempt_sha256, committed_request_sha256: null };
  if (state === "SCHEMA_VALIDATED_COMMITTED") return { ...common, state, resume_action: "skip_schema_validated", attempts_used: 1, active_intent_sha256: request.intent_sha256, latest_attempt_audit_sha256: receipt.attempt_sha256, committed_request_sha256: record.committed_request_sha256 };
  if (state === "BLOCKED_AMBIGUOUS") return { ...common, state, resume_action: "block_ambiguous", attempts_used: 1, active_intent_sha256: request.intent_sha256, latest_attempt_audit_sha256: receipt.attempt_sha256, committed_request_sha256: null };
  return { ...common, state, resume_action: "block_failed", attempts_used: 0, active_intent_sha256: null, latest_attempt_audit_sha256: null, committed_request_sha256: null };
}

function checkpoint(
  state: OracleGateCheckpointEntryV1["state"],
  generation = 0,
  previous: RunCheckpointV1 | null = null,
): RunCheckpointV1 {
  const request = intent();
  const receipt = attempt(request);
  const record = committed(request, receipt);
  const item = entry(state, request, receipt, record);
  const counts = {
    pending: state === "PENDING" ? 1 : 0,
    retry_ready: state === "RETRY_READY" ? 1 : 0,
    dispatch_intent_committed: state === "DISPATCH_INTENT_COMMITTED" ? 1 : 0,
    receipt_committed: state === "RECEIPT_COMMITTED" ? 1 : 0,
    schema_validated_committed: state === "SCHEMA_VALIDATED_COMMITTED" ? 1 : 0,
    blocked_ambiguous: state === "BLOCKED_AMBIGUOUS" ? 1 : 0,
    failed_closed: state === "FAILED_CLOSED" ? 1 : 0,
  };
  const runState = state === "PENDING" && generation === 0 ? "SEALED_READY"
    : state === "BLOCKED_AMBIGUOUS" ? "BLOCKED_AMBIGUOUS"
      : state === "FAILED_CLOSED" ? "FAILED_CLOSED"
        : state === "SCHEMA_VALIDATED_COMMITTED" ? "EXECUTION_COMPLETE" : "RUNNING";
  const value: RunCheckpointV1 = {
    schema_version: "oracle-gate-run-checkpoint-v1",
    checkpoint_sha256: HASH,
    run_sha256: request.run_sha256,
    schedule_sha256: formalRun().schedule_sha256,
    generation,
    previous_checkpoint_sha256: previous?.checkpoint_sha256 ?? null,
    created_at: `2026-08-12T00:00:0${generation}.000Z`,
    run_state: runState,
    terminal_reason_sha256: state === "BLOCKED_AMBIGUOUS" || state === "FAILED_CLOSED" ? "5".repeat(64) : null,
    request_count: 1,
    counts,
    entries: [item],
  };
  value.checkpoint_sha256 = hashRunCheckpoint(value);
  return value;
}

function publicPackage(): PublicBlindPackageV1 {
  const response = { schema_version: "fixture-v1", score: 1 };
  const value: PublicBlindPackageV1 = {
    schema_version: "oracle-gate-public-blind-package-v1",
    package_sha256: HASH,
    run_commitment_sha256: formalRun().run_sha256,
    rubric_version: "oracle-gate-rubric-v1",
    rubric_sha256: "6".repeat(64),
    blinding_statement: "metadata_blinded_no_pairing_exposed",
    item_count: 1,
    items: [{ blind_id: BLIND_ID, response, response_sha256: hashPublicBlindResponse(response) }],
  };
  value.package_sha256 = hashPublicBlindPackage(value);
  return value;
}

function answerKey(published = publicPackage()): PrivateAnswerKeyV1 {
  const request = intent();
  const value: PrivateAnswerKeyV1 = {
    schema_version: "oracle-gate-private-answer-key-v1",
    answer_key_sha256: HASH,
    run_sha256: published.run_commitment_sha256,
    public_package_sha256: published.package_sha256,
    blind_secret_commitment_sha256: formalRun().blinding_secret_commitment_sha256,
    blinding_scheme: "hmac-sha256-run-request-v1",
    created_at: "2026-08-12T00:00:03.000Z",
    entries: [{
      blind_id: BLIND_ID,
      request_id: request.request_id,
      idempotency_key: request.idempotency_key,
      case_id: request.case_id,
      arm: request.arm,
      seed: request.seed,
      teacher_id: "teacher-1",
      source_video_id: "video-1",
      window_id: "window-1",
      response_sha256: published.items[0].response_sha256,
    }],
  };
  value.answer_key_sha256 = hashPrivateAnswerKey(value);
  return value;
}

describe("Formal Oracle content-addressed run contracts", () => {
  it("uses the browser-safe SHA-256 implementation without changing standard digests", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("accepts a fully sealed contract chain and domain-separated hashes", () => {
    const run = formalRun();
    const request = intent(run);
    const receipt = attempt(request);
    const record = committed(request, receipt);
    const published = publicPackage();
    const key = answerKey(published);
    expect(validateFormalRunContract(run)).toEqual({ valid: true, issues: [] });
    expect(validateRequestIntent(request)).toEqual({ valid: true, issues: [] });
    expect(validateRequestAttemptAudit(receipt)).toEqual({ valid: true, issues: [] });
    expect(validateRequestAttemptAgainstIntent(request, receipt)).toEqual({ valid: true, issues: [] });
    expect(validateCommittedRequestAgainstAttempt(request, receipt, record)).toEqual({ valid: true, issues: [] });
    expect(validatePublicBlindPackage(published)).toEqual({ valid: true, issues: [] });
    expect(validatePrivateAnswerKey(key)).toEqual({ valid: true, issues: [] });
    expect(validatePrivateAnswerKeyAgainstPublicPackage(key, published)).toEqual({ valid: true, issues: [] });

    const changedDomain = structuredClone(request);
    changedDomain.request_payload_sha256 = "9".repeat(64);
    expect(hashRequestIntent(changedDomain)).not.toBe(request.intent_sha256);
  });

  it("binds a completed checkpoint and blind artifacts back to one root run", () => {
    const run = formalRun();
    const request = intent(run);
    const receipt = attempt(request);
    const record = committed(request, receipt);
    const initial = checkpoint("PENDING");
    const dispatch = checkpoint("DISPATCH_INTENT_COMMITTED", 1, initial);
    const received = checkpoint("RECEIPT_COMMITTED", 2, dispatch);
    const completed = checkpoint("SCHEMA_VALIDATED_COMMITTED", 3, received);
    const published = publicPackage();
    const key = answerKey(published);
    expect(validateCompletedFormalRunArtifactChain({
      run,
      intents: [request],
      attempts: [receipt],
      committed_requests: [record],
      checkpoints: [initial, dispatch, received, completed],
      private_answer_key: key,
      public_blind_package: published,
    })).toEqual({ valid: true, issues: [] });

    completed.entries[0].active_intent_sha256 = "9".repeat(64);
    completed.checkpoint_sha256 = hashRunCheckpoint(completed);
    expect(validateCompletedFormalRunArtifactChain({
      run,
      intents: [request],
      attempts: [receipt],
      committed_requests: [record],
      checkpoints: [initial, dispatch, received, completed],
      private_answer_key: key,
      public_blind_package: published,
    }).valid).toBe(false);
  });

  it("rejects extra fields, unsafe URIs, non-safe numbers, and stale content hashes", () => {
    const run = { ...formalRun(), api_execution_allowed: true, extra: "field" };
    expect(validateFormalRunContract(run)).toMatchObject({ valid: false });
    expect(validateFormalRunContract(run).issues.map((item) => item.path)).toEqual(expect.arrayContaining(["$", "api_execution_allowed", "run_sha256"]));

    const request = structuredClone(intent()) as RequestIntentV1;
    request.request_object_uri = "%252e%252e/private/request.json";
    request.seed = Number.POSITIVE_INFINITY;
    expect(validateRequestIntent(request).issues.map((item) => item.path)).toEqual(expect.arrayContaining(["request_object_uri", "seed", "intent_sha256"]));
  });

  it("keeps dispatch intent, receipt, and schema-validated commit as distinct durable states", () => {
    const initial = checkpoint("PENDING");
    const dispatch = checkpoint("DISPATCH_INTENT_COMMITTED", 1, initial);
    const receipt = checkpoint("RECEIPT_COMMITTED", 2, dispatch);
    const schemaValidated = checkpoint("SCHEMA_VALIDATED_COMMITTED", 3, receipt);
    expect(validateRunCheckpoint(initial)).toEqual({ valid: true, issues: [] });
    expect(validateRunCheckpointTransition(initial, dispatch)).toEqual({ valid: true, issues: [] });
    expect(validateRunCheckpointTransition(dispatch, receipt)).toEqual({ valid: true, issues: [] });
    expect(validateRunCheckpointTransition(receipt, schemaValidated)).toEqual({ valid: true, issues: [] });
  });

  it("forbids automatic retry and redispatch after an ambiguous attempt", () => {
    const request = intent();
    const unknown = attempt(request);
    unknown.outcome = "unknown";
    unknown.provider_response_received = false;
    unknown.response_object_uri = null;
    unknown.response_bytes_sha256 = null;
    unknown.parsed_response_object_uri = null;
    unknown.parsed_response_sha256 = null;
    unknown.stop_reason = null;
    unknown.error_code = "transport_outcome_unknown";
    unknown.error_message = "request may have reached provider";
    unknown.usage = null;
    unknown.pricing_table_sha256 = null;
    unknown.cost_microunits = null;
    unknown.automatic_retry_allowed = true;
    unknown.attempt_sha256 = hashRequestAttemptAudit(unknown);
    expect(validateRequestAttemptAudit(unknown).issues.some((item) => item.path === "automatic_retry_allowed")).toBe(true);

    const initial = checkpoint("PENDING");
    const dispatch = checkpoint("DISPATCH_INTENT_COMMITTED", 1, initial);
    const ambiguous = checkpoint("BLOCKED_AMBIGUOUS", 2, dispatch);
    const redispatch = checkpoint("DISPATCH_INTENT_COMMITTED", 3, ambiguous);
    expect(validateRunCheckpointTransition(dispatch, ambiguous)).toEqual({ valid: true, issues: [] });
    expect(validateRunCheckpointTransition(ambiguous, redispatch).issues.some((item) => item.message.includes("非法 request 状态转换"))).toBe(true);
  });

  it("starts from a clean sealed checkpoint and freezes schema-validated provenance", () => {
    const forgedInitial = checkpoint("SCHEMA_VALIDATED_COMMITTED");
    expect(validateRunCheckpoint(forgedInitial).issues.some((item) => item.path === "generation")).toBe(true);

    const initial = checkpoint("PENDING");
    const dispatch = checkpoint("DISPATCH_INTENT_COMMITTED", 1, initial);
    const receipt = checkpoint("RECEIPT_COMMITTED", 2, dispatch);
    const schemaValidated = checkpoint("SCHEMA_VALIDATED_COMMITTED", 3, receipt);
    const rebound = checkpoint("SCHEMA_VALIDATED_COMMITTED", 4, schemaValidated);
    rebound.entries[0].active_intent_sha256 = "9".repeat(64);
    rebound.checkpoint_sha256 = hashRunCheckpoint(rebound);
    expect(validateRunCheckpointTransition(schemaValidated, rebound).issues.some((item) => item.message.includes("逐字段不可变"))).toBe(true);

    const dirtyPending = checkpoint("PENDING");
    dirtyPending.entries[0].attempts_used = 1;
    dirtyPending.entries[0].latest_attempt_audit_sha256 = "8".repeat(64);
    dirtyPending.checkpoint_sha256 = hashRunCheckpoint(dirtyPending);
    expect(validateRunCheckpoint(dirtyPending).issues.some((item) => item.message.includes("干净状态"))).toBe(true);
  });

  it("derives retry permission from max attempts and enforces token/cache/cost audit", () => {
    const lastIntent = intent();
    lastIntent.max_attempts = 1;
    lastIntent.intent_sha256 = hashRequestIntent(lastIntent);
    const failed = attempt(lastIntent);
    failed.outcome = "no_result_confirmed";
    failed.provider_response_received = false;
    failed.provider_request_id = null;
    failed.response_object_uri = null;
    failed.response_bytes_sha256 = null;
    failed.parsed_response_object_uri = null;
    failed.parsed_response_sha256 = null;
    failed.stop_reason = null;
    failed.error_code = "not-sent";
    failed.error_message = "provider confirmed no request";
    failed.usage = null;
    failed.pricing_table_sha256 = null;
    failed.cost_microunits = null;
    failed.automatic_retry_allowed = true;
    failed.attempt_sha256 = hashRequestAttemptAudit(failed);
    expect(validateRequestAttemptAgainstIntent(lastIntent, failed).issues.some((item) => item.path === "audit.automatic_retry_allowed")).toBe(true);

    const overBudget = attempt();
    overBudget.usage = { input_tokens: 9000, output_tokens: 3000, total_tokens: 12_000, cache_read_tokens: 1, cache_write_tokens: 0 };
    overBudget.pricing_table_sha256 = null;
    overBudget.cost_microunits = null;
    overBudget.attempt_sha256 = hashRequestAttemptAudit(overBudget);
    expect(validateRequestAttemptAudit(overBudget).issues.map((item) => item.path)).toEqual(expect.arrayContaining(["usage", "cost"]));
    expect(validateRequestAttemptAgainstIntent(intent(), overBudget).issues.some((item) => item.path === "audit.usage")).toBe(true);
  });

  it("enforces the public blind-item whitelist and rejects nested private metadata", () => {
    const extra = structuredClone(publicPackage()) as PublicBlindPackageV1 & { items: Array<Record<string, unknown>> };
    extra.items[0].paired_case_id = "pair-1";
    extra.package_sha256 = hashPublicBlindPackage(extra as PublicBlindPackageV1);
    expect(validatePublicBlindPackage(extra).issues.some((item) => item.message.includes("只允许"))).toBe(true);

    const nested = structuredClone(publicPackage());
    nested.items[0].response = { schema_version: "fixture-v1", diagnostics: { arm: "oracle_delta" } };
    nested.items[0].response_sha256 = hashPublicBlindResponse(nested.items[0].response);
    nested.package_sha256 = hashPublicBlindPackage(nested);
    expect(validatePublicBlindPackage(nested).issues.some((item) => item.path.endsWith(".arm"))).toBe(true);

    const unsafeNumber = structuredClone(publicPackage());
    unsafeNumber.items[0].response = { score: Number.NaN };
    expect(validatePublicBlindPackage(unsafeNumber).issues.some((item) => item.message.includes("有限"))).toBe(true);

    const valueLeak = structuredClone(publicPackage());
    valueLeak.items[0].response = { explanation: "arm=oracle_delta; seed=17; case_id=secret" };
    valueLeak.items[0].response_sha256 = hashPublicBlindResponse(valueLeak.items[0].response);
    valueLeak.package_sha256 = hashPublicBlindPackage(valueLeak);
    expect(validatePublicBlindPackage(valueLeak).issues.some((item) => item.message.includes("泄漏"))).toBe(true);

    const keyLeak = structuredClone(publicPackage());
    keyLeak.items[0].response = { Teacher_ID: "teacher-1" };
    keyLeak.items[0].response_sha256 = hashPublicBlindResponse(keyLeak.items[0].response);
    keyLeak.package_sha256 = hashPublicBlindPackage(keyLeak);
    expect(validatePublicBlindPackage(keyLeak).issues.some((item) => item.message.includes("元数据键"))).toBe(true);
  });

  it("requires a one-to-one private answer-key/public package commitment", () => {
    const published = publicPackage();
    const key = answerKey(published);
    key.entries[0].response_sha256 = "f".repeat(64);
    key.answer_key_sha256 = hashPrivateAnswerKey(key);
    expect(validatePrivateAnswerKeyAgainstPublicPackage(key, published).issues.some((item) => item.message.includes("mapping"))).toBe(true);

    const duplicate = answerKey(published);
    duplicate.entries.push({ ...duplicate.entries[0] });
    duplicate.answer_key_sha256 = hashPrivateAnswerKey(duplicate);
    expect(validatePrivateAnswerKey(duplicate).issues.some((item) => item.message.includes("必须分别唯一"))).toBe(true);
  });

  it("rejects ambiguous attempts followed by a fabricated successful retry", () => {
    const run = formalRun();
    const firstIntent = intent(run);
    const firstAttempt = attempt(firstIntent);
    firstAttempt.outcome = "unknown";
    firstAttempt.provider_response_received = false;
    firstAttempt.response_object_uri = null;
    firstAttempt.response_bytes_sha256 = null;
    firstAttempt.parsed_response_object_uri = null;
    firstAttempt.parsed_response_sha256 = null;
    firstAttempt.stop_reason = null;
    firstAttempt.error_code = "transport_outcome_unknown";
    firstAttempt.error_message = "request may have reached provider";
    firstAttempt.usage = null;
    firstAttempt.pricing_table_sha256 = null;
    firstAttempt.cost_microunits = null;
    firstAttempt.automatic_retry_allowed = false;
    firstAttempt.attempt_sha256 = hashRequestAttemptAudit(firstAttempt);

    const secondIntent = structuredClone(firstIntent);
    secondIntent.attempt_ordinal = 2;
    secondIntent.prepared_at = "2026-08-12T00:00:02.000Z";
    secondIntent.intent_sha256 = hashRequestIntent(secondIntent);
    const secondAttempt = attempt(secondIntent);
    secondAttempt.started_at = "2026-08-12T00:00:02.000Z";
    secondAttempt.finished_at = "2026-08-12T00:00:03.000Z";
    secondAttempt.attempt_sha256 = hashRequestAttemptAudit(secondAttempt);
    const record = committed(secondIntent, secondAttempt);
    record.transport_and_schema_verified_at = "2026-08-12T00:00:03.000Z";
    record.committed_request_sha256 = hashCommittedRequest(record);
    const initial = checkpoint("PENDING");
    const dispatch = checkpoint("DISPATCH_INTENT_COMMITTED", 1, initial);
    const received = checkpoint("RECEIPT_COMMITTED", 2, dispatch);
    const completed = checkpoint("SCHEMA_VALIDATED_COMMITTED", 3, received);
    const published = publicPackage();
    const key = answerKey(published);
    const result = validateCompletedFormalRunArtifactChain({
      run,
      intents: [firstIntent, secondIntent],
      attempts: [firstAttempt, secondAttempt],
      committed_requests: [record],
      checkpoints: [initial, dispatch, received, completed],
      private_answer_key: key,
      public_blind_package: published,
    });
    expect(result.issues.some((item) => item.message.includes("只有明确未发送/确认无结果"))).toBe(true);
  });

  it("rejects sparse canonical arrays and stale attempt-audit replay", () => {
    const sparseIntent = intent();
    sparseIntent.arm = "static_final_board";
    sparseIntent.visuals = Array(1) as RequestIntentV1["visuals"];
    expect(() => hashRequestIntent(sparseIntent)).toThrow("稀疏数组");
    expect(validateRequestIntent(sparseIntent).valid).toBe(false);

    const initial = checkpoint("PENDING");
    const dispatch = checkpoint("DISPATCH_INTENT_COMMITTED", 1, initial);
    dispatch.entries[0].attempts_used = 1;
    dispatch.entries[0].latest_attempt_audit_sha256 = "7".repeat(64);
    dispatch.checkpoint_sha256 = hashRunCheckpoint(dispatch);
    const received = checkpoint("RECEIPT_COMMITTED", 2, dispatch);
    received.entries[0].attempts_used = 2;
    received.entries[0].latest_attempt_audit_sha256 = dispatch.entries[0].latest_attempt_audit_sha256;
    received.checkpoint_sha256 = hashRunCheckpoint(received);
    expect(validateRunCheckpointTransition(dispatch, received).issues.some((item) => item.message.includes("只增加一次 attempt"))).toBe(true);
  });

  it("rejects case-folded private values and inconsistent checkpoint run states", () => {
    const run = formalRun();
    const request = intent(run);
    const receipt = attempt(request);
    const record = committed(request, receipt);
    const initial = checkpoint("PENDING");
    const dispatch = checkpoint("DISPATCH_INTENT_COMMITTED", 1, initial);
    const received = checkpoint("RECEIPT_COMMITTED", 2, dispatch);
    const completed = checkpoint("SCHEMA_VALIDATED_COMMITTED", 3, received);
    const published = publicPackage();
    published.items[0].response = { explanation: "TEACHER-1" };
    published.items[0].response_sha256 = hashPublicBlindResponse(published.items[0].response);
    published.package_sha256 = hashPublicBlindPackage(published);
    const key = answerKey(published);
    expect(validateCompletedFormalRunArtifactChain({
      run,
      intents: [request],
      attempts: [receipt],
      committed_requests: [record],
      checkpoints: [initial, dispatch, received, completed],
      private_answer_key: key,
      public_blind_package: published,
    }).issues.some((item) => item.message.includes("private answer-key 值"))).toBe(true);

    const blocked = checkpoint("BLOCKED_AMBIGUOUS", 2, dispatch);
    blocked.run_state = "RUNNING";
    blocked.terminal_reason_sha256 = null;
    blocked.checkpoint_sha256 = hashRunCheckpoint(blocked);
    expect(validateRunCheckpoint(blocked).issues.some((item) => item.message.includes("RUNNING 不得包含"))).toBe(true);

    const interruptedFailed = checkpoint("FAILED_CLOSED", 2, dispatch);
    interruptedFailed.run_state = "INTERRUPTED_SAFE";
    interruptedFailed.terminal_reason_sha256 = null;
    interruptedFailed.checkpoint_sha256 = hashRunCheckpoint(interruptedFailed);
    expect(validateRunCheckpoint(interruptedFailed).issues.some((item) => item.message.includes("安全中断不得遗留"))).toBe(true);
  });

  it("accepts a fully referenced confirmed-no-result retry history", () => {
    const run = formalRun();
    const firstIntent = intent(run);
    const firstAttempt = attempt(firstIntent);
    firstAttempt.outcome = "no_result_confirmed";
    firstAttempt.provider_response_received = false;
    firstAttempt.provider_request_id = null;
    firstAttempt.response_object_uri = null;
    firstAttempt.response_bytes_sha256 = null;
    firstAttempt.parsed_response_object_uri = null;
    firstAttempt.parsed_response_sha256 = null;
    firstAttempt.stop_reason = null;
    firstAttempt.error_code = "provider-confirmed-no-result";
    firstAttempt.error_message = "provider confirmed no stored result";
    firstAttempt.usage = null;
    firstAttempt.pricing_table_sha256 = null;
    firstAttempt.cost_microunits = null;
    firstAttempt.automatic_retry_allowed = true;
    firstAttempt.attempt_sha256 = hashRequestAttemptAudit(firstAttempt);

    const secondIntent = structuredClone(firstIntent);
    secondIntent.attempt_ordinal = 2;
    secondIntent.prepared_at = "2026-08-12T00:00:04.000Z";
    secondIntent.intent_sha256 = hashRequestIntent(secondIntent);
    const secondAttempt = attempt(secondIntent);
    secondAttempt.provider_request_id = "provider-request-2";
    secondAttempt.started_at = "2026-08-12T00:00:04.000Z";
    secondAttempt.finished_at = "2026-08-12T00:00:05.000Z";
    secondAttempt.attempt_sha256 = hashRequestAttemptAudit(secondAttempt);
    const record = committed(secondIntent, secondAttempt);
    record.transport_and_schema_verified_at = "2026-08-12T00:00:06.000Z";
    record.committed_request_sha256 = hashCommittedRequest(record);

    const initial = checkpoint("PENDING");
    const dispatch1 = checkpoint("DISPATCH_INTENT_COMMITTED", 1, initial);
    const receipt1 = checkpoint("RECEIPT_COMMITTED", 2, dispatch1);
    receipt1.entries[0] = { ...receipt1.entries[0], active_intent_sha256: firstIntent.intent_sha256, latest_attempt_audit_sha256: firstAttempt.attempt_sha256, attempts_used: 1 };
    receipt1.checkpoint_sha256 = hashRunCheckpoint(receipt1);
    const retryReady = checkpoint("RETRY_READY", 3, receipt1);
    retryReady.entries[0] = { ...retryReady.entries[0], active_intent_sha256: firstIntent.intent_sha256, latest_attempt_audit_sha256: firstAttempt.attempt_sha256, attempts_used: 1 };
    retryReady.checkpoint_sha256 = hashRunCheckpoint(retryReady);
    const dispatch2 = checkpoint("DISPATCH_INTENT_COMMITTED", 4, retryReady);
    dispatch2.entries[0] = { ...dispatch2.entries[0], active_intent_sha256: secondIntent.intent_sha256, latest_attempt_audit_sha256: firstAttempt.attempt_sha256, attempts_used: 1 };
    dispatch2.checkpoint_sha256 = hashRunCheckpoint(dispatch2);
    const receipt2 = checkpoint("RECEIPT_COMMITTED", 5, dispatch2);
    receipt2.entries[0] = { ...receipt2.entries[0], active_intent_sha256: secondIntent.intent_sha256, latest_attempt_audit_sha256: secondAttempt.attempt_sha256, attempts_used: 2 };
    receipt2.checkpoint_sha256 = hashRunCheckpoint(receipt2);
    const completed = checkpoint("SCHEMA_VALIDATED_COMMITTED", 6, receipt2);
    completed.entries[0] = { ...completed.entries[0], active_intent_sha256: secondIntent.intent_sha256, latest_attempt_audit_sha256: secondAttempt.attempt_sha256, committed_request_sha256: record.committed_request_sha256, attempts_used: 2 };
    completed.checkpoint_sha256 = hashRunCheckpoint(completed);
    const published = publicPackage();
    const key = answerKey(published);
    key.created_at = "2026-08-12T00:00:06.000Z";
    key.answer_key_sha256 = hashPrivateAnswerKey(key);
    expect(validateCompletedFormalRunArtifactChain({
      run,
      intents: [firstIntent, secondIntent],
      attempts: [firstAttempt, secondAttempt],
      committed_requests: [record],
      checkpoints: [initial, dispatch1, receipt1, retryReady, dispatch2, receipt2, completed],
      private_answer_key: key,
      public_blind_package: published,
    })).toEqual({ valid: true, issues: [] });
  });

  it("returns a validation report instead of throwing on malformed checkpoint entries", () => {
    const malformed = checkpoint("PENDING") as unknown as Record<string, unknown>;
    malformed.entries = [null];
    expect(() => validateRunCheckpoint(malformed)).not.toThrow();
    expect(validateRunCheckpoint(malformed).valid).toBe(false);
  });
});
