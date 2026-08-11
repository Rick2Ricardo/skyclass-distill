export type Board2SkillDataSplit = "development" | "train" | "selection" | "locked_test" | "online_shadow";
export type Board2SkillRightsStatus = "authorized" | "open_license" | "internal_review_only" | "blocked" | "unknown";
export type Board2SkillEvidenceKind =
  | "frame"
  | "clip"
  | "speech"
  | "board_state"
  | "board_delta"
  | "external_fact"
  | "rollout"
  | "human_review";

export interface Board2SkillTimeRange {
  start_ms: number;
  end_ms: number;
}

export interface Board2SkillEvidenceRef {
  evidence_id: string;
  kind: Board2SkillEvidenceKind;
  source_resource_id: string;
  time?: Board2SkillTimeRange;
  asset_uri?: string;
  sha256?: string;
}

export interface Board2SkillObservationTrace {
  observation_id: string;
  source_resource_id: string;
  source_video_id: string;
  teacher_key: string;
  teacher_only_recording: boolean;
  time: Board2SkillTimeRange;
  evidence_refs: string[];
  observed_actions: Array<"write" | "erase" | "connect" | "point" | "gesture" | "speak" | "pause" | "unknown">;
  observed_content: string[];
  learner_observation: { value: string; evidence_refs: string[] } | null;
  uncertainty_codes: string[];
  immutable: true;
  payload_sha256: string;
}

export interface Board2SkillIntentHypothesis {
  hypothesis_id: string;
  observation_ids: string[];
  alternative_group_id: string;
  intent: string;
  intended_learner_change: string | null;
  trigger_kind: "content_condition" | "teacher_anticipated_misconception" | "observed_student_signal" | "unknown";
  confidence: number | null;
  status: "candidate" | "human_supported" | "rejected" | "unresolved";
  evidence_refs: string[];
}

export type Board2SkillFailureCode =
  | "knowledge_gap"
  | "teaching_policy_gap"
  | "routing_gap"
  | "student_model_gap"
  | "board_tool_bug"
  | "verifier_uncertain"
  | "answer_leakage"
  | "unsupported_claim";

export interface Board2SkillExperience {
  experience_id: string;
  type: "fact" | "episode" | "strategy_success" | "strategy_failure" | "strategy_comparison" | "validation";
  source: "teacher_replay" | "controlled_rollout" | "real_session" | "external_anchor" | "human_review";
  observation_ids: string[];
  hypothesis_ids: string[];
  policy_version_ids: string[];
  scenario_ids: string[];
  outcome: "success" | "partial_success" | "failure" | "uncertain" | null;
  failure_codes: Board2SkillFailureCode[];
  evidence_refs: string[];
  write_decision: "write" | "no_write";
  no_write_reason?: string;
}

export interface Board2SkillCondition {
  field: string;
  operator: "eq" | "in" | "contains" | "gte" | "lte" | "exists";
  value: string | number | boolean | string[];
  source_required: "observed" | "controlled" | "any";
}

export interface Board2SkillPolicyAction {
  action_id: string;
  step: number;
  kind: "ask" | "hint" | "explain" | "draw" | "edit_board" | "example" | "feedback" | "check" | "abstain";
  instruction_template: string;
  origin: "teacher_replay" | "counterfactual" | "repair" | "merged";
  observation_ids: string[];
  experience_ids: string[];
}

export interface Board2SkillStrategyVariant {
  variant_id: string;
  use_when: Board2SkillCondition[];
  actions: Board2SkillPolicyAction[];
  expected_effects: Array<{
    description: string;
    level: "inferred" | "validated";
    validation_ids: string[];
  }>;
  checks: Array<{
    prompt_template: string;
    success_criteria: string[];
    failure_codes: string[];
  }>;
  remediation_actions: Board2SkillPolicyAction[];
  do_not_use_when: Board2SkillCondition[];
}

export type Board2SkillValidationGate = "schema" | "evidence" | "executable" | "pedagogical";

export interface Board2SkillGateResult {
  gate: Board2SkillValidationGate;
  status: "pass" | "fail" | "uncertain";
  details: string;
}

export interface Board2SkillPromotionRecord {
  validation_id: string;
  dataset_id: string;
  dataset_version: string;
  split: Board2SkillDataSplit;
  gate_results: Board2SkillGateResult[];
  selection_gain: number | null;
  worst_group_delta: number | null;
  unsupported_claim_rate_delta: number | null;
  answer_leakage_rate_delta: number | null;
  family_deltas: Array<{ family_id: string; episode_success_delta: number }>;
  critical_physics_errors: number;
  critical_diagram_errors: number;
  decision: "promote" | "reject" | "hold";
  reasons: string[];
}

export interface Board2SkillPolicyVersion {
  policy_version_id: string;
  skill_id: string;
  version: string;
  parent_policy_version_ids: string[];
  status: "draft" | "candidate" | "selected" | "rejected" | "retired";
  name: string;
  goal: string;
  mechanism: string;
  applicability: {
    all: Board2SkillCondition[];
    any: Board2SkillCondition[];
    abstain_when: Board2SkillCondition[];
    uncertainty_policy: "abstain" | "ask" | "safe_fallback";
  };
  variants: Board2SkillStrategyVariant[];
  source_observation_ids: string[];
  source_experience_ids: string[];
  evidence_refs: string[];
  promotion: Board2SkillPromotionRecord | null;
  immutable: true;
}

export interface Board2SkillPromotionPolicy {
  minimum_selection_gain: number;
  minimum_worst_group_delta: number;
  maximum_unsupported_claim_rate_delta: number;
  maximum_answer_leakage_rate_delta: number;
}

export interface Board2SkillBundle {
  schema_version: "board2skill-opt-v2";
  bundle_id: string;
  created_at: string;
  data_split: Board2SkillDataSplit;
  rights_status: Board2SkillRightsStatus;
  promotion_policy: Board2SkillPromotionPolicy;
  evidence: Board2SkillEvidenceRef[];
  observations: Board2SkillObservationTrace[];
  hypotheses: Board2SkillIntentHypothesis[];
  experiences: Board2SkillExperience[];
  policy_versions: Board2SkillPolicyVersion[];
  active_policy_version_ids: string[];
}

export interface Board2SkillValidationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface Board2SkillValidationReport {
  valid: boolean;
  issues: Board2SkillValidationIssue[];
}

export const BOARD2SKILL_PILOT_PROMOTION_FLOOR = {
  minimum_selection_gain: 0.05,
  minimum_worst_group_delta: -0.02,
  maximum_unsupported_claim_rate_delta: 0,
  maximum_answer_leakage_rate_delta: 0,
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRelativeAssetUri(value: string): boolean {
  if (!value || value.includes("\\")) return false;
  let decoded = value;
  try {
    for (let index = 0; index <= value.length; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return false;
  }
  return Boolean(decoded)
    && !decoded.includes("\\")
    && !decoded.startsWith("/")
    && !/^[a-zA-Z]:\//.test(decoded)
    && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)
    && !decoded.split("/").includes("..");
}

export function validateBoard2SkillBundle(input: unknown): Board2SkillValidationReport {
  const issues: Board2SkillValidationIssue[] = [];
  const error = (code: string, path: string, message: string) => issues.push({ severity: "error", code, path, message });

  if (!isObject(input)) return { valid: false, issues: [{ severity: "error", code: "bundle.type", path: "$", message: "Bundle 必须是对象。" }] };
  if (input.schema_version !== "board2skill-opt-v2") error("bundle.schema_version", "$.schema_version", "仅接受 board2skill-opt-v2。");
  if (typeof input.bundle_id !== "string" || !input.bundle_id.trim()) error("bundle.id", "$.bundle_id", "bundle_id 不能为空。");
  if (typeof input.created_at !== "string" || !Number.isFinite(Date.parse(input.created_at))) error("bundle.created_at", "$.created_at", "created_at 必须是有效时间。");
  if (!["development", "train", "selection", "locked_test", "online_shadow"].includes(String(input.data_split))) {
    error("bundle.data_split", "$.data_split", "data_split 不合法。");
  }
  if (!["authorized", "open_license", "internal_review_only", "blocked", "unknown"].includes(String(input.rights_status))) {
    error("bundle.rights_status", "$.rights_status", "rights_status 不合法。");
  }
  for (const key of ["evidence", "observations", "hypotheses", "experiences", "policy_versions", "active_policy_version_ids"] as const) {
    if (!Array.isArray(input[key])) error("bundle.array", `$.${key}`, `${key} 必须是数组。`);
  }
  if (!isObject(input.promotion_policy)) error("bundle.promotion_policy", "$.promotion_policy", "promotion_policy 必须是对象。");

  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const observations = Array.isArray(input.observations) ? input.observations : [];
  const hypotheses = Array.isArray(input.hypotheses) ? input.hypotheses : [];
  const experiences = Array.isArray(input.experiences) ? input.experiences : [];
  const policies = Array.isArray(input.policy_versions) ? input.policy_versions : [];
  const evidenceIds = new Set<string>();
  const evidenceResourceIds = new Map<string, string>();
  const observationIds = new Set<string>();
  const hypothesisIds = new Set<string>();
  const experienceIds = new Set<string>();
  const policyIds = new Set<string>();
  const validationIds = new Set<string>();

  const validateTime = (value: unknown, path: string) => {
    if (!isObject(value)) return error("time.missing", path, "时间范围不能为空。");
    const start = value.start_ms;
    const end = value.end_ms;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      error("time.invalid", path, "时间必须满足 0 <= start_ms < end_ms。");
    }
  };

  const requireString = (value: unknown, path: string, code = "field.string") => {
    if (typeof value !== "string" || !value.trim()) error(code, path, "必须是非空字符串。");
  };

  const requireFiniteNumber = (value: unknown, path: string, code = "field.number") => {
    if (typeof value !== "number" || !Number.isFinite(value)) error(code, path, "必须是有限数值。");
  };

  const requireEnum = (value: unknown, allowed: readonly string[], path: string, code = "field.enum") => {
    if (typeof value !== "string" || !allowed.includes(value)) error(code, path, `必须是：${allowed.join(", ")}。`);
  };

  const requireStringArray = (value: unknown, path: string, code = "field.string_array"): string[] => {
    if (!Array.isArray(value)) {
      error(code, path, "必须是字符串数组。");
      return [];
    }
    if (value.some((item) => typeof item !== "string" || !item.trim())) error(code, path, "数组元素必须都是非空字符串。");
    return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  };

  const register = (set: Set<string>, id: unknown, path: string) => {
    if (typeof id !== "string" || !id.trim()) return error("id.missing", path, "ID 不能为空。");
    if (set.has(id)) return error("id.duplicate", path, `重复 ID：${id}`);
    set.add(id);
  };

  evidence.forEach((raw, index) => {
    if (!isObject(raw)) return error("evidence.type", `$.evidence[${index}]`, "Evidence 必须是对象。");
    register(evidenceIds, raw.evidence_id, `$.evidence[${index}].evidence_id`);
    requireEnum(raw.kind, ["frame", "clip", "speech", "board_state", "board_delta", "external_fact", "rollout", "human_review"], `$.evidence[${index}].kind`, "evidence.kind");
    requireString(raw.source_resource_id, `$.evidence[${index}].source_resource_id`, "evidence.source_resource_id");
    if (typeof raw.evidence_id === "string" && typeof raw.source_resource_id === "string") evidenceResourceIds.set(raw.evidence_id, raw.source_resource_id);
    if (raw.asset_uri !== undefined && (typeof raw.asset_uri !== "string" || !isRelativeAssetUri(raw.asset_uri))) {
      error("evidence.asset_uri", `$.evidence[${index}].asset_uri`, "资产路径必须是无协议的受控相对路径，不能是绝对路径或包含 ..。");
    }
    if (raw.sha256 !== undefined && (typeof raw.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(raw.sha256))) error("evidence.hash", `$.evidence[${index}].sha256`, "sha256 必须是 64 位十六进制字符串。");
    if (raw.time !== undefined) validateTime(raw.time, `$.evidence[${index}].time`);
  });

  observations.forEach((raw, index) => {
    if (!isObject(raw)) return error("observation.type", `$.observations[${index}]`, "Observation 必须是对象。");
    register(observationIds, raw.observation_id, `$.observations[${index}].observation_id`);
  });
  hypotheses.forEach((raw, index) => {
    if (!isObject(raw)) return error("hypothesis.type", `$.hypotheses[${index}]`, "Hypothesis 必须是对象。");
    register(hypothesisIds, raw.hypothesis_id, `$.hypotheses[${index}].hypothesis_id`);
  });
  experiences.forEach((raw, index) => {
    if (!isObject(raw)) return error("experience.type", `$.experiences[${index}]`, "Experience 必须是对象。");
    register(experienceIds, raw.experience_id, `$.experiences[${index}].experience_id`);
  });
  policies.forEach((raw, index) => {
    if (!isObject(raw)) return error("policy.type", `$.policy_versions[${index}]`, "Policy 必须是对象。");
    register(policyIds, raw.policy_version_id, `$.policy_versions[${index}].policy_version_id`);
    if (isObject(raw.promotion)) register(validationIds, raw.promotion.validation_id, `$.policy_versions[${index}].promotion.validation_id`);
  });

  const requireRefs = (refs: unknown, ids: Set<string>, path: string, code: string) => {
    for (const id of requireStringArray(refs, path, `${code}.type`)) if (!ids.has(id)) error(code, path, `引用不存在：${id}`);
  };

  observations.forEach((raw, index) => {
    if (!isObject(raw)) return;
    requireString(raw.source_resource_id, `$.observations[${index}].source_resource_id`, "observation.source_resource_id");
    requireString(raw.source_video_id, `$.observations[${index}].source_video_id`, "observation.source_video_id");
    requireString(raw.teacher_key, `$.observations[${index}].teacher_key`, "observation.teacher_key");
    if (typeof raw.teacher_only_recording !== "boolean") error("observation.teacher_only", `$.observations[${index}].teacher_only_recording`, "teacher_only_recording 必须显式为布尔值。");
    validateTime(raw.time, `$.observations[${index}].time`);
    requireRefs(raw.evidence_refs, evidenceIds, `$.observations[${index}].evidence_refs`, "observation.evidence_ref");
    if (typeof raw.source_resource_id === "string") {
      for (const evidenceId of stringArray(raw.evidence_refs)) {
        if (evidenceResourceIds.get(evidenceId) !== raw.source_resource_id) error("observation.cross_resource_evidence", `$.observations[${index}].evidence_refs`, `观察不能引用其他资源的证据：${evidenceId}`);
      }
    }
    const observedActions = requireStringArray(raw.observed_actions, `$.observations[${index}].observed_actions`, "observation.observed_actions");
    const allowedActions = ["write", "erase", "connect", "point", "gesture", "speak", "pause", "unknown"];
    if (observedActions.some((item) => !allowedActions.includes(item))) error("observation.observed_actions", `$.observations[${index}].observed_actions`, "包含未知观察动作。");
    requireStringArray(raw.observed_content, `$.observations[${index}].observed_content`, "observation.observed_content");
    requireStringArray(raw.uncertainty_codes, `$.observations[${index}].uncertainty_codes`, "observation.uncertainty_codes");
    if (raw.immutable !== true) error("observation.mutable", `$.observations[${index}].immutable`, "观察轨迹必须声明 immutable: true。");
    if (raw.learner_observation !== null && !isObject(raw.learner_observation)) {
      error("observation.learner_type", `$.observations[${index}].learner_observation`, "learner_observation 必须是对象或 null。");
    } else if (isObject(raw.learner_observation)) {
      requireString(raw.learner_observation.value, `$.observations[${index}].learner_observation.value`, "observation.learner_value");
      requireRefs(raw.learner_observation.evidence_refs, evidenceIds, `$.observations[${index}].learner_observation.evidence_refs`, "observation.learner_evidence_ref");
    }
    if (raw.teacher_only_recording !== false && raw.learner_observation !== null) {
      error("observation.fabricated_learner", `$.observations[${index}].learner_observation`, "无学生网课不能记录观察到的学生反应。");
    }
    if (!Array.isArray(raw.evidence_refs) || raw.evidence_refs.length === 0) {
      error("observation.ungrounded", `$.observations[${index}].evidence_refs`, "观察轨迹至少需要一条证据。");
    }
    if (typeof raw.payload_sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(raw.payload_sha256)) {
      error("observation.hash", `$.observations[${index}].payload_sha256`, "观察轨迹必须带 64 位 SHA-256。");
    }
  });

  hypotheses.forEach((raw, index) => {
    if (!isObject(raw)) return;
    requireRefs(raw.observation_ids, observationIds, `$.hypotheses[${index}].observation_ids`, "hypothesis.observation_ref");
    requireRefs(raw.evidence_refs, evidenceIds, `$.hypotheses[${index}].evidence_refs`, "hypothesis.evidence_ref");
    requireString(raw.alternative_group_id, `$.hypotheses[${index}].alternative_group_id`, "hypothesis.alternative_group_id");
    requireString(raw.intent, `$.hypotheses[${index}].intent`, "hypothesis.intent");
    if (raw.intended_learner_change !== null && (typeof raw.intended_learner_change !== "string" || !raw.intended_learner_change.trim())) {
      error("hypothesis.intended_change", `$.hypotheses[${index}].intended_learner_change`, "必须是非空字符串或 null。");
    }
    requireEnum(raw.trigger_kind, ["content_condition", "teacher_anticipated_misconception", "observed_student_signal", "unknown"], `$.hypotheses[${index}].trigger_kind`, "hypothesis.trigger_kind");
    requireEnum(raw.status, ["candidate", "human_supported", "rejected", "unresolved"], `$.hypotheses[${index}].status`, "hypothesis.status");
    if (!Array.isArray(raw.observation_ids) || raw.observation_ids.length === 0) {
      error("hypothesis.ungrounded", `$.hypotheses[${index}].observation_ids`, "意图假设至少要引用一条观察。");
    }
    if (raw.trigger_kind === "observed_student_signal") {
      const sources = stringArray(raw.observation_ids).map((id) => observations.find((item) => isObject(item) && item.observation_id === id));
      if (sources.some((item) => isObject(item) && item.teacher_only_recording === true)) {
        error("hypothesis.student_signal", `$.hypotheses[${index}].trigger_kind`, "无学生网课不能使用 observed_student_signal；应改为 teacher_anticipated_misconception。");
      }
    }
    if (raw.confidence !== null && (typeof raw.confidence !== "number" || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1)) {
      error("hypothesis.confidence", `$.hypotheses[${index}].confidence`, "置信度必须在 [0, 1] 或为 null。");
    }
  });

  const noWriteExperienceIds = new Set<string>();
  experiences.forEach((raw, index) => {
    if (!isObject(raw)) return;
    requireEnum(raw.type, ["fact", "episode", "strategy_success", "strategy_failure", "strategy_comparison", "validation"], `$.experiences[${index}].type`, "experience.type_value");
    requireEnum(raw.source, ["teacher_replay", "controlled_rollout", "real_session", "external_anchor", "human_review"], `$.experiences[${index}].source`, "experience.source");
    requireRefs(raw.observation_ids, observationIds, `$.experiences[${index}].observation_ids`, "experience.observation_ref");
    requireRefs(raw.hypothesis_ids, hypothesisIds, `$.experiences[${index}].hypothesis_ids`, "experience.hypothesis_ref");
    requireRefs(raw.evidence_refs, evidenceIds, `$.experiences[${index}].evidence_refs`, "experience.evidence_ref");
    requireRefs(raw.policy_version_ids, policyIds, `$.experiences[${index}].policy_version_ids`, "experience.policy_ref");
    requireStringArray(raw.scenario_ids, `$.experiences[${index}].scenario_ids`, "experience.scenario_ids");
    if (raw.outcome !== null) requireEnum(raw.outcome, ["success", "partial_success", "failure", "uncertain"], `$.experiences[${index}].outcome`, "experience.outcome");
    const failureCodes = requireStringArray(raw.failure_codes, `$.experiences[${index}].failure_codes`, "experience.failure_codes");
    const allowedFailureCodes: Board2SkillFailureCode[] = ["knowledge_gap", "teaching_policy_gap", "routing_gap", "student_model_gap", "board_tool_bug", "verifier_uncertain", "answer_leakage", "unsupported_claim"];
    if (failureCodes.some((item) => !allowedFailureCodes.includes(item as Board2SkillFailureCode))) error("experience.failure_codes", `$.experiences[${index}].failure_codes`, "包含未知失败类型。");
    if (!["write", "no_write"].includes(String(raw.write_decision))) {
      error("experience.write_decision", `$.experiences[${index}].write_decision`, "write_decision 必须是 write 或 no_write。");
    }
    if (raw.write_decision === "no_write" && (typeof raw.no_write_reason !== "string" || !raw.no_write_reason.trim())) {
      error("experience.no_write_reason", `$.experiences[${index}].no_write_reason`, "NO_WRITE 必须记录原因。");
    }
    if (raw.write_decision === "no_write" && typeof raw.experience_id === "string") noWriteExperienceIds.add(raw.experience_id);
  });

  const promotionPolicy = isObject(input.promotion_policy) ? input.promotion_policy : {};
  for (const key of ["minimum_selection_gain", "minimum_worst_group_delta", "maximum_unsupported_claim_rate_delta", "maximum_answer_leakage_rate_delta"] as const) {
    if (typeof promotionPolicy[key] !== "number" || !Number.isFinite(promotionPolicy[key])) {
      error("promotion_policy.metric", `$.promotion_policy.${key}`, `${key} 必须是有限数值。`);
    }
  }
  const configuredPolicy = {
    minimum_selection_gain: typeof promotionPolicy.minimum_selection_gain === "number" && Number.isFinite(promotionPolicy.minimum_selection_gain) ? promotionPolicy.minimum_selection_gain : BOARD2SKILL_PILOT_PROMOTION_FLOOR.minimum_selection_gain,
    minimum_worst_group_delta: typeof promotionPolicy.minimum_worst_group_delta === "number" && Number.isFinite(promotionPolicy.minimum_worst_group_delta) ? promotionPolicy.minimum_worst_group_delta : BOARD2SKILL_PILOT_PROMOTION_FLOOR.minimum_worst_group_delta,
    maximum_unsupported_claim_rate_delta: typeof promotionPolicy.maximum_unsupported_claim_rate_delta === "number" && Number.isFinite(promotionPolicy.maximum_unsupported_claim_rate_delta) ? promotionPolicy.maximum_unsupported_claim_rate_delta : BOARD2SKILL_PILOT_PROMOTION_FLOOR.maximum_unsupported_claim_rate_delta,
    maximum_answer_leakage_rate_delta: typeof promotionPolicy.maximum_answer_leakage_rate_delta === "number" && Number.isFinite(promotionPolicy.maximum_answer_leakage_rate_delta) ? promotionPolicy.maximum_answer_leakage_rate_delta : BOARD2SKILL_PILOT_PROMOTION_FLOOR.maximum_answer_leakage_rate_delta,
  };
  if (configuredPolicy.minimum_selection_gain < BOARD2SKILL_PILOT_PROMOTION_FLOOR.minimum_selection_gain) error("promotion_policy.too_weak", "$.promotion_policy.minimum_selection_gain", "Pilot 的 selection 增益门槛不得低于 5pp。");
  if (configuredPolicy.minimum_worst_group_delta < BOARD2SKILL_PILOT_PROMOTION_FLOOR.minimum_worst_group_delta) error("promotion_policy.too_weak", "$.promotion_policy.minimum_worst_group_delta", "最差学生组门槛不得低于 -2pp。");
  if (configuredPolicy.maximum_unsupported_claim_rate_delta > BOARD2SKILL_PILOT_PROMOTION_FLOOR.maximum_unsupported_claim_rate_delta) error("promotion_policy.too_weak", "$.promotion_policy.maximum_unsupported_claim_rate_delta", "无依据学生状态比例不得上升。");
  if (configuredPolicy.maximum_answer_leakage_rate_delta > BOARD2SKILL_PILOT_PROMOTION_FLOOR.maximum_answer_leakage_rate_delta) error("promotion_policy.too_weak", "$.promotion_policy.maximum_answer_leakage_rate_delta", "答案泄漏比例不得上升。");
  const minimumGain = configuredPolicy.minimum_selection_gain;
  const minimumWorstGroup = configuredPolicy.minimum_worst_group_delta;
  const maximumUnsupported = configuredPolicy.maximum_unsupported_claim_rate_delta;
  const maximumLeakage = configuredPolicy.maximum_answer_leakage_rate_delta;

  const validateCondition = (value: unknown, path: string) => {
    if (!isObject(value)) return error("policy.condition_type", path, "条件必须是对象。");
    requireString(value.field, `${path}.field`, "policy.condition_field");
    requireEnum(value.operator, ["eq", "in", "contains", "gte", "lte", "exists"], `${path}.operator`, "policy.condition_operator");
    requireEnum(value.source_required, ["observed", "controlled", "any"], `${path}.source_required`, "policy.condition_source");
    const conditionValue = value.value;
    if (!(typeof conditionValue === "string" || typeof conditionValue === "number" || typeof conditionValue === "boolean" || (Array.isArray(conditionValue) && conditionValue.every((item) => typeof item === "string")))) {
      error("policy.condition_value", `${path}.value`, "条件值必须是字符串、有限数值、布尔值或字符串数组。");
    } else if (typeof conditionValue === "number" && !Number.isFinite(conditionValue)) {
      error("policy.condition_value", `${path}.value`, "条件数值必须有限。");
    }
  };

  const validateConditionArray = (value: unknown, path: string) => {
    if (!Array.isArray(value)) return error("policy.condition_array", path, "必须是条件数组。");
    value.forEach((item, index) => validateCondition(item, `${path}[${index}]`));
  };

  const validateAction = (value: unknown, path: string) => {
    if (!isObject(value)) return error("policy.action_type", path, "动作必须是对象。");
    requireString(value.action_id, `${path}.action_id`, "policy.action_id");
    if (typeof value.step !== "number" || !Number.isInteger(value.step) || value.step < 1) error("policy.action_step", `${path}.step`, "step 必须是正整数。");
    requireEnum(value.kind, ["ask", "hint", "explain", "draw", "edit_board", "example", "feedback", "check", "abstain"], `${path}.kind`, "policy.action_kind");
    requireString(value.instruction_template, `${path}.instruction_template`, "policy.action_instruction");
    requireEnum(value.origin, ["teacher_replay", "counterfactual", "repair", "merged"], `${path}.origin`, "policy.action_origin");
    requireRefs(value.observation_ids, observationIds, `${path}.observation_ids`, "policy.action_observation_ref");
    requireRefs(value.experience_ids, experienceIds, `${path}.experience_ids`, "policy.action_experience_ref");
    for (const id of stringArray(value.experience_ids)) if (noWriteExperienceIds.has(id)) error("policy.no_write_ref", `${path}.experience_ids`, `NO_WRITE 经验不得进入策略：${id}`);
  };

  policies.forEach((raw, index) => {
    if (!isObject(raw)) return;
    const policyPath = `$.policy_versions[${index}]`;
    requireString(raw.skill_id, `${policyPath}.skill_id`, "policy.skill_id");
    requireString(raw.version, `${policyPath}.version`, "policy.version");
    requireEnum(raw.status, ["draft", "candidate", "selected", "rejected", "retired"], `${policyPath}.status`, "policy.status");
    requireString(raw.name, `${policyPath}.name`, "policy.name");
    requireString(raw.goal, `${policyPath}.goal`, "policy.goal");
    requireString(raw.mechanism, `${policyPath}.mechanism`, "policy.mechanism");
    requireRefs(raw.source_observation_ids, observationIds, `$.policy_versions[${index}].source_observation_ids`, "policy.observation_ref");
    requireRefs(raw.source_experience_ids, experienceIds, `$.policy_versions[${index}].source_experience_ids`, "policy.experience_ref");
    requireRefs(raw.evidence_refs, evidenceIds, `$.policy_versions[${index}].evidence_refs`, "policy.evidence_ref");
    requireRefs(raw.parent_policy_version_ids, policyIds, `$.policy_versions[${index}].parent_policy_version_ids`, "policy.parent_ref");
    for (const id of stringArray(raw.source_experience_ids)) if (noWriteExperienceIds.has(id)) error("policy.no_write_ref", `${policyPath}.source_experience_ids`, `NO_WRITE 经验不得进入策略：${id}`);
    if (raw.immutable !== true) error("policy.mutable", `$.policy_versions[${index}].immutable`, "PolicyVersion 必须声明 immutable: true。");

    if (!isObject(raw.applicability)) error("policy.applicability", `${policyPath}.applicability`, "applicability 必须是对象。");
    else {
      validateConditionArray(raw.applicability.all, `${policyPath}.applicability.all`);
      validateConditionArray(raw.applicability.any, `${policyPath}.applicability.any`);
      validateConditionArray(raw.applicability.abstain_when, `${policyPath}.applicability.abstain_when`);
      requireEnum(raw.applicability.uncertainty_policy, ["abstain", "ask", "safe_fallback"], `${policyPath}.applicability.uncertainty_policy`, "policy.uncertainty_policy");
    }

    const variants = Array.isArray(raw.variants) ? raw.variants : [];
    if (variants.length === 0) error("policy.variants", `$.policy_versions[${index}].variants`, "候选策略至少需要一个变体。");
    for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
      const variant = variants[variantIndex];
      const variantPath = `${policyPath}.variants[${variantIndex}]`;
      if (!isObject(variant)) {
        error("policy.variant_type", variantPath, "策略变体必须是对象。");
        continue;
      }
      requireString(variant.variant_id, `${variantPath}.variant_id`, "policy.variant_id");
      validateConditionArray(variant.use_when, `${variantPath}.use_when`);
      validateConditionArray(variant.do_not_use_when, `${variantPath}.do_not_use_when`);
      if (!Array.isArray(variant.actions) || variant.actions.length === 0) error("policy.actions", `$.policy_versions[${index}].variants[${variantIndex}].actions`, "策略变体必须有动作。");
      if (!Array.isArray(variant.checks) || variant.checks.length === 0) error("policy.checks", `$.policy_versions[${index}].variants[${variantIndex}].checks`, "策略变体必须有学习检查。");
      for (const [collectionName, actions] of [["actions", variant.actions], ["remediation_actions", variant.remediation_actions]] as const) {
        if (!Array.isArray(actions)) error("policy.action_array", `${variantPath}.${collectionName}`, "必须是动作数组。");
        else actions.forEach((action, actionIndex) => validateAction(action, `${variantPath}.${collectionName}[${actionIndex}]`));
      }
      const effects = Array.isArray(variant.expected_effects) ? variant.expected_effects : [];
      if (!Array.isArray(variant.expected_effects)) error("policy.effect_array", `${variantPath}.expected_effects`, "expected_effects 必须是数组。");
      effects.forEach((effect, effectIndex) => {
        const effectPath = `${variantPath}.expected_effects[${effectIndex}]`;
        if (!isObject(effect)) return error("policy.effect_type", effectPath, "预期效果必须是对象。");
        requireString(effect.description, `${effectPath}.description`, "policy.effect_description");
        requireEnum(effect.level, ["inferred", "validated"], `${effectPath}.level`, "policy.effect_level");
        requireRefs(effect.validation_ids, validationIds, `${effectPath}.validation_ids`, "policy.effect_validation_ref");
        if (isObject(effect) && effect.level === "validated" && stringArray(effect.validation_ids).length === 0) {
          error("policy.unvalidated_effect", `$.policy_versions[${index}].variants[${variantIndex}].expected_effects[${effectIndex}]`, "validated 效果必须引用 validation_id。");
        }
      });
      if (Array.isArray(variant.checks)) variant.checks.forEach((check, checkIndex) => {
        const checkPath = `${variantPath}.checks[${checkIndex}]`;
        if (!isObject(check)) return error("policy.check_type", checkPath, "学习检查必须是对象。");
        requireString(check.prompt_template, `${checkPath}.prompt_template`, "policy.check_prompt");
        const criteria = requireStringArray(check.success_criteria, `${checkPath}.success_criteria`, "policy.check_criteria");
        if (criteria.length === 0) error("policy.check_criteria", `${checkPath}.success_criteria`, "学习检查至少需要一条成功标准。");
        requireStringArray(check.failure_codes, `${checkPath}.failure_codes`, "policy.check_failure_codes");
      });
    }

    if (raw.promotion !== null && !isObject(raw.promotion)) error("policy.promotion_type", `${policyPath}.promotion`, "promotion 必须是对象或 null。");
    if (raw.status === "selected" && !isObject(raw.promotion)) return error("policy.promotion", `${policyPath}.promotion`, "selected 策略必须有晋升记录。");
    if (!isObject(raw.promotion)) return;
    const promotionPath = `${policyPath}.promotion`;
    requireString(raw.promotion.validation_id, `${promotionPath}.validation_id`, "policy.validation_id");
    requireString(raw.promotion.dataset_id, `${promotionPath}.dataset_id`, "policy.dataset_id");
    requireString(raw.promotion.dataset_version, `${promotionPath}.dataset_version`, "policy.dataset_version");
    requireEnum(raw.promotion.split, ["development", "train", "selection", "locked_test", "online_shadow"], `${promotionPath}.split`, "policy.promotion_split");
    requireEnum(raw.promotion.decision, ["promote", "reject", "hold"], `${promotionPath}.decision`, "policy.promotion_decision");
    requireStringArray(raw.promotion.reasons, `${promotionPath}.reasons`, "policy.promotion_reasons");
    if (raw.promotion.decision === "promote" && raw.promotion.split !== "selection") error("policy.test_leakage", `${promotionPath}.split`, "只有 selection 集可以触发晋升，locked_test 只能报告。");
    if (raw.promotion.decision === "promote" && raw.status !== "selected" && raw.status !== "retired") error("policy.promote_status", `${promotionPath}.decision`, "promote 决策只能对应 selected 或历史 retired 状态。");
    if (raw.status === "selected" && raw.promotion.decision !== "promote") error("policy.not_promoted", `${promotionPath}.decision`, "selected 策略必须来自 promote 决策。");
    if (raw.status === "candidate" && raw.promotion.decision !== "hold") error("policy.candidate_decision", `${promotionPath}.decision`, "candidate 只能对应 hold 决策。");
    if (raw.status === "rejected" && raw.promotion.decision !== "reject") error("policy.rejected_decision", `${promotionPath}.decision`, "rejected 必须对应 reject 决策。");
    if (raw.status === "draft") error("policy.draft_promotion", `${policyPath}.promotion`, "draft 不应带 promotion 记录。");

    const gates = Array.isArray(raw.promotion.gate_results) ? raw.promotion.gate_results : [];
    if (!Array.isArray(raw.promotion.gate_results)) error("policy.gate_array", `${promotionPath}.gate_results`, "gate_results 必须是数组。");
    const gateNames: Board2SkillValidationGate[] = ["schema", "evidence", "executable", "pedagogical"];
    gates.forEach((gate, gateIndex) => {
      const gatePath = `${promotionPath}.gate_results[${gateIndex}]`;
      if (!isObject(gate)) return error("policy.gate_type", gatePath, "Gate 结果必须是对象。");
      requireEnum(gate.gate, gateNames, `${gatePath}.gate`, "policy.gate_name");
      requireEnum(gate.status, ["pass", "fail", "uncertain"], `${gatePath}.status`, "policy.gate_status");
      requireString(gate.details, `${gatePath}.details`, "policy.gate_details");
    });
    for (const gateName of gateNames) {
      const matching = gates.filter((gate) => isObject(gate) && gate.gate === gateName);
      if (matching.length !== 1) error("policy.gates", `${promotionPath}.gate_results`, `${gateName} 必须且只能出现一次。`);
      else if (raw.promotion.decision === "promote" && matching[0]?.status !== "pass") error("policy.gates", `${promotionPath}.gate_results`, `晋升时 ${gateName} 必须为 pass。`);
    }

    const checks: Array<[string, unknown, number, "min" | "max"]> = [
      ["selection_gain", raw.promotion.selection_gain, minimumGain, "min"],
      ["worst_group_delta", raw.promotion.worst_group_delta, minimumWorstGroup, "min"],
      ["unsupported_claim_rate_delta", raw.promotion.unsupported_claim_rate_delta, maximumUnsupported, "max"],
      ["answer_leakage_rate_delta", raw.promotion.answer_leakage_rate_delta, maximumLeakage, "max"],
    ];
    for (const [key, value, threshold, direction] of checks) {
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) error("policy.metric_missing", `${promotionPath}.${key}`, "指标必须是有限数值或 null。");
      if (raw.promotion.decision === "promote" && (typeof value !== "number" || !Number.isFinite(value))) error("policy.metric_missing", `${promotionPath}.${key}`, "晋升指标必须是有限数值。");
      else if (raw.promotion.decision === "promote" && typeof value === "number" && ((direction === "min" && value < threshold) || (direction === "max" && value > threshold))) {
        error("policy.metric_threshold", `${promotionPath}.${key}`, `晋升指标未达到门槛 ${threshold}。`);
      }
    }
    if (!Array.isArray(raw.promotion.family_deltas)) error("policy.family_deltas", `${promotionPath}.family_deltas`, "family_deltas 必须是数组。");
    const familyDeltas = Array.isArray(raw.promotion.family_deltas) ? raw.promotion.family_deltas : [];
    const familyIds = new Set<string>();
    familyDeltas.forEach((family, familyIndex) => {
      const familyPath = `${promotionPath}.family_deltas[${familyIndex}]`;
      if (!isObject(family)) return error("policy.family_delta_type", familyPath, "问题家族结果必须是对象。");
      requireString(family.family_id, `${familyPath}.family_id`, "policy.family_id");
      if (typeof family.family_id === "string") {
        if (familyIds.has(family.family_id)) error("policy.family_duplicate", `${familyPath}.family_id`, `问题家族不得重复：${family.family_id}`);
        familyIds.add(family.family_id);
      }
      requireFiniteNumber(family.episode_success_delta, `${familyPath}.episode_success_delta`, "policy.family_delta");
    });
    for (const key of ["critical_physics_errors", "critical_diagram_errors"] as const) {
      const value = raw.promotion[key];
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) error(`policy.${key}`, `${promotionPath}.${key}`, "关键错误数必须是非负整数。");
    }
    if (raw.promotion.decision === "promote") {
      if (familyDeltas.length < 2 || familyDeltas.some((family) => !isObject(family) || typeof family.episode_success_delta !== "number" || !Number.isFinite(family.episode_success_delta) || family.episode_success_delta <= 0)) {
        error("policy.family_direction", `${promotionPath}.family_deltas`, "晋升要求至少两个 selection 问题家族均为正向。");
      }
      if (raw.promotion.critical_physics_errors !== 0) error("policy.critical_physics_errors", `${promotionPath}.critical_physics_errors`, "晋升时关键物理错误必须为 0。");
      if (raw.promotion.critical_diagram_errors !== 0) error("policy.critical_diagram_errors", `${promotionPath}.critical_diagram_errors`, "晋升时关键图示错误必须为 0。");
    }
  });

  const activeIds = requireStringArray(input.active_policy_version_ids, "$.active_policy_version_ids", "bundle.active_type");
  if (new Set(activeIds).size !== activeIds.length) error("bundle.active_duplicate", "$.active_policy_version_ids", "active policy ID 不得重复。");
  const activeSkillIds = new Set<string>();
  for (const id of activeIds) {
    const policy = policies.find((item) => isObject(item) && item.policy_version_id === id);
    if (!policyIds.has(id)) error("bundle.active_ref", "$.active_policy_version_ids", `active policy 不存在：${id}`);
    else if (!isObject(policy) || policy.status !== "selected") error("bundle.active_status", "$.active_policy_version_ids", `active policy 必须是 selected：${id}`);
    else if (typeof policy.skill_id === "string") {
      if (activeSkillIds.has(policy.skill_id)) error("bundle.active_skill_duplicate", "$.active_policy_version_ids", `同一 Skill 只能有一个 active 版本：${policy.skill_id}`);
      activeSkillIds.add(policy.skill_id);
    }
  }

  const policyParents = new Map<string, string[]>();
  policies.forEach((item) => {
    if (isObject(item) && typeof item.policy_version_id === "string") policyParents.set(item.policy_version_id, stringArray(item.parent_policy_version_ids));
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const parent of policyParents.get(id) ?? []) if (visit(parent)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of policyParents.keys()) {
    if (visit(id)) {
      error("policy.parent_cycle", "$.policy_versions", `Policy 版本依赖存在循环：${id}`);
      break;
    }
  }
  if (input.rights_status === "blocked") error("bundle.rights_blocked", "$.rights_status", "blocked bundle 只能保留审计记录，不得进入蒸馏或发布链路。");

  return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}
