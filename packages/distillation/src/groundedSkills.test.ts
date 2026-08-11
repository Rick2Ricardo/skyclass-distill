import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { canonicalGoldReviewDecisionSignaturePayload, canonicalGoldReviewPackageSignoffSignaturePayload, canonicalSignedGoldDatasetPayload, type BoardEvidenceBundle, type GoldReviewDecisionRecord, type SignedGoldDataset } from "../../contracts/src/index.js";
import { acceptedTemporalBoardFixture } from "../../contracts/src/testFixtures.js";
import type { ImageInput, LlmRequestAudit } from "../../llm/src/client.js";
import {
  batchGroundedVisualEvidence,
  buildGroundedSkillSourceCatalog,
  distillGroundedSkills,
  distillSignedGoldLesson,
  type GroundedSkillVisualEvidence,
} from "./groundedSkills.js";

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function validSuite(
  sourceBundleId = "fixture-bundle-1",
  transitionId = "transition-1",
  deltaId = "delta-1",
  evidenceRefs = ["ev-delta", "ev-speech"],
): Record<string, unknown> {
  return {
    schema_version: "grounded-skill-distillation-v2",
    suite_name: "视觉证据能力",
    subject: "高中物理",
    source_bundle_id: sourceBundleId,
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
          source_transition_ids: [transitionId], source_delta_ids: [deltaId], evidence_refs: evidenceRefs,
        }],
        render_plans: [{
          plan_id: "plan-1", board_action_ids: ["action-1"], preferred_target: "svg", allowed_targets: ["svg", "ink"],
          fallback_targets: ["ink"], layout_mode: "freeform", interaction_mode: "stepwise", rationale: "矢量方向需要空间表达。",
        }],
        learning_checks: [{ check_id: "check-1", prompt_template: "指出重力方向。", success_criteria: ["方向竖直向下"], failure_codes: ["wrong-direction"] }],
        remediation_actions: [],
      }],
      abstain_when: ["研究对象未确定"], source_transition_ids: [transitionId], evidence_refs: evidenceRefs,
      limitations: ["尚未验证真实学生增益"],
    }],
    limitations: ["来自单节固定机位课堂"],
  };
}

function signedGoldFixture(rootAsset = "assets/comparison.png"): SignedGoldDataset {
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  const sha = createHash("sha256").update(PNG_1X1).digest("hex");
  const events = Array.from({ length: 30 }, (_, index) => ({
    event_id: `event-${String(index + 1).padStart(2, "0")}`,
    source_event_refs: ["a-1", "b-1"], operation: "ADD" as const,
    time: { start: 10, end: 12 }, semantic_label: index === 0 ? "新增重力箭头" : `新增可见板书 ${index + 1}`,
    region: null, relation: null, modification: null,
  }));
  const decisionBase: Omit<GoldReviewDecisionRecord, "signature_sha256"> = {
    schema_version: "gold-review-decision-v1", package_id: "package-1", group_id: "G01", revision: 1,
    parent_signature_sha256: null, source_intake_sha256: "a".repeat(64), disposition: "accept",
    selected_candidate_ids: events.map((item) => item.event_id), final_events: events,
    adjudicator_id: "expert-1", adjudicator_role: "visual-reviewer", rationale: "视觉证据逐项确认。", decided_at: "2026-08-12T00:00:00.000Z",
  };
  const decision: GoldReviewDecisionRecord = { ...decisionBase, signature_sha256: digest(canonicalGoldReviewDecisionSignaturePayload(decisionBase)) };
  const signoff = (role: "visual_adjudicator" | "physics_reviewer", id: string) => {
    const base = {
      schema_version: "gold-review-package-signoff-v1" as const, package_id: "package-1", signoff_role: role,
      source_intake_sha256: "a".repeat(64), decision_signatures: [decision.signature_sha256], adjudicator_id: id,
      adjudicator_role: role, statement: "我确认全部视觉与物理证据已完成复核。",
      signed_at: role === "visual_adjudicator" ? "2026-08-12T00:00:00.000Z" : "2026-08-12T00:01:00.000Z",
    };
    return { ...base, signature_sha256: digest(canonicalGoldReviewPackageSignoffSignaturePayload(base)) };
  };
  const payload = {
    schema_version: "signed-gold-dataset-v1" as const,
    status: "paper_gold_signed" as const,
    frozen_at: "2026-08-12T00:01:00.000Z",
    source_queue_schema_version: "gold-review-queue-v1" as const,
    package_count: 1,
    reviewed_group_count: 1,
    accepted_group_count: 1,
    accepted_event_count: 30,
    minimum_required_event_count: 30,
    packages: [{
      package_id: "package-1",
      source_video_id: "video-1",
      source_intake_uri: "research/intake.json",
      source_intake_sha256: "a".repeat(64),
      reviewed_group_count: 1,
      accepted_group_count: 1,
      accepted_event_count: 30,
      decision_signatures: [decision.signature_sha256],
      decisions: [decision],
      signoffs: [signoff("visual_adjudicator", "expert-1"), signoff("physics_reviewer", "expert-2")],
      groups: [{
        group_id: "G01",
        alignment_class: "matched",
        decision_signature_sha256: decision.signature_sha256,
        decision_revision: 1,
        final_events: events,
        canonical_visual_evidence_id: "comparison-1",
        visual_evidence: [{
          evidence_id: "comparison-1", side: "shared", kind: "comparison", label: "before/delta/after",
          asset_uri: rootAsset, sha256: sha, mime_type: "image/png" as const, width: 1, height: 1, byte_length: PNG_1X1.byteLength,
        }],
        speech_context: { text: "老师讲解重力方向", status: "context_not_gold" as const },
      }],
    }],
  };
  const datasetSha256 = createHash("sha256").update(canonicalSignedGoldDatasetPayload(payload)).digest("hex");
  return { dataset_id: `signed-gold-${datasetSha256.slice(0, 16)}`, dataset_sha256: datasetSha256, ...payload };
}

function resignSignedGoldFixture(input: SignedGoldDataset): SignedGoldDataset {
  const dataset = structuredClone(input);
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  dataset.packages.forEach((reviewPackage) => {
    reviewPackage.decisions.forEach((decision) => {
      decision.signature_sha256 = digest(canonicalGoldReviewDecisionSignaturePayload(decision));
      const group = reviewPackage.groups.find((item) => item.group_id === decision.group_id);
      if (group) group.decision_signature_sha256 = decision.signature_sha256;
    });
    reviewPackage.decision_signatures = reviewPackage.decisions.map((item) => item.signature_sha256).sort();
    reviewPackage.signoffs.forEach((signoff) => {
      signoff.decision_signatures = [...reviewPackage.decision_signatures];
      signoff.signature_sha256 = digest(canonicalGoldReviewPackageSignoffSignaturePayload(signoff));
    });
  });
  dataset.dataset_sha256 = digest(canonicalSignedGoldDatasetPayload(dataset));
  dataset.dataset_id = `signed-gold-${dataset.dataset_sha256.slice(0, 16)}`;
  return dataset;
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

  it("distills one signed Gold lesson with exact visual and source bindings", async () => {
    const root = await mkdtemp(join(tmpdir(), "signed-gold-distill-"));
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets/comparison.png"), PNG_1X1);
    const dataset = signedGoldFixture();
    const sourceId = `signed-gold:${dataset.dataset_id}:package-1`;
    const transitionId = "gold-transition:package-1:G01";
    const deltaId = "gold-delta:package-1:G01";
    const evidenceId = "gold-evidence:package-1:G01:comparison-1";
    const chatJsonAudited = vi.fn(async (_system: string, user: string, images: ImageInput[]) => {
      expect(images).toHaveLength(1);
      expect(images[0].label).toContain(deltaId);
      expect(user).toContain("context_not_gold");
      expect(user).toContain("新增重力箭头");
      return { value: validSuite(sourceId, transitionId, deltaId, [evidenceId]), audit: successfulAudit(images) };
    });
    const result = await distillSignedGoldLesson({ chatJsonAudited } as any, {
      subject: "高中物理", dataset, evidenceRoot: root, sourceVideoId: "video-1", mode: "single",
    });
    expect(result.source_catalog).toMatchObject({
      source_bundle_id: sourceId,
      submitted_visual_evidence_ids: [evidenceId],
      accepted_transitions: [{ transition_id: transitionId, delta_ids: [deltaId], evidence_refs: [evidenceId] }],
    });
    expect(result.visual_audit).toMatchObject({
      evidence_package_sha256: dataset.dataset_sha256,
      batching_rule: "signed-gold-group-comparison-max-4-and-20mb",
      submitted_delta_ids: [deltaId],
    });
  });

  it("rejects tampered or cross-lesson Signed Gold before any model request", async () => {
    const dataset = signedGoldFixture();
    const chatJsonAudited = vi.fn();
    const tampered = structuredClone(dataset);
    tampered.packages[0].groups[0].final_events[0].semantic_label = "篡改后的板书事实";
    await expect(distillSignedGoldLesson({ chatJsonAudited }, {
      subject: "高中物理", dataset: tampered, evidenceRoot: "/tmp", sourceVideoId: "video-1", mode: "single",
    })).rejects.toThrow("签字链");
    await expect(distillSignedGoldLesson({ chatJsonAudited }, {
      subject: "高中物理", dataset, evidenceRoot: "/tmp", sourceVideoId: "video-1", mode: "common",
    })).rejects.toThrow("仅支持单课");
    expect(chatJsonAudited).not.toHaveBeenCalled();
  });

  it("rejects fully re-signed semantic, comparison, region, and relation forgeries", async () => {
    const chatJsonAudited = vi.fn();
    const semantic = structuredClone(signedGoldFixture());
    semantic.packages[0].groups[0].final_events[0].semantic_label = "学生已经掌握了摩擦力方向";
    semantic.packages[0].decisions[0].final_events[0].semantic_label = "学生已经掌握了摩擦力方向";
    await expect(distillSignedGoldLesson({ chatJsonAudited }, {
      subject: "高中物理", dataset: resignSignedGoldFixture(semantic), evidenceRoot: "/tmp", sourceVideoId: "video-1", mode: "single",
    })).rejects.toThrow("学生学习结果");

    const comparison = structuredClone(signedGoldFixture());
    comparison.packages[0].groups[0].visual_evidence[0].kind = "not_comparison";
    await expect(distillSignedGoldLesson({ chatJsonAudited }, {
      subject: "高中物理", dataset: resignSignedGoldFixture(comparison), evidenceRoot: "/tmp", sourceVideoId: "video-1", mode: "single",
    })).rejects.toThrow("规范 comparison");

    const region = structuredClone(signedGoldFixture());
    region.packages[0].groups[0].final_events[0].region = { x: .9, y: .9, width: .2, height: .2 };
    region.packages[0].decisions[0].final_events[0].region = { x: .9, y: .9, width: .2, height: .2 };
    await expect(distillSignedGoldLesson({ chatJsonAudited }, {
      subject: "高中物理", dataset: resignSignedGoldFixture(region), evidenceRoot: "/tmp", sourceVideoId: "video-1", mode: "single",
    })).rejects.toThrow("归一化区域");

    const relation = structuredClone(signedGoldFixture());
    relation.packages[0].groups[0].final_events[0].operation = "CONNECT";
    relation.packages[0].groups[0].final_events[0].relation = { source_object_ids: [], target_object_ids: [], relation_type: "" };
    relation.packages[0].decisions[0].final_events[0].operation = "CONNECT";
    relation.packages[0].decisions[0].final_events[0].relation = { source_object_ids: [], target_object_ids: [], relation_type: "" };
    await expect(distillSignedGoldLesson({ chatJsonAudited }, {
      subject: "高中物理", dataset: resignSignedGoldFixture(relation), evidenceRoot: "/tmp", sourceVideoId: "video-1", mode: "single",
    })).rejects.toThrow("关系闭包");
    expect(chatJsonAudited).not.toHaveBeenCalled();
  });
});
