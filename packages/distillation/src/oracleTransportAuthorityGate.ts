import { createPublicKey, KeyObject, type KeyLike } from "node:crypto";
import type { FormalOracleTransportRegistryV1 } from "../../contracts/src/index.js";
import { FormalOracleTransportAuthorityStore } from "../../store/src/formalOracleTransportAuthorityStore.js";

export interface FormalOracleTransportAuthorityCapability {
  readonly stage: "transport_endpoint_account_attested_only";
  readonly transport_registry_sha256: string;
  readonly ledger_registry_sha256: string;
  readonly composition_sha256: string;
  readonly run_sha256: string;
  readonly execution_plan_sha256: string;
  readonly expires_at: string;
  readonly provider_body_profile: FormalOracleTransportRegistryV1["provider_body_profile"];
  readonly prepared_adapter_version: FormalOracleTransportRegistryV1["prepared_adapter_version"];
  readonly transport: "pi";
  readonly model: string;
  readonly endpoint: Readonly<FormalOracleTransportRegistryV1["endpoint"]>;
  readonly account: Readonly<FormalOracleTransportRegistryV1["account"]>;
  readonly retry_policy: Readonly<FormalOracleTransportRegistryV1["retry_policy"]>;
  readonly provider_wire_capture_status: "pending_single_consume_sender";
  readonly response_capture_status: "pending_single_consume_sender";
  readonly credential_availability_status: "pending_external_callback_secret";
  readonly toolchain_capsule_status: "pending_external_immutable_capsule";
  readonly registry_rollback_protection_status: "pending_external_monotonic_worm";
  readonly api_execution_allowed: false;
}

const activeCapabilities = new WeakSet<object>();

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

class TransportAuthorityCapability implements FormalOracleTransportAuthorityCapability {
  readonly stage = "transport_endpoint_account_attested_only" as const;
  readonly provider_wire_capture_status = "pending_single_consume_sender" as const;
  readonly response_capture_status = "pending_single_consume_sender" as const;
  readonly credential_availability_status = "pending_external_callback_secret" as const;
  readonly toolchain_capsule_status = "pending_external_immutable_capsule" as const;
  readonly registry_rollback_protection_status = "pending_external_monotonic_worm" as const;
  readonly api_execution_allowed = false as const;

  constructor(
    readonly transport_registry_sha256: string,
    readonly ledger_registry_sha256: string,
    readonly composition_sha256: string,
    readonly run_sha256: string,
    readonly execution_plan_sha256: string,
    readonly expires_at: string,
    readonly provider_body_profile: FormalOracleTransportRegistryV1["provider_body_profile"],
    readonly prepared_adapter_version: FormalOracleTransportRegistryV1["prepared_adapter_version"],
    readonly transport: "pi",
    readonly model: string,
    readonly endpoint: Readonly<FormalOracleTransportRegistryV1["endpoint"]>,
    readonly account: Readonly<FormalOracleTransportRegistryV1["account"]>,
    readonly retry_policy: Readonly<FormalOracleTransportRegistryV1["retry_policy"]>,
  ) { Object.freeze(this); }

  toJSON(): never {
    throw new Error("Formal Oracle transport authority capability 是 callback 内临时能力，不得序列化或持久化");
  }
}

export function assertActiveFormalOracleTransportAuthorityCapability(
  value: FormalOracleTransportAuthorityCapability,
): void {
  if (!value || typeof value !== "object" || !activeCapabilities.has(value as object)) {
    throw new Error("Formal Oracle transport authority capability 无效、已过期或来自 JSON 伪造");
  }
  if (typeof value.expires_at !== "string" || Date.now() >= Date.parse(value.expires_at)) {
    throw new Error("Formal Oracle transport authority capability 已超过签名有效期");
  }
}

function snapshotTrustedKeys(input: ReadonlyMap<string, KeyLike>): ReadonlyMap<string, KeyLike> {
  if (!input.size) throw new Error("trusted_transport_public_keys 不能为空");
  const snapshot = new Map<string, KeyLike>();
  for (const [keyId, value] of input) {
    if (!/^[a-z0-9][a-z0-9._-]{1,127}$/.test(keyId) || snapshot.has(keyId)) throw new Error("trusted transport key policy 无效");
    const parsed = value instanceof KeyObject && value.type === "public" ? value : createPublicKey(value);
    if (parsed.type !== "public" || parsed.asymmetricKeyType !== "ed25519") throw new Error("trusted transport key 必须是 Ed25519 公钥");
    const der = parsed.export({ format: "der", type: "spki" });
    snapshot.set(keyId, createPublicKey({ key: Buffer.from(der), format: "der", type: "spki" }));
  }
  return snapshot;
}

/**
 * Binds a signed endpoint/account registry to externally pinned composition,
 * run and plan roots. The transport registry lock remains held for the callback
 * so concurrent revocation is serialized. Future consumers must acquire the run
 * lock only inside this callback, preserving transport -> run lock order.
 * This capability contains no credential and cannot send a request.
 */
export async function withPinnedFormalOracleTransportAuthority<T>(input: {
  transport_store: FormalOracleTransportAuthorityStore;
  pinned_transport_registry_sha256: string;
  trusted_transport_public_keys: ReadonlyMap<string, KeyLike>;
  expected: {
    ledger_registry_sha256: string;
    composition_sha256: string;
    run_sha256: string;
    execution_plan_sha256: string;
    model: string;
  };
  callback: (capability: FormalOracleTransportAuthorityCapability) => Promise<T>;
}): Promise<T> {
  if (typeof input.callback !== "function") throw new Error("transport authority callback 必须是函数");
  const expected = structuredClone(input.expected);
  if (!expected || typeof expected !== "object" || Array.isArray(expected)
    || JSON.stringify(Object.keys(expected).sort()) !== JSON.stringify(["composition_sha256", "execution_plan_sha256", "ledger_registry_sha256", "model", "run_sha256"])) {
    throw new Error("transport authority expected roots 字段集合无效");
  }
  for (const [label, value] of Object.entries(expected)) {
    if (label === "model" ? typeof value !== "string" || !value : typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
      throw new Error(`transport authority expected.${label} 无效`);
    }
  }
  deepFreeze(expected);
  const trusted = snapshotTrustedKeys(input.trusted_transport_public_keys);
  return input.transport_store.withPinnedRegistry(
    input.pinned_transport_registry_sha256,
    trusted,
    async (registry) => {
      if (registry.ledger_registry_sha256 !== expected.ledger_registry_sha256
        || registry.composition_sha256 !== expected.composition_sha256
        || registry.run_sha256 !== expected.run_sha256
        || registry.execution_plan_sha256 !== expected.execution_plan_sha256
        || registry.model !== expected.model) {
        throw new Error("Formal transport registry 未绑定当前 composition/run/plan/model roots");
      }
      const capability = new TransportAuthorityCapability(
        registry.registry_sha256,
        registry.ledger_registry_sha256,
        registry.composition_sha256,
        registry.run_sha256,
        registry.execution_plan_sha256,
        registry.expires_at,
        registry.provider_body_profile,
        registry.prepared_adapter_version,
        registry.transport,
        registry.model,
        deepFreeze(structuredClone(registry.endpoint)),
        deepFreeze(structuredClone(registry.account)),
        deepFreeze(structuredClone(registry.retry_policy)),
      );
      activeCapabilities.add(capability);
      try { return await input.callback(capability); }
      finally { activeCapabilities.delete(capability); }
    },
  );
}
