import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalGoldReviewDecisionSignaturePayload,
  canonicalGoldReviewPackageSignoffSignaturePayload,
  canonicalOracleGateFormalInputPayload,
  canonicalOracleGateFormalSpecPayload,
  canonicalSignedGoldDatasetPayload,
  deriveSignedGoldLessonsV2,
  deriveSignedGoldVisualEvidenceIdV2,
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
  FORMAL_ORACLE_USER_PROMPT_VERSION,
  ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  type GoldReviewDecisionRecord,
  type GoldReviewEvent,
  type OracleGateFormalInputManifest,
  type OracleGateFormalSpec,
  type SignedGoldDataset,
} from "../../contracts/src/index.js";
import {
  deriveOracleGateFormalCaseId,
  prepareOracleGateFormalStructuralPreflight,
} from "./oracleFormalPreflight.js";

const HASH = "a".repeat(64);

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function packageFixture(index: number, eventOffset: number) {
  const packageId = `package-${index}`;
  const sourceVideoId = `video-${index}`;
  const groupId = `G${String(index).padStart(2, "0")}`;
  const events: GoldReviewEvent[] = Array.from({ length: 15 }, (_, eventIndex) => ({
    event_id: `event-${String(eventOffset + eventIndex + 1).padStart(2, "0")}`,
    source_event_refs: [`a-${eventIndex + 1}`, `b-${eventIndex + 1}`],
    operation: (["ADD", "ERASE", "MODIFY", "CONNECT"] as const)[(eventOffset + eventIndex) % 4],
    time: { start: eventIndex * 2, end: eventIndex * 2 + 1 },
    semantic_label: `新增可见板书 ${eventOffset + eventIndex + 1}`,
    region: null,
    relation: (eventOffset + eventIndex) % 4 === 3 ? { source_object_ids: [`source-${eventIndex}`], target_object_ids: [`target-${eventIndex}`], relation_type: "connects" } : null,
    modification: (eventOffset + eventIndex) % 4 === 2 ? { old_object_ids: [`old-${eventIndex}`], new_object_ids: [`new-${eventIndex}`], semantic_slot: `slot-${eventIndex}`, change_description: "同一语义槽发生可见改变" } : null,
  }));
  const decisionBase: Omit<GoldReviewDecisionRecord, "signature_sha256"> = {
    schema_version: "gold-review-decision-v1",
    package_id: packageId,
    group_id: groupId,
    revision: 1,
    parent_signature_sha256: null,
    source_intake_sha256: index === 1 ? "b".repeat(64) : "c".repeat(64),
    disposition: "accept",
    selected_candidate_ids: events.map((item) => item.event_id),
    final_events: events,
    adjudicator_id: `visual-${index}`,
    adjudicator_role: "visual-reviewer",
    rationale: "逐事件检查 before/delta/after 后确认。",
    decided_at: `2026-08-12T00:0${index}:00.000Z`,
  };
  const decision: GoldReviewDecisionRecord = {
    ...decisionBase,
    signature_sha256: digest(canonicalGoldReviewDecisionSignaturePayload(decisionBase)),
  };
  const signoff = (role: "visual_adjudicator" | "physics_reviewer", suffix: string) => {
    const base = {
      schema_version: "gold-review-package-signoff-v1" as const,
      package_id: packageId,
      signoff_role: role,
      source_intake_sha256: decision.source_intake_sha256,
      source_window: { start: 10 + index, end: 12 + index },
      decision_signatures: [decision.signature_sha256],
      adjudicator_id: `${suffix}-${index}`,
      adjudicator_role: role,
      statement: "确认视觉与物理证据以及最终事件。",
      signed_at: role === "visual_adjudicator" ? "2026-08-12T01:00:00.000Z" : "2026-08-12T01:01:00.000Z",
    };
    return { ...base, signature_sha256: digest(canonicalGoldReviewPackageSignoffSignaturePayload(base)) };
  };
  const evidenceId = deriveSignedGoldVisualEvidenceIdV2({ package_id: packageId, group_id: groupId, source_evidence_id: `comparison-${index}`, side: "shared", kind: "comparison", asset_uri: `assets/comparison-${index}.png`, sha256: index === 1 ? "d".repeat(64) : "e".repeat(64) }, digest);
  return {
    package: {
      package_id: packageId,
      source_video_id: sourceVideoId,
      source_intake_uri: `research/intake-${index}.json`,
      source_intake_sha256: decision.source_intake_sha256,
      source_window: { start: 10 + index, end: 12 + index },
      reviewed_group_count: 1,
      accepted_group_count: 1,
      accepted_event_count: events.length,
      decision_signatures: [decision.signature_sha256],
      decisions: [decision],
      signoffs: [signoff("visual_adjudicator", "visual"), signoff("physics_reviewer", "physics")],
      groups: [{
        group_id: groupId,
        alignment_class: "matched",
        decision_signature_sha256: decision.signature_sha256,
        decision_revision: 1,
        final_events: events,
        canonical_visual_evidence_id: evidenceId,
        visual_evidence: [{
          evidence_id: evidenceId,
          source_evidence_id: `comparison-${index}`,
          side: "shared",
          kind: "comparison",
          label: "before/delta/after",
          asset_uri: `assets/comparison-${index}.png`,
          sha256: index === 1 ? "d".repeat(64) : "e".repeat(64),
          mime_type: "image/png" as const,
          width: 1920,
          height: 360,
          byte_length: 4096,
        }],
        speech_context: { text: "老师解释板书变化。", status: "context_not_gold" as const },
      }],
    },
    events,
    groupId,
    sourceVideoId,
  };
}

function dataset(): SignedGoldDataset {
  const first = packageFixture(1, 0);
  const second = packageFixture(2, 15);
  const packages = [first.package, second.package];
  const payload = {
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
    packages,
    lessons: deriveSignedGoldLessonsV2(packages, digest),
  };
  const datasetSha256 = digest(canonicalSignedGoldDatasetPayload(payload));
  return { dataset_id: `signed-gold-${datasetSha256.slice(0, 16)}`, dataset_sha256: datasetSha256, ...payload };
}

function formalInput(signed: SignedGoldDataset): OracleGateFormalInputManifest {
  const sources = signed.packages.map((item, index) => ({
    source_video_id: item.source_video_id,
    teacher_id: `teacher-${index + 1}`,
    board_mode: index === 0 ? "physical_chalkboard" as const : "digital_ink" as const,
    data_split: "development" as const,
    rights_status: "internal_review_only" as const,
    teacher_only_recording: true as const,
    resource_manifest_entry_sha256: index === 0 ? "1".repeat(64) : "2".repeat(64),
    withdrawal_key: `teacher-${index + 1}`,
  }));
  const cases = signed.packages.map((reviewPackage, index) => {
    const group = reviewPackage.groups[0];
    const start = Math.min(...group.final_events.map((item) => item.time.start));
    const end = Math.max(...group.final_events.map((item) => item.time.end));
    return {
      case_id: deriveOracleGateFormalCaseId({
        dataset_sha256: signed.dataset_sha256,
        package_id: reviewPackage.package_id,
        group_id: group.group_id,
      }),
      package_id: reviewPackage.package_id,
      group_id: group.group_id,
      source_video_id: reviewPackage.source_video_id,
      event_ids: group.final_events.map((item) => item.event_id),
      event_window: { start, end },
      speech: {
        schema_version: "signed-speech-alignment-v1" as const,
        ledger_uri: `speech/ledger-${index + 1}.json`,
        ledger_sha256: index === 0 ? "3".repeat(64) : "4".repeat(64),
        segment_ids: [`segment-${index + 1}`],
        transcript_sha256: index === 0 ? "5".repeat(64) : "6".repeat(64),
        status: "signed_alignment" as const,
      },
      static_final: {
        asset_uri: `assets/static-${index + 1}.png`, sha256: "7".repeat(64), mime_type: "image/png" as const,
        width: 1280, height: 720, byte_length: 4096, source_frame_id: `after-${index + 1}`, timestamp: end,
        selection_rule_version: "stable-after-v1",
      },
      uniform_frame: {
        asset_uri: `assets/uniform-${index + 1}.png`, sha256: "8".repeat(64), mime_type: "image/png" as const,
        width: 1280, height: 720, byte_length: 4096, timestamp: start, selection_rule_version: "uniform-in-window-v1",
      },
      oracle_comparison_evidence_id: group.canonical_visual_evidence_id,
      difficulty_tags: index === 0 ? ["teacher_occlusion"] : ["digital_ink"],
    };
  });
  const draft = {
    schema_version: "oracle-gate-formal-input-v1" as const,
    manifest_sha256: HASH,
    signed_gold_dataset_sha256: signed.dataset_sha256,
    resource_manifest_sha256: "9".repeat(64),
    created_at: "2026-08-12T03:00:00.000Z",
    sources,
    cases,
  };
  draft.manifest_sha256 = digest(canonicalOracleGateFormalInputPayload(draft));
  return draft;
}

function spec(input: OracleGateFormalInputManifest): OracleGateFormalSpec {
  const draft: OracleGateFormalSpec = {
    schema_version: "oracle-gate-formal-spec-v1",
    spec_sha256: HASH,
    input_manifest_sha256: input.manifest_sha256,
    signed_gold_dataset_sha256: input.signed_gold_dataset_sha256,
    code_revision: "a".repeat(40),
    model: "vision-fixture",
    transport: "pi",
    cache_retention: "none",
    tools_policy: "none",
    temperature: 0,
    seeds: [11, 23, 47],
    prompt: {
      version: FORMAL_ORACLE_USER_PROMPT_VERSION,
      system_sha256: "a".repeat(64),
      user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
      output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
    },
    budget: {
      max_input_tokens: 8192,
      max_output_tokens: 2048,
      visual_items_per_visual_arm: 1,
      canvas: { mime_type: "image/jpeg", width: 1920, height: 360, quality: 88 },
      timeout_ms: 120_000,
      max_attempts: 2,
    },
    evaluation: {
      rubric_version: "oracle-gate-rubric-v1",
      rubric_sha256: "d".repeat(64),
      rating_schema_version: "oracle-gate-rating-v1",
      independent_raters: 2,
      primary_ci: 0.8,
      descriptive_ci: 0.95,
      bootstrap_seed: 20260812,
      strongest_non_oracle_rule: "best_pre_registered_non_oracle_on_development",
      missing_request_policy: "fail_closed_no_partial_decision",
    },
  };
  draft.spec_sha256 = digest(canonicalOracleGateFormalSpecPayload(draft));
  return draft;
}

function rehashManifest(input: OracleGateFormalInputManifest): void {
  input.manifest_sha256 = digest(canonicalOracleGateFormalInputPayload(input));
}

function rehashSpec(input: OracleGateFormalSpec): void {
  input.spec_sha256 = digest(canonicalOracleGateFormalSpecPayload(input));
}

function resignDataset(input: SignedGoldDataset): SignedGoldDataset {
  const signed = structuredClone(input);
  for (const reviewPackage of signed.packages) {
    for (const decision of reviewPackage.decisions) {
      decision.signature_sha256 = digest(canonicalGoldReviewDecisionSignaturePayload(decision));
      const group = reviewPackage.groups.find((item) => item.group_id === decision.group_id);
      if (group) {
        group.decision_signature_sha256 = decision.signature_sha256;
        group.final_events = structuredClone(decision.final_events);
      }
    }
    reviewPackage.decision_signatures = reviewPackage.decisions.map((item) => item.signature_sha256).sort();
    reviewPackage.signoffs.forEach((signoff) => {
      signoff.decision_signatures = [...reviewPackage.decision_signatures];
      signoff.signature_sha256 = digest(canonicalGoldReviewPackageSignoffSignaturePayload(signoff));
    });
  }
  signed.lessons = deriveSignedGoldLessonsV2(signed.packages, digest);
  signed.lesson_count = signed.lessons.length;
  signed.dataset_sha256 = digest(canonicalSignedGoldDatasetPayload(signed));
  signed.dataset_id = `signed-gold-${signed.dataset_sha256.slice(0, 16)}`;
  return signed;
}

describe("Formal Oracle Gate structural preflight", () => {
  it("derives a complete deterministic schedule but keeps API execution closed", () => {
    const signed = dataset();
    const manifest = formalInput(signed);
    const frozenSpec = spec(manifest);
    const result = prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest, spec: frozenSpec });
    expect(result).toMatchObject({
      status: "untrusted_structure_valid",
      api_execution_allowed: false,
      case_count: 2,
      event_count: 30,
      teacher_count: 2,
      multi_edit_window_count: 2,
      seed_count: 3,
      request_count: 24,
      operation_counts: { ADD: 8, ERASE: 8, MODIFY: 7, CONNECT: 7 },
    });
    expect(new Set(result.schedule.map((item) => item.request_id))).toHaveLength(24);
    expect(new Set(result.schedule.map((item) => item.idempotency_key))).toHaveLength(24);
    const again = prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest, spec: frozenSpec });
    expect(again.schedule_sha256).toBe(result.schedule_sha256);
  });

  it("rejects self-reported teacher diversity and missing Signed Gold groups", () => {
    const signed = dataset();
    const manifest = formalInput(signed);
    manifest.sources[1].teacher_id = manifest.sources[0].teacher_id;
    rehashManifest(manifest);
    const frozenSpec = spec(manifest);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest, spec: frozenSpec })).toThrow("至少需要两位教师");

    const missing = formalInput(signed);
    missing.cases.pop();
    rehashManifest(missing);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest: missing, spec: spec(missing) })).toThrow("缺少 Signed Gold group");
  });

  it("rejects context, protocol, and dataset drift before any runner exists", () => {
    const signed = dataset();
    const manifest = formalInput(signed);
    const badCase = structuredClone(manifest);
    badCase.cases[0].event_ids.reverse();
    rehashManifest(badCase);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest: badCase, spec: spec(badCase) })).toThrow("签字顺序精确覆盖");

    const frozenSpec = spec(manifest);
    frozenSpec.seeds = [1, 2];
    rehashSpec(frozenSpec);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest, spec: frozenSpec })).toThrow("0..2^32-1");

    const shortRevision = spec(manifest);
    shortRevision.code_revision = "a7815d3";
    rehashSpec(shortRevision);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest, spec: shortRevision })).toThrow("完整小写 Git commit");

    const tampered = structuredClone(signed);
    tampered.packages[0].groups[0].final_events[0].semantic_label = "被篡改";
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: tampered, manifest, spec: spec(manifest) })).toThrow("签字链无效");
  });

  it("does not let Static-Final, Uniform, and Oracle silently reuse the same declared source SHA", () => {
    const signed = dataset();
    const manifest = formalInput(signed);
    manifest.cases[0].uniform_frame.sha256 = manifest.cases[0].static_final.sha256;
    rehashManifest(manifest);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest, spec: spec(manifest) })).toThrow("Static-Final 与 Uniform 不得复用");

    const oracleReuse = formalInput(signed);
    oracleReuse.cases[0].static_final.sha256 = signed.packages[0].groups[0].visual_evidence[0].sha256;
    rehashManifest(oracleReuse);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest: oracleReuse, spec: spec(oracleReuse) })).toThrow("不得复用 Oracle comparison");
  });

  it("rejects post-hoc identity tricks, negative seeds, deep encoding, and atomic operations without order", () => {
    const signed = dataset();
    const identity = formalInput(signed);
    identity.sources[1].teacher_id = `${identity.sources[0].teacher_id}\u200b`;
    identity.sources[1].withdrawal_key = identity.sources[0].withdrawal_key;
    rehashManifest(identity);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest: identity, spec: spec(identity) })).toThrow("规范化小写教师标识");

    const encoded = formalInput(signed);
    encoded.cases[0].speech.ledger_uri = `${"%25".repeat(17)}2e`;
    rehashManifest(encoded);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest: encoded, spec: spec(encoded) })).toThrow("受控相对路径");

    const negativeSeed = spec(formalInput(signed));
    negativeSeed.seeds = [-1, 2, 3];
    rehashSpec(negativeSeed);
    const negativeManifest = formalInput(signed);
    negativeSeed.input_manifest_sha256 = negativeManifest.manifest_sha256;
    rehashSpec(negativeSeed);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest: negativeManifest, spec: negativeSeed })).toThrow("0..2^32-1");

    const negativeBootstrap = spec(negativeManifest);
    negativeBootstrap.evaluation.bootstrap_seed = -1;
    rehashSpec(negativeBootstrap);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest: negativeManifest, spec: negativeBootstrap })).toThrow("evaluation.bootstrap_seed");

    const atomicDraft = structuredClone(signed);
    atomicDraft.packages[0].decisions[0].final_events[0].operation = "atomic_ERASE+ADD";
    const atomic = resignDataset(atomicDraft);
    const atomicManifest = formalInput(atomic);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: atomic, manifest: atomicManifest, spec: spec(atomicManifest) })).toThrow("必须在签字数据中展开为两个有序事件");
  });

  it("requires stable time order, post-event Static-Final, and all four typed operations", () => {
    const signed = dataset();
    const reverseDraft = structuredClone(signed);
    reverseDraft.packages[0].decisions[0].final_events.reverse();
    reverseDraft.packages[0].decisions[0].selected_candidate_ids.reverse();
    const reverse = resignDataset(reverseDraft);
    const reverseManifest = formalInput(reverse);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: reverse, manifest: reverseManifest, spec: spec(reverseManifest) })).toThrow("不是稳定时间顺序");

    const earlyStatic = formalInput(signed);
    earlyStatic.cases[0].static_final.timestamp = earlyStatic.cases[0].event_window.end - 0.01;
    rehashManifest(earlyStatic);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: signed, manifest: earlyStatic, spec: spec(earlyStatic) })).toThrow("事件结束后的稳定板书");

    const allAddDraft = structuredClone(signed);
    allAddDraft.packages.forEach((reviewPackage) => reviewPackage.decisions.forEach((decision) => decision.final_events.forEach((event) => {
      event.operation = "ADD";
      event.relation = null;
      event.modification = null;
    })));
    const allAdd = resignDataset(allAddDraft);
    const allAddManifest = formalInput(allAdd);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: allAdd, manifest: allAddManifest, spec: spec(allAddManifest) })).toThrow("当前缺少 ERASE, MODIFY, CONNECT");

    const oversizedDraft = structuredClone(signed);
    const targetDecision = oversizedDraft.packages[1].decisions[0];
    for (let id = 31; id <= 51; id += 1) {
      const template = structuredClone(targetDecision.final_events[(id - 31) % targetDecision.final_events.length]);
      template.event_id = `event-${id}`;
      template.source_event_refs = [`a-${id}`, `b-${id}`];
      template.time = { start: 30 + (id - 31) * 2, end: 31 + (id - 31) * 2 };
      targetDecision.final_events.push(template);
      targetDecision.selected_candidate_ids.push(template.event_id);
    }
    oversizedDraft.packages[1].accepted_event_count = 36;
    oversizedDraft.accepted_event_count = 51;
    const oversized = resignDataset(oversizedDraft);
    const oversizedManifest = formalInput(oversized);
    expect(() => prepareOracleGateFormalStructuralPreflight({ dataset: oversized, manifest: oversizedManifest, spec: spec(oversizedManifest) })).toThrow("最多使用 50");
  });
});
