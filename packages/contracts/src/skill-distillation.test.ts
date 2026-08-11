import { describe, expect, it } from "vitest";
import type {
  GroundedSkillDistillationSuite,
  GroundedSkillSourceCatalog,
} from "./skill-distillation.js";
import { validateGroundedSkillDistillationSuite } from "./skill-distillation.js";

function sourceCatalog(): GroundedSkillSourceCatalog {
  return {
    source_bundle_id: "board-bundle-1",
    teacher_only_recording: true,
    accepted_transitions: [{
      transition_id: "transition-1",
      delta_ids: ["delta-1"],
      evidence_refs: ["ev-delta", "ev-speech"],
      visual_evidence_by_delta: { "delta-1": ["ev-delta"] },
    }],
    evidence_ids: ["ev-delta", "ev-speech"],
    submitted_visual_evidence_ids: ["ev-delta"],
  };
}

function validSuite(): GroundedSkillDistillationSuite {
  return {
    schema_version: "grounded-skill-distillation-v2",
    suite_name: "时序板书教学能力",
    subject: "高中物理",
    source_bundle_id: "board-bundle-1",
    renderer_neutral: true,
    teacher_only_recording: true,
    capabilities: [{
      key: "separate-force-components",
      name: "渐进呈现重力分解",
      summary: "先保持实际力，再逐步引入选定方向上的分量。",
      teaching_goal: "区分实际外力与重力分量。",
      mechanism: "通过渐进板书与对比减少把分量当作新增外力的混淆。",
      use_when: ["需要沿斜面方向列式"],
      prerequisites: ["已经确定研究对象"],
      variants: [{
        variant_id: "main",
        use_when: ["斜面问题"],
        board_actions: [{
          action_id: "action-1",
          step: 1,
          origin: "teacher_replay",
          operation: "contrast",
          pedagogical_target: "对比实际力与分量",
          content_template: "保留重力 {mg}，再显示沿斜面分量 {mg_sin_theta} 与垂直分量 {mg_cos_theta}",
          artifact_kind: "comparison",
          spatial_constraints: ["实际力与分量放在相邻区域"],
          progressive_reveal: true,
          source_transition_ids: ["transition-1"],
          source_delta_ids: ["delta-1"],
          evidence_refs: ["ev-delta", "ev-speech"],
        }],
        render_plans: [{
          plan_id: "plan-1",
          board_action_ids: ["action-1"],
          preferred_target: "auto",
          allowed_targets: ["html", "svg"],
          fallback_targets: ["html"],
          layout_mode: "split",
          interaction_mode: "stepwise",
          rationale: "HTML 适合结构化对比，SVG 适合保留力矢量方向。",
        }],
        learning_checks: [{
          check_id: "check-1",
          prompt_template: "指出哪些是实际外力，哪些是分量。",
          success_criteria: ["不把分量重复计入受力图"],
          failure_codes: ["component-as-force"],
        }],
        remediation_actions: [],
      }],
      abstain_when: ["尚未确定研究对象"],
      source_transition_ids: ["transition-1"],
      evidence_refs: ["ev-delta", "ev-speech"],
      limitations: ["尚无真实学生效果证据"],
    }],
    limitations: ["只来自固定机位教师网课"],
  };
}

describe("validateGroundedSkillDistillationSuite", () => {
  it("accepts renderer-neutral Board Actions with a separate multi-renderer plan", () => {
    expect(validateGroundedSkillDistillationSuite(validSuite(), sourceCatalog())).toEqual({ valid: true, issues: [] });
  });

  it("rejects renderer bindings and raw HTML inside Board Action IR", () => {
    const suite = validSuite() as unknown as { capabilities: Array<{ variants: Array<{ board_actions: Array<Record<string, unknown>> }> }> };
    suite.capabilities[0].variants[0].board_actions[0].render_target = "html";
    suite.capabilities[0].variants[0].board_actions[0].content_template = "<script>alert(1)</script>";
    const codes = validateGroundedSkillDistillationSuite(suite, sourceCatalog()).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["schema.unknown_field", "text.raw_markup"]));
  });

  it("rejects dangling transition, delta, and evidence references", () => {
    const suite = validSuite();
    const action = suite.capabilities[0].variants[0].board_actions[0];
    action.source_transition_ids = ["missing-transition"];
    action.source_delta_ids = ["missing-delta"];
    action.evidence_refs = ["missing-evidence"];
    const codes = validateGroundedSkillDistillationSuite(suite, sourceCatalog()).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["source.transition_ref", "source.delta_ref", "source.evidence_ref"]));
  });

  it("distinguishes replayed teacher actions from designed counterfactual actions", () => {
    const replay = validSuite();
    replay.capabilities[0].variants[0].board_actions[0].source_delta_ids = [];
    expect(validateGroundedSkillDistillationSuite(replay, sourceCatalog()).issues.map((issue) => issue.code))
      .toContain("action.replay_delta");

    const designed = validSuite();
    designed.capabilities[0].variants[0].board_actions[0].origin = "counterfactual";
    designed.capabilities[0].variants[0].board_actions[0].source_delta_ids = [];
    expect(validateGroundedSkillDistillationSuite(designed, sourceCatalog())).toEqual({ valid: true, issues: [] });

    const merged = validSuite();
    merged.capabilities[0].variants[0].board_actions[0].origin = "merged";
    merged.capabilities[0].variants[0].board_actions[0].source_delta_ids = [];
    expect(validateGroundedSkillDistillationSuite(merged, sourceCatalog()).issues.map((issue) => issue.code))
      .toContain("action.replay_delta");
  });

  it("requires every capability-level transition to support at least one action", () => {
    const suite = validSuite();
    const catalog = sourceCatalog();
    catalog.accepted_transitions.push({ transition_id: "transition-2", delta_ids: ["delta-2"], evidence_refs: ["ev-other"], visual_evidence_by_delta: { "delta-2": ["ev-other"] } });
    catalog.evidence_ids.push("ev-other");
    catalog.submitted_visual_evidence_ids.push("ev-other");
    suite.capabilities[0].source_transition_ids.push("transition-2");
    suite.capabilities[0].evidence_refs.push("ev-other");
    expect(validateGroundedSkillDistillationSuite(suite, catalog).issues.map((issue) => issue.code))
      .toContain("capability.unused_transition");
  });

  it("requires replay actions to cite the exact successfully submitted visual for every delta", () => {
    const speechOnly = validSuite();
    speechOnly.capabilities[0].variants[0].board_actions[0].evidence_refs = ["ev-speech"];
    speechOnly.capabilities[0].evidence_refs = ["ev-speech"];
    expect(validateGroundedSkillDistillationSuite(speechOnly, sourceCatalog()).issues.map((issue) => issue.code))
      .toContain("action.delta_visual_ref");

    const notSubmitted = sourceCatalog();
    notSubmitted.submitted_visual_evidence_ids = [];
    expect(validateGroundedSkillDistillationSuite(validSuite(), notSubmitted).issues.map((issue) => issue.code))
      .toContain("action.delta_visual_not_submitted");
  });

  it("requires exactly one render-plan owner for every Board Action", () => {
    const missing = validSuite();
    missing.capabilities[0].variants[0].render_plans[0].board_action_ids = [];
    expect(validateGroundedSkillDistillationSuite(missing, sourceCatalog()).issues.map((issue) => issue.code))
      .toEqual(expect.arrayContaining(["field.array_empty", "render_plan.coverage"]));

    const duplicate = validSuite();
    duplicate.capabilities[0].variants[0].render_plans.push({
      ...structuredClone(duplicate.capabilities[0].variants[0].render_plans[0]),
      plan_id: "plan-2",
    });
    expect(validateGroundedSkillDistillationSuite(duplicate, sourceCatalog()).issues.map((issue) => issue.code))
      .toContain("render_plan.coverage");
  });

  it("keeps preferred and fallback renderers within the allowed set", () => {
    const suite = validSuite();
    const plan = suite.capabilities[0].variants[0].render_plans[0];
    plan.preferred_target = "ink";
    plan.fallback_targets = ["ink"];
    const codes = validateGroundedSkillDistillationSuite(suite, sourceCatalog()).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["render_plan.preferred", "render_plan.fallback"]));
  });

  it("rejects observed-student fields anywhere in a teacher-only suite", () => {
    const suite = validSuite() as unknown as { capabilities: Array<Record<string, unknown>> };
    suite.capabilities[0].observed_student_response = "学生点头";
    const codes = validateGroundedSkillDistillationSuite(suite, sourceCatalog()).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["schema.unknown_field", "suite.student_claim"]));
  });

  it("rejects observed-student claims hidden in otherwise allowed free text", () => {
    const suite = validSuite();
    suite.capabilities[0].summary = "学生已经理解了重力分解。";
    expect(validateGroundedSkillDistillationSuite(suite, sourceCatalog()).issues.map((issue) => issue.code))
      .toContain("suite.student_claim_text");

    for (const claim of [
      "学生听懂了并会做题了", "课堂里的同学都明白了", "学生成绩提高了10分", "学生的错误率下降了", "同学们不再犯错",
      "The students have understood the lesson", "The students improved their scores", "learners made fewer errors",
    ]) {
      const hidden = validSuite();
      hidden.capabilities[0].summary = claim;
      expect(validateGroundedSkillDistillationSuite(hidden, sourceCatalog()).issues.map((issue) => issue.code))
        .toContain("suite.student_claim_text");
    }
  });

  it("keeps renderer names out of Board Action text and rejects markup in every free-text slot", () => {
    const bound = validSuite();
    bound.capabilities[0].variants[0].board_actions[0].content_template = "必须使用 HTML renderer 渲染公式卡片";
    bound.capabilities[0].variants[0].board_actions[0].spatial_constraints = ["SVG only"];
    expect(validateGroundedSkillDistillationSuite(bound, sourceCatalog()).issues.map((issue) => issue.code))
      .toContain("action.renderer_binding");

    const markup = validSuite();
    markup.capabilities[0].variants[0].board_actions[0].pedagogical_target = "<script>alert(1)</script>";
    markup.capabilities[0].variants[0].learning_checks[0].prompt_template = "<iframe src=evil></iframe>";
    expect(validateGroundedSkillDistillationSuite(markup, sourceCatalog()).issues.map((issue) => issue.code))
      .toContain("text.raw_markup");
  });

  it("requires fallback renderers and action provenance to be meaningful and unique", () => {
    const fallback = validSuite();
    fallback.capabilities[0].variants[0].render_plans[0].preferred_target = "html";
    fallback.capabilities[0].variants[0].render_plans[0].fallback_targets = ["html"];
    expect(validateGroundedSkillDistillationSuite(fallback, sourceCatalog()).issues.map((issue) => issue.code))
      .toContain("render_plan.fallback_preferred");

    const duplicate = validSuite();
    duplicate.capabilities[0].variants[0].board_actions[0].source_transition_ids.push("transition-1");
    expect(validateGroundedSkillDistillationSuite(duplicate, sourceCatalog()).issues.map((issue) => issue.code))
      .toContain("field.duplicate");
  });

  it("scopes capability evidence to its own accepted transitions", () => {
    const suite = validSuite();
    const catalog = sourceCatalog();
    catalog.evidence_ids.push("ev-other");
    catalog.accepted_transitions.push({
      transition_id: "transition-2",
      delta_ids: ["delta-2"],
      evidence_refs: ["ev-other"],
      visual_evidence_by_delta: { "delta-2": ["ev-other"] },
    });
    suite.capabilities[0].evidence_refs.push("ev-other");
    expect(validateGroundedSkillDistillationSuite(suite, catalog).issues.map((issue) => issue.code))
      .toContain("source.evidence_scope");
  });

  it("binds the suite identity and teacher-only flag to the source catalog", () => {
    const suite = validSuite();
    suite.source_bundle_id = "another-bundle";
    suite.teacher_only_recording = false;
    const codes = validateGroundedSkillDistillationSuite(suite, sourceCatalog()).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["suite.source_bundle", "suite.teacher_only_mismatch"]));
  });
});
