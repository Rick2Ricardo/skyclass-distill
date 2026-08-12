import { createHash, createPublicKey, KeyObject, type KeyLike } from "node:crypto";
import type {
  FormalOracleCompositionAttestationV1,
  OracleGateByteInventory,
  OracleGateFormalInputManifest,
  OracleGateFormalSpec,
  OracleGateFrameDerivationPreflightV1,
  SignedGoldDataset,
} from "../../contracts/src/index.js";
import {
  hashFormalOracleCompositionAttestation,
  validateFormalOracleCompositionAttestation,
  validateOracleGateFrameDerivationPreflight,
} from "../../contracts/src/index.js";
import {
  buildFormalOraclePiRequestEnvelope,
  type FormalOraclePiRequestArtifact,
} from "../../contracts/src/oracle-gate-request.js";
import { buildFormalOraclePreparedProviderRequest } from "../../contracts/src/oracle-gate-provider-request.js";
import {
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
  FORMAL_ORACLE_USER_PROMPT_VERSION,
  renderFormalOracleUserPrompt,
} from "../../contracts/src/oracle-gate-user-prompt.js";
import { canonicalizeOracleGateCanvas } from "../../media/src/oracleGateCanvas.js";
import type { OracleGateFrameDeriver } from "../../media/src/videoEvidence.js";
import { FrozenOracleRegistryStore } from "../../store/src/frozenOracleRegistryStore.js";
import {
  FormalOracleRunStore,
  type FormalOracleExecutionPlanV1,
  type FormalOracleHeadPinV1,
} from "../../store/src/formalOracleRunStore.js";
import { GoldLedgerAttestor } from "../../store/src/goldLedgerAttestor.js";
import { prepareOracleGateBytePreflight, type OracleGateBytePreflight } from "./oracleBytePreflight.js";
import { prepareOracleGateFormalStructuralPreflight } from "./oracleFormalPreflight.js";
import { prepareOracleGateFrameDerivationPreflight } from "./oracleFrameDerivationPreflight.js";
import {
  assertActiveOracleLedgerCapability,
  withLedgerAttestedOracleRegistry,
  type OracleLedgerAttestedCapability,
} from "./oracleTrustedPreflight.js";
import type { FormalRunContractV1, RunCheckpointV1 } from "../../contracts/src/oracle-gate-run.js";

export interface FormalOracleExecutionArtifactV1 {
  request_id: string;
  visual_bytes: Uint8Array[];
}

export interface ComposeFormalOracleRunGenesisInput {
  attestor: GoldLedgerAttestor;
  registry_store: FrozenOracleRegistryStore;
  pinned_registry_sha256: string;
  trusted_registry_public_keys: ReadonlyMap<string, KeyLike>;
  root: string;
  dataset: SignedGoldDataset;
  manifest: OracleGateFormalInputManifest;
  spec: OracleGateFormalSpec;
  inventory: OracleGateByteInventory;
  frame_deriver: OracleGateFrameDeriver;
  trusted_speech_reviewer_keys: ReadonlyMap<string, KeyLike>;
  run_store: FormalOracleRunStore;
  run: FormalRunContractV1;
  execution_plan: FormalOracleExecutionPlanV1;
  system_prompt_bytes: Uint8Array;
  user_template_bytes: Uint8Array;
  execution_artifacts: FormalOracleExecutionArtifactV1[];
  expected_genesis_head: FormalOracleHeadPinV1;
  initial_checkpoint: RunCheckpointV1;
  composed_at: string;
}

export interface FormalOracleCompositionCapability {
  readonly stage: "composition_attested_only";
  readonly attestation: Readonly<FormalOracleCompositionAttestationV1>;
  readonly head_pin: Readonly<FormalOracleHeadPinV1>;
  readonly rights_registry_status: "pending_external_authoritative_head";
  readonly request_envelope_serialization_status: "completed";
  readonly provider_body_serialization_status: "completed_pi_body_serialization_candidate";
  readonly provider_body_transport_compatibility_status: "pending_per_request_local_fake_fetch_proof";
  readonly user_prompt_derivation_status: "completed";
  readonly input_token_budget_status: "pending_model_specific_tokenizer";
  readonly provider_wire_binding_status: "pending_external_endpoint_account_validation";
  readonly provider_account_endpoint_status: "pending_external_runtime_binding";
  readonly provider_response_capture_status: "pending_strict_sse_capture_contract";
  readonly provider_runtime_engine_status: "pending_incompatible_node_engine";
  readonly toolchain_capsule_status: "pending_external_immutable_capsule";
  readonly composition_record_authenticity_status: "pending_external_trusted_signature_or_worm";
  readonly external_head_pin_status: "pending_external_monotonic_worm";
  readonly blind_package_status: "pending";
  readonly statistics_status: "pending";
  readonly api_execution_allowed: false;
}

const activeCompositionCapabilities = new WeakSet<object>();

class CompositionCapability implements FormalOracleCompositionCapability {
  readonly stage = "composition_attested_only" as const;
  readonly rights_registry_status = "pending_external_authoritative_head" as const;
  readonly request_envelope_serialization_status = "completed" as const;
  readonly provider_body_serialization_status = "completed_pi_body_serialization_candidate" as const;
  readonly provider_body_transport_compatibility_status = "pending_per_request_local_fake_fetch_proof" as const;
  readonly user_prompt_derivation_status = "completed" as const;
  readonly input_token_budget_status = "pending_model_specific_tokenizer" as const;
  readonly provider_wire_binding_status = "pending_external_endpoint_account_validation" as const;
  readonly provider_account_endpoint_status = "pending_external_runtime_binding" as const;
  readonly provider_response_capture_status = "pending_strict_sse_capture_contract" as const;
  readonly provider_runtime_engine_status = "pending_incompatible_node_engine" as const;
  readonly toolchain_capsule_status = "pending_external_immutable_capsule" as const;
  readonly composition_record_authenticity_status = "pending_external_trusted_signature_or_worm" as const;
  readonly external_head_pin_status = "pending_external_monotonic_worm" as const;
  readonly blind_package_status = "pending" as const;
  readonly statistics_status = "pending" as const;
  readonly api_execution_allowed = false as const;

  constructor(
    readonly attestation: Readonly<FormalOracleCompositionAttestationV1>,
    readonly head_pin: Readonly<FormalOracleHeadPinV1>,
  ) { Object.freeze(this); }

  toJSON(): never {
    throw new Error("Formal Oracle composition capability 是 callback 内临时能力，不得序列化或持久化");
  }
}

export function assertActiveFormalOracleCompositionCapability(value: FormalOracleCompositionCapability): void {
  if (!value || typeof value !== "object" || !activeCompositionCapabilities.has(value as object)) {
    throw new Error("Formal Oracle composition capability 无效、已过期或来自 JSON 伪造");
  }
}

function digest(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalTime(value: string, label: string): void {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${label} 必须是 canonical ISO 时间`);
  }
}

function sameObject(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} 未精确闭合`);
}

function cloneCanonical<T>(value: T, label: string): T {
  let bytes: string;
  try { bytes = JSON.stringify(value); }
  catch { throw new Error(`${label} 不能 canonical snapshot`); }
  if (bytes === undefined) throw new Error(`${label} 不能 canonical snapshot`);
  const cloned = JSON.parse(bytes) as T;
  if (JSON.stringify(cloned) !== bytes) throw new Error(`${label} 不是稳定 JSON snapshot`);
  return deepFreeze(cloned);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function cloneBytes(value: Uint8Array): Uint8Array {
  return Uint8Array.from(value);
}

function cloneExecutionArtifacts(values: FormalOracleExecutionArtifactV1[]): FormalOracleExecutionArtifactV1[] {
  if (!Array.isArray(values) || Object.keys(values).length !== values.length) throw new Error("execution_artifacts 必须是稠密数组");
  return values.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)
      || JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(["request_id", "visual_bytes"])
      || typeof item.request_id !== "string" || !item.request_id
      || !Array.isArray(item.visual_bytes) || Object.keys(item.visual_bytes).length !== item.visual_bytes.length) {
      throw new Error(`execution_artifacts[${index}] 必须使用 strict 字段集合与稠密 visual bytes`);
    }
    return Object.freeze({
      request_id: item.request_id,
      visual_bytes: Object.freeze(item.visual_bytes.map(cloneBytes)),
    });
  }) as FormalOracleExecutionArtifactV1[];
}

function snapshotTrustedKeys(input: ReadonlyMap<string, KeyLike>, label: string): ReadonlyMap<string, KeyLike> {
  const entries = [...input.entries()];
  if (!entries.length) throw new Error(`${label} 不能为空`);
  const keys = new Set<string>();
  const snapshot: Array<[string, KeyObject]> = [];
  for (const [key, value] of entries) {
    if (!/^[a-z0-9][a-z0-9._-]{1,127}$/.test(key) || keys.has(key) || value === null || value === undefined) {
      throw new Error(`${label} key policy 无效`);
    }
    keys.add(key);
    let publicKey: KeyObject;
    try { publicKey = value instanceof KeyObject && value.type === "public" ? value : createPublicKey(value); }
    catch { throw new Error(`${label}.${key} 必须是可解析公钥`); }
    if (publicKey.type !== "public" || publicKey.asymmetricKeyType !== "ed25519") {
      throw new Error(`${label}.${key} 必须是 Ed25519 公钥`);
    }
    const der = publicKey.export({ format: "der", type: "spki" });
    snapshot.push([key, createPublicKey({ key: Buffer.from(der), format: "der", type: "spki" })]);
  }
  return new Map(snapshot);
}

function snapshotCompositionInput(input: ComposeFormalOracleRunGenesisInput): ComposeFormalOracleRunGenesisInput {
  return {
    ...input,
    trusted_registry_public_keys: snapshotTrustedKeys(input.trusted_registry_public_keys, "trusted_registry_public_keys"),
    trusted_speech_reviewer_keys: snapshotTrustedKeys(input.trusted_speech_reviewer_keys, "trusted_speech_reviewer_keys"),
    dataset: cloneCanonical(input.dataset, "dataset"),
    manifest: cloneCanonical(input.manifest, "manifest"),
    spec: cloneCanonical(input.spec, "spec"),
    inventory: cloneCanonical(input.inventory, "inventory"),
    run: cloneCanonical(input.run, "run"),
    execution_plan: cloneCanonical(input.execution_plan, "execution_plan"),
    expected_genesis_head: cloneCanonical(input.expected_genesis_head, "expected_genesis_head"),
    initial_checkpoint: cloneCanonical(input.initial_checkpoint, "initial_checkpoint"),
    system_prompt_bytes: cloneBytes(input.system_prompt_bytes),
    user_template_bytes: cloneBytes(input.user_template_bytes),
    execution_artifacts: cloneExecutionArtifacts(input.execution_artifacts),
    frame_deriver: snapshotFrameDeriver(input.frame_deriver),
  };
}

function snapshotFrameDeriver(input: OracleGateFrameDeriver): OracleGateFrameDeriver {
  if (!input || typeof input !== "object" || typeof input.probe !== "function"
    || typeof input.verify_decodable !== "function" || typeof input.derive_frames !== "function") {
    throw new Error("frame_deriver policy 无效");
  }
  const toolchain = cloneCanonical(input.toolchain, "frame_deriver.toolchain");
  return Object.freeze({
    toolchain,
    probe: input.probe.bind(input),
    verify_decodable: input.verify_decodable.bind(input),
    derive_frames: input.derive_frames.bind(input),
  });
}

function assertCapabilityBindings(input: {
  capability: OracleLedgerAttestedCapability;
  structural: ReturnType<typeof prepareOracleGateFormalStructuralPreflight>;
  manifest: OracleGateFormalInputManifest;
  spec: OracleGateFormalSpec;
  run: FormalRunContractV1;
}): void {
  assertActiveOracleLedgerCapability(input.capability);
  const { capability, structural, manifest, spec, run } = input;
  if (capability.dataset_sha256 !== structural.dataset_sha256
    || capability.dataset_sha256 !== manifest.signed_gold_dataset_sha256
    || capability.dataset_sha256 !== spec.signed_gold_dataset_sha256
    || capability.dataset_sha256 !== run.signed_gold_dataset_sha256) {
    throw new Error("Pinned ledger capability 未绑定同一 Signed Gold dataset");
  }
  if (capability.formal_input_manifest_sha256 !== structural.input_manifest_sha256
    || capability.formal_input_manifest_sha256 !== manifest.manifest_sha256
    || capability.formal_input_manifest_sha256 !== spec.input_manifest_sha256
    || capability.formal_input_manifest_sha256 !== run.formal_input_manifest_sha256) {
    throw new Error("Pinned ledger capability 未绑定同一 formal input manifest");
  }
  if (capability.formal_spec_sha256 !== structural.spec_sha256
    || capability.formal_spec_sha256 !== spec.spec_sha256
    || capability.formal_spec_sha256 !== run.formal_spec_sha256) {
    throw new Error("Pinned ledger capability 未绑定同一 formal spec");
  }
  if (capability.resource_manifest_sha256 !== manifest.resource_manifest_sha256) {
    throw new Error("Pinned ledger capability 未绑定 formal resource manifest");
  }
  if (capability.schedule_sha256 !== structural.schedule_sha256 || capability.schedule_sha256 !== run.schedule_sha256) {
    throw new Error("Pinned ledger capability 未绑定同一 structural schedule");
  }
  if (capability.code_revision !== spec.code_revision || capability.code_revision !== run.code_revision
    || capability.build_artifact_sha256 !== run.build_artifact_sha256
    || capability.registry_sha256 !== run.ledger_registry_sha256) {
    throw new Error("Pinned ledger capability 未绑定 run code/build/registry roots");
  }
  if (capability.case_count !== structural.case_count || capability.event_count !== structural.event_count
    || capability.request_count !== structural.request_count || capability.request_count !== run.request_count) {
    throw new Error("Pinned ledger capability 的 case/event/request 计数漂移");
  }
}

function assertFrameBindings(input: {
  byte_preflight: OracleGateBytePreflight;
  frame_preflight: OracleGateFrameDerivationPreflightV1;
  inventory: OracleGateByteInventory;
  manifest: OracleGateFormalInputManifest;
  spec: OracleGateFormalSpec;
  schedule_sha256: string;
}): void {
  const report = validateOracleGateFrameDerivationPreflight(input.frame_preflight);
  if (!report.valid) throw new Error(`Source-frame preflight 无效：${report.issues[0]}`);
  const { byte_preflight: bytes, frame_preflight: frames, inventory, manifest, spec } = input;
  if (bytes.inventory_sha256 !== inventory.inventory_sha256 || frames.inventory_sha256 !== inventory.inventory_sha256
    || bytes.dataset_sha256 !== frames.signed_gold_dataset_sha256
    || bytes.dataset_sha256 !== manifest.signed_gold_dataset_sha256
    || bytes.input_manifest_sha256 !== frames.input_manifest_sha256
    || bytes.input_manifest_sha256 !== manifest.manifest_sha256
    || bytes.spec_sha256 !== spec.spec_sha256 || bytes.schedule_sha256 !== input.schedule_sha256) {
    throw new Error("Media/ASR/source-frame preflight 根哈希未闭合");
  }
  const inventorySourceById = new Map(inventory.sources.map((item) => [item.source_video_id, item.video]));
  const inventoryCaseById = new Map(inventory.cases.map((item) => [item.case_id, item]));
  const byteCaseById = new Map(bytes.cases.map((item) => [item.case_id, item]));
  if (inventorySourceById.size !== manifest.sources.length || inventoryCaseById.size !== manifest.cases.length
    || byteCaseById.size !== manifest.cases.length || frames.cases.length !== manifest.cases.length) {
    throw new Error("Media/ASR/source-frame case/source 数量未闭合");
  }
  for (const frameCase of frames.cases) {
    const inventoryCase = inventoryCaseById.get(frameCase.case_id);
    const byteCase = byteCaseById.get(frameCase.case_id);
    const formalCase = manifest.cases.find((item) => item.case_id === frameCase.case_id);
    const source = inventorySourceById.get(frameCase.source_video_id);
    if (!inventoryCase || !byteCase || !formalCase || !source
      || inventoryCase.source_video_id !== frameCase.source_video_id
      || byteCase.source_video_id !== frameCase.source_video_id
      || formalCase.source_video_id !== frameCase.source_video_id) {
      throw new Error(`Source-frame case/source/video ID 漂移：${frameCase.case_id}`);
    }
    for (const [role, proof, expected] of [
      ["static_final", frameCase.static_final, inventoryCase.static_final],
      ["uniform_frame", frameCase.uniform_frame, inventoryCase.uniform_frame],
    ] as const) {
      if (proof.case_id !== frameCase.case_id || proof.source_video_id !== frameCase.source_video_id
        || proof.source_video_sha256 !== source.sha256 || proof.video_stream_index !== source.video_stream_index
        || proof.requested_timestamp_us !== expected.timestamp_us
        || proof.ffmpeg_binary_sha256 !== inventory.toolchain.ffmpeg_binary_sha256
        || proof.ffmpeg_version_sha256 !== inventory.toolchain.ffmpeg_version_sha256) {
        throw new Error(`Source-frame proof 未绑定 inventory source/tool/time：${frameCase.case_id}/${role}`);
      }
      sameObject(proof.output, {
        asset_uri: expected.asset_uri,
        sha256: expected.sha256,
        byte_length: expected.byte_length,
        mime_type: expected.mime_type,
        width: expected.width,
        height: expected.height,
        canonical_pixel_sha256: expected.canonical_pixel_sha256,
      }, `Source-frame proof output ${frameCase.case_id}/${role}`);
    }
  }
}

function assertExecutionArtifacts(input: {
  plan: FormalOracleExecutionPlanV1;
  artifacts: FormalOracleExecutionArtifactV1[];
  system_prompt_bytes: Uint8Array;
  spec: OracleGateFormalSpec;
  byte_preflight: OracleGateBytePreflight;
  user_template_bytes: Uint8Array;
}): FormalOraclePiRequestArtifact[] {
  if (digest(input.system_prompt_bytes) !== input.spec.prompt.system_sha256) {
    throw new Error("System prompt bytes 未绑定 formal spec hash");
  }
  if (digest(input.user_template_bytes) !== input.spec.prompt.user_template_sha256) {
    throw new Error("User template bytes 未绑定 formal spec hash");
  }
  if (!Array.isArray(input.artifacts) || Object.keys(input.artifacts).length !== input.artifacts.length
    || input.artifacts.length !== input.plan.items.length) {
    throw new Error("Execution artifacts 必须稠密且精确覆盖 execution plan");
  }
  const verifiedByCase = new Map(input.byte_preflight.cases.map((item) => [item.case_id, item]));
  return input.plan.items.map((planItem, index) => {
    const artifact = input.artifacts[index];
    if (!artifact || artifact.request_id !== planItem.request_id
      || planItem.system_prompt_sha256 !== input.spec.prompt.system_sha256) {
      throw new Error(`Execution artifact bytes/hash/request ID 漂移：${planItem.request_id}`);
    }
    if (!Array.isArray(artifact.visual_bytes) || Object.keys(artifact.visual_bytes).length !== artifact.visual_bytes.length
      || artifact.visual_bytes.length !== planItem.visuals.length) {
      throw new Error(`Execution visual artifact 数量漂移：${planItem.request_id}`);
    }
    if (planItem.arm !== "transcript_only") {
      const verified = verifiedByCase.get(planItem.case_id);
      if (!verified) throw new Error(`Execution plan case 不在 verified media 中：${planItem.case_id}`);
      const sourceBytes = planItem.arm === "static_final_board" ? verified.static_final.bytes
        : planItem.arm === "uniform_frame" ? verified.uniform_frame.bytes
          : verified.oracle_comparison.bytes;
      const expectedCanvas = canonicalizeOracleGateCanvas(sourceBytes, planItem.arm);
      const actualBytes = Buffer.from(artifact.visual_bytes[0]);
      const visual = planItem.visuals[0];
      if (!visual || !actualBytes.equals(expectedCanvas.bytes) || digest(actualBytes) !== visual.sha256
        || visual.sha256 !== expectedCanvas.sha256 || visual.byte_length !== expectedCanvas.bytes.byteLength
        || visual.mime_type !== expectedCanvas.mime_type || visual.width !== expectedCanvas.width
        || visual.height !== expectedCanvas.height) {
        throw new Error(`Execution visual bytes 未绑定 verified case/arm/canonical canvas：${planItem.request_id}`);
      }
    }
    const verifiedCase = verifiedByCase.get(planItem.case_id);
    if (!verifiedCase) throw new Error(`Execution plan case 不在 verified media 中：${planItem.case_id}`);
    const transcriptBytes = Buffer.from(verifiedCase.speech.selected_transcript, "utf8");
    const userPrompt = renderFormalOracleUserPrompt({
      prompt_version: input.spec.prompt.version,
      user_template_bytes: input.user_template_bytes,
      expected_user_template_sha256: input.spec.prompt.user_template_sha256,
      selected_transcript_bytes: transcriptBytes,
      expected_selected_transcript_sha256: verifiedCase.speech.selected_transcript_sha256,
      expected_selected_transcript_byte_length: verifiedCase.speech.selected_transcript_byte_length,
      visual_input_available: planItem.arm !== "transcript_only",
      output_schema_sha256: planItem.output_schema_sha256,
    });
    if (input.spec.prompt.version !== FORMAL_ORACLE_USER_PROMPT_VERSION
      || input.spec.prompt.user_template_sha256 !== FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256
      || userPrompt.prompt_sha256 !== planItem.user_prompt_sha256) {
      throw new Error(`Rendered user prompt 未绑定 deterministic renderer/execution plan：${planItem.request_id}`);
    }
    const built = buildFormalOraclePiRequestEnvelope({
      request_id: planItem.request_id, schedule_index: planItem.schedule_index, case_id: planItem.case_id, arm: planItem.arm,
      model: planItem.model, system_prompt_bytes: input.system_prompt_bytes, expected_system_prompt_sha256: planItem.system_prompt_sha256,
      user_prompt: userPrompt, expected_rendered_user_prompt_sha256: planItem.user_prompt_sha256,
      expected_user_template_sha256: input.spec.prompt.user_template_sha256,
      output_schema_sha256: planItem.output_schema_sha256,
      visuals: planItem.visuals.map((visual, visualIndex) => ({
        label: visual.label, mime_type: visual.mime_type, bytes: artifact.visual_bytes[visualIndex],
        expected_sha256: visual.sha256, expected_byte_length: visual.byte_length,
      })),
      seed: planItem.seed, temperature: planItem.temperature, max_input_tokens: planItem.max_input_tokens,
      max_output_tokens: planItem.max_output_tokens, timeout_ms: planItem.timeout_ms, max_attempts: planItem.max_attempts,
      transport: planItem.transport, cache_retention: planItem.cache_retention, tools_policy: planItem.tools_policy,
    });
    const prepared = buildFormalOraclePreparedProviderRequest(built);
    if (built.payload_sha256 !== planItem.request_envelope_sha256
      || prepared.provider_body_sha256 !== planItem.provider_body_sha256
      || prepared.provider_body_profile !== planItem.provider_body_profile
      || prepared.provider_body_dispatch_status !== planItem.provider_body_dispatch_status
      || prepared.adapter_version !== planItem.prepared_adapter_version
      || prepared.token_field !== planItem.provider_token_field) {
      throw new Error(`Built request envelope/provider body 双 hash 未绑定 execution plan：${planItem.request_id}`);
    }
    return built;
  });
}

/**
 * Composes all currently implemented Formal Oracle preconditions under the
 * pinned registry + current ledger callback and atomically creates the run-store
 * genesis HEAD. It never imports or invokes an LLM/API client and never returns
 * an execution token. The returned genesis pin still must be durably retained
 * by a separate monotonic/WORM authority before any future execution gate.
 * The execution plan binds a strict canonical future-adapter envelope covering
 * model/prompt/visual/seed/budget/retry policy. The deterministic user prompt
 * is derived here from the fixed grammar and byte-preflight transcript.
 * This envelope is not provider wire bytes; adapter/account/endpoint are pending.
 */
export async function withComposedFormalOracleRunGenesis<T>(
  rawInput: ComposeFormalOracleRunGenesisInput & {
    callback: (capability: FormalOracleCompositionCapability) => Promise<T>;
  },
): Promise<T> {
  const callback = rawInput.callback;
  if (typeof callback !== "function") throw new Error("composition callback 必须是函数");
  const input = snapshotCompositionInput(rawInput);
  canonicalTime(input.composed_at, "composed_at");
  return withLedgerAttestedOracleRegistry({
    attestor: input.attestor,
    registryStore: input.registry_store,
    pinned_registry_sha256: input.pinned_registry_sha256,
    trusted_public_keys: input.trusted_registry_public_keys,
    callback: async (capability) => {
      const structural = prepareOracleGateFormalStructuralPreflight({
        dataset: input.dataset,
        manifest: input.manifest,
        spec: input.spec,
      });
      assertCapabilityBindings({ capability, structural, manifest: input.manifest, spec: input.spec, run: input.run });
      const bytePreflight = await prepareOracleGateBytePreflight({
        root: input.root,
        dataset: input.dataset,
        manifest: input.manifest,
        spec: input.spec,
        inventory: input.inventory,
        video_probe: input.frame_deriver,
        trusted_speech_reviewer_keys: input.trusted_speech_reviewer_keys,
      });
      const framePreflight = await prepareOracleGateFrameDerivationPreflight({
        root: input.root,
        dataset: input.dataset,
        manifest: input.manifest,
        spec: input.spec,
        inventory: input.inventory,
        frame_deriver: input.frame_deriver,
        trusted_speech_reviewer_keys: input.trusted_speech_reviewer_keys,
      });
      assertFrameBindings({
        byte_preflight: bytePreflight,
        frame_preflight: framePreflight,
        inventory: input.inventory,
        manifest: input.manifest,
        spec: input.spec,
        schedule_sha256: structural.schedule_sha256,
      });
      assertExecutionArtifacts({
        plan: input.execution_plan,
        artifacts: input.execution_artifacts,
        system_prompt_bytes: input.system_prompt_bytes,
        user_template_bytes: input.user_template_bytes,
        spec: input.spec,
        byte_preflight: bytePreflight,
      });
      if (input.run.media_attestation_sha256 !== framePreflight.preflight_sha256
        || input.run.speech_attestation_sha256 !== input.inventory.inventory_sha256
        || input.run.execution_plan_sha256 !== input.execution_plan.execution_plan_sha256
        || Date.parse(input.composed_at) < Date.parse(input.initial_checkpoint.created_at)) {
        throw new Error("Run media/speech/execution plan/time roots 未绑定当前 composition");
      }

      const attestation: FormalOracleCompositionAttestationV1 = {
        schema_version: "formal-oracle-composition-attestation-v1",
        composition_sha256: "0".repeat(64),
        record_trust: "non_authoritative_composition_record",
        status: "composition_attested_only",
        composed_at: input.composed_at,
        ledger_registry_sha256: capability.registry_sha256,
        ledger_snapshot_sha256: capability.ledger_snapshot_sha256,
        signed_gold_dataset_sha256: capability.dataset_sha256,
        formal_input_manifest_sha256: capability.formal_input_manifest_sha256,
        formal_spec_sha256: capability.formal_spec_sha256,
        resource_manifest_sha256: capability.resource_manifest_sha256,
        schedule_sha256: capability.schedule_sha256,
        code_revision: capability.code_revision,
        build_artifact_sha256: capability.build_artifact_sha256,
        byte_inventory_sha256: input.inventory.inventory_sha256,
        source_frame_preflight_sha256: framePreflight.preflight_sha256,
        source_frame_proof_set_sha256: framePreflight.proof_set_sha256,
        media_attestation_sha256: framePreflight.preflight_sha256,
        speech_attestation_sha256: input.inventory.inventory_sha256,
        run_sha256: input.run.run_sha256,
        execution_plan_sha256: input.execution_plan.execution_plan_sha256,
        genesis_checkpoint_sha256: input.initial_checkpoint.checkpoint_sha256,
        genesis_generation: 0,
        head_pin: {
          schema_version: "formal-oracle-head-pin-v1",
          run_sha256: input.expected_genesis_head.run_sha256,
          generation: 0,
          checkpoint_sha256: input.expected_genesis_head.checkpoint_sha256,
        },
        run_store_uri: input.run.run_store_uri,
        rights_registry_status: "pending_external_authoritative_head",
        request_envelope_serialization_status: "completed",
        provider_body_serialization_status: "completed_pi_body_serialization_candidate",
        provider_body_transport_compatibility_status: "pending_per_request_local_fake_fetch_proof",
        user_prompt_derivation_status: "completed",
        input_token_budget_status: "pending_model_specific_tokenizer",
        provider_wire_binding_status: "pending_external_endpoint_account_validation",
        provider_account_endpoint_status: "pending_external_runtime_binding",
        provider_response_capture_status: "pending_strict_sse_capture_contract",
        provider_runtime_engine_status: "pending_incompatible_node_engine",
        toolchain_capsule_status: "pending_external_immutable_capsule",
        composition_record_authenticity_status: "pending_external_trusted_signature_or_worm",
        external_head_pin_status: "pending_external_monotonic_worm",
        blind_package_status: "pending",
        statistics_status: "pending",
        api_execution_allowed: false,
      };
      attestation.composition_sha256 = hashFormalOracleCompositionAttestation(attestation);
      const attestationReport = validateFormalOracleCompositionAttestation(attestation);
      if (!attestationReport.valid) throw new Error(`Composition attestation 无效：${attestationReport.issues[0]?.path} ${attestationReport.issues[0]?.message}`);

      return input.run_store.createSealedRunWithPinnedSnapshot({
        run: input.run,
        formal_spec: input.spec,
        structural_schedule: structural.schedule,
        execution_plan: input.execution_plan,
        initial_checkpoint: input.initial_checkpoint,
      }, input.expected_genesis_head, async (lockedSnapshot) => {
        if (lockedSnapshot.head_pin.generation !== 0
          || lockedSnapshot.head_pin.run_sha256 !== input.run.run_sha256
          || lockedSnapshot.head_pin.checkpoint_sha256 !== input.initial_checkpoint.checkpoint_sha256
          || lockedSnapshot.checkpoint.run_state !== "SEALED_READY"
          || lockedSnapshot.checkpoint.entries.some((entry) => entry.state !== "PENDING"
            || entry.resume_action !== "dispatch_new_attempt" || entry.attempts_used !== 0
            || entry.active_intent_sha256 !== null || entry.latest_attempt_audit_sha256 !== null
            || entry.committed_request_sha256 !== null)
          || lockedSnapshot.api_execution_allowed !== false) {
          throw new Error("Run-store genesis HEAD/state/provenance 未精确绑定 composition");
        }
        sameObject(lockedSnapshot.head_pin, attestation.head_pin, "Composition actual HEAD pin");
        const compositionCapability = new CompositionCapability(
          deepFreeze(attestation),
          Object.freeze({ ...lockedSnapshot.head_pin }),
        );
        activeCompositionCapabilities.add(compositionCapability);
        try {
          return await callback(compositionCapability);
        } finally {
          activeCompositionCapabilities.delete(compositionCapability);
        }
      });
    },
  });
}
