import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { sha256Hex } from "./sha256.js";
import {
  assertFormalOraclePiRequestArtifact,
  buildFormalOraclePiRequestEnvelope,
  parseFormalOraclePiRequestEnvelopeBytes,
  type FormalOraclePiRequestBuildInput,
} from "./oracle-gate-request.js";

const text = (value: string) => new TextEncoder().encode(value);

function fixture(visual = true): FormalOraclePiRequestBuildInput {
  const system = text("system\n"), user = text("user\n"), template = text("template {{case}}\n"), image = Uint8Array.from([1, 2, 3, 4]);
  return {
    request_id: "FREQ-1", schedule_index: 0, case_id: "FCASE-1", arm: visual ? "static_final_board" : "transcript_only",
    model: "formal-model", system_prompt_bytes: system, expected_system_prompt_sha256: sha256Hex(system),
    rendered_user_prompt_bytes: user, expected_rendered_user_prompt_sha256: sha256Hex(user),
    user_template_bytes: template, expected_user_template_sha256: sha256Hex(template), output_schema_sha256: "a".repeat(64),
    visuals: visual ? [{ label: "visual-1", mime_type: "image/jpeg", bytes: image, expected_sha256: sha256Hex(image), expected_byte_length: 4 }] : [],
    seed: 7, temperature: 0, max_input_tokens: 100, max_output_tokens: 50, timeout_ms: 1000, max_attempts: 2,
    transport: "pi", cache_retention: "none", tools_policy: "none",
  };
}

const nodeSha = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex");

describe("Formal Oracle Pi request envelope", () => {
  it("builds and parses exact canonical branded bytes", () => {
    const built = buildFormalOraclePiRequestEnvelope(fixture());
    assertFormalOraclePiRequestArtifact(built);
    const parsed = parseFormalOraclePiRequestEnvelopeBytes(built.bytes);
    expect(parsed.payload_sha256).toBe(built.payload_sha256);
    expect(built.payload_sha256).toBe(nodeSha(built.bytes));
    expect(parsed.envelope.visuals[0]).toMatchObject({ label: "visual-1", data_base64: "AQIDBA==" });
    expect(() => assertFormalOraclePiRequestArtifact(JSON.parse(JSON.stringify(parsed)))).toThrow("伪造");
  });

  it("detects caller mutation of branded artifact bytes at the parsing/consumer boundary", () => {
    const built = buildFormalOraclePiRequestEnvelope(fixture());
    built.bytes[0] ^= 1;
    assertFormalOraclePiRequestArtifact(built);
    expect(() => parseFormalOraclePiRequestEnvelopeBytes(built.bytes)).toThrow();
    expect(nodeSha(built.bytes)).not.toBe(built.payload_sha256);
  });

  it("matches Node SHA-256 for byte arrays including block boundaries and subarray offsets", () => {
    const backing = Uint8Array.from({ length: 140 }, (_, index) => index & 0xff);
    for (const bytes of [new Uint8Array(), Uint8Array.from([1, 2, 3]), backing.slice(0, 65), backing.subarray(7, 136)]) {
      expect(sha256Hex(bytes)).toBe(nodeSha(bytes));
    }
  });

  it("rejects arbitrary, invalid UTF-8, duplicate, unknown and non-canonical JSON", () => {
    expect(() => parseFormalOraclePiRequestEnvelopeBytes(text("arbitrary"))).toThrow();
    expect(() => parseFormalOraclePiRequestEnvelopeBytes(Uint8Array.from([0xff]))).toThrow("UTF-8");
    const source = new TextDecoder().decode(buildFormalOraclePiRequestEnvelope(fixture(false)).bytes);
    expect(() => parseFormalOraclePiRequestEnvelopeBytes(text(source.replace('"arm":', '"arm":"transcript_only","arm":')))).toThrow("duplicate key");
    expect(() => parseFormalOraclePiRequestEnvelopeBytes(text(source.replace("{", '{"unknown":true,')))).toThrow("字段集合");
    expect(() => parseFormalOraclePiRequestEnvelopeBytes(text(` ${source}`))).toThrow("canonical");
    expect(() => parseFormalOraclePiRequestEnvelopeBytes(text(source.replace('"model":"formal-model"', '"model":"\\ud800"')))).toThrow("unpaired surrogate");
    expect(() => parseFormalOraclePiRequestEnvelopeBytes(text(source.replace('"tools":[]', '"tools":[{"\\udfff":true}]')))).toThrow("unpaired surrogate");
    const paired = fixture(); paired.model = "formal-😀-model";
    expect(parseFormalOraclePiRequestEnvelopeBytes(buildFormalOraclePiRequestEnvelope(paired).bytes).envelope.model).toBe("formal-😀-model");
  });

  it("rejects prompt, fifth visual, base64, label, tools and retry drift", () => {
    const prompt = fixture(); prompt.expected_system_prompt_sha256 = "0".repeat(64);
    expect(() => buildFormalOraclePiRequestEnvelope(prompt)).toThrow("prompt/template");
    const fifth = fixture(); fifth.visuals.push(...Array.from({ length: 4 }, () => fifth.visuals[0]));
    expect(() => buildFormalOraclePiRequestEnvelope(fifth)).toThrow("visual 数量");
    const source = new TextDecoder().decode(buildFormalOraclePiRequestEnvelope(fixture()).bytes);
    const altered = (from: string, to: string) => text(source.replace(from, to));
    expect(() => parseFormalOraclePiRequestEnvelopeBytes(altered('"data_base64":"AQIDBA=="', '"data_base64":"AQIDBB=="'))).toThrow(/bytes|base64/);
    expect(() => parseFormalOraclePiRequestEnvelopeBytes(altered('"label":"visual-1"', '"label":"visual-2"'))).toThrow("metadata");
    expect(() => parseFormalOraclePiRequestEnvelopeBytes(altered('"tools":[]', '"tools":[{}]'))).toThrow("transport/cache/tools");
    expect(() => parseFormalOraclePiRequestEnvelopeBytes(altered('"inner_provider_retries":0', '"inner_provider_retries":1'))).toThrow("provider/retry");
    for (const [from, to] of [
      ['"model":"formal-model"', '"model":"other-model"'],
      ['"seed":7', '"seed":8'],
      ['"max_output_tokens":50', '"max_output_tokens":51'],
      ['"cache_retention":"none"', '"cache_retention":"local"'],
    ] as const) {
      const changed = altered(from, to);
      if (from.includes("cache_retention")) expect(() => parseFormalOraclePiRequestEnvelopeBytes(changed)).toThrow();
      else expect(parseFormalOraclePiRequestEnvelopeBytes(changed).payload_sha256).not.toBe(buildFormalOraclePiRequestEnvelope(fixture()).payload_sha256);
    }
  });
});
