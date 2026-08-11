export type GoldLedgerEntryKind = "gold_manifest" | "adjudication_intake" | "decision_revision" | "package_signoff";

export interface GoldLedgerSnapshotEntry {
  storage: "repository" | "data";
  kind: GoldLedgerEntryKind;
  uri: string;
  sha256: string;
  byte_length: number;
}

/** Deterministic snapshot of every byte that can affect the current Signed Gold dataset. */
export interface GoldLedgerSnapshotV1 {
  schema_version: "gold-ledger-snapshot-v1";
  snapshot_sha256: string;
  dataset_sha256: string;
  queue_sha256: string;
  gold_manifest_sha256: string;
  ledger_tree_sha256: string;
  package_count: number;
  reviewed_group_count: number;
  accepted_event_count: number;
  entries: GoldLedgerSnapshotEntry[];
}

/**
 * First externally signed registry stage. It attests only the current Gold ledger
 * and the structural experiment schedule; later media/speech/run-store gates stay
 * explicitly false and therefore cannot authorize an API call.
 */
export interface OracleGateLedgerRegistryV1 {
  schema_version: "oracle-gate-ledger-registry-v1";
  registry_id: string;
  registry_sha256: string;
  status: "frozen_ledger_attestation";
  sequence: number;
  frozen_at: string;
  created_by: string;
  ledger_snapshot: GoldLedgerSnapshotV1;
  formal_input_manifest_sha256: string;
  formal_spec_sha256: string;
  resource_manifest_sha256: string;
  schedule_sha256: string;
  code_revision: string;
  build_artifact_sha256: string;
  case_count: number;
  event_count: number;
  request_count: number;
  gates: {
    ledger_attested: true;
    media_bytes_verified: false;
    speech_bytes_verified: false;
    run_store_verified: false;
    api_execution_allowed: false;
  };
  signer_key_id: string;
  signature_algorithm: "ed25519";
  signature_base64: string;
}

export interface OracleGateRegistryRevocationV1 {
  schema_version: "oracle-gate-registry-revocation-v1";
  revocation_sha256: string;
  registry_sha256: string;
  reason: string;
  revoked_at: string;
  signer_key_id: string;
  signature_algorithm: "ed25519";
  signature_base64: string;
}

export interface OracleGateTrustedValidationIssue {
  path: string;
  message: string;
}

export interface OracleGateTrustedValidationReport {
  valid: boolean;
  issues: OracleGateTrustedValidationIssue[];
}

export const GOLD_LEDGER_SNAPSHOT_DOMAIN = "skyclass/formal-oracle/gold-ledger-snapshot/v1\0";
export const ORACLE_LEDGER_REGISTRY_DOMAIN = "skyclass/formal-oracle/ledger-registry/v1\0";
export const ORACLE_REGISTRY_REVOCATION_DOMAIN = "skyclass/formal-oracle/registry-revocation/v1\0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return "null";
}

function isSha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function isCanonicalEd25519Base64(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9+/]{85}[AQgw]==$/.test(value);
}

function isSafeUri(value: unknown): value is string {
  if (!isNonEmpty(value) || value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
  let decoded = value;
  let stable = false;
  try {
    for (let index = 0; index < 16; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) { stable = true; break; }
      decoded = next;
    }
  } catch { return false; }
  return stable && Boolean(decoded) && !decoded.includes("\\") && !decoded.includes("\0")
    && !decoded.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(decoded)
    && decoded.split("/").every((part) => Boolean(part) && part !== "." && part !== "..");
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

export function canonicalGoldLedgerSnapshotPayload(input: GoldLedgerSnapshotV1): string {
  const { snapshot_sha256: _snapshotSha256, ...payload } = input;
  return stableJson(payload);
}

export function canonicalOracleGateLedgerRegistryPayload(input: OracleGateLedgerRegistryV1): string {
  const {
    registry_id: _registryId,
    registry_sha256: _registrySha256,
    signature_base64: _signature,
    ...payload
  } = input;
  return stableJson(payload);
}

export function canonicalOracleGateLedgerRegistryDocument(input: OracleGateLedgerRegistryV1): string {
  return stableJson(input);
}

export function canonicalOracleGateRegistryRevocationPayload(input: OracleGateRegistryRevocationV1): string {
  const { revocation_sha256: _revocationSha256, signature_base64: _signature, ...payload } = input;
  return stableJson(payload);
}

export function canonicalOracleGateRegistryRevocationDocument(input: OracleGateRegistryRevocationV1): string {
  return stableJson(input);
}

export function validateGoldLedgerSnapshot(input: unknown): OracleGateTrustedValidationReport {
  const issues: OracleGateTrustedValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  if (!exactKeys(input, ["schema_version", "snapshot_sha256", "dataset_sha256", "queue_sha256", "gold_manifest_sha256", "ledger_tree_sha256", "package_count", "reviewed_group_count", "accepted_event_count", "entries"])) issue("$", "字段集合无效");
  if (input.schema_version !== "gold-ledger-snapshot-v1") issue("schema_version", "版本无效");
  for (const field of ["snapshot_sha256", "dataset_sha256", "queue_sha256", "gold_manifest_sha256", "ledger_tree_sha256"] as const) {
    if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  }
  for (const field of ["package_count", "reviewed_group_count", "accepted_event_count"] as const) {
    if (!Number.isSafeInteger(input[field]) || Number(input[field]) < 0) issue(field, "必须是非负安全整数");
  }
  if (!Array.isArray(input.entries) || !input.entries.length) issue("entries", "不能为空");
  const keys = new Set<string>();
  for (const [index, raw] of (Array.isArray(input.entries) ? input.entries : []).entries()) {
    const path = `entries[${index}]`;
    if (!isRecord(raw)) { issue(path, "必须是对象"); continue; }
    if (!exactKeys(raw, ["storage", "kind", "uri", "sha256", "byte_length"])) issue(path, "字段集合无效");
    if (raw.storage !== "repository" && raw.storage !== "data") issue(`${path}.storage`, "值无效");
    if (!["gold_manifest", "adjudication_intake", "decision_revision", "package_signoff"].includes(String(raw.kind))) issue(`${path}.kind`, "值无效");
    if (!isSafeUri(raw.uri)) issue(`${path}.uri`, "必须是受控相对路径");
    if (!isSha(raw.sha256)) issue(`${path}.sha256`, "必须是 SHA-256");
    if (!Number.isSafeInteger(raw.byte_length) || Number(raw.byte_length) < 1) issue(`${path}.byte_length`, "必须是正安全整数");
    const key = `${raw.storage}:${raw.uri}`;
    if (keys.has(key)) issue(path, "路径重复"); else keys.add(key);
  }
  return { valid: issues.length === 0, issues };
}

export function validateOracleGateLedgerRegistry(input: unknown): OracleGateTrustedValidationReport {
  const issues: OracleGateTrustedValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  const required = ["schema_version", "registry_id", "registry_sha256", "status", "sequence", "frozen_at", "created_by", "ledger_snapshot", "formal_input_manifest_sha256", "formal_spec_sha256", "resource_manifest_sha256", "schedule_sha256", "code_revision", "build_artifact_sha256", "case_count", "event_count", "request_count", "gates", "signer_key_id", "signature_algorithm", "signature_base64"];
  if (!exactKeys(input, required)) issue("$", "字段集合无效");
  if (input.schema_version !== "oracle-gate-ledger-registry-v1" || input.status !== "frozen_ledger_attestation") issue("schema_version", "版本或状态无效");
  if (!isNonEmpty(input.registry_id) || !/^oracle-ledger-registry-[a-f0-9]{16}$/.test(String(input.registry_id))) issue("registry_id", "格式无效");
  for (const field of ["registry_sha256", "formal_input_manifest_sha256", "formal_spec_sha256", "resource_manifest_sha256", "schedule_sha256", "build_artifact_sha256"] as const) if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  if (!Number.isSafeInteger(input.sequence) || Number(input.sequence) < 1) issue("sequence", "必须是正安全整数");
  if (!isNonEmpty(input.frozen_at) || !Number.isFinite(Date.parse(String(input.frozen_at)))) issue("frozen_at", "时间无效");
  if (!isNonEmpty(input.created_by) || !isNonEmpty(input.signer_key_id)) issue("identity", "created_by/signer_key_id 不能为空");
  if (!/^[a-f0-9]{40}$/.test(String(input.code_revision))) issue("code_revision", "必须是完整小写 Git commit");
  for (const field of ["case_count", "event_count", "request_count"] as const) if (!Number.isSafeInteger(input[field]) || Number(input[field]) < 1) issue(field, "必须是正安全整数");
  const snapshotReport = validateGoldLedgerSnapshot(input.ledger_snapshot);
  snapshotReport.issues.forEach((item) => issue(`ledger_snapshot.${item.path}`, item.message));
  if (!isRecord(input.gates) || !exactKeys(input.gates, ["ledger_attested", "media_bytes_verified", "speech_bytes_verified", "run_store_verified", "api_execution_allowed"])
    || input.gates.ledger_attested !== true || input.gates.media_bytes_verified !== false
    || input.gates.speech_bytes_verified !== false || input.gates.run_store_verified !== false
    || input.gates.api_execution_allowed !== false) issue("gates", "ledger registry 只能证明账本，后续门必须保持 false");
  if (input.signature_algorithm !== "ed25519" || !isCanonicalEd25519Base64(input.signature_base64)) issue("signature", "必须是 canonical 64-byte Ed25519 base64 签名");
  return { valid: issues.length === 0, issues };
}

export function validateOracleGateRegistryRevocation(input: unknown): OracleGateTrustedValidationReport {
  const issues: OracleGateTrustedValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  if (!exactKeys(input, ["schema_version", "revocation_sha256", "registry_sha256", "reason", "revoked_at", "signer_key_id", "signature_algorithm", "signature_base64"])) issue("$", "字段集合无效");
  if (input.schema_version !== "oracle-gate-registry-revocation-v1") issue("schema_version", "版本无效");
  if (!isSha(input.revocation_sha256) || !isSha(input.registry_sha256)) issue("hash", "必须是 SHA-256");
  if (!isNonEmpty(input.reason) || String(input.reason).length < 8) issue("reason", "撤销原因至少 8 字");
  if (!isNonEmpty(input.revoked_at) || !Number.isFinite(Date.parse(String(input.revoked_at)))) issue("revoked_at", "时间无效");
  if (!isNonEmpty(input.signer_key_id) || input.signature_algorithm !== "ed25519" || !isCanonicalEd25519Base64(input.signature_base64)) issue("signature", "签名字段无效");
  return { valid: issues.length === 0, issues };
}
