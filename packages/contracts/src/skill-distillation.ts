export type SkillRenderTarget = "html" | "svg" | "ink";
export type SkillRenderPreference = "auto" | SkillRenderTarget;
export type SkillArtifactKind =
  | "explanation"
  | "formula"
  | "comparison"
  | "table"
  | "diagram"
  | "simulation"
  | "annotation";
export type SkillLayoutMode = "document" | "split" | "grid" | "freeform";
export type SkillInteractionMode = "static" | "stepwise" | "interactive";

export interface GroundedBoardActionIR {
  action_id: string;
  step: number;
  origin: "teacher_replay" | "counterfactual" | "repair" | "merged";
  operation: "introduce" | "annotate" | "connect" | "contrast" | "revise" | "clear";
  pedagogical_target: string;
  content_template: string;
  artifact_kind: SkillArtifactKind;
  spatial_constraints: string[];
  progressive_reveal: boolean;
  source_transition_ids: string[];
  source_delta_ids: string[];
  evidence_refs: string[];
}

export interface GroundedSkillRenderPlan {
  plan_id: string;
  board_action_ids: string[];
  preferred_target: SkillRenderPreference;
  allowed_targets: SkillRenderTarget[];
  fallback_targets: SkillRenderTarget[];
  layout_mode: SkillLayoutMode;
  interaction_mode: SkillInteractionMode;
  rationale: string;
}

export interface GroundedSkillLearningCheck {
  check_id: string;
  prompt_template: string;
  success_criteria: string[];
  failure_codes: string[];
}

export interface GroundedSkillVariant {
  variant_id: string;
  use_when: string[];
  board_actions: GroundedBoardActionIR[];
  render_plans: GroundedSkillRenderPlan[];
  learning_checks: GroundedSkillLearningCheck[];
  remediation_actions: GroundedBoardActionIR[];
}

export interface GroundedSkillCapability {
  key: string;
  name: string;
  summary: string;
  teaching_goal: string;
  mechanism: string;
  use_when: string[];
  prerequisites: string[];
  variants: GroundedSkillVariant[];
  abstain_when: string[];
  source_transition_ids: string[];
  evidence_refs: string[];
  limitations: string[];
}

export interface GroundedSkillDistillationSuite {
  schema_version: "grounded-skill-distillation-v2";
  suite_name: string;
  subject: string;
  source_bundle_id: string;
  renderer_neutral: true;
  teacher_only_recording: boolean;
  capabilities: GroundedSkillCapability[];
  limitations: string[];
}

export interface GroundedSkillSourceTransition {
  transition_id: string;
  delta_ids: string[];
  evidence_refs: string[];
  visual_evidence_by_delta: Record<string, string[]>;
}

export interface GroundedSkillSourceCatalog {
  source_bundle_id: string;
  teacher_only_recording: boolean;
  accepted_transitions: GroundedSkillSourceTransition[];
  evidence_ids: string[];
  submitted_visual_evidence_ids: string[];
}

export interface GroundedSkillValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface GroundedSkillValidationReport {
  valid: boolean;
  issues: GroundedSkillValidationIssue[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

const TOP_LEVEL_KEYS = ["schema_version", "suite_name", "subject", "source_bundle_id", "renderer_neutral", "teacher_only_recording", "capabilities", "limitations"];
const CAPABILITY_KEYS = ["key", "name", "summary", "teaching_goal", "mechanism", "use_when", "prerequisites", "variants", "abstain_when", "source_transition_ids", "evidence_refs", "limitations"];
const VARIANT_KEYS = ["variant_id", "use_when", "board_actions", "render_plans", "learning_checks", "remediation_actions"];
const ACTION_KEYS = ["action_id", "step", "origin", "operation", "pedagogical_target", "content_template", "artifact_kind", "spatial_constraints", "progressive_reveal", "source_transition_ids", "source_delta_ids", "evidence_refs"];
const PLAN_KEYS = ["plan_id", "board_action_ids", "preferred_target", "allowed_targets", "fallback_targets", "layout_mode", "interaction_mode", "rationale"];
const CHECK_KEYS = ["check_id", "prompt_template", "success_criteria", "failure_codes"];
const FORBIDDEN_STUDENT_KEYS = new Set(["observed_student_response", "expected_student_response", "learner_observation", "student_outcome"]);

export function validateGroundedSkillDistillationSuite(
  input: unknown,
  source?: GroundedSkillSourceCatalog,
): GroundedSkillValidationReport {
  const issues: GroundedSkillValidationIssue[] = [];
  const error = (code: string, path: string, message: string) => issues.push({ code, path, message });
  if (!isObject(input)) return { valid: false, issues: [{ code: "suite.type", path: "$", message: "蒸馏结果必须是对象。" }] };

  const strictKeys = (value: Record<string, unknown>, allowed: string[], path: string) => {
    for (const key of Object.keys(value)) if (!allowed.includes(key)) error("schema.unknown_field", `${path}.${key}`, `不允许字段：${key}`);
  };
  const rejectRawMarkup = (value: string, path: string) => {
    if (/<\/?[a-z][^>]*>/i.test(value)) error("text.raw_markup", path, "自由文本不得包含 HTML、SVG 或脚本标签。");
  };
  const requiredString = (value: unknown, path: string) => {
    if (typeof value !== "string" || !value.trim()) error("field.string", path, "必须是非空字符串。");
    else rejectRawMarkup(value, path);
  };
  const stringList = (value: unknown, path: string, nonEmpty = false): string[] => {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
      error("field.string_array", path, "必须是非空字符串组成的数组。");
      return strings(value);
    }
    if (nonEmpty && value.length === 0) error("field.array_empty", path, "数组不能为空。");
    (value as string[]).forEach((item, index) => rejectRawMarkup(item, `${path}[${index}]`));
    return value as string[];
  };
  const unique = (values: string[], path: string) => {
    if (new Set(values).size !== values.length) error("field.duplicate", path, "数组不得包含重复项。");
  };
  const enumValue = (value: unknown, allowed: readonly string[], path: string) => {
    if (typeof value !== "string" || !allowed.includes(value)) error("field.enum", path, `必须是：${allowed.join(", ")}。`);
  };
  const rejectStudentClaims = (value: unknown, path: string) => {
    if (Array.isArray(value)) return value.forEach((item, index) => rejectStudentClaims(item, `${path}[${index}]`));
    if (typeof value === "string" && (/(?:学生|学员|同学们?|孩子们).*?(?:(?:已经|已然|都|纷纷|随即|随后|当场|明显|最终).*?(?:听懂|明白|会做|作答正确|答对|掌握|理解|学会|点头)|(?:听懂了|明白了|会做(?:题)?了|作答正确|答对了|掌握了|理解了|学会了|点头了|回答了|完成了|做对了|恍然大悟)|(?:成绩|得分).*?提高了|错误率.*?下降了|进步了|改善了|不再犯错|迁移成功(?:了)?)/.test(value)
      || /\b(?:students?|learners?).*?(?:(?:already\s+)?(?:nodded|understood|mastered|learned|answered|completed)|(?:have|had)\s+(?:already\s+)?(?:understood|mastered|learned|answered|completed)|improved|gained|made\s+fewer\s+errors|reduced\s+errors|performed\s+better)\b/i.test(value))) {
      error("suite.student_claim_text", path, "教师单人网课不得在自由文本中暗示观察到学生行为或学习结果。");
    }
    if (!isObject(value)) return;
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_STUDENT_KEYS.has(key)) error("suite.student_claim", `${path}.${key}`, "教师单人网课蒸馏不得输出观察到的学生表现或学习结果。");
      rejectStudentClaims(nested, `${path}.${key}`);
    }
  };

  strictKeys(input, TOP_LEVEL_KEYS, "$");
  if (input.teacher_only_recording === true) rejectStudentClaims(input, "$");
  if (input.schema_version !== "grounded-skill-distillation-v2") error("suite.schema_version", "$.schema_version", "仅接受 grounded-skill-distillation-v2。");
  requiredString(input.suite_name, "$.suite_name");
  requiredString(input.subject, "$.subject");
  requiredString(input.source_bundle_id, "$.source_bundle_id");
  if (input.renderer_neutral !== true) error("suite.renderer_neutral", "$.renderer_neutral", "Board Action IR 必须声明 renderer_neutral: true。");
  if (typeof input.teacher_only_recording !== "boolean") error("suite.teacher_only", "$.teacher_only_recording", "teacher_only_recording 必须显式为布尔值。");
  stringList(input.limitations, "$.limitations", true);
  if (!Array.isArray(input.capabilities) || input.capabilities.length === 0) error("suite.capabilities", "$.capabilities", "至少需要一个候选 Skill。");

  const sourceTransitions = new Map((source?.accepted_transitions ?? []).map((item) => [item.transition_id, item]));
  const sourceEvidence = new Set(source?.evidence_ids ?? []);
  const submittedVisualEvidence = new Set(source?.submitted_visual_evidence_ids ?? []);
  if (source) {
    if (input.source_bundle_id !== source.source_bundle_id) error("suite.source_bundle", "$.source_bundle_id", "蒸馏结果必须绑定输入 BoardEvidenceBundle。");
    if (input.teacher_only_recording !== source.teacher_only_recording) error("suite.teacher_only_mismatch", "$.teacher_only_recording", "teacher_only_recording 与源 bundle 不一致。");
  }

  const capabilityIds = new Set<string>();
  for (const [capabilityIndex, rawCapability] of (Array.isArray(input.capabilities) ? input.capabilities : []).entries()) {
    const path = `$.capabilities[${capabilityIndex}]`;
    if (!isObject(rawCapability)) { error("capability.type", path, "Capability 必须是对象。"); continue; }
    strictKeys(rawCapability, CAPABILITY_KEYS, path);
    for (const key of ["key", "name", "summary", "teaching_goal", "mechanism"] as const) requiredString(rawCapability[key], `${path}.${key}`);
    if (typeof rawCapability.key === "string") {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawCapability.key)) error("capability.key", `${path}.key`, "key 必须是英文小写连字符格式。");
      if (capabilityIds.has(rawCapability.key)) error("capability.duplicate", `${path}.key`, "Capability key 不得重复。");
      capabilityIds.add(rawCapability.key);
    }
    stringList(rawCapability.use_when, `${path}.use_when`, true);
    stringList(rawCapability.prerequisites, `${path}.prerequisites`);
    stringList(rawCapability.abstain_when, `${path}.abstain_when`, true);
    stringList(rawCapability.limitations, `${path}.limitations`, true);
    const capabilityTransitions = stringList(rawCapability.source_transition_ids, `${path}.source_transition_ids`, true);
    const capabilityEvidence = stringList(rawCapability.evidence_refs, `${path}.evidence_refs`, true);
    unique(capabilityTransitions, `${path}.source_transition_ids`);
    unique(capabilityEvidence, `${path}.evidence_refs`);
    if (source) {
      capabilityTransitions.forEach((id, index) => { if (!sourceTransitions.has(id)) error("source.transition_ref", `${path}.source_transition_ids[${index}]`, `未引用 accepted transition：${id}`); });
      const permittedCapabilityEvidence = new Set(capabilityTransitions.flatMap((id) => sourceTransitions.get(id)?.evidence_refs ?? []));
      capabilityEvidence.forEach((id, index) => {
        if (!sourceEvidence.has(id)) error("source.evidence_ref", `${path}.evidence_refs[${index}]`, `源证据不存在：${id}`);
        else if (!permittedCapabilityEvidence.has(id)) error("source.evidence_scope", `${path}.evidence_refs[${index}]`, `证据不属于 Capability 引用的 transition：${id}`);
      });
    }
    if (!Array.isArray(rawCapability.variants) || rawCapability.variants.length === 0) error("capability.variants", `${path}.variants`, "Capability 至少需要一个变体。");

    const variantIds = new Set<string>();
    const usedCapabilityTransitions = new Set<string>();
    for (const [variantIndex, rawVariant] of (Array.isArray(rawCapability.variants) ? rawCapability.variants : []).entries()) {
      const variantPath = `${path}.variants[${variantIndex}]`;
      if (!isObject(rawVariant)) { error("variant.type", variantPath, "Variant 必须是对象。"); continue; }
      strictKeys(rawVariant, VARIANT_KEYS, variantPath);
      requiredString(rawVariant.variant_id, `${variantPath}.variant_id`);
      if (typeof rawVariant.variant_id === "string") {
        if (variantIds.has(rawVariant.variant_id)) error("variant.duplicate", `${variantPath}.variant_id`, "variant_id 在 Capability 内必须唯一。");
        variantIds.add(rawVariant.variant_id);
      }
      stringList(rawVariant.use_when, `${variantPath}.use_when`);
      if (!Array.isArray(rawVariant.board_actions) || rawVariant.board_actions.length === 0) error("variant.actions", `${variantPath}.board_actions`, "每个变体至少需要一个 Board Action。");
      if (!Array.isArray(rawVariant.render_plans) || rawVariant.render_plans.length === 0) error("variant.render_plans", `${variantPath}.render_plans`, "每个变体至少需要一个 Render Plan。");
      if (!Array.isArray(rawVariant.learning_checks) || rawVariant.learning_checks.length === 0) error("variant.checks", `${variantPath}.learning_checks`, "每个变体至少需要一个学习检查。");

      const primaryActions = Array.isArray(rawVariant.board_actions) ? rawVariant.board_actions : [];
      const remediationActions = Array.isArray(rawVariant.remediation_actions) ? rawVariant.remediation_actions : [];
      const allActions = [...primaryActions, ...remediationActions];
      const actionIds = new Set<string>();
      const planUseCount = new Map<string, number>();
      let previousStep = 0;
      for (const [actionIndex, rawAction] of allActions.entries()) {
        const primary = actionIndex < primaryActions.length;
        const localIndex = primary ? actionIndex : actionIndex - primaryActions.length;
        const actionPath = `${variantPath}.${primary ? "board_actions" : "remediation_actions"}[${localIndex}]`;
        if (!isObject(rawAction)) { error("action.type", actionPath, "Board Action 必须是对象。"); continue; }
        strictKeys(rawAction, ACTION_KEYS, actionPath);
        requiredString(rawAction.action_id, `${actionPath}.action_id`);
        if (typeof rawAction.action_id === "string") {
          if (actionIds.has(rawAction.action_id)) error("action.duplicate", `${actionPath}.action_id`, "action_id 在变体内必须唯一。");
          actionIds.add(rawAction.action_id);
        }
        if (!Number.isInteger(rawAction.step) || Number(rawAction.step) < 1) error("action.step", `${actionPath}.step`, "step 必须是正整数。");
        if (primary && typeof rawAction.step === "number") {
          if (rawAction.step <= previousStep) error("action.step_order", `${actionPath}.step`, "主 Board Action 必须按严格递增 step 排列。");
          previousStep = rawAction.step;
        }
        enumValue(rawAction.origin, ["teacher_replay", "counterfactual", "repair", "merged"], `${actionPath}.origin`);
        enumValue(rawAction.operation, ["introduce", "annotate", "connect", "contrast", "revise", "clear"], `${actionPath}.operation`);
        enumValue(rawAction.artifact_kind, ["explanation", "formula", "comparison", "table", "diagram", "simulation", "annotation"], `${actionPath}.artifact_kind`);
        requiredString(rawAction.pedagogical_target, `${actionPath}.pedagogical_target`);
        requiredString(rawAction.content_template, `${actionPath}.content_template`);
        const spatialConstraints = stringList(rawAction.spatial_constraints, `${actionPath}.spatial_constraints`);
        const actionText = [rawAction.pedagogical_target, rawAction.content_template, ...spatialConstraints]
          .filter((item): item is string => typeof item === "string");
        actionText.forEach((item, index) => {
          if (/\b(?:html|svg|canvas|renderer|ink)\b|渲染器|几何画板/i.test(item)) {
            error("action.renderer_binding", `${actionPath}.${index < 2 ? (index === 0 ? "pedagogical_target" : "content_template") : `spatial_constraints[${index - 2}]`}`, "Board Action 必须保持 renderer-neutral；渲染器选择只能写入 Render Plan。");
          }
        });
        if (typeof rawAction.progressive_reveal !== "boolean") error("action.progressive_reveal", `${actionPath}.progressive_reveal`, "progressive_reveal 必须是布尔值。");
        const transitionIds = stringList(rawAction.source_transition_ids, `${actionPath}.source_transition_ids`, true);
        const deltaIds = stringList(rawAction.source_delta_ids, `${actionPath}.source_delta_ids`);
        const evidenceIds = stringList(rawAction.evidence_refs, `${actionPath}.evidence_refs`, true);
        unique(transitionIds, `${actionPath}.source_transition_ids`);
        unique(deltaIds, `${actionPath}.source_delta_ids`);
        unique(evidenceIds, `${actionPath}.evidence_refs`);
        transitionIds.forEach((id) => usedCapabilityTransitions.add(id));
        transitionIds.forEach((id, index) => {
          if (!capabilityTransitions.includes(id)) error("action.capability_transition", `${actionPath}.source_transition_ids[${index}]`, "动作 transition 必须同时列入 Capability 来源。");
        });
        evidenceIds.forEach((id, index) => {
          if (!capabilityEvidence.includes(id)) error("action.capability_evidence", `${actionPath}.evidence_refs[${index}]`, "动作 evidence 必须同时列入 Capability 来源。");
        });
        if ((rawAction.origin === "teacher_replay" || rawAction.origin === "merged") && deltaIds.length === 0) {
          error("action.replay_delta", `${actionPath}.source_delta_ids`, "teacher_replay 或 merged 动作必须引用至少一个实际 BoardDelta。");
        }
        if (source) {
          transitionIds.forEach((id, index) => { if (!sourceTransitions.has(id)) error("source.transition_ref", `${actionPath}.source_transition_ids[${index}]`, `未引用 accepted transition：${id}`); });
          const permittedDeltas = new Set(transitionIds.flatMap((id) => sourceTransitions.get(id)?.delta_ids ?? []));
          const permittedEvidence = new Set(transitionIds.flatMap((id) => sourceTransitions.get(id)?.evidence_refs ?? []));
          deltaIds.forEach((id, index) => { if (!permittedDeltas.has(id)) error("source.delta_ref", `${actionPath}.source_delta_ids[${index}]`, `delta 不属于本动作引用的 transition：${id}`); });
          evidenceIds.forEach((id, index) => {
            if (!sourceEvidence.has(id)) error("source.evidence_ref", `${actionPath}.evidence_refs[${index}]`, `源证据不存在：${id}`);
            else if (!permittedEvidence.has(id)) error("source.evidence_scope", `${actionPath}.evidence_refs[${index}]`, `证据不属于本动作引用的 transition：${id}`);
          });
          if (rawAction.origin === "teacher_replay" || rawAction.origin === "merged") {
            deltaIds.forEach((deltaId, index) => {
              const exactVisualRefs = [...new Set(transitionIds.flatMap((transitionId) => {
                const transition = sourceTransitions.get(transitionId);
                return transition?.delta_ids.includes(deltaId) ? transition.visual_evidence_by_delta[deltaId] ?? [] : [];
              }))];
              if (!exactVisualRefs.length) {
                error("source.delta_visual_missing", `${actionPath}.source_delta_ids[${index}]`, `accepted delta 缺少规范 board_delta 视觉证据：${deltaId}`);
              } else if (!exactVisualRefs.some((id) => evidenceIds.includes(id))) {
                error("action.delta_visual_ref", `${actionPath}.evidence_refs`, `replay/merged 动作必须为 delta ${deltaId} 引用其精确 board_delta 视觉证据。`);
              } else if (!exactVisualRefs.some((id) => submittedVisualEvidence.has(id))) {
                error("action.delta_visual_not_submitted", `${actionPath}.evidence_refs`, `delta ${deltaId} 的视觉证据没有进入成功的模型请求。`);
              }
            });
          }
        }
      }

      const planIds = new Set<string>();
      for (const [planIndex, rawPlan] of (Array.isArray(rawVariant.render_plans) ? rawVariant.render_plans : []).entries()) {
        const planPath = `${variantPath}.render_plans[${planIndex}]`;
        if (!isObject(rawPlan)) { error("render_plan.type", planPath, "Render Plan 必须是对象。"); continue; }
        strictKeys(rawPlan, PLAN_KEYS, planPath);
        requiredString(rawPlan.plan_id, `${planPath}.plan_id`);
        if (typeof rawPlan.plan_id === "string") {
          if (planIds.has(rawPlan.plan_id)) error("render_plan.duplicate", `${planPath}.plan_id`, "plan_id 在变体内必须唯一。");
          planIds.add(rawPlan.plan_id);
        }
        const planActionIds = stringList(rawPlan.board_action_ids, `${planPath}.board_action_ids`, true);
        const allowedTargets = stringList(rawPlan.allowed_targets, `${planPath}.allowed_targets`, true);
        const fallbackTargets = stringList(rawPlan.fallback_targets, `${planPath}.fallback_targets`);
        unique(planActionIds, `${planPath}.board_action_ids`);
        unique(allowedTargets, `${planPath}.allowed_targets`);
        unique(fallbackTargets, `${planPath}.fallback_targets`);
        enumValue(rawPlan.preferred_target, ["auto", "html", "svg", "ink"], `${planPath}.preferred_target`);
        allowedTargets.forEach((target, index) => enumValue(target, ["html", "svg", "ink"], `${planPath}.allowed_targets[${index}]`));
        fallbackTargets.forEach((target, index) => {
          enumValue(target, ["html", "svg", "ink"], `${planPath}.fallback_targets[${index}]`);
          if (!allowedTargets.includes(target)) error("render_plan.fallback", `${planPath}.fallback_targets[${index}]`, "fallback target 必须同时出现在 allowed_targets。");
          if (rawPlan.preferred_target === target) error("render_plan.fallback_preferred", `${planPath}.fallback_targets[${index}]`, "fallback target 不能与 preferred target 相同。");
        });
        if (rawPlan.preferred_target !== "auto" && typeof rawPlan.preferred_target === "string" && !allowedTargets.includes(rawPlan.preferred_target)) {
          error("render_plan.preferred", `${planPath}.preferred_target`, "指定的 preferred target 必须出现在 allowed_targets。");
        }
        enumValue(rawPlan.layout_mode, ["document", "split", "grid", "freeform"], `${planPath}.layout_mode`);
        enumValue(rawPlan.interaction_mode, ["static", "stepwise", "interactive"], `${planPath}.interaction_mode`);
        requiredString(rawPlan.rationale, `${planPath}.rationale`);
        planActionIds.forEach((id, index) => {
          if (!actionIds.has(id)) error("render_plan.action_ref", `${planPath}.board_action_ids[${index}]`, `Render Plan 引用了不存在的 Board Action：${id}`);
          else planUseCount.set(id, (planUseCount.get(id) ?? 0) + 1);
        });
      }
      for (const id of actionIds) {
        const count = planUseCount.get(id) ?? 0;
        if (count !== 1) error("render_plan.coverage", `${variantPath}.render_plans`, `Board Action ${id} 必须且只能由一个 Render Plan 覆盖。`);
      }

      const checkIds = new Set<string>();
      for (const [checkIndex, rawCheck] of (Array.isArray(rawVariant.learning_checks) ? rawVariant.learning_checks : []).entries()) {
        const checkPath = `${variantPath}.learning_checks[${checkIndex}]`;
        if (!isObject(rawCheck)) { error("check.type", checkPath, "Learning Check 必须是对象。"); continue; }
        strictKeys(rawCheck, CHECK_KEYS, checkPath);
        requiredString(rawCheck.check_id, `${checkPath}.check_id`);
        if (typeof rawCheck.check_id === "string") {
          if (checkIds.has(rawCheck.check_id)) error("check.duplicate", `${checkPath}.check_id`, "check_id 在变体内必须唯一。");
          checkIds.add(rawCheck.check_id);
        }
        requiredString(rawCheck.prompt_template, `${checkPath}.prompt_template`);
        stringList(rawCheck.success_criteria, `${checkPath}.success_criteria`, true);
        stringList(rawCheck.failure_codes, `${checkPath}.failure_codes`, true);
      }
      if (!Array.isArray(rawVariant.remediation_actions)) error("variant.remediation", `${variantPath}.remediation_actions`, "remediation_actions 必须是数组。");
    }
    capabilityTransitions.forEach((id, index) => {
      if (!usedCapabilityTransitions.has(id)) error("capability.unused_transition", `${path}.source_transition_ids[${index}]`, "Capability 声明的每个 transition 都必须由至少一个 Board Action 使用。");
    });
  }

  return { valid: issues.length === 0, issues };
}
