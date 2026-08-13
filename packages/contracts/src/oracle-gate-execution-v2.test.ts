import { describe, expect, it } from "vitest";
import {
  hashFormalOracleExecutionLineageV2,
  hashFormalOracleExecutionMigrationV1,
  hashFormalOracleRunHeadV2,
  hashRunCheckpoint,
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
  type RunCheckpointV1,
  type RunCheckpointV2,
} from "./index.js";

const sha = (value: string): string => value.repeat(64).slice(0, 64);

function fixture(): {
  genesis: RunCheckpointV1;
  migration: FormalOracleExecutionMigrationV1;
  checkpoint: RunCheckpointV2;
  head: FormalOracleRunHeadV2;
  pin: FormalOracleHeadPinV2;
} {
  const entries = [{
    request_id: "REQ-1", idempotency_key: sha("a"), state: "PENDING" as const,
    resume_action: "dispatch_new_attempt" as const, max_attempts: 2, attempts_used: 0,
    active_intent_sha256: null, latest_attempt_audit_sha256: null, committed_request_sha256: null,
  }];
  const genesis: RunCheckpointV1 = {
    schema_version: "oracle-gate-run-checkpoint-v1", checkpoint_sha256: sha("0"), run_sha256: sha("1"),
    schedule_sha256: sha("2"), generation: 0, previous_checkpoint_sha256: null,
    created_at: "2026-08-13T00:00:00.000Z", run_state: "SEALED_READY", terminal_reason_sha256: null,
    request_count: 1, counts: { pending: 1, retry_ready: 0, dispatch_intent_committed: 0, receipt_committed: 0,
      schema_validated_committed: 0, blocked_ambiguous: 0, failed_closed: 0 }, entries,
  };
  genesis.checkpoint_sha256 = hashRunCheckpoint(genesis);
  const lineage = {
    run_sha256: genesis.run_sha256, preregistration_bundle_sha256: sha("3"), schedule_sha256: genesis.schedule_sha256,
    execution_plan_sha256: sha("4"), genesis_checkpoint_sha256: genesis.checkpoint_sha256,
  };
  const migration: FormalOracleExecutionMigrationV1 = {
    schema_version: "formal-oracle-execution-migration-v1", migration_sha256: sha("0"), ...lineage,
    execution_lineage_sha256: hashFormalOracleExecutionLineageV2(lineage),
    from_head_schema_version: "formal-oracle-preregistered-run-head-v2", from_generation: 0,
    from_checkpoint_sha256: genesis.checkpoint_sha256, to_checkpoint_schema_version: "oracle-gate-run-checkpoint-v2",
    to_generation: 1, migrated_at: "2026-08-13T00:01:00.000Z",
    migration_status: "execution_v2_state_machine_initialized_non_executable",
    external_monotonic_worm_status: "pending_external_monotonic_worm", api_execution_allowed: false,
  };
  migration.migration_sha256 = hashFormalOracleExecutionMigrationV1(migration);
  const checkpoint: RunCheckpointV2 = {
    schema_version: "oracle-gate-run-checkpoint-v2", checkpoint_sha256: sha("0"), run_sha256: genesis.run_sha256,
    preregistration_bundle_sha256: migration.preregistration_bundle_sha256,
    execution_plan_sha256: migration.execution_plan_sha256, genesis_checkpoint_sha256: genesis.checkpoint_sha256,
    execution_lineage_sha256: migration.execution_lineage_sha256, migration_sha256: migration.migration_sha256,
    schedule_sha256: genesis.schedule_sha256, generation: 1, previous_checkpoint_sha256: genesis.checkpoint_sha256,
    created_at: migration.migrated_at, run_state: "SEALED_READY", terminal_reason_sha256: null,
    request_count: 1, counts: structuredClone(genesis.counts), entries: structuredClone(genesis.entries),
    execution_record_version: "formal-oracle-execution-records-v2", api_execution_allowed: false,
  };
  checkpoint.checkpoint_sha256 = hashRunCheckpointV2(checkpoint);
  const head: FormalOracleRunHeadV2 = {
    schema_version: "formal-oracle-run-head-v2", head_record_sha256: sha("0"), run_sha256: genesis.run_sha256,
    preregistration_bundle_sha256: migration.preregistration_bundle_sha256,
    execution_lineage_sha256: migration.execution_lineage_sha256, genesis_checkpoint_sha256: genesis.checkpoint_sha256,
    migration_sha256: migration.migration_sha256, generation: 1, checkpoint_sha256: checkpoint.checkpoint_sha256,
    updated_at: checkpoint.created_at, execution_status: "execution_v2_initialized_non_executable",
    external_monotonic_worm_status: "pending_external_monotonic_worm", api_execution_allowed: false,
  };
  head.head_record_sha256 = hashFormalOracleRunHeadV2(head);
  const pin: FormalOracleHeadPinV2 = {
    schema_version: "formal-oracle-head-pin-v2", head_record_sha256: head.head_record_sha256,
    run_sha256: head.run_sha256, preregistration_bundle_sha256: head.preregistration_bundle_sha256,
    execution_lineage_sha256: head.execution_lineage_sha256, genesis_checkpoint_sha256: head.genesis_checkpoint_sha256,
    migration_sha256: head.migration_sha256, generation: head.generation, checkpoint_sha256: head.checkpoint_sha256,
  };
  return { genesis, migration, checkpoint, head, pin };
}

describe("Formal Oracle execution v2 bootstrap", () => {
  it("bridges the sole V1 genesis into a domain-separated V2 checkpoint and pinned HEAD", () => {
    const x = fixture();
    expect(validateFormalOracleExecutionMigrationV1(x.migration)).toEqual({ valid: true, issues: [] });
    expect(validateRunCheckpointV2(x.checkpoint)).toEqual({ valid: true, issues: [] });
    expect(validateFormalOracleExecutionMigrationBridgeV1({ genesis: x.genesis, migration: x.migration, checkpoint: x.checkpoint })).toEqual({ valid: true, issues: [] });
    expect(validateFormalOracleRunHeadV2(x.head)).toEqual({ valid: true, issues: [] });
    expect(validateFormalOracleHeadPinV2AgainstHead(x.pin, x.head)).toEqual({ valid: true, issues: [] });
    expect(x.checkpoint.checkpoint_sha256).not.toBe(x.genesis.checkpoint_sha256);
  });

  it("rejects old schemas, root drift, state drift and a stale head-record pin after full rehash", () => {
    const x = fixture();
    expect(validateRunCheckpointV2(x.genesis).valid).toBe(false);
    const changed = structuredClone(x);
    changed.checkpoint.entries[0].state = "DISPATCH_INTENT_COMMITTED";
    changed.checkpoint.entries[0].resume_action = "block_ambiguous";
    changed.checkpoint.entries[0].active_intent_sha256 = sha("9");
    changed.checkpoint.counts.pending = 0; changed.checkpoint.counts.dispatch_intent_committed = 1;
    changed.checkpoint.run_state = "RUNNING";
    changed.checkpoint.checkpoint_sha256 = hashRunCheckpointV2(changed.checkpoint);
    expect(validateFormalOracleExecutionMigrationBridgeV1({ genesis: changed.genesis, migration: changed.migration, checkpoint: changed.checkpoint }).valid).toBe(false);
    const stale = { ...x.pin, head_record_sha256: sha("f") };
    expect(validateFormalOracleHeadPinV2AgainstHead(stale, x.head).valid).toBe(false);
  });

  it("only permits V2-to-V2 transitions with immutable lineage roots", () => {
    const x = fixture();
    const next = structuredClone(x.checkpoint);
    next.generation = 2; next.previous_checkpoint_sha256 = x.checkpoint.checkpoint_sha256;
    next.created_at = "2026-08-13T00:02:00.000Z"; next.checkpoint_sha256 = hashRunCheckpointV2(next);
    expect(validateRunCheckpointTransitionV2(x.checkpoint, next)).toEqual({ valid: true, issues: [] });
    next.preregistration_bundle_sha256 = sha("f"); next.checkpoint_sha256 = hashRunCheckpointV2(next);
    expect(validateRunCheckpointTransitionV2(x.checkpoint, next).valid).toBe(false);
  });

  it("rejects accessors without invoking them", () => {
    const x = fixture(); let hits = 0;
    const hostile = Object.create(Object.prototype, Object.getOwnPropertyDescriptors(x.migration));
    Object.defineProperty(hostile, "run_sha256", { enumerable: true, get() { hits += 1; return x.migration.run_sha256; } });
    expect(validateFormalOracleExecutionMigrationV1(hostile).valid).toBe(false);
    expect(hits).toBe(0);
  });
});
