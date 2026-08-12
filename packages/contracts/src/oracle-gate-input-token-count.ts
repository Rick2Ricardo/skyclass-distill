import { sha256Hex } from "./sha256.js";

export const FORMAL_ORACLE_INPUT_TOKEN_COUNT_RECEIPT_DOMAIN = "skyclass/formal-oracle/input-token-count-receipt/v1\0";
export const FORMAL_ORACLE_INPUT_TOKEN_COUNT_RECEIPT_SET_DOMAIN = "skyclass/formal-oracle/input-token-count-receipt-set/v1\0";
export const FORMAL_ORACLE_INPUT_TOKEN_COUNT_REQUEST_CAPTURE_DOMAIN = "skyclass/formal-oracle/input-token-count-request-capture/v1\0";
export const FORMAL_ORACLE_INPUT_TOKEN_COUNT_RESPONSE_CAPTURE_DOMAIN = "skyclass/formal-oracle/input-token-count-response-capture/v1\0";

export interface FormalOracleInputTokenCountRequestCaptureV1 {
  /** Declared entity metadata only; this slice never receives, reads, or persists the entity bytes/URI. */
  schema_version: "formal-oracle-input-token-count-request-capture-v1";
  capture_sha256: string;
  record_trust: "non_authoritative_count_request_capture";
  schedule_index: number;
  request_id: string;
  model: string;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  max_input_tokens: number;
  count_request_entity_sha256: string;
  count_request_entity_byte_length: number;
  authority_id: string;
  authority_profile: "openai-responses-input-token-count-v1";
  authority_version: string;
  counted_transport_profile: "openai-responses-api";
  captured_at: string;
  external_endpoint_account_status: "pending_external_runtime_binding";
  api_execution_allowed: false;
}

export interface FormalOracleInputTokenCountResponseCaptureV1 {
  /** Declared entity metadata only; this slice never receives, reads, or persists the entity bytes/URI. */
  schema_version: "formal-oracle-input-token-count-response-capture-v1";
  capture_sha256: string;
  record_trust: "non_authoritative_count_response_capture";
  schedule_index: number;
  request_id: string;
  model: string;
  count_request_capture_sha256: string;
  count_response_entity_sha256: string;
  count_response_entity_byte_length: number;
  exact_input_tokens: number;
  authority_id: string;
  authority_profile: "openai-responses-input-token-count-v1";
  authority_version: string;
  received_at: string;
  external_endpoint_account_status: "pending_external_runtime_binding";
  api_execution_allowed: false;
}

export interface FormalOracleInputTokenCountReceiptV1 {
  schema_version: "formal-oracle-input-token-count-receipt-v1";
  receipt_sha256: string;
  record_trust: "non_authoritative_persistent_count_receipt";
  schedule_index: number;
  request_id: string;
  model: string;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  max_input_tokens: number;
  exact_input_tokens: number;
  count_request_capture_sha256: string;
  count_response_capture_sha256: string;
  authority_id: string;
  authority_profile: "openai-responses-input-token-count-v1";
  authority_version: string;
  counted_transport_profile: "openai-responses-api";
  execution_transport_profile: "pi-chat-completions";
  transport_equivalence_status: "not_proved_incompatible_request_entity";
  counted_at: string;
  external_authority_authenticity_status: "pending_external_endpoint_account_signature_or_worm";
  api_execution_allowed: false;
}

export interface FormalOracleInputTokenCountReceiptSetV1 {
  schema_version: "formal-oracle-input-token-count-receipt-set-v1";
  receipt_set_sha256: string;
  record_trust: "non_authoritative_persistent_count_receipt_set";
  execution_plan_sha256: string;
  receipt_count: number;
  count_request_captures: FormalOracleInputTokenCountRequestCaptureV1[];
  count_response_captures: FormalOracleInputTokenCountResponseCaptureV1[];
  receipts: FormalOracleInputTokenCountReceiptV1[];
  binding_status: "responses_exact_count_receipts_bound_transport_incompatible";
  current_execution_budget_status: "pending_exact_chat_completions_count_authority";
  external_authority_authenticity_status: "pending_external_endpoint_account_signature_or_worm";
  external_persistence_status: "pending_external_monotonic_worm";
  api_execution_allowed: false;
}

export interface FormalOracleInputTokenExpectedPlanItemV1 {
  schedule_index: number;
  request_id: string;
  model: string;
  request_envelope_sha256: string;
  provider_body_sha256: string;
  max_input_tokens: number;
}

export interface FormalOracleInputTokenCountValidationIssue { path: string; message: string }
export interface FormalOracleInputTokenCountValidationReport { valid: boolean; issues: FormalOracleInputTokenCountValidationIssue[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Object.getOwnPropertySymbols(value).length) return false;
  return Object.entries(Object.getOwnPropertyDescriptors(value)).every(([key, descriptor]) => key !== "toJSON"
    && "value" in descriptor && descriptor.enumerable);
}

function isPlainDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).filter((key) => key !== "length");
  return keys.length === value.length && keys.every((key, index) => key === String(index)
    && "value" in descriptors[key] && descriptors[key].enumerable);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("input-token receipt 数值必须是安全整数");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (!isPlainDenseArray(value)) throw new Error("input-token receipt 数组必须是 plain 稠密 data array");
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  throw new Error("input-token receipt 只能包含 JSON 值");
}

function isSha(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function isCanonicalTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}
function isControlledText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value
    && !/[\u0000-\u001f\u007f]/.test(value) && !/[\ud800-\udfff]/.test(value);
}

export function canonicalFormalOracleInputTokenCountReceiptPayload(input: FormalOracleInputTokenCountReceiptV1): string {
  const { receipt_sha256: _hash, ...payload } = input;
  return stableJson(payload);
}

export function hashFormalOracleInputTokenCountRequestCapture(input: FormalOracleInputTokenCountRequestCaptureV1): string {
  const { capture_sha256: _hash, ...payload } = input;
  return sha256Hex(`${FORMAL_ORACLE_INPUT_TOKEN_COUNT_REQUEST_CAPTURE_DOMAIN}${stableJson(payload)}`);
}

export function hashFormalOracleInputTokenCountResponseCapture(input: FormalOracleInputTokenCountResponseCaptureV1): string {
  const { capture_sha256: _hash, ...payload } = input;
  return sha256Hex(`${FORMAL_ORACLE_INPUT_TOKEN_COUNT_RESPONSE_CAPTURE_DOMAIN}${stableJson(payload)}`);
}

export function createFormalOracleInputTokenCountRequestCapture(
  input: Omit<FormalOracleInputTokenCountRequestCaptureV1, "capture_sha256">,
): FormalOracleInputTokenCountRequestCaptureV1 {
  const value: FormalOracleInputTokenCountRequestCaptureV1 = { ...input, capture_sha256: "0".repeat(64) };
  value.capture_sha256 = hashFormalOracleInputTokenCountRequestCapture(value);
  const report = validateFormalOracleInputTokenCountRequestCapture(value);
  if (!report.valid) throw new Error(`count request capture 无效：${report.issues[0]?.path} ${report.issues[0]?.message}`);
  return Object.freeze(value);
}

export function createFormalOracleInputTokenCountResponseCapture(
  input: Omit<FormalOracleInputTokenCountResponseCaptureV1, "capture_sha256">,
): FormalOracleInputTokenCountResponseCaptureV1 {
  const value: FormalOracleInputTokenCountResponseCaptureV1 = { ...input, capture_sha256: "0".repeat(64) };
  value.capture_sha256 = hashFormalOracleInputTokenCountResponseCapture(value);
  const report = validateFormalOracleInputTokenCountResponseCapture(value);
  if (!report.valid) throw new Error(`count response capture 无效：${report.issues[0]?.path} ${report.issues[0]?.message}`);
  return Object.freeze(value);
}

export function validateFormalOracleInputTokenCountRequestCapture(input: unknown): FormalOracleInputTokenCountValidationReport {
  const issues: FormalOracleInputTokenCountValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  const keys = ["schema_version", "capture_sha256", "record_trust", "schedule_index", "request_id", "model", "request_envelope_sha256",
    "provider_body_sha256", "max_input_tokens", "count_request_entity_sha256", "count_request_entity_byte_length", "authority_id",
    "authority_profile", "authority_version", "counted_transport_profile", "captured_at", "external_endpoint_account_status", "api_execution_allowed"] as const;
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== "formal-oracle-input-token-count-request-capture-v1") issue("schema_version", "版本无效");
  if (input.record_trust !== "non_authoritative_count_request_capture") issue("record_trust", "capture 自哈希不是外部权威证明");
  if (!Number.isSafeInteger(input.schedule_index) || Number(input.schedule_index) < 0) issue("schedule_index", "必须是非负安全整数");
  if (!isControlledText(input.request_id, 256) || !isControlledText(input.model, 256)) issue("identity", "request/model 必须是受控文本");
  for (const field of ["capture_sha256", "request_envelope_sha256", "provider_body_sha256", "count_request_entity_sha256"] as const) if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  if (!Number.isSafeInteger(input.max_input_tokens) || Number(input.max_input_tokens) <= 0) issue("max_input_tokens", "必须是正安全整数");
  if (!Number.isSafeInteger(input.count_request_entity_byte_length) || Number(input.count_request_entity_byte_length) <= 0) issue("count_request_entity_byte_length", "必须是正安全整数");
  if (!isControlledText(input.authority_id, 256) || !isControlledText(input.authority_version, 128)) issue("authority", "authority identity/version 无效");
  if (input.authority_profile !== "openai-responses-input-token-count-v1" || input.counted_transport_profile !== "openai-responses-api") issue("authority_profile", "只允许 Responses input-token count profile");
  if (!isCanonicalTime(input.captured_at)) issue("captured_at", "必须是 canonical ISO 时间");
  if (input.external_endpoint_account_status !== "pending_external_runtime_binding") issue("external_endpoint_account_status", "必须保持 pending");
  if (input.api_execution_allowed !== false) issue("api_execution_allowed", "capture 不得授权 API");
  if (isSha(input.capture_sha256)) try { if (hashFormalOracleInputTokenCountRequestCapture(input as unknown as FormalOracleInputTokenCountRequestCaptureV1) !== input.capture_sha256) issue("capture_sha256", "内容寻址哈希不匹配"); } catch { issue("capture_sha256", "内容不能规范序列化"); }
  return { valid: issues.length === 0, issues };
}

export function validateFormalOracleInputTokenCountResponseCapture(input: unknown): FormalOracleInputTokenCountValidationReport {
  const issues: FormalOracleInputTokenCountValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  const keys = ["schema_version", "capture_sha256", "record_trust", "schedule_index", "request_id", "model", "count_request_capture_sha256",
    "count_response_entity_sha256", "count_response_entity_byte_length", "exact_input_tokens", "authority_id", "authority_profile", "authority_version",
    "received_at", "external_endpoint_account_status", "api_execution_allowed"] as const;
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== "formal-oracle-input-token-count-response-capture-v1") issue("schema_version", "版本无效");
  if (input.record_trust !== "non_authoritative_count_response_capture") issue("record_trust", "capture 自哈希不是外部权威证明");
  if (!Number.isSafeInteger(input.schedule_index) || Number(input.schedule_index) < 0) issue("schedule_index", "必须是非负安全整数");
  if (!isControlledText(input.request_id, 256) || !isControlledText(input.model, 256)) issue("identity", "request/model 必须是受控文本");
  for (const field of ["capture_sha256", "count_request_capture_sha256", "count_response_entity_sha256"] as const) if (!isSha(input[field])) issue(field, "必须是 SHA-256");
  if (!Number.isSafeInteger(input.count_response_entity_byte_length) || Number(input.count_response_entity_byte_length) <= 0) issue("count_response_entity_byte_length", "必须是正安全整数");
  if (!Number.isSafeInteger(input.exact_input_tokens) || Number(input.exact_input_tokens) <= 0) issue("exact_input_tokens", "必须是正安全整数");
  if (!isControlledText(input.authority_id, 256) || !isControlledText(input.authority_version, 128)) issue("authority", "authority identity/version 无效");
  if (input.authority_profile !== "openai-responses-input-token-count-v1") issue("authority_profile", "只允许 Responses input-token count profile");
  if (!isCanonicalTime(input.received_at)) issue("received_at", "必须是 canonical ISO 时间");
  if (input.external_endpoint_account_status !== "pending_external_runtime_binding") issue("external_endpoint_account_status", "必须保持 pending");
  if (input.api_execution_allowed !== false) issue("api_execution_allowed", "capture 不得授权 API");
  if (isSha(input.capture_sha256)) try { if (hashFormalOracleInputTokenCountResponseCapture(input as unknown as FormalOracleInputTokenCountResponseCaptureV1) !== input.capture_sha256) issue("capture_sha256", "内容寻址哈希不匹配"); } catch { issue("capture_sha256", "内容不能规范序列化"); }
  return { valid: issues.length === 0, issues };
}

export function hashFormalOracleInputTokenCountReceipt(input: FormalOracleInputTokenCountReceiptV1): string {
  return sha256Hex(`${FORMAL_ORACLE_INPUT_TOKEN_COUNT_RECEIPT_DOMAIN}${canonicalFormalOracleInputTokenCountReceiptPayload(input)}`);
}

export function canonicalFormalOracleInputTokenCountReceiptSetPayload(input: FormalOracleInputTokenCountReceiptSetV1): string {
  const { receipt_set_sha256: _hash, ...payload } = input;
  return stableJson(payload);
}

export function hashFormalOracleInputTokenCountReceiptSet(input: FormalOracleInputTokenCountReceiptSetV1): string {
  return sha256Hex(`${FORMAL_ORACLE_INPUT_TOKEN_COUNT_RECEIPT_SET_DOMAIN}${canonicalFormalOracleInputTokenCountReceiptSetPayload(input)}`);
}

export function createFormalOracleInputTokenCountReceipt(
  input: Omit<FormalOracleInputTokenCountReceiptV1, "receipt_sha256">,
): FormalOracleInputTokenCountReceiptV1 {
  const receipt: FormalOracleInputTokenCountReceiptV1 = { ...input, receipt_sha256: "0".repeat(64) };
  receipt.receipt_sha256 = hashFormalOracleInputTokenCountReceipt(receipt);
  const report = validateFormalOracleInputTokenCountReceipt(receipt);
  if (!report.valid) throw new Error(`input-token receipt 无效：${report.issues[0]?.path} ${report.issues[0]?.message}`);
  return Object.freeze(receipt);
}

export function createFormalOracleInputTokenCountReceiptSet(
  input: Omit<FormalOracleInputTokenCountReceiptSetV1, "receipt_set_sha256">,
): FormalOracleInputTokenCountReceiptSetV1 {
  const receiptSet: FormalOracleInputTokenCountReceiptSetV1 = {
    ...input,
    count_request_captures: input.count_request_captures.map((value) => Object.freeze({ ...value })),
    count_response_captures: input.count_response_captures.map((value) => Object.freeze({ ...value })),
    receipts: input.receipts.map((value) => Object.freeze({ ...value })),
    receipt_set_sha256: "0".repeat(64),
  };
  receiptSet.receipt_set_sha256 = hashFormalOracleInputTokenCountReceiptSet(receiptSet);
  const report = validateFormalOracleInputTokenCountReceiptSet(receiptSet);
  if (!report.valid) throw new Error(`input-token receipt set 无效：${report.issues[0]?.path} ${report.issues[0]?.message}`);
  Object.freeze(receiptSet.receipts);
  Object.freeze(receiptSet.count_request_captures);
  Object.freeze(receiptSet.count_response_captures);
  return Object.freeze(receiptSet);
}

export function validateFormalOracleInputTokenCountReceipt(input: unknown): FormalOracleInputTokenCountValidationReport {
  const issues: FormalOracleInputTokenCountValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  const keys = ["schema_version", "receipt_sha256", "record_trust", "schedule_index", "request_id", "model",
    "request_envelope_sha256", "provider_body_sha256", "max_input_tokens", "exact_input_tokens",
    "count_request_capture_sha256", "count_response_capture_sha256", "authority_id", "authority_profile",
    "authority_version", "counted_transport_profile", "execution_transport_profile", "transport_equivalence_status",
    "counted_at", "external_authority_authenticity_status", "api_execution_allowed"] as const;
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== "formal-oracle-input-token-count-receipt-v1") issue("schema_version", "版本无效");
  if (input.record_trust !== "non_authoritative_persistent_count_receipt") issue("record_trust", "持久 receipt 自哈希不是外部权威证明");
  if (!Number.isSafeInteger(input.schedule_index) || Number(input.schedule_index) < 0) issue("schedule_index", "必须是非负安全整数");
  if (!isControlledText(input.request_id, 256)) issue("request_id", "必须是受控非空文本");
  if (!isControlledText(input.model, 256)) issue("model", "必须是受控非空文本");
  for (const field of ["receipt_sha256", "request_envelope_sha256", "provider_body_sha256", "count_request_capture_sha256", "count_response_capture_sha256"] as const) {
    if (!isSha(input[field])) issue(field, "必须是严格小写 SHA-256");
  }
  if (!Number.isSafeInteger(input.max_input_tokens) || Number(input.max_input_tokens) <= 0) issue("max_input_tokens", "必须是正安全整数");
  if (!Number.isSafeInteger(input.exact_input_tokens) || Number(input.exact_input_tokens) <= 0) issue("exact_input_tokens", "必须是正安全整数");
  else if (Number.isSafeInteger(input.max_input_tokens) && Number(input.exact_input_tokens) > Number(input.max_input_tokens)) issue("exact_input_tokens", "精确计数超过冻结预算，必须 fail closed");
  if (!isControlledText(input.authority_id, 256)) issue("authority_id", "必须是受控非空文本");
  if (input.authority_profile !== "openai-responses-input-token-count-v1") issue("authority_profile", "只允许冻结的 Responses input-token count profile");
  if (!isControlledText(input.authority_version, 128)) issue("authority_version", "必须是受控非空版本");
  if (input.counted_transport_profile !== "openai-responses-api") issue("counted_transport_profile", "精确 receipt 仅声明 Responses API 计数对象");
  if (input.execution_transport_profile !== "pi-chat-completions") issue("execution_transport_profile", "当前执行计划必须明确为 Pi Chat Completions");
  if (input.transport_equivalence_status !== "not_proved_incompatible_request_entity") issue("transport_equivalence_status", "不得把 Responses count 冒充 Chat Completions 精确计数");
  if (!isCanonicalTime(input.counted_at)) issue("counted_at", "必须是 canonical ISO 时间");
  if (input.external_authority_authenticity_status !== "pending_external_endpoint_account_signature_or_worm") issue("external_authority_authenticity_status", "endpoint/account/signature/WORM 必须保持 pending");
  if (input.api_execution_allowed !== false) issue("api_execution_allowed", "receipt 不得授权模型 API");
  if (isSha(input.receipt_sha256)) {
    try {
      if (hashFormalOracleInputTokenCountReceipt(input as unknown as FormalOracleInputTokenCountReceiptV1) !== input.receipt_sha256) issue("receipt_sha256", "内容寻址哈希不匹配");
    } catch { issue("receipt_sha256", "内容不能规范序列化"); }
  }
  return { valid: issues.length === 0, issues };
}

export function validateFormalOracleInputTokenCountReceiptSet(input: unknown): FormalOracleInputTokenCountValidationReport {
  const issues: FormalOracleInputTokenCountValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  const keys = ["schema_version", "receipt_set_sha256", "record_trust", "execution_plan_sha256", "receipt_count", "count_request_captures", "count_response_captures", "receipts",
    "binding_status", "current_execution_budget_status", "external_authority_authenticity_status", "external_persistence_status", "api_execution_allowed"] as const;
  if (!exactKeys(input, keys)) issue("$", "字段集合无效");
  if (input.schema_version !== "formal-oracle-input-token-count-receipt-set-v1") issue("schema_version", "版本无效");
  if (input.record_trust !== "non_authoritative_persistent_count_receipt_set") issue("record_trust", "持久 set 自哈希不是外部权威证明");
  if (!isSha(input.receipt_set_sha256)) issue("receipt_set_sha256", "必须是严格小写 SHA-256");
  if (!isSha(input.execution_plan_sha256)) issue("execution_plan_sha256", "必须是严格小写 SHA-256");
  if (!Number.isSafeInteger(input.receipt_count) || Number(input.receipt_count) < 1) issue("receipt_count", "必须是正安全整数");
  const receipts = input.receipts;
  const requestCaptures = input.count_request_captures;
  const responseCaptures = input.count_response_captures;
  if (!isPlainDenseArray(receipts) || !isPlainDenseArray(requestCaptures) || !isPlainDenseArray(responseCaptures)
    || Object.keys(receipts).length !== receipts.length || Object.keys(requestCaptures).length !== requestCaptures.length
    || Object.keys(responseCaptures).length !== responseCaptures.length
    || receipts.length !== input.receipt_count || requestCaptures.length !== receipts.length || responseCaptures.length !== receipts.length) {
    issue("receipts", "request/response capture 与 receipt 必须是等长稠密数组");
  } else {
    const ids = new Set<string>();
    const roots = new Set<string>();
    receipts.forEach((receipt, index) => {
      const report = validateFormalOracleInputTokenCountReceipt(receipt);
      const requestReport = validateFormalOracleInputTokenCountRequestCapture(requestCaptures[index]);
      const responseReport = validateFormalOracleInputTokenCountResponseCapture(responseCaptures[index]);
      const requestCapture = requestCaptures[index]; const responseCapture = responseCaptures[index];
      if (!report.valid || !requestReport.valid || !responseReport.valid || !isRecord(receipt) || !isRecord(requestCapture) || !isRecord(responseCapture)) issue(`receipts[${index}]`, "capture/receipt 合同无效");
      else {
        if (receipt.schedule_index !== index) issue(`receipts[${index}].schedule_index`, "必须按稠密 schedule_index 排序");
        if (typeof receipt.request_id !== "string" || ids.has(receipt.request_id)) issue(`receipts[${index}].request_id`, "request_id 必须唯一");
        else ids.add(receipt.request_id);
        if (requestCapture.schedule_index !== index || responseCapture.schedule_index !== index
          || requestCapture.request_id !== receipt.request_id || responseCapture.request_id !== receipt.request_id
          || requestCapture.model !== receipt.model || responseCapture.model !== receipt.model
          || requestCapture.request_envelope_sha256 !== receipt.request_envelope_sha256
          || requestCapture.provider_body_sha256 !== receipt.provider_body_sha256
          || requestCapture.max_input_tokens !== receipt.max_input_tokens
          || responseCapture.exact_input_tokens !== receipt.exact_input_tokens
          || receipt.count_request_capture_sha256 !== requestCapture.capture_sha256
          || receipt.count_response_capture_sha256 !== responseCapture.capture_sha256
          || responseCapture.count_request_capture_sha256 !== requestCapture.capture_sha256
          || requestCapture.authority_id !== receipt.authority_id || responseCapture.authority_id !== receipt.authority_id
          || requestCapture.authority_version !== receipt.authority_version || responseCapture.authority_version !== receipt.authority_version) issue(`receipts[${index}]`, "request capture/response capture/receipt 必须逐字段闭合");
        if (typeof requestCapture.captured_at === "string" && typeof responseCapture.received_at === "string" && typeof receipt.counted_at === "string"
          && (Date.parse(requestCapture.captured_at) > Date.parse(responseCapture.received_at)
            || Date.parse(responseCapture.received_at) > Date.parse(receipt.counted_at))) issue(`receipts[${index}]`, "count request/response/receipt 时间必须单调闭合");
        for (const root of [receipt.receipt_sha256, requestCapture.capture_sha256, responseCapture.capture_sha256]) {
          if (typeof root !== "string" || roots.has(root)) issue(`receipts[${index}]`, "所有 receipt/capture roots 必须唯一"); else roots.add(root);
        }
      }
    });
  }
  if (input.binding_status !== "responses_exact_count_receipts_bound_transport_incompatible") issue("binding_status", "只能声明不兼容 transport 的 receipt 基础设施已绑定");
  if (input.current_execution_budget_status !== "pending_exact_chat_completions_count_authority") issue("current_execution_budget_status", "当前 Chat Completions 精确预算门必须 pending");
  if (input.external_authority_authenticity_status !== "pending_external_endpoint_account_signature_or_worm") issue("external_authority_authenticity_status", "外部 authority authenticity 必须 pending");
  if (input.external_persistence_status !== "pending_external_monotonic_worm") issue("external_persistence_status", "外部单调/WORM 必须 pending");
  if (input.api_execution_allowed !== false) issue("api_execution_allowed", "receipt set 不得授权模型 API");
  if (isSha(input.receipt_set_sha256)) {
    try {
      if (hashFormalOracleInputTokenCountReceiptSet(input as unknown as FormalOracleInputTokenCountReceiptSetV1) !== input.receipt_set_sha256) issue("receipt_set_sha256", "内容寻址哈希不匹配");
    } catch { issue("receipt_set_sha256", "内容不能规范序列化"); }
  }
  return { valid: issues.length === 0, issues };
}

export function validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan(
  input: unknown,
  plan: { execution_plan_sha256: string; items: readonly FormalOracleInputTokenExpectedPlanItemV1[] },
): FormalOracleInputTokenCountValidationReport {
  const report = validateFormalOracleInputTokenCountReceiptSet(input);
  const issues = [...report.issues];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input) || !isPlainDenseArray(input.receipts) || !isRecord(plan) || !isPlainDenseArray(plan.items)) return { valid: false, issues };
  const receipts = input.receipts;
  if (!isSha(plan.execution_plan_sha256) || input.execution_plan_sha256 !== plan.execution_plan_sha256) issue("execution_plan_sha256", "必须绑定受信 execution plan 根");
  if (Object.keys(plan.items).length !== plan.items.length || plan.items.length !== receipts.length) {
    issue("receipts", "必须不多不少覆盖 execution plan");
    return { valid: false, issues };
  }
  plan.items.forEach((expected, index) => {
    const receipt = receipts[index];
    if (!isRecord(expected) || !isRecord(receipt)) { issue(`receipts[${index}]`, "计划或 receipt 条目无效"); return; }
    if (expected.schedule_index !== index || receipt.schedule_index !== index
      || receipt.request_id !== expected.request_id || receipt.model !== expected.model
      || receipt.request_envelope_sha256 !== expected.request_envelope_sha256
      || receipt.provider_body_sha256 !== expected.provider_body_sha256
      || receipt.max_input_tokens !== expected.max_input_tokens) {
      issue(`receipts[${index}]`, "必须逐请求精确绑定 schedule/request/model/双根/input budget");
    }
  });
  return { valid: issues.length === 0, issues };
}
