import { describe, expect, it } from "vitest";
import {
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE,
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES,
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
  FORMAL_ORACLE_USER_PROMPT_VERSION,
  assertFormalOracleUserPromptArtifact,
  parseFormalOracleUserPromptBytes,
  renderFormalOracleUserPrompt,
} from "./oracle-gate-user-prompt.js";
import { ORACLE_GATE_RESPONSE_SCHEMA_SHA256 } from "./oracle-gate-response.js";
import { sha256Hex } from "./sha256.js";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

function render(visual = false) {
  const transcript = text("[00:00:00.000 --> 00:00:00.750] 先观察板书\n");
  return renderFormalOracleUserPrompt({
    prompt_version: FORMAL_ORACLE_USER_PROMPT_VERSION,
    user_template_bytes: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES,
    expected_user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
    selected_transcript_bytes: transcript,
    expected_selected_transcript_sha256: sha256Hex(transcript),
    expected_selected_transcript_byte_length: transcript.byteLength,
    visual_input_available: visual,
    output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  });
}

describe("Formal Oracle deterministic user prompt renderer", () => {
  it("renders identical task/transcript/schema across conditions and changes only evidence availability", () => {
    const textPrompt = parseFormalOracleUserPromptBytes(render(false).bytes);
    const visualPrompt = parseFormalOracleUserPromptBytes(render(true).bytes);
    expect(textPrompt.selected_transcript).toBe(visualPrompt.selected_transcript);
    expect(textPrompt.task_instruction).toBe(visualPrompt.task_instruction);
    expect(textPrompt.rules).toEqual(visualPrompt.rules);
    expect(textPrompt.output_schema).toEqual(visualPrompt.output_schema);
    expect(textPrompt.evidence_availability["visual-1"]).toBe(false);
    expect(visualPrompt.evidence_availability["visual-1"]).toBe(true);
    expect(new TextDecoder().decode(visualPrompt.output_schema ? render(true).bytes : new Uint8Array())).not.toMatch(/oracle|case[_ -]?id|gold|semantic_label|condition/i);
    expect(() => assertFormalOracleUserPromptArtifact(structuredClone(render()))).toThrow("伪造");
  });

  it("cannot replay the frozen schema hash alongside a mutated schema prompt", () => {
    const source = new TextDecoder().decode(render().bytes);
    const mutated = source.replace('"name":"string"', '"name":"mutated"');
    expect(mutated).not.toBe(source);
    expect(() => parseFormalOracleUserPromptBytes(text(mutated))).toThrow("漂移");
    expect(() => renderFormalOracleUserPrompt({
      prompt_version: FORMAL_ORACLE_USER_PROMPT_VERSION,
      user_template_bytes: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES,
      expected_user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
      selected_transcript_bytes: text("trusted transcript\n"),
      expected_selected_transcript_sha256: sha256Hex(text("trusted transcript\n")),
      expected_selected_transcript_byte_length: text("trusted transcript\n").byteLength,
      visual_input_available: false,
      output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
    })).not.toThrow();
  });

  it("treats transcript brace literals as data instead of renderer placeholders", () => {
    for (const transcriptValue of ["teacher writes {{x}}", "{{SELECTED_TRANSCRIPT}}"] as const) {
      const transcript = text(transcriptValue);
      const artifact = renderFormalOracleUserPrompt({
        prompt_version: FORMAL_ORACLE_USER_PROMPT_VERSION,
        user_template_bytes: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES,
        expected_user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
        selected_transcript_bytes: transcript,
        expected_selected_transcript_sha256: sha256Hex(transcript),
        expected_selected_transcript_byte_length: transcript.byteLength,
        visual_input_available: false,
        output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
      });
      expect(artifact.prompt_sha256).toBe(sha256Hex(artifact.bytes));
      expect(parseFormalOracleUserPromptBytes(artifact.bytes).selected_transcript).toBe(transcriptValue);
    }
  });

  it("rejects template unknown/missing/duplicate placeholders and grammar/newline/Unicode drift", () => {
    const transcript = text("trusted transcript\n");
    const attempt = (template: string) => renderFormalOracleUserPrompt({
      prompt_version: FORMAL_ORACLE_USER_PROMPT_VERSION,
      user_template_bytes: text(template), expected_user_template_sha256: sha256Hex(text(template)),
      selected_transcript_bytes: transcript, expected_selected_transcript_sha256: sha256Hex(transcript),
      expected_selected_transcript_byte_length: transcript.byteLength, visual_input_available: false,
      output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
    });
    for (const template of [
      FORMAL_ORACLE_USER_PROMPT_TEMPLATE.replace("{{SELECTED_TRANSCRIPT}}", "{{UNKNOWN}}"),
      FORMAL_ORACLE_USER_PROMPT_TEMPLATE.replace("{{SELECTED_TRANSCRIPT}}", "null"),
      FORMAL_ORACLE_USER_PROMPT_TEMPLATE.replace("{{SELECTED_TRANSCRIPT}}", "{{SELECTED_TRANSCRIPT}}{{SELECTED_TRANSCRIPT}}"),
      `${FORMAL_ORACLE_USER_PROMPT_TEMPLATE}\n`,
      FORMAL_ORACLE_USER_PROMPT_TEMPLATE.replace("分析", "分\u200b析"),
    ]) expect(() => attempt(template)).toThrow();
    const surrogate = FORMAL_ORACLE_USER_PROMPT_TEMPLATE.replace("分析", "\\ud800");
    expect(() => attempt(surrogate)).toThrow();
  });

  it("rejects transcript hash/length/UTF-8/surrogate and parsed prompt drift", () => {
    const base = {
      prompt_version: FORMAL_ORACLE_USER_PROMPT_VERSION,
      user_template_bytes: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES,
      expected_user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
      selected_transcript_bytes: text("trusted\n"), expected_selected_transcript_sha256: sha256Hex(text("trusted\n")),
      expected_selected_transcript_byte_length: text("trusted\n").byteLength, visual_input_available: false,
      output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
    };
    expect(() => renderFormalOracleUserPrompt({ ...base, expected_selected_transcript_sha256: "0".repeat(64) })).toThrow();
    expect(() => renderFormalOracleUserPrompt({ ...base, expected_selected_transcript_byte_length: 1 })).toThrow();
    expect(() => renderFormalOracleUserPrompt({ ...base, selected_transcript_bytes: Uint8Array.from([0xff]) })).toThrow("UTF-8");
    expect(() => renderFormalOracleUserPrompt({ ...base, selected_transcript_bytes: text("\ud800") })).toThrow();
    const source = new TextDecoder().decode(render().bytes);
    expect(() => parseFormalOracleUserPromptBytes(text(source.replace('"schema_version":', '"schema_version":"x","schema_version":')))).toThrow("duplicate key");
    expect(() => parseFormalOracleUserPromptBytes(text(source.replace("先观察板书", "\\ud800")))).toThrow("surrogate");
    expect(() => parseFormalOracleUserPromptBytes(text(source.replace('"transcript":true', '"transcript":false')))).toThrow("漂移");
    expect(() => parseFormalOracleUserPromptBytes(text(` ${source}`))).toThrow("canonical renderer");
  });
});
