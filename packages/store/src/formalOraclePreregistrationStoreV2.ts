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
  type RunCheckpointV1,
} from "../../contracts/src/oracle-gate-run.js";
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

function deepFreezePlain<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreezePlain(child);
    Object.freeze(value);
  }
  return value;
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
 * Create-once private store for the V2 preregistration DAG and its exact genesis.
 * It deliberately does not expose dispatch/resume: the V2 execution pipeline,
 * external WORM pin, evidence authenticity, blind review and statistics remain
 * separate fail-closed gates. No method authorizes an API call.
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

  private withLock<T>(runSha256: string, operation: () => Promise<T>): Promise<T> {
    return this.privateFs.withExclusiveLock(`locks/${runSha256}.lock`, `preregistered-run-v2:${runSha256}`, operation);
  }
  private runPath(runSha256: string): string { return `runs/${runSha256}`; }
  private headPath(runSha256: string): string { return `${this.runPath(runSha256)}/HEAD`; }
  private objectDirectory(runSha256: string, kind: string, hash: string): string { return `${this.runPath(runSha256)}/objects/${kind}/${hash}`; }
  private objectPath(runSha256: string, kind: string, hash: string, name: string): string { return `${this.objectDirectory(runSha256, kind, hash)}/${name}`; }
}
