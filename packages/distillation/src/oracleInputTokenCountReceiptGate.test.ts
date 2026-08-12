import { describe, expect, it } from "vitest";
import {
  createFormalOracleInputTokenCountReceipt,
  createFormalOracleInputTokenCountReceiptSet,
  createFormalOracleInputTokenCountRequestCapture,
  createFormalOracleInputTokenCountResponseCapture,
  validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan,
} from "../../contracts/src/oracle-gate-input-token-count.js";
import {
  assertActiveFormalOracleInputTokenCountReceiptCapability,
  withValidatedFormalOracleInputTokenCountReceiptSet,
  type FormalOracleInputTokenCountReceiptCapabilityV1,
} from "./oracleInputTokenCountReceiptGate.js";

function fixture() {
  const requestCapture = createFormalOracleInputTokenCountRequestCapture({
    schema_version: "formal-oracle-input-token-count-request-capture-v1", record_trust: "non_authoritative_count_request_capture", schedule_index: 0,
    request_id: "REQ-0", model: "gpt-5.5", request_envelope_sha256: "0".repeat(64), provider_body_sha256: "1".repeat(64), max_input_tokens: 8192,
    count_request_entity_sha256: "2".repeat(64), count_request_entity_byte_length: 123, authority_id: "memory-fixture-authority",
    authority_profile: "openai-responses-input-token-count-v1", authority_version: "fixture-v1", counted_transport_profile: "openai-responses-api",
    captured_at: "2026-08-13T01:02:02.000Z", external_endpoint_account_status: "pending_external_runtime_binding", api_execution_allowed: false,
  });
  const responseCapture = createFormalOracleInputTokenCountResponseCapture({
    schema_version: "formal-oracle-input-token-count-response-capture-v1", record_trust: "non_authoritative_count_response_capture", schedule_index: 0,
    request_id: "REQ-0", model: "gpt-5.5", count_request_capture_sha256: requestCapture.capture_sha256,
    count_response_entity_sha256: "3".repeat(64), count_response_entity_byte_length: 42, exact_input_tokens: 1200,
    authority_id: "memory-fixture-authority", authority_profile: "openai-responses-input-token-count-v1", authority_version: "fixture-v1",
    received_at: "2026-08-13T01:02:03.000Z", external_endpoint_account_status: "pending_external_runtime_binding", api_execution_allowed: false,
  });
  const receipt = createFormalOracleInputTokenCountReceipt({
    schema_version: "formal-oracle-input-token-count-receipt-v1", record_trust: "non_authoritative_persistent_count_receipt",
    schedule_index: 0, request_id: "REQ-0", model: "gpt-5.5", request_envelope_sha256: "0".repeat(64),
    provider_body_sha256: "1".repeat(64), max_input_tokens: 8192, exact_input_tokens: 1200,
    count_request_capture_sha256: requestCapture.capture_sha256, count_response_capture_sha256: responseCapture.capture_sha256,
    authority_id: "memory-fixture-authority", authority_profile: "openai-responses-input-token-count-v1", authority_version: "fixture-v1",
    counted_transport_profile: "openai-responses-api", execution_transport_profile: "pi-chat-completions",
    transport_equivalence_status: "not_proved_incompatible_request_entity", counted_at: "2026-08-13T01:02:03.000Z",
    external_authority_authenticity_status: "pending_external_endpoint_account_signature_or_worm", api_execution_allowed: false,
  });
  const receiptSet = createFormalOracleInputTokenCountReceiptSet({
    schema_version: "formal-oracle-input-token-count-receipt-set-v1", record_trust: "non_authoritative_persistent_count_receipt_set",
    execution_plan_sha256: "e".repeat(64), receipt_count: 1, receipts: [receipt],
    count_request_captures: [requestCapture], count_response_captures: [responseCapture],
    binding_status: "responses_exact_count_receipts_bound_transport_incompatible",
    current_execution_budget_status: "pending_exact_chat_completions_count_authority",
    external_authority_authenticity_status: "pending_external_endpoint_account_signature_or_worm",
    external_persistence_status: "pending_external_monotonic_worm", api_execution_allowed: false,
  });
  return { receiptSet, plan: { execution_plan_sha256: "e".repeat(64), items: [{ schedule_index: 0, request_id: "REQ-0", model: "gpt-5.5", request_envelope_sha256: "0".repeat(64), provider_body_sha256: "1".repeat(64), max_input_tokens: 8192 }] } };
}

describe("Formal Oracle input-token receipt callback gate", () => {
  it("brands only inside the callback and never upgrades the current execution budget", async () => {
    const { receiptSet, plan } = fixture(); let borrowed: FormalOracleInputTokenCountReceiptCapabilityV1 | undefined;
    await withValidatedFormalOracleInputTokenCountReceiptSet({ receipt_set: receiptSet, execution_plan: plan, callback: async (capability) => {
      borrowed = capability; assertActiveFormalOracleInputTokenCountReceiptCapability(capability);
      expect(capability.current_execution_budget_status).toBe("pending_exact_chat_completions_count_authority");
      expect(capability.api_execution_allowed).toBe(false);
      expect(() => JSON.stringify(capability)).toThrow("不得序列化");
    }});
    expect(() => assertActiveFormalOracleInputTokenCountReceiptCapability(borrowed!)).toThrow("已过期");
    expect(() => assertActiveFormalOracleInputTokenCountReceiptCapability({ ...borrowed! })).toThrow("JSON 伪造");
  });

  it("deep-freezes cloned request/response captures and remains closed across async callback boundaries", async () => {
    const { receiptSet, plan } = fixture();
    const callerAuthority = receiptSet.count_request_captures[0].authority_id;
    await withValidatedFormalOracleInputTokenCountReceiptSet({ receipt_set: receiptSet, execution_plan: plan, callback: async (capability) => {
      const snapshot = capability.receipt_set;
      expect(snapshot).not.toBe(receiptSet);
      expect(snapshot.count_request_captures).not.toBe(receiptSet.count_request_captures);
      expect(snapshot.count_response_captures).not.toBe(receiptSet.count_response_captures);
      expect(Object.isFrozen(snapshot.count_request_captures)).toBe(true);
      expect(Object.isFrozen(snapshot.count_response_captures)).toBe(true);
      expect(Object.isFrozen(snapshot.count_request_captures[0])).toBe(true);
      expect(Object.isFrozen(snapshot.count_response_captures[0])).toBe(true);

      expect(() => { (snapshot.count_request_captures[0] as unknown as { authority_id: string }).authority_id = "mutated"; }).toThrow(TypeError);
      expect(() => { (snapshot.count_response_captures[0] as unknown as { count_response_entity_sha256: string }).count_response_entity_sha256 = "f".repeat(64); }).toThrow(TypeError);
      expect(() => { (snapshot.count_request_captures as unknown as unknown[]).push({}); }).toThrow(TypeError);
      expect(() => { (snapshot.count_response_captures as unknown as unknown[]).splice(0, 1); }).toThrow(TypeError);
      expect(snapshot.count_request_captures[0].authority_id).toBe(callerAuthority);
      expect(validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan(snapshot, plan)).toEqual({ valid: true, issues: [] });

      await Promise.resolve();
      expect(() => { (snapshot.count_request_captures[0] as unknown as { count_request_entity_sha256: string }).count_request_entity_sha256 = "e".repeat(64); }).toThrow(TypeError);
      assertActiveFormalOracleInputTokenCountReceiptCapability(capability);
      expect(validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan(snapshot, plan)).toEqual({ valid: true, issues: [] });
    }});
    expect(receiptSet.count_request_captures[0].authority_id).toBe(callerAuthority);
  });

  it("rejects inherited/custom serialization, accessors and nested non-plain data before branding", async () => {
    const scenario = async (mutate: (value: ReturnType<typeof fixture>["receiptSet"]) => unknown): Promise<void> => {
      const { receiptSet, plan } = fixture();
      const unsafe = mutate(receiptSet) as typeof receiptSet;
      expect(validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan(unsafe, plan).valid).toBe(false);
      await expect(withValidatedFormalOracleInputTokenCountReceiptSet({
        receipt_set: unsafe, execution_plan: plan, callback: async () => undefined,
      })).rejects.toThrow(/plain|toJSON|data property|稠密/);
    };

    await scenario((value) => Object.assign(Object.create({ toJSON() { return {}; } }), value));
    await scenario((value) => {
      const unsafe = { ...value } as typeof value & { toJSON?: () => unknown };
      unsafe.toJSON = () => ({}); return unsafe;
    });
    await scenario((value) => {
      const prototype = Object.create(Object.prototype, { inherited_probe: { get() { return "unsafe"; }, enumerable: true } });
      return Object.assign(prototype, value);
    });
    await scenario((value) => {
      const unsafe = { ...value };
      Object.defineProperty(unsafe, "receipt_count", { get() { return 1; }, enumerable: true });
      return unsafe;
    });
    await scenario((value) => {
      const unsafe = structuredClone(value);
      unsafe.count_request_captures[0] = Object.assign(Object.create({ toJSON() { return {}; } }), unsafe.count_request_captures[0]);
      return unsafe;
    });
    await scenario((value) => {
      const unsafe = structuredClone(value);
      Object.defineProperty(unsafe.count_response_captures[0], "authority_id", { get() { return "memory-fixture-authority"; }, enumerable: true });
      return unsafe;
    });
  });
});
