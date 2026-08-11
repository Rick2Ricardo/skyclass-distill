import { describe, expect, it } from "vitest";
import { inspectImageBytes } from "./imageEvidence.js";
import { canonicalizeOracleGateCanvas } from "./oracleGateCanvas.js";

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

describe("Oracle Gate canonical canvas", () => {
  it.each(["static_final_board", "uniform_frame", "oracle_delta"] as const)("normalizes %s to the frozen canvas", (arm) => {
    const first = canonicalizeOracleGateCanvas(PNG_1X1, arm);
    const second = canonicalizeOracleGateCanvas(PNG_1X1, arm);
    expect(inspectImageBytes(first.bytes)).toEqual({ mime_type: "image/jpeg", width: 1920, height: 360 });
    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(first.sha256).toBe(second.sha256);
    expect(first.transform).toBe(arm === "oracle_delta" ? "resize_temporal_montage" : "triplicate_single_frame");
  });
});
