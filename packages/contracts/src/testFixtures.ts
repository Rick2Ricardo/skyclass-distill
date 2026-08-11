import type { BoardEvidenceBundle, TemporalBoardAsset, TemporalBoardGroundedClaim } from "./temporal-board.js";

const DEFAULT_HASH = "a".repeat(64);

function asset(asset_uri: string, sha256 = DEFAULT_HASH): TemporalBoardAsset {
  return { asset_uri, sha256 };
}

function unknownClaim(): TemporalBoardGroundedClaim<string> {
  return { value: null, subject: "unknown", level: "unknown", confidence: null, evidence_refs: [] };
}

/** Strict, accepted, single-delta fixture for cross-package integration tests. Not exported by contracts/index. */
export function acceptedTemporalBoardFixture(comparisonSha256 = DEFAULT_HASH): BoardEvidenceBundle {
  return {
    schema_version: "temporal-board-v2",
    bundle_id: "fixture-bundle-1",
    created_at: "2026-08-11T08:00:00.000Z",
    source: { source_video_id: "video-1", video: asset("source/video.mp4", "b".repeat(64)), duration_seconds: 30 },
    teacher_only_recording: true,
    config: {
      mode: "fixed_camera_oracle_pilot",
      minimum_stable_seconds: 2,
      speech_window_seconds: 5,
      board_roi: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      ignore_regions: [],
    },
    surfaces: [{
      surface_id: "surface-1", source_video_id: "video-1", kind: "chalkboard", calibration: "manual",
      polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      ignore_regions: [], valid_during: { start: 0, end: 30 }, status: "accepted", diagnostics: [],
    }],
    frames: [{
      frame_id: "frame-before", source_video_id: "video-1", surface_id: "surface-1", timestamp: 5,
      source_asset: asset("frames/before.jpg"), registration_score: 1, visible_fraction: 1,
    }, {
      frame_id: "frame-after", source_video_id: "video-1", surface_id: "surface-1", timestamp: 15,
      source_asset: asset("frames/after.jpg"), registration_score: 1, visible_fraction: 1,
    }],
    objects: [{
      object_id: "object-1", source_video_id: "video-1", surface_id: "surface-1", kind: "arrow",
      region: { x: .2, y: .2, width: .2, height: .3 }, semantic_text: "重力", semantic_source: "human",
      first_visible: 12, last_visible: 20, evidence_refs: ["ev-frame-after"],
    }],
    states: [{
      state_id: "state-before", source_video_id: "video-1", surface_id: "surface-1",
      stable_during: { start: 0, end: 8 }, representative_asset: asset("states/before.png"),
      object_ids: [], observed_support: 1, evidence_refs: ["ev-frame-before"], status: "accepted",
    }, {
      state_id: "state-after", source_video_id: "video-1", surface_id: "surface-1",
      stable_during: { start: 12, end: 20 }, representative_asset: asset("states/after.png"),
      object_ids: ["object-1"], observed_support: 1, evidence_refs: ["ev-frame-after"], status: "accepted",
    }],
    deltas: [{
      delta_id: "delta-1", source_video_id: "video-1", surface_id: "surface-1", time: { start: 8, end: 12 },
      before_state_id: "state-before", after_state_id: "state-after", operation: "add",
      region: { x: .2, y: .2, width: .2, height: .3 }, affected_object_ids: ["object-1"],
      delta_mask: asset("deltas/mask.png"), comparison_asset: asset("assets/comparison.png", comparisonSha256),
      semantic_label: "新增重力箭头",
      confidence: { visibility: 1, registration: 1, persistence: 1, operation: 1, ocr: null, speech_alignment: 1, pedagogical_inference: .8 },
      evidence_refs: ["ev-frame-before", "ev-frame-after"], erase_evidence: null, relation: null, modification: null,
      status: "accepted", uncertainty_codes: [],
    }],
    speech: [{
      speech_id: "speech-1", source_video_id: "video-1", time: { start: 8.5, end: 11 },
      raw_text: "先画重力。", normalized_text: null, normalization: "none", source_segment_indexes: [0],
    }],
    evidence: [{
      evidence_id: "ev-frame-before", kind: "frame", target_id: "frame-before", source_video_id: "video-1",
      time: { start: 4.99, end: 5.01 }, asset: asset("frames/before.jpg"), evidence_level: "observable",
    }, {
      evidence_id: "ev-frame-after", kind: "frame", target_id: "frame-after", source_video_id: "video-1",
      time: { start: 14.99, end: 15.01 }, asset: asset("frames/after.jpg"), evidence_level: "observable",
    }, {
      evidence_id: "ev-delta", kind: "board_delta", target_id: "delta-1", source_video_id: "video-1",
      time: { start: 8, end: 12 }, asset: asset("assets/comparison.png", comparisonSha256), evidence_level: "observable",
    }, {
      evidence_id: "ev-speech", kind: "speech", target_id: "speech-1", source_video_id: "video-1",
      time: { start: 8.5, end: 11 }, evidence_level: "teacher_stated",
    }],
    transitions: [{
      transition_id: "transition-1", source_video_id: "video-1", time: { start: 8, end: 12 },
      delta_ids: ["delta-1"], speech_ids: ["speech-1"], evidence_refs: ["ev-delta", "ev-speech"],
      trigger: unknownClaim(),
      teaching_action: { value: "逐步画出重力", subject: "teacher", level: "teacher_stated", confidence: .9, evidence_refs: ["ev-speech"] },
      board_action: { value: "新增竖直向下箭头", subject: "board", level: "observable", confidence: 1, evidence_refs: ["ev-delta"] },
      pedagogical_role: { value: "progressive_scaffolding", subject: "teacher", level: "inferred", confidence: .8, evidence_refs: ["ev-delta", "ev-speech"] },
      expected_learner_change: unknownClaim(), learning_check: unknownClaim(), remediation: unknownClaim(), observed_learner_response: null,
      executable_board_moves: [{
        step: 1, operation: "introduce", pedagogical_target: "确定重力方向",
        render_instruction: "从物块重心竖直向下画箭头并标注 mg", success_signal: null, source_delta_ids: ["delta-1"],
      }],
      status: "accepted", uncertainty_codes: [],
    }],
    learner_observations: [], warnings: [], immutable: true, payload_sha256: DEFAULT_HASH,
  };
}
