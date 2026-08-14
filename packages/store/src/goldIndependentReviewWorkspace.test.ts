import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildGoldIndependentAssessmentV1,
  type GoldIndependentReviewDecision,
  type GoldIndependentReviewPacket,
} from "../../contracts/src/gold-independent-review-workspace.js";
import { GoldIndependentReviewWorkspace } from "./goldIndependentReviewWorkspace.js";

const root = resolve(import.meta.dirname, "../../..");
const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function unknownDecisions(packet: GoldIndependentReviewPacket): Record<string, GoldIndependentReviewDecision> {
  return Object.fromEntries(packet.items.map((item) => [item.card_sha256, {
    disposition: "unknown",
    selected_candidate_ids: [],
    final_events: [],
    rationale: "可见证据仍不足以支持确定结论，保留未知。",
    reviewed_at: "2026-08-14T00:00:00.000Z",
  }]));
}

describe("GoldIndependentReviewWorkspace", () => {
  it("serves two frozen read-only 52-card packets in distinct presentation orders", async () => {
    const workspace = new GoldIndependentReviewWorkspace(root);
    const [visual, physics] = await Promise.all([workspace.packet("visual_reviewer"), workspace.packet("physics_reviewer")]);
    expect(visual.counts).toEqual({ item_count: 52, evidence_asset_count: 398, evidence_byte_length: 62_341_332 });
    expect(visual.invariants).toEqual({
      server_write_allowed: false,
      gold_decision_created: false,
      peer_completed_assessment_exposed: false,
      browser_draft_is_not_gold: true,
      reviewer_identity_is_external_governance: true,
    });
    expect(new Set(visual.items.map((item) => item.card_sha256))).toEqual(new Set(physics.items.map((item) => item.card_sha256)));
    expect(visual.items.map((item) => item.card_sha256)).not.toEqual(physics.items.map((item) => item.card_sha256));
    expect(visual.items.every((item) => !("decision" in item))).toBe(true);
  });

  it("returns only hash- and length-verified evidence bytes", async () => {
    const workspace = new GoldIndependentReviewWorkspace(root);
    const packet = await workspace.packet("visual_reviewer");
    const item = packet.items[0];
    const expected = item.card.evidence[0];
    const evidence = await workspace.evidence("visual_reviewer", item.card_sha256, 0);
    expect(evidence.bytes).toHaveLength(expected.byte_length);
    expect(createHash("sha256").update(evidence.bytes).digest("hex")).toBe(expected.sha256);
    await expect(workspace.evidence("visual_reviewer", item.card_sha256, 999)).rejects.toThrow("evidence 不存在");
    await expect(workspace.packet("peer" as never)).rejects.toThrow("reviewer slot");
  });

  it("exports browser drafts into the exact reconciler contract without writing Gold", async () => {
    const workspace = new GoldIndependentReviewWorkspace(root);
    const [visualPacket, physicsPacket] = await Promise.all([workspace.packet("visual_reviewer"), workspace.packet("physics_reviewer")]);
    const visual = buildGoldIndependentAssessmentV1({ packet: visualPacket, reviewer_id: "visual-human-01", reviewer_role: "视觉证据评审员", decisions: unknownDecisions(visualPacket) });
    const physics = buildGoldIndependentAssessmentV1({ packet: physicsPacket, reviewer_id: "physics-human-01", reviewer_role: "物理语义评审员", decisions: unknownDecisions(physicsPacket) });
    const directory = await mkdtemp(join(tmpdir(), "gold-review-workspace-"));
    created.push(directory);
    const visualPath = join(directory, "visual.json");
    const physicsPath = join(directory, "physics.json");
    const outputPath = join(directory, "reconciled.json");
    await Promise.all([
      writeFile(visualPath, `${JSON.stringify(visual, null, 2)}\n`),
      writeFile(physicsPath, `${JSON.stringify(physics, null, 2)}\n`),
    ]);
    execFileSync(resolve(root, "node_modules/.bin/tsx"), ["scripts/reconcile-gold-independent-review.ts", visualPath, physicsPath, outputPath], {
      cwd: root,
      env: { ...process.env, PATH: `/opt/homebrew/opt/node@22/bin:${process.env.PATH ?? ""}` },
      stdio: "pipe",
    });
    const result = JSON.parse(await readFile(outputPath, "utf8"));
    expect(result.status).toBe("reliability_gate_blocked_no_gold_written");
    expect(result.output_invariants).toMatchObject({ human_store_decision_count_created: 0, accepted_event_count_created: 0, package_signoff_count_created: 0 });
  }, 20_000);

  it("rejects incomplete or structurally drifting local exports and exposes no matching POST route", async () => {
    const workspace = new GoldIndependentReviewWorkspace(root);
    const packet = await workspace.packet("visual_reviewer");
    const decisions = unknownDecisions(packet);
    delete decisions[packet.items[0].card_sha256];
    expect(() => buildGoldIndependentAssessmentV1({ packet, reviewer_id: "visual-human-01", reviewer_role: "视觉证据评审员", decisions })).toThrow("尚未完成");

    const accepted = unknownDecisions(packet);
    const first = packet.items.find((item) => item.card.candidates.length > 0)!;
    const candidate = first.card.candidates[0];
    accepted[first.card_sha256] = {
      disposition: "accept",
      selected_candidate_ids: [candidate.candidate_id],
      final_events: [{
        event_id: candidate.event_id,
        source_event_refs: ["forged-source"],
        operation: candidate.operation === "unknown" ? "ADD" : candidate.operation,
        time: candidate.time,
        semantic_label: candidate.semantic_label,
        region: candidate.region,
        relation: candidate.relation,
        modification: candidate.modification,
      }],
      rationale: "试图漂移冻结来源引用，浏览器导出必须拒绝。",
      reviewed_at: "2026-08-14T00:00:00.000Z",
    };
    expect(() => buildGoldIndependentAssessmentV1({ packet, reviewer_id: "visual-human-01", reviewer_role: "视觉证据评审员", decisions: accepted })).toThrow("没有闭合");

    accepted[first.card_sha256].final_events[0].source_event_refs = [...candidate.source_event_refs];
    accepted[first.card_sha256].final_events[0].operation = "BOGUS" as never;
    expect(() => buildGoldIndependentAssessmentV1({ packet, reviewer_id: "visual-human-01", reviewer_role: "视觉证据评审员", decisions: accepted })).toThrow("操作无效");
    accepted[first.card_sha256].final_events[0].operation = candidate.operation === "unknown" ? "ADD" : candidate.operation;
    accepted[first.card_sha256].final_events[0].time = { start: first.card.group_time.start - 3, end: first.card.group_time.start - 2.5 };
    expect(() => buildGoldIndependentAssessmentV1({ packet, reviewer_id: "visual-human-01", reviewer_role: "视觉证据评审员", decisions: accepted })).toThrow("离开证据窗口");
    accepted[first.card_sha256].final_events[0].time = candidate.time;
    accepted[first.card_sha256].final_events[0].semantic_label = "全班都会了";
    expect(() => buildGoldIndependentAssessmentV1({ packet, reviewer_id: "visual-human-01", reviewer_role: "视觉证据评审员", decisions: accepted })).toThrow("语义标签无效");
    const server = await readFile(resolve(root, "apps/anyteacher/src/server.ts"), "utf8");
    expect(server).not.toContain('app.post("/api/gold-independent-review');
    const appSource = await readFile(resolve(root, "apps/anyteacher/web/src/App.tsx"), "utf8");
    expect(appSource).toContain('window.location.pathname === "/gold-independent-review"');
    const workspaceSource = await readFile(resolve(root, "apps/anyteacher/web/src/components/IndependentGoldReview.tsx"), "utf8");
    expect(workspaceSource).toContain("packet.template_json_sha256");
    expect(workspaceSource).toContain("packet.review_package_sha256");
  });
});
