import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256.js";
import {
  buildFormalOraclePiRequestEnvelope,
  type FormalOraclePiRequestBuildInput,
} from "./oracle-gate-request.js";
import {
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES,
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
  FORMAL_ORACLE_USER_PROMPT_VERSION,
  renderFormalOracleUserPrompt,
} from "./oracle-gate-user-prompt.js";
import { ORACLE_GATE_RESPONSE_SCHEMA_SHA256 } from "./oracle-gate-response.js";
import {
  FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
  FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
  FORMAL_ORACLE_PROVIDER_TOKEN_FIELD,
  assertFormalOraclePreparedProviderRequestArtifact,
  buildFormalOraclePreparedProviderRequest,
  parseFormalOraclePreparedProviderRequestBytes,
} from "./oracle-gate-provider-request.js";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

function envelope(visual = true) {
  const transcript = text("trusted transcript\n"), system = text("system\n"), image = Uint8Array.from([1, 2, 3, 4]);
  const prompt = renderFormalOracleUserPrompt({
    prompt_version: FORMAL_ORACLE_USER_PROMPT_VERSION,
    user_template_bytes: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES,
    expected_user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
    selected_transcript_bytes: transcript,
    expected_selected_transcript_sha256: sha256Hex(transcript),
    expected_selected_transcript_byte_length: transcript.byteLength,
    visual_input_available: visual,
    output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  });
  const input: FormalOraclePiRequestBuildInput = {
    request_id: "REQ-1", schedule_index: 0, case_id: "CASE-1", arm: visual ? "static_final_board" : "transcript_only",
    model: "model-v1", system_prompt_bytes: system, expected_system_prompt_sha256: sha256Hex(system),
    user_prompt: prompt, expected_rendered_user_prompt_sha256: prompt.prompt_sha256,
    expected_user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
    output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
    visuals: visual ? [{ label: "visual-1", mime_type: "image/jpeg", bytes: image, expected_sha256: sha256Hex(image), expected_byte_length: image.byteLength }] : [],
    seed: 7, temperature: 0, max_input_tokens: 100, max_output_tokens: 50, timeout_ms: 1000, max_attempts: 2,
    transport: "pi", cache_retention: "none", tools_policy: "none",
  };
  return buildFormalOraclePiRequestEnvelope(input);
}

describe("Formal Oracle Pi fetch-boundary provider body candidate", () => {
  it("builds the exact Pi-shaped JSON serialization candidate without local provenance", () => {
    const source = envelope();
    const built = buildFormalOraclePreparedProviderRequest(source);
    assertFormalOraclePreparedProviderRequestArtifact(built);
    expect(built).toMatchObject({
      provider_body_profile: FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
      provider_body_dispatch_status: "pending_local_pi_fetch_boundary_proof_non_executable",
      adapter_version: FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
      token_field: FORMAL_ORACLE_PROVIDER_TOKEN_FIELD,
      request_envelope_sha256: source.payload_sha256,
      max_input_tokens: 100,
      http_method: "POST", content_type: "application/json", redirect_policy_status: "not_bound_by_pi_sdk_fetch_boundary", hidden_provider_retries: 0,
      pi_sdk_fetch_boundary_equivalence_status: "pending_local_fake_fetch_proof",
      api_execution_allowed: false,
    });
    expect(built.provider_body_sha256).toBe(sha256Hex(built.body_bytes));
    expect(built.body).toMatchObject({
      model: "model-v1", stream: true, stream_options: { include_usage: true },
      max_completion_tokens: 50, temperature: 0, seed: 7, store: false,
    });
    expect(built.body.messages[0]).toEqual({ role: "system", content: "system\n" });
    expect(built.body.messages[1].content.slice(1)).toEqual([
      { type: "text", text: `[VISUAL visual-1 sha256=${source.envelope.visuals[0].sha256}]` },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AQIDBA==" } },
    ]);
    expect(new TextDecoder().decode(built.body_bytes)).not.toMatch(/request_id|case_id|arm|timeout|max_attempts|cache_retention|provider_binding/);
    expect(new TextDecoder().decode(built.body_bytes)).toBe(JSON.stringify(built.body));
    expect(parseFormalOraclePreparedProviderRequestBytes({ request_envelope: source, provider_body_bytes: built.body_bytes }).provider_body_sha256).toBe(built.provider_body_sha256);
  });

  it("rejects duplicate, invalid UTF-8, noncanonical, unknown, wrong token field and envelope drift", () => {
    const source = envelope(), built = buildFormalOraclePreparedProviderRequest(source);
    const body = new TextDecoder().decode(built.body_bytes);
    const attempt = (value: string) => parseFormalOraclePreparedProviderRequestBytes({ request_envelope: source, provider_body_bytes: text(value) });
    expect(() => attempt(body.replace('"model":', '"model":"x","model":'))).toThrow("duplicate");
    expect(() => parseFormalOraclePreparedProviderRequestBytes({ request_envelope: source, provider_body_bytes: Uint8Array.from([0xff]) })).toThrow("UTF-8");
    expect(() => attempt(` ${body}`)).toThrow("canonical");
    expect(() => attempt(body.replace(/^(\{"model"[^,]+),("messages"[^]*?)(,"stream":true)/, "{$2,$1$3"))).toThrow();
    expect(() => attempt(body.replace("{", '{"unknown":true,'))).toThrow("字段集合");
    expect(() => attempt(body.replace('"max_completion_tokens":50', '"max_tokens":50'))).toThrow("字段集合");
    for (const [from, to] of [
      ['"model":"model-v1"', '"model":"drift"'],
      ['"temperature":0', '"temperature":1'],
      ['"seed":7', '"seed":8'],
      ['"store":false', '"store":true'],
      ['"include_usage":true', '"include_usage":false'],
      ['"stream":true', '"tools":[],"stream":true'],
      ['[VISUAL visual-1 sha256=', '[VISUAL visual-2 sha256='],
      ['data:image/jpeg;base64,AQIDBA==', 'data:image/jpeg;base64,AQIDBB=='],
    ] as const) expect(() => attempt(body.replace(from, to))).toThrow();
    const textEnvelope = envelope(false);
    expect(() => parseFormalOraclePreparedProviderRequestBytes({ request_envelope: textEnvelope, provider_body_bytes: built.body_bytes })).toThrow("绑定");
  });

  it("rejects caller-forged brands and mutation at the reparse boundary", () => {
    const source = envelope(), built = buildFormalOraclePreparedProviderRequest(source);
    expect(() => assertFormalOraclePreparedProviderRequestArtifact(structuredClone(built))).toThrow("伪造");
    built.body_bytes[0] ^= 1;
    expect(() => parseFormalOraclePreparedProviderRequestBytes({ request_envelope: source, provider_body_bytes: built.body_bytes })).toThrow();
  });
});
