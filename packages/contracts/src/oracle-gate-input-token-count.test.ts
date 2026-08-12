import { describe, expect, it } from "vitest";
import {
  createFormalOracleInputTokenCountReceipt,
  createFormalOracleInputTokenCountReceiptSet,
  createFormalOracleInputTokenCountRequestCapture,
  createFormalOracleInputTokenCountResponseCapture,
  hashFormalOracleInputTokenCountReceipt,
  hashFormalOracleInputTokenCountReceiptSet,
  validateFormalOracleInputTokenCountReceipt,
  validateFormalOracleInputTokenCountReceiptSet,
  validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan,
  type FormalOracleInputTokenCountReceiptV1,
} from "./oracle-gate-input-token-count.js";

function receipt(index = 0, id = `REQ-${index}`): FormalOracleInputTokenCountReceiptV1 {
  const requestCapture = countRequestCapture(index, id);
  const responseCapture = countResponseCapture(index, id, requestCapture.capture_sha256);
  return createFormalOracleInputTokenCountReceipt({
    schema_version: "formal-oracle-input-token-count-receipt-v1",
    record_trust: "non_authoritative_persistent_count_receipt",
    schedule_index: index,
    request_id: id,
    model: "gpt-5.5",
    request_envelope_sha256: `${index}`.repeat(64),
    provider_body_sha256: `${index + 1}`.repeat(64),
    max_input_tokens: 8_192,
    exact_input_tokens: 1_337,
    count_request_capture_sha256: requestCapture.capture_sha256,
    count_response_capture_sha256: responseCapture.capture_sha256,
    authority_id: "openai-count-input-tokens",
    authority_profile: "openai-responses-input-token-count-v1",
    authority_version: "2026-08-13",
    counted_transport_profile: "openai-responses-api",
    execution_transport_profile: "pi-chat-completions",
    transport_equivalence_status: "not_proved_incompatible_request_entity",
    counted_at: "2026-08-13T01:02:03.000Z",
    external_authority_authenticity_status: "pending_external_endpoint_account_signature_or_worm",
    api_execution_allowed: false,
  });
}

function countRequestCapture(index = 0, id = `REQ-${index}`) {
  return createFormalOracleInputTokenCountRequestCapture({
    schema_version: "formal-oracle-input-token-count-request-capture-v1", record_trust: "non_authoritative_count_request_capture",
    schedule_index: index, request_id: id, model: "gpt-5.5", request_envelope_sha256: `${index}`.repeat(64), provider_body_sha256: `${index + 1}`.repeat(64),
    max_input_tokens: 8192, count_request_entity_sha256: "a".repeat(64), count_request_entity_byte_length: 100 + index,
    authority_id: "openai-count-input-tokens", authority_profile: "openai-responses-input-token-count-v1", authority_version: "2026-08-13",
    counted_transport_profile: "openai-responses-api", captured_at: "2026-08-13T01:02:02.000Z", external_endpoint_account_status: "pending_external_runtime_binding", api_execution_allowed: false,
  });
}

function countResponseCapture(index = 0, id = `REQ-${index}`, requestRoot = countRequestCapture(index, id).capture_sha256) {
  return createFormalOracleInputTokenCountResponseCapture({
    schema_version: "formal-oracle-input-token-count-response-capture-v1", record_trust: "non_authoritative_count_response_capture",
    schedule_index: index, request_id: id, model: "gpt-5.5", count_request_capture_sha256: requestRoot,
    count_response_entity_sha256: "b".repeat(64), count_response_entity_byte_length: 40 + index, exact_input_tokens: 1337,
    authority_id: "openai-count-input-tokens", authority_profile: "openai-responses-input-token-count-v1", authority_version: "2026-08-13",
    received_at: "2026-08-13T01:02:03.000Z", external_endpoint_account_status: "pending_external_runtime_binding", api_execution_allowed: false,
  });
}

function receiptSet() {
  const count_request_captures = [countRequestCapture(0), countRequestCapture(1)];
  const count_response_captures = count_request_captures.map((value, index) => countResponseCapture(index, `REQ-${index}`, value.capture_sha256));
  const receipts = [receipt(0), receipt(1)];
  return createFormalOracleInputTokenCountReceiptSet({
    schema_version: "formal-oracle-input-token-count-receipt-set-v1",
    record_trust: "non_authoritative_persistent_count_receipt_set",
    execution_plan_sha256: "e".repeat(64),
    receipt_count: receipts.length,
    count_request_captures,
    count_response_captures,
    receipts,
    binding_status: "responses_exact_count_receipts_bound_transport_incompatible",
    current_execution_budget_status: "pending_exact_chat_completions_count_authority",
    external_authority_authenticity_status: "pending_external_endpoint_account_signature_or_worm",
    external_persistence_status: "pending_external_monotonic_worm",
    api_execution_allowed: false,
  });
}

function plan() {
  return {
    execution_plan_sha256: "e".repeat(64),
    items: [0, 1].map((index) => ({
      schedule_index: index, request_id: `REQ-${index}`, model: "gpt-5.5",
      request_envelope_sha256: `${index}`.repeat(64), provider_body_sha256: `${index + 1}`.repeat(64), max_input_tokens: 8_192,
    })),
  };
}

describe("Formal Oracle input-token count receipt contracts", () => {
  it("accepts strict domain-addressed receipts while preserving the incompatible transport boundary", () => {
    expect(validateFormalOracleInputTokenCountReceipt(receipt())).toEqual({ valid: true, issues: [] });
    expect(validateFormalOracleInputTokenCountReceiptSet(receiptSet())).toEqual({ valid: true, issues: [] });
    expect(validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan(receiptSet(), plan())).toEqual({ valid: true, issues: [] });
  });

  it("rejects over-budget, unknown-key, non-safe and self-hash drift receipts", () => {
    for (const patch of [
      { exact_input_tokens: 8_193 }, { exact_input_tokens: 1.5 }, { max_input_tokens: Number.MAX_SAFE_INTEGER + 1 },
      { authority_profile: "local-tokenizer" }, { transport_equivalence_status: "proved" }, { api_execution_allowed: true },
    ]) {
      const value = { ...receipt(), ...patch } as FormalOracleInputTokenCountReceiptV1;
      try { value.receipt_sha256 = hashFormalOracleInputTokenCountReceipt(value); } catch { /* invalid numerics must remain rejected */ }
      expect(validateFormalOracleInputTokenCountReceipt(value).valid).toBe(false);
    }
    expect(validateFormalOracleInputTokenCountReceipt({ ...receipt(), extra: true }).valid).toBe(false);
    expect(validateFormalOracleInputTokenCountReceipt({ ...receipt(), model: "other" }).valid).toBe(false);
  });

  it("rejects missing, duplicate, sparse, reordered, model and request-root drift", () => {
    const missing = { ...receiptSet(), receipts: [receipt(0)], receipt_count: 1 };
    missing.receipt_set_sha256 = hashFormalOracleInputTokenCountReceiptSet(missing);
    expect(validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan(missing, plan()).valid).toBe(false);

    for (const receipts of [[receipt(1), receipt(0)], [receipt(0), receipt(1, "REQ-0")]]) {
      const value = { ...receiptSet(), receipts };
      value.receipt_set_sha256 = hashFormalOracleInputTokenCountReceiptSet(value);
      expect(validateFormalOracleInputTokenCountReceiptSet(value).valid).toBe(false);
    }
    const sparseReceipts = [receipt(0), receipt(1)]; delete sparseReceipts[0];
    expect(validateFormalOracleInputTokenCountReceiptSet({ ...receiptSet(), receipts: sparseReceipts }).valid).toBe(false);

    const mixed = structuredClone(receiptSet());
    mixed.count_response_captures.reverse();
    mixed.receipt_set_sha256 = hashFormalOracleInputTokenCountReceiptSet(mixed);
    expect(validateFormalOracleInputTokenCountReceiptSet(mixed).valid).toBe(false);

    const timeDrift = structuredClone(receiptSet());
    timeDrift.count_request_captures[0].captured_at = "2026-08-13T01:02:04.000Z";
    timeDrift.count_request_captures[0].capture_sha256 = "f".repeat(64);
    timeDrift.receipts[0].count_request_capture_sha256 = "f".repeat(64);
    timeDrift.count_response_captures[0].count_request_capture_sha256 = "f".repeat(64);
    timeDrift.receipt_set_sha256 = hashFormalOracleInputTokenCountReceiptSet(timeDrift);
    expect(validateFormalOracleInputTokenCountReceiptSet(timeDrift).valid).toBe(false);

    for (const patch of [{ model: "wrong" }, { request_envelope_sha256: "f".repeat(64) }, { provider_body_sha256: "f".repeat(64) }, { max_input_tokens: 7 }]) {
      const driftPlan = plan(); Object.assign(driftPlan.items[0], patch);
      expect(validateFormalOracleInputTokenCountReceiptSetAgainstExecutionPlan(receiptSet(), driftPlan).valid).toBe(false);
    }
  });
});
