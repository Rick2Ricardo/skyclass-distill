import {
  createPrivateKey,
  createPublicKey,
  KeyObject,
  sign,
  verify,
  type KeyLike,
} from "node:crypto";
import type {
  FormalOracleTransportRegistryV1,
  FormalOracleTransportRevocationV1,
} from "../../contracts/src/index.js";
import {
  FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
  FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
  canonicalFormalOracleTransportRegistryDocument,
  canonicalFormalOracleTransportRevocationDocument,
  hashFormalOracleTransportRegistry,
  hashFormalOracleTransportRevocation,
  normalizeFormalOracleEndpointBaseUrl,
  validateFormalOracleTransportRegistry,
  validateFormalOracleTransportRevocation,
} from "../../contracts/src/index.js";
import {
  PrivateContentAddressedFs,
  assertPrivateSha256,
  type PrivateContentAddressedFsOptions,
} from "./privateContentAddressedFs.js";

export interface FormalOracleTransportAuthoritySigner {
  key_id: string;
  private_key: KeyLike;
}

export interface FreezeFormalOracleTransportRegistryInput {
  sequence: number;
  issued_at: string;
  expires_at: string;
  created_by: string;
  ledger_registry_sha256: string;
  composition_sha256: string;
  run_sha256: string;
  execution_plan_sha256: string;
  model: string;
  endpoint_base_url: string;
  provider_id: string;
  account_key_id: string;
  credential_key_id: string;
}

export interface FormalOracleTransportAuthorityStoreOptions extends PrivateContentAddressedFsOptions {
  root_uri?: string;
}

const DEFAULT_ROOT = "board2skill/formal-oracle-transport-authority";

function privateKey(value: KeyLike): KeyObject {
  const key = value instanceof KeyObject ? value : createPrivateKey(value);
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") throw new Error("Formal transport signer 必须是 Ed25519 私钥");
  return key;
}

function publicKey(value: KeyLike): KeyObject {
  const key = value instanceof KeyObject ? value : createPublicKey(value);
  if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") throw new Error("Formal transport trusted key 必须是 Ed25519 公钥");
  return key;
}

function canonicalTime(value: string, label: string): void {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) throw new Error(`${label} 必须是 canonical ISO 时间`);
}

function identifier(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{1,127}$/.test(value)) throw new Error(`${label} 无效`);
}

function canonicalSignature(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]{85}[AQgw]==$/.test(value)) throw new Error("Formal transport signature 不是 canonical Ed25519 base64");
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength !== 64 || bytes.toString("base64") !== value) throw new Error("Formal transport signature 不是 canonical 64-byte Ed25519 base64");
  return bytes;
}

export class FormalOracleTransportAuthorityStore {
  readonly privateFs: PrivateContentAddressedFs;
  readonly rootUri: string;

  constructor(readonly dataDir: string, options: FormalOracleTransportAuthorityStoreOptions = {}) {
    this.rootUri = options.root_uri ?? DEFAULT_ROOT;
    this.privateFs = new PrivateContentAddressedFs(dataDir, this.rootUri, options);
  }

  async freezeRegistry(
    input: FreezeFormalOracleTransportRegistryInput,
    signerInput: FormalOracleTransportAuthoritySigner,
  ): Promise<FormalOracleTransportRegistryV1> {
    identifier(signerInput.key_id, "signer.key_id");
    const signer = privateKey(signerInput.private_key);
    const endpoint = normalizeFormalOracleEndpointBaseUrl(input.endpoint_base_url);
    const registry: FormalOracleTransportRegistryV1 = {
      schema_version: "formal-oracle-transport-registry-v1",
      registry_id: "formal-transport-0000000000000000",
      registry_sha256: "0".repeat(64),
      status: "endpoint_account_attested_only",
      sequence: input.sequence,
      issued_at: input.issued_at,
      expires_at: input.expires_at,
      created_by: input.created_by,
      ledger_registry_sha256: input.ledger_registry_sha256,
      composition_sha256: input.composition_sha256,
      run_sha256: input.run_sha256,
      execution_plan_sha256: input.execution_plan_sha256,
      provider_body_profile: FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
      prepared_adapter_version: FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
      transport: "pi",
      model: input.model,
      endpoint: {
        base_url: endpoint,
        chat_completions_url: `${endpoint}/chat/completions`,
        method: "POST",
        redirect_policy: "error",
        tls_required: true,
      },
      account: {
        provider_id: input.provider_id,
        account_key_id: input.account_key_id,
        credential_key_id: input.credential_key_id,
        auth_scheme: "bearer",
        credential_source: "external_callback_only",
        secret_persistence_allowed: false,
      },
      retry_policy: {
        provider_inner_retries: 0,
        attempt_owner: "formal_run_store",
        provider_idempotency_support: "not_available_for_chat_completions",
        single_consume_dispatch_required: true,
        post_fetch_uncertainty: "unknown_block_no_automatic_retry",
      },
      gates: {
        endpoint_account_attested: true,
        provider_wire_captured: false,
        single_consume_dispatch_proved: false,
        response_capture_proved: false,
        toolchain_capsule_attested: false,
        api_execution_allowed: false,
      },
      signer_key_id: signerInput.key_id,
      signature_algorithm: "ed25519",
      signature_base64: "AA==",
    };
    registry.registry_sha256 = hashFormalOracleTransportRegistry(registry);
    registry.registry_id = `formal-transport-${registry.registry_sha256.slice(0, 16)}`;
    registry.signature_base64 = sign(null, Buffer.from(registry.registry_sha256, "hex"), signer).toString("base64");
    const report = validateFormalOracleTransportRegistry(registry);
    if (!report.valid) throw new Error(`Formal transport registry 无效：${report.issues[0]?.path} ${report.issues[0]?.message}`);
    const bytes = Buffer.from(`${canonicalFormalOracleTransportRegistryDocument(registry)}\n`, "utf8");
    await this.privateFs.withExclusiveLock("locks/transport-registry.lock", "formal-transport-registry", async () => {
      await this.privateFs.publishImmutableObject(`registries/${registry.registry_sha256}`, "registry.json", bytes);
    });
    return registry;
  }

  async loadPinnedRegistry(
    pinnedRegistrySha256: string,
    trustedPublicKeys: ReadonlyMap<string, KeyLike>,
  ): Promise<FormalOracleTransportRegistryV1> {
    return this.privateFs.withExclusiveLock("locks/transport-registry.lock", "formal-transport-registry", () => (
      this.loadPinnedRegistryUnlocked(pinnedRegistrySha256, trustedPublicKeys)
    ));
  }

  async withPinnedRegistry<T>(
    pinnedRegistrySha256: string,
    trustedPublicKeys: ReadonlyMap<string, KeyLike>,
    callback: (registry: FormalOracleTransportRegistryV1) => Promise<T>,
  ): Promise<T> {
    return this.privateFs.withExclusiveLock("locks/transport-registry.lock", "formal-transport-registry", async () => (
      callback(await this.loadPinnedRegistryUnlocked(pinnedRegistrySha256, trustedPublicKeys))
    ));
  }

  private async loadPinnedRegistryUnlocked(
    pinnedRegistrySha256: string,
    trustedPublicKeys: ReadonlyMap<string, KeyLike>,
  ): Promise<FormalOracleTransportRegistryV1> {
    assertPrivateSha256(pinnedRegistrySha256, "pinned transport registry");
    const effectiveAt = new Date().toISOString();
    const bytes = await this.privateFs.readFile(`registries/${pinnedRegistrySha256}/registry.json`);
    const text = bytes.toString("utf8");
    const registry = JSON.parse(text) as FormalOracleTransportRegistryV1;
    if (`${canonicalFormalOracleTransportRegistryDocument(registry)}\n` !== text) throw new Error("Formal transport registry 不是 canonical JSON bytes");
    const report = validateFormalOracleTransportRegistry(registry);
    if (!report.valid) throw new Error(`Formal transport registry 无效：${report.issues[0]?.path} ${report.issues[0]?.message}`);
    if (registry.registry_sha256 !== pinnedRegistrySha256 || registry.registry_id !== `formal-transport-${pinnedRegistrySha256.slice(0, 16)}`
      || hashFormalOracleTransportRegistry(registry) !== pinnedRegistrySha256) throw new Error("Formal transport registry 内容地址不匹配");
    if (Date.parse(effectiveAt) < Date.parse(registry.issued_at) || Date.parse(effectiveAt) >= Date.parse(registry.expires_at)) {
      throw new Error("Formal transport registry 尚未生效或已过期");
    }
    const trusted = trustedPublicKeys.get(registry.signer_key_id);
    if (!trusted) throw new Error("Formal transport registry signer 不在外部 trusted key 集合");
    if (!verify(null, Buffer.from(registry.registry_sha256, "hex"), publicKey(trusted), canonicalSignature(registry.signature_base64))) {
      throw new Error("Formal transport registry Ed25519 签名无效");
    }
    await this.assertNotRevoked(registry, trustedPublicKeys);
    return registry;
  }

  async revokeRegistry(input: {
    registry_sha256: string;
    reason: string;
    revoked_at: string;
  }, signerInput: FormalOracleTransportAuthoritySigner): Promise<FormalOracleTransportRevocationV1> {
    return this.privateFs.withExclusiveLock("locks/transport-registry.lock", "formal-transport-registry", async () => {
      assertPrivateSha256(input.registry_sha256, "transport registry");
      identifier(signerInput.key_id, "signer.key_id");
      const signer = privateKey(signerInput.private_key);
      const registryBytes = await this.privateFs.readFile(`registries/${input.registry_sha256}/registry.json`);
      const registryText = registryBytes.toString("utf8");
      const registry = JSON.parse(registryText) as FormalOracleTransportRegistryV1;
      if (`${canonicalFormalOracleTransportRegistryDocument(registry)}\n` !== registryText
        || !validateFormalOracleTransportRegistry(registry).valid
        || registry.registry_sha256 !== input.registry_sha256
        || hashFormalOracleTransportRegistry(registry) !== input.registry_sha256
        || registry.signer_key_id !== signerInput.key_id
        || !verify(null, Buffer.from(input.registry_sha256, "hex"), createPublicKey(signer), canonicalSignature(registry.signature_base64))) {
        throw new Error("Formal transport revocation signer 未绑定原 registry 签名密钥");
      }
      const revocation: FormalOracleTransportRevocationV1 = {
        schema_version: "formal-oracle-transport-revocation-v1",
        revocation_sha256: "0".repeat(64),
        registry_sha256: input.registry_sha256,
        reason: input.reason,
        revoked_at: input.revoked_at,
        signer_key_id: signerInput.key_id,
        signature_algorithm: "ed25519",
        signature_base64: "AA==",
      };
      revocation.revocation_sha256 = hashFormalOracleTransportRevocation(revocation);
      revocation.signature_base64 = sign(null, Buffer.from(revocation.revocation_sha256, "hex"), signer).toString("base64");
      const report = validateFormalOracleTransportRevocation(revocation);
      if (!report.valid) throw new Error(`Formal transport revocation 无效：${report.issues[0]?.path} ${report.issues[0]?.message}`);
      await this.privateFs.publishImmutableObject(
        `revocations/${input.registry_sha256}`,
        "revocation.json",
        Buffer.from(`${canonicalFormalOracleTransportRevocationDocument(revocation)}\n`, "utf8"),
      );
      return revocation;
    });
  }

  private async assertNotRevoked(registry: FormalOracleTransportRegistryV1, trustedPublicKeys: ReadonlyMap<string, KeyLike>): Promise<void> {
    const bytes = await this.privateFs.readOptionalFile(`revocations/${registry.registry_sha256}/revocation.json`);
    if (!bytes) return;
    const raw = bytes.toString("utf8");
    const revocation = JSON.parse(raw) as FormalOracleTransportRevocationV1;
    if (`${canonicalFormalOracleTransportRevocationDocument(revocation)}\n` !== raw
      || !validateFormalOracleTransportRevocation(revocation).valid
      || revocation.registry_sha256 !== registry.registry_sha256
      || revocation.signer_key_id !== registry.signer_key_id
      || hashFormalOracleTransportRevocation(revocation) !== revocation.revocation_sha256) throw new Error("Formal transport revocation 内容地址无效");
    const trusted = trustedPublicKeys.get(revocation.signer_key_id);
    if (!trusted || !verify(null, Buffer.from(revocation.revocation_sha256, "hex"), publicKey(trusted), canonicalSignature(revocation.signature_base64))) {
      throw new Error("Formal transport revocation 签名无效");
    }
    throw new Error(`Formal transport registry 已撤销：${revocation.reason}`);
  }

}
