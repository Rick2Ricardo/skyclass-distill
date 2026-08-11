import { describe, expect, it } from "vitest";
import type { Board2SkillBundle } from "./board2skill.js";
import { validateBoard2SkillBundle } from "./board2skill.js";

const HASH = "a".repeat(64);

function validBundle(): Board2SkillBundle {
  return {
    schema_version: "board2skill-opt-v2",
    bundle_id: "bundle-1",
    created_at: "2026-08-11T00:00:00.000Z",
    data_split: "selection",
    rights_status: "internal_review_only",
    promotion_policy: {
      minimum_selection_gain: 0.05,
      minimum_worst_group_delta: -0.02,
      maximum_unsupported_claim_rate_delta: 0,
      maximum_answer_leakage_rate_delta: 0,
    },
    evidence: [{
      evidence_id: "ev-1",
      kind: "speech",
      source_resource_id: "video-1",
      time: { start_ms: 1_000, end_ms: 2_000 },
      asset_uri: "evidence/video-1/transcript.json",
      sha256: HASH,
    }],
    observations: [{
      observation_id: "obs-1",
      source_resource_id: "video-1",
      source_video_id: "video-1",
      teacher_key: "teacher-a",
      teacher_only_recording: true,
      time: { start_ms: 1_000, end_ms: 2_000 },
      evidence_refs: ["ev-1"],
      observed_actions: ["speak"],
      observed_content: ["教师提出先确定研究对象"],
      learner_observation: null,
      uncertainty_codes: [],
      immutable: true,
      payload_sha256: HASH,
    }],
    hypotheses: [{
      hypothesis_id: "hyp-1",
      observation_ids: ["obs-1"],
      alternative_group_id: "alt-1",
      intent: "先固定系统边界",
      intended_learner_change: "减少内外力混淆",
      trigger_kind: "teacher_anticipated_misconception",
      confidence: 0.7,
      status: "candidate",
      evidence_refs: ["ev-1"],
    }],
    experiences: [{
      experience_id: "exp-1",
      type: "strategy_comparison",
      source: "controlled_rollout",
      observation_ids: ["obs-1"],
      hypothesis_ids: ["hyp-1"],
      policy_version_ids: ["policy-1"],
      scenario_ids: ["scenario-1"],
      outcome: "success",
      failure_codes: [],
      evidence_refs: ["ev-1"],
      write_decision: "write",
    }],
    policy_versions: [{
      policy_version_id: "policy-1",
      skill_id: "system-boundary",
      version: "1.0.0",
      parent_policy_version_ids: [],
      status: "selected",
      name: "先定系统边界",
      goal: "正确区分内外力",
      mechanism: "先圈定研究对象，再判断施力物体是否位于系统外",
      applicability: { all: [], any: [], abstain_when: [], uncertainty_policy: "ask" },
      variants: [{
        variant_id: "main",
        use_when: [],
        actions: [{
          action_id: "action-1",
          step: 1,
          kind: "draw",
          instruction_template: "圈出研究对象",
          origin: "teacher_replay",
          observation_ids: ["obs-1"],
          experience_ids: [],
        }],
        expected_effects: [{ description: "减少内外力混淆", level: "validated", validation_ids: ["validation-1"] }],
        checks: [{ prompt_template: "系统是谁？", success_criteria: ["明确列出对象"], failure_codes: ["system-boundary"] }],
        remediation_actions: [],
        do_not_use_when: [],
      }],
      source_observation_ids: ["obs-1"],
      source_experience_ids: ["exp-1"],
      evidence_refs: ["ev-1"],
      promotion: {
        validation_id: "validation-1",
        dataset_id: "physics-force-24",
        dataset_version: "0.1.0",
        split: "selection",
        gate_results: ["schema", "evidence", "executable", "pedagogical"].map((gate) => ({
          gate: gate as "schema" | "evidence" | "executable" | "pedagogical",
          status: "pass" as const,
          details: "passed",
        })),
        selection_gain: 0.06,
        worst_group_delta: -0.01,
        unsupported_claim_rate_delta: -0.01,
        answer_leakage_rate_delta: 0,
        family_deltas: [
          { family_id: "elevator_apparent_weight", episode_success_delta: 0.05 },
          { family_id: "stacked_blocks_friction", episode_success_delta: 0.07 },
        ],
        critical_physics_errors: 0,
        critical_diagram_errors: 0,
        decision: "promote",
        reasons: ["selection 集提升且硬门全部通过"],
      },
      immutable: true,
    }],
    active_policy_version_ids: ["policy-1"],
  };
}

describe("validateBoard2SkillBundle", () => {
  it("rejects a version-only shell instead of treating missing structure as empty arrays", () => {
    const report = validateBoard2SkillBundle({ schema_version: "board2skill-opt-v2" });
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["bundle.id", "bundle.array", "bundle.promotion_policy"]));
  });

  it("accepts a grounded policy promoted only from the selection split", () => {
    expect(validateBoard2SkillBundle(validBundle())).toEqual({ valid: true, issues: [] });
  });

  it("rejects invented learner observations in teacher-only recordings", () => {
    const bundle = validBundle();
    bundle.observations[0].learner_observation = { value: "学生恍然大悟", evidence_refs: ["ev-1"] };
    const report = validateBoard2SkillBundle(bundle);
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("observation.fabricated_learner");
  });

  it("does not let a missing teacher-only flag bypass learner evidence rules", () => {
    const bundle = validBundle() as unknown as { observations: Array<Record<string, unknown>> };
    delete bundle.observations[0].teacher_only_recording;
    bundle.observations[0].learner_observation = { value: "学生点头", evidence_refs: ["ev-1"] };
    const report = validateBoard2SkillBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["observation.teacher_only", "observation.fabricated_learner"]));
  });

  it("rejects absolute evidence paths and missing references", () => {
    const bundle = validBundle();
    bundle.evidence[0].asset_uri = "/Users/example/private/frame.jpg";
    bundle.hypotheses[0].observation_ids = ["missing-observation"];
    const report = validateBoard2SkillBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["evidence.asset_uri", "hypothesis.observation_ref"]));
  });

  it("rejects URI schemes and malformed nested references", () => {
    const bundle = validBundle() as unknown as {
      evidence: Array<Record<string, unknown>>;
      policy_versions: Array<{ variants: Array<{ actions: Array<Record<string, unknown>> }> }>;
      active_policy_version_ids: unknown[];
    };
    bundle.evidence[0].asset_uri = "file:///etc/passwd";
    bundle.policy_versions[0].variants[0].actions[0].observation_ids = [123];
    bundle.active_policy_version_ids = [123];
    const report = validateBoard2SkillBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["evidence.asset_uri", "policy.action_observation_ref.type", "bundle.active_type"]));
  });

  it("rejects UNC, encoded traversal, and non-finite timestamps", () => {
    const unc = validBundle();
    unc.evidence[0].asset_uri = "\\\\server\\share\\secret";
    expect(validateBoard2SkillBundle(unc).issues.map((issue) => issue.code)).toContain("evidence.asset_uri");

    const traversal = validBundle();
    traversal.evidence[0].asset_uri = "%252e%252e/secret";
    expect(validateBoard2SkillBundle(traversal).issues.map((issue) => issue.code)).toContain("evidence.asset_uri");

    const encodedUnc = validBundle();
    encodedUnc.evidence[0].asset_uri = "%255c%255cserver%255cshare%255csecret";
    expect(validateBoard2SkillBundle(encodedUnc).issues.map((issue) => issue.code)).toContain("evidence.asset_uri");

    const nonFinite = validBundle();
    nonFinite.observations[0].time = { start_ms: Number.NaN, end_ms: Number.POSITIVE_INFINITY };
    expect(validateBoard2SkillBundle(nonFinite).issues.map((issue) => issue.code)).toContain("time.invalid");
  });

  it("allows NO_WRITE only with an explicit reason", () => {
    const bundle = validBundle();
    bundle.experiences[0].write_decision = "no_write";
    const report = validateBoard2SkillBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("experience.no_write_reason");
  });

  it("prevents a NO_WRITE experience from entering a reusable policy", () => {
    const bundle = validBundle();
    bundle.experiences[0].write_decision = "no_write";
    bundle.experiences[0].no_write_reason = "裁判不确定";
    const report = validateBoard2SkillBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("policy.no_write_ref");
  });

  it("rejects promotion from locked test or with a failed gate", () => {
    const bundle = validBundle();
    const promotion = bundle.policy_versions[0].promotion!;
    promotion.split = "locked_test";
    promotion.gate_results[2].status = "fail";
    const report = validateBoard2SkillBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["policy.test_leakage", "policy.gates"]));
  });

  it("rejects a hidden promote decision on a non-selected candidate", () => {
    const bundle = validBundle();
    bundle.policy_versions[0].status = "candidate";
    bundle.policy_versions[0].promotion!.split = "locked_test";
    bundle.active_policy_version_ids = [];
    const report = validateBoard2SkillBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["policy.test_leakage", "policy.promote_status"]));
  });

  it("rejects contradictory duplicate gates and non-finite promotion metrics", () => {
    const bundle = validBundle();
    bundle.policy_versions[0].promotion!.gate_results.push({ gate: "schema", status: "fail", details: "contradiction" });
    bundle.policy_versions[0].promotion!.selection_gain = Number.NaN;
    const report = validateBoard2SkillBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["policy.gates", "policy.metric_missing"]));
  });

  it("rejects dangling validation references and inconsistent policy states", () => {
    const dangling = validBundle();
    dangling.policy_versions[0].variants[0].expected_effects[0].validation_ids = ["missing-validation"];
    expect(validateBoard2SkillBundle(dangling).issues.map((issue) => issue.code)).toContain("policy.effect_validation_ref");

    const rejected = validBundle();
    rejected.policy_versions[0].status = "rejected";
    rejected.policy_versions[0].promotion!.decision = "hold";
    rejected.active_policy_version_ids = [];
    expect(validateBoard2SkillBundle(rejected).issues.map((issue) => issue.code)).toContain("policy.rejected_decision");

    const candidate = validBundle();
    candidate.policy_versions[0].status = "candidate";
    candidate.policy_versions[0].promotion!.decision = "reject";
    candidate.active_policy_version_ids = [];
    expect(validateBoard2SkillBundle(candidate).issues.map((issue) => issue.code)).toContain("policy.candidate_decision");
  });

  it("requires two distinct positive families and non-negative integer critical counts", () => {
    const bundle = validBundle();
    bundle.policy_versions[0].promotion!.family_deltas[1].family_id = bundle.policy_versions[0].promotion!.family_deltas[0].family_id;
    bundle.policy_versions[0].promotion!.critical_physics_errors = -1;
    const report = validateBoard2SkillBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["policy.family_duplicate", "policy.critical_physics_errors"]));
  });

  it("enforces the fixed 5pp floor, two positive families, and zero critical errors", () => {
    const bundle = validBundle();
    bundle.promotion_policy.minimum_selection_gain = 0.01;
    bundle.policy_versions[0].promotion!.family_deltas[1].episode_success_delta = 0;
    bundle.policy_versions[0].promotion!.critical_diagram_errors = 1;
    const report = validateBoard2SkillBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["promotion_policy.too_weak", "policy.family_direction", "policy.critical_diagram_errors"]));
  });

  it("allows a selection-promoted policy to be evaluated in a locked-test bundle", () => {
    const bundle = validBundle();
    bundle.data_split = "locked_test";
    expect(validateBoard2SkillBundle(bundle).valid).toBe(true);
  });

  it("rejects a selected policy that regresses past a promotion threshold", () => {
    const bundle = validBundle();
    bundle.policy_versions[0].promotion!.worst_group_delta = -0.05;
    const report = validateBoard2SkillBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("policy.metric_threshold");
  });

  it("rejects cyclic policy ancestry", () => {
    const bundle = validBundle();
    bundle.policy_versions[0].parent_policy_version_ids = ["policy-1"];
    const report = validateBoard2SkillBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("policy.parent_cycle");
  });

  it("rejects blocked-rights bundles from the distillation path", () => {
    const bundle = validBundle();
    bundle.rights_status = "blocked";
    expect(validateBoard2SkillBundle(bundle).issues.map((issue) => issue.code)).toContain("bundle.rights_blocked");
  });
});
