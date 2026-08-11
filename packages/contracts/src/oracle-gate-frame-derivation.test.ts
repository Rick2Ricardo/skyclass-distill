import { describe, expect, it } from "vitest";
import {
  ORACLE_GATE_FRAME_DERIVATION,
  hashOracleGateFramePreflight,
  hashOracleGateFrameProof,
  hashOracleGateFrameProofSet,
  validateOracleGateFrameDerivationPreflight,
  type OracleGateFrameDerivationPreflightV1,
  type OracleGateFrameDerivationProofV1,
  type OracleGateFrameRole,
} from "./oracle-gate-frame-derivation.js";

function proof(role: OracleGateFrameRole): OracleGateFrameDerivationProofV1 {
  const value: OracleGateFrameDerivationProofV1 = {
    schema_version: "oracle-frame-derivation-proof-v1",
    proof_sha256: "0".repeat(64),
    case_id: "case-1",
    role,
    source_video_id: "video-1",
    source_video_sha256: "a".repeat(64),
    video_stream_index: 0,
    requested_timestamp_us: role === "static_final" ? 2_000_000 : 1_000_000,
    previous_normalized_pts_us: role === "static_final" ? 1_999_999 : 999_999,
    selected_normalized_pts_us: role === "static_final" ? 2_000_000 : 1_000_000,
    selected_frame_ordinal: role === "static_final" ? 60 : 30,
    timestamp_choice_rule_version: role === "static_final" ? "stable-after-v1" : "uniform-in-window-v1",
    frame_extraction_rule_version: ORACLE_GATE_FRAME_DERIVATION.extraction_rule_version,
    time_origin_version: ORACLE_GATE_FRAME_DERIVATION.time_origin_version,
    raster_rule_version: ORACLE_GATE_FRAME_DERIVATION.raster_rule_version,
    png_rule_version: ORACLE_GATE_FRAME_DERIVATION.png_rule_version,
    ffmpeg_binary_sha256: "b".repeat(64),
    ffmpeg_version_sha256: "c".repeat(64),
    argv_sha256: "d".repeat(64),
    output: {
      asset_uri: `assets/${role}.png`,
      sha256: role === "static_final" ? "e".repeat(64) : "f".repeat(64),
      byte_length: 100,
      mime_type: "image/png",
      width: 1280,
      height: 720,
      canonical_pixel_sha256: role === "static_final" ? "1".repeat(64) : "2".repeat(64),
    },
  };
  value.proof_sha256 = hashOracleGateFrameProof(value);
  return value;
}

function fixture(): OracleGateFrameDerivationPreflightV1 {
  const cases = [{ case_id: "case-1", source_video_id: "video-1", static_final: proof("static_final"), uniform_frame: proof("uniform_frame") }];
  const value: OracleGateFrameDerivationPreflightV1 = {
    schema_version: "oracle-gate-frame-derivation-preflight-v1",
    preflight_sha256: "0".repeat(64),
    status: "untrusted_source_frame_derivation_valid",
    source_frame_derivation_verified: true,
    api_execution_allowed: false,
    reason: "external_media_attestation_and_run_store_pending",
    inventory_sha256: "3".repeat(64),
    input_manifest_sha256: "4".repeat(64),
    signed_gold_dataset_sha256: "5".repeat(64),
    case_count: 1,
    proof_set_sha256: hashOracleGateFrameProofSet(cases),
    cases,
  };
  value.preflight_sha256 = hashOracleGateFramePreflight(value);
  return value;
}

describe("Formal Oracle frame derivation contract", () => {
  it("accepts a canonical non-executable proof set", () => {
    expect(validateOracleGateFrameDerivationPreflight(fixture())).toEqual({ valid: true, issues: [] });
  });

  it("rejects API enablement, timestamp gaps, role swaps, and content drift", () => {
    const api = fixture() as unknown as Record<string, unknown>;
    api.api_execution_allowed = true;
    expect(validateOracleGateFrameDerivationPreflight(api).valid).toBe(false);

    const timestamp = fixture();
    timestamp.cases[0].static_final.previous_normalized_pts_us = timestamp.cases[0].static_final.requested_timestamp_us;
    timestamp.cases[0].static_final.proof_sha256 = hashOracleGateFrameProof(timestamp.cases[0].static_final);
    timestamp.proof_set_sha256 = hashOracleGateFrameProofSet(timestamp.cases);
    timestamp.preflight_sha256 = hashOracleGateFramePreflight(timestamp);
    expect(validateOracleGateFrameDerivationPreflight(timestamp).issues.join(" ")).toContain("previous PTS");

    const role = fixture();
    role.cases[0].static_final.role = "uniform_frame";
    role.cases[0].static_final.proof_sha256 = hashOracleGateFrameProof(role.cases[0].static_final);
    role.proof_set_sha256 = hashOracleGateFrameProofSet(role.cases);
    role.preflight_sha256 = hashOracleGateFramePreflight(role);
    expect(validateOracleGateFrameDerivationPreflight(role).issues.join(" ")).toContain("static_final");

    const impossibleFirst = fixture();
    impossibleFirst.cases[0].uniform_frame.selected_frame_ordinal = 0;
    impossibleFirst.cases[0].uniform_frame.previous_normalized_pts_us = null;
    impossibleFirst.cases[0].uniform_frame.proof_sha256 = hashOracleGateFrameProof(impossibleFirst.cases[0].uniform_frame);
    impossibleFirst.proof_set_sha256 = hashOracleGateFrameProofSet(impossibleFirst.cases);
    impossibleFirst.preflight_sha256 = hashOracleGateFramePreflight(impossibleFirst);
    expect(validateOracleGateFrameDerivationPreflight(impossibleFirst).issues.join(" ")).toContain("normalized 首帧");

    const splitSource = fixture();
    splitSource.cases[0].uniform_frame.source_video_sha256 = "8".repeat(64);
    splitSource.cases[0].uniform_frame.proof_sha256 = hashOracleGateFrameProof(splitSource.cases[0].uniform_frame);
    splitSource.proof_set_sha256 = hashOracleGateFrameProofSet(splitSource.cases);
    splitSource.preflight_sha256 = hashOracleGateFramePreflight(splitSource);
    expect(validateOracleGateFrameDerivationPreflight(splitSource).issues.join(" ")).toContain("同一 source/stream/toolchain");

    const drift = fixture();
    drift.cases[0].uniform_frame.output.sha256 = "9".repeat(64);
    expect(validateOracleGateFrameDerivationPreflight(drift).issues.join(" ")).toMatch(/proof_sha256|preflight_sha256/);
  });
});
