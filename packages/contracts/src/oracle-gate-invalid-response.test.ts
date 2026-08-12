import { describe, expect, it } from "vitest";
import { canonicalOracleGateResponseBytes } from "./oracle-gate-response.js";
import { buildFormalOraclePiResponseStreamFixtureV1 } from "./oracle-gate-pi-response-stream.js";
import {
  assertFormalOracleInvalidResponseArtifactV1,
  assertFormalOracleInvalidResponseRecordV1,
  createFormalOracleInvalidResponseArtifactV1,
  createFormalOracleTransportMetadataInvalidResponseArtifactV1,
  hashFormalOracleInvalidResponseRecordV1,
  revalidateFormalOracleInvalidResponseArtifactV1,
} from "./oracle-gate-invalid-response.js";

const hashes = { request_envelope_sha256: "1".repeat(64), provider_body_sha256: "2".repeat(64) };
const usage = {
  prompt_tokens: 10, completion_tokens: 5, total_tokens: 15,
  prompt_tokens_details: { cached_tokens: 0 as const }, completion_tokens_details: { reasoning_tokens: 0 as const },
};
const goodResponse = {
  schema_version: "teacher-evidence-response-v1",
  observed_board_actions: [],
  generalized_teaching_capability: { name: "fixture", mechanism: "fixture", action_program: ["fixture"] },
  evidence_claims: [], uncertainties: [],
};

function sse(content: Uint8Array): Uint8Array {
  return buildFormalOraclePiResponseStreamFixtureV1({
    response_id: "chatcmpl-invalid-fixture", model: "model-v1", created: 1,
    content_chunks: [new TextDecoder().decode(content)], usage,
  });
}

function invalid(raw_sse_bytes: Uint8Array, expected_arm = "transcript_only" as const) {
  return createFormalOracleInvalidResponseArtifactV1({
    raw_sse_bytes, expected_model: "model-v1", expected_arm, ...hashes,
    expected_max_input_tokens: 100, expected_max_output_tokens: 50,
  });
}

describe("formal-oracle-invalid-response-v1", () => {
  it("records complete entities with invalid transport metadata without claiming B/C derivation", () => {
    const raw = sse(canonicalOracleGateResponseBytes(goodResponse));
    const artifact = createFormalOracleTransportMetadataInvalidResponseArtifactV1({
      raw_sse_bytes: raw, expected_model: "model-v1", expected_arm: "transcript_only", ...hashes,
      expected_max_input_tokens: 100, expected_max_output_tokens: 50,
    });
    expect(artifact.record).toMatchObject({
      failure_stage: "transport_metadata_invalid",
      failure_code: "transport_metadata_invalid",
      fetch_observed_sse_bytes_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      sse_derivation_record_sha256: null,
      assistant_content_bytes_sha256: null,
    });
    expect(artifact.raw_sse_bytes).toEqual(raw);
    expect(() => assertFormalOracleInvalidResponseRecordV1(artifact.record)).not.toThrow();
    expect(revalidateFormalOracleInvalidResponseArtifactV1(artifact).record).toEqual(artifact.record);
    expect(() => createFormalOracleInvalidResponseArtifactV1({
      raw_sse_bytes: raw, expected_model: "model-v1", expected_arm: "transcript_only", ...hashes,
      expected_max_input_tokens: 100, expected_max_output_tokens: 50,
    })).toThrow("不能构造 invalid");
  });

  it("rejects a response that passes SSE, assistant JSON and frozen arm schema", () => {
    expect(() => invalid(sse(canonicalOracleGateResponseBytes(goodResponse)))).toThrow("不能构造 invalid");
  });

  it("classifies strict SSE failures without B/C and binds a domain-addressed record", () => {
    for (const raw of [
      new Uint8Array(),
      new TextEncoder().encode("data: {}\n\n"),
      Uint8Array.from([0xff]),
      new TextEncoder().encode('data: {"x":1,"x":2}\n\ndata: [DONE]\n\n'),
    ]) {
      const artifact = invalid(raw);
      expect(artifact.record).toMatchObject({
        failure_stage: "sse_protocol_invalid", failure_code: "sse_protocol_invalid",
        sse_derivation_record_sha256: null, assistant_content_bytes_sha256: null,
        external_provider_response_status: "transport_capture_record_required_for_authoritative_source",
        api_execution_allowed: false,
      });
      expect(hashFormalOracleInvalidResponseRecordV1(artifact.record)).toBe(artifact.record.invalid_response_record_sha256);
      expect(() => assertFormalOracleInvalidResponseRecordV1(artifact.record)).not.toThrow();
    }
  });

  it("persists B/C bindings for assistant JSON and response-schema failures", () => {
    expect(invalid(sse(new TextEncoder().encode('{"x":1,"x":2}'))).record.failure_stage).toBe("assistant_json_invalid");
    expect(invalid(sse(new TextEncoder().encode('{"x":"\\ud800"}'))).record.failure_stage).toBe("assistant_json_invalid");
    const schema = invalid(sse(new TextEncoder().encode('{"schema_version":"nonsense"}')));
    expect(schema.record).toMatchObject({
      failure_stage: "response_schema_invalid",
      sse_derivation_record_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      assistant_content_bytes_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const wrongArm = invalid(sse(canonicalOracleGateResponseBytes({
      ...goodResponse,
      evidence_claims: [{ claim: "视觉证据", evidence_slot: "visual-1" }],
    })), "transcript_only");
    expect(wrongArm.record.failure_stage).toBe("response_schema_invalid");
  });

  it("brands and revalidates exact raw/record/derivation/content provenance", () => {
    const artifact = invalid(sse(new TextEncoder().encode("not-json")));
    assertFormalOracleInvalidResponseArtifactV1(artifact);
    expect(revalidateFormalOracleInvalidResponseArtifactV1(artifact).record).toEqual(artifact.record);
    expect(() => assertFormalOracleInvalidResponseArtifactV1(structuredClone(artifact))).toThrow("伪造");
    artifact.raw_sse_bytes[0] ^= 1;
    expect(() => revalidateFormalOracleInvalidResponseArtifactV1(artifact)).toThrow();
  });

  it("rejects malformed expected identity before classifying an invalid entity", () => {
    expect(() => createFormalOracleInvalidResponseArtifactV1({
      raw_sse_bytes: new TextEncoder().encode("data: {}\n\n"), expected_model: "bad\ud800",
      expected_arm: "transcript_only", ...hashes, expected_max_input_tokens: 100, expected_max_output_tokens: 50,
    })).toThrow("surrogate");
    const record = structuredClone(invalid(new TextEncoder().encode("data: {}\n\n")).record) as {
      api_execution_allowed: boolean;
      invalid_response_record_sha256: string;
    } & Record<string, unknown>;
    record.api_execution_allowed = true as false;
    record.invalid_response_record_sha256 = hashFormalOracleInvalidResponseRecordV1(record as never);
    expect(() => assertFormalOracleInvalidResponseRecordV1(record)).toThrow("固定字段");
  });
});
