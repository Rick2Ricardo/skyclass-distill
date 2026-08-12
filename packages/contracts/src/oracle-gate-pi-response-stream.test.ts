import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256.js";
import {
  FORMAL_ORACLE_PI_RESPONSE_STREAM_MAX_BYTES,
  assertFormalOraclePiResponseStreamArtifactV1,
  buildFormalOraclePiResponseStreamFixtureV1,
  createFormalOraclePiResponseStreamArtifactV1,
  parseFormalOraclePiResponseStreamV1,
  revalidateFormalOraclePiResponseStreamArtifactV1,
  type FormalOraclePiRawUsageV1,
} from "./oracle-gate-pi-response-stream.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const hashes = {
  request_envelope_sha256: "1".repeat(64), provider_body_sha256: "2".repeat(64),
  expected_max_input_tokens: 100, expected_max_output_tokens: 50,
};
const usage: FormalOraclePiRawUsageV1 = {
  prompt_tokens: 11,
  completion_tokens: 7,
  total_tokens: 18,
  prompt_tokens_details: { cached_tokens: 0 },
  completion_tokens_details: { reasoning_tokens: 0 },
};

function raw(): Uint8Array {
  return buildFormalOraclePiResponseStreamFixtureV1({
    response_id: "chatcmpl-proof-1",
    model: "model-v1",
    created: 17,
    content_chunks: ["{\"schema_version\":", "\"teacher-evidence-response-v1\",", "\"observed_board_actions\":[]}"],
    usage,
  });
}

function parse(bytes = raw(), model = "model-v1") {
  return parseFormalOraclePiResponseStreamV1({ raw_sse_bytes: bytes, expected_model: model, ...hashes });
}

function mutate(transform: (frames: string[]) => string[]): Uint8Array {
  const frames = decoder.decode(raw()).slice(0, -2).split("\n\n");
  return encoder.encode(`${transform(frames).join("\n\n")}\n\n`);
}

function jsonFrame(frames: string[], index: number): Record<string, unknown> {
  return JSON.parse(frames[index].slice(6)) as Record<string, unknown>;
}

function replaceJson(frames: string[], index: number, value: unknown): string[] {
  frames[index] = `data: ${JSON.stringify(value)}`;
  return frames;
}

describe("formal-oracle-pi-response-stream-v1", () => {
  it("strictly derives identity, concatenated assistant bytes, stop and raw/normalized usage", () => {
    const bytes = raw();
    const proof = parse(bytes);
    const content = '{"schema_version":"teacher-evidence-response-v1","observed_board_actions":[]}';
    expect(proof).toEqual({
      schema_version: "formal-oracle-pi-response-stream-v1",
      proof_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      ...hashes,
      raw_sse_sha256: sha256Hex(bytes),
      raw_sse_byte_length: bytes.byteLength,
      assistant_content_sha256: sha256Hex(encoder.encode(content)),
      assistant_content_byte_length: encoder.encode(content).byteLength,
      response_id: "chatcmpl-proof-1",
      model: "model-v1",
      created: 17,
      role_prelude_count: 1,
      content_event_count: 3,
      finish_reason: "stop",
      done_count: 1,
      expected_max_input_tokens: 100,
      expected_max_output_tokens: 50,
      raw_usage: usage,
      normalized_usage: {
        input_tokens: 11, output_tokens: 7, total_tokens: 18,
        cache_read_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0,
      },
      provider_response_scope: "untrusted_sse_entity_strict_derivation_only",
      store_integration_status: "formal_run_store_v2_abcd_integrated",
      external_provider_response_status: "transport_capture_record_required_for_authoritative_source",
      api_execution_allowed: false,
    });
    expect(Object.isFrozen(proof)).toBe(true);
    expect(Object.isFrozen(proof.raw_usage)).toBe(true);
  });

  it("brands a fetch-observed byte artifact and revalidates raw/proof/assistant copies", () => {
    const bytes = raw();
    const artifact = createFormalOraclePiResponseStreamArtifactV1({ raw_sse_bytes: bytes, expected_model: "model-v1", ...hashes });
    assertFormalOraclePiResponseStreamArtifactV1(artifact);
    expect(new TextDecoder().decode(artifact.assistant_content_bytes)).toBe('{"schema_version":"teacher-evidence-response-v1","observed_board_actions":[]}');
    const revalidated = revalidateFormalOraclePiResponseStreamArtifactV1(artifact);
    expect(revalidated.proof).toEqual(artifact.proof);
    expect(revalidated.raw_sse_bytes).not.toBe(artifact.raw_sse_bytes);
    expect(revalidated.assistant_content_bytes).not.toBe(artifact.assistant_content_bytes);
    expect(() => assertFormalOraclePiResponseStreamArtifactV1(structuredClone(artifact))).toThrow("伪造");
    artifact.raw_sse_bytes[0] ^= 1;
    expect(() => revalidateFormalOraclePiResponseStreamArtifactV1(artifact)).toThrow();

    const contentMutation = createFormalOraclePiResponseStreamArtifactV1({ raw_sse_bytes: bytes, expected_model: "model-v1", ...hashes });
    contentMutation.assistant_content_bytes[0] ^= 1;
    expect(() => revalidateFormalOraclePiResponseStreamArtifactV1(contentMutation)).toThrow("漂移");
  });

  it("rejects invalid UTF-8, CRLF, size overflow, duplicate keys and number lexemes while accepting JSON whitespace/order", () => {
    expect(() => parse(Uint8Array.from([0xff]))).toThrow("UTF-8");
    expect(() => parse(Uint8Array.from([0xef, 0xbb, 0xbf, ...raw()]))).toThrow("BOM");
    expect(() => parse(encoder.encode(decoder.decode(raw()).replaceAll("\n", "\r\n")))).toThrow("LF");
    expect(() => parse(new Uint8Array(FORMAL_ORACLE_PI_RESPONSE_STREAM_MAX_BYTES + 1))).toThrow("超限");
    expect(() => parse(encoder.encode(decoder.decode(raw()).replace('data: {"id"', 'data: { "id"')))).not.toThrow();
    expect(() => parse(encoder.encode(decoder.decode(raw()).replace('{"id":"chatcmpl-proof-1","object":"chat.completion.chunk"', '{"object":"chat.completion.chunk","id":"chatcmpl-proof-1"')))).not.toThrow();
    expect(() => parse(encoder.encode(decoder.decode(raw()).replace('data: {"id":"chatcmpl-proof-1"', 'data: {"id":"chatcmpl-proof-1","id":"chatcmpl-forged"')))).toThrow("duplicate key");
    for (const value of ["17.0", "17e0", "9007199254740990.5"]) {
      expect(() => parse(encoder.encode(decoder.decode(raw()).replace('"created":17', `"created":${value}`)))).toThrow("整数词法");
    }
    expect(() => parse(raw(), "bad\ud800")).toThrow("surrogate");
  });

  it("requires one optional empty role prelude followed by 1..N nonempty content deltas", () => {
    expect(() => parse(mutate((frames) => {
      const event = jsonFrame(frames, 0);
      (event.choices as Array<Record<string, unknown>>)[0].delta = { content: "x" };
      return replaceJson(frames, 0, event);
    }))).not.toThrow();
    expect(() => parse(mutate((frames) => {
      const event = jsonFrame(frames, 0);
      (event.choices as Array<Record<string, unknown>>)[0].delta = { role: "assistant", content: "not-empty" };
      return replaceJson(frames, 0, event);
    }))).toThrow("role prelude");
    expect(() => parse(mutate((frames) => {
      const event = jsonFrame(frames, 1);
      (event.choices as Array<Record<string, unknown>>)[0].delta = { role: "assistant", content: "x" };
      return replaceJson(frames, 1, event);
    }))).toThrow("字段集合");
    expect(() => parse(mutate((frames) => {
      const event = jsonFrame(frames, 1);
      (event.choices as Array<Record<string, unknown>>)[0].delta = { content: "" };
      return replaceJson(frames, 1, event);
    }))).toThrow("不得空洞");
    expect(() => parse(mutate((frames) => [...frames.slice(0, 1), ...frames.slice(4)]))).toThrow("1..N");
  });

  it("rejects identity drift, illegal fields, tool/reasoning content and malformed choices", () => {
    for (const [index, field, value, message] of [
      [1, "id", "chatcmpl-other", "id 漂移"],
      [1, "model", "other", "model 漂移"],
      [1, "created", 18, "created 漂移"],
      [1, "object", "chat.completion", "object/model 漂移"],
    ] as const) expect(() => parse(mutate((frames) => {
      const event = jsonFrame(frames, index);
      event[field] = value;
      return replaceJson(frames, index, event);
    }))).toThrow(message);
    expect(() => parse(mutate((frames) => {
      const event = jsonFrame(frames, 1);
      event.extra = true;
      return replaceJson(frames, 1, event);
    }))).toThrow("字段集合");
    for (const illegalDelta of [{ content: "x", tool_calls: [] }, { content: "x", reasoning: "secret" }]) {
      expect(() => parse(mutate((frames) => {
        const event = jsonFrame(frames, 1);
        (event.choices as Array<Record<string, unknown>>)[0].delta = illegalDelta;
        return replaceJson(frames, 1, event);
      }))).toThrow("字段集合");
    }
    for (const choices of [[], [{ index: 1, delta: { content: "x" }, finish_reason: null }], [
      { index: 0, delta: { content: "x" }, finish_reason: null }, { index: 1, delta: { content: "y" }, finish_reason: null },
    ]]) expect(() => parse(mutate((frames) => {
      const event = jsonFrame(frames, 1);
      event.choices = choices;
      return replaceJson(frames, 1, event);
    }))).toThrow(/choice/);
  });

  it("requires unique stop, usage-only and final DONE with no trailing content", () => {
    for (const finishReason of ["length", "error", "tool_calls", null]) expect(() => parse(mutate((frames) => {
      const event = jsonFrame(frames, 4);
      (event.choices as Array<Record<string, unknown>>)[0].finish_reason = finishReason;
      return replaceJson(frames, 4, event);
    }))).toThrow("finish_reason");
    expect(() => parse(mutate((frames) => [...frames.slice(0, 4), ...frames.slice(5)]))).toThrow();
    expect(() => parse(mutate((frames) => [...frames.slice(0, -1), frames[4], frames.at(-1)!]))).toThrow();
    expect(() => parse(mutate((frames) => [...frames.slice(0, -1), frames[5], frames.at(-1)!]))).toThrow();
    expect(() => parse(mutate((frames) => frames.slice(0, -1)))).toThrow("DONE");
    expect(() => parse(mutate((frames) => [...frames, "data: [DONE]"]))).toThrow("DONE");
    expect(() => parse(encoder.encode(`${decoder.decode(raw())}data: {}\n\n`))).toThrow("DONE");
    expect(() => parse(mutate((frames) => {
      const event = jsonFrame(frames, 5);
      event.choices = [{ index: 0, delta: {}, finish_reason: null }];
      return replaceJson(frames, 5, event);
    }))).toThrow("usage-only");
  });

  it("rejects usage drift, unsafe cache/reasoning values and duplicate usage fields", () => {
    for (const [path, value] of [
      ["prompt_tokens", -1], ["completion_tokens", 1.5], ["total_tokens", 999],
    ] as const) expect(() => parse(mutate((frames) => {
      const event = jsonFrame(frames, 5);
      (event.usage as Record<string, unknown>)[path] = value;
      return replaceJson(frames, 5, event);
    }))).toThrow();
    for (const [detail, field] of [["prompt_tokens_details", "cached_tokens"], ["completion_tokens_details", "reasoning_tokens"]] as const) {
      expect(() => parse(mutate((frames) => {
        const event = jsonFrame(frames, 5);
        ((event.usage as Record<string, unknown>)[detail] as Record<string, unknown>)[field] = 1;
        return replaceJson(frames, 5, event);
      }))).toThrow("必须为 0");
    }
    expect(() => parse(encoder.encode(decoder.decode(raw()).replace('"prompt_tokens":11', '"prompt_tokens":11,"prompt_tokens":12')))).toThrow("duplicate key");
    expect(() => parseFormalOraclePiResponseStreamV1({ raw_sse_bytes: raw(), expected_model: "model-v1", ...hashes, expected_max_input_tokens: 10 })).toThrow("budget");
    expect(() => parseFormalOraclePiResponseStreamV1({ raw_sse_bytes: raw(), expected_model: "model-v1", ...hashes, expected_max_output_tokens: 6 })).toThrow("budget");
  });
});
