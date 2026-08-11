import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { BoardEvidenceBundle } from "./temporal-board.js";
import { canonicalBoardEvidencePayload, validateBoardEvidenceBundle } from "./temporal-board.js";

const HASH = "a".repeat(64);
const HASH_B = "b".repeat(64);

function asset(asset_uri: string, sha256 = HASH) {
  return { asset_uri, sha256 };
}

function unknownClaim() {
  return { value: null, subject: "unknown" as const, level: "unknown" as const, confidence: null, evidence_refs: [] };
}

function validBundle(): BoardEvidenceBundle {
  return {
    schema_version: "temporal-board-v2",
    bundle_id: "oracle-clip-001",
    created_at: "2026-08-11T08:00:00.000Z",
    source: {
      source_video_id: "video-001",
      video: asset("sources/video-001.mp4", HASH_B),
      duration_seconds: 40,
    },
    teacher_only_recording: true,
    config: {
      mode: "fixed_camera_oracle_pilot",
      minimum_stable_seconds: 2,
      speech_window_seconds: 5,
      board_roi: [
        { x: 0.05, y: 0.05 },
        { x: 0.95, y: 0.05 },
        { x: 0.95, y: 0.95 },
        { x: 0.05, y: 0.95 },
      ],
      ignore_regions: [],
    },
    surfaces: [{
      surface_id: "surface-1",
      source_video_id: "video-001",
      kind: "chalkboard",
      calibration: "manual",
      polygon: [
        { x: 0.05, y: 0.05 },
        { x: 0.95, y: 0.05 },
        { x: 0.95, y: 0.95 },
        { x: 0.05, y: 0.95 },
      ],
      ignore_regions: [],
      valid_during: { start: 0, end: 40 },
      status: "accepted",
      diagnostics: [],
    }],
    frames: [
      {
        frame_id: "frame-before",
        source_video_id: "video-001",
        surface_id: "surface-1",
        timestamp: 5,
        source_asset: asset("frames/frame-before.jpg"),
        board_asset: asset("boards/frame-before.jpg"),
        registration_score: 0.99,
        visible_fraction: 1,
      },
      {
        frame_id: "frame-delta",
        source_video_id: "video-001",
        surface_id: "surface-1",
        timestamp: 10,
        source_asset: asset("frames/frame-delta.jpg"),
        registration_score: 0.98,
        visible_fraction: 0.8,
      },
      {
        frame_id: "frame-after",
        source_video_id: "video-001",
        surface_id: "surface-1",
        timestamp: 15,
        source_asset: asset("frames/frame-after.jpg"),
        registration_score: 0.99,
        visible_fraction: 1,
      },
      {
        frame_id: "frame-confirm",
        source_video_id: "video-001",
        surface_id: "surface-1",
        timestamp: 20,
        source_asset: asset("frames/frame-confirm.jpg"),
        registration_score: 0.99,
        visible_fraction: 1,
      },
    ],
    objects: [{
      object_id: "object-arrow",
      source_video_id: "video-001",
      surface_id: "surface-1",
      kind: "arrow",
      region: { x: 0.2, y: 0.2, width: 0.2, height: 0.3 },
      semantic_text: "重力方向",
      semantic_source: "human",
      first_visible: 12,
      last_visible: 20,
      evidence_refs: ["ev-frame-after"],
    }],
    states: [
      {
        state_id: "state-before",
        source_video_id: "video-001",
        surface_id: "surface-1",
        stable_during: { start: 0, end: 8 },
        representative_asset: asset("states/state-before.png"),
        object_ids: [],
        observed_support: 0.95,
        evidence_refs: ["ev-frame-before"],
        status: "accepted",
      },
      {
        state_id: "state-after",
        source_video_id: "video-001",
        surface_id: "surface-1",
        stable_during: { start: 12, end: 20 },
        representative_asset: asset("states/state-after.png"),
        object_ids: ["object-arrow"],
        observed_support: 0.95,
        evidence_refs: ["ev-frame-after"],
        status: "accepted",
      },
    ],
    deltas: [{
      delta_id: "delta-1",
      source_video_id: "video-001",
      surface_id: "surface-1",
      time: { start: 8, end: 12 },
      before_state_id: "state-before",
      after_state_id: "state-after",
      operation: "add",
      region: { x: 0.2, y: 0.2, width: 0.2, height: 0.3 },
      affected_object_ids: ["object-arrow"],
      delta_mask: asset("deltas/delta-1-mask.png"),
      comparison_asset: asset("deltas/delta-1-comparison.png"),
      semantic_label: "新增重力箭头",
      confidence: {
        visibility: 1,
        registration: 0.99,
        persistence: 0.95,
        operation: 0.98,
        ocr: null,
        speech_alignment: 0.9,
        pedagogical_inference: 0.8,
      },
      evidence_refs: ["ev-frame-before", "ev-frame-after"],
      erase_evidence: null,
      relation: null,
      modification: null,
      status: "accepted",
      uncertainty_codes: [],
    }],
    speech: [{
      speech_id: "speech-1",
      source_video_id: "video-001",
      time: { start: 8.5, end: 11 },
      raw_text: "先从重心竖直向下画重力。",
      normalized_text: null,
      normalization: "none",
      source_segment_indexes: [3],
    }],
    evidence: [
      {
        evidence_id: "ev-frame-before",
        kind: "frame",
        target_id: "frame-before",
        source_video_id: "video-001",
        time: { start: 4.99, end: 5.01 },
        asset: asset("frames/frame-before.jpg"),
        evidence_level: "observable",
      },
      {
        evidence_id: "ev-frame-after",
        kind: "frame",
        target_id: "frame-after",
        source_video_id: "video-001",
        time: { start: 14.99, end: 15.01 },
        asset: asset("frames/frame-after.jpg"),
        evidence_level: "observable",
      },
      {
        evidence_id: "ev-delta",
        kind: "board_delta",
        target_id: "delta-1",
        source_video_id: "video-001",
        time: { start: 8, end: 12 },
        asset: asset("deltas/delta-1-comparison.png"),
        evidence_level: "observable",
      },
      {
        evidence_id: "ev-speech",
        kind: "speech",
        target_id: "speech-1",
        source_video_id: "video-001",
        time: { start: 8.5, end: 11 },
        evidence_level: "teacher_stated",
      },
    ],
    transitions: [{
      transition_id: "transition-1",
      source_video_id: "video-001",
      time: { start: 8, end: 12 },
      delta_ids: ["delta-1"],
      speech_ids: ["speech-1"],
      evidence_refs: ["ev-delta", "ev-speech"],
      trigger: unknownClaim(),
      teaching_action: {
        value: "逐步画出重力",
        subject: "teacher",
        level: "teacher_stated",
        confidence: 0.9,
        evidence_refs: ["ev-speech"],
      },
      board_action: {
        value: "新增竖直向下箭头",
        subject: "board",
        level: "observable",
        confidence: 0.98,
        evidence_refs: ["ev-delta"],
      },
      pedagogical_role: {
        value: "progressive_scaffolding",
        subject: "teacher",
        level: "inferred",
        confidence: 0.8,
        evidence_refs: ["ev-delta", "ev-speech"],
      },
      expected_learner_change: unknownClaim(),
      learning_check: unknownClaim(),
      remediation: unknownClaim(),
      observed_learner_response: null,
      executable_board_moves: [{
        step: 1,
        operation: "introduce",
        pedagogical_target: "确定重力方向",
        render_instruction: "从物块重心竖直向下画箭头并标注 mg",
        success_signal: null,
        source_delta_ids: ["delta-1"],
      }],
      status: "accepted",
      uncertainty_codes: [],
    }],
    learner_observations: [],
    warnings: [],
    immutable: true,
    payload_sha256: HASH,
  };
}

describe("validateBoardEvidenceBundle", () => {
  it("canonicalizes immutable content while excluding only the declared hash field", () => {
    const original = validBundle();
    const originalPayload = canonicalBoardEvidencePayload(original);
    const declaredOnly = structuredClone(original);
    declaredOnly.payload_sha256 = HASH_B;
    expect(canonicalBoardEvidencePayload(declaredOnly)).toBe(originalPayload);

    const changed = structuredClone(original);
    changed.deltas[0].semantic_label = "被篡改的语义";
    expect(createHash("sha256").update(canonicalBoardEvidencePayload(changed)).digest("hex"))
      .not.toBe(createHash("sha256").update(originalPayload).digest("hex"));
  });
  it("accepts a source-grounded teacher-only Oracle transition", () => {
    expect(validateBoardEvidenceBundle(validBundle())).toEqual({ valid: true, issues: [] });
  });

  it("rejects a version-only shell", () => {
    const report = validateBoardEvidenceBundle({ schema_version: "temporal-board-v2" });
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "bundle.id",
      "bundle.array",
      "bundle.source",
      "bundle.config",
      "bundle.payload_sha256",
    ]));
  });

  it("requires source and artifact hashes with controlled relative paths", () => {
    const bundle = validBundle();
    bundle.source.video.asset_uri = "/Users/researcher/private/video.mp4";
    bundle.source.video.sha256 = "not-a-hash";
    bundle.frames[0].source_asset.asset_uri = "%252e%252e/private/frame.jpg";
    bundle.deltas[0].comparison_asset.asset_uri = "file:///etc/passwd";
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["asset.uri", "asset.sha256"]));
  });

  it("rejects encoded UNC paths, query-bearing assets, and non-finite timing", () => {
    const bundle = validBundle();
    bundle.frames[0].source_asset.asset_uri = "%255c%255cserver%255cshare%255cframe.jpg";
    bundle.states[0].representative_asset.asset_uri = "states/state.png?token=secret";
    bundle.frames[1].timestamp = Number.NaN;
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["asset.uri", "time.timestamp"]));
  });

  it("checks normalized regions, source scope, and all nested references", () => {
    const bundle = validBundle();
    bundle.objects[0].region = { x: 0.9, y: 0.2, width: 0.2, height: 0.2 };
    bundle.objects[0].source_video_id = "another-video";
    bundle.states[1].object_ids = ["missing-object"];
    bundle.evidence[0].target_id = "missing-frame";
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "region.bounds",
      "source.mismatch",
      "state.object_ref",
      "evidence.target_ref",
    ]));
  });

  it("rejects visual evidence borrowed from another board surface", () => {
    const bundle = validBundle();
    bundle.surfaces.push({ ...structuredClone(bundle.surfaces[0]), surface_id: "surface-2" });
    bundle.frames.find((frame) => frame.frame_id === "frame-after")!.surface_id = "surface-2";
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("evidence_ref.surface");
  });

  it("forbids invented learner observations and responses in teacher-only recordings", () => {
    const bundle = validBundle();
    bundle.learner_observations.push({
      observation_id: "learner-1",
      source_video_id: "video-001",
      time: { start: 11, end: 12 },
      value: "学生点头",
      evidence_refs: ["ev-frame-after"],
    });
    bundle.transitions[0].observed_learner_response = {
      value: "学生理解了",
      subject: "learner_observed",
      level: "inferred",
      confidence: 0.8,
      evidence_refs: ["ev-frame-after"],
    };
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "bundle.fabricated_learner",
      "transition.fabricated_learner",
    ]));
  });

  it("does not let a missing teacher-only flag bypass learner-evidence protection", () => {
    const bundle = validBundle() as unknown as Record<string, unknown>;
    delete bundle.teacher_only_recording;
    (bundle.learner_observations as unknown[]).push({
      observation_id: "learner-1",
      source_video_id: "video-001",
      time: { start: 11, end: 12 },
      value: "学生已经掌握",
      evidence_refs: ["ev-frame-after"],
    });
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "bundle.teacher_only",
      "bundle.fabricated_learner",
    ]));
  });

  it("enforces before-delta-after temporal ordering and scope", () => {
    const bundle = validBundle();
    bundle.states[0].stable_during.end = 9;
    bundle.states[1].surface_id = "missing-surface";
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "delta.temporal_order",
      "delta.state_scope",
      "state.surface_ref",
    ]));
  });

  it("binds accepted state evidence frames to the state's stable window", () => {
    const bundle = validBundle();
    bundle.states[1].evidence_refs = ["ev-frame-before"];
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("state.evidence_time");
  });

  it("requires accepted states to remain stable for the configured minimum", () => {
    const bundle = validBundle();
    bundle.states[1].stable_during = { start: 12, end: 12.1 };
    bundle.frames.find((frame) => frame.frame_id === "frame-after")!.timestamp = 12.05;
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("state.minimum_stable");
  });

  it("requires every state object to cover the full stable window", () => {
    const bundle = validBundle();
    bundle.objects[0].last_visible = 12.1;
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("state.object_time");
  });

  it("binds object evidence to the object's visible lifetime", () => {
    const bundle = validBundle();
    bundle.objects[0].first_visible = 16;
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("object.evidence_time");
  });

  it("binds added object lifetime to the delta window", () => {
    const bundle = validBundle();
    bundle.objects[0].first_visible = 0;
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("add.first_visible");
  });

  it("accepts erase only when absence persists after visibility is restored", () => {
    const bundle = validBundle();
    bundle.objects[0].first_visible = 0;
    bundle.objects[0].last_visible = 8;
    bundle.objects[0].evidence_refs = ["ev-frame-before"];
    bundle.states[0].object_ids = ["object-arrow"];
    bundle.states[1].object_ids = [];
    bundle.deltas[0].operation = "erase";
    bundle.deltas[0].erase_evidence = {
      visibility_restored: true,
      absent_from_after_state: true,
      confirmed_until: 20,
      supporting_frame_ids: ["frame-confirm"],
    };
    expect(validateBoardEvidenceBundle(bundle)).toEqual({ valid: true, issues: [] });
  });

  it("rejects an occlusion or one-frame disappearance masquerading as erase", () => {
    const bundle = validBundle();
    bundle.states[0].object_ids = ["object-arrow"];
    bundle.states[1].object_ids = ["object-arrow"];
    bundle.deltas[0].operation = "erase";
    bundle.deltas[0].erase_evidence = {
      visibility_restored: false,
      absent_from_after_state: false,
      confirmed_until: 15,
      supporting_frame_ids: ["frame-delta"],
    };
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "erase.visibility",
      "erase.after_absence",
      "erase.persistence",
      "erase.frame_time",
      "erase.after_object",
    ]));
  });

  it("requires erase support frames to reach the claimed persistence horizon", () => {
    const bundle = validBundle();
    bundle.objects[0].first_visible = 0;
    bundle.objects[0].last_visible = 8;
    bundle.objects[0].evidence_refs = ["ev-frame-before"];
    bundle.states[0].object_ids = ["object-arrow"];
    bundle.states[1].object_ids = [];
    bundle.deltas[0].operation = "erase";
    bundle.deltas[0].erase_evidence = {
      visibility_restored: true,
      absent_from_after_state: true,
      confirmed_until: 22,
      supporting_frame_ids: ["frame-confirm"],
    };
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("erase.support_horizon");
  });

  it("binds erased object lifetime to the erase window", () => {
    const bundle = validBundle();
    bundle.objects[0].first_visible = 0;
    bundle.objects[0].last_visible = 20;
    bundle.objects[0].evidence_refs = ["ev-frame-before"];
    bundle.states[0].object_ids = ["object-arrow"];
    bundle.states[1].object_ids = [];
    bundle.deltas[0].operation = "erase";
    bundle.deltas[0].erase_evidence = {
      visibility_restored: true,
      absent_from_after_state: true,
      confirmed_until: 20,
      supporting_frame_ids: ["frame-confirm"],
    };
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("erase.last_visible");
  });

  it("does not accept modify or connect without a before/after state change", () => {
    const modified = validBundle();
    modified.deltas[0].operation = "modify";
    expect(validateBoardEvidenceBundle(modified).issues.map((issue) => issue.code)).toContain("modify.state_change");
    expect(validateBoardEvidenceBundle(modified).issues.map((issue) => issue.code)).toContain("modify.relation_missing");

    const connected = validBundle();
    connected.deltas[0].operation = "connect";
    expect(validateBoardEvidenceBundle(connected).issues.map((issue) => issue.code)).toContain("connect.state_change");
    expect(validateBoardEvidenceBundle(connected).issues.map((issue) => issue.code)).toContain("connect.relation_missing");
  });

  it("requires accepted artifacts to depend only on accepted states and deltas", () => {
    const pendingState = validBundle();
    pendingState.states[1].status = "needs_review";
    expect(validateBoardEvidenceBundle(pendingState).issues.map((issue) => issue.code)).toContain("delta.accepted_state_status");

    const pendingDelta = validBundle();
    pendingDelta.deltas[0].status = "needs_review";
    expect(validateBoardEvidenceBundle(pendingDelta).issues.map((issue) => issue.code)).toContain("transition.accepted_delta_status");
  });

  it("closes the accepted chain at surface and core visual-confidence levels", () => {
    const bundle = validBundle();
    bundle.surfaces[0].status = "needs_review";
    bundle.states[0].observed_support = 0;
    bundle.deltas[0].confidence.visibility = null;
    const codes = validateBoardEvidenceBundle(bundle).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining([
      "state.accepted_surface_status",
      "state.accepted_support",
      "delta.accepted_confidence",
    ]));
  });

  it("requires unknown claims to keep value null", () => {
    const bundle = validBundle();
    bundle.transitions[0].expected_learner_change = {
      value: "学生已经掌握",
      subject: "unknown",
      level: "unknown",
      confidence: null,
      evidence_refs: [],
    };
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("claim.unknown_value");
  });

  it("matches claim levels to visual versus speech evidence", () => {
    const bundle = validBundle();
    bundle.transitions[0].board_action.evidence_refs = ["ev-speech"];
    bundle.transitions[0].teaching_action.evidence_refs = ["ev-frame-after"];
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "claim.observable_support",
      "claim.teacher_stated_support",
    ]));
  });

  it("freezes evidence levels by artifact kind", () => {
    const bundle = validBundle();
    bundle.evidence.find((item) => item.evidence_id === "ev-delta")!.evidence_level = "inferred";
    bundle.evidence.find((item) => item.evidence_id === "ev-speech")!.evidence_level = "observable";
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "evidence.board_level",
      "evidence.speech_level",
    ]));
  });

  it("keeps unknown and move operations out of accepted gold", () => {
    const unknown = validBundle();
    unknown.deltas[0].operation = "unknown";
    unknown.deltas[0].affected_object_ids = [];
    expect(validateBoardEvidenceBundle(unknown).issues.map((issue) => issue.code)).toContain("delta.accepted_operation");

    const moved = validBundle();
    moved.deltas[0].operation = "move";
    moved.states[0].object_ids = ["object-arrow"];
    moved.objects[0].first_visible = 1;
    expect(validateBoardEvidenceBundle(moved).issues.map((issue) => issue.code)).toContain("delta.accepted_operation");
  });

  it("does not let teacher-only transitions hide learner observations in generic claim slots", () => {
    const bundle = validBundle();
    bundle.transitions[0].trigger = {
      value: "学生点头",
      subject: "learner_observed",
      level: "observable",
      confidence: 0.8,
      evidence_refs: ["ev-frame-after"],
    };
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "claim.subject_slot",
      "transition.fabricated_learner_claim",
    ]));
  });

  it("requires accepted transitions to carry matching delta and speech evidence", () => {
    const bundle = validBundle();
    bundle.transitions[0].speech_ids = [];
    bundle.transitions[0].evidence_refs = ["ev-frame-after"];
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "transition.accepted_speech",
      "transition.accepted_delta_evidence",
    ]));
  });

  it("limits executable moves to the transition's own deltas", () => {
    const bundle = validBundle();
    bundle.transitions[0].executable_board_moves[0].source_delta_ids = ["missing-delta"];
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toContain("transition.move_delta_ref");
  });

  it("requires transition time to cover every referenced delta and speech span", () => {
    const bundle = validBundle();
    bundle.transitions[0].time = { start: 9, end: 10 };
    const report = validateBoardEvidenceBundle(bundle);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "transition.delta_time",
      "transition.speech_time",
    ]));
  });
});
