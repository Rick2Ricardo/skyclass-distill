import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import jpeg from "jpeg-js";
import type {
  BoardEvidenceBundle,
  SpeechSpan,
  TemporalBoardEvidenceRef,
} from "../packages/contracts/src/index.js";
import {
  canonicalBoardEvidencePayload,
  validateBoardEvidenceBundle,
} from "../packages/contracts/src/index.js";
import { prepareGroundedVisualEvidence } from "../packages/distillation/src/index.js";
import { verifyImageEvidence } from "../packages/media/src/imageEvidence.js";

interface TranscriptSegment { start: number; end: number; text: string }
interface Transcript { segments: TranscriptSegment[] }
interface Decision {
  delta_id: string;
  transition_id: string;
  decision: "accept_for_engineering";
  final_semantic_label: string;
  registration_confidence: number;
  asr_segment_indexes: number[];
  normalized_speech: string;
  teaching_action: string;
  notes: string;
}
interface Ledger {
  schema_version: "temporal-board-adjudication-v1";
  adjudication_id: string;
  scope: "engineering_gold_dev_not_paper_gold";
  source_bundle_path: string;
  asr_path: string;
  asr_sha256: string;
  asr_clip_offset_seconds: number;
  frozen_created_at: string;
  output_directory: string;
  decisions: Decision[];
  paper_gold_status: "requires_human_signoff";
}

function digest(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

function deltaFocusPanel(after: Buffer, width: number, height: number, region: { x: number; y: number; width: number; height: number }): Buffer {
  const output = Buffer.from(after);
  const left = Math.max(0, Math.floor(region.x * width) - 8);
  const top = Math.max(0, Math.floor(region.y * height) - 8);
  const right = Math.min(width - 1, Math.ceil((region.x + region.width) * width) + 8);
  const bottom = Math.min(height - 1, Math.ceil((region.y + region.height) * height) + 8);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= left && x <= right && y >= top && y <= bottom) continue;
      const offset = (y * width + x) * 4;
      output[offset] = Math.round(output[offset] * 0.34);
      output[offset + 1] = Math.round(output[offset + 1] * 0.34);
      output[offset + 2] = Math.round(output[offset + 2] * 0.34);
    }
  }
  const border = 5;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (x >= left + border && x <= right - border && y >= top + border && y <= bottom - border) continue;
      const offset = (y * width + x) * 4;
      output[offset] = 210;
      output[offset + 1] = 255;
      output[offset + 2] = 70;
      output[offset + 3] = 255;
    }
  }
  return output;
}

function composeThreePanels(before: Buffer, delta: Buffer, after: Buffer, panelWidth: number, panelHeight: number): Buffer {
  const output = Buffer.alloc(panelWidth * 3 * panelHeight * 4);
  for (let y = 0; y < panelHeight; y += 1) {
    for (const [panelIndex, panel] of [before, delta, after].entries()) {
      const from = y * panelWidth * 4;
      const to = (y * panelWidth * 3 + panelIndex * panelWidth) * 4;
      panel.copy(output, to, from, from + panelWidth * 4);
    }
  }
  return output;
}

async function generateAcceptedDeltaMontages(
  bundle: BoardEvidenceBundle,
  outputRoot: string,
  copied: Map<string, string>,
): Promise<void> {
  const panelWidth = 640;
  const panelHeight = 360;
  for (const delta of bundle.deltas.filter((item) => item.status === "accepted")) {
    const beforeState = bundle.states.find((item) => item.state_id === delta.before_state_id);
    const afterState = bundle.states.find((item) => item.state_id === delta.after_state_id);
    assert(beforeState && afterState, `accepted delta 缺少 before/after state：${delta.delta_id}`);
    const beforeVerified = await verifyImageEvidence({
      root: outputRoot,
      assetUri: beforeState.representative_asset.asset_uri,
      expectedSha256: beforeState.representative_asset.sha256,
    });
    const afterVerified = await verifyImageEvidence({
      root: outputRoot,
      assetUri: afterState.representative_asset.asset_uri,
      expectedSha256: afterState.representative_asset.sha256,
    });
    assert(beforeVerified.mime_type === "image/jpeg" && afterVerified.mime_type === "image/jpeg", "工程 montage 生成器当前只接受已完整解码的 JPEG 状态帧");
    const before = resizeRgba(jpeg.decode(beforeVerified.bytes, { useTArray: true, tolerantDecoding: false }), panelWidth, panelHeight);
    const after = resizeRgba(jpeg.decode(afterVerified.bytes, { useTArray: true, tolerantDecoding: false }), panelWidth, panelHeight);
    const deltaPanel = deltaFocusPanel(after, panelWidth, panelHeight, delta.region);
    const composed = composeThreePanels(before, deltaPanel, after, panelWidth, panelHeight);
    const encoded = Buffer.from(jpeg.encode({ data: composed, width: panelWidth * 3, height: panelHeight }, 88).data);
    const montageSha = digest(encoded);
    const montageUri = `assets/${montageSha}.jpg`;
    await writeFile(join(outputRoot, montageUri), encoded);
    copied.set(montageSha, montageUri);
    delta.comparison_asset = { asset_uri: montageUri, sha256: montageSha };
    const deltaEvidence = bundle.evidence.find((item) => item.kind === "board_delta" && item.target_id === delta.delta_id);
    assert(deltaEvidence, `accepted delta 缺少 canonical board_delta evidence：${delta.delta_id}`);
    deltaEvidence.asset = { asset_uri: montageUri, sha256: montageSha };
  }
}

async function compile(ledgerPath: string): Promise<void> {
  const root = process.cwd();
  const ledger = JSON.parse(await readFile(resolve(root, ledgerPath), "utf8")) as Ledger;
  assert(ledger.schema_version === "temporal-board-adjudication-v1", "adjudication schema_version 不正确");
  assert(ledger.scope === "engineering_gold_dev_not_paper_gold" && ledger.paper_gold_status === "requires_human_signoff", "工程 Gold 必须保留人工签字门");
  assert(Number.isFinite(Date.parse(ledger.frozen_created_at)), "仲裁台账必须冻结合法的 frozen_created_at，禁止编译时间污染 payload hash");
  const sourcePath = resolve(root, ledger.source_bundle_path);
  const asrPath = resolve(root, ledger.asr_path);
  const outputRoot = resolve(root, ledger.output_directory);
  const source = JSON.parse(await readFile(sourcePath, "utf8")) as BoardEvidenceBundle;
  const sourceReport = validateBoardEvidenceBundle(source);
  assert(sourceReport.valid, `源标注 bundle 无效：${sourceReport.issues.slice(0, 6).map((item) => `${item.path} ${item.message}`).join("；")}`);
  const asrBytes = await readFile(asrPath);
  assert(digest(asrBytes) === ledger.asr_sha256, "ASR 文件 SHA-256 与仲裁台账不一致");
  const transcript = JSON.parse(asrBytes.toString("utf8")) as Transcript;
  const bundle = structuredClone(source);
  bundle.bundle_id = ledger.adjudication_id;
  bundle.created_at = ledger.frozen_created_at;
  bundle.speech = [];
  bundle.learner_observations = [];
  bundle.warnings = [
    ...bundle.warnings.filter((item) => item !== "engineering_gold_dev_not_paper_gold"
      && !item.startsWith("Independent annotator B draft")
      && !item.startsWith("All reviewable artifacts remain")
      && !item.startsWith("No independent ASR/transcript exists")),
    "engineering_gold_dev_not_paper_gold",
    "agent_assisted_adjudication_requires_human_signoff",
  ];
  bundle.surfaces.forEach((surface) => { surface.status = "needs_review"; });
  bundle.states.forEach((state) => { state.status = "needs_review"; });
  bundle.deltas.forEach((delta) => { delta.status = "needs_review"; });
  bundle.transitions.forEach((transition) => { transition.status = "needs_review"; });

  for (const [index, decision] of ledger.decisions.entries()) {
    const delta = bundle.deltas.find((item) => item.delta_id === decision.delta_id);
    const transition = bundle.transitions.find((item) => item.transition_id === decision.transition_id);
    assert(delta && transition, `仲裁引用不存在：${decision.delta_id} / ${decision.transition_id}`);
    assert(transition.delta_ids.includes(delta.delta_id), `transition 未引用对应 delta：${decision.transition_id}`);
    assert(Number.isFinite(decision.registration_confidence) && decision.registration_confidence >= 0 && decision.registration_confidence <= 1, "registration_confidence 必须在 0–1");
    const segments = decision.asr_segment_indexes.map((segmentIndex) => {
      const segment = transcript.segments[segmentIndex];
      assert(segment, `ASR segment 不存在：${segmentIndex}`);
      return segment;
    });
    const speechId = `GOLD-SPEECH-${String(index + 1).padStart(2, "0")}`;
    const speech: SpeechSpan = {
      speech_id: speechId,
      source_video_id: bundle.source.source_video_id,
      time: {
        start: segments[0].start + ledger.asr_clip_offset_seconds,
        end: segments.at(-1)!.end + ledger.asr_clip_offset_seconds,
      },
      raw_text: segments.map((item) => item.text).join(" "),
      normalized_text: decision.normalized_speech,
      normalization: "lexicon",
      source_segment_indexes: [...decision.asr_segment_indexes],
    };
    const speechEvidenceId = `GOLD-EV-SPEECH-${String(index + 1).padStart(2, "0")}`;
    const speechEvidence: TemporalBoardEvidenceRef = {
      evidence_id: speechEvidenceId,
      kind: "speech",
      target_id: speechId,
      source_video_id: bundle.source.source_video_id,
      time: { ...speech.time },
      evidence_level: "teacher_stated",
    };
    bundle.speech.push(speech);
    bundle.evidence.push(speechEvidence);
    delta.semantic_label = decision.final_semantic_label;
    delta.confidence.registration = decision.registration_confidence;
    delta.confidence.speech_alignment = 1;
    delta.confidence.pedagogical_inference = null;
    delta.status = "accepted";
    delta.uncertainty_codes = delta.uncertainty_codes.filter((item) => item !== "no_independent_asr");
    const before = bundle.states.find((item) => item.state_id === delta.before_state_id);
    const after = bundle.states.find((item) => item.state_id === delta.after_state_id);
    const surface = bundle.surfaces.find((item) => item.surface_id === delta.surface_id);
    assert(before && after && surface, `delta 状态链不完整：${delta.delta_id}`);
    before.status = "accepted";
    after.status = "accepted";
    surface.status = "accepted";
    transition.speech_ids = [speechId];
    transition.time = {
      start: Math.min(transition.time.start, speech.time.start),
      end: Math.max(transition.time.end, speech.time.end),
    };
    transition.evidence_refs = [...new Set([...transition.evidence_refs, speechEvidenceId])];
    transition.teaching_action = {
      value: decision.teaching_action,
      subject: "teacher",
      level: "teacher_stated",
      confidence: 1,
      evidence_refs: [speechEvidenceId],
    };
    transition.pedagogical_role = {
      value: null,
      subject: "unknown",
      level: "unknown",
      confidence: null,
      evidence_refs: [],
    };
    transition.status = "accepted";
    transition.uncertainty_codes = transition.uncertainty_codes.filter((item) => item !== "no_independent_asr");
  }
  bundle.speech.sort((left, right) => left.time.start - right.time.start || left.speech_id.localeCompare(right.speech_id));

  await mkdir(join(outputRoot, "assets"), { recursive: true });
  const copied = new Map<string, string>();
  const visit = async (value: unknown, path: string): Promise<void> => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) await visit(item, `${path}[${index}]`);
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.asset_uri === "string" && typeof record.sha256 === "string") {
      if (path === "$.source.video") {
        record.asset_uri = "source/video.mp4";
        return;
      }
      const sourceUri = record.asset_uri;
      const verified = await verifyImageEvidence({ root, assetUri: sourceUri, expectedSha256: record.sha256 });
      const suffix = verified.mime_type === "image/png" ? ".png" : ".jpg";
      const targetUri = copied.get(verified.sha256) ?? `assets/${verified.sha256}${suffix}`;
      if (!copied.has(verified.sha256)) {
        await copyFile(verified.path, join(outputRoot, targetUri));
        copied.set(verified.sha256, targetUri);
      }
      record.asset_uri = targetUri;
      return;
    }
    for (const [key, nested] of Object.entries(record)) await visit(nested, `${path}.${key}`);
  };
  await visit(bundle, "$");
  await generateAcceptedDeltaMontages(bundle, outputRoot, copied);
  bundle.payload_sha256 = digest(canonicalBoardEvidencePayload(bundle));
  const report = validateBoardEvidenceBundle(bundle);
  assert(report.valid, `Gold-dev bundle 无效：${report.issues.slice(0, 12).map((item) => `${item.path} ${item.message}`).join("；")}`);
  const bundlePath = join(outputRoot, "bundle.json");
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  await prepareGroundedVisualEvidence(bundle, bundlePath);
  const reportPath = join(outputRoot, "compile-report.json");
  await writeFile(reportPath, `${JSON.stringify({
    schema_version: "temporal-board-gold-compile-report-v1",
    bundle_id: bundle.bundle_id,
    source_annotation: ledger.source_bundle_path,
    source_asr: ledger.asr_path,
    accepted_delta_ids: ledger.decisions.map((item) => item.delta_id),
    accepted_transition_ids: ledger.decisions.map((item) => item.transition_id),
    copied_asset_count: copied.size,
    payload_sha256: bundle.payload_sha256,
    paper_gold_status: ledger.paper_gold_status,
  }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ bundle: bundlePath, report: reportPath, accepted: ledger.decisions.length, assets: copied.size }));
}

const ledgerPath = process.argv[2];
if (!ledgerPath) throw new Error("用法：npx tsx scripts/compile-temporal-gold.ts <adjudication-ledger.json>");
await compile(ledgerPath);
