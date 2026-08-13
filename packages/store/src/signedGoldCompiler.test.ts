import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalGoldReviewDecisionSignaturePayload,
  canonicalGoldReviewPackageSignoffSignaturePayload,
  type GoldReviewDecisionRecord,
  type GoldReviewGroup,
  type GoldReviewPackage,
  type GoldReviewQueue,
} from "../../contracts/src/index.js";
import { buildSignedGoldDataset, inspectSignedGoldCompileReadiness } from "./signedGoldCompiler.js";
import { validateSignedGoldDataset, validateSignedGoldRecordSignatures } from "../../contracts/src/index.js";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const digest = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

function png(index: number): Buffer {
  const image = new PNG({ width: 1, height: 1 });
  image.data.set([index % 251, (index * 17) % 251, (index * 31) % 251, 255]);
  return PNG.sync.write(image);
}

async function currentShapeQueue(root: string): Promise<GoldReviewQueue> {
  const componentShape = [
    { packageId: "kg003-main", sourceVideoId: "kg003", groups: 19, start: 100 },
    { packageId: "kg003-erase", sourceVideoId: "kg003", groups: 1, start: 500 },
    { packageId: "kg005-modify", sourceVideoId: "kg005", groups: 5, start: 100 },
    { packageId: "kg005-erase-add", sourceVideoId: "kg005", groups: 3, start: 500 },
    { packageId: "ly003-main", sourceVideoId: "ly003", groups: 17, start: 100 },
    { packageId: "ly004-main", sourceVideoId: "ly004", groups: 7, start: 100 },
  ];
  const packages: GoldReviewPackage[] = [];
  const groups: GoldReviewGroup[] = [];
  let assetIndex = 0;
  for (const component of componentShape) {
    const intakeSha = digest(`intake:${component.packageId}`);
    const componentDecisions: GoldReviewDecisionRecord[] = [];
    for (let groupIndex = 0; groupIndex < component.groups; groupIndex += 1) {
      assetIndex += 1;
      const groupId = `G${String(groupIndex + 1).padStart(2, "0")}`;
      const eventId = `${component.packageId}-${groupId}-event`;
      const time = { start: component.start + groupIndex * 3, end: component.start + groupIndex * 3 + 2 };
      const finalEvent = {
        event_id: eventId,
        source_event_refs: [`a-${assetIndex}`, `b-${assetIndex}`],
        operation: "ADD" as const,
        time,
        semantic_label: `签字板书事件 ${assetIndex}`,
        region: null,
        relation: null,
        modification: null,
      };
      const decisionBase: Omit<GoldReviewDecisionRecord, "signature_sha256"> = {
        schema_version: "gold-review-decision-v1",
        package_id: component.packageId,
        group_id: groupId,
        revision: 1,
        parent_signature_sha256: null,
        source_intake_sha256: intakeSha,
        disposition: "accept",
        selected_candidate_ids: [eventId],
        final_events: [finalEvent],
        adjudicator_id: `visual-${component.packageId}`,
        adjudicator_role: "visual-reviewer",
        rationale: "合成真实形状回归：逐项确认。",
        decided_at: "2026-08-14T00:00:00.000Z",
      };
      const decision: GoldReviewDecisionRecord = {
        ...decisionBase,
        signature_sha256: digest(canonicalGoldReviewDecisionSignaturePayload(decisionBase)),
      };
      componentDecisions.push(decision);
      const bytes = png(assetIndex);
      const assetPath = `assets/comparison-${String(assetIndex).padStart(2, "0")}.png`;
      await writeFile(join(root, assetPath), bytes);
      const evidence = [{ evidence_id: eventId, side: "shared", kind: "comparison", label: "before/delta/after", path: assetPath, sha256: digest(bytes) }];
      if (assetIndex === 1) {
        for (const [extraIndex, kind] of ["mask", "board"].entries()) {
          const extraBytes = png(240 + extraIndex);
          const extraPath = `assets/${kind}-01.png`;
          await writeFile(join(root, extraPath), extraBytes);
          evidence.push({ evidence_id: eventId, side: "shared", kind, label: kind, path: extraPath, sha256: digest(extraBytes) });
        }
      }
      groups.push({
        package_id: component.packageId,
        group_id: groupId,
        source_video_id: component.sourceVideoId,
        intake_path: `intakes/${component.packageId}.json`,
        alignment_class: "matched",
        time,
        speech_context: "",
        source_events: [],
        candidates: [],
        // Mirrors the real intake shape: the same event identity can name several assets.
        evidence,
        unresolved_fields: [],
        current_decision: decision,
        package_locked: true,
        package_signed: true,
      });
    }
    const decisionSignatures = componentDecisions.map((item) => item.signature_sha256).sort();
    const signoff = (role: "visual_adjudicator" | "physics_reviewer", actor: string, minute: number) => {
      const base = {
        schema_version: "gold-review-package-signoff-v1" as const,
        package_id: component.packageId,
        signoff_role: role,
        source_intake_sha256: intakeSha,
        decision_signatures: decisionSignatures,
        adjudicator_id: actor,
        adjudicator_role: role,
        statement: "确认组件内全部视觉与物理事件。",
        signed_at: `2026-08-14T00:${String(minute).padStart(2, "0")}:00.000Z`,
      };
      return { ...base, signature_sha256: digest(canonicalGoldReviewPackageSignoffSignaturePayload(base)) };
    };
    packages.push({
      package_id: component.packageId,
      source_video_id: component.sourceVideoId,
      intake_path: `intakes/${component.packageId}.json`,
      intake_sha256: intakeSha,
      group_count: component.groups,
      decided_count: component.groups,
      accepted_event_count: component.groups,
      package_signoffs: [signoff("visual_adjudicator", `visual-${component.packageId}`, 1), signoff("physics_reviewer", `physics-${component.packageId}`, 2)],
      fully_signed: true,
    });
  }
  return {
    schema_version: "gold-review-queue-v1",
    packages,
    groups,
    summary: {
      package_count: 6,
      group_count: 52,
      decided_count: 52,
      accepted_event_count: 52,
      minimum_required_event_count: 30,
      signed_package_count: 6,
      paper_gold_ready: true,
    },
  };
}

describe("Signed Gold v2 current-shape compiler", () => {
  it("deterministically compiles 6 signed components and 52 groups into 4 lessons with unique asset identities", async () => {
    const root = await mkdtemp(join(tmpdir(), "signed-gold-current-shape-"));
    created.push(root);
    await mkdir(join(root, "assets"), { recursive: true });
    const queue = await currentShapeQueue(root);
    const readiness = await inspectSignedGoldCompileReadiness(root, queue);
    expect(readiness).toMatchObject({ structural_ready: true, human_ready: true, component_package_count: 6, lesson_count: 4, group_count: 52, evidence_asset_count: 54, derived_evidence_id_count: 54 });
    const first = await buildSignedGoldDataset(root, queue);
    const second = await buildSignedGoldDataset(root, queue);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ schema_version: "signed-gold-dataset-v2", package_count: 6, lesson_count: 4, reviewed_group_count: 52, accepted_group_count: 52, accepted_event_count: 52 });
    expect(first.lessons.map((item) => item.component_package_ids.length).sort()).toEqual([1, 1, 2, 2]);
    const evidence = first.packages.flatMap((item) => item.groups.flatMap((group) => group.visual_evidence));
    expect(new Set(evidence.map((item) => item.evidence_id)).size).toBe(54);
    expect(evidence.every((item) => item.evidence_id !== item.source_evidence_id)).toBe(true);
    expect(evidence.filter((item) => item.source_evidence_id === "kg003-main-G01-event")).toHaveLength(3);

    const extra = structuredClone(first) as typeof first & { authority?: string };
    extra.authority = "self-declared";
    expect(validateSignedGoldDataset(extra).valid).toBe(false);
    const mixed = structuredClone(first);
    mixed.lessons[0].component_commitments[0].source_intake_sha256 = "f".repeat(64);
    expect(validateSignedGoldRecordSignatures(mixed, (value) => digest(value))).not.toHaveLength(0);
  });
});
