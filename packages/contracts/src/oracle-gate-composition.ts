import { sha256Hex } from "./sha256.js";

export const FORMAL_ORACLE_COMPOSITION_ATTESTATION_DOMAIN = "skyclass/formal-oracle/composition-attestation/v1\0";

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
export interface FormalOracleCompositionAttestationV1 {
  schema_version: "formal-oracle-composition-attestation-v1";
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
  request_payload_rendering_status: "pending_strict_canonical_builder";
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
  input: FormalOracleCompositionAttestationV1,
): string {
  const { composition_sha256: _hash, ...payload } = input;
  return stableJson(payload);
}

export function hashFormalOracleCompositionAttestation(
  input: FormalOracleCompositionAttestationV1,
): string {
  return sha256Hex(`${FORMAL_ORACLE_COMPOSITION_ATTESTATION_DOMAIN}${canonicalFormalOracleCompositionAttestationPayload(input)}`);
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
    "speech_attestation_sha256", "run_sha256", "execution_plan_sha256", "genesis_checkpoint_sha256",
    "genesis_generation", "head_pin", "run_store_uri", "rights_registry_status", "request_payload_rendering_status",
    "toolchain_capsule_status", "composition_record_authenticity_status", "external_head_pin_status", "blind_package_status", "statistics_status",
    "api_execution_allowed",
  ] as const;
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== "formal-oracle-composition-attestation-v1") issue("schema_version", "版本无效");
  if (input.record_trust !== "non_authoritative_composition_record") issue("record_trust", "自哈希 composition record 不是跨进程真实性证明");
  if (input.status !== "composition_attested_only") issue("status", "只能是 composition_attested_only");
  if (!isCanonicalTime(input.composed_at)) issue("composed_at", "必须是 canonical ISO 时间");
  for (const field of [
    "composition_sha256", "ledger_registry_sha256", "ledger_snapshot_sha256", "signed_gold_dataset_sha256",
    "formal_input_manifest_sha256", "formal_spec_sha256", "resource_manifest_sha256", "schedule_sha256",
    "build_artifact_sha256", "byte_inventory_sha256", "source_frame_preflight_sha256",
    "source_frame_proof_set_sha256", "media_attestation_sha256", "speech_attestation_sha256", "run_sha256",
    "execution_plan_sha256", "genesis_checkpoint_sha256",
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
  if (input.request_payload_rendering_status !== "pending_strict_canonical_builder") issue("request_payload_rendering_status", "request bytes 尚未由 strict canonical builder 解析证明语义");
  if (input.toolchain_capsule_status !== "pending_external_immutable_capsule") issue("toolchain_capsule_status", "工具动态依赖/不可变 capsule 仍必须 pending");
  if (input.composition_record_authenticity_status !== "pending_external_trusted_signature_or_worm") issue("composition_record_authenticity_status", "自哈希记录仍需外部可信签名或 WORM");
  if (input.external_head_pin_status !== "pending_external_monotonic_worm") issue("external_head_pin_status", "外部单调/WORM HEAD 仍必须 pending");
  if (input.blind_package_status !== "pending" || input.statistics_status !== "pending") issue("downstream_status", "blind package/statistics 仍必须 pending");
  if (input.api_execution_allowed !== false) issue("api_execution_allowed", "composition attestation 不得授权 API");
  if (isSha(input.composition_sha256)) {
    try {
      if (hashFormalOracleCompositionAttestation(input as unknown as FormalOracleCompositionAttestationV1) !== input.composition_sha256) {
        issue("composition_sha256", "内容寻址哈希不匹配");
      }
    } catch { issue("composition_sha256", "内容不能规范序列化"); }
  }
  return { valid: issues.length === 0, issues };
}
