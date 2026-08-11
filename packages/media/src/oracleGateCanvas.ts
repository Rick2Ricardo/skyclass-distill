import { createHash } from "node:crypto";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { inspectImageBytes, type SupportedImageMime } from "./imageEvidence.js";

export type OracleGateVisualArm = "static_final_board" | "uniform_frame" | "oracle_delta";

export interface OracleGateCanvas {
  bytes: Buffer;
  sha256: string;
  mime_type: "image/jpeg";
  width: 1920;
  height: 360;
  source_sha256: string;
  transform: "triplicate_single_frame" | "resize_temporal_montage";
}

function decodeRgba(bytes: Uint8Array, mime: SupportedImageMime): { width: number; height: number; data: Uint8Array } {
  if (mime === "image/png") {
    const decoded = PNG.sync.read(Buffer.from(bytes), { checkCRC: true });
    return { width: decoded.width, height: decoded.height, data: decoded.data };
  }
  const decoded = jpeg.decode(Buffer.from(bytes), { useTArray: true, tolerantDecoding: false });
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}

function resizeRgba(source: { width: number; height: number; data: Uint8Array }, width: number, height: number): Buffer {
  const output = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y * source.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x * source.width / width));
      const from = (sourceY * source.width + sourceX) * 4;
      const to = (y * width + x) * 4;
      output[to] = source.data[from];
      output[to + 1] = source.data[from + 1];
      output[to + 2] = source.data[from + 2];
      output[to + 3] = 255;
    }
  }
  return output;
}

function triplicate(panel: Buffer): Buffer {
  const panelWidth = 640;
  const height = 360;
  const output = Buffer.alloc(1920 * height * 4);
  for (let y = 0; y < height; y += 1) {
    const from = y * panelWidth * 4;
    for (let index = 0; index < 3; index += 1) {
      const to = (y * 1920 + index * panelWidth) * 4;
      panel.copy(output, to, from, from + panelWidth * 4);
    }
  }
  return output;
}

/**
 * Makes the three visual Oracle-Gate arms byte-auditable and budget-comparable.
 * Static and uniform frames are repeated without adding information; the temporal
 * arm keeps its three-panel structure. Every arm becomes one 1920x360 JPEG.
 */
export function canonicalizeOracleGateCanvas(bytes: Uint8Array, arm: OracleGateVisualArm): OracleGateCanvas {
  const inspected = inspectImageBytes(bytes);
  const source = decodeRgba(bytes, inspected.mime_type);
  const rgba = arm === "oracle_delta"
    ? resizeRgba(source, 1920, 360)
    : triplicate(resizeRgba(source, 640, 360));
  const encoded = Buffer.from(jpeg.encode({ data: rgba, width: 1920, height: 360 }, 88).data);
  const outputInspection = inspectImageBytes(encoded);
  if (outputInspection.mime_type !== "image/jpeg" || outputInspection.width !== 1920 || outputInspection.height !== 360) {
    throw new Error("Oracle Gate canonical canvas 编码结果不符合 1920x360 JPEG 契约");
  }
  return {
    bytes: encoded,
    sha256: createHash("sha256").update(encoded).digest("hex"),
    mime_type: "image/jpeg",
    width: 1920,
    height: 360,
    source_sha256: createHash("sha256").update(bytes).digest("hex"),
    transform: arm === "oracle_delta" ? "resize_temporal_montage" : "triplicate_single_frame",
  };
}
