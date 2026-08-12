import { describe, expect, it, vi } from "vitest";
import { buildFormalOraclePreparedProviderRequest } from "../../contracts/src/oracle-gate-provider-request.js";
import { buildFormalOraclePiRequestEnvelope } from "../../contracts/src/oracle-gate-request.js";
import {
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES,
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
  FORMAL_ORACLE_USER_PROMPT_VERSION,
  renderFormalOracleUserPrompt,
} from "../../contracts/src/oracle-gate-user-prompt.js";
import { ORACLE_GATE_RESPONSE_SCHEMA_SHA256 } from "../../contracts/src/oracle-gate-response.js";
import { sha256Hex } from "../../contracts/src/sha256.js";
import { exerciseNonProductionFormalOraclePreparedTransportWithFakeFetch } from "./formalOraclePreparedTransport.js";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);
function prepared() {
  const transcript = text("trusted\n"), system = text("system\n");
  const prompt = renderFormalOracleUserPrompt({
    prompt_version: FORMAL_ORACLE_USER_PROMPT_VERSION, user_template_bytes: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES,
    expected_user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
    selected_transcript_bytes: transcript, expected_selected_transcript_sha256: sha256Hex(transcript),
    expected_selected_transcript_byte_length: transcript.byteLength, visual_input_available: false,
    output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  });
  return buildFormalOraclePreparedProviderRequest(buildFormalOraclePiRequestEnvelope({
    request_id: "REQ-1", schedule_index: 0, case_id: "CASE-1", arm: "transcript_only", model: "model-v1",
    system_prompt_bytes: system, expected_system_prompt_sha256: sha256Hex(system), user_prompt: prompt,
    expected_rendered_user_prompt_sha256: prompt.prompt_sha256, expected_user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
    output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256, visuals: [], seed: 7, temperature: 0,
    max_input_tokens: 100, max_output_tokens: 50, timeout_ms: 1000, max_attempts: 2,
    transport: "pi", cache_retention: "none", tools_policy: "none",
  }));
}

describe("Formal Oracle fake prepared transport harness", () => {
  it("passes exact prepared bytes to one injected fetch with fail-closed init", async () => {
    const artifact = prepared();
    const fake = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect(init.redirect).toBe("error");
      expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer runtime-secret" });
      expect(init.body).toBeInstanceOf(Uint8Array);
      expect([...init.body as Uint8Array]).toEqual([...artifact.body_bytes]);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      (init.body as Uint8Array)[0] ^= 1;
      return new Response("fixture", { status: 200 });
    });
    const response = await exerciseNonProductionFormalOraclePreparedTransportWithFakeFetch({
      prepared: artifact, endpoint: "https://example.invalid/v1/chat/completions", api_key: "runtime-secret", fetch: fake,
    });
    expect(response.status).toBe(200);
    expect(fake).toHaveBeenCalledTimes(1);
    expect(artifact.provider_body_sha256).toBe(sha256Hex(artifact.body_bytes));
    expect(new TextDecoder().decode(artifact.body_bytes)).not.toContain("runtime-secret");
  });

  it("rejects real endpoints, malformed credentials, forged brands and mutated bytes before fake fetch", async () => {
    const artifact = prepared(), fake = vi.fn(async () => new Response("fixture"));
    await expect(exerciseNonProductionFormalOraclePreparedTransportWithFakeFetch({ prepared: artifact, endpoint: "https://api.openai.com/v1/chat/completions", api_key: "x", fetch: fake })).rejects.toThrow("example.invalid");
    await expect(exerciseNonProductionFormalOraclePreparedTransportWithFakeFetch({ prepared: artifact, endpoint: "https://example.invalid/v1/chat/completions", api_key: "x\nleak", fetch: fake })).rejects.toThrow("API key");
    await expect(exerciseNonProductionFormalOraclePreparedTransportWithFakeFetch({ prepared: structuredClone(artifact), endpoint: "https://example.invalid/v1/chat/completions", api_key: "x", fetch: fake })).rejects.toThrow("伪造");
    artifact.body_bytes[0] ^= 1;
    await expect(exerciseNonProductionFormalOraclePreparedTransportWithFakeFetch({ prepared: artifact, endpoint: "https://example.invalid/v1/chat/completions", api_key: "x", fetch: fake })).rejects.toThrow();
    expect(fake).not.toHaveBeenCalled();
  });
});
