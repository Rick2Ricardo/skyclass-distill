import { sha256Hex } from "./sha256.js";
import {
  FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
  FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
} from "./oracle-gate-provider-request.js";

export const FORMAL_ORACLE_TRANSPORT_REGISTRY_VERSION = "formal-oracle-transport-registry-v1" as const;
export const FORMAL_ORACLE_TRANSPORT_REGISTRY_DOMAIN = "skyclass/formal-oracle/transport-registry/v1\0";
export const FORMAL_ORACLE_TRANSPORT_REVOCATION_VERSION = "formal-oracle-transport-revocation-v1" as const;
export const FORMAL_ORACLE_TRANSPORT_REVOCATION_DOMAIN = "skyclass/formal-oracle/transport-revocation/v1\0";

export interface FormalOracleTransportRegistryV1 {
  schema_version: typeof FORMAL_ORACLE_TRANSPORT_REGISTRY_VERSION;
  registry_id: string;
  registry_sha256: string;
  status: "endpoint_account_attested_only";
  sequence: number;
  issued_at: string;
  expires_at: string;
  created_by: string;
  ledger_registry_sha256: string;
  composition_sha256: string;
  run_sha256: string;
  execution_plan_sha256: string;
  provider_body_profile: typeof FORMAL_ORACLE_PROVIDER_BODY_PROFILE;
  prepared_adapter_version: typeof FORMAL_ORACLE_PREPARED_ADAPTER_VERSION;
  transport: "pi";
  model: string;
  endpoint: {
    base_url: string;
    chat_completions_url: string;
    method: "POST";
    redirect_policy: "error";
    tls_required: true;
  };
  account: {
    provider_id: string;
    account_key_id: string;
    credential_key_id: string;
    auth_scheme: "bearer";
    credential_source: "external_callback_only";
    secret_persistence_allowed: false;
  };
  retry_policy: {
    provider_inner_retries: 0;
    attempt_owner: "formal_run_store";
    provider_idempotency_support: "not_available_for_chat_completions";
    single_consume_dispatch_required: true;
    post_fetch_uncertainty: "unknown_block_no_automatic_retry";
  };
  gates: {
    endpoint_account_attested: true;
    provider_wire_captured: false;
    single_consume_dispatch_proved: false;
    response_capture_proved: false;
    toolchain_capsule_attested: false;
    api_execution_allowed: false;
  };
  signer_key_id: string;
  signature_algorithm: "ed25519";
  signature_base64: string;
}

export interface FormalOracleTransportRevocationV1 {
  schema_version: typeof FORMAL_ORACLE_TRANSPORT_REVOCATION_VERSION;
  revocation_sha256: string;
  registry_sha256: string;
  reason: string;
  revoked_at: string;
  signer_key_id: string;
  signature_algorithm: "ed25519";
  signature_base64: string;
}

export interface FormalOracleTransportValidationReport {
  valid: boolean;
  issues: Array<{ path: string; message: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("transport authority 数值必须是安全整数");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error("transport authority 数组必须稠密");
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  throw new Error("transport authority 只能包含 JSON 值");
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

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{1,127}$/.test(value);
}

function isCanonicalEd25519Signature(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9+/]{85}[AQgw]==$/.test(value);
}

export function normalizeFormalOracleEndpointBaseUrl(value: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value || value.endsWith("/") || value.includes("%")) {
    throw new Error("Formal Oracle endpoint 必须是无尾斜杠 canonical HTTPS base URL");
  }
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error("Formal Oracle endpoint URL 无效"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash
    || !parsed.hostname || parsed.hostname.endsWith(".") || parsed.pathname === "/") {
    throw new Error("Formal Oracle endpoint 必须是无认证、查询或片段的 HTTPS 路径");
  }
  if (parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost") || parsed.hostname.endsWith(".local")
    || !parsed.hostname.includes(".") || parsed.hostname.includes(":") || /^\d+(?:\.\d+){3}$/.test(parsed.hostname)) {
    throw new Error("Formal Oracle endpoint 必须声明 DNS 形式主机名，不接受 IP/loopback/local 字面地址");
  }
  if (!/^[a-z0-9.-]+$/.test(parsed.hostname)
    || parsed.pathname.split("/").some((part) => part === "." || part === ".." || part.includes("\\"))) {
    throw new Error("Formal Oracle endpoint host/path 不是 canonical ASCII");
  }
  const canonical = `${parsed.origin}${parsed.pathname}`;
  if (canonical !== value) throw new Error("Formal Oracle endpoint 不是 canonical URL");
  return canonical;
}

export function canonicalFormalOracleTransportRegistryPayload(input: FormalOracleTransportRegistryV1): string {
  const { registry_id: _id, registry_sha256: _hash, signature_base64: _signature, ...payload } = input;
  return stableJson(payload);
}

export function canonicalFormalOracleTransportRegistryDocument(input: FormalOracleTransportRegistryV1): string {
  return stableJson(input);
}

export function hashFormalOracleTransportRegistry(input: FormalOracleTransportRegistryV1): string {
  return sha256Hex(`${FORMAL_ORACLE_TRANSPORT_REGISTRY_DOMAIN}${canonicalFormalOracleTransportRegistryPayload(input)}`);
}

export function canonicalFormalOracleTransportRevocationPayload(input: FormalOracleTransportRevocationV1): string {
  const { revocation_sha256: _hash, signature_base64: _signature, ...payload } = input;
  return stableJson(payload);
}

export function canonicalFormalOracleTransportRevocationDocument(input: FormalOracleTransportRevocationV1): string {
  return stableJson(input);
}

export function hashFormalOracleTransportRevocation(input: FormalOracleTransportRevocationV1): string {
  return sha256Hex(`${FORMAL_ORACLE_TRANSPORT_REVOCATION_DOMAIN}${canonicalFormalOracleTransportRevocationPayload(input)}`);
}

export function validateFormalOracleTransportRegistry(input: unknown): FormalOracleTransportValidationReport {
  const issues: FormalOracleTransportValidationReport["issues"] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  const keys = [
    "schema_version", "registry_id", "registry_sha256", "status", "sequence", "issued_at", "expires_at", "created_by",
    "ledger_registry_sha256", "composition_sha256", "run_sha256", "execution_plan_sha256", "provider_body_profile",
    "prepared_adapter_version", "transport", "model", "endpoint", "account", "retry_policy", "gates", "signer_key_id",
    "signature_algorithm", "signature_base64",
  ] as const;
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== FORMAL_ORACLE_TRANSPORT_REGISTRY_VERSION || input.status !== "endpoint_account_attested_only") issue("schema_version", "版本或状态无效");
  if (typeof input.registry_id !== "string" || !/^formal-transport-[a-f0-9]{16}$/.test(input.registry_id)) issue("registry_id", "格式无效");
  for (const field of ["registry_sha256", "ledger_registry_sha256", "composition_sha256", "run_sha256", "execution_plan_sha256"] as const) {
    if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  }
  if (!Number.isSafeInteger(input.sequence) || Number(input.sequence) < 1) issue("sequence", "必须是正安全整数");
  if (!isCanonicalTime(input.issued_at) || !isCanonicalTime(input.expires_at)
    || Date.parse(String(input.expires_at)) <= Date.parse(String(input.issued_at))) issue("validity", "issued/expires 必须是递增 canonical 时间");
  if (!isIdentifier(input.created_by) || !isIdentifier(input.signer_key_id)) issue("identity", "created_by/signer_key_id 无效");
  if (input.provider_body_profile !== FORMAL_ORACLE_PROVIDER_BODY_PROFILE
    || input.prepared_adapter_version !== FORMAL_ORACLE_PREPARED_ADAPTER_VERSION || input.transport !== "pi") issue("profile", "provider profile/adapter/transport 无效");
  if (typeof input.model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(input.model)) issue("model", "model 无效");
  if (!isRecord(input.endpoint) || !exactKeys(input.endpoint, ["base_url", "chat_completions_url", "method", "redirect_policy", "tls_required"])) issue("endpoint", "字段集合无效");
  else {
    let normalized: string | null = null;
    try { normalized = normalizeFormalOracleEndpointBaseUrl(String(input.endpoint.base_url)); }
    catch { issue("endpoint.base_url", "必须是 canonical HTTPS DNS-name declaration"); }
    if (!normalized || input.endpoint.chat_completions_url !== `${normalized}/chat/completions`
      || input.endpoint.method !== "POST" || input.endpoint.redirect_policy !== "error" || input.endpoint.tls_required !== true) {
      issue("endpoint", "URL/method/redirect/TLS 未闭合");
    }
  }
  if (!isRecord(input.account) || !exactKeys(input.account, ["provider_id", "account_key_id", "credential_key_id", "auth_scheme", "credential_source", "secret_persistence_allowed"])
    || !isIdentifier(input.account.provider_id) || !isIdentifier(input.account.account_key_id) || !isIdentifier(input.account.credential_key_id)
    || input.account.auth_scheme !== "bearer" || input.account.credential_source !== "external_callback_only"
    || input.account.secret_persistence_allowed !== false) issue("account", "account/credential policy 无效");
  if (!isRecord(input.retry_policy) || !exactKeys(input.retry_policy, ["provider_inner_retries", "attempt_owner", "provider_idempotency_support", "single_consume_dispatch_required", "post_fetch_uncertainty"])
    || input.retry_policy.provider_inner_retries !== 0 || input.retry_policy.attempt_owner !== "formal_run_store"
    || input.retry_policy.provider_idempotency_support !== "not_available_for_chat_completions"
    || input.retry_policy.single_consume_dispatch_required !== true
    || input.retry_policy.post_fetch_uncertainty !== "unknown_block_no_automatic_retry") issue("retry_policy", "retry/idempotency/uncertainty policy 无效");
  if (!isRecord(input.gates) || !exactKeys(input.gates, ["endpoint_account_attested", "provider_wire_captured", "single_consume_dispatch_proved", "response_capture_proved", "toolchain_capsule_attested", "api_execution_allowed"])
    || input.gates.endpoint_account_attested !== true || input.gates.provider_wire_captured !== false
    || input.gates.single_consume_dispatch_proved !== false || input.gates.response_capture_proved !== false
    || input.gates.toolchain_capsule_attested !== false || input.gates.api_execution_allowed !== false) issue("gates", "本层只能证明 endpoint/account，后续门必须 false");
  if (input.signature_algorithm !== "ed25519" || !isCanonicalEd25519Signature(input.signature_base64)) issue("signature", "必须是 canonical Ed25519 签名");
  return { valid: issues.length === 0, issues };
}

export function validateFormalOracleTransportRevocation(input: unknown): FormalOracleTransportValidationReport {
  const issues: FormalOracleTransportValidationReport["issues"] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  if (!exactKeys(input, ["schema_version", "revocation_sha256", "registry_sha256", "reason", "revoked_at", "signer_key_id", "signature_algorithm", "signature_base64"])) issue("$", "字段集合无效");
  if (input.schema_version !== FORMAL_ORACLE_TRANSPORT_REVOCATION_VERSION) issue("schema_version", "版本无效");
  if (!isSha(input.revocation_sha256) || !isSha(input.registry_sha256)) issue("hash", "必须是 SHA-256");
  if (typeof input.reason !== "string" || input.reason.trim() !== input.reason || input.reason.length < 8 || input.reason.length > 512) issue("reason", "撤销原因长度无效");
  if (!isCanonicalTime(input.revoked_at)) issue("revoked_at", "必须是 canonical 时间");
  if (!isIdentifier(input.signer_key_id) || input.signature_algorithm !== "ed25519" || !isCanonicalEd25519Signature(input.signature_base64)) issue("signature", "签名字段无效");
  return { valid: issues.length === 0, issues };
}
