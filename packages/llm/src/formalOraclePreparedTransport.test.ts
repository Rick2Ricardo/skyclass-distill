import { describe, expect, it } from "vitest";
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
import { proveNonProductionFormalOraclePiFetchBoundary } from "./formalOraclePreparedTransport.js";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);
function prepared(maxOutputTokens = 2048, visual = false) {
  const transcript = text("trusted\n"), system = text("system\n");
  const image = Uint8Array.from([1, 2, 3, 4]);
  const prompt = renderFormalOracleUserPrompt({
    prompt_version: FORMAL_ORACLE_USER_PROMPT_VERSION, user_template_bytes: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES,
    expected_user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
    selected_transcript_bytes: transcript, expected_selected_transcript_sha256: sha256Hex(transcript),
    expected_selected_transcript_byte_length: transcript.byteLength, visual_input_available: visual,
    output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  });
  return buildFormalOraclePreparedProviderRequest(buildFormalOraclePiRequestEnvelope({
    request_id: "REQ-1", schedule_index: 0, case_id: "CASE-1", arm: visual ? "static_final_board" : "transcript_only", model: "model-v1",
    system_prompt_bytes: system, expected_system_prompt_sha256: sha256Hex(system), user_prompt: prompt,
    expected_rendered_user_prompt_sha256: prompt.prompt_sha256, expected_user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
    output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
    visuals: visual ? [{ label: "visual-1", mime_type: "image/jpeg", bytes: image, expected_sha256: sha256Hex(image), expected_byte_length: image.byteLength }] : [],
    seed: 7, temperature: 0,
    max_input_tokens: 4200, max_output_tokens: maxOutputTokens, timeout_ms: 1000, max_attempts: 2,
    transport: "pi", cache_retention: "none", tools_policy: "none",
  }));
}

describe("Formal Oracle non-production Pi fetch-boundary proof", () => {
  it("uses real Pi Models.complete and OpenAI SDK once with internally guarded no-network fetch", async () => {
    const artifact = prepared(2048);
    const proof = await proveNonProductionFormalOraclePiFetchBoundary({ prepared: artifact });
    expect(proof).toMatchObject({
      fetch_count: 1, on_payload_count: 1, on_payload_replacement: false,
      completion_method: "models.complete_non_simple", requested_max_tokens: 2048,
      captured_max_completion_tokens: 2048, node_engine_status: "pending_incompatible_node_engine",
      redirect_policy_status: "pending_not_bound_by_pi_sdk_fetch_boundary",
      runtime_toolchain_status: "pending_incompatible_node_engine_and_external_immutable_capsule",
      proof_status: "local_fake_fetch_exact_body_proved_non_executable", api_execution_allowed: false,
      provider_response_capture_status: "pending_strict_sse_capture_contract",
    });
    expect(artifact.provider_body_dispatch_status).toBe("pending_local_pi_fetch_boundary_proof_non_executable");
    expect(artifact.pi_sdk_fetch_boundary_equivalence_status).toBe("pending_local_fake_fetch_proof");
    expect(new TextDecoder().decode(artifact.body_bytes)).not.toContain("runtime-secret");
  });

  it("round-trips the neutral visual sha label and JPEG data URL through the real Pi request path", async () => {
    const artifact = prepared(2048, true);
    expect(artifact.body.messages[1].content.slice(-2)).toEqual([
      { type: "text", text: expect.stringMatching(/^\[VISUAL visual-1 sha256=[a-f0-9]{64}\]$/) },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AQIDBA==" } },
    ]);
    await expect(proveNonProductionFormalOraclePiFetchBoundary({ prepared: artifact })).resolves.toMatchObject({
      fetch_count: 1, provider_body_sha256: artifact.provider_body_sha256,
    });
  });

  it("has no caller fetch/key surface and rejects forged brands and mutated bytes before Pi", async () => {
    const artifact = prepared();
    await expect(proveNonProductionFormalOraclePiFetchBoundary({ prepared: structuredClone(artifact) })).rejects.toThrow("伪造");
    artifact.body_bytes[0] ^= 1;
    await expect(proveNonProductionFormalOraclePiFetchBoundary({ prepared: artifact })).rejects.toThrow();
  });
});
