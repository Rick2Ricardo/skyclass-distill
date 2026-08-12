import type {
  FormalOracleInputTokenCountReceiptSetV1,
  FormalOracleInputTokenExpectedPlanItemV1,
} from "../../contracts/src/oracle-gate-input-token-count.js";
import {
  validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan,
} from "../../contracts/src/oracle-gate-input-token-count.js";

export interface FormalOracleInputTokenCountReceiptCapabilityV1 {
  readonly stage: "responses_exact_count_receipts_bound_transport_incompatible";
  readonly receipt_set: Readonly<FormalOracleInputTokenCountReceiptSetV1>;
  readonly current_execution_budget_status: "pending_exact_chat_completions_count_authority";
  readonly external_authority_authenticity_status: "pending_external_endpoint_account_signature_or_worm";
  readonly api_execution_allowed: false;
}

const activeCapabilities = new WeakSet<object>();
const activeExecutionPlans = new WeakMap<object, Readonly<{
  execution_plan_sha256: string;
  items: readonly FormalOracleInputTokenExpectedPlanItemV1[];
}>>();

function clonePlainData<T>(value: T, path: string, ancestors = new Set<object>()): T {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} 必须只包含有限数值`);
    return value;
  }
  if (!value || typeof value !== "object") throw new Error(`${path} 必须只包含 JSON data properties`);
  if (ancestors.has(value)) throw new Error(`${path} 不得包含循环引用`);
  const isArray = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype)) {
    throw new Error(`${path} 必须使用标准 plain prototype`);
  }
  if (Object.getOwnPropertySymbols(value).length) throw new Error(`${path} 不得包含 symbol properties`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const nextAncestors = new Set(ancestors); nextAncestors.add(value);
  if (isArray) {
    const array = value as unknown as unknown[];
    const keys = Object.keys(descriptors).filter((key) => key !== "length");
    if (keys.length !== array.length || keys.some((key, index) => key !== String(index))) {
      throw new Error(`${path} 必须是无附加字段的稠密数组`);
    }
    const result: unknown[] = [];
    for (let index = 0; index < array.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error(`${path}[${index}] 必须是 enumerable data property`);
      result.push(clonePlainData(descriptor.value, `${path}[${index}]`, nextAncestors));
    }
    return result as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor) || !descriptor.enumerable) throw new Error(`${path}.${key} 必须是 enumerable data property`);
    if (key === "toJSON") throw new Error(`${path}.toJSON 不得由调用方定义`);
    result[key] = clonePlainData(descriptor.value, `${path}.${key}`, nextAncestors);
  }
  return result as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function isDeepFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every((child) => isDeepFrozen(child, seen));
}

class ReceiptCapability implements FormalOracleInputTokenCountReceiptCapabilityV1 {
  readonly stage = "responses_exact_count_receipts_bound_transport_incompatible" as const;
  readonly current_execution_budget_status = "pending_exact_chat_completions_count_authority" as const;
  readonly external_authority_authenticity_status = "pending_external_endpoint_account_signature_or_worm" as const;
  readonly api_execution_allowed = false as const;
  constructor(readonly receipt_set: Readonly<FormalOracleInputTokenCountReceiptSetV1>) { Object.freeze(this); }
  toJSON(): never { throw new Error("input-token receipt capability 是 callback 内临时能力，不得序列化或持久化"); }
}

export function assertActiveFormalOracleInputTokenCountReceiptCapability(
  value: FormalOracleInputTokenCountReceiptCapabilityV1,
): void {
  const plan = value && typeof value === "object" ? activeExecutionPlans.get(value as object) : undefined;
  if (!value || typeof value !== "object" || !activeCapabilities.has(value as object) || !plan
    || !isDeepFrozen(value) || !isDeepFrozen(value.receipt_set) || !isDeepFrozen(plan)
    || !validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan(value.receipt_set, plan).valid) {
    throw new Error("input-token receipt capability 无效、已过期或来自 JSON 伪造");
  }
}

/**
 * Validates and temporarily brands a persistent receipt set. This gate proves
 * only structural binding. It does not authenticate the external endpoint,
 * account, signature or WORM record, and it cannot authorize an API call.
 */
export async function withValidatedFormalOracleInputTokenCountReceiptSet<T>(input: {
  receipt_set: FormalOracleInputTokenCountReceiptSetV1;
  execution_plan: { execution_plan_sha256: string; items: readonly FormalOracleInputTokenExpectedPlanItemV1[] };
  callback: (capability: FormalOracleInputTokenCountReceiptCapabilityV1) => Promise<T>;
}): Promise<T> {
  if (typeof input.callback !== "function") throw new Error("input-token receipt callback 必须是函数");
  const snapshot = deepFreeze(clonePlainData(input.receipt_set, "receipt_set"));
  const planSnapshot = deepFreeze(clonePlainData(input.execution_plan, "execution_plan"));
  const report = validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan(snapshot, planSnapshot);
  if (!report.valid) throw new Error(`input-token receipt set 未绑定 execution plan：${report.issues[0]?.path} ${report.issues[0]?.message}`);
  const capability = new ReceiptCapability(snapshot);
  activeCapabilities.add(capability);
  activeExecutionPlans.set(capability, planSnapshot);
  try { return await input.callback(capability); }
  finally { activeCapabilities.delete(capability); activeExecutionPlans.delete(capability); }
}
