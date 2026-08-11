import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GroundedSkillDistillationSuite, GroundedSkillSourceCatalog } from "../../contracts/src/index.js";
import { buildSkillSuite } from "./builder.js";

function suite(): GroundedSkillDistillationSuite {
  return {
    schema_version: "grounded-skill-distillation-v2",
    suite_name: "板书策略",
    subject: "高中物理",
    source_bundle_id: "bundle-1",
    renderer_neutral: true,
    teacher_only_recording: true,
    capabilities: [{
      key: "force-component-contrast",
      name: "区分实际力与分量",
      summary: "先画实际力，再对比分量。",
      teaching_goal: "避免重复计力。",
      mechanism: "使用相邻表示建立对比。",
      use_when: ["斜面受力分析"],
      prerequisites: ["已确定研究对象"],
      variants: [{
        variant_id: "main",
        use_when: [],
        board_actions: [{
          action_id: "action-1",
          step: 1,
          origin: "teacher_replay",
          operation: "contrast",
          pedagogical_target: "区分力与分量",
          content_template: "对比 {gravity} 与 {components}",
          artifact_kind: "comparison",
          spatial_constraints: ["左右并列"],
          progressive_reveal: true,
          source_transition_ids: ["transition-1"],
          source_delta_ids: ["delta-1"],
          evidence_refs: ["ev-1"],
        }],
        render_plans: [{
          plan_id: "plan-1",
          board_action_ids: ["action-1"],
          preferred_target: "auto",
          allowed_targets: ["html", "svg"],
          fallback_targets: ["html"],
          layout_mode: "split",
          interaction_mode: "stepwise",
          rationale: "HTML 负责对比，SVG 保留矢量方向。",
        }],
        learning_checks: [{
          check_id: "check-1",
          prompt_template: "指出实际外力。",
          success_criteria: ["不重复计入分量"],
          failure_codes: ["component-as-force"],
        }],
        remediation_actions: [],
      }],
      abstain_when: ["系统边界未确定"],
      source_transition_ids: ["transition-1"],
      evidence_refs: ["ev-1"],
      limitations: ["尚未验证学习增益"],
    }],
    limitations: ["固定机位试点"],
  };
}

function catalog(): GroundedSkillSourceCatalog {
  return {
    source_bundle_id: "bundle-1",
    teacher_only_recording: true,
    accepted_transitions: [{ transition_id: "transition-1", delta_ids: ["delta-1"], evidence_refs: ["ev-1"], visual_evidence_by_delta: { "delta-1": ["ev-1"] } }],
    evidence_ids: ["ev-1"],
    submitted_visual_evidence_ids: ["ev-1"],
  };
}

describe("buildSkillSuite grounded v2", () => {
  it("compiles validated Board Action IR without flattening renderer choice into the action", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "grounded-skill-builder-"));
    try {
      const built = await buildSkillSuite({
        suite: suite() as unknown as Record<string, unknown>,
        outputRoot,
        subject: "高中物理",
        provenance: { test: true },
        groundedSourceCatalog: catalog(),
      });
      expect(built).toHaveLength(1);
      expect(built[0].render_targets).toEqual(["html", "svg"]);
      expect(built[0].board_action_count).toBe(1);
      expect(built[0].has_executable_asset).toBe(true);
      const skillText = await readFile(join(String(built[0].path), "SKILL.md"), "utf8");
      expect(skillText).toContain("Renderer-neutral Board Actions");
      expect(skillText).toContain("允许渲染器**：html / svg");
      expect(skillText).toContain("动作来源**：teacher_replay");
      const manifest = JSON.parse(await readFile(join(String(built[0].path), "manifest.json"), "utf8"));
      expect(manifest.schema_version).toBe("grounded-skill-distillation-v2");
      expect(manifest.renderer_neutral).toBe(true);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it("refuses to compile an unvalidated grounded suite", async () => {
    const invalid = suite() as unknown as { capabilities: Array<{ variants: Array<{ board_actions: Array<Record<string, unknown>> }> }> };
    invalid.capabilities[0].variants[0].board_actions[0].content_template = "<script>unsafe()</script>";
    await expect(buildSkillSuite({
      suite: invalid as unknown as Record<string, unknown>,
      outputRoot: join(tmpdir(), "must-not-build-grounded-skill"),
      subject: "高中物理",
      provenance: {},
      groundedSourceCatalog: catalog(),
    })).rejects.toThrow("未通过校验");
  });

  it("marks incomplete legacy output invalid instead of inventing teaching steps", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "legacy-skill-builder-"));
    try {
      const built = await buildSkillSuite({
        suite: {
          suite_name: "legacy",
          capabilities: [{ key: "incomplete", name: "不完整能力", evidence: [] }],
        },
        outputRoot,
        subject: "高中物理",
        provenance: { test: true },
      });
      expect(built[0].valid).toBe(false);
      expect(built[0].errors).toEqual(expect.arrayContaining(["缺少 lesson_flow", "缺少 assessment_checkpoints", "缺少来源 evidence"]));
      const skillText = await readFile(join(String(built[0].path), "SKILL.md"), "utf8");
      expect(skillText).toContain("未提供可执行步骤；此 Skill 不应进入运行态");
      expect(skillText).not.toContain("推进一个可观察的教学动作");
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});
