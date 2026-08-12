import { sha256Hex } from "./sha256.js";
import { containsFabricatedLearnerOutcome } from "./signed-gold.js";

export const ORACLE_GATE_RESPONSE_SCHEMA_VERSION = "oracle-gate-response-v1" as const;
export const ORACLE_GATE_RESPONSE_VALIDATOR_VERSION = "oracle-gate-response-structural-validator-v1" as const;

export const ORACLE_GATE_RESPONSE_SEMANTIC_POLICY = {
  schema_version: "oracle-gate-response-semantic-policy-v1",
  prompt_population_policy: "teacher_only",
  runtime_semantic_enforcement: "none_external_blind_review_only",
  runtime_sample_filtering: "forbidden_no_retry_no_selection",
} as const;

export interface OracleGateResponseSemanticLintIssue {
  path: string;
  message: string;
}

export type OracleGateResponseArm = "transcript_only" | "static_final_board" | "uniform_frame" | "oracle_delta";

export interface OracleGateResponseV1 {
  schema_version: typeof ORACLE_GATE_RESPONSE_SCHEMA_VERSION;
  observed_board_actions: Array<{
    sequence_index: number;
    operation: "add" | "erase" | "modify" | "connect" | "unknown";
    content: string | null;
    region: string | null;
  }>;
  generalized_teaching_capability: {
    name: string;
    mechanism: string;
    action_program: string[];
  };
  evidence_claims: Array<{
    claim: string;
    evidence_slot: "transcript" | "visual-1" | "uncertain";
  }>;
  uncertainties: string[];
}

/** Frozen prompt-facing descriptor; its canonical hash is the formal spec schema anchor. */
export const ORACLE_GATE_RESPONSE_SCHEMA = {
  schema_version: ORACLE_GATE_RESPONSE_SCHEMA_VERSION,
  observed_board_actions: [{
    sequence_index: 1,
    operation: "add|erase|modify|connect|unknown",
    content: "string|null",
    region: "string|null",
  }],
  generalized_teaching_capability: {
    name: "string",
    mechanism: "string",
    action_program: ["renderer-neutral teacher action"],
  },
  evidence_claims: [{ claim: "string", evidence_slot: "transcript|visual-1|uncertain" }],
  uncertainties: ["string"],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
    && Object.keys(value).length === value.length
    && Object.keys(value).every((key, index) => key === String(index));
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${label} 字段集合无效`);
}

/** Browser-safe canonical JSON for the frozen response/schema bytes. */
export function canonicalOracleGateJson(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error("Oracle Gate JSON 含非安全有限数值");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (!isDenseArray(value)) throw new Error("Oracle Gate JSON 含稀疏数组或额外数组属性");
    if (seen.has(value)) throw new Error("Oracle Gate JSON 含循环引用");
    seen.add(value);
    try { return `[${value.map((item) => canonicalOracleGateJson(item, seen)).join(",")}]`; }
    finally { seen.delete(value); }
  }
  if (isRecord(value)) {
    if (seen.has(value)) throw new Error("Oracle Gate JSON 含循环引用");
    seen.add(value);
    try {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalOracleGateJson(value[key], seen)}`).join(",")}}`;
    } finally { seen.delete(value); }
  }
  throw new Error("Oracle Gate JSON 含非 JSON 值");
}

export const ORACLE_GATE_RESPONSE_SCHEMA_SHA256 = sha256Hex(canonicalOracleGateJson(ORACLE_GATE_RESPONSE_SCHEMA));

class DuplicateAwareJsonScanner {
  private index = 0;

  constructor(private readonly source: string) {}

  scan(): void {
    this.whitespace();
    this.value();
    this.whitespace();
    if (this.index !== this.source.length) throw new Error("Oracle Gate response_bytes 含 JSON 尾随内容");
  }

  private whitespace(): void {
    while (this.index < this.source.length && /[\u0009\u000a\u000d\u0020]/.test(this.source[this.index])) this.index += 1;
  }

  private value(): void {
    const token = this.source[this.index];
    if (token === "{") this.object();
    else if (token === "[") this.array();
    else if (token === "\"") this.string();
    else if (token === "-" || (token >= "0" && token <= "9")) this.number();
    else if (this.source.startsWith("true", this.index)) this.index += 4;
    else if (this.source.startsWith("false", this.index)) this.index += 5;
    else if (this.source.startsWith("null", this.index)) this.index += 4;
    else throw new Error("Oracle Gate response_bytes 不是严格 JSON");
  }

  private object(): void {
    this.index += 1;
    this.whitespace();
    const keys = new Set<string>();
    if (this.source[this.index] === "}") { this.index += 1; return; }
    while (true) {
      if (this.source[this.index] !== "\"") throw new Error("Oracle Gate JSON object key 无效");
      const key = this.string();
      if (keys.has(key)) throw new Error(`Oracle Gate response_bytes 含 duplicate key：${key}`);
      keys.add(key);
      this.whitespace();
      if (this.source[this.index] !== ":") throw new Error("Oracle Gate JSON object 缺少冒号");
      this.index += 1;
      this.whitespace();
      this.value();
      this.whitespace();
      if (this.source[this.index] === "}") { this.index += 1; return; }
      if (this.source[this.index] !== ",") throw new Error("Oracle Gate JSON object 分隔符无效");
      this.index += 1;
      this.whitespace();
    }
  }

  private array(): void {
    this.index += 1;
    this.whitespace();
    if (this.source[this.index] === "]") { this.index += 1; return; }
    while (true) {
      this.value();
      this.whitespace();
      if (this.source[this.index] === "]") { this.index += 1; return; }
      if (this.source[this.index] !== ",") throw new Error("Oracle Gate JSON array 分隔符无效");
      this.index += 1;
      this.whitespace();
    }
  }

  private string(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      if (code === 0x22) {
        this.index += 1;
        return JSON.parse(this.source.slice(start, this.index)) as string;
      }
      if (code < 0x20) throw new Error("Oracle Gate JSON string 含未转义控制字符");
      if (code === 0x5c) {
        this.index += 1;
        const escaped = this.source[this.index];
        if (escaped === "u") {
          const hex = this.source.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error("Oracle Gate JSON unicode escape 无效");
          this.index += 5;
          continue;
        }
        if (!escaped || !'"\\/bfnrt'.includes(escaped)) throw new Error("Oracle Gate JSON escape 无效");
      }
      this.index += 1;
    }
    throw new Error("Oracle Gate JSON string 未闭合");
  }

  private number(): void {
    const remainder = this.source.slice(this.index);
    const match = /^-?(?:0|[1-9]\d*)/.exec(remainder);
    if (!match) throw new Error("Oracle Gate JSON number 无效");
    if (remainder[match[0].length] === "." || /[eE]/.test(remainder[match[0].length] ?? "")) {
      throw new Error("Oracle Gate response v1 数值只允许整数词法");
    }
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error("Oracle Gate JSON number 必须有限且安全");
  }
}

/**
 * Parses the provider's original JSON UTF-8 bytes. Fatal UTF-8 decoding and a
 * duplicate-aware grammar scan happen before JSON.parse, including nested keys.
 */
export function parseOracleGateResponseBytes(bytes: Uint8Array): Record<string, unknown> {
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Oracle Gate response_bytes 不是有效 UTF-8"); }
  new DuplicateAwareJsonScanner(source).scan();
  const value = JSON.parse(source) as unknown;
  if (!isRecord(value)) throw new Error("Oracle Gate response_bytes 顶层必须是 JSON object");
  canonicalOracleGateJson(value);
  return value;
}

export function canonicalOracleGateResponseBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalOracleGateJson(value));
}

const LEARNER_ENTITY = /(?:学生|学员|同学们?|孩子|儿童|班级|全班|大家|人人|\b(?:students?|learners?|pupils?|the\s+class|class)\b)/i;
const LEARNER_PRONOUN = /(?:他们|她们|其|人人|大家|\b(?:they|them|their|theirs)\b)/i;
const SEMANTIC_CLAUSE_BOUNDARY = /(?:[，,；;。.!?！？]|但是|然而|随后|后来|最后|最终|但|却|\b(?:but|however|then|later|afterwards|eventually)\b)/i;
const CHINESE_TEACHER_ACTION_BEFORE_LEARNER = /(?:引导|指导|让|要求|鼓励|帮助|提示|请|询问|训练|支持|安排|邀请|使)(?:每个|所有|全体)?\s*$/;
const ENGLISH_TEACHER_ACTION_BEFORE_LEARNER = /\b(?:guide|help|ask|prompt|train|encourage|require|instruct|invite|support|allow|enable|teach|have)\s+(?:all\s+|every\s+|the\s+)?$/i;
const CHINESE_CONDITION_BEFORE_LEARNER = /(?:若|如果|假如|当|希望|期望|预期)\s*$/;
const ENGLISH_CONDITION_BEFORE_LEARNER = /\b(?:if|when|unless|expect|hope)\s+(?:the\s+)?$/i;
const CHINESE_FUTURE_AFTER_LEARNER = /^\s*(?:应该|应当|将|可能|也许|或许|预计|预期|需要|需|待)/;
const ENGLISH_FUTURE_AFTER_LEARNER = /^\s*(?:should|may|might|will|would|could|(?:is|are)\s+expected\b|need(?:s)?\s+to\b)/i;
const CHINESE_INHERITED_TEACHER_INTENT = /^\s*(?:(?:则)?(?:继续|进入|转入)|(?:继续|再)?\s*(?:引导|指导|让|要求|鼓励|帮助|提示|请|询问|训练|支持|安排|邀请|应该|应当|将|可能|也许|或许|预计|预期|需要|需|待))/;
const ENGLISH_INHERITED_TEACHER_INTENT = /^\s*(?:continue\b|proceed\b|(?:(?:continue\s+to|again)\s+)?(?:guide|help|ask|prompt|train|encourage|require|instruct|invite|support|allow|enable|teach|should|may|might|will|would|could|expect))/i;
const UNCERTAINTY_MARKER = /(?:未知|不确定|未观察|没有观察|未见|无法判断|不能判断|无法确定|不能确定|待验证|待确认|证据不足|不可判定|\bunknown\b|\buncertain\b|not\s+observed|not\s+visible|cannot\s+determine|can't\s+determine|unable\s+to\s+determine|insufficient\s+evidence|not\s+enough\s+evidence|to\s+be\s+verified|requires?\s+verification)/i;

function semanticClauses(value: string): string[] {
  return value.split(SEMANTIC_CLAUSE_BOUNDARY).map((item) => item.trim()).filter(Boolean);
}

function learnerReference(value: string): RegExpExecArray | null {
  return LEARNER_ENTITY.exec(value) ?? LEARNER_PRONOUN.exec(value);
}

function capabilityLearnerClauseAllowed(clause: string, reference: RegExpExecArray): boolean {
  const before = clause.slice(0, reference.index);
  const after = clause.slice(reference.index + reference[0].length);
  return CHINESE_TEACHER_ACTION_BEFORE_LEARNER.test(before)
    || ENGLISH_TEACHER_ACTION_BEFORE_LEARNER.test(before)
    || CHINESE_CONDITION_BEFORE_LEARNER.test(before)
    || ENGLISH_CONDITION_BEFORE_LEARNER.test(before)
    || CHINESE_FUTURE_AFTER_LEARNER.test(after)
    || ENGLISH_FUTURE_AFTER_LEARNER.test(after);
}

function assertCapabilityTeacherOnly(value: string, label: string): void {
  let learnerContext = false;
  for (const clause of semanticClauses(value)) {
    const explicit = LEARNER_ENTITY.exec(clause);
    if (explicit) learnerContext = true;
    const contextual = explicit ?? (learnerContext ? LEARNER_PRONOUN.exec(clause) : null);
    const inheritedAllowed = learnerContext && !contextual
      && (CHINESE_INHERITED_TEACHER_INTENT.test(clause) || ENGLISH_INHERITED_TEACHER_INTENT.test(clause));
    if (learnerContext && !inheritedAllowed && (!contextual || !capabilityLearnerClauseAllowed(clause, contextual))) {
      throw new Error(`${label} 的 learner 子句缺少明确教师动作、意图或未来/条件结构`);
    }
  }
}

function assertUncertaintyTeacherOnly(value: string, label: string): void {
  let learnerContext = false;
  let foundLearnerReference = false;
  for (const clause of semanticClauses(value)) {
    const explicit = LEARNER_ENTITY.test(clause);
    if (explicit) learnerContext = true;
    const referenced = explicit || learnerContext;
    if (!referenced) continue;
    foundLearnerReference = true;
    if (!UNCERTAINTY_MARKER.test(clause)) throw new Error(`${label} 的 learner 学生学习结果子句缺少 unknown/not-observed 标志`);
  }
  if (!foundLearnerReference && containsFabricatedLearnerOutcome(value)) {
    throw new Error(`${label} 把学生学习结果伪装成不确定性`);
  }
}

export function validateOracleGateResponse(value: unknown, arm: OracleGateResponseArm): asserts value is OracleGateResponseV1 {
  if (!isRecord(value)) throw new Error("Oracle Gate 响应必须是对象");
  exactKeys(value, [
    "schema_version", "observed_board_actions", "generalized_teaching_capability", "evidence_claims", "uncertainties",
  ], "Oracle Gate 响应");
  if (value.schema_version !== ORACLE_GATE_RESPONSE_SCHEMA_VERSION) throw new Error("Oracle Gate 响应 schema_version 无效");
  if (!isDenseArray(value.observed_board_actions)) throw new Error("Oracle Gate 响应 observed_board_actions 必须是稠密数组");
  if (!isRecord(value.generalized_teaching_capability)) throw new Error("Oracle Gate 响应缺少 generalized_teaching_capability");
  if (!isDenseArray(value.evidence_claims) || !isDenseArray(value.uncertainties)) throw new Error("Oracle Gate 响应证据或不确定性字段无效");
  const operations = new Set(["add", "erase", "modify", "connect", "unknown"]);
  let previousSequence = 0;
  for (const [index, raw] of value.observed_board_actions.entries()) {
    if (!isRecord(raw)) throw new Error(`observed_board_actions[${index}] 必须是对象`);
    exactKeys(raw, ["sequence_index", "operation", "content", "region"], `observed_board_actions[${index}]`);
    if (!Number.isSafeInteger(raw.sequence_index) || Number(raw.sequence_index) <= previousSequence) {
      throw new Error(`observed_board_actions[${index}].sequence_index 必须严格递增`);
    }
    previousSequence = Number(raw.sequence_index);
    if (typeof raw.operation !== "string" || !operations.has(raw.operation)) throw new Error(`observed_board_actions[${index}].operation 无效`);
    if (raw.content !== null && typeof raw.content !== "string") throw new Error(`observed_board_actions[${index}].content 无效`);
    if (raw.region !== null && typeof raw.region !== "string") throw new Error(`observed_board_actions[${index}].region 无效`);
  }
  const capability = value.generalized_teaching_capability;
  exactKeys(capability, ["name", "mechanism", "action_program"], "generalized_teaching_capability");
  if (typeof capability.name !== "string" || !capability.name.trim()
    || typeof capability.mechanism !== "string" || !capability.mechanism.trim()
    || !isDenseArray(capability.action_program) || !capability.action_program.length
    || capability.action_program.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error("generalized_teaching_capability 必须包含非空 name、mechanism 和 action_program");
  }
  const allowedEvidenceSlots = arm === "transcript_only"
    ? new Set(["transcript", "uncertain"])
    : new Set(["transcript", "visual-1", "uncertain"]);
  for (const [index, raw] of value.evidence_claims.entries()) {
    if (!isRecord(raw)) throw new Error(`evidence_claims[${index}] 必须是对象`);
    exactKeys(raw, ["claim", "evidence_slot"], `evidence_claims[${index}]`);
    if (typeof raw.claim !== "string" || !raw.claim.trim()
      || typeof raw.evidence_slot !== "string" || !allowedEvidenceSlots.has(raw.evidence_slot)) {
      throw new Error(`evidence_claims[${index}] 的 claim 或 evidence_slot 无效`);
    }
  }
  if (value.uncertainties.some((item) => typeof item !== "string" || !item.trim())) throw new Error("uncertainties 必须是非空字符串数组");
}

/**
 * Advisory only. These findings must never filter samples, trigger retries, or
 * gate persistence; semantic quality belongs to the external blind review.
 */
export function lintOracleGateResponseSemantics(value: OracleGateResponseV1): OracleGateResponseSemanticLintIssue[] {
  const issues: OracleGateResponseSemanticLintIssue[] = [];
  value.observed_board_actions.forEach((action, index) => {
    for (const [field, item] of [["content", action.content], ["region", action.region]] as const) {
      if (typeof item === "string" && (learnerReference(item) || containsFabricatedLearnerOutcome(item))) {
        issues.push({ path: `observed_board_actions[${index}].${field}`, message: "possible learner outcome in teacher-only prompt sample" });
      }
    }
  });
  value.evidence_claims.forEach((claim, index) => {
    if (learnerReference(claim.claim) || containsFabricatedLearnerOutcome(claim.claim)) {
      issues.push({ path: `evidence_claims[${index}].claim`, message: "possible learner outcome in teacher-only prompt sample" });
    }
  });
  const capabilityStrings = [
    value.generalized_teaching_capability.name,
    value.generalized_teaching_capability.mechanism,
    ...value.generalized_teaching_capability.action_program,
  ];
  capabilityStrings.forEach((item, index) => {
    try {
      assertCapabilityTeacherOnly(item, `generalized_teaching_capability[${index}]`);
      if (containsFabricatedLearnerOutcome(item)) throw new Error("possible asserted learner outcome");
    } catch (error) {
      issues.push({ path: `generalized_teaching_capability[${index}]`, message: error instanceof Error ? error.message : "possible learner outcome" });
    }
  });
  value.uncertainties.forEach((item, index) => {
    try { assertUncertaintyTeacherOnly(item, `uncertainties[${index}]`); }
    catch (error) { issues.push({ path: `uncertainties[${index}]`, message: error instanceof Error ? error.message : "possible learner outcome" }); }
  });
  return issues;
}
