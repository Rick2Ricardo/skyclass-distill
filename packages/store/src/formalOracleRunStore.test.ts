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
import type { FormalRunContractV1, RequestIntentV1, RunCheckpointV1 } from "../../contracts/src/oracle-gate-run.js";
import { hashFormalRunContract, hashRequestIntent, hashRunCheckpoint } from "../../contracts/src/oracle-gate-run.js";
import {
  FormalOracleRunStore,
  hashFormalOracleExecutionPlan,
  hashFormalOracleStructuralSchedule,
  type CreateSealedRunInput,
  type FormalOracleExecutionPlanV1,
  type FormalOracleStructuralScheduleV1,
} from "./formalOracleRunStore.js";
import { PrivateContentAddressedFs } from "./privateContentAddressedFs.js";

const RUN_STORE_URI = "board2skill/formal-oracle/run-store";
const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function sha(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
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
      system_sha256: "e".repeat(64),
      user_template_sha256: "a".repeat(64),
      output_schema_sha256: "1".repeat(64),
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

function requestPayload(index: number): Buffer {
  return Buffer.from(`frozen-request-${index}\n`, "utf8");
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
      request_payload_sha256: sha(requestPayload(index)),
      system_prompt_sha256: spec.prompt.system_sha256,
      // Rendered request prompt is intentionally different from the template hash.
      user_prompt_sha256: sha(`rendered-user-prompt-${index}`),
      output_schema_sha256: spec.prompt.output_schema_sha256,
      visuals: item.arm === "transcript_only" ? [] : [{
        label: "visual-1",
        object_uri: `frozen-assets/${item.arm}-${item.seed}.jpg`,
        sha256: sha(`visual-${item.arm}-${item.seed}`),
        mime_type: "image/jpeg",
        width: 1920,
        height: 360,
        byte_length: 1234 + index,
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
      verified_committed: 0, blocked_ambiguous: 0, failed_closed: 0,
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

function requestIntent(input: CreateSealedRunInput, payload: Buffer, store: FormalOracleRunStore, index = 1): RequestIntentV1 {
  const expected = input.execution_plan.items[index];
  const request: RequestIntentV1 = {
    schema_version: "oracle-gate-request-intent-v1",
    intent_sha256: "0".repeat(64),
    run_sha256: input.run.run_sha256,
    request_id: expected.request_id,
    idempotency_key: expected.idempotency_key,
    schedule_index: expected.schedule_index,
    attempt_ordinal: 1,
    prepared_at: "2026-08-12T00:00:01.000Z",
    case_id: expected.case_id,
    arm: expected.arm,
    seed: expected.seed,
    model: expected.model,
    request_payload_sha256: sha(payload),
    request_object_uri: store.requestObjectUri(input.run.run_sha256, sha(payload)),
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
      request_payload: Buffer.from("wrong bytes", "utf8"),
      created_at: "2026-08-12T00:00:02.000Z",
    })).rejects.toThrow("三方不匹配");
    const selfConsistentWrongPayload = Buffer.from("self-consistent but unplanned", "utf8");
    await expect(store.commitDispatchIntent({
      run_sha256: input.run.run_sha256,
      expected_head: sealed.head_pin,
      expected_checkpoint_sha256: sealed.head_pin.checkpoint_sha256,
      intent: requestIntent(input, selfConsistentWrongPayload, store),
      request_payload: selfConsistentWrongPayload,
      created_at: "2026-08-12T00:00:02.000Z",
    })).rejects.toThrow("execution plan");
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
  });

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
