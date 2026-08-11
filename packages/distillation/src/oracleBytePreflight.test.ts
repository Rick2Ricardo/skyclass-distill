import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import {
  ORACLE_GATE_BYTE_TOOLCHAIN,
  canonicalGoldReviewDecisionSignaturePayload,
  canonicalGoldReviewPackageSignoffSignaturePayload,
  canonicalOracleGateFormalInputPayload,
  canonicalOracleGateFormalSpecPayload,
  canonicalSignedGoldDatasetPayload,
  oracleGateByteInventorySha256Preimage,
  type GoldReviewDecisionRecord,
  type GoldReviewEvent,
  type OracleGateByteInventory,
  type OracleGateFormalInputManifest,
  type OracleGateFormalSpec,
  type SignedGoldDataset,
} from "../../contracts/src/index.js";
import { canonicalImagePixels } from "../../media/src/imageEvidence.js";
import {
  hashSignedSpeechAlignmentContent,
  renderSelectedSpeech,
  renderWhisperCppIndex,
  renderWhisperCppSrt,
  renderWhisperCppText,
  signedSpeechAlignmentSignoffPreimage,
  type SpeechByteFileRef,
  type VerifiedSpeechSegment,
} from "../../media/src/speechEvidence.js";
import type { OracleGateFrameDeriver } from "../../media/src/videoEvidence.js";
import { deriveOracleGateFormalCaseId } from "./oracleFormalPreflight.js";
import { prepareOracleGateBytePreflight } from "./oracleBytePreflight.js";
import { prepareOracleGateFrameDerivationPreflight } from "./oracleFrameDerivationPreflight.js";

function sha(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function events(offset: number): GoldReviewEvent[] {
  return Array.from({ length: 15 }, (_, index) => ({
    event_id: `event-${offset + index + 1}`,
    source_event_refs: [`a-${index}`, `b-${index}`],
    operation: (["ADD", "ERASE", "MODIFY", "CONNECT"] as const)[(offset + index) % 4],
    time: { start: index * 2, end: index * 2 + 1 },
    semantic_label: `可见板书变化 ${offset + index + 1}`,
    region: null,
    relation: (offset + index) % 4 === 3
      ? { source_object_ids: [`s-${index}`], target_object_ids: [`t-${index}`], relation_type: "connects" }
      : null,
    modification: (offset + index) % 4 === 2
      ? { old_object_ids: [`o-${index}`], new_object_ids: [`n-${index}`], semantic_slot: `slot-${index}`, change_description: "可见改变" }
      : null,
  }));
}

function reviewPackage(index: number, finalEvents: GoldReviewEvent[], oracle: {
  asset_uri: string; sha256: string; byte_length: number; width: number; height: number;
}) {
  const packageId = `package-${index}`;
  const groupId = `G${index}`;
  const intakeSha = index === 1 ? "a".repeat(64) : "b".repeat(64);
  const decisionBase: Omit<GoldReviewDecisionRecord, "signature_sha256"> = {
    schema_version: "gold-review-decision-v1",
    package_id: packageId,
    group_id: groupId,
    revision: 1,
    parent_signature_sha256: null,
    source_intake_sha256: intakeSha,
    disposition: "accept",
    selected_candidate_ids: finalEvents.map((item) => item.event_id),
    final_events: finalEvents,
    adjudicator_id: `visual-${index}`,
    adjudicator_role: "reviewer",
    rationale: "逐帧复核后确认。",
    decided_at: `2026-08-12T00:0${index}:00.000Z`,
  };
  const decision: GoldReviewDecisionRecord = {
    ...decisionBase,
    signature_sha256: sha(canonicalGoldReviewDecisionSignaturePayload(decisionBase)),
  };
  const signoff = (role: "visual_adjudicator" | "physics_reviewer", actor: string) => {
    const base = {
      schema_version: "gold-review-package-signoff-v1" as const,
      package_id: packageId,
      signoff_role: role,
      source_intake_sha256: intakeSha,
      decision_signatures: [decision.signature_sha256],
      adjudicator_id: `${actor}-${index}`,
      adjudicator_role: role,
      statement: "确认视觉和物理证据。",
      signed_at: role === "visual_adjudicator" ? "2026-08-12T01:00:00.000Z" : "2026-08-12T01:01:00.000Z",
    };
    return { ...base, signature_sha256: sha(canonicalGoldReviewPackageSignoffSignaturePayload(base)) };
  };
  return {
    package_id: packageId,
    source_video_id: `video-${index}`,
    source_intake_uri: `research/intake-${index}.json`,
    source_intake_sha256: intakeSha,
    reviewed_group_count: 1,
    accepted_group_count: 1,
    accepted_event_count: finalEvents.length,
    decision_signatures: [decision.signature_sha256],
    decisions: [decision],
    signoffs: [signoff("visual_adjudicator", "visual"), signoff("physics_reviewer", "physics")],
    groups: [{
      group_id: groupId,
      alignment_class: "matched",
      decision_signature_sha256: decision.signature_sha256,
      decision_revision: 1,
      final_events: finalEvents,
      canonical_visual_evidence_id: `oracle-${index}`,
      visual_evidence: [{
        evidence_id: `oracle-${index}`,
        side: "shared",
        kind: "comparison",
        label: "before/delta/after",
        mime_type: "image/png" as const,
        ...oracle,
      }],
      speech_context: { text: "教师说明板书。", status: "context_not_gold" as const },
    }],
  };
}

function makePng(red: number, green: number, blue: number): Buffer {
  const png = new PNG({ width: 1, height: 1 });
  png.data.set([red, green, blue, 255]);
  return PNG.sync.write(png);
}

async function buildFixture() {
  const root = await mkdtemp(join(tmpdir(), "oracle-byte-preflight-"));
  await Promise.all([mkdir(join(root, "assets")), mkdir(join(root, "sources")), mkdir(join(root, "speech"))]);
  const images = new Map<string, ReturnType<typeof canonicalImagePixels> & { bytes: Buffer; asset_uri: string; sha256: string }>();
  for (let index = 1; index <= 2; index += 1) {
    for (const [kind, color] of [["static", 20], ["uniform", 80], ["oracle", 140]] as const) {
      const bytes = makePng(color + index, color + index * 2, color + index * 3);
      const asset_uri = `assets/${kind}-${index}.png`;
      await writeFile(join(root, asset_uri), bytes);
      images.set(`${kind}-${index}`, { ...canonicalImagePixels(bytes), bytes, asset_uri, sha256: sha(bytes) });
    }
  }
  const sourceBytes = [Buffer.from("\0\0\0\x18ftypisomvideo-one"), Buffer.from("\0\0\0\x18ftypisomvideo-two")];
  for (let index = 0; index < 2; index += 1) await writeFile(join(root, `sources/video-${index + 1}.mp4`), sourceBytes[index]);

  const speechFiles: Array<{ files: Record<"raw" | "index" | "srt" | "txt", SpeechByteFileRef>; ledger: SpeechByteFileRef | null; selected: string }> = [];
  const segments: VerifiedSpeechSegment[] = [
    { segment_index: 0, segment_id: "segment-000000", start_ms: 0, end_ms: 750, text: "先观察板书" },
    { segment_index: 1, segment_id: "segment-000001", start_ms: 1000, end_ms: 2200, text: "再解释变化" },
  ];
  const speechReviewer = generateKeyPairSync("ed25519");
  for (let index = 1; index <= 2; index += 1) {
    const raw = `${JSON.stringify({
      model: { type: "small" },
      result: { language: "zh" },
      transcription: segments.map((segment) => ({
        timestamps: {
          from: segment.segment_index === 0 ? "00:00:00,000" : "00:00:01,000",
          to: segment.segment_index === 0 ? "00:00:00,750" : "00:00:02,200",
        },
        offsets: { from: segment.start_ms, to: segment.end_ms },
        text: segment.text,
      })),
    }, null, 2)}\n`;
    const indexText = renderWhisperCppIndex({
      text: "先观察板书 再解释变化",
      segments: segments.map((item) => ({ start: item.start_ms / 1000, end: item.end_ms / 1000, text: item.text })),
      language: "zh",
      duration: 2.2,
      engine: "whisper.cpp",
      model: "small",
    });
    const values = { raw, index: indexText, srt: renderWhisperCppSrt(segments), txt: renderWhisperCppText(segments) };
    const files = {} as Record<"raw" | "index" | "srt" | "txt", SpeechByteFileRef>;
    for (const [name, bytes] of Object.entries(values)) {
      const asset_uri = `speech/case-${index}.${name}`;
      await writeFile(join(root, asset_uri), bytes);
      files[name as keyof typeof files] = { asset_uri, sha256: sha(bytes), byte_length: Buffer.byteLength(bytes) };
    }
    speechFiles.push({
      files,
      ledger: null,
      selected: renderSelectedSpeech(segments, [0, 1]),
    });
  }

  const packageRecords = [1, 2].map((index) => {
    const oracle = images.get(`oracle-${index}`)!;
    return reviewPackage(index, events((index - 1) * 15), {
      asset_uri: oracle.asset_uri,
      sha256: oracle.sha256,
      byte_length: oracle.bytes.byteLength,
      width: oracle.width,
      height: oracle.height,
    });
  });
  const datasetPayload = {
    schema_version: "signed-gold-dataset-v1" as const,
    status: "paper_gold_signed" as const,
    frozen_at: "2026-08-12T02:00:00.000Z",
    source_queue_schema_version: "gold-review-queue-v1" as const,
    package_count: 2,
    reviewed_group_count: 2,
    accepted_group_count: 2,
    accepted_event_count: 30,
    minimum_required_event_count: 30,
    packages: packageRecords,
  };
  const datasetSha = sha(canonicalSignedGoldDatasetPayload(datasetPayload));
  const dataset: SignedGoldDataset = {
    dataset_id: `signed-gold-${datasetSha.slice(0, 16)}`,
    dataset_sha256: datasetSha,
    ...datasetPayload,
  };
  for (const [zeroIndex, reviewPackage] of packageRecords.entries()) {
    const index = zeroIndex + 1;
    const group = reviewPackage.groups[0];
    const caseId = deriveOracleGateFormalCaseId({ dataset_sha256: dataset.dataset_sha256, package_id: reviewPackage.package_id, group_id: group.group_id });
    const ledgerContent = {
      schema_version: "signed-speech-alignment-v1" as const,
      status: "signed_alignment" as const,
      case_id: caseId,
      source_video_id: reviewPackage.source_video_id,
      clip_start_us: 0,
      clip_end_us: 30_000_000,
      files: {
        raw: speechFiles[zeroIndex].files.raw,
        index: speechFiles[zeroIndex].files.index,
        srt: speechFiles[zeroIndex].files.srt,
        text: speechFiles[zeroIndex].files.txt,
      },
      selected_segments: segments.map((item) => ({
        segment_id: item.segment_id,
        segment_index: item.segment_index,
        start_ms: item.start_ms,
        end_ms: item.end_ms,
        text_sha256: sha(item.text),
      })),
      selected_transcript_sha256: sha(speechFiles[zeroIndex].selected),
      selected_transcript_byte_length: Buffer.byteLength(speechFiles[zeroIndex].selected),
    };
    const signoffBase = {
      adjudicator_id: `speech-reviewer-${index}`,
      adjudicator_role: "speech_alignment_reviewer" as const,
      reviewed_at: "2026-08-12T02:30:00.000Z",
      statement: "确认 raw、派生文件与选中片段逐字节一致。",
      ledger_content_sha256: hashSignedSpeechAlignmentContent(ledgerContent),
      signer_key_id: "speech-reviewer-key-1",
      signature_algorithm: "ed25519" as const,
    };
    const signatureBase64 = sign(
      null,
      Buffer.from(signedSpeechAlignmentSignoffPreimage(signoffBase), "utf8"),
      speechReviewer.privateKey,
    ).toString("base64");
    const ledgerBytes = `${JSON.stringify({
      ...ledgerContent,
      signoff: { ...signoffBase, signature_base64: signatureBase64 },
    }, null, 2)}\n`;
    const ledgerUri = `speech/case-${index}.ledger.json`;
    await writeFile(join(root, ledgerUri), ledgerBytes);
    speechFiles[zeroIndex].ledger = { asset_uri: ledgerUri, sha256: sha(ledgerBytes), byte_length: Buffer.byteLength(ledgerBytes) };
  }
  const sources = [1, 2].map((index) => ({
    source_video_id: `video-${index}`,
    teacher_id: `teacher-${index}`,
    board_mode: index === 1 ? "physical_chalkboard" as const : "digital_ink" as const,
    data_split: "development" as const,
    rights_status: "internal_review_only" as const,
    teacher_only_recording: true as const,
    resource_manifest_entry_sha256: String(index).repeat(64),
    withdrawal_key: `teacher-${index}`,
  }));
  const cases = packageRecords.map((reviewPackage, zeroIndex) => {
    const index = zeroIndex + 1;
    const group = reviewPackage.groups[0];
    const staticImage = images.get(`static-${index}`)!;
    const uniformImage = images.get(`uniform-${index}`)!;
    return {
      case_id: deriveOracleGateFormalCaseId({ dataset_sha256: dataset.dataset_sha256, package_id: reviewPackage.package_id, group_id: group.group_id }),
      package_id: reviewPackage.package_id,
      group_id: group.group_id,
      source_video_id: reviewPackage.source_video_id,
      event_ids: group.final_events.map((item) => item.event_id),
      event_window: { start: 0, end: 29 },
      speech: {
        schema_version: "signed-speech-alignment-v1" as const,
        ledger_uri: `speech/case-${index}.ledger.json`,
        ledger_sha256: speechFiles[zeroIndex].ledger!.sha256,
        segment_ids: segments.map((item) => item.segment_id),
        transcript_sha256: sha(speechFiles[zeroIndex].selected),
        status: "signed_alignment" as const,
      },
      static_final: {
        asset_uri: staticImage.asset_uri, sha256: staticImage.sha256, mime_type: staticImage.mime_type,
        width: staticImage.width, height: staticImage.height, byte_length: staticImage.bytes.byteLength,
        source_frame_id: `after-${index}`, timestamp: 30, selection_rule_version: "stable-after-v1",
      },
      uniform_frame: {
        asset_uri: uniformImage.asset_uri, sha256: uniformImage.sha256, mime_type: uniformImage.mime_type,
        width: uniformImage.width, height: uniformImage.height, byte_length: uniformImage.bytes.byteLength,
        timestamp: 10, selection_rule_version: "uniform-in-window-v1",
      },
      oracle_comparison_evidence_id: group.canonical_visual_evidence_id,
      difficulty_tags: [index === 1 ? "chalkboard" : "digital_ink"],
    };
  });
  const manifest: OracleGateFormalInputManifest = {
    schema_version: "oracle-gate-formal-input-v1",
    manifest_sha256: "0".repeat(64),
    signed_gold_dataset_sha256: dataset.dataset_sha256,
    resource_manifest_sha256: "9".repeat(64),
    created_at: "2026-08-12T03:00:00.000Z",
    sources,
    cases,
  };
  manifest.manifest_sha256 = sha(canonicalOracleGateFormalInputPayload(manifest));
  const spec: OracleGateFormalSpec = {
    schema_version: "oracle-gate-formal-spec-v1",
    spec_sha256: "0".repeat(64),
    input_manifest_sha256: manifest.manifest_sha256,
    signed_gold_dataset_sha256: dataset.dataset_sha256,
    code_revision: "a".repeat(40),
    model: "vision-fixture",
    transport: "pi",
    cache_retention: "none",
    tools_policy: "none",
    temperature: 0,
    seeds: [1, 2, 3],
    prompt: { version: "v1", system_sha256: "a".repeat(64), user_template_sha256: "b".repeat(64), output_schema_sha256: "c".repeat(64) },
    budget: { max_input_tokens: 8192, max_output_tokens: 2048, visual_items_per_visual_arm: 1, canvas: { mime_type: "image/jpeg", width: 1920, height: 360, quality: 88 }, timeout_ms: 120_000, max_attempts: 2 },
    evaluation: { rubric_version: "v1", rubric_sha256: "d".repeat(64), rating_schema_version: "oracle-gate-rating-v1", independent_raters: 2, primary_ci: 0.8, descriptive_ci: 0.95, bootstrap_seed: 12, strongest_non_oracle_rule: "best_pre_registered_non_oracle_on_development", missing_request_policy: "fail_closed_no_partial_decision" },
  };
  spec.spec_sha256 = sha(canonicalOracleGateFormalSpecPayload(spec));
  const toolHashes = { ffmpeg_binary_sha256: "a".repeat(64), ffprobe_binary_sha256: "b".repeat(64), ffmpeg_version_sha256: "c".repeat(64), ffprobe_version_sha256: "d".repeat(64) };
  const inventory: OracleGateByteInventory = {
    schema_version: "oracle-gate-byte-inventory-v1",
    inventory_sha256: "0".repeat(64),
    status: "untrusted_inventory",
    api_execution_allowed: false,
    reason: "inventory_not_byte_verified_or_attested",
    input_manifest_sha256: manifest.manifest_sha256,
    signed_gold_dataset_sha256: dataset.dataset_sha256,
    toolchain: { ...ORACLE_GATE_BYTE_TOOLCHAIN, ...toolHashes },
    sources: sourceBytes.map((bytes, zeroIndex) => ({
      source_video_id: `video-${zeroIndex + 1}`,
      video: { asset_uri: `sources/video-${zeroIndex + 1}.mp4`, sha256: sha(bytes), byte_length: bytes.byteLength, mime_type: "video/mp4", duration_us: 120_000_000, width: 1, height: 1, video_stream_index: 0 },
    })),
    cases: cases.map((formalCase, zeroIndex) => {
      const index = zeroIndex + 1;
      const staticImage = images.get(`static-${index}`)!;
      const uniformImage = images.get(`uniform-${index}`)!;
      const oracle = images.get(`oracle-${index}`)!;
      const imageRef = (image: typeof staticImage) => ({ asset_uri: image.asset_uri, sha256: image.sha256, byte_length: image.bytes.byteLength, mime_type: image.mime_type, width: image.width, height: image.height, canonical_pixel_sha256: image.canonical_pixel_sha256 });
      return {
        case_id: formalCase.case_id,
        source_video_id: formalCase.source_video_id,
        static_final: { ...imageRef(staticImage), timestamp_us: 30_000_000 },
        uniform_frame: { ...imageRef(uniformImage), timestamp_us: 10_000_000 },
        oracle_comparison: { ...imageRef(oracle), evidence_id: formalCase.oracle_comparison_evidence_id },
        speech: { clip_start_us: 0, clip_end_us: 30_000_000, alignment_ledger: speechFiles[zeroIndex].ledger!, raw: speechFiles[zeroIndex].files.raw, index: speechFiles[zeroIndex].files.index, srt: speechFiles[zeroIndex].files.srt, txt: speechFiles[zeroIndex].files.txt, selected_segment_indexes: [0, 1], selected_transcript_sha256: sha(speechFiles[zeroIndex].selected), selected_transcript_byte_length: Buffer.byteLength(speechFiles[zeroIndex].selected) },
      };
    }),
  };
  inventory.inventory_sha256 = sha(oracleGateByteInventorySha256Preimage(inventory));
  const video_probe: OracleGateFrameDeriver = {
    toolchain: toolHashes,
    async probe() { return { mime_type: "video/mp4", duration_us: 120_000_000, width: 1, height: 1, video_stream_index: 0 }; },
    async verify_decodable() { /* fixture probe */ },
    async derive_frames(input) {
      return input.requests.map((request) => {
        const [caseId, role] = request.request_id.split(":") as [string, "static_final" | "uniform_frame"];
        const caseIndex = inventory.cases.findIndex((item) => item.case_id === caseId);
        const image = images.get(`${role === "static_final" ? "static" : "uniform"}-${caseIndex + 1}`)!;
        return {
          request_id: request.request_id,
          previous_normalized_pts_us: request.timestamp_us === 0 ? null : request.timestamp_us - 1,
          selected_normalized_pts_us: request.timestamp_us,
          selected_frame_ordinal: Math.max(1, Math.floor(request.timestamp_us / 1_000_000)),
          width: image.width,
          height: image.height,
          rgba: image.rgba,
          argv_sha256: sha(`argv:${request.request_id}`),
        };
      });
    },
  };
  return {
    root,
    dataset,
    manifest,
    spec,
    inventory,
    video_probe,
    trusted_speech_reviewer_keys: new Map([["speech-reviewer-key-1", speechReviewer.publicKey]]),
  };
}

describe("Formal Oracle byte preflight", () => {
  it("verifies every byte/pixel/transcript but keeps API execution closed", async () => {
    const fixture = await buildFixture();
    const result = await prepareOracleGateBytePreflight(fixture);
    expect(result).toMatchObject({
      status: "untrusted_media_bytes_valid",
      api_execution_allowed: false,
      source_frame_derivation_verified: false,
      source_count: 2,
      case_count: 2,
    });
    expect(result.cases.every((item) => item.static_final.bytes.length > 0 && item.speech.selected_segment_ids.length === 2)).toBe(true);
  });

  it("fails closed on pixel, speech, source metadata, and evidence binding drift", async () => {
    const pixel = await buildFixture();
    pixel.inventory.cases[0].static_final.canonical_pixel_sha256 = "0".repeat(64);
    pixel.inventory.inventory_sha256 = sha(oracleGateByteInventorySha256Preimage(pixel.inventory));
    await expect(prepareOracleGateBytePreflight(pixel)).rejects.toThrow("canonical 像素");

    const speech = await buildFixture();
    speech.inventory.cases[0].speech.selected_segment_indexes = [1];
    speech.inventory.inventory_sha256 = sha(oracleGateByteInventorySha256Preimage(speech.inventory));
    await expect(prepareOracleGateBytePreflight(speech)).rejects.toThrow(/segment_ids|transcript/);

    const video = await buildFixture();
    video.video_probe.probe = async () => ({ mime_type: "video/mp4", duration_us: 119_000_000, width: 1, height: 1, video_stream_index: 0 });
    await expect(prepareOracleGateBytePreflight(video)).rejects.toThrow("duration_us");

    const evidence = await buildFixture();
    evidence.inventory.cases[0].oracle_comparison.evidence_id = "other";
    evidence.inventory.inventory_sha256 = sha(oracleGateByteInventorySha256Preimage(evidence.inventory));
    await expect(prepareOracleGateBytePreflight(evidence)).rejects.toThrow("canonical Oracle evidence");

    const ledger = await buildFixture();
    const badLedger = `${JSON.stringify({ schema_version: "signed-speech-alignment-v1", selected_segment_indexes: [0, 1] })}\n`;
    const ledgerRef = ledger.inventory.cases[0].speech.alignment_ledger;
    await writeFile(join(ledger.root, ledgerRef.asset_uri), badLedger);
    ledgerRef.sha256 = sha(badLedger);
    ledgerRef.byte_length = Buffer.byteLength(badLedger);
    ledger.manifest.cases[0].speech.ledger_sha256 = ledgerRef.sha256;
    ledger.manifest.manifest_sha256 = sha(canonicalOracleGateFormalInputPayload(ledger.manifest));
    ledger.spec.input_manifest_sha256 = ledger.manifest.manifest_sha256;
    ledger.spec.spec_sha256 = sha(canonicalOracleGateFormalSpecPayload(ledger.spec));
    ledger.inventory.input_manifest_sha256 = ledger.manifest.manifest_sha256;
    ledger.inventory.inventory_sha256 = sha(oracleGateByteInventorySha256Preimage(ledger.inventory));
    await expect(prepareOracleGateBytePreflight(ledger)).rejects.toThrow(/字段集合|schema/);
  });

  it("rejects the whole batch when a later case fails validation", async () => {
    const fixture = await buildFixture();
    fixture.inventory.cases[1].uniform_frame.canonical_pixel_sha256 = "0".repeat(64);
    fixture.inventory.inventory_sha256 = sha(oracleGateByteInventorySha256Preimage(fixture.inventory));
    await expect(prepareOracleGateBytePreflight(fixture)).rejects.toThrow("canonical 像素 SHA-256 不匹配");
  });
});

describe("Formal Oracle source-frame derivation preflight", () => {
  it("binds Static/Uniform canonical PNG bytes to deterministic normalized PTS proofs while API stays closed", async () => {
    const fixture = await buildFixture();
    const result = await prepareOracleGateFrameDerivationPreflight({
      ...fixture,
      frame_deriver: fixture.video_probe,
    });
    expect(result).toMatchObject({
      schema_version: "oracle-gate-frame-derivation-preflight-v1",
      status: "untrusted_source_frame_derivation_valid",
      source_frame_derivation_verified: true,
      api_execution_allowed: false,
      case_count: 2,
    });
    expect(result.cases.flatMap((item) => [item.static_final, item.uniform_frame]).every((proof) => (
      proof.selected_normalized_pts_us >= proof.requested_timestamp_us
      && proof.output.mime_type === "image/png"
      && proof.proof_sha256 !== "0".repeat(64)
    ))).toBe(true);
  });

  it("fails closed on derived pixels, PTS ordering, and lossy frame assets", async () => {
    const pixels = await buildFixture();
    const originalPixels = pixels.video_probe.derive_frames.bind(pixels.video_probe);
    pixels.video_probe.derive_frames = async (input) => {
      const result = await originalPixels(input);
      result[0].rgba = Buffer.from(result[1].rgba);
      return result;
    };
    await expect(prepareOracleGateFrameDerivationPreflight({ ...pixels, frame_deriver: pixels.video_probe })).rejects.toThrow("canonical PNG 字节");

    const pts = await buildFixture();
    const originalPts = pts.video_probe.derive_frames.bind(pts.video_probe);
    pts.video_probe.derive_frames = async (input) => {
      const result = await originalPts(input);
      result[0].selected_normalized_pts_us = result[0].previous_normalized_pts_us ?? 0;
      return result;
    };
    await expect(prepareOracleGateFrameDerivationPreflight({ ...pts, frame_deriver: pts.video_probe })).rejects.toThrow(/selected PTS|preflight 无效/);

    const jpeg = await buildFixture();
    jpeg.inventory.cases[0].static_final.mime_type = "image/jpeg";
    jpeg.inventory.inventory_sha256 = sha(oracleGateByteInventorySha256Preimage(jpeg.inventory));
    await expect(prepareOracleGateFrameDerivationPreflight({ ...jpeg, frame_deriver: jpeg.video_probe })).rejects.toThrow(/mime_type|MIME|canonical PNG/);
  });
});
