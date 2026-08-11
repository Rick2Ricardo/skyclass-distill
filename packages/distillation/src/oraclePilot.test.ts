import { describe, expect, it } from "vitest";
import type { BoardEvidenceBundle } from "../../contracts/src/index.js";
import { buildOraclePilotPackage, validateOraclePilotPairing } from "./oraclePilot.js";

const HASH = "a".repeat(64);
const asset = (asset_uri: string) => ({ asset_uri, sha256: HASH });

function bundle(): BoardEvidenceBundle {
  return {
    schema_version: "temporal-board-v2",
    bundle_id: "oracle-001",
    created_at: "2026-08-11T08:00:00.000Z",
    source: { source_video_id: "video-1", video: asset("sources/video-1.mp4"), duration_seconds: 30 },
    teacher_only_recording: true,
    config: {
      mode: "fixed_camera_oracle_pilot",
      minimum_stable_seconds: 2,
      speech_window_seconds: 3,
      board_roi: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      ignore_regions: [],
    },
    surfaces: [{
      surface_id: "surface-1", source_video_id: "video-1", kind: "chalkboard", calibration: "manual",
      polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], ignore_regions: [],
      valid_during: { start: 0, end: 30 }, status: "accepted", diagnostics: [],
    }],
    frames: [{
      frame_id: "before-1", source_video_id: "video-1", surface_id: "surface-1", timestamp: 7,
      source_asset: asset("frames/before-1.jpg"), registration_score: 0.95, visible_fraction: 1,
    }, {
      frame_id: "uniform-1", source_video_id: "video-1", surface_id: "surface-1", timestamp: 10,
      source_asset: asset("frames/uniform-1.jpg"), board_asset: asset("boards/uniform-1.jpg"),
      registration_score: 0.95, visible_fraction: 1,
    }, {
      frame_id: "after-1", source_video_id: "video-1", surface_id: "surface-1", timestamp: 13,
      source_asset: asset("frames/after-1.jpg"), registration_score: 0.95, visible_fraction: 1,
    }],
    objects: [{
      object_id: "object-1", source_video_id: "video-1", surface_id: "surface-1", kind: "arrow",
      region: { x: 0.2, y: 0.2, width: 0.2, height: 0.3 }, semantic_text: "mg", semantic_source: "human",
      first_visible: 12, last_visible: 20, evidence_refs: ["ev-after"],
    }],
    states: [{
      state_id: "state-before", source_video_id: "video-1", surface_id: "surface-1",
      stable_during: { start: 0, end: 8 }, representative_asset: asset("states/before.png"), object_ids: [],
      observed_support: 1, evidence_refs: ["ev-before"], status: "accepted",
    }, {
      state_id: "state-after", source_video_id: "video-1", surface_id: "surface-1",
      stable_during: { start: 12, end: 20 }, representative_asset: asset("states/after.png"), object_ids: ["object-1"],
      observed_support: 1, evidence_refs: ["ev-after"], status: "accepted",
    }],
    deltas: [{
      delta_id: "delta-1", source_video_id: "video-1", surface_id: "surface-1", time: { start: 8, end: 12 },
      before_state_id: "state-before", after_state_id: "state-after", operation: "add",
      region: { x: 0.2, y: 0.2, width: 0.2, height: 0.3 }, affected_object_ids: ["object-1"],
      delta_mask: asset("deltas/mask.png"), comparison_asset: asset("deltas/comparison.png"),
      semantic_label: "新增重力箭头", confidence: {
        visibility: 1, registration: 0.95, persistence: 1, operation: 1, ocr: 0.9,
        speech_alignment: 0.9, pedagogical_inference: null,
      }, evidence_refs: ["ev-before", "ev-after"], erase_evidence: null, relation: null, modification: null,
      status: "accepted", uncertainty_codes: [],
    }],
    speech: [{
      speech_id: "speech-1", source_video_id: "video-1", time: { start: 8.5, end: 11 },
      raw_text: "先画重力。", normalized_text: null, normalization: "none", source_segment_indexes: [1],
    }],
    evidence: [{
      evidence_id: "ev-before", kind: "frame", target_id: "before-1", source_video_id: "video-1",
      time: { start: 6.9, end: 7.1 }, asset: asset("frames/before-1.jpg"), evidence_level: "observable",
    }, {
      evidence_id: "ev-after", kind: "frame", target_id: "after-1", source_video_id: "video-1",
      time: { start: 12.9, end: 13.1 }, asset: asset("frames/after-1.jpg"), evidence_level: "observable",
    }],
    transitions: [], learner_observations: [], warnings: [], immutable: true, payload_sha256: HASH,
  };
}

describe("Oracle Delta paired-input builder", () => {
  it("builds four matched arms without leaking pedagogical-role gold", () => {
    const pilot = buildOraclePilotPackage({
      bundle: bundle(),
      cases: [{ case_id: "case-1", delta_id: "delta-1", uniform_frame_id: "uniform-1" }],
      prompt_version: "board-transition-prompt-v1",
      blind_seed: "private-seed",
    });
    expect(pilot.samples.map((sample) => sample.arm)).toEqual([
      "transcript_only", "static_final_board", "uniform_frame", "oracle_delta",
    ]);
    expect(pilot.samples.map((sample) => sample.image_assets.length)).toEqual([0, 1, 1, 1]);
    expect(pilot.samples.map((sample) => sample.evidence_mode)).toEqual([
      "text", "static_frames", "static_frames", "temporal_board",
    ]);
    expect(new Set(pilot.samples.map((sample) => sample.paired_context_sha256)).size).toBe(1);
    expect(JSON.stringify(pilot.blind_evaluation_items)).not.toContain("progressive_scaffolding");
    expect(JSON.stringify(pilot.blind_evaluation_items)).not.toContain("新增重力箭头");
    expect(pilot.blind_evaluation_items.every((sample) => (
      !("arm" in sample)
      && !("evidence_mode" in sample)
      && !("evidence_text" in sample)
      && !("condition_sha256" in sample)
      && !("image_assets" in sample)
    ))).toBe(true);
    expect(validateOraclePilotPairing(pilot)).toEqual([]);
  });

  it("refuses a needs-review delta instead of presenting it as Oracle truth", () => {
    const pending = bundle();
    pending.deltas[0].status = "needs_review";
    expect(() => buildOraclePilotPackage({
      bundle: pending,
      cases: [{ case_id: "case-1", delta_id: "delta-1", uniform_frame_id: "uniform-1" }],
      prompt_version: "board-transition-prompt-v1",
      blind_seed: "private-seed",
    })).toThrow("尚未仲裁为 accepted");
  });

  it("keeps unverifiable move outside accepted Oracle evidence", () => {
    const moved = bundle();
    moved.deltas[0].operation = "move";
    moved.states[0].object_ids = ["object-1"];
    moved.objects[0].first_visible = 1;
    expect(() => buildOraclePilotPackage({
      bundle: moved,
      cases: [{ case_id: "case-1", delta_id: "delta-1", uniform_frame_id: "uniform-1" }],
      prompt_version: "board-transition-prompt-v1",
      blind_seed: "private-seed",
    })).toThrow("move 只能 needs_review");
  });

  it("detects a visual-budget mismatch after package construction", () => {
    const pilot = buildOraclePilotPackage({
      bundle: bundle(),
      cases: [{ case_id: "case-1", delta_id: "delta-1", uniform_frame_id: "uniform-1" }],
      prompt_version: "board-transition-prompt-v1",
      blind_seed: "private-seed",
    });
    pilot.samples.find((sample) => sample.arm === "uniform_frame")!.image_assets = [];
    expect(validateOraclePilotPairing(pilot)).toContain("case-1/uniform_frame: 视觉预算应为 1");
  });

  it("recomputes pairing fingerprints and checks blind answer-key linkage", () => {
    const pilot = buildOraclePilotPackage({
      bundle: bundle(),
      cases: [{ case_id: "case-1", delta_id: "delta-1", uniform_frame_id: "uniform-1" }],
      prompt_version: "board-transition-prompt-v1",
      blind_seed: "private-seed",
    });
    pilot.samples.find((sample) => sample.arm === "uniform_frame")!.transcript = "被篡改的语音";
    pilot.blind_evaluation_items[0].paired_case_id = "P-tampered";
    expect(validateOraclePilotPairing(pilot)).toEqual(expect.arrayContaining([
      "case-1: 语音或事件上下文未配对",
      "case-1/uniform_frame: paired_context_sha256 与实际上下文不符",
    ]));
    expect(validateOraclePilotPairing(pilot).some((issue) => issue.includes("配对组映射不一致"))).toBe(true);
  });

  it("refuses an unrelated uniform frame outside the event window", () => {
    const unrelated = bundle();
    unrelated.frames[1].timestamp = 25;
    unrelated.frames.sort((left, right) => left.timestamp - right.timestamp);
    expect(() => buildOraclePilotPackage({
      bundle: unrelated,
      cases: [{ case_id: "case-1", delta_id: "delta-1", uniform_frame_id: "uniform-1" }],
      prompt_version: "board-transition-prompt-v1",
      blind_seed: "private-seed",
    })).toThrow("均匀帧必须来自同一板面并落在预注册事件窗口内");
  });
});
