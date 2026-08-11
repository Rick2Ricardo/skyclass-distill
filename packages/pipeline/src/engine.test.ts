import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalGoldReviewDecisionSignaturePayload, canonicalGoldReviewPackageSignoffSignaturePayload, canonicalSignedGoldDatasetPayload, type GoldReviewDecisionRecord, type SignedGoldDataset } from "../../contracts/src/index.js";
import { PipelineEngine } from "./engine.js";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function signedDataset(): SignedGoldDataset {
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  const events = Array.from({ length: 30 }, (_, index) => ({
    event_id: `event-${index + 1}`, source_event_refs: ["a-1", "b-1"], operation: "ADD" as const,
    time: { start: 10, end: 12 }, semantic_label: `新增可见板书 ${index + 1}`, region: null, relation: null, modification: null,
  }));
  const decisionBase: Omit<GoldReviewDecisionRecord, "signature_sha256"> = {
    schema_version: "gold-review-decision-v1", package_id: "package-1", group_id: "G01", revision: 1,
    parent_signature_sha256: null, source_intake_sha256: "a".repeat(64), disposition: "accept",
    selected_candidate_ids: events.map((item) => item.event_id), final_events: events, adjudicator_id: "expert-1",
    adjudicator_role: "visual-reviewer", rationale: "视觉证据逐项确认。", decided_at: "2026-08-12T00:00:00.000Z",
  };
  const decision: GoldReviewDecisionRecord = { ...decisionBase, signature_sha256: digest(canonicalGoldReviewDecisionSignaturePayload(decisionBase)) };
  const signoff = (role: "visual_adjudicator" | "physics_reviewer", index: number) => {
    const base = {
      schema_version: "gold-review-package-signoff-v1" as const, package_id: "package-1", signoff_role: role,
      source_intake_sha256: "a".repeat(64), decision_signatures: [decision.signature_sha256], adjudicator_id: `expert-${index + 1}`,
      adjudicator_role: role, statement: "我确认全部视觉与物理证据已完成复核。", signed_at: `2026-08-12T00:0${index}:00.000Z`,
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
      package_id: "package-1", source_video_id: "video-1", source_intake_uri: "research/intake.json",
      source_intake_sha256: "a".repeat(64), reviewed_group_count: 1, accepted_group_count: 1, accepted_event_count: 30,
      decision_signatures: [decision.signature_sha256],
      decisions: [decision],
      signoffs: (["visual_adjudicator", "physics_reviewer"] as const).map((role, index) => signoff(role, index)),
      groups: [{
        group_id: "G01", alignment_class: "matched", decision_signature_sha256: decision.signature_sha256, decision_revision: 1,
        final_events: events,
        canonical_visual_evidence_id: "comparison-1",
        visual_evidence: [{ evidence_id: "comparison-1", side: "shared", kind: "comparison", label: "before/delta/after", asset_uri: "assets/comparison.png", sha256: "e".repeat(64), mime_type: "image/png" as const, width: 1, height: 1, byte_length: 68 }],
        speech_context: { text: "", status: "context_not_gold" as const },
      }],
    }],
  };
  const hash = createHash("sha256").update(canonicalSignedGoldDatasetPayload(payload)).digest("hex");
  return { dataset_id: `signed-gold-${hash.slice(0, 16)}`, dataset_sha256: hash, ...payload };
}

async function writeSignedDataset(dataset: SignedGoldDataset, correctPath = true): Promise<{ dataDir: string; uri: string }> {
  const dataDir = await mkdtemp(join(tmpdir(), "signed-gold-pipeline-"));
  created.push(dataDir);
  const uri = correctPath ? `board2skill/signed-gold/${dataset.dataset_sha256}/dataset.json` : "board2skill/signed-gold/manual.json";
  const path = join(dataDir, uri);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(dataset));
  return { dataDir, uri };
}

function engine(options: { dataDir?: string; artifacts?: Record<string, string>; jobs?: Record<string, unknown> } = {}): PipelineEngine {
  const library = {
    getProject: async () => ({ id: "project", name: "物理", subject: "物理", grade: "高中" }),
    getVideo: async (id: string) => ({ id, project_id: "project", artifacts: options.artifacts }),
  };
  const jobs = options.jobs ?? {};
  const settings = {};
  return new PipelineEngine(process.cwd(), options.dataDir ?? "/tmp/anyteacher-test", library as any, jobs as any, settings as any);
}

describe("PipelineEngine distillation contract", () => {
  it("requires exactly one video for single-lesson mode", async () => {
    await expect(engine().createDistill("project", {
      video_ids: ["a", "b"],
      mode: "single",
      modality: "text",
    })).rejects.toThrow("单课模式必须且只能选择一个视频");
  });

  it("requires at least four videos for common-skill mode", async () => {
    await expect(engine().createDistill("project", {
      video_ids: ["a", "b", "c"],
      mode: "common",
      modality: "multimodal",
    })).rejects.toThrow("跨课共性模式至少需要四段课堂");
  });

  it("only permits temporal board evidence in single-lesson mode", async () => {
    await expect(engine().createDistill("project", {
      video_ids: ["a", "b", "c", "d"],
      mode: "common",
      modality: "multimodal",
      evidence_mode: "temporal_board",
    })).rejects.toThrow("时序板书 v2 首批仅支持单课模式");
  });

  it("requires a controlled adjudicated bundle for temporal board distillation", async () => {
    await expect(engine().createDistill("project", {
      video_ids: ["a"],
      mode: "single",
      modality: "multimodal",
      evidence_mode: "temporal_board",
      board_bundle_uri: "../outside.json",
    })).rejects.toThrow("受控路径");
    await expect(engine().createDistill("project", {
      video_ids: ["a"], mode: "single", modality: "multimodal", evidence_mode: "temporal_board",
      board_bundle_uri: "%252e%252e%252foutside.json",
    })).rejects.toThrow("受控路径");
    await expect(engine().createDistill("project", {
      video_ids: ["a"], mode: "single", modality: "multimodal", evidence_mode: "temporal_board",
      board_bundle_uri: "/tmp/outside.json",
    })).rejects.toThrow("受控路径");
    await expect(engine().createDistill("project", {
      video_ids: ["a"],
      mode: "single",
      modality: "multimodal",
      evidence_mode: "temporal_board",
    })).rejects.toThrow("已仲裁的 board_bundle_json");
  });

  it("fails closed for uncontrolled, forged, or manually placed Signed Gold datasets", async () => {
    await expect(engine().createSignedGoldDistill("project", { dataset_uri: "../outside.json", source_video_id: "video-1" }))
      .rejects.toThrow("受控相对路径");
    await expect(engine().createSignedGoldDistill("project", { dataset_uri: "%252e%252e%252foutside.json", source_video_id: "video-1" }))
      .rejects.toThrow("受控相对路径");
    await expect(engine().createSignedGoldDistill("project", { dataset_uri: "/tmp/outside.json", source_video_id: "video-1" }))
      .rejects.toThrow("受控相对路径");

    const dataset = signedDataset();
    const manuallyPlaced = await writeSignedDataset(dataset, false);
    await expect(engine({ dataDir: manuallyPlaced.dataDir }).createSignedGoldDistill("project", {
      dataset_uri: manuallyPlaced.uri, source_video_id: "video-1",
    })).rejects.toThrow("内容寻址编译目录");

    const forged = structuredClone(dataset);
    forged.packages[0].signoffs[1].adjudicator_id = forged.packages[0].signoffs[0].adjudicator_id;
    const forgedFile = await writeSignedDataset(forged);
    await expect(engine({ dataDir: forgedFile.dataDir }).createSignedGoldDistill("project", {
      dataset_uri: forgedFile.uri, source_video_id: "video-1",
    })).rejects.toThrow("双签必须由不同人员");
  });

  it("does not accept a self-consistent dataset that is absent from the current review ledger", async () => {
    const dataset = signedDataset();
    const file = await writeSignedDataset(dataset);
    await expect(engine({ dataDir: file.dataDir }).createSignedGoldDistill("project", {
      dataset_uri: file.uri, source_video_id: "missing-video",
    })).rejects.toThrow("当前人工评审账本");
  });

});
