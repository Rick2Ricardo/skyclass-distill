import { createHash, createHmac, createPublicKey, KeyObject, type KeyLike } from "node:crypto";
import {
  canonicalOracleGateJson,
  hashOracleGateEvidenceProjectionV2,
  hashOracleGatePrivateEvidenceDerivationReceiptV2,
  hashOracleGatePublicEvidenceItemV2,
  hashOracleGatePublicEvidencePackageV2,
  hashOracleGateUnderlyingEvidenceDenominatorV2,
  hashPrivateAnswerKey,
  hashPublicBlindPackage,
  hashPublicBlindResponse,
  hashFormalOracleBlindingSecretCommitment,
  canonicalFormalOracleBlindIdPreimage,
  projectOracleGateResponseClaimsV2,
  renderSignedGoldFinalEventEvidenceV2,
  validateCompletedFormalRunArtifactChain,
  validateOracleGateEvidenceV2AgainstBlindArtifacts,
  validateOracleGatePublicEvidenceDerivationPolicyV2,
  type OracleGateByteInventory,
  type OracleGateFormalInputManifest,
  type OracleGateFormalSpec,
  type OracleGatePrivateEvidenceDerivationItemV2,
  type OracleGatePrivateEvidenceDerivationReceiptV2,
  type OracleGatePublicEvidenceDerivationPolicyV2,
  type OracleGatePublicEvidenceItemV2,
  type OracleGatePublicEvidencePackageV2,
  type OracleGateResponseV1,
  type PrivateAnswerKeyV1,
  type PublicBlindPackageV1,
  type SignedGoldDataset,
} from "../../contracts/src/index.js";
import type { OracleGateFrameDeriver } from "../../media/src/videoEvidence.js";
import { FrozenOracleRegistryStore } from "../../store/src/frozenOracleRegistryStore.js";
import {
  assertActiveFormalOracleCompletedRunCapability,
  FormalOracleRunStore,
  type FormalOracleCompletedTransportSchemaRunV1,
  type FormalOracleHeadPinV1,
} from "../../store/src/formalOracleRunStore.js";
import { GoldLedgerAttestor } from "../../store/src/goldLedgerAttestor.js";
import { prepareOracleGateBytePreflight, type OracleGateBytePreflight } from "./oracleBytePreflight.js";
import { prepareOracleGateFormalStructuralPreflight } from "./oracleFormalPreflight.js";
import { prepareOracleGateFrameDerivationPreflight } from "./oracleFrameDerivationPreflight.js";
import { assertActiveOracleLedgerCapability, withLedgerAttestedOracleRegistry } from "./oracleTrustedPreflight.js";

const PUBLIC_UNIT_ID_DOMAIN = "skyclass/formal-oracle/public-evidence-opaque-id/v2\0";
const activeCapabilities = new WeakSet<object>();

export interface FormalOraclePostRunEvidenceCapabilityV1 {
  readonly stage: "post_run_evidence_sources_revalidated";
  readonly evidence_scope: "post_hoc_development_only";
  readonly public_responses: Readonly<PublicBlindPackageV1>;
  readonly private_answer_key: Readonly<PrivateAnswerKeyV1>;
  readonly public_evidence: Readonly<OracleGatePublicEvidencePackageV2>;
  readonly private_derivation: Readonly<OracleGatePrivateEvidenceDerivationReceiptV2>;
  readonly source_authenticity_status: "runtime_registry_gold_media_run_revalidated_external_worm_pending";
  readonly content_privacy_status: "pending_external_restricted_review";
  readonly rating_status: "not_generated";
  readonly statistics_status: "not_generated";
  readonly api_execution_allowed: false;
}

class PostRunEvidenceCapability implements FormalOraclePostRunEvidenceCapabilityV1 {
  readonly stage = "post_run_evidence_sources_revalidated" as const;
  readonly evidence_scope = "post_hoc_development_only" as const;
  readonly source_authenticity_status = "runtime_registry_gold_media_run_revalidated_external_worm_pending" as const;
  readonly content_privacy_status = "pending_external_restricted_review" as const;
  readonly rating_status = "not_generated" as const;
  readonly statistics_status = "not_generated" as const;
  readonly api_execution_allowed = false as const;
  constructor(
    readonly public_responses: Readonly<PublicBlindPackageV1>,
    readonly private_answer_key: Readonly<PrivateAnswerKeyV1>,
    readonly public_evidence: Readonly<OracleGatePublicEvidencePackageV2>,
    readonly private_derivation: Readonly<OracleGatePrivateEvidenceDerivationReceiptV2>,
  ) { Object.freeze(this); }
  toJSON(): never { throw new Error("post-run evidence capability 是 callback 内临时能力，不得序列化或持久化"); }
}

export function assertActiveFormalOraclePostRunEvidenceCapability(value: FormalOraclePostRunEvidenceCapabilityV1): void {
  if (!value || typeof value !== "object" || !activeCapabilities.has(value as object)) {
    throw new Error("post-run evidence capability 无效、已过期或来自 JSON 伪造");
  }
}

function digest(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function canonicalTime(value: string, label: string): void {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw new Error(`${label} 必须是 canonical ISO time`);
}
function safeClone<T>(value: T, label: string): T {
  const clone = (input: unknown, path: string): unknown => {
    if (input === null || typeof input === "string" || typeof input === "boolean") return input;
    if (typeof input === "number") {
      if (!Number.isFinite(input) || Object.is(input, -0)) throw new Error(`${label}${path} 数值无效`);
      return input;
    }
    if (!input || typeof input !== "object") throw new Error(`${label}${path} 不是 plain data`);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Array.isArray(input)) {
      if (Object.getPrototypeOf(input) !== Array.prototype || Object.getOwnPropertySymbols(input).length) throw new Error(`${label}${path} 不是 plain array`);
      const keys = Object.keys(descriptors).filter((key) => key !== "length");
      if (keys.length !== input.length || keys.some((key, index) => key !== String(index))) throw new Error(`${label}${path} 是稀疏数组`);
      return keys.map((key) => {
        const d = descriptors[key]; if (!d || !("value" in d) || !d.enumerable) throw new Error(`${label}${path} 含 accessor`);
        return clone(d.value, `${path}[${key}]`);
      });
    }
    if (Object.getPrototypeOf(input) !== Object.prototype || Object.getOwnPropertySymbols(input).length || Object.hasOwn(input, "toJSON")) throw new Error(`${label}${path} 不是 plain object`);
    const output: Record<string, unknown> = {};
    for (const [key, d] of Object.entries(descriptors)) {
      if (!("value" in d) || !d.enumerable) throw new Error(`${label}${path}.${key} 含 accessor/隐藏字段`);
      output[key] = clone(d.value, `${path}.${key}`);
    }
    return output;
  };
  return clone(value, "") as T;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function ownDataEnvelope<T extends object>(value: T, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype
    || Object.getOwnPropertySymbols(value).length || Object.hasOwn(value, "toJSON")) throw new Error(`${label} 必须是 plain data envelope`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (JSON.stringify(Object.keys(descriptors).sort()) !== JSON.stringify([...fields].sort())
    || Object.values(descriptors).some((descriptor) => !("value" in descriptor) || !descriptor.enumerable)) {
    throw new Error(`${label} 字段无效或含 accessor/隐藏字段`);
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key,
    (descriptor as PropertyDescriptor & { value: unknown }).value]));
}
function trustedKeySnapshot(input: ReadonlyMap<string, KeyLike>, label: string): ReadonlyMap<string, KeyLike> {
  if (!(input instanceof Map) || !input.size) throw new Error(`${label} 不能为空`);
  const output = new Map<string, KeyObject>();
  for (const [id, raw] of input) {
    if (!id || output.has(id)) throw new Error(`${label} key id 无效或重复`);
    const key = raw instanceof KeyObject ? raw : createPublicKey(raw);
    if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") throw new Error(`${label}.${id} 必须是 Ed25519 public key`);
    output.set(id, createPublicKey({ key: Buffer.from(key.export({ format: "der", type: "spki" })), format: "der", type: "spki" }));
  }
  return output;
}
function opaqueId(blindId: string, kind: string, index: number): string {
  return `u_${digest(`${PUBLIC_UNIT_ID_DOMAIN}${canonicalOracleGateJson({ blind_id: blindId, kind, index })}`)}`;
}

function buildBlindArtifacts(input: {
  completed: Readonly<FormalOracleCompletedTransportSchemaRunV1>;
  manifest: OracleGateFormalInputManifest;
  secret: Uint8Array;
  created_at: string;
}): { public_responses: PublicBlindPackageV1; private_answer_key: PrivateAnswerKeyV1 } {
  const secretCommitment = hashFormalOracleBlindingSecretCommitment(input.secret);
  if (secretCommitment !== input.completed.run.blinding_secret_commitment_sha256) throw new Error("blinding secret commitment 未绑定 run");
  const sourceById = new Map(input.manifest.sources.map((source) => [source.source_video_id, source]));
  const responseBySchedule = new Map(input.completed.canonical_responses.map((item) => [item.schedule_index, item]));
  const items: PublicBlindPackageV1["items"] = [];
  const entries: PrivateAnswerKeyV1["entries"] = [];
  for (const [index, scheduled] of input.completed.structural_schedule.entries()) {
    const response = responseBySchedule.get(index);
    const source = sourceById.get(scheduled.source_video_id);
    if (!response || response.request_id !== scheduled.request_id || !source) throw new Error(`schedule ${index} 未闭合 durable response/source`);
    const preimage = canonicalFormalOracleBlindIdPreimage({ run_sha256: input.completed.run.run_sha256, request_id: scheduled.request_id });
    const blindId = `B-${createHmac("sha256", input.secret).update(preimage).digest("hex")}`;
    if (hashPublicBlindResponse(response.response as Record<string, unknown>) !== response.canonical_response_commitment_sha256) throw new Error(`schedule ${index} durable D commitment 漂移`);
    items.push({ blind_id: blindId, response: response.response as Record<string, unknown>, response_sha256: response.canonical_response_commitment_sha256 });
    entries.push({ blind_id: blindId, request_id: scheduled.request_id, idempotency_key: scheduled.idempotency_key,
      case_id: scheduled.case_id, arm: scheduled.arm, seed: scheduled.seed, teacher_id: source.teacher_id,
      source_video_id: scheduled.source_video_id, window_id: scheduled.group_id, response_sha256: response.canonical_response_commitment_sha256 });
  }
  const publicResponses: PublicBlindPackageV1 = { schema_version: "oracle-gate-public-blind-package-v1", package_sha256: "0".repeat(64),
    run_commitment_sha256: input.completed.run.run_sha256, rubric_version: input.completed.formal_spec.evaluation.rubric_version,
    rubric_sha256: input.completed.formal_spec.evaluation.rubric_sha256, blinding_statement: "metadata_blinded_no_pairing_exposed",
    item_count: items.length, items };
  publicResponses.package_sha256 = hashPublicBlindPackage(publicResponses);
  const answerKey: PrivateAnswerKeyV1 = { schema_version: "oracle-gate-private-answer-key-v1", answer_key_sha256: "0".repeat(64),
    run_sha256: input.completed.run.run_sha256, public_package_sha256: publicResponses.package_sha256,
    blind_secret_commitment_sha256: secretCommitment, blinding_scheme: "hmac-sha256-run-request-v1", created_at: input.created_at, entries };
  answerKey.answer_key_sha256 = hashPrivateAnswerKey(answerKey);
  return { public_responses: publicResponses, private_answer_key: answerKey };
}

function buildEvidence(input: {
  policy: OracleGatePublicEvidenceDerivationPolicyV2;
  completed: Readonly<FormalOracleCompletedTransportSchemaRunV1>;
  manifest: OracleGateFormalInputManifest;
  byte: OracleGateBytePreflight;
  public_responses: PublicBlindPackageV1;
  private_answer_key: PrivateAnswerKeyV1;
  dataset: Readonly<SignedGoldDataset>;
  registry_sha256: string;
  frame_preflight_sha256: string;
  inventory_sha256: string;
}): { public_evidence: OracleGatePublicEvidencePackageV2; private_derivation: OracleGatePrivateEvidenceDerivationReceiptV2 } {
  const byteCaseById = new Map(input.byte.cases.map((item) => [item.case_id, item]));
  const manifestCaseById = new Map(input.manifest.cases.map((item) => [item.case_id, item]));
  const answerByBlind = new Map(input.private_answer_key.entries.map((item) => [item.blind_id, item]));
  const publicItems: OracleGatePublicEvidenceItemV2[] = [];
  const privateItems: OracleGatePrivateEvidenceDerivationItemV2[] = [];
  for (const responseItem of input.public_responses.items) {
    const answer = answerByBlind.get(responseItem.blind_id);
    if (!answer) throw new Error(`blind ${responseItem.blind_id} 缺少 answer mapping`);
    const formalCase = manifestCaseById.get(answer.case_id), byteCase = byteCaseById.get(answer.case_id);
    const packageIndex = input.dataset.packages.findIndex((item) => item.package_id === formalCase?.package_id);
    const groupIndex = packageIndex < 0 ? -1 : input.dataset.packages[packageIndex].groups.findIndex((item) => item.group_id === formalCase?.group_id);
    const goldPackage = packageIndex < 0 ? undefined : input.dataset.packages[packageIndex];
    const group = !goldPackage || groupIndex < 0 ? undefined : goldPackage.groups[groupIndex];
    if (!formalCase || !byteCase || !group || formalCase.source_video_id !== answer.source_video_id
      || byteCase.source_video_id !== formalCase.source_video_id || goldPackage?.source_video_id !== formalCase.source_video_id
      || canonicalOracleGateJson(formalCase.event_ids) !== canonicalOracleGateJson(group.final_events.map((event) => event.event_id))) {
      throw new Error(`case ${answer.case_id} 未闭合 manifest/byte/current Signed Gold group`);
    }
    const projectedClaims = projectOracleGateResponseClaimsV2(responseItem.response as unknown as OracleGateResponseV1);
    const claimUnits = projectedClaims.map((claim, index) => ({ claim_id: opaqueId(answer.blind_id, "claim", index), claim_index: index, content: claim.content }));
    const speechPointer = `/byte_preflight/cases/${input.byte.cases.findIndex((item) => item.case_id === answer.case_id)}/speech/selected_transcript`;
    const eventPointers = group.final_events.map((_, index) => `/signed_gold_dataset/packages/${packageIndex}/groups/${groupIndex}/final_events/${index}`);
    const evidenceContents = [byteCase.speech.selected_transcript, ...group.final_events.map(renderSignedGoldFinalEventEvidenceV2)];
    const evidenceUnits = evidenceContents.map((content, index) => ({ unit_id: opaqueId(answer.blind_id, "evidence", index),
      kind: index === 0 ? "verified_speech_context" as const : "signed_gold_board_event" as const, sequence_index: index, content }));
    const temporalPairs: OracleGatePublicEvidenceItemV2["temporal_pairs"] = [];
    const temporalSources: OracleGatePrivateEvidenceDerivationItemV2["temporal_sources"] = [];
    let pairIndex = 0;
    for (let before = 1; before < evidenceUnits.length; before += 1) for (let after = before + 1; after < evidenceUnits.length; after += 1) {
      const pairId = opaqueId(answer.blind_id, "pair", pairIndex++);
      temporalPairs.push({ pair_id: pairId, before_unit_id: evidenceUnits[before].unit_id, after_unit_id: evidenceUnits[after].unit_id });
      temporalSources.push({ public_pair_id: pairId, before_source_json_pointer: eventPointers[before - 1], after_source_json_pointer: eventPointers[after - 1] });
    }
    const item: OracleGatePublicEvidenceItemV2 = { blind_id: answer.blind_id, response_sha256: responseItem.response_sha256,
      claim_units: claimUnits, evidence_units: evidenceUnits, eligible_evidence_unit_ids: evidenceUnits.map((unit) => unit.unit_id),
      board_edit_unit_ids: evidenceUnits.slice(1).map((unit) => unit.unit_id),
      temporal_metric_status: group.final_events.length === 1 ? "not_applicable_single_event" : "eligible_multi_edit", temporal_pairs: temporalPairs };
    const evidenceSources: OracleGatePrivateEvidenceDerivationItemV2["evidence_sources"] = evidenceUnits.map((unit, index) => ({
      public_unit_id: unit.unit_id, source_kind: index === 0 ? "verified_selected_transcript" : "signed_gold_final_event",
      source_json_pointer: index === 0 ? speechPointer : eventPointers[index - 1], projected_value_sha256: hashOracleGateEvidenceProjectionV2(unit.content),
    }));
    const privateItem: OracleGatePrivateEvidenceDerivationItemV2 = { blind_id: answer.blind_id, response_sha256: responseItem.response_sha256,
      public_evidence_item_sha256: hashOracleGatePublicEvidenceItemV2(item), case_id: answer.case_id, seed: answer.seed,
      claim_sources: projectedClaims.map((claim, index) => ({ public_claim_id: claimUnits[index].claim_id,
        response_json_pointer: claim.pointer, projected_value_sha256: hashOracleGateEvidenceProjectionV2(claim.content) })),
      evidence_sources: evidenceSources, temporal_sources: temporalSources, underlying_evidence_denominator_sha256: hashOracleGateUnderlyingEvidenceDenominatorV2({
        public_evidence_derivation_policy_sha256: input.policy.public_evidence_derivation_policy_sha256,
        evidence_sources: evidenceSources.map(({ source_kind, source_json_pointer, projected_value_sha256 }) => ({ source_kind, source_json_pointer, projected_value_sha256 })),
        temporal_sources: temporalSources.map(({ before_source_json_pointer, after_source_json_pointer }) => ({ before_source_json_pointer, after_source_json_pointer })),
      }) };
    publicItems.push(item); privateItems.push(privateItem);
  }
  const publicEvidence: OracleGatePublicEvidencePackageV2 = { schema_version: "oracle-gate-public-evidence-package-v2", evidence_package_sha256: "0".repeat(64),
    record_trust: "non_authoritative_public_blind_evidence_record", public_response_package_sha256: input.public_responses.package_sha256,
    public_evidence_derivation_policy_sha256: input.policy.public_evidence_derivation_policy_sha256,
    rubric_version: input.public_responses.rubric_version, rubric_sha256: input.public_responses.rubric_sha256,
    blinding_statement: "opaque_item_local_ids_only_content_privacy_pending_external_review",
    distribution_independence_status: "pending_external_randomized_independent_sessions", item_count: publicItems.length, items: publicItems, api_execution_allowed: false };
  publicEvidence.evidence_package_sha256 = hashOracleGatePublicEvidencePackageV2(publicEvidence);
  const receipt: OracleGatePrivateEvidenceDerivationReceiptV2 = { schema_version: "oracle-gate-private-evidence-derivation-receipt-v2", derivation_receipt_sha256: "0".repeat(64),
    record_trust: "non_authoritative_until_post_run_source_gate_and_external_worm", evidence_scope: "post_hoc_development_only",
    run_sha256: input.completed.run.run_sha256, terminal_checkpoint_sha256: input.completed.head_pin.checkpoint_sha256,
    public_response_package_sha256: input.public_responses.package_sha256, private_answer_key_sha256: input.private_answer_key.answer_key_sha256,
    public_evidence_package_sha256: publicEvidence.evidence_package_sha256, public_evidence_derivation_policy_sha256: input.policy.public_evidence_derivation_policy_sha256,
    ledger_registry_sha256: input.registry_sha256, signed_gold_dataset_sha256: input.dataset.dataset_sha256,
    formal_input_manifest_sha256: input.manifest.manifest_sha256, formal_spec_sha256: input.completed.formal_spec.spec_sha256,
    schedule_sha256: input.completed.run.schedule_sha256, execution_plan_sha256: input.completed.execution_plan.execution_plan_sha256,
    verified_byte_inventory_sha256: input.inventory_sha256, frame_derivation_preflight_sha256: input.frame_preflight_sha256,
    rubric_sha256: input.public_responses.rubric_sha256, rights_publication_status: "pending_authoritative_resource_active_head",
    item_count: privateItems.length, items: privateItems, api_execution_allowed: false };
  receipt.derivation_receipt_sha256 = hashOracleGatePrivateEvidenceDerivationReceiptV2(receipt);
  return { public_evidence: publicEvidence, private_derivation: receipt };
}

/** Pure deterministic record derivation. These records remain explicitly
 * non-authoritative; only withPostRunOracleEvidenceSources can lend a runtime
 * source-revalidated callback capability. */
export function deriveNonAuthoritativeFormalOraclePostRunEvidenceRecordsV1(input: {
  policy: OracleGatePublicEvidenceDerivationPolicyV2;
  completed_run: Readonly<FormalOracleCompletedTransportSchemaRunV1>;
  manifest: OracleGateFormalInputManifest;
  byte_preflight: OracleGateBytePreflight;
  dataset: Readonly<SignedGoldDataset>;
  registry_sha256: string;
  frame_preflight_sha256: string;
  inventory_sha256: string;
  blinding_secret: Uint8Array;
  derived_at: string;
}): {
  public_responses: PublicBlindPackageV1;
  private_answer_key: PrivateAnswerKeyV1;
  public_evidence: OracleGatePublicEvidencePackageV2;
  private_derivation: OracleGatePrivateEvidenceDerivationReceiptV2;
} {
  const raw = ownDataEnvelope(input, ["policy", "completed_run", "manifest", "byte_preflight", "dataset", "registry_sha256",
    "frame_preflight_sha256", "inventory_sha256", "blinding_secret", "derived_at"], "post-run evidence record input");
  if (typeof raw.registry_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.registry_sha256)
    || typeof raw.frame_preflight_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.frame_preflight_sha256)
    || typeof raw.inventory_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.inventory_sha256)
    || typeof raw.derived_at !== "string") throw new Error("post-run evidence record roots/time 无效");
  canonicalTime(raw.derived_at, "derived_at");
  if (!(raw.blinding_secret instanceof Uint8Array) || Object.getPrototypeOf(raw.blinding_secret) !== Uint8Array.prototype) {
    throw new Error("blinding_secret 必须是 Uint8Array");
  }
  const policy = deepFreeze(safeClone(raw.policy as OracleGatePublicEvidenceDerivationPolicyV2, "policy"));
  const completed = deepFreeze(safeClone(raw.completed_run as FormalOracleCompletedTransportSchemaRunV1, "completed_run"));
  const manifest = deepFreeze(safeClone(raw.manifest as OracleGateFormalInputManifest, "manifest"));
  const bytePreflight = deepFreeze(safeClone(raw.byte_preflight as OracleGateBytePreflight, "byte_preflight"));
  const dataset = deepFreeze(safeClone(raw.dataset as SignedGoldDataset, "dataset"));
  const secret = Uint8Array.from(raw.blinding_secret);
  if (secret.byteLength < 32) { secret.fill(0); throw new Error("blinding_secret 至少 32 bytes"); }
  try {
    const blind = buildBlindArtifacts({ completed, manifest, secret, created_at: raw.derived_at });
    const evidence = buildEvidence({ policy, completed, manifest,
      byte: bytePreflight, public_responses: blind.public_responses, private_answer_key: blind.private_answer_key,
      dataset, registry_sha256: raw.registry_sha256, frame_preflight_sha256: raw.frame_preflight_sha256,
      inventory_sha256: raw.inventory_sha256 });
    return { ...blind, ...evidence };
  } finally { secret.fill(0); }
}

interface FormalOraclePostRunEvidenceInput {
  attestor: GoldLedgerAttestor;
  registry_store: FrozenOracleRegistryStore;
  pinned_registry_sha256: string;
  trusted_registry_public_keys: ReadonlyMap<string, KeyLike>;
  root: string;
  manifest: OracleGateFormalInputManifest;
  spec: OracleGateFormalSpec;
  inventory: OracleGateByteInventory;
  frame_deriver: OracleGateFrameDeriver;
  trusted_speech_reviewer_keys: ReadonlyMap<string, KeyLike>;
  run_store: FormalOracleRunStore;
  run_sha256: string;
  expected_terminal_head: FormalOracleHeadPinV1;
  blinding_secret: Uint8Array;
  policy: OracleGatePublicEvidenceDerivationPolicyV2;
  derived_at: string;
  callback: (capability: FormalOraclePostRunEvidenceCapabilityV1) => Promise<unknown>;
}

export async function withPostRunOracleEvidenceSources<T>(rawInput: Omit<FormalOraclePostRunEvidenceInput, "callback"> & {
  callback: (capability: FormalOraclePostRunEvidenceCapabilityV1) => Promise<T>;
}): Promise<T> {
  const expectedFields = ["attestor","registry_store","pinned_registry_sha256","trusted_registry_public_keys","root","manifest","spec","inventory","frame_deriver","trusted_speech_reviewer_keys","run_store","run_sha256","expected_terminal_head","blinding_secret","policy","derived_at","callback"];
  const raw = ownDataEnvelope(rawInput, expectedFields, "post-run evidence input") as unknown as typeof rawInput;
  if (typeof raw.callback !== "function") throw new Error("post-run evidence callback 必须是函数");
  if (typeof raw.pinned_registry_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.pinned_registry_sha256)
    || typeof raw.run_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.run_sha256)
    || typeof raw.root !== "string" || !raw.root || typeof raw.derived_at !== "string") {
    throw new Error("post-run evidence roots/time 无效");
  }
  canonicalTime(raw.derived_at, "derived_at");
  const manifest = deepFreeze(safeClone(raw.manifest, "manifest"));
  const spec = deepFreeze(safeClone(raw.spec, "spec"));
  const inventory = deepFreeze(safeClone(raw.inventory, "inventory"));
  const policy = deepFreeze(safeClone(raw.policy, "policy"));
  const expectedTerminalHead = deepFreeze(safeClone(raw.expected_terminal_head, "expected_terminal_head"));
  const pinnedRegistrySha256 = raw.pinned_registry_sha256;
  const runSha256 = raw.run_sha256;
  const root = raw.root;
  const derivedAt = raw.derived_at;
  const policyReport = validateOracleGatePublicEvidenceDerivationPolicyV2(policy);
  if (!policyReport.valid) throw new Error(`post-run evidence policy 无效：${policyReport.issues[0]?.path} ${policyReport.issues[0]?.message}`);
  if (Date.parse(policy.created_at) > Date.parse(derivedAt)) throw new Error("policy.created_at 不得晚于 derived_at");
  if (!(raw.blinding_secret instanceof Uint8Array) || Object.getPrototypeOf(raw.blinding_secret) !== Uint8Array.prototype) {
    throw new Error("blinding_secret 必须是 Uint8Array");
  }
  const secret = Uint8Array.from(raw.blinding_secret);
  if (secret.byteLength < 32) { secret.fill(0); throw new Error("blinding_secret 至少 32 bytes"); }
  const registryKeys = trustedKeySnapshot(raw.trusted_registry_public_keys, "trusted_registry_public_keys");
  const speechKeys = trustedKeySnapshot(raw.trusted_speech_reviewer_keys, "trusted_speech_reviewer_keys");
  try {
    return await withLedgerAttestedOracleRegistry({ attestor: raw.attestor, registryStore: raw.registry_store,
      pinned_registry_sha256: pinnedRegistrySha256, trusted_public_keys: registryKeys, callback: async (ledger) => {
        assertActiveOracleLedgerCapability(ledger);
        const dataset = ledger.dataset;
        const structural = prepareOracleGateFormalStructuralPreflight({ dataset: dataset as SignedGoldDataset, manifest, spec });
        const byte = await prepareOracleGateBytePreflight({ root, dataset: dataset as SignedGoldDataset, manifest, spec, inventory,
          video_probe: raw.frame_deriver, trusted_speech_reviewer_keys: speechKeys });
        const frame = await prepareOracleGateFrameDerivationPreflight({ root, dataset: dataset as SignedGoldDataset, manifest, spec, inventory,
          frame_deriver: raw.frame_deriver, trusted_speech_reviewer_keys: speechKeys });
        if (ledger.formal_input_manifest_sha256 !== manifest.manifest_sha256 || ledger.formal_spec_sha256 !== spec.spec_sha256
          || ledger.schedule_sha256 !== structural.schedule_sha256 || ledger.dataset_sha256 !== dataset.dataset_sha256
          || frame.inventory_sha256 !== inventory.inventory_sha256 || frame.input_manifest_sha256 !== manifest.manifest_sha256
          || frame.signed_gold_dataset_sha256 !== dataset.dataset_sha256 || byte.schedule_sha256 !== structural.schedule_sha256) {
          throw new Error("post-run registry/Gold/byte/frame roots 未闭合");
        }
        return raw.run_store.withPinnedCompletedRun({ run_sha256: runSha256, expected_head: expectedTerminalHead,
          callback: async (runCapability) => {
            assertActiveFormalOracleCompletedRunCapability(runCapability);
            const completed = runCapability.completed_run;
            if (completed.run.ledger_registry_sha256 !== ledger.registry_sha256 || completed.run.signed_gold_dataset_sha256 !== dataset.dataset_sha256
              || completed.run.formal_input_manifest_sha256 !== manifest.manifest_sha256 || completed.run.formal_spec_sha256 !== spec.spec_sha256
              || completed.run.schedule_sha256 !== structural.schedule_sha256 || completed.run.execution_plan_sha256 !== completed.execution_plan.execution_plan_sha256
              || completed.run.media_attestation_sha256 !== frame.preflight_sha256 || completed.run.speech_attestation_sha256 !== inventory.inventory_sha256
              || canonicalOracleGateJson(completed.structural_schedule) !== canonicalOracleGateJson(structural.schedule)
              || Date.parse(derivedAt) < Date.parse(completed.checkpoints.at(-1)!.created_at)) throw new Error("post-run terminal run roots/time 未闭合当前 sources");
            const records = deriveNonAuthoritativeFormalOraclePostRunEvidenceRecordsV1({ policy, completed_run: completed,
              manifest, byte_preflight: byte, dataset, registry_sha256: ledger.registry_sha256,
              frame_preflight_sha256: frame.preflight_sha256, inventory_sha256: inventory.inventory_sha256,
              blinding_secret: secret, derived_at: derivedAt });
            const chain = validateCompletedFormalRunArtifactChain({ run: completed.run, intents: [...completed.intents], attempts: [...completed.attempts],
              committed_requests: [...completed.committed_requests], checkpoints: [...completed.checkpoints], private_answer_key: records.private_answer_key,
              public_blind_package: records.public_responses });
            if (!chain.valid) throw new Error(`post-run completed chain/blind artifacts 无效：${chain.issues[0]?.path} ${chain.issues[0]?.message}`);
            const cross = validateOracleGateEvidenceV2AgainstBlindArtifacts({ policy, public_evidence: records.public_evidence,
              private_derivation: records.private_derivation, public_responses: records.public_responses, private_answer_key: records.private_answer_key });
            if (!cross.valid) throw new Error(`post-run evidence source derivation 无效：${cross.issues[0]?.path} ${cross.issues[0]?.message}`);
            assertActiveOracleLedgerCapability(ledger); assertActiveFormalOracleCompletedRunCapability(runCapability);
            const capability = new PostRunEvidenceCapability(deepFreeze(records.public_responses), deepFreeze(records.private_answer_key),
              deepFreeze(records.public_evidence), deepFreeze(records.private_derivation));
            activeCapabilities.add(capability);
            try { return await raw.callback(capability); }
            finally { activeCapabilities.delete(capability); }
          },
        });
      },
    });
  } finally { secret.fill(0); }
}
