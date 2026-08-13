import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const extensionUri = "research/board2skill/ERASE_PERSISTENCE_EXTENSION_V1.json";
const policyUri = "research/board2skill/ERASE_PERSISTENCE_POLICY_V1.md";
const outputs = {
  kg003: "research/board2skill/KG003_ERASE_AB2_ADJUDICATION_INPUT_4420_4428_V2.json",
  kg005: "research/board2skill/KG005_ERASE_ADD_AB_ADJUDICATION_INPUT_1888_1908_V2.json",
};
const checkOnly = process.argv.includes("--check");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function verifiedBytes(uri, expectedSha256, expectedLength) {
  const bytes = await readFile(resolve(root, uri));
  if (sha256(bytes) !== expectedSha256) throw new Error(`SHA-256 mismatch: ${uri}`);
  if (expectedLength !== undefined && bytes.byteLength !== expectedLength) throw new Error(`byte length mismatch: ${uri}`);
  const info = await stat(resolve(root, uri));
  if (!info.isFile()) throw new Error(`not a regular file: ${uri}`);
  return bytes;
}

function extensionEvidence(caseRecord, prefix) {
  return caseRecord.frames.map((frame, index) => ({
    evidence_id: `${prefix}-EXT-${String(index + 1).padStart(2, "0")}`,
    side: "source_extension",
    kind: frame.role,
    label: frame.observation,
    path: frame.asset_uri,
    sha256: frame.sha256,
  }));
}

function sourceProvenance(extensionSha256, caseRecord) {
  return {
    source_intake_uri: caseRecord.source_intake_uri,
    source_intake_sha256: caseRecord.source_intake_sha256,
    persistence_extension_uri: extensionUri,
    persistence_extension_sha256: extensionSha256,
    persistence_policy_uri: policyUri,
    persistence_policy_sha256: caseRecord.persistence_policy_sha256,
    source_video_uri: caseRecord.source_video_uri,
    source_video_sha256: caseRecord.source_video_sha256,
  };
}

const extensionBytes = await readFile(resolve(root, extensionUri));
const extensionSha256 = sha256(extensionBytes);
const extension = JSON.parse(extensionBytes.toString("utf8"));
if (extension.schema_version !== "board2skill-erase-persistence-extension-v1") throw new Error("unexpected extension schema");
if (extension.accepted !== false || extension.gold_decision_created !== false) throw new Error("extension must remain machine pre-review only");
if (extension.cases.length !== 2) throw new Error("expected exactly two persistence cases");

const policyBytes = await verifiedBytes(policyUri, extension.policy.persistence_policy_sha256);
if (policyBytes.byteLength === 0) throw new Error("empty persistence policy");

for (const caseRecord of extension.cases) {
  caseRecord.persistence_policy_sha256 = extension.policy.persistence_policy_sha256;
  await verifiedBytes(caseRecord.source_video_uri, caseRecord.source_video_sha256, caseRecord.source_video_byte_length);
  await verifiedBytes(caseRecord.source_intake_uri, caseRecord.source_intake_sha256);
  for (const frame of caseRecord.frames) await verifiedBytes(frame.asset_uri, frame.sha256, frame.byte_length);
}

const kg003Case = extension.cases.find((item) => item.source_video_id === "phy-force-kunge-003");
const kg005Case = extension.cases.find((item) => item.source_video_id === "phy-force-kunge-005");
if (!kg003Case || !kg005Case) throw new Error("missing expected persistence case");
if (kg003Case.frames.length !== 8 || kg005Case.frames.length !== 11) throw new Error("unexpected extension frame denominator");
if (kg005Case.candidate_event_window_seconds.end_min !== 1905 || kg005Case.candidate_event_window_seconds.end_max !== 1905) {
  throw new Error("KG005 first-full-absence boundary must be exactly 1905.000");
}

const kg003 = JSON.parse((await verifiedBytes(kg003Case.source_intake_uri, kg003Case.source_intake_sha256)).toString("utf8"));
kg003.schema_version = "board2skill-ab2-adjudication-intake-v2";
kg003.package_id = "kg003-erase-ab2-4422-4428-persistence-v2";
kg003.source_intake_provenance = sourceProvenance(extensionSha256, kg003Case);
kg003.persistence_extension = {
  case_id: kg003Case.case_id,
  status: "machine_persistence_evidence_complete_human_adjudication_pending",
  original_censoring: kg003Case.original_censoring,
  candidate_event_window_seconds: kg003Case.candidate_event_window_seconds,
  extended_before_interval_seconds: kg003Case.extended_before_interval_seconds,
  extended_after_interval_seconds: kg003Case.extended_after_interval_seconds,
  frame_count: kg003Case.frames.length,
};
kg003.critical_evidence_links.persistence_extension = extensionEvidence(kg003Case, "KG003-ERASE");
kg003.governance.gold_block_reasons = [
  "event decision review pending",
  "exact temporal boundary review pending",
  "exact erased glyph transcription review pending",
  "required signoffs pending",
];
for (const gate of kg003.review_gates) {
  if (["before_left_censor", "after_stability", "erase_persistence"].includes(gate.gate)) {
    gate.status = "source_extension_available_pending_human_confirmation";
    gate.notes = `See ${extensionUri}#${kg003Case.case_id}`;
  }
}
for (const issue of kg003.alignment.pairs[0].review_disagreements) {
  if (issue.issue_id === "before_left_censor_policy") {
    issue.status = "evidence_resolved";
    issue.resolution = "The frozen 2.0-second policy governs; source frames at 4420.0, 4421.0, and 4422.5 close the left-censored before-state blocker.";
    issue.question = "No policy choice remains. Human review is limited to exact visible semantics and event boundaries.";
  }
  if (issue.issue_id === "erase_persistence_horizon") {
    issue.status = "evidence_resolved";
    issue.resolution = "Source frames from 4424.933 through 4427.0 satisfy the frozen 2.0-second after-state evidence gate.";
    issue.question = "No persistence-threshold choice remains. Human review is limited to exact first-full-absence interpretation and event boundary.";
  }
}

const kg005 = JSON.parse((await verifiedBytes(kg005Case.source_intake_uri, kg005Case.source_intake_sha256)).toString("utf8"));
kg005.schema_version = "temporal-board-v2-ab-adjudication-input-v2";
kg005.package_id = "kg005-erase-add-ab-1888-1905-persistence-v2";
kg005.source_intake_provenance = sourceProvenance(extensionSha256, kg005Case);
kg005.persistence_extension = {
  case_id: kg005Case.case_id,
  status: "machine_persistence_evidence_complete_human_adjudication_pending",
  original_censoring: kg005Case.original_censoring,
  candidate_event_window_seconds: kg005Case.candidate_event_window_seconds,
  extended_before_interval_seconds: kg005Case.extended_before_interval_seconds,
  extended_after_interval_seconds: kg005Case.extended_after_interval_seconds,
  frame_count: kg005Case.frames.length,
};
const kg005Terminal = kg005.items.find((item) => item.group_id === "KG005-AB-003");
if (!kg005Terminal) throw new Error("missing KG005 terminal group");
kg005Terminal.alignment_class = "matched_operation_disagreement_persistence_extended_unadjudicated";
kg005Terminal.alignment_window.end = 1905;
kg005Terminal.evidence_assets.push(...extensionEvidence(kg005Case, "KG005-AB-003"));
const kg005Candidate = kg005Terminal.proposal.candidate_events[0];
kg005Candidate.time.end = 1905;
kg005Candidate.semantic_label = "terminal disappearance of the new formula with source-video persistence evidence; operation remains for human adjudication";
kg005Candidate.acceptance_ready = false;
kg005Candidate.acceptance_blockers = ["操作类型尚未由人工确定"];
kg005Terminal.unresolved_fields = [
  "operation",
  "exact_start_boundary",
  "exact_visible_semantic_transcription",
  "region_coordinates_require_surface-aware_review",
];
kg005Terminal.operation_disagreement.blocker = "操作类型尚未由人工确定；源视频扩展只关闭 after-state persistence 截断";
kg005.decision_gate.paper_gold_block_reason = "All candidates require human review and signoff; KG005-AB-003 now has source-video persistence evidence but its final operation and exact event remain unadjudicated.";
const kg005CandidateRecord = kg005.candidates.find((item) => item.alignment_id === "KG005-AB-003");
if (!kg005CandidateRecord) throw new Error("missing KG005 terminal candidate record");
kg005CandidateRecord.right_censored = false;
kg005CandidateRecord.persistence_extension_status = "source_extension_evidence_resolved";
kg005CandidateRecord.annotator_a.uncertainty = "original A operation remains unknown; after-state persistence is now verified by the source extension";
kg005CandidateRecord.annotator_b.uncertainty = "original B operation remains unadjudicated; after-state persistence is now verified by the source extension";
kg005CandidateRecord.disagreement.annotator_a_position = "unknown operation retained from the immutable parent annotation; persistence is no longer the blocker";
kg005CandidateRecord.disagreement.annotator_b_position = "erase proposed from visible removal; persistence is now verified but operation remains for human adjudication";
kg005CandidateRecord.disagreement.persistence_status = "evidence_resolved";
kg005CandidateRecord.review_note = "The source-video extension closes right-censor persistence only. Human review must still decide operation, exact boundary, semantics, and region.";
kg005Terminal.a_side.events[0].visual_candidate_label = "terminal disappearance of the new formula with source-video persistence evidence; operation remains unknown";
for (const evidence of kg005Terminal.evidence_assets) {
  if (evidence.evidence_id === "KG005-AB-003-A-AFTER") {
    evidence.label = "A original clip-end blank observation; persistence is extended by the source_extension assets";
  }
  if (evidence.evidence_id === "KG005-AB-003-B-AFTER") {
    evidence.label = "B original clip-end blank observation; persistence is extended by the source_extension assets";
  }
}
kg005.warnings = kg005.warnings.map((warning) => warning === "The right-censored A=unknown versus B=ERASE disagreement is intentionally unresolved."
  ? "The source extension resolves after-state persistence; the A=unknown versus B=ERASE operation disagreement remains intentionally unresolved."
  : warning);

for (const [key, value] of Object.entries({ kg003, kg005 })) {
  const output = `${JSON.stringify(value, null, 2)}\n`;
  if (checkOnly) {
    const current = await readFile(resolve(root, outputs[key]), "utf8");
    if (current !== output) throw new Error(`generated intake drift: ${outputs[key]}`);
  } else {
    await writeFile(resolve(root, outputs[key]), output, { encoding: "utf8", mode: 0o644 });
  }
  process.stdout.write(`${outputs[key]} ${Buffer.byteLength(output)} ${sha256(output)}\n`);
}
