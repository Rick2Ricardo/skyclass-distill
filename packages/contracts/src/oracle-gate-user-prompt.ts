import {
  ORACLE_GATE_RESPONSE_SCHEMA,
  ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  canonicalOracleGateJson,
} from "./oracle-gate-response.js";
import { sha256Hex } from "./sha256.js";

export const FORMAL_ORACLE_USER_PROMPT_VERSION = "teacher-evidence-user-prompt-v1" as const;
export const FORMAL_ORACLE_USER_PROMPT_PLACEHOLDERS = [
  "{{EVIDENCE_AVAILABILITY}}",
  "{{OUTPUT_SCHEMA}}",
  "{{SELECTED_TRANSCRIPT}}",
] as const;

const TASK_INSTRUCTION = "分析同一课堂事件。所有实验条件使用完全相同的任务与输出结构；只能依据本请求实际提供的证据槽。";
const RULES = [
  "observed_board_actions 按可恢复的时间顺序排列；无法从可用证据恢复时使用 unknown。",
  "generalized_teaching_capability 必须参数化、可迁移且渲染器中立。",
  "evidence_slot 只能使用 transcript、visual-1 或 uncertain，并且必须符合 evidence_availability。",
  "只描述教师行为、板书和教学能力；自由文本语义质量由后续外部盲评处理。",
] as const;

/** Exact canonical JSON grammar. Each placeholder occurs exactly once. */
export const FORMAL_ORACLE_USER_PROMPT_TEMPLATE = `{"evidence_availability":{{EVIDENCE_AVAILABILITY}},"output_schema":{{OUTPUT_SCHEMA}},"rules":${canonicalOracleGateJson(RULES)},"schema_version":"${FORMAL_ORACLE_USER_PROMPT_VERSION}","selected_transcript":{{SELECTED_TRANSCRIPT}},"task_instruction":${JSON.stringify(TASK_INSTRUCTION)}}`;
export const FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES = new TextEncoder().encode(FORMAL_ORACLE_USER_PROMPT_TEMPLATE);
export const FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256 = sha256Hex(FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES);

export interface FormalOracleUserPromptArtifact {
  readonly bytes: Uint8Array;
  readonly prompt_sha256: string;
  readonly user_template_sha256: typeof FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256;
  readonly selected_transcript_sha256: string;
  readonly visual_input_available: boolean;
}

export interface FormalOracleParsedUserPromptV1 {
  schema_version: typeof FORMAL_ORACLE_USER_PROMPT_VERSION;
  selected_transcript: string;
  evidence_availability: { transcript: true; uncertain: true; "visual-1": boolean };
  output_schema: typeof ORACLE_GATE_RESPONSE_SCHEMA;
  rules: string[];
  task_instruction: typeof TASK_INSTRUCTION;
}

const activePrompts = new WeakSet<object>();

function unicodeScalars(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error(`${label} 含 unpaired surrogate`);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error(`${label} 含 unpaired surrogate`);
  }
}

function strictUtf8(bytes: Uint8Array, label: string): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error(`${label} 不是有效 UTF-8`); }
}

class JsonScanner {
  private index = 0;
  constructor(private readonly source: string) {}
  scan(): void { this.ws(); this.value(); this.ws(); if (this.index !== this.source.length) throw new Error("Formal user prompt 含 JSON 尾随内容"); }
  private ws(): void { while (/[\u0009\u000a\u000d\u0020]/.test(this.source[this.index] || "")) this.index += 1; }
  private value(): void {
    const token = this.source[this.index];
    if (token === "{") this.object(); else if (token === "[") this.array(); else if (token === '"') this.string();
    else if (token === "-" || (token >= "0" && token <= "9")) this.number();
    else if (this.source.startsWith("true", this.index)) this.index += 4;
    else if (this.source.startsWith("false", this.index)) this.index += 5;
    else if (this.source.startsWith("null", this.index)) this.index += 4;
    else throw new Error("Formal user prompt 不是严格 JSON");
  }
  private object(): void {
    this.index += 1; this.ws(); const seen = new Set<string>();
    if (this.source[this.index] === "}") { this.index += 1; return; }
    while (true) {
      if (this.source[this.index] !== '"') throw new Error("Formal user prompt object key 无效");
      const key = this.string(); unicodeScalars(key, "Formal user prompt object key");
      if (seen.has(key)) throw new Error(`Formal user prompt 含 duplicate key：${key}`); seen.add(key); this.ws();
      if (this.source[this.index] !== ":") throw new Error("Formal user prompt object 缺少冒号");
      this.index += 1; this.ws(); this.value(); this.ws();
      if (this.source[this.index] === "}") { this.index += 1; return; }
      if (this.source[this.index] !== ",") throw new Error("Formal user prompt object 分隔符无效");
      this.index += 1; this.ws();
    }
  }
  private array(): void {
    this.index += 1; this.ws(); if (this.source[this.index] === "]") { this.index += 1; return; }
    while (true) {
      this.value(); this.ws(); if (this.source[this.index] === "]") { this.index += 1; return; }
      if (this.source[this.index] !== ",") throw new Error("Formal user prompt array 分隔符无效");
      this.index += 1; this.ws();
    }
  }
  private string(): string {
    const start = this.index; this.index += 1;
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      if (code === 0x22) { this.index += 1; const value = JSON.parse(this.source.slice(start, this.index)) as string; unicodeScalars(value, "Formal user prompt string"); return value; }
      if (code < 0x20) throw new Error("Formal user prompt string 含未转义控制字符");
      if (code === 0x5c) {
        this.index += 1; const escaped = this.source[this.index];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(this.source.slice(this.index + 1, this.index + 5))) throw new Error("Formal user prompt unicode escape 无效");
          this.index += 5; continue;
        }
        if (!escaped || !'"\\/bfnrt'.includes(escaped)) throw new Error("Formal user prompt escape 无效");
      }
      this.index += 1;
    }
    throw new Error("Formal user prompt string 未闭合");
  }
  private number(): void {
    const rest = this.source.slice(this.index), match = /^-?(?:0|[1-9]\d*)/.exec(rest);
    if (!match || rest[match[0].length] === "." || /[eE]/.test(rest[match[0].length] || "")) throw new Error("Formal user prompt 数值只允许整数词法");
    this.index += match[0].length; if (!Number.isSafeInteger(Number(match[0]))) throw new Error("Formal user prompt 数值必须是安全整数");
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} 字段集合无效`);
}

function validateTemplate(templateBytes: Uint8Array): void {
  const template = strictUtf8(templateBytes, "Formal user prompt template");
  unicodeScalars(template, "Formal user prompt template");
  const discovered = [...template.matchAll(/\{\{[^{}]*\}\}/g)].map((match) => match[0]);
  if (JSON.stringify(discovered.sort()) !== JSON.stringify([...FORMAL_ORACLE_USER_PROMPT_PLACEHOLDERS].sort())) {
    throw new Error("Formal user prompt template placeholder 必须 exact、唯一、无缺失");
  }
  if (template !== FORMAL_ORACLE_USER_PROMPT_TEMPLATE) throw new Error("Formal user prompt template grammar/version/newline/Unicode 漂移");
}

function renderBytes(transcript: string, visual: boolean): Uint8Array {
  const replacements = new Map<string, string>([
    ["{{EVIDENCE_AVAILABILITY}}", canonicalOracleGateJson({ transcript: true, uncertain: true, "visual-1": visual })],
    ["{{OUTPUT_SCHEMA}}", canonicalOracleGateJson(ORACLE_GATE_RESPONSE_SCHEMA)],
    ["{{SELECTED_TRANSCRIPT}}", JSON.stringify(transcript)],
  ]);
  const consumed = new Set<string>();
  // The regexp walks the fixed template source only. Replacement values are
  // never rescanned, so transcript text containing literal {{...}} is data.
  const rendered = FORMAL_ORACLE_USER_PROMPT_TEMPLATE.replace(/\{\{[^{}]*\}\}/g, (slot) => {
    const replacement = replacements.get(slot);
    if (replacement === undefined || consumed.has(slot)) throw new Error("Formal user prompt template placeholder 必须 exact、唯一、无缺失");
    consumed.add(slot);
    return replacement;
  });
  if (consumed.size !== replacements.size || [...replacements.keys()].some((slot) => !consumed.has(slot))) {
    throw new Error("Formal user prompt template placeholder 必须 exact、唯一、无缺失");
  }
  return new TextEncoder().encode(rendered);
}

export function renderFormalOracleUserPrompt(input: {
  prompt_version: string;
  user_template_bytes: Uint8Array;
  expected_user_template_sha256: string;
  selected_transcript_bytes: Uint8Array;
  expected_selected_transcript_sha256: string;
  expected_selected_transcript_byte_length: number;
  visual_input_available: boolean;
  output_schema_sha256: string;
}): FormalOracleUserPromptArtifact {
  if (input.prompt_version !== FORMAL_ORACLE_USER_PROMPT_VERSION) throw new Error("Formal user prompt version 无效");
  validateTemplate(input.user_template_bytes);
  if (sha256Hex(input.user_template_bytes) !== FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256
    || input.expected_user_template_sha256 !== FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256) throw new Error("Formal user prompt template SHA-256 无效");
  if (input.output_schema_sha256 !== ORACLE_GATE_RESPONSE_SCHEMA_SHA256) throw new Error("Formal user prompt 未绑定共享 response schema");
  const transcript = strictUtf8(input.selected_transcript_bytes, "selected transcript");
  unicodeScalars(transcript, "selected transcript");
  if (!transcript.length || input.selected_transcript_bytes.byteLength !== input.expected_selected_transcript_byte_length
    || sha256Hex(input.selected_transcript_bytes) !== input.expected_selected_transcript_sha256) {
    throw new Error("Formal user prompt selected transcript bytes/hash/length 无效");
  }
  const bytes = renderBytes(transcript, input.visual_input_available);
  const value = Object.freeze({
    bytes: Uint8Array.from(bytes), prompt_sha256: sha256Hex(bytes),
    user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
    selected_transcript_sha256: input.expected_selected_transcript_sha256,
    visual_input_available: input.visual_input_available,
  });
  activePrompts.add(value);
  return value;
}

export function parseFormalOracleUserPromptBytes(bytes: Uint8Array): FormalOracleParsedUserPromptV1 {
  const source = strictUtf8(bytes, "Formal user prompt bytes");
  new JsonScanner(source).scan();
  const value = JSON.parse(source) as Record<string, unknown>;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Formal user prompt 必须是对象");
  exactKeys(value, ["evidence_availability", "output_schema", "rules", "schema_version", "selected_transcript", "task_instruction"], "Formal user prompt");
  const availability = value.evidence_availability as Record<string, unknown>;
  if (!availability || typeof availability !== "object" || Array.isArray(availability)) throw new Error("Formal user prompt evidence_availability 无效");
  exactKeys(availability, ["transcript", "uncertain", "visual-1"], "Formal user prompt evidence_availability");
  if (availability.transcript !== true || availability.uncertain !== true || typeof availability["visual-1"] !== "boolean"
    || value.schema_version !== FORMAL_ORACLE_USER_PROMPT_VERSION || typeof value.selected_transcript !== "string" || !value.selected_transcript.length
    || value.task_instruction !== TASK_INSTRUCTION || canonicalOracleGateJson(value.rules) !== canonicalOracleGateJson(RULES)
    || canonicalOracleGateJson(value.output_schema) !== canonicalOracleGateJson(ORACLE_GATE_RESPONSE_SCHEMA)) {
    throw new Error("Formal user prompt 固定 task/schema/rules/evidence 语义漂移");
  }
  unicodeScalars(value.selected_transcript, "Formal user prompt selected_transcript");
  const canonical = renderBytes(value.selected_transcript, availability["visual-1"]);
  if (canonical.length !== bytes.length || !canonical.every((byte, index) => byte === bytes[index])) throw new Error("Formal user prompt bytes 不是 canonical renderer 输出");
  return value as unknown as FormalOracleParsedUserPromptV1;
}

export function assertFormalOracleUserPromptArtifact(value: FormalOracleUserPromptArtifact): void {
  if (!value || typeof value !== "object" || !activePrompts.has(value as object)) throw new Error("Formal user prompt artifact 无效或由调用方伪造");
}
