import { createHash, generateKeyPairSync, sign, type KeyLike } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  deriveSignedGoldLessonsV2,
  deriveSignedGoldVisualEvidenceIdV2,
  hashFormalRunContract,
  hashFormalRunContractV2,
  hashFormalOracleCompositionAttestationV4,
  hashFormalOraclePreregistrationBundleV2,
  hashOracleGateFormalSpecV2,
  hashOracleGatePublicEvidenceDerivationPolicyV2,
  hashOracleGateRatingPlanV2,
  hashOracleGateStatisticsPlanV2,
  validateFormalOracleCompositionAttestationV4,
  validateFormalOracleCompositionAttestationV4AgainstRunAndPlan,
  hashRunCheckpoint,
  oracleGateByteInventorySha256Preimage,
  ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES,
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
  FORMAL_ORACLE_USER_PROMPT_VERSION,
  buildFormalOraclePiRequestEnvelope,
  buildFormalOraclePreparedProviderRequest,
  FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
  FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
  FORMAL_ORACLE_PROVIDER_TOKEN_FIELD,
  renderFormalOracleUserPrompt,
  parseFormalOracleUserPromptBytes,
  type GoldReviewDecisionRecord,
  type GoldReviewEvent,
  type OracleGateByteInventory,
  type OracleGateFormalInputManifest,
  type OracleGateFormalSpec,
  type OracleGateLedgerRegistryV1,
  type FormalRunContractV1,
  type FormalRunContractV2,
  type FormalOraclePreregistrationBundleV2,
  type FormalOracleCompositionAttestationV4,
  type OracleGateFormalSpecV2,
  type OracleGatePublicEvidenceDerivationPolicyV2,
  type OracleGateRatingPlanV2,
  type OracleGateStatisticsPlanV2,
  type GoldLedgerSnapshotV1,
  type RunCheckpointV1,
  type SignedGoldDataset,
  createFormalOracleInputTokenCountReceipt,
  createFormalOracleInputTokenCountReceiptSet,
  createFormalOracleInputTokenCountRequestCapture,
  createFormalOracleInputTokenCountResponseCapture,
} from "../../contracts/src/index.js";
import { canonicalizeOracleGateCanvas } from "../../media/src/oracleGateCanvas.js";
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
import { prepareOracleGateFormalStructuralPreflight } from "./oracleFormalPreflight.js";
import { prepareOracleGateBytePreflight } from "./oracleBytePreflight.js";
import { prepareOracleGateFrameDerivationPreflight } from "./oracleFrameDerivationPreflight.js";
import {
  assertActiveFormalOracleCompositionCapability,
  assertActiveFormalOracleCompositionCapabilityV2,
  withComposedFormalOracleRunGenesis,
  withComposedFormalOraclePreregisteredRunGenesisV2,
  type ComposeFormalOracleRunGenesisInput,
  type ComposeFormalOracleRunGenesisV2Input,
  type FormalOracleCompositionCapability,
} from "./oracleCompositionGate.js";
import { assertActiveOracleLedgerCapability } from "./oracleTrustedPreflight.js";
import {
  withValidatedFormalOracleInputTokenCountReceiptSet,
} from "./oracleInputTokenCountReceiptGate.js";
import { FormalOracleRunStore, hashFormalOracleExecutionPlan } from "../../store/src/formalOracleRunStore.js";
import { FormalOraclePreregistrationStoreV2 } from "../../store/src/formalOraclePreregistrationStoreV2.js";
import type { FormalOracleExecutionPlanV1, FormalOracleHeadPinV1 } from "../../store/src/formalOracleRunStore.js";
import type { FrozenOracleRegistryStore } from "../../store/src/frozenOracleRegistryStore.js";
import type { GoldLedgerAttestor } from "../../store/src/goldLedgerAttestor.js";

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
    source_window: { start: index * 10, end: index * 10 + 2 },
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
      canonical_visual_evidence_id: deriveSignedGoldVisualEvidenceIdV2({ package_id: packageId, group_id: groupId, source_evidence_id: `oracle-${index}`, side: "shared", kind: "comparison", asset_uri: oracle.asset_uri, sha256: oracle.sha256 }, sha),
      visual_evidence: [{
        evidence_id: deriveSignedGoldVisualEvidenceIdV2({ package_id: packageId, group_id: groupId, source_evidence_id: `oracle-${index}`, side: "shared", kind: "comparison", asset_uri: oracle.asset_uri, sha256: oracle.sha256 }, sha),
        source_evidence_id: `oracle-${index}`,
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
    schema_version: "signed-gold-dataset-v2" as const,
    status: "paper_gold_signed" as const,
    frozen_at: "2026-08-12T02:00:00.000Z",
    source_queue_schema_version: "gold-review-queue-v1" as const,
    package_count: 2,
    lesson_count: 2,
    reviewed_group_count: 2,
    accepted_group_count: 2,
    accepted_event_count: 30,
    minimum_required_event_count: 30,
    packages: packageRecords,
    lessons: deriveSignedGoldLessonsV2(packageRecords, sha),
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
    prompt: {
      version: FORMAL_ORACLE_USER_PROMPT_VERSION,
      system_sha256: "a".repeat(64),
      user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
      output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
    },
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

async function buildCompositionFixture(): Promise<ComposeFormalOracleRunGenesisInput> {
  const fixture = await buildFixture();
  const systemPromptBytes = Buffer.from("frozen formal system prompt\n", "utf8");
  const userTemplateBytes = Buffer.from(FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES);
  fixture.spec.prompt.version = FORMAL_ORACLE_USER_PROMPT_VERSION;
  fixture.spec.prompt.system_sha256 = sha(systemPromptBytes);
  fixture.spec.prompt.user_template_sha256 = sha(userTemplateBytes);
  fixture.spec.prompt.output_schema_sha256 = ORACLE_GATE_RESPONSE_SCHEMA_SHA256;
  fixture.spec.spec_sha256 = sha(canonicalOracleGateFormalSpecPayload(fixture.spec));
  const structural = prepareOracleGateFormalStructuralPreflight(fixture);
  const bytePreflight = await prepareOracleGateBytePreflight(fixture);
  const frame = await prepareOracleGateFrameDerivationPreflight({ ...fixture, frame_deriver: fixture.video_probe });
  const artifacts = await Promise.all(structural.schedule.map(async (item, index) => {
    const byteCase = fixture.inventory.cases.find((candidate) => candidate.case_id === item.case_id)!;
    const sourceUri = item.arm === "static_final_board" ? byteCase.static_final.asset_uri
      : item.arm === "uniform_frame" ? byteCase.uniform_frame.asset_uri
        : byteCase.oracle_comparison.asset_uri;
    const visual = item.arm === "transcript_only" ? [] : [canonicalizeOracleGateCanvas(
      await readFile(join(fixture.root, sourceUri)),
      item.arm,
    ).bytes];
    return { request_id: item.request_id, visual_bytes: visual };
  }));
  const executionPlan: FormalOracleExecutionPlanV1 = {
    schema_version: "formal-oracle-execution-plan-v2",
    execution_plan_sha256: "0".repeat(64),
    items: structural.schedule.map((item, index) => {
      const visualBytes = artifacts[index].visual_bytes[0];
      const verifiedCase = bytePreflight.cases.find((candidate) => candidate.case_id === item.case_id)!;
      const transcriptBytes = Buffer.from(verifiedCase.speech.selected_transcript, "utf8");
      const userPrompt = renderFormalOracleUserPrompt({
        prompt_version: fixture.spec.prompt.version,
        user_template_bytes: userTemplateBytes,
        expected_user_template_sha256: fixture.spec.prompt.user_template_sha256,
        selected_transcript_bytes: transcriptBytes,
        expected_selected_transcript_sha256: verifiedCase.speech.selected_transcript_sha256,
        expected_selected_transcript_byte_length: verifiedCase.speech.selected_transcript_byte_length,
        visual_input_available: item.arm !== "transcript_only",
        output_schema_sha256: fixture.spec.prompt.output_schema_sha256,
      });
      const planItem = {
        request_id: item.request_id,
        idempotency_key: item.idempotency_key,
        schedule_index: index,
        case_id: item.case_id,
        arm: item.arm,
        seed: item.seed,
        model: fixture.spec.model,
        request_envelope_sha256: "0".repeat(64),
        provider_body_sha256: "0".repeat(64),
        provider_body_profile: FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
        provider_body_dispatch_status: "pending_local_pi_fetch_boundary_proof_non_executable" as const,
        prepared_adapter_version: FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
        provider_token_field: FORMAL_ORACLE_PROVIDER_TOKEN_FIELD,
        system_prompt_sha256: fixture.spec.prompt.system_sha256,
        user_prompt_sha256: userPrompt.prompt_sha256,
        output_schema_sha256: fixture.spec.prompt.output_schema_sha256,
        visuals: visualBytes ? [{
          label: "visual-1" as const,
          object_uri: `composition-canvases/${item.request_id}.jpg`,
          sha256: sha(visualBytes),
          mime_type: "image/jpeg" as const,
          width: 1920 as const,
          height: 360 as const,
          byte_length: visualBytes.byteLength,
        }] : [],
        transport: fixture.spec.transport,
        temperature: fixture.spec.temperature,
        max_input_tokens: fixture.spec.budget.max_input_tokens,
        max_output_tokens: fixture.spec.budget.max_output_tokens,
        timeout_ms: fixture.spec.budget.timeout_ms,
        max_attempts: fixture.spec.budget.max_attempts,
        cache_retention: fixture.spec.cache_retention,
        tools_policy: fixture.spec.tools_policy,
      };
      const requestEnvelope = buildFormalOraclePiRequestEnvelope({
        request_id: planItem.request_id, schedule_index: planItem.schedule_index, case_id: planItem.case_id, arm: planItem.arm,
        model: planItem.model, system_prompt_bytes: systemPromptBytes, expected_system_prompt_sha256: planItem.system_prompt_sha256,
        user_prompt: userPrompt, expected_rendered_user_prompt_sha256: planItem.user_prompt_sha256,
        expected_user_template_sha256: fixture.spec.prompt.user_template_sha256,
        output_schema_sha256: planItem.output_schema_sha256,
        visuals: planItem.visuals.map((visual, visualIndex) => ({
          label: visual.label, mime_type: visual.mime_type, bytes: artifacts[index].visual_bytes[visualIndex],
          expected_sha256: visual.sha256, expected_byte_length: visual.byte_length,
        })),
        seed: planItem.seed, temperature: planItem.temperature, max_input_tokens: planItem.max_input_tokens,
        max_output_tokens: planItem.max_output_tokens, timeout_ms: planItem.timeout_ms, max_attempts: planItem.max_attempts,
        transport: planItem.transport, cache_retention: planItem.cache_retention, tools_policy: planItem.tools_policy,
      });
      planItem.request_envelope_sha256 = requestEnvelope.payload_sha256;
      planItem.provider_body_sha256 = buildFormalOraclePreparedProviderRequest(requestEnvelope).provider_body_sha256;
      return planItem;
    }),
  };
  executionPlan.execution_plan_sha256 = hashFormalOracleExecutionPlan(executionPlan);
  const registrySha = "4".repeat(64);
  const run: FormalRunContractV1 = {
    schema_version: "oracle-gate-formal-run-contract-v1",
    run_sha256: "0".repeat(64),
    canonicalization: "oracle-gate-run-canonical-json-v1",
    signed_gold_dataset_sha256: fixture.dataset.dataset_sha256,
    formal_input_manifest_sha256: fixture.manifest.manifest_sha256,
    formal_spec_sha256: fixture.spec.spec_sha256,
    schedule_sha256: structural.schedule_sha256,
    execution_plan_sha256: executionPlan.execution_plan_sha256,
    ledger_registry_sha256: registrySha,
    media_attestation_sha256: frame.preflight_sha256,
    speech_attestation_sha256: fixture.inventory.inventory_sha256,
    code_revision: fixture.spec.code_revision,
    build_artifact_sha256: "5".repeat(64),
    blinding_secret_commitment_sha256: "6".repeat(64),
    blinding_scheme: "hmac-sha256-run-request-v1",
    rating_plan_sha256: "7".repeat(64),
    statistics_plan_sha256: "8".repeat(64),
    run_store_uri: "board2skill/formal-oracle/run-store",
    request_count: structural.request_count,
    directory_mode: "0700",
    file_mode: "0600",
    lock_scheme: "exclusive-create-owner-nonce-v1",
    checkpoint_scheme: "immutable-hash-chain-head-v1",
    remote_idempotency_mode: "local_only_fail_closed",
    api_execution_allowed: false,
  };
  run.run_sha256 = hashFormalRunContract(run);
  const initialCheckpoint: RunCheckpointV1 = {
    schema_version: "oracle-gate-run-checkpoint-v1",
    checkpoint_sha256: "0".repeat(64),
    run_sha256: run.run_sha256,
    schedule_sha256: run.schedule_sha256,
    generation: 0,
    previous_checkpoint_sha256: null,
    created_at: "2026-08-12T04:00:00.000Z",
    run_state: "SEALED_READY",
    terminal_reason_sha256: null,
    request_count: run.request_count,
    counts: { pending: run.request_count, retry_ready: 0, dispatch_intent_committed: 0, receipt_committed: 0, schema_validated_committed: 0, blocked_ambiguous: 0, failed_closed: 0 },
    entries: executionPlan.items.map((item) => ({
      request_id: item.request_id,
      idempotency_key: item.idempotency_key,
      state: "PENDING",
      resume_action: "dispatch_new_attempt",
      max_attempts: item.max_attempts,
      attempts_used: 0,
      active_intent_sha256: null,
      latest_attempt_audit_sha256: null,
      committed_request_sha256: null,
    })),
  };
  initialCheckpoint.checkpoint_sha256 = hashRunCheckpoint(initialCheckpoint);
  const expectedHead: FormalOracleHeadPinV1 = {
    schema_version: "formal-oracle-head-pin-v1",
    run_sha256: run.run_sha256,
    generation: 0,
    checkpoint_sha256: initialCheckpoint.checkpoint_sha256,
  };
  const snapshot: GoldLedgerSnapshotV1 = {
    schema_version: "gold-ledger-snapshot-v1",
    snapshot_sha256: "9".repeat(64),
    dataset_sha256: fixture.dataset.dataset_sha256,
    queue_sha256: "a".repeat(64),
    gold_manifest_sha256: "b".repeat(64),
    ledger_tree_sha256: "c".repeat(64),
    package_count: fixture.dataset.package_count,
    reviewed_group_count: fixture.dataset.reviewed_group_count,
    accepted_event_count: fixture.dataset.accepted_event_count,
    entries: [],
  };
  const registry = {
    registry_sha256: registrySha,
    ledger_snapshot: snapshot,
    formal_input_manifest_sha256: fixture.manifest.manifest_sha256,
    formal_spec_sha256: fixture.spec.spec_sha256,
    resource_manifest_sha256: fixture.manifest.resource_manifest_sha256,
    schedule_sha256: structural.schedule_sha256,
    code_revision: fixture.spec.code_revision,
    build_artifact_sha256: run.build_artifact_sha256,
    case_count: structural.case_count,
    event_count: structural.event_count,
    request_count: structural.request_count,
  } as OracleGateLedgerRegistryV1;
  const registryStore = {
    async withPinnedLedgerRegistry<T>(pinned: string, keys: ReadonlyMap<string, unknown>, callback: (value: OracleGateLedgerRegistryV1) => Promise<T>): Promise<T> {
      if (pinned !== registrySha) throw new Error("pinned registry mismatch");
      if (!keys.size) throw new Error("trusted registry keys missing");
      return callback(registry);
    },
  } as unknown as FrozenOracleRegistryStore;
  const attestor = {
    async withCurrentSnapshot<T>(expected: string, callback: (value: { snapshot: GoldLedgerSnapshotV1; dataset: SignedGoldDataset; queue: never }) => Promise<T>): Promise<T> {
      if (expected !== fixture.dataset.dataset_sha256) throw new Error("dataset mismatch");
      return callback({ snapshot, dataset: fixture.dataset, queue: {} as never });
    },
  } as unknown as GoldLedgerAttestor;
  const dataDir = await mkdtemp(join(tmpdir(), "oracle-composition-store-"));
  return {
    attestor,
    registry_store: registryStore,
    pinned_registry_sha256: registrySha,
    trusted_registry_public_keys: new Map([["registry-key", generateKeyPairSync("ed25519").publicKey]]),
    root: fixture.root,
    dataset: fixture.dataset,
    manifest: fixture.manifest,
    spec: fixture.spec,
    inventory: fixture.inventory,
    frame_deriver: fixture.video_probe,
    trusted_speech_reviewer_keys: fixture.trusted_speech_reviewer_keys,
    run_store: new FormalOracleRunStore(dataDir),
    run,
    execution_plan: executionPlan,
    system_prompt_bytes: systemPromptBytes,
    user_template_bytes: userTemplateBytes,
    execution_artifacts: artifacts,
    expected_genesis_head: expectedHead,
    initial_checkpoint: initialCheckpoint,
    composed_at: "2026-08-12T04:00:01.000Z",
  };
}

async function buildCompositionFixtureV2(): Promise<ComposeFormalOracleRunGenesisV2Input> {
  const v1 = await buildCompositionFixture();
  const policy: OracleGatePublicEvidenceDerivationPolicyV2 = {
    schema_version:"oracle-gate-public-evidence-derivation-policy-v2",public_evidence_derivation_policy_sha256:"0".repeat(64),claim_projection_version:"response-v1-fixed-json-pointer-assertion-slots-v1",claim_source_paths:["/observed_board_actions/*/operation","/observed_board_actions/*/content","/observed_board_actions/*/region","/generalized_teaching_capability/name","/generalized_teaching_capability/mechanism","/generalized_teaching_capability/action_program/*","/evidence_claims/*/claim"],uncertainty_policy:"not_a_scored_claim",speech_segmentation_version:"one_verified_selected_transcript_unit_per_case-v1",speech_gold_status:"context_not_gold",board_event_renderer_version:"signed-gold-final-event-semantic-projection-v1",board_event_projection:["operation","semantic_label","region","relation","modification"],eligible_evidence_policy:"verified_transcript_plus_all_signed_gold_final_events-v1",board_edit_denominator_policy:"all_signed_gold_final_events-v1",temporal_pair_policy:"all_ordered_signed_gold_final_event_pairs-v1",single_event_temporal_policy:"metric_not_applicable_not_global_block-v1",public_reblinding_scheme:"opaque-item-local-id-uniqueness-only-v1",created_at:"2026-08-12T03:56:00.000Z",api_execution_allowed:false,
  };policy.public_evidence_derivation_policy_sha256=hashOracleGatePublicEvidenceDerivationPolicyV2(policy);
  const statistics: OracleGateStatisticsPlanV2={schema_version:"oracle-gate-statistics-plan-v2",statistics_plan_sha256:"0".repeat(64),record_trust:"non_authoritative_preregistered_statistics_plan",public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,public_evidence_schema_version:"oracle-gate-public-evidence-package-v2",private_derivation_schema_version:"oracle-gate-private-evidence-derivation-receipt-v2",metric_order:["evidence_f1","temporal_fidelity","edit_coverage","unsupported_claim_rate"],strongest_non_oracle_selection_metric:"evidence_f1",strongest_non_oracle_tie_order:["static_final_board","uniform_frame","transcript_only"],item_rater_aggregation:"equal_mean_two_raters",point_aggregation:"case_seed_mean_then_case_macro_then_video_macro_then_teacher_macro",bootstrap_method:"hierarchical_teacher_video_case_seed_paired_v2",bootstrap_seed:71,bootstrap_replicates:1000,primary_ci:.8,descriptive_ci:.95,quantile_method:"sorted_linear_interpolation_r7",missing_policy:"blocked_no_partial_statistics",zero_eligible_policy:"metric_null_and_gate_blocked",single_event_temporal_policy:"exclude_temporal_item_symmetrically_within_case_seed_keep_other_metrics-v1",empty_temporal_population_policy:"blocked_no_temporal_population",minimum_teachers:2,minimum_seeds_per_case:3,created_at:"2026-08-12T03:56:30.000Z",api_execution_allowed:false};statistics.statistics_plan_sha256=hashOracleGateStatisticsPlanV2(statistics);
  const spec: OracleGateFormalSpecV2={...structuredClone(v1.spec),schema_version:"oracle-gate-formal-spec-v2",spec_sha256:"0".repeat(64),created_at:"2026-08-12T03:57:00.000Z",evaluation:{...structuredClone(v1.spec.evaluation),rating_schema_version:"oracle-gate-rating-ledger-v2",bootstrap_seed:statistics.bootstrap_seed,public_evidence_derivation_policy_schema_version:"oracle-gate-public-evidence-derivation-policy-v2",public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,statistics_plan_schema_version:"oracle-gate-statistics-plan-v2",statistics_plan_sha256:statistics.statistics_plan_sha256,public_evidence_schema_version:"oracle-gate-public-evidence-package-v2",private_derivation_schema_version:"oracle-gate-private-evidence-derivation-receipt-v2"}};spec.spec_sha256=hashOracleGateFormalSpecV2(spec);
  const rating:OracleGateRatingPlanV2={schema_version:"oracle-gate-rating-plan-v2",rating_plan_sha256:"0".repeat(64),record_trust:"non_authoritative_preregistered_rating_plan",formal_spec_sha256:spec.spec_sha256,public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,rubric_version:spec.evaluation.rubric_version,rubric_sha256:spec.evaluation.rubric_sha256,required_independent_raters:2,rating_schema_version:"oracle-gate-rating-ledger-v2",public_evidence_schema_version:"oracle-gate-public-evidence-package-v2",private_derivation_schema_version:"oracle-gate-private-evidence-derivation-receipt-v2",metrics:["evidence_f1","temporal_fidelity","edit_coverage","unsupported_claim_rate"],statistics_plan:structuredClone(statistics),statistics_plan_sha256:statistics.statistics_plan_sha256,created_at:"2026-08-12T03:57:30.000Z",api_execution_allowed:false};rating.rating_plan_sha256=hashOracleGateRatingPlanV2(rating);
  const bundle:FormalOraclePreregistrationBundleV2={schema_version:"formal-oracle-preregistration-bundle-v2",preregistration_bundle_sha256:"0".repeat(64),record_trust:"non_authoritative_preregistration_bundle_external_worm_pending",policy,public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,statistics_plan:statistics,statistics_plan_sha256:statistics.statistics_plan_sha256,formal_spec:spec,formal_spec_sha256:spec.spec_sha256,rating_plan:rating,rating_plan_sha256:rating.rating_plan_sha256,api_execution_allowed:false};bundle.preregistration_bundle_sha256=hashFormalOraclePreregistrationBundleV2(bundle);
  const structural=prepareOracleGateFormalStructuralPreflight({dataset:v1.dataset,manifest:v1.manifest,spec});
  const bytes=await prepareOracleGateBytePreflight({root:v1.root,dataset:v1.dataset,manifest:v1.manifest,spec,inventory:v1.inventory,video_probe:v1.frame_deriver,trusted_speech_reviewer_keys:v1.trusted_speech_reviewer_keys});
  const frame=await prepareOracleGateFrameDerivationPreflight({root:v1.root,dataset:v1.dataset,manifest:v1.manifest,spec,inventory:v1.inventory,frame_deriver:v1.frame_deriver,trusted_speech_reviewer_keys:v1.trusted_speech_reviewer_keys});
  const executionPlan:FormalOracleExecutionPlanV1={schema_version:"formal-oracle-execution-plan-v2",execution_plan_sha256:"0".repeat(64),items:structural.schedule.map((scheduleItem,index)=>{const prior=v1.execution_plan.items[index];const artifact=v1.execution_artifacts[index];const verified=bytes.cases.find(item=>item.case_id===scheduleItem.case_id)!;const prompt=renderFormalOracleUserPrompt({prompt_version:spec.prompt.version,user_template_bytes:v1.user_template_bytes,expected_user_template_sha256:spec.prompt.user_template_sha256,selected_transcript_bytes:Buffer.from(verified.speech.selected_transcript,"utf8"),expected_selected_transcript_sha256:verified.speech.selected_transcript_sha256,expected_selected_transcript_byte_length:verified.speech.selected_transcript_byte_length,visual_input_available:scheduleItem.arm!=="transcript_only",output_schema_sha256:spec.prompt.output_schema_sha256});const item={...structuredClone(prior),request_id:scheduleItem.request_id,idempotency_key:scheduleItem.idempotency_key,schedule_index:index,case_id:scheduleItem.case_id,arm:scheduleItem.arm,seed:scheduleItem.seed,user_prompt_sha256:prompt.prompt_sha256,request_envelope_sha256:"0".repeat(64),provider_body_sha256:"0".repeat(64)};const envelope=buildFormalOraclePiRequestEnvelope({request_id:item.request_id,schedule_index:index,case_id:item.case_id,arm:item.arm,model:item.model,system_prompt_bytes:v1.system_prompt_bytes,expected_system_prompt_sha256:item.system_prompt_sha256,user_prompt:prompt,expected_rendered_user_prompt_sha256:item.user_prompt_sha256,expected_user_template_sha256:spec.prompt.user_template_sha256,output_schema_sha256:item.output_schema_sha256,visuals:item.visuals.map((visual,visualIndex)=>({label:visual.label,mime_type:visual.mime_type,bytes:artifact.visual_bytes[visualIndex],expected_sha256:visual.sha256,expected_byte_length:visual.byte_length})),seed:item.seed,temperature:item.temperature,max_input_tokens:item.max_input_tokens,max_output_tokens:item.max_output_tokens,timeout_ms:item.timeout_ms,max_attempts:item.max_attempts,transport:item.transport,cache_retention:item.cache_retention,tools_policy:item.tools_policy});item.request_envelope_sha256=envelope.payload_sha256;item.provider_body_sha256=buildFormalOraclePreparedProviderRequest(envelope).provider_body_sha256;artifact.request_id=item.request_id;return item;})};executionPlan.execution_plan_sha256=hashFormalOracleExecutionPlan(executionPlan);
  const run:FormalRunContractV2={...structuredClone(v1.run),schema_version:"oracle-gate-formal-run-contract-v2",canonicalization:"oracle-gate-run-canonical-json-v2",run_sha256:"0".repeat(64),formal_spec_sha256:spec.spec_sha256,schedule_sha256:structural.schedule_sha256,execution_plan_sha256:executionPlan.execution_plan_sha256,media_attestation_sha256:frame.preflight_sha256,preregistration_bundle_sha256:bundle.preregistration_bundle_sha256,public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,rating_plan_sha256:rating.rating_plan_sha256,statistics_plan_sha256:statistics.statistics_plan_sha256,run_store_uri:"board2skill/formal-oracle/preregistered-run-store-v2"};run.run_sha256=hashFormalRunContractV2(run);
  const checkpoint:RunCheckpointV1={...structuredClone(v1.initial_checkpoint),run_sha256:run.run_sha256,schedule_sha256:run.schedule_sha256,checkpoint_sha256:"0".repeat(64),created_at:"2026-08-12T04:00:00.000Z",entries:executionPlan.items.map(item=>({request_id:item.request_id,idempotency_key:item.idempotency_key,state:"PENDING",resume_action:"dispatch_new_attempt",max_attempts:item.max_attempts,attempts_used:0,active_intent_sha256:null,latest_attempt_audit_sha256:null,committed_request_sha256:null}))};checkpoint.checkpoint_sha256=hashRunCheckpoint(checkpoint);
  const registry = { formal_spec_sha256:spec.spec_sha256,schedule_sha256:structural.schedule_sha256 };
  const registryStore={async withPinnedLedgerRegistry<T>(pinned:string,keys:ReadonlyMap<string,unknown>,callback:(value:OracleGateLedgerRegistryV1)=>Promise<T>):Promise<T>{if(pinned!==v1.pinned_registry_sha256||!keys.size)throw new Error("registry mismatch");return callback({...((await (v1.registry_store as never as {withPinnedLedgerRegistry:<U>(p:string,k:ReadonlyMap<string,unknown>,c:(v:OracleGateLedgerRegistryV1)=>Promise<U>)=>Promise<U>}).withPinnedLedgerRegistry(v1.pinned_registry_sha256,v1.trusted_registry_public_keys,async value=>value))),...registry} as OracleGateLedgerRegistryV1);}} as unknown as FrozenOracleRegistryStore;
  const dataDir=await mkdtemp(join(tmpdir(),"oracle-composition-v2-store-"));
  const {spec:_legacySpec,...common}=v1;
  return {...common,registry_store:registryStore,preregistration_bundle:bundle,run_store:new FormalOraclePreregistrationStoreV2(dataDir),run,execution_plan:executionPlan,expected_genesis_head:{schema_version:"formal-oracle-head-pin-v1",run_sha256:run.run_sha256,generation:0,checkpoint_sha256:checkpoint.checkpoint_sha256},initial_checkpoint:checkpoint};
}

describe("Formal Oracle externally-pinned composition gate", () => {
  it("atomically composes the V2 preregistration DAG and create-once pinned genesis without opening execution", async () => {
    const input=await buildCompositionFixtureV2();let borrowed:Parameters<typeof assertActiveFormalOracleCompositionCapabilityV2>[0]|undefined;let durable!:FormalOracleCompositionAttestationV4;
    const result=await withComposedFormalOraclePreregisteredRunGenesisV2({...input,callback:async(capability)=>{borrowed=capability;durable=structuredClone(capability.attestation);assertActiveFormalOracleCompositionCapabilityV2(capability);expect(capability.attestation).toMatchObject({schema_version:"formal-oracle-composition-attestation-v4",preregistration_bundle_sha256:input.preregistration_bundle.preregistration_bundle_sha256,public_evidence_derivation_policy_sha256:input.preregistration_bundle.public_evidence_derivation_policy_sha256,statistics_plan_sha256:input.preregistration_bundle.statistics_plan_sha256,rating_plan_sha256:input.preregistration_bundle.rating_plan_sha256,preregistration_store_status:"create_once_genesis_reloaded_non_executable",execution_migration_status:"pending_formal_run_store_v2_execution_pipeline",api_execution_allowed:false});expect(capability.head_pin).toEqual(input.expected_genesis_head);expect(()=>JSON.stringify(capability)).toThrow("不得序列化");return capability.attestation.composition_sha256;}});
    expect(result).toMatch(/^[a-f0-9]{64}$/);expect(()=>assertActiveFormalOracleCompositionCapabilityV2(borrowed!)).toThrow(/过期|无效/);
    expect(validateFormalOracleCompositionAttestationV4(durable)).toEqual({valid:true,issues:[]});expect(validateFormalOracleCompositionAttestationV4AgainstRunAndPlan(durable,input.run,input.execution_plan)).toEqual({valid:true,issues:[]});const drift=structuredClone(durable);drift.statistics_plan_sha256="f".repeat(64);drift.composition_sha256=hashFormalOracleCompositionAttestationV4(drift);expect(validateFormalOracleCompositionAttestationV4(drift).valid).toBe(false);
    for(const field of ["execution_plan_sha256","schedule_sha256","media_attestation_sha256","speech_attestation_sha256","ledger_registry_sha256","signed_gold_dataset_sha256","formal_input_manifest_sha256","code_revision","build_artifact_sha256","run_store_uri","request_count"] as const){const changedRun=structuredClone(input.run) as unknown as Record<string,unknown>;changedRun[field]=field==="request_count"?input.run.request_count+1:field==="code_revision"?"f".repeat(40):field==="run_store_uri"?"other/private/store":"f".repeat(64);changedRun.run_sha256=hashFormalRunContractV2(changedRun as unknown as FormalRunContractV2);const changedAttestation=structuredClone(durable);changedAttestation.run_sha256=changedRun.run_sha256 as string;changedAttestation.head_pin.run_sha256=changedRun.run_sha256 as string;changedAttestation.composition_sha256=hashFormalOracleCompositionAttestationV4(changedAttestation);expect(validateFormalOracleCompositionAttestationV4AgainstRunAndPlan(changedAttestation,changedRun as unknown as FormalRunContractV2,input.execution_plan).valid,field).toBe(false);}
    let hits=0;const hostile=Object.create(Object.prototype,Object.getOwnPropertyDescriptors(durable));Object.defineProperty(hostile,"preregistration_bundle",{enumerable:true,get(){hits++;return durable.preregistration_bundle;}});expect(validateFormalOracleCompositionAttestationV4(hostile).valid).toBe(false);expect(hits).toBe(0);
    const snapshot=await input.run_store.inspectPreregisteredGenesis(input.run.run_sha256,input.expected_genesis_head);expect(snapshot.preregistration_bundle).toEqual(input.preregistration_bundle);expect(snapshot.api_execution_allowed).toBe(false);
    await expect(withComposedFormalOraclePreregisteredRunGenesisV2({...input,callback:async()=>"bad"})).rejects.toThrow("create-once");
  },60_000);

  it("rejects V2 composition accessors before execution and stale genesis pins before HEAD creation", async () => {
    const input=await buildCompositionFixtureV2();let hits=0;const hostile=Object.create(Object.prototype,Object.getOwnPropertyDescriptors({...input,callback:async()=>"bad"}));Object.defineProperty(hostile,"preregistration_bundle",{enumerable:true,get(){hits++;return input.preregistration_bundle;}});
    await expect(withComposedFormalOraclePreregisteredRunGenesisV2(hostile)).rejects.toThrow(/data property|plain/);expect(hits).toBe(0);
    const byteHostile=await buildCompositionFixtureV2();const proxied=new Proxy(byteHostile.system_prompt_bytes,{get(target,key,receiver){hits++;return Reflect.get(target,key,receiver);},getPrototypeOf(target){hits++;return Reflect.getPrototypeOf(target);},ownKeys(target){hits++;return Reflect.ownKeys(target);}});byteHostile.system_prompt_bytes=proxied;await expect(withComposedFormalOraclePreregisteredRunGenesisV2({...byteHostile,callback:async()=>"bad"})).rejects.toThrow(/byte input|Uint8Array/);expect(hits).toBe(0);
    class ByteSubclass extends Uint8Array{[Symbol.iterator]():ArrayIterator<number>{hits++;return super[Symbol.iterator]();}}const visualHostile=await buildCompositionFixtureV2();visualHostile.execution_artifacts[1].visual_bytes[0]=new ByteSubclass(visualHostile.execution_artifacts[1].visual_bytes[0]);await withComposedFormalOraclePreregisteredRunGenesisV2({...visualHostile,callback:async()=>undefined});expect(hits).toBe(0);
    const stale=await buildCompositionFixtureV2();stale.expected_genesis_head.checkpoint_sha256="f".repeat(64);await expect(withComposedFormalOraclePreregisteredRunGenesisV2({...stale,callback:async()=>"bad"})).rejects.toThrow(/pin|HEAD/i);await expect(stale.run_store.inspectPreregisteredGenesis(stale.run.run_sha256,{...stale.expected_genesis_head,checkpoint_sha256:stale.initial_checkpoint.checkpoint_sha256})).rejects.toThrow();
  },60_000);

  it("binds the full frozen chain to a create-once all-PENDING genesis while every downstream gate stays closed", async () => {
    const input = await buildCompositionFixture();
    let borrowed: FormalOracleCompositionCapability | undefined;
    const result = await withComposedFormalOracleRunGenesis({
      ...input,
      callback: async (capability) => {
        borrowed = capability;
        assertActiveFormalOracleCompositionCapability(capability);
        expect(() => JSON.stringify(capability)).toThrow("不得序列化");
        expect(capability).toMatchObject({
          stage: "composition_attested_only",
          rights_registry_status: "pending_external_authoritative_head",
          request_envelope_serialization_status: "completed",
          provider_body_serialization_status: "completed_pi_body_serialization_candidate",
          provider_body_transport_compatibility_status: "completed_per_request_local_fake_fetch_proof_non_executable",
          provider_runtime_engine_status: "compatible_runtime_proved_external_capsule_pending",
          user_prompt_derivation_status: "completed",
          input_token_count_receipts_binding_status: "not_supplied",
          input_token_budget_status: "pending_exact_chat_completions_count_authority",
          provider_wire_binding_status: "pending_external_endpoint_account_validation",
          provider_account_endpoint_status: "pending_external_runtime_binding",
          provider_response_capture_status: "pending_strict_sse_capture_contract",
          toolchain_capsule_status: "pending_external_immutable_capsule",
          composition_record_authenticity_status: "pending_external_trusted_signature_or_worm",
          external_head_pin_status: "pending_external_monotonic_worm",
          blind_package_status: "pending",
          statistics_status: "pending",
          api_execution_allowed: false,
        });
        expect(capability.attestation).toMatchObject({
          record_trust: "non_authoritative_composition_record",
          ledger_registry_sha256: input.run.ledger_registry_sha256,
          media_attestation_sha256: input.run.media_attestation_sha256,
          speech_attestation_sha256: input.run.speech_attestation_sha256,
          head_pin: input.expected_genesis_head,
          local_pi_fetch_boundary_proof_count: input.execution_plan.items.length,
        });
        expect(capability.attestation.local_pi_fetch_boundary_proofs.map((proof) => proof.request_id))
          .toEqual(input.execution_plan.items.map((item) => item.request_id));
        expect(new Set(capability.attestation.local_pi_fetch_boundary_proofs.map((proof) => proof.proof.runtime_node_version)))
          .toEqual(new Set([process.version]));
        const verifiedCases = (await prepareOracleGateBytePreflight({ ...input, video_probe: input.frame_deriver })).cases;
        const renderedByCase = new Map<string, Array<{ arm: string; prompt: ReturnType<typeof parseFormalOracleUserPromptBytes> }>>();
        for (const item of input.execution_plan.items) {
          const artifact = input.execution_artifacts[item.schedule_index];
          const visualBytes = artifact.visual_bytes;
          const verifiedCase = verifiedCases.find((candidate) => candidate.case_id === item.case_id)!;
          const promptArtifact = renderFormalOracleUserPrompt({
            prompt_version: input.spec.prompt.version,
            user_template_bytes: input.user_template_bytes,
            expected_user_template_sha256: input.spec.prompt.user_template_sha256,
            selected_transcript_bytes: Buffer.from(verifiedCase.speech.selected_transcript, "utf8"),
            expected_selected_transcript_sha256: verifiedCase.speech.selected_transcript_sha256,
            expected_selected_transcript_byte_length: verifiedCase.speech.selected_transcript_byte_length,
            visual_input_available: visualBytes.length === 1,
            output_schema_sha256: item.output_schema_sha256,
          });
          const prompt = parseFormalOracleUserPromptBytes(promptArtifact.bytes);
          const promptText = new TextDecoder().decode(promptArtifact.bytes);
          expect(promptText).not.toContain(item.case_id);
          expect(promptText).not.toContain(item.request_id);
          expect(promptText).not.toContain(item.arm);
          for (const reviewPackage of input.dataset.packages) for (const group of reviewPackage.groups) {
            for (const event of group.final_events) expect(promptText).not.toContain(event.semantic_label);
          }
          const prior = renderedByCase.get(item.case_id) ?? [];
          prior.push({ arm: item.arm, prompt }); renderedByCase.set(item.case_id, prior);
        }
        for (const prompts of renderedByCase.values()) {
          expect(new Set(prompts.map(({ prompt }) => prompt.selected_transcript))).toHaveLength(1);
          expect(new Set(prompts.map(({ prompt }) => prompt.task_instruction))).toHaveLength(1);
          expect(prompts.filter(({ prompt }) => prompt.evidence_availability["visual-1"])).toHaveLength(9);
          expect(prompts.filter(({ prompt }) => !prompt.evidence_availability["visual-1"])).toHaveLength(3);
        }
        return capability.attestation.composition_sha256;
      },
    });
    expect(result).toMatch(/^[a-f0-9]{64}$/);
    expect(() => assertActiveFormalOracleCompositionCapability(borrowed!)).toThrow("无效、已过期");
    expect(() => assertActiveOracleLedgerCapability(borrowed as never)).toThrow("无效、已过期");
    const snapshot = await input.run_store.inspectRun(input.run.run_sha256, input.expected_genesis_head);
    expect(snapshot.checkpoint.run_state).toBe("SEALED_READY");
    expect(snapshot.checkpoint.entries.every((entry) => entry.state === "PENDING" && entry.attempts_used === 0)).toBe(true);
  }, 30_000);

  it("fails closed before returning a capability on root, bytes, plan, pin, and create-once drift", async () => {
    const registry = await buildCompositionFixture();
    registry.run.ledger_registry_sha256 = "f".repeat(64);
    registry.run.run_sha256 = hashFormalRunContract(registry.run);
    await expect(withComposedFormalOracleRunGenesis({ ...registry, callback: async () => "bad" })).rejects.toThrow(/registry|expected_head|checkpoint/i);

    const payload = await buildCompositionFixture();
    payload.execution_plan.items[0].user_prompt_sha256 = "f".repeat(64);
    payload.execution_plan.execution_plan_sha256 = hashFormalOracleExecutionPlan(payload.execution_plan);
    payload.run.execution_plan_sha256 = payload.execution_plan.execution_plan_sha256;
    payload.run.run_sha256 = hashFormalRunContract(payload.run);
    await expect(withComposedFormalOracleRunGenesis({ ...payload, callback: async () => "bad" })).rejects.toThrow(/prompt|run|checkpoint/i);

    const callerPrompt = await buildCompositionFixture();
    (callerPrompt.execution_artifacts[0] as unknown as Record<string, unknown>).rendered_user_prompt_bytes = Buffer.from("caller-controlled");
    await expect(withComposedFormalOracleRunGenesis({ ...callerPrompt, callback: async () => "bad" })).rejects.toThrow("strict 字段集合");

    const proofRoot = await buildCompositionFixture();
    proofRoot.execution_plan.items[0].provider_body_sha256 = "f".repeat(64);
    proofRoot.execution_plan.execution_plan_sha256 = hashFormalOracleExecutionPlan(proofRoot.execution_plan);
    proofRoot.run.execution_plan_sha256 = proofRoot.execution_plan.execution_plan_sha256;
    proofRoot.run.run_sha256 = hashFormalRunContract(proofRoot.run);
    await expect(withComposedFormalOracleRunGenesis({ ...proofRoot, callback: async () => "bad" })).rejects.toThrow(/provider body|双 hash|proof|run|checkpoint/i);

    const pin = await buildCompositionFixture();
    pin.expected_genesis_head.checkpoint_sha256 = "f".repeat(64);
    await expect(withComposedFormalOracleRunGenesis({ ...pin, callback: async () => "bad" })).rejects.toThrow(/pin|HEAD/i);

    const once = await buildCompositionFixture();
    await withComposedFormalOracleRunGenesis({ ...once, callback: async () => undefined });
    await expect(withComposedFormalOracleRunGenesis({ ...once, callback: async () => "bad" })).rejects.toThrow("create-once");
  }, 60_000);

  it("binds in-memory Responses count receipts per plan item but keeps the current Pi budget gate pending", async () => {
    const input = await buildCompositionFixture();
    const countRequestCaptures = input.execution_plan.items.map((item) => createFormalOracleInputTokenCountRequestCapture({
      schema_version: "formal-oracle-input-token-count-request-capture-v1", record_trust: "non_authoritative_count_request_capture",
      schedule_index: item.schedule_index, request_id: item.request_id, model: item.model, request_envelope_sha256: item.request_envelope_sha256,
      provider_body_sha256: item.provider_body_sha256, max_input_tokens: item.max_input_tokens,
      count_request_entity_sha256: sha(`count-request-entity-${item.schedule_index}`), count_request_entity_byte_length: 100 + item.schedule_index,
      authority_id: "memory-fixture-authority", authority_profile: "openai-responses-input-token-count-v1", authority_version: "fixture-v1",
      counted_transport_profile: "openai-responses-api", captured_at: "2026-08-12T04:00:00.250Z",
      external_endpoint_account_status: "pending_external_runtime_binding", api_execution_allowed: false,
    }));
    const countResponseCaptures = input.execution_plan.items.map((item) => createFormalOracleInputTokenCountResponseCapture({
      schema_version: "formal-oracle-input-token-count-response-capture-v1", record_trust: "non_authoritative_count_response_capture",
      schedule_index: item.schedule_index, request_id: item.request_id, model: item.model,
      count_request_capture_sha256: countRequestCaptures[item.schedule_index].capture_sha256,
      count_response_entity_sha256: sha(`count-response-entity-${item.schedule_index}`), count_response_entity_byte_length: 40 + item.schedule_index,
      exact_input_tokens: item.max_input_tokens - 1, authority_id: "memory-fixture-authority",
      authority_profile: "openai-responses-input-token-count-v1", authority_version: "fixture-v1", received_at: "2026-08-12T04:00:00.500Z",
      external_endpoint_account_status: "pending_external_runtime_binding", api_execution_allowed: false,
    }));
    const receipts = input.execution_plan.items.map((item) => createFormalOracleInputTokenCountReceipt({
      schema_version: "formal-oracle-input-token-count-receipt-v1", record_trust: "non_authoritative_persistent_count_receipt",
      schedule_index: item.schedule_index, request_id: item.request_id, model: item.model,
      request_envelope_sha256: item.request_envelope_sha256, provider_body_sha256: item.provider_body_sha256,
      max_input_tokens: item.max_input_tokens, exact_input_tokens: item.max_input_tokens - 1,
      count_request_capture_sha256: countRequestCaptures[item.schedule_index].capture_sha256,
      count_response_capture_sha256: countResponseCaptures[item.schedule_index].capture_sha256,
      authority_id: "memory-fixture-authority", authority_profile: "openai-responses-input-token-count-v1", authority_version: "fixture-v1",
      counted_transport_profile: "openai-responses-api", execution_transport_profile: "pi-chat-completions",
      transport_equivalence_status: "not_proved_incompatible_request_entity", counted_at: "2026-08-12T04:00:00.500Z",
      external_authority_authenticity_status: "pending_external_endpoint_account_signature_or_worm", api_execution_allowed: false,
    }));
    const receiptSet = createFormalOracleInputTokenCountReceiptSet({
      schema_version: "formal-oracle-input-token-count-receipt-set-v1", record_trust: "non_authoritative_persistent_count_receipt_set",
      execution_plan_sha256: input.execution_plan.execution_plan_sha256, receipt_count: receipts.length, receipts,
      count_request_captures: countRequestCaptures, count_response_captures: countResponseCaptures,
      binding_status: "responses_exact_count_receipts_bound_transport_incompatible",
      current_execution_budget_status: "pending_exact_chat_completions_count_authority",
      external_authority_authenticity_status: "pending_external_endpoint_account_signature_or_worm",
      external_persistence_status: "pending_external_monotonic_worm", api_execution_allowed: false,
    });
    await withValidatedFormalOracleInputTokenCountReceiptSet({
      receipt_set: receiptSet, execution_plan: input.execution_plan,
      callback: async (countCapability) => withComposedFormalOracleRunGenesis({
        ...input, input_token_count_receipt_capability: countCapability,
        callback: async (capability) => {
          expect(capability.input_token_count_receipts_binding_status).toBe("responses_exact_count_receipts_bound_transport_incompatible");
          expect(capability.input_token_budget_status).toBe("pending_exact_chat_completions_count_authority");
          expect(capability.attestation.input_token_count_receipt_set_sha256).toBe(receiptSet.receipt_set_sha256);
          expect(capability.api_execution_allowed).toBe(false);
        },
      }),
    });
  }, 30_000);

  it("rejects an input-token receipt capability that expires before the run-store lock callback", async () => {
    const input = await buildCompositionFixture();
    let release!: () => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const originalProbe = input.frame_deriver.probe.bind(input.frame_deriver);
    input.frame_deriver.probe = async (path) => { entered(); await paused; return originalProbe(path); };
    const item = input.execution_plan.items[0];
    const requestCapture = createFormalOracleInputTokenCountRequestCapture({
      schema_version: "formal-oracle-input-token-count-request-capture-v1", record_trust: "non_authoritative_count_request_capture",
      schedule_index: item.schedule_index, request_id: item.request_id, model: item.model, request_envelope_sha256: item.request_envelope_sha256,
      provider_body_sha256: item.provider_body_sha256, max_input_tokens: item.max_input_tokens, count_request_entity_sha256: sha("expire-request"),
      count_request_entity_byte_length: 100, authority_id: "memory-fixture-authority", authority_profile: "openai-responses-input-token-count-v1",
      authority_version: "fixture-v1", counted_transport_profile: "openai-responses-api", captured_at: "2026-08-12T04:00:00.250Z",
      external_endpoint_account_status: "pending_external_runtime_binding", api_execution_allowed: false,
    });
    const responseCapture = createFormalOracleInputTokenCountResponseCapture({
      schema_version: "formal-oracle-input-token-count-response-capture-v1", record_trust: "non_authoritative_count_response_capture",
      schedule_index: item.schedule_index, request_id: item.request_id, model: item.model, count_request_capture_sha256: requestCapture.capture_sha256,
      count_response_entity_sha256: sha("expire-response"), count_response_entity_byte_length: 40, exact_input_tokens: item.max_input_tokens - 1,
      authority_id: "memory-fixture-authority", authority_profile: "openai-responses-input-token-count-v1", authority_version: "fixture-v1",
      received_at: "2026-08-12T04:00:00.500Z", external_endpoint_account_status: "pending_external_runtime_binding", api_execution_allowed: false,
    });
    const receipt = createFormalOracleInputTokenCountReceipt({
      schema_version: "formal-oracle-input-token-count-receipt-v1", record_trust: "non_authoritative_persistent_count_receipt",
      schedule_index: item.schedule_index, request_id: item.request_id, model: item.model, request_envelope_sha256: item.request_envelope_sha256,
      provider_body_sha256: item.provider_body_sha256, max_input_tokens: item.max_input_tokens, exact_input_tokens: item.max_input_tokens - 1,
      count_request_capture_sha256: requestCapture.capture_sha256, count_response_capture_sha256: responseCapture.capture_sha256,
      authority_id: "memory-fixture-authority", authority_profile: "openai-responses-input-token-count-v1", authority_version: "fixture-v1",
      counted_transport_profile: "openai-responses-api", execution_transport_profile: "pi-chat-completions",
      transport_equivalence_status: "not_proved_incompatible_request_entity", counted_at: "2026-08-12T04:00:00.500Z",
      external_authority_authenticity_status: "pending_external_endpoint_account_signature_or_worm", api_execution_allowed: false,
    });
    const plan = { execution_plan_sha256: input.execution_plan.execution_plan_sha256, items: [item] };
    const receiptSet = createFormalOracleInputTokenCountReceiptSet({
      schema_version: "formal-oracle-input-token-count-receipt-set-v1", record_trust: "non_authoritative_persistent_count_receipt_set",
      execution_plan_sha256: plan.execution_plan_sha256, receipt_count: 1, count_request_captures: [requestCapture], count_response_captures: [responseCapture], receipts: [receipt],
      binding_status: "responses_exact_count_receipts_bound_transport_incompatible", current_execution_budget_status: "pending_exact_chat_completions_count_authority",
      external_authority_authenticity_status: "pending_external_endpoint_account_signature_or_worm", external_persistence_status: "pending_external_monotonic_worm", api_execution_allowed: false,
    });
    let pending!: Promise<unknown>;
    await withValidatedFormalOracleInputTokenCountReceiptSet({ receipt_set: receiptSet, execution_plan: plan, callback: async (capability) => {
      pending = withComposedFormalOracleRunGenesis({ ...input, input_token_count_receipt_capability: capability, callback: async () => undefined });
      await started;
    }});
    release();
    await expect(pending).rejects.toThrow("已过期");
  }, 30_000);

  it("snapshots caller-owned JSON, bytes and key maps before asynchronous verification", async () => {
    const input = await buildCompositionFixture();
    const originalProbe = input.frame_deriver.probe.bind(input.frame_deriver);
    let release!: () => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    input.frame_deriver.probe = async (path) => { entered(); await paused; return originalProbe(path); };
    const pending = withComposedFormalOracleRunGenesis({ ...input, callback: async (capability) => capability.attestation.run_sha256 });
    await started;
    input.manifest.cases[0].source_video_id = "caller-mutated";
    input.system_prompt_bytes.fill(0);
    input.execution_artifacts[0].visual_bytes[0]?.fill(0);
    (input.trusted_speech_reviewer_keys as Map<string, KeyLike>).clear();
    release();
    await expect(pending).resolves.toBe(input.run.run_sha256);
  }, 30_000);
});
