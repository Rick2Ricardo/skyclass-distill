import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { BoardEvidenceBundle } from "../../contracts/src/index.js";
import { acceptedTemporalBoardFixture } from "../../contracts/src/testFixtures.js";
import type { ImageInput, LlmRequestAudit } from "../../llm/src/client.js";
import {
  batchGroundedVisualEvidence,
  buildGroundedSkillSourceCatalog,
  distillGroundedSkills,
  type GroundedSkillVisualEvidence,
} from "./groundedSkills.js";

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function validSuite(): Record<string, unknown> {
  return {
    schema_version: "grounded-skill-distillation-v2",
    suite_name: "视觉证据能力",
    subject: "高中物理",
    source_bundle_id: "fixture-bundle-1",
    renderer_neutral: true,
    teacher_only_recording: true,
    capabilities: [{
      key: "draw-force-progressively",
      name: "渐进画出重力",
      summary: "先确定研究对象，再增加重力箭头。",
      teaching_goal: "识别重力方向。",
      mechanism: "通过逐步显露降低图示负荷。",
      use_when: ["需要建立受力图"], prerequisites: ["已经确定研究对象"],
      variants: [{
        variant_id: "main", use_when: ["物块受力分析"],
        board_actions: [{
          action_id: "action-1", step: 1, origin: "teacher_replay", operation: "introduce",
          pedagogical_target: "建立重力方向", content_template: "从研究对象重心竖直向下画 {gravity_vector}",
          artifact_kind: "diagram", spatial_constraints: ["箭头起点位于研究对象重心"], progressive_reveal: true,
          source_transition_ids: ["transition-1"], source_delta_ids: ["delta-1"], evidence_refs: ["ev-delta", "ev-speech"],
        }],
        render_plans: [{
          plan_id: "plan-1", board_action_ids: ["action-1"], preferred_target: "svg", allowed_targets: ["svg", "ink"],
          fallback_targets: ["ink"], layout_mode: "freeform", interaction_mode: "stepwise", rationale: "矢量方向需要空间表达。",
        }],
        learning_checks: [{ check_id: "check-1", prompt_template: "指出重力方向。", success_criteria: ["方向竖直向下"], failure_codes: ["wrong-direction"] }],
        remediation_actions: [],
      }],
      abstain_when: ["研究对象未确定"], source_transition_ids: ["transition-1"], evidence_refs: ["ev-delta", "ev-speech"],
      limitations: ["尚未验证真实学生增益"],
    }],
    limitations: ["来自单节固定机位课堂"],
  };
}

function successfulAudit(images: ImageInput[]): LlmRequestAudit {
  return {
    request_sha256: "c".repeat(64), model: "vision-test", attempt_count: 1, provider_response_received: true, stop_reason: "stop", usage: null,
    transport: "pi", temperature: 0, max_output_tokens: null, seed: null, cache_retention: null, tools_policy: "none",
    submitted_visuals: images.map((image) => ({
      label: image.label,
      sha256: String(image.sha256),
      mime_type: image.mime_type ?? "image/png",
      byte_length: image.bytes?.byteLength ?? 0,
    })),
  };
}

describe("grounded Skill distillation entry", () => {
  it("refuses to build a source catalog from a partial or unvalidated bundle", () => {
    const bundle = {
      bundle_id: "bundle-1",
      teacher_only_recording: true,
      transitions: [{
        transition_id: "accepted-1",
        status: "accepted",
        delta_ids: ["delta-1"],
        evidence_refs: ["ev-accepted"],
      }, {
        transition_id: "pending-1",
        status: "needs_review",
        delta_ids: ["delta-pending"],
        evidence_refs: ["ev-pending"],
      }],
      evidence: [{ evidence_id: "ev-accepted" }, { evidence_id: "ev-pending" }, { evidence_id: "ev-unrelated" }],
    } as unknown as BoardEvidenceBundle;
    expect(() => buildGroundedSkillSourceCatalog(bundle)).toThrow("无效 BoardEvidenceBundle");
  });

  it("rejects an invalid BoardEvidenceBundle before calling the model", async () => {
    const chatJsonAudited = vi.fn();
    await expect(distillGroundedSkills({ chatJsonAudited }, {
      subject: "高中物理",
      mode: "single",
      bundle: { bundle_id: "invalid" } as unknown as BoardEvidenceBundle,
      bundlePath: "/tmp/invalid/bundle.json",
    })).rejects.toThrow("BoardEvidenceBundle 未通过校验");
    expect(chatJsonAudited).not.toHaveBeenCalled();
  });

  it("does not let a single lesson bundle impersonate cross-lesson common support", async () => {
    const chatJsonAudited = vi.fn();
    await expect(distillGroundedSkills({ chatJsonAudited }, {
      subject: "高中物理",
      mode: "common",
      bundle: { bundle_id: "one-lesson-only" } as unknown as BoardEvidenceBundle,
      bundlePath: "/tmp/invalid/bundle.json",
    })).rejects.toThrow("多个独立 BoardEvidenceBundle");
    expect(chatJsonAudited).not.toHaveBeenCalled();
  });

  it("submits the exact accepted delta montage and persists an auditable source catalog", async () => {
    const root = await mkdtemp(join(tmpdir(), "grounded-visual-"));
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets", "comparison.png"), PNG_1X1);
    const bundle = acceptedTemporalBoardFixture(createHash("sha256").update(PNG_1X1).digest("hex"));
    const bundlePath = join(root, "bundle.json");
    await writeFile(bundlePath, JSON.stringify(bundle));
    const chatJsonAudited = vi.fn(async (_system: string, user: string, images: ImageInput[]) => {
      expect(images).toHaveLength(1);
      expect(images[0].label).toContain("delta_id=delta-1");
      expect(user).toContain("本批实际提交视觉索引");
      return { value: validSuite(), audit: successfulAudit(images) };
    });
    const result = await distillGroundedSkills({ chatJsonAudited } as any, {
      subject: "高中物理", mode: "single", bundle, bundlePath,
    });
    expect(result.visual_audit).toMatchObject({
      submitted_delta_ids: ["delta-1"],
      submitted_visual_evidence_ids: ["ev-delta"],
      all_visual_batches_succeeded: true,
      batches: [{ delta_ids: ["delta-1"], evidence_ids: ["ev-delta"] }],
    });
    expect(result.source_catalog.accepted_transitions[0].visual_evidence_by_delta)
      .toEqual({ "delta-1": ["ev-delta"] });
    expect(result.suite.schema_version).toBe("grounded-skill-distillation-v2");
  });

  it("reuses the same pre-read visual bytes across schema repair attempts", async () => {
    const root = await mkdtemp(join(tmpdir(), "grounded-repair-"));
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets", "comparison.png"), PNG_1X1);
    const bundle = acceptedTemporalBoardFixture(createHash("sha256").update(PNG_1X1).digest("hex"));
    const bundlePath = join(root, "bundle.json");
    await writeFile(bundlePath, JSON.stringify(bundle));
    const byteHashes: string[] = [];
    const chatJsonAudited = vi.fn(async (_system: string, _user: string, images: ImageInput[]) => {
      byteHashes.push(createHash("sha256").update(Buffer.from(images[0].bytes ?? [])).digest("hex"));
      return { value: byteHashes.length === 1 ? { invalid: true } : validSuite(), audit: successfulAudit(images) };
    });
    const result = await distillGroundedSkills({ chatJsonAudited } as any, {
      subject: "高中物理", mode: "single", bundle, bundlePath, validationAttempts: 2,
    });
    expect(byteHashes).toEqual([bundle.deltas[0].comparison_asset.sha256, bundle.deltas[0].comparison_asset.sha256]);
    expect(result.visual_audit.batches[0].requests).toHaveLength(2);
  });

  it("batches five montage events as four plus one instead of dropping the fifth", () => {
    const visuals = Array.from({ length: 5 }, (_, index) => ({
      transition_ids: [`transition-${index}`], delta_id: `delta-${index}`, evidence_ids: [`ev-${index}`],
      asset_uri: `assets/${index}.png`, sha256: String(index).repeat(64).slice(0, 64), label: `visual-${index}`,
      width: 1, height: 1, byte_length: 10,
      image: { label: `visual-${index}`, bytes: PNG_1X1, mime_type: "image/png" },
    } as GroundedSkillVisualEvidence));
    expect(batchGroundedVisualEvidence(visuals).map((batch) => batch.length)).toEqual([4, 1]);
  });
});
