import { sha256Hex } from "./sha256.js";
import {
  validateFormalOraclePiFetchBoundaryProofV1,
  type FormalOraclePiFetchBoundaryProofV1,
} from "./oracle-gate-pi-fetch-boundary-proof.js";
import {
  validateFormalOracleInputTokenCountReceiptSet,
  validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan,
  type FormalOracleInputTokenCountReceiptSetV1,
} from "./oracle-gate-input-token-count.js";

export const FORMAL_ORACLE_COMPOSITION_ATTESTATION_DOMAIN = "skyclass/formal-oracle/composition-attestation/v3\0";
export const FORMAL_ORACLE_LOCAL_PI_PROOF_SET_DOMAIN = "skyclass/formal-oracle/local-pi-proof-set/v1\0";

export interface FormalOracleLocalPiProofBindingV1 {
  schedule_index: number;
  request_id: string;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  proof: FormalOraclePiFetchBoundaryProofV1;
}

export interface FormalOracleLocalPiExpectedPlanItemV1 {
  schedule_index: number;
  request_id: string;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  model: string;
  max_input_tokens: number;
  max_output_tokens: number;
}

/**
 * A content-addressed record that the separately fail-closed Formal Oracle
 * layers were composed while the pinned registry and current Gold ledger were
 * both locked. This is deliberately not an execution capability.
 *
 * `media_attestation_sha256` is the source-frame preflight hash and
 * `speech_attestation_sha256` is the byte-inventory hash. The latter only has
 * attested meaning inside this composition record, after the composition gate
 * has rerun the byte/ASR verifier; an inventory document by itself is untrusted.
 */
export interface FormalOracleCompositionAttestationV3 {
  schema_version: "formal-oracle-composition-attestation-v3";
  composition_sha256: string;
  record_trust: "non_authoritative_composition_record";
  status: "composition_attested_only";
  composed_at: string;
  ledger_registry_sha256: string;
  ledger_snapshot_sha256: string;
  signed_gold_dataset_sha256: string;
  formal_input_manifest_sha256: string;
  formal_spec_sha256: string;
  resource_manifest_sha256: string;
  schedule_sha256: string;
  code_revision: string;
  build_artifact_sha256: string;
  byte_inventory_sha256: string;
  source_frame_preflight_sha256: string;
  source_frame_proof_set_sha256: string;
  media_attestation_sha256: string;
  speech_attestation_sha256: string;
  run_sha256: string;
  execution_plan_sha256: string;
  request_count: number;
  genesis_checkpoint_sha256: string;
  genesis_generation: 0;
  head_pin: {
    schema_version: "formal-oracle-head-pin-v1";
    run_sha256: string;
    generation: 0;
    checkpoint_sha256: string;
  };
  run_store_uri: string;
  rights_registry_status: "pending_external_authoritative_head";
  request_envelope_serialization_status: "completed";
  provider_body_serialization_status: "completed_pi_body_serialization_candidate";
  provider_body_transport_compatibility_status: "completed_per_request_local_fake_fetch_proof_non_executable";
  local_pi_fetch_boundary_proof_count: number;
  local_pi_fetch_boundary_proof_set_sha256: string;
  local_pi_fetch_boundary_proofs: FormalOracleLocalPiProofBindingV1[];
  local_pi_fetch_boundary_dependency_manifest_sha256: string;
  user_prompt_derivation_status: "completed";
  input_token_count_receipt_set_sha256: string | null;
  input_token_count_receipt_count: number;
  input_token_count_receipts_binding_status: "not_supplied" | "responses_exact_count_receipts_bound_transport_incompatible";
  input_token_count_receipt_set: FormalOracleInputTokenCountReceiptSetV1 | null;
  input_token_budget_status: "pending_exact_chat_completions_count_authority";
  provider_wire_binding_status: "pending_external_endpoint_account_validation";
  provider_account_endpoint_status: "pending_external_runtime_binding";
  provider_response_capture_status: "pending_strict_sse_capture_contract";
  provider_runtime_engine_status: "compatible_runtime_proved_external_capsule_pending";
  toolchain_capsule_status: "pending_external_immutable_capsule";
  composition_record_authenticity_status: "pending_external_trusted_signature_or_worm";
  external_head_pin_status: "pending_external_monotonic_worm";
  blind_package_status: "pending";
  statistics_status: "pending";
  api_execution_allowed: false;
}

export interface FormalOracleCompositionValidationIssue {
  path: string;
  message: string;
}

export interface FormalOracleCompositionValidationReport {
  valid: boolean;
  issues: FormalOracleCompositionValidationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error("composition 数值必须有限且在安全范围内");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  throw new Error("composition 只能包含 JSON 值");
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function isSha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isCanonicalTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function compatibleNode(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return false;
  const major = Number(match[1]), minor = Number(match[2]);
  return major > 22 || (major === 22 && minor >= 19);
}

function isSafeUri(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.trim() !== value || value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
  let decoded = value;
  let stable = false;
  try {
    for (let index = 0; index < 16; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) { stable = true; break; }
      decoded = next;
    }
  } catch { return false; }
  return stable && Boolean(decoded) && !decoded.includes("\\") && !decoded.includes("\0") && !decoded.startsWith("/")
    && !/^[a-z][a-z0-9+.-]*:/i.test(decoded)
    && decoded.split("/").every((part) => Boolean(part) && part !== "." && part !== "..");
}

export function canonicalFormalOracleCompositionAttestationPayload(
  input: FormalOracleCompositionAttestationV3,
): string {
  const { composition_sha256: _hash, ...payload } = input;
  return stableJson(payload);
}

export function hashFormalOracleCompositionAttestation(
  input: FormalOracleCompositionAttestationV3,
): string {
  return sha256Hex(`${FORMAL_ORACLE_COMPOSITION_ATTESTATION_DOMAIN}${canonicalFormalOracleCompositionAttestationPayload(input)}`);
}

export function hashFormalOracleLocalPiProofSet(
  input: readonly FormalOracleLocalPiProofBindingV1[],
): string {
  return sha256Hex(`${FORMAL_ORACLE_LOCAL_PI_PROOF_SET_DOMAIN}${stableJson(input)}`);
}

/**
 * Cross-validates the otherwise non-authoritative composition record against
 * the exact execution-plan projection used to create it. Callers must obtain
 * that plan through the separately pinned run/registry chain.
 */
export function validateFormalOracleCompositionAttestationAgainstExecutionPlan(
  input: unknown,
  plan: { execution_plan_sha256: string; items: readonly FormalOracleLocalPiExpectedPlanItemV1[] },
): FormalOracleCompositionValidationReport {
  const report = validateFormalOracleCompositionAttestation(input);
  const issues = [...report.issues];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input) || !Array.isArray(input.local_pi_fetch_boundary_proofs)) return { valid: false, issues };
  if (!isRecord(plan) || !isSha(plan.execution_plan_sha256) || plan.execution_plan_sha256 !== input.execution_plan_sha256) {
    issue("execution_plan_sha256", "受信 execution plan 根必须与 composition 完全一致");
    return { valid: false, issues };
  }
  const planItems = plan.items;
  if (!Array.isArray(planItems) || Object.keys(planItems).length !== planItems.length
    || planItems.length !== input.local_pi_fetch_boundary_proofs.length) {
    issue("execution_plan.items", "必须稠密且与 proof set 数量一致");
    return { valid: false, issues };
  }
  for (const [index, rawBinding] of input.local_pi_fetch_boundary_proofs.entries()) {
    const expected = planItems[index];
    if (!isRecord(rawBinding) || !isRecord(expected)) {
      issue(`execution_plan.items[${index}]`, "计划条目必须是完整对象");
      continue;
    }
    if (!Number.isSafeInteger(expected.schedule_index) || Number(expected.schedule_index) < 0
      || typeof expected.request_id !== "string" || !expected.request_id || expected.request_id.trim() !== expected.request_id
      || !isSha(expected.request_envelope_sha256) || !isSha(expected.provider_body_sha256)
      || typeof expected.model !== "string" || !expected.model || expected.model.trim() !== expected.model
      || !Number.isSafeInteger(expected.max_input_tokens) || Number(expected.max_input_tokens) <= 0
      || !Number.isSafeInteger(expected.max_output_tokens) || Number(expected.max_output_tokens) <= 0) {
      issue(`execution_plan.items[${index}]`, "计划条目投影字段无效");
      continue;
    }
    const binding = rawBinding as unknown as FormalOracleLocalPiProofBindingV1;
    const proof = binding.proof;
    if (binding.schedule_index !== index || expected.schedule_index !== index
      || binding.schedule_index !== expected.schedule_index
      || binding.request_id !== expected.request_id
      || binding.request_envelope_sha256 !== expected.request_envelope_sha256
      || binding.provider_body_sha256 !== expected.provider_body_sha256) {
      issue(`local_pi_fetch_boundary_proofs[${index}]`, "必须按 schedule_index 精确绑定 execution plan 请求与双根");
    }
    if (!isRecord(proof) || !isRecord(proof.local_fake_response_stream_proof)) {
      issue(`local_pi_fetch_boundary_proofs[${index}].proof`, "必须包含完整 Pi/SSE proof");
      continue;
    }
    if (proof.local_fake_response_stream_proof.model !== expected.model
      || proof.local_fake_response_stream_proof.expected_max_input_tokens !== expected.max_input_tokens
      || proof.local_fake_response_stream_proof.expected_max_output_tokens !== expected.max_output_tokens
      || proof.requested_max_tokens !== expected.max_output_tokens) {
      issue(`local_pi_fetch_boundary_proofs[${index}].proof`, "必须精确绑定 execution plan model/input/output budgets");
    }
  }
  if (input.input_token_count_receipt_set !== null) {
    const tokenReport = validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan(input.input_token_count_receipt_set, plan);
    issues.push(...tokenReport.issues.map((item) => ({ path: `input_token_count_receipt_set.${item.path}`, message: item.message })));
  }
  return { valid: issues.length === 0, issues };
}

export function validateFormalOracleCompositionAttestation(
  input: unknown,
): FormalOracleCompositionValidationReport {
  const issues: FormalOracleCompositionValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  const keys = [
    "schema_version", "composition_sha256", "record_trust", "status", "composed_at", "ledger_registry_sha256",
    "ledger_snapshot_sha256", "signed_gold_dataset_sha256", "formal_input_manifest_sha256", "formal_spec_sha256",
    "resource_manifest_sha256", "schedule_sha256", "code_revision", "build_artifact_sha256", "byte_inventory_sha256",
    "source_frame_preflight_sha256", "source_frame_proof_set_sha256", "media_attestation_sha256",
    "speech_attestation_sha256", "run_sha256", "execution_plan_sha256", "request_count", "genesis_checkpoint_sha256",
    "genesis_generation", "head_pin", "run_store_uri", "rights_registry_status", "request_envelope_serialization_status", "provider_body_serialization_status", "provider_body_transport_compatibility_status",
    "local_pi_fetch_boundary_proof_count", "local_pi_fetch_boundary_proof_set_sha256", "local_pi_fetch_boundary_proofs", "local_pi_fetch_boundary_dependency_manifest_sha256",
    "user_prompt_derivation_status", "input_token_count_receipt_set_sha256", "input_token_count_receipt_count",
    "input_token_count_receipts_binding_status", "input_token_count_receipt_set", "input_token_budget_status",
    "provider_wire_binding_status", "provider_account_endpoint_status", "provider_response_capture_status", "provider_runtime_engine_status",
    "toolchain_capsule_status", "composition_record_authenticity_status", "external_head_pin_status", "blind_package_status", "statistics_status",
    "api_execution_allowed",
  ] as const;
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== "formal-oracle-composition-attestation-v3") issue("schema_version", "版本无效");
  if (input.record_trust !== "non_authoritative_composition_record") issue("record_trust", "自哈希 composition record 不是跨进程真实性证明");
  if (input.status !== "composition_attested_only") issue("status", "只能是 composition_attested_only");
  if (!isCanonicalTime(input.composed_at)) issue("composed_at", "必须是 canonical ISO 时间");
  for (const field of [
    "composition_sha256", "ledger_registry_sha256", "ledger_snapshot_sha256", "signed_gold_dataset_sha256",
    "formal_input_manifest_sha256", "formal_spec_sha256", "resource_manifest_sha256", "schedule_sha256",
    "build_artifact_sha256", "byte_inventory_sha256", "source_frame_preflight_sha256",
    "source_frame_proof_set_sha256", "media_attestation_sha256", "speech_attestation_sha256", "run_sha256",
    "execution_plan_sha256", "genesis_checkpoint_sha256", "local_pi_fetch_boundary_proof_set_sha256", "local_pi_fetch_boundary_dependency_manifest_sha256",
  ] as const) if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  if (typeof input.code_revision !== "string" || !/^[a-f0-9]{40}$/.test(input.code_revision)) issue("code_revision", "必须是完整小写 Git commit");
  if (input.media_attestation_sha256 !== input.source_frame_preflight_sha256) issue("media_attestation_sha256", "必须等于 source-frame preflight hash");
  if (input.speech_attestation_sha256 !== input.byte_inventory_sha256) issue("speech_attestation_sha256", "必须等于已在组合 callback 内复核的 byte inventory hash");
  if (input.genesis_generation !== 0) issue("genesis_generation", "create-once genesis 必须是 generation 0");
  if (!isRecord(input.head_pin)
    || !exactKeys(input.head_pin, ["schema_version", "run_sha256", "generation", "checkpoint_sha256"])
    || input.head_pin.schema_version !== "formal-oracle-head-pin-v1" || input.head_pin.generation !== 0
    || input.head_pin.run_sha256 !== input.run_sha256
    || input.head_pin.checkpoint_sha256 !== input.genesis_checkpoint_sha256) {
    issue("head_pin", "必须完整绑定实际 generation 0 run/checkpoint pin");
  }
  if (!isSafeUri(input.run_store_uri)) issue("run_store_uri", "必须是受控相对路径");
  if (input.rights_registry_status !== "pending_external_authoritative_head") issue("rights_registry_status", "只绑定 declared resource root；authoritative rights/withdrawal head 仍必须 pending");
  if (input.request_envelope_serialization_status !== "completed") issue("request_envelope_serialization_status", "canonical future-adapter request envelope 必须完成序列化并闭合 execution plan");
  if (input.provider_body_serialization_status !== "completed_pi_body_serialization_candidate") issue("provider_body_serialization_status", "Pi-shaped body serialization candidate 必须与 execution plan 闭合，但不冒充 fetch proof");
  if (input.provider_body_transport_compatibility_status !== "completed_per_request_local_fake_fetch_proof_non_executable") issue("provider_body_transport_compatibility_status", "composition 必须逐请求闭合本地 Pi fake-fetch proof，且不得冒充可执行 transport");
  if (!Number.isSafeInteger(input.request_count) || Number(input.request_count) < 1) issue("request_count", "必须是正安全整数");
  if (!Number.isSafeInteger(input.local_pi_fetch_boundary_proof_count) || Number(input.local_pi_fetch_boundary_proof_count) < 1 || input.local_pi_fetch_boundary_proof_count !== input.request_count) issue("local_pi_fetch_boundary_proof_count", "必须与 request_count 相等且为正安全整数");
  if (!Array.isArray(input.local_pi_fetch_boundary_proofs)
    || Object.keys(input.local_pi_fetch_boundary_proofs).length !== input.local_pi_fetch_boundary_proofs.length
    || input.local_pi_fetch_boundary_proofs.length !== input.local_pi_fetch_boundary_proof_count) {
    issue("local_pi_fetch_boundary_proofs", "必须稠密且数量闭合");
  } else {
    const ids = new Set<string>();
    for (const [index, proof] of input.local_pi_fetch_boundary_proofs.entries()) {
      if (!isRecord(proof) || !exactKeys(proof, ["schedule_index", "request_id", "request_envelope_sha256", "provider_body_sha256", "proof"])) {
        issue(`local_pi_fetch_boundary_proofs[${index}]`, "字段集合无效"); continue;
      }
      if (proof.schedule_index !== index) issue(`local_pi_fetch_boundary_proofs[${index}].schedule_index`, "必须与 proof set 稠密顺序一致");
      if (typeof proof.request_id !== "string" || !proof.request_id || proof.request_id.trim() !== proof.request_id || ids.has(proof.request_id)) issue(`local_pi_fetch_boundary_proofs[${index}].request_id`, "必须唯一且非空");
      else ids.add(proof.request_id);
      if (!isSha(proof.request_envelope_sha256) || !isSha(proof.provider_body_sha256)) issue(`local_pi_fetch_boundary_proofs[${index}]`, "请求双根必须是 SHA-256");
      const proofReport = validateFormalOraclePiFetchBoundaryProofV1(proof.proof);
      if (!proofReport.valid || !isRecord(proof.proof)) issue(`local_pi_fetch_boundary_proofs[${index}].proof`, "完整 Pi proof 合同/内容寻址无效");
      else if (proof.proof.request_envelope_sha256 !== proof.request_envelope_sha256
        || proof.proof.provider_body_sha256 !== proof.provider_body_sha256) {
        issue(`local_pi_fetch_boundary_proofs[${index}].proof`, "Pi proof 必须绑定当前请求双根");
      }
    }
    if (isSha(input.local_pi_fetch_boundary_proof_set_sha256)
      && hashFormalOracleLocalPiProofSet(input.local_pi_fetch_boundary_proofs as unknown as FormalOracleLocalPiProofBindingV1[]) !== input.local_pi_fetch_boundary_proof_set_sha256) {
      issue("local_pi_fetch_boundary_proof_set_sha256", "proof set 内容寻址哈希不匹配");
    }
    const dependencyRoots = new Set(input.local_pi_fetch_boundary_proofs.map((proof) => isRecord(proof) && isRecord(proof.proof) ? proof.proof.local_dependency_manifest_sha256 : null));
    const runtimeVersions = new Set(input.local_pi_fetch_boundary_proofs.map((proof) => isRecord(proof) && isRecord(proof.proof) ? proof.proof.runtime_node_version : null));
    if (dependencyRoots.size !== 1 || !dependencyRoots.has(input.local_pi_fetch_boundary_dependency_manifest_sha256)) issue("local_pi_fetch_boundary_dependency_manifest_sha256", "所有请求必须绑定同一依赖清单根");
    if (runtimeVersions.size !== 1 || ![...runtimeVersions].every(compatibleNode)) issue("local_pi_fetch_boundary_proofs", "所有请求必须使用同一兼容 Node runtime");
  }
  if (input.user_prompt_derivation_status !== "completed") issue("user_prompt_derivation_status", "rendered user prompt 必须由冻结 template grammar 与 verified case transcript 确定性派生");
  if (input.input_token_count_receipt_set === null) {
    if (input.input_token_count_receipt_set_sha256 !== null || input.input_token_count_receipt_count !== 0
      || input.input_token_count_receipts_binding_status !== "not_supplied") issue("input_token_count_receipt_set", "未提供 receipt set 时根/数量/status 必须为 null/0/not_supplied");
  } else {
    const tokenReport = validateFormalOracleInputTokenCountReceiptSet(input.input_token_count_receipt_set);
    if (!tokenReport.valid) issue("input_token_count_receipt_set", "input-token receipt set 合同无效");
    if (!isRecord(input.input_token_count_receipt_set)
      || input.input_token_count_receipt_set_sha256 !== input.input_token_count_receipt_set.receipt_set_sha256
      || input.input_token_count_receipt_count !== input.input_token_count_receipt_set.receipt_count
      || input.input_token_count_receipts_binding_status !== "responses_exact_count_receipts_bound_transport_incompatible") {
      issue("input_token_count_receipt_set", "receipt set 根/数量/binding status 未闭合");
    }
  }
  if (input.input_token_budget_status !== "pending_exact_chat_completions_count_authority") issue("input_token_budget_status", "Responses API count receipt 不适用于当前 Pi Chat Completions body；精确预算门必须 pending");
  if (input.provider_wire_binding_status !== "pending_external_endpoint_account_validation") issue("provider_wire_binding_status", "真实 provider endpoint/account 与 Pi SDK equivalence 仍待外部门验证");
  if (input.provider_account_endpoint_status !== "pending_external_runtime_binding") issue("provider_account_endpoint_status", "provider account/endpoint 必须保持外部运行时待绑定");
  if (input.provider_response_capture_status !== "pending_strict_sse_capture_contract") issue("provider_response_capture_status", "stream response bytes/SSE usage/stop capture 尚未闭合");
  if (input.provider_runtime_engine_status !== "compatible_runtime_proved_external_capsule_pending") issue("provider_runtime_engine_status", "必须由逐请求 proof 证明兼容 runtime，同时保持外部 capsule pending");
  if (input.toolchain_capsule_status !== "pending_external_immutable_capsule") issue("toolchain_capsule_status", "工具动态依赖/不可变 capsule 仍必须 pending");
  if (input.composition_record_authenticity_status !== "pending_external_trusted_signature_or_worm") issue("composition_record_authenticity_status", "自哈希记录仍需外部可信签名或 WORM");
  if (input.external_head_pin_status !== "pending_external_monotonic_worm") issue("external_head_pin_status", "外部单调/WORM HEAD 仍必须 pending");
  if (input.blind_package_status !== "pending" || input.statistics_status !== "pending") issue("downstream_status", "blind package/statistics 仍必须 pending");
  if (input.api_execution_allowed !== false) issue("api_execution_allowed", "composition attestation 不得授权 API");
  if (isSha(input.composition_sha256)) {
    try {
      if (hashFormalOracleCompositionAttestation(input as unknown as FormalOracleCompositionAttestationV3) !== input.composition_sha256) {
        issue("composition_sha256", "内容寻址哈希不匹配");
      }
    } catch { issue("composition_sha256", "内容不能规范序列化"); }
  }
  return { valid: issues.length === 0, issues };
}
