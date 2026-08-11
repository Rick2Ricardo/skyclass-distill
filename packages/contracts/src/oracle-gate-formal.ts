export type OracleGateBoardMode =
  | "physical_chalkboard"
  | "physical_whiteboard"
  | "digital_ink"
  | "slide_only"
  | "mixed"
  | "unknown";

export type OracleGateRightsStatus =
  | "authorized"
  | "open_license"
  | "internal_review_only"
  | "blocked"
  | "unknown";

export interface OracleGateFormalAsset {
  asset_uri: string;
  sha256: string;
  mime_type: "image/png" | "image/jpeg";
  width: number;
  height: number;
  byte_length: number;
}

export interface OracleGateFormalSource {
  source_video_id: string;
  teacher_id: string;
  board_mode: OracleGateBoardMode;
  data_split: "development";
  rights_status: OracleGateRightsStatus;
  teacher_only_recording: true;
  resource_manifest_entry_sha256: string;
  withdrawal_key: string;
}

export interface OracleGateSignedSpeechRef {
  schema_version: "signed-speech-alignment-v1";
  ledger_uri: string;
  ledger_sha256: string;
  segment_ids: string[];
  transcript_sha256: string;
  status: "signed_alignment";
}

export interface OracleGateFormalCase {
  case_id: string;
  package_id: string;
  group_id: string;
  source_video_id: string;
  event_ids: string[];
  event_window: { start: number; end: number };
  speech: OracleGateSignedSpeechRef;
  static_final: OracleGateFormalAsset & {
    source_frame_id: string;
    timestamp: number;
    selection_rule_version: string;
  };
  uniform_frame: OracleGateFormalAsset & {
    timestamp: number;
    selection_rule_version: string;
  };
  oracle_comparison_evidence_id: string;
  difficulty_tags: string[];
}

export interface OracleGateFormalInputManifest {
  schema_version: "oracle-gate-formal-input-v1";
  manifest_sha256: string;
  signed_gold_dataset_sha256: string;
  resource_manifest_sha256: string;
  created_at: string;
  sources: OracleGateFormalSource[];
  cases: OracleGateFormalCase[];
}

export interface OracleGateFormalSpec {
  schema_version: "oracle-gate-formal-spec-v1";
  spec_sha256: string;
  input_manifest_sha256: string;
  signed_gold_dataset_sha256: string;
  code_revision: string;
  model: string;
  transport: "pi";
  cache_retention: "none";
  tools_policy: "none";
  temperature: 0;
  seeds: number[];
  prompt: {
    version: string;
    system_sha256: string;
    user_template_sha256: string;
    output_schema_sha256: string;
  };
  budget: {
    max_input_tokens: number;
    max_output_tokens: number;
    visual_items_per_visual_arm: 1;
    canvas: { mime_type: "image/jpeg"; width: 1920; height: 360; quality: 88 };
    timeout_ms: number;
    max_attempts: number;
  };
  evaluation: {
    rubric_version: string;
    rubric_sha256: string;
    rating_schema_version: "oracle-gate-rating-v1";
    independent_raters: 2;
    primary_ci: 0.8;
    descriptive_ci: 0.95;
    bootstrap_seed: number;
    strongest_non_oracle_rule: "best_pre_registered_non_oracle_on_development";
    missing_request_policy: "fail_closed_no_partial_decision";
  };
}

export interface OracleGateFormalValidationIssue {
  path: string;
  message: string;
}

export interface OracleGateFormalValidationReport {
  valid: boolean;
  issues: OracleGateFormalValidationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isSafeRelativeUri(value: unknown): value is string {
  if (!isNonEmpty(value) || value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
  let decoded = value;
  let stable = false;
  try {
    for (let index = 0; index < 16; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) { stable = true; break; }
      decoded = next;
    }
  } catch { return false; }
  if (!stable || !decoded || decoded.includes("\\") || decoded.includes("\0") || decoded.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) return false;
  return decoded.split("/").every((part) => Boolean(part) && part !== "." && part !== "..");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return "null";
}

export function canonicalOracleGateFormalInputPayload(input: OracleGateFormalInputManifest): string {
  const { manifest_sha256: _manifestSha256, ...payload } = input;
  return stableJson(payload);
}

export function canonicalOracleGateFormalSpecPayload(input: OracleGateFormalSpec): string {
  const { spec_sha256: _specSha256, ...payload } = input;
  return stableJson(payload);
}

function validateAsset(
  raw: unknown,
  path: string,
  issue: (path: string, message: string) => void,
): void {
  if (!isRecord(raw)) { issue(path, "必须是对象"); return; }
  if (!isSafeRelativeUri(raw.asset_uri)) issue(`${path}.asset_uri`, "必须是受控相对路径");
  if (!isSha256(raw.sha256)) issue(`${path}.sha256`, "必须是 SHA-256");
  if (raw.mime_type !== "image/png" && raw.mime_type !== "image/jpeg") issue(`${path}.mime_type`, "只允许 PNG/JPEG");
  for (const field of ["width", "height", "byte_length"] as const) {
    if (!Number.isSafeInteger(raw[field]) || Number(raw[field]) < 1) issue(`${path}.${field}`, "必须是正安全整数");
  }
}

export function validateOracleGateFormalInput(input: unknown): OracleGateFormalValidationReport {
  const issues: OracleGateFormalValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  if (input.schema_version !== "oracle-gate-formal-input-v1") issue("schema_version", "版本无效");
  for (const field of ["manifest_sha256", "signed_gold_dataset_sha256", "resource_manifest_sha256"] as const) {
    if (!isSha256(input[field])) issue(field, "必须是 SHA-256");
  }
  if (typeof input.created_at !== "string" || !Number.isFinite(Date.parse(input.created_at))) issue("created_at", "必须是有效时间");
  if (!Array.isArray(input.sources) || !input.sources.length) issue("sources", "至少需要一个来源");
  if (!Array.isArray(input.cases) || !input.cases.length) issue("cases", "至少需要一个 case");
  const sourceIds = new Set<string>();
  const teachers = new Set<string>();
  const withdrawalKeys = new Set<string>();
  for (const [index, raw] of (Array.isArray(input.sources) ? input.sources : []).entries()) {
    const path = `sources[${index}]`;
    if (!isRecord(raw)) { issue(path, "必须是对象"); continue; }
    if (!isNonEmpty(raw.source_video_id) || sourceIds.has(String(raw.source_video_id))) issue(`${path}.source_video_id`, "不能为空或重复");
    else sourceIds.add(raw.source_video_id);
    if (!isNonEmpty(raw.teacher_id) || !/^[a-z0-9][a-z0-9._-]{1,127}$/.test(String(raw.teacher_id))) issue(`${path}.teacher_id`, "必须是规范化小写教师标识");
    else teachers.add(raw.teacher_id);
    if (!["physical_chalkboard", "physical_whiteboard", "digital_ink", "slide_only", "mixed", "unknown"].includes(String(raw.board_mode))) issue(`${path}.board_mode`, "值无效");
    if (raw.data_split !== "development") issue(`${path}.data_split`, "Oracle 价值门只能使用 development 数据");
    if (!["authorized", "open_license", "internal_review_only"].includes(String(raw.rights_status))) issue(`${path}.rights_status`, "blocked/unknown 不得进入正式实验");
    if (raw.teacher_only_recording !== true) issue(`${path}.teacher_only_recording`, "当前协议仅允许无学生出镜的教师录课");
    if (!isSha256(raw.resource_manifest_entry_sha256)) issue(`${path}.resource_manifest_entry_sha256`, "必须是 SHA-256");
    if (!isNonEmpty(raw.withdrawal_key) || !/^[a-z0-9][a-z0-9._-]{1,127}$/.test(String(raw.withdrawal_key)) || withdrawalKeys.has(String(raw.withdrawal_key))) issue(`${path}.withdrawal_key`, "必须是规范化且唯一的撤回键");
    else withdrawalKeys.add(raw.withdrawal_key);
  }
  if (teachers.size < 2) issue("sources", "至少需要两位教师");
  const caseIds = new Set<string>();
  const groupKeys = new Set<string>();
  for (const [index, raw] of (Array.isArray(input.cases) ? input.cases : []).entries()) {
    const path = `cases[${index}]`;
    if (!isRecord(raw)) { issue(path, "必须是对象"); continue; }
    if (!isNonEmpty(raw.case_id) || caseIds.has(String(raw.case_id))) issue(`${path}.case_id`, "不能为空或重复");
    else caseIds.add(raw.case_id);
    if (!isNonEmpty(raw.package_id) || !isNonEmpty(raw.group_id)) issue(path, "package_id/group_id 不能为空");
    else {
      const key = `${raw.package_id}:${raw.group_id}`;
      if (groupKeys.has(key)) issue(path, "同一签字组只能进入一个 case"); else groupKeys.add(key);
    }
    if (!isNonEmpty(raw.source_video_id) || !sourceIds.has(String(raw.source_video_id))) issue(`${path}.source_video_id`, "必须引用 sources 中的来源");
    if (!Array.isArray(raw.event_ids) || !raw.event_ids.length || !raw.event_ids.every(isNonEmpty) || new Set(raw.event_ids).size !== raw.event_ids.length) issue(`${path}.event_ids`, "必须是非空唯一事件集合");
    if (!isRecord(raw.event_window) || !Number.isFinite(raw.event_window.start) || !Number.isFinite(raw.event_window.end) || Number(raw.event_window.start) < 0 || Number(raw.event_window.start) >= Number(raw.event_window.end)) issue(`${path}.event_window`, "时间窗无效");
    if (!isRecord(raw.speech)) issue(`${path}.speech`, "必须是对象");
    else {
      if (raw.speech.schema_version !== "signed-speech-alignment-v1" || raw.speech.status !== "signed_alignment") issue(`${path}.speech`, "必须引用已签字语音对齐账本");
      if (!isSafeRelativeUri(raw.speech.ledger_uri)) issue(`${path}.speech.ledger_uri`, "必须是受控相对路径");
      if (!isSha256(raw.speech.ledger_sha256) || !isSha256(raw.speech.transcript_sha256)) issue(`${path}.speech`, "语音账本与文本必须有 SHA-256");
      if (!Array.isArray(raw.speech.segment_ids) || !raw.speech.segment_ids.length || !raw.speech.segment_ids.every(isNonEmpty) || new Set(raw.speech.segment_ids).size !== raw.speech.segment_ids.length) issue(`${path}.speech.segment_ids`, "必须是非空唯一集合");
    }
    validateAsset(raw.static_final, `${path}.static_final`, issue);
    validateAsset(raw.uniform_frame, `${path}.uniform_frame`, issue);
    if (isRecord(raw.static_final)) {
      if (!isNonEmpty(raw.static_final.source_frame_id) || !isNonEmpty(raw.static_final.selection_rule_version)) issue(`${path}.static_final`, "source_frame_id/selection_rule_version 不能为空");
      if (!Number.isFinite(raw.static_final.timestamp)) issue(`${path}.static_final.timestamp`, "必须是有限数");
      else if (isRecord(raw.event_window) && Number(raw.static_final.timestamp) < Number(raw.event_window.end)) issue(`${path}.static_final.timestamp`, "必须来自事件结束后的稳定板书");
    }
    if (isRecord(raw.uniform_frame)) {
      if (!isNonEmpty(raw.uniform_frame.selection_rule_version)) issue(`${path}.uniform_frame.selection_rule_version`, "不能为空");
      if (!Number.isFinite(raw.uniform_frame.timestamp)) issue(`${path}.uniform_frame.timestamp`, "必须是有限数");
      else if (isRecord(raw.event_window) && (Number(raw.uniform_frame.timestamp) < Number(raw.event_window.start) || Number(raw.uniform_frame.timestamp) > Number(raw.event_window.end))) issue(`${path}.uniform_frame.timestamp`, "必须落在冻结事件窗口内");
    }
    if (!isNonEmpty(raw.oracle_comparison_evidence_id)) issue(`${path}.oracle_comparison_evidence_id`, "不能为空");
    if (!Array.isArray(raw.difficulty_tags) || !raw.difficulty_tags.every(isNonEmpty) || new Set(raw.difficulty_tags).size !== raw.difficulty_tags.length) issue(`${path}.difficulty_tags`, "必须是唯一字符串集合");
  }
  return { valid: issues.length === 0, issues };
}

export function validateOracleGateFormalSpec(input: unknown): OracleGateFormalValidationReport {
  const issues: OracleGateFormalValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  if (input.schema_version !== "oracle-gate-formal-spec-v1") issue("schema_version", "版本无效");
  for (const field of ["spec_sha256", "input_manifest_sha256", "signed_gold_dataset_sha256"] as const) if (!isSha256(input[field])) issue(field, "必须是 SHA-256");
  if (typeof input.code_revision !== "string" || !/^[a-f0-9]{40}$/.test(input.code_revision)) {
    issue("code_revision", "必须是完整小写 Git commit");
  }
  if (!isNonEmpty(input.model)) issue("model", "不能为空");
  if (input.transport !== "pi" || input.cache_retention !== "none" || input.tools_policy !== "none" || input.temperature !== 0) issue("protocol", "必须冻结为 Pi、无缓存、无工具、temperature=0");
  if (!Array.isArray(input.seeds) || input.seeds.length < 3 || !input.seeds.every((seed) => Number.isSafeInteger(seed) && Number(seed) >= 0 && Number(seed) <= 0xffff_ffff) || new Set(input.seeds).size !== input.seeds.length) issue("seeds", "至少需要三个唯一的 0..2^32-1 安全整数 seed");
  if (!isRecord(input.prompt) || !isNonEmpty(input.prompt.version) || !isSha256(input.prompt.system_sha256) || !isSha256(input.prompt.user_template_sha256) || !isSha256(input.prompt.output_schema_sha256)) issue("prompt", "必须冻结完整 prompt 与 schema 哈希");
  if (!isRecord(input.budget)) issue("budget", "必须是对象");
  else {
    for (const field of ["max_input_tokens", "max_output_tokens", "timeout_ms", "max_attempts"] as const) if (!Number.isSafeInteger(input.budget[field]) || Number(input.budget[field]) < 1) issue(`budget.${field}`, "必须是正安全整数");
    if (input.budget.visual_items_per_visual_arm !== 1) issue("budget.visual_items_per_visual_arm", "每个视觉臂必须恰好一张 canonical canvas");
    const canvas = input.budget.canvas;
    if (!isRecord(canvas) || canvas.mime_type !== "image/jpeg" || canvas.width !== 1920 || canvas.height !== 360 || canvas.quality !== 88) issue("budget.canvas", "必须冻结为 1920x360 JPEG quality=88");
  }
  if (!isRecord(input.evaluation)) issue("evaluation", "必须是对象");
  else {
    if (!isNonEmpty(input.evaluation.rubric_version) || !isSha256(input.evaluation.rubric_sha256)) issue("evaluation.rubric", "必须冻结 rubric");
    if (input.evaluation.rating_schema_version !== "oracle-gate-rating-v1" || input.evaluation.independent_raters !== 2) issue("evaluation.rating", "必须是双盲独立评分");
    if (input.evaluation.primary_ci !== 0.8 || input.evaluation.descriptive_ci !== 0.95) issue("evaluation.ci", "主决策与描述性 CI 必须分别冻结为 0.8/0.95");
    if (!Number.isSafeInteger(input.evaluation.bootstrap_seed) || Number(input.evaluation.bootstrap_seed) < 0 || Number(input.evaluation.bootstrap_seed) > 0xffff_ffff) issue("evaluation.bootstrap_seed", "必须是 0..2^32-1 安全整数");
    if (input.evaluation.strongest_non_oracle_rule !== "best_pre_registered_non_oracle_on_development") issue("evaluation.strongest_non_oracle_rule", "比较对象规则无效");
    if (input.evaluation.missing_request_policy !== "fail_closed_no_partial_decision") issue("evaluation.missing_request_policy", "缺失请求必须 fail closed");
  }
  return { valid: issues.length === 0, issues };
}
