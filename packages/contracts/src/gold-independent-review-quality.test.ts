import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileGoldDoubleReviewQualityReportV1,
  validateGoldDoubleReviewQualityProtocolV1,
  validateGoldDoubleReviewQualityReportV1AgainstInputs,
  type GoldDoubleReviewPair,
  type GoldDoubleReviewQualityProtocolV1,
  type GoldReviewScientificDecision,
} from "./gold-independent-review-quality.js";

const root = resolve(import.meta.dirname, "../../..");
const protocol = JSON.parse(readFileSync(resolve(root, "research/board2skill/GOLD_DOUBLE_REVIEW_QUALITY_PROTOCOL_V1.json"), "utf8")) as GoldDoubleReviewQualityProtocolV1;
const protocolJsonSha256 = "a50db9341390cdd82936fdfadcce419a0fce9d91c96b27c80f2ad59a4c0a291e";

const reject = (): GoldReviewScientificDecision => ({ disposition: "reject", selected_candidate_ids: [], final_events: [] });
const unknown = (): GoldReviewScientificDecision => ({ disposition: "unknown", selected_candidate_ids: [], final_events: [] });
const accept = (index: number): GoldReviewScientificDecision => ({
  disposition: "accept",
  selected_candidate_ids: [`candidate-${index}`],
  final_events: [{
    event_id: `event-${index}`, source_event_refs: [`source-${index}`], operation: "ADD", time: { start: index, end: index + 1 },
    semantic_label: `visible-${index}`, region: null, relation: null, modification: null,
  }],
});

function pairs(visualAccept: Set<number>, physicsAccept: Set<number>, allUnknown = false): GoldDoubleReviewPair[] {
  return Array.from({ length: 52 }, (_, index) => ({
    card_sha256: (index + 1).toString(16).padStart(64, "0"),
    package_id: `package-${Math.floor(index / 9)}`,
    group_id: `group-${index}`,
    visual: allUnknown ? unknown() : visualAccept.has(index) ? accept(index) : reject(),
    physics: allUnknown ? unknown() : physicsAccept.has(index) ? accept(index) : reject(),
  }));
}

function compile(rows: GoldDoubleReviewPair[]): Record<string, any> {
  return compileGoldDoubleReviewQualityReportV1({
    protocol,
    quality_protocol_json_sha256: protocolJsonSha256,
    manifest_payload_sha256: "1".repeat(64),
    manifest_json_sha256: "2".repeat(64),
    review_package_sha256: protocol.review_package_sha256,
    visual_assessment_sha256: "3".repeat(64),
    physics_assessment_sha256: "4".repeat(64),
    pairs: rows,
  });
}

describe("Gold independent double-review quality preregistration", () => {
  it("validates the exact frozen protocol and rejects full-layer semantic drift", () => {
    expect(validateGoldDoubleReviewQualityProtocolV1(protocol)).toBe(true);
    const drift = structuredClone(protocol);
    drift.primary_metrics[0].minimum_continue_threshold = 0.5;
    expect(validateGoldDoubleReviewQualityProtocolV1(drift)).toBe(false);
    let getterHits = 0;
    const hostile = Object.create(Object.prototype, Object.getOwnPropertyDescriptors(protocol));
    Object.defineProperty(hostile, "schema_version", { enumerable: true, get() { getterHits += 1; return protocol.schema_version; } });
    expect(validateGoldDoubleReviewQualityProtocolV1(hostile)).toBe(false);
    expect(getterHits).toBe(0);
  });

  it("blocks single-category perfect agreement because kappa is not estimable", () => {
    const result = compile(pairs(new Set(), new Set(), true));
    expect(result.decision).toBe("BLOCKED_PRIMARY_KAPPA_NOT_ESTIMABLE");
    expect(result.primary_metrics.cohen_kappa_disposition).toMatchObject({ status: "not_estimable", value: null, observed_agreement: 1, expected_agreement: 1 });
  });

  it("mechanically reaches relabel, continue and target branches without fabricated empirical values", () => {
    const firstHalf = new Set(Array.from({ length: 26 }, (_, index) => index));
    const secondHalf = new Set(Array.from({ length: 26 }, (_, index) => index + 26));
    const relabel = compile(pairs(firstHalf, secondHalf));
    expect(relabel.decision).toBe("RELABEL_PILOT_REQUIRED");
    expect(relabel.primary_metrics.cohen_kappa_disposition.value).toBe(-1);
    expect(relabel.primary_metrics.cohen_kappa_operation_sequence.value).toBe(-1);

    const physicsContinue = new Set(firstHalf);
    for (const index of [0, 1, 2, 3]) physicsContinue.delete(index);
    for (const index of [26, 27, 28, 29]) physicsContinue.add(index);
    const continuation = compile(pairs(firstHalf, physicsContinue));
    expect(continuation.decision).toBe("CONTINUE_FULL_CONFLICT_ADJUDICATION");
    expect(continuation.primary_metrics.cohen_kappa_disposition.value).toBeCloseTo(0.6923076923, 10);
    expect(continuation.primary_metrics.cohen_kappa_operation_sequence.value).toBeCloseTo(0.6923076923, 10);

    const target = compile(pairs(firstHalf, firstHalf));
    expect(target.decision).toBe("TARGET_RELIABILITY_MET");
    expect(target.primary_metrics.cohen_kappa_disposition.value).toBe(1);
    expect(target.primary_metrics.cohen_kappa_operation_sequence.value).toBe(1);
  });

  it("binds exact assessment roots and rejects denominator or identity duplication", () => {
    const firstHalf = new Set(Array.from({ length: 26 }, (_, index) => index));
    const baseline = compile(pairs(firstHalf, firstHalf));
    const changed = compileGoldDoubleReviewQualityReportV1({
      protocol,
      quality_protocol_json_sha256: protocolJsonSha256,
      manifest_payload_sha256: "1".repeat(64), manifest_json_sha256: "2".repeat(64), review_package_sha256: protocol.review_package_sha256,
      visual_assessment_sha256: "f".repeat(64), physics_assessment_sha256: "4".repeat(64), pairs: pairs(firstHalf, firstHalf),
    });
    expect(changed.quality_report_sha256).not.toBe(baseline.quality_report_sha256);
    const compilerInput = {
      protocol, quality_protocol_json_sha256: protocolJsonSha256, manifest_payload_sha256: "1".repeat(64), manifest_json_sha256: "2".repeat(64), review_package_sha256: protocol.review_package_sha256,
      visual_assessment_sha256: "3".repeat(64), physics_assessment_sha256: "4".repeat(64), pairs: pairs(firstHalf, firstHalf),
    };
    expect(validateGoldDoubleReviewQualityReportV1AgainstInputs(baseline, compilerInput)).toBe(true);
    const driftedReport = structuredClone(baseline);
    driftedReport.decision = "RELABEL_PILOT_REQUIRED";
    expect(validateGoldDoubleReviewQualityReportV1AgainstInputs(driftedReport, compilerInput)).toBe(false);
    const duplicate = pairs(firstHalf, firstHalf);
    duplicate[1].card_sha256 = duplicate[0].card_sha256;
    expect(() => compile(duplicate)).toThrow(/duplicated/);
    expect(() => compile(pairs(firstHalf, firstHalf).slice(1))).toThrow(/denominator/);
    const malformed = pairs(firstHalf, firstHalf) as unknown as Array<Record<string, any>>;
    malformed[0].visual.final_events[0].source_event_refs = "not-an-array";
    expect(() => compile(malformed as unknown as GoldDoubleReviewPair[])).toThrow(/accepted event/);
    expect(() => compileGoldDoubleReviewQualityReportV1({ ...compilerInput, authority: "invented" } as never)).toThrow(/fields are not exact/);
  });
});
