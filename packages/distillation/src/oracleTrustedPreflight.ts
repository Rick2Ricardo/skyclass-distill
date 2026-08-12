import type { KeyLike } from "node:crypto";
import type { OracleGateFormalInputManifest, OracleGateFormalSpec } from "../../contracts/src/index.js";
import { FrozenOracleRegistryStore, type OracleRegistrySigner } from "../../store/src/frozenOracleRegistryStore.js";
import { GoldLedgerAttestor } from "../../store/src/goldLedgerAttestor.js";
import { prepareOracleGateFormalStructuralPreflight } from "./oracleFormalPreflight.js";

const activeCapabilities = new WeakSet<object>();

export interface OracleLedgerAttestedCapability {
  readonly stage: "ledger_attested_only";
  readonly registry_sha256: string;
  readonly ledger_snapshot_sha256: string;
  readonly dataset_sha256: string;
  readonly formal_input_manifest_sha256: string;
  readonly formal_spec_sha256: string;
  readonly resource_manifest_sha256: string;
  readonly schedule_sha256: string;
  readonly code_revision: string;
  readonly build_artifact_sha256: string;
  readonly case_count: number;
  readonly event_count: number;
  readonly request_count: number;
}

class LedgerCapability implements OracleLedgerAttestedCapability {
  readonly stage = "ledger_attested_only" as const;

  constructor(
    readonly registry_sha256: string,
    readonly ledger_snapshot_sha256: string,
    readonly dataset_sha256: string,
    readonly formal_input_manifest_sha256: string,
    readonly formal_spec_sha256: string,
    readonly resource_manifest_sha256: string,
    readonly schedule_sha256: string,
    readonly code_revision: string,
    readonly build_artifact_sha256: string,
    readonly case_count: number,
    readonly event_count: number,
    readonly request_count: number,
  ) {
    Object.freeze(this);
  }

  toJSON(): never {
    throw new Error("Oracle ledger capability 是 callback 内临时能力，不得序列化或持久化");
  }
}

export function assertActiveOracleLedgerCapability(value: OracleLedgerAttestedCapability): void {
  if (!value || typeof value !== "object" || !activeCapabilities.has(value as object)) {
    throw new Error("Oracle ledger capability 无效、已过期或来自 JSON 伪造");
  }
}

export async function freezeCurrentOracleLedgerRegistry(input: {
  attestor: GoldLedgerAttestor;
  registryStore: FrozenOracleRegistryStore;
  manifest: OracleGateFormalInputManifest;
  spec: OracleGateFormalSpec;
  signer: OracleRegistrySigner;
  sequence: number;
  frozen_at: string;
  created_by: string;
  build_artifact_sha256: string;
}): Promise<{ registry_sha256: string; registry_id: string }> {
  return input.attestor.withCurrentSnapshot(input.manifest.signed_gold_dataset_sha256, async ({ snapshot, dataset }) => {
    const structural = prepareOracleGateFormalStructuralPreflight({ dataset, manifest: input.manifest, spec: input.spec });
    if (structural.api_execution_allowed !== false || structural.status !== "untrusted_structure_valid") {
      throw new Error("Formal Oracle structural gate 状态异常");
    }
    const registry = await input.registryStore.freezeLedgerRegistry({
      sequence: input.sequence,
      frozen_at: input.frozen_at,
      created_by: input.created_by,
      ledger_snapshot: snapshot,
      formal_input_manifest_sha256: structural.input_manifest_sha256,
      formal_spec_sha256: structural.spec_sha256,
      resource_manifest_sha256: input.manifest.resource_manifest_sha256,
      schedule_sha256: structural.schedule_sha256,
      code_revision: input.spec.code_revision,
      build_artifact_sha256: input.build_artifact_sha256,
      case_count: structural.case_count,
      event_count: structural.event_count,
      request_count: structural.request_count,
    }, input.signer);
    return { registry_sha256: registry.registry_sha256, registry_id: registry.registry_id };
  });
}

/**
 * Revalidates the externally pinned registry and the current append-only ledger,
 * then lends a non-serializable capability only while the global ledger lock is
 * held. This is still not an execution capability: media, speech and run-store
 * gates remain separate and false in the v1 registry.
 */
export async function withLedgerAttestedOracleRegistry<T>(input: {
  attestor: GoldLedgerAttestor;
  registryStore: FrozenOracleRegistryStore;
  pinned_registry_sha256: string;
  trusted_public_keys: ReadonlyMap<string, KeyLike>;
  callback: (capability: OracleLedgerAttestedCapability) => Promise<T>;
}): Promise<T> {
  return input.registryStore.withPinnedLedgerRegistry(
    input.pinned_registry_sha256,
    input.trusted_public_keys,
    async (registry) => input.attestor.withCurrentSnapshot(registry.ledger_snapshot.dataset_sha256, async ({ snapshot }) => {
      if (snapshot.snapshot_sha256 !== registry.ledger_snapshot.snapshot_sha256
        || snapshot.ledger_tree_sha256 !== registry.ledger_snapshot.ledger_tree_sha256
        || snapshot.queue_sha256 !== registry.ledger_snapshot.queue_sha256) {
        throw new Error("当前 Gold ledger 已相对 pinned registry 漂移");
      }
      const capability = new LedgerCapability(
        registry.registry_sha256,
        snapshot.snapshot_sha256,
        snapshot.dataset_sha256,
        registry.formal_input_manifest_sha256,
        registry.formal_spec_sha256,
        registry.resource_manifest_sha256,
        registry.schedule_sha256,
        registry.code_revision,
        registry.build_artifact_sha256,
        registry.case_count,
        registry.event_count,
        registry.request_count,
      );
      activeCapabilities.add(capability);
      try {
        return await input.callback(capability);
      } finally {
        activeCapabilities.delete(capability);
      }
    }),
  );
}
