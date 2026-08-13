import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const tsx = resolve(root, "node_modules/.bin/tsx");
const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function completedAssessment(templateName: string, reviewerId: string): Promise<Record<string, unknown>> {
  const template = JSON.parse(await readFile(resolve(root, `research/board2skill/${templateName}`), "utf8"));
  template.status = "completed_independent_assessment";
  template.reviewer_id = reviewerId;
  template.reviewer_role = template.reviewer_slot === "visual_reviewer" ? "visual evidence adjudicator" : "physics content reviewer";
  template.items = template.items.map((item: Record<string, unknown>) => ({
    ...item,
    decision: {
      disposition: "unknown",
      selected_candidate_ids: [],
      final_events: [],
      rationale: "视觉证据不足，保持未知并进入共同讨论。",
      reviewed_at: "2026-08-14T00:00:00.000Z",
    },
  }));
  return template;
}

async function writeInputs(): Promise<{ directory: string; visual: string; physics: string }> {
  const directory = await mkdtemp(join(tmpdir(), "gold-independent-review-"));
  created.push(directory);
  const visual = join(directory, "visual.json");
  const physics = join(directory, "physics.json");
  await writeFile(visual, `${JSON.stringify(await completedAssessment("GOLD_INDEPENDENT_REVIEW_VISUAL_TEMPLATE_V1.json", "visual-expert-01"), null, 2)}\n`);
  await writeFile(physics, `${JSON.stringify(await completedAssessment("GOLD_INDEPENDENT_REVIEW_PHYSICS_TEMPLATE_V1.json", "physics-expert-01"), null, 2)}\n`);
  return { directory, visual, physics };
}

function reconcile(visual: string, physics: string, output: string): void {
  execFileSync(tsx, ["scripts/reconcile-gold-independent-review.ts", visual, physics, output], {
    cwd: root,
    env: { ...process.env, PATH: `/opt/homebrew/opt/node@22/bin:${process.env.PATH ?? ""}` },
    stdio: "pipe",
  });
}

describe("Gold independent double review", () => {
  it("deterministically freezes two isolated 52-card reviewer templates over the real queue", () => {
    execFileSync(tsx, ["scripts/build-gold-independent-review.ts", "--check"], {
      cwd: root,
      env: { ...process.env, PATH: `/opt/homebrew/opt/node@22/bin:${process.env.PATH ?? ""}` },
      stdio: "pipe",
    });
  });

  it("reports agreement without creating any Gold decision or signoff", async () => {
    const { directory, visual, physics } = await writeInputs();
    const output = join(directory, "reconciliation.json");
    reconcile(visual, physics, output);
    const result = JSON.parse(await readFile(output, "utf8"));
    expect(result).toMatchObject({
      status: "ready_for_joint_human_confirmation_no_gold_written",
      counts: { group_count: 52, agreement_count: 52, conflict_count: 0 },
      output_invariants: {
        human_store_decision_count_created: 0,
        accepted_event_count_created: 0,
        package_signoff_count_created: 0,
        signed_gold_dataset_created: false,
        explicit_joint_human_confirmation_still_required: true,
      },
    });
    expect(result.agreements).toHaveLength(52);
    expect(result.conflicts).toHaveLength(0);
  });

  it("surfaces a scientific disagreement and rejects identity or item-set drift", async () => {
    const { directory, visual, physics } = await writeInputs();
    const physicsValue = JSON.parse(await readFile(physics, "utf8"));
    physicsValue.items[0].decision.disposition = "reject";
    physicsValue.items[0].decision.rationale = "未观察到稳定板书变化，因此拒绝该候选。";
    await writeFile(physics, `${JSON.stringify(physicsValue, null, 2)}\n`);
    const output = join(directory, "conflict.json");
    reconcile(visual, physics, output);
    const result = JSON.parse(await readFile(output, "utf8"));
    expect(result.status).toBe("joint_human_resolution_required_no_gold_written");
    expect(result.counts).toEqual({ group_count: 52, agreement_count: 51, conflict_count: 1 });
    expect(result.conflicts[0].joint_resolution).toBeNull();

    physicsValue.reviewer_id = "visual-expert-01";
    await writeFile(physics, `${JSON.stringify(physicsValue, null, 2)}\n`);
    expect(() => reconcile(visual, physics, join(directory, "same-reviewer.json"))).toThrow();

    physicsValue.reviewer_id = "physics-expert-01";
    physicsValue.items.pop();
    await writeFile(physics, `${JSON.stringify(physicsValue, null, 2)}\n`);
    expect(() => reconcile(visual, physics, join(directory, "missing-item.json"))).toThrow();
  });

  it("rejects incomplete, duplicate-key, manifest and accepted-event provenance drift", async () => {
    const { directory, visual, physics } = await writeInputs();
    const visualValue = JSON.parse(await readFile(visual, "utf8"));
    visualValue.items[0].decision = null;
    await writeFile(visual, `${JSON.stringify(visualValue, null, 2)}\n`);
    expect(() => reconcile(visual, physics, join(directory, "incomplete.json"))).toThrow();

    const validVisual = await completedAssessment("GOLD_INDEPENDENT_REVIEW_VISUAL_TEMPLATE_V1.json", "visual-expert-01");
    const duplicate = JSON.stringify(validVisual).replace('"status":"completed_independent_assessment"', '"status":"completed_independent_assessment","status":"unfilled_template"');
    await writeFile(visual, duplicate);
    expect(() => reconcile(visual, physics, join(directory, "duplicate.json"))).toThrow();

    const wrongManifest = structuredClone(validVisual);
    wrongManifest.manifest_payload_sha256 = "f".repeat(64);
    await writeFile(visual, `${JSON.stringify(wrongManifest, null, 2)}\n`);
    expect(() => reconcile(visual, physics, join(directory, "wrong-manifest.json"))).toThrow();

    const accepted = structuredClone(validVisual) as Record<string, any>;
    const manifest = JSON.parse(await readFile(resolve(root, "research/board2skill/GOLD_INDEPENDENT_REVIEW_MANIFEST_V1.json"), "utf8"));
    const first = accepted.items[0];
    const card = manifest.cards.find((item: Record<string, unknown>) => item.card_sha256 === first.card_sha256);
    const candidate = card.candidates[0];
    first.decision = {
      disposition: "accept",
      selected_candidate_ids: [candidate.candidate_id],
      final_events: [{
        event_id: candidate.event_id,
        source_event_refs: ["forged-source-event"],
        operation: candidate.operation === "unknown" ? "ADD" : candidate.operation,
        time: candidate.time,
        semantic_label: candidate.semantic_label,
        region: candidate.region,
        relation: candidate.relation,
        modification: candidate.modification,
      }],
      rationale: "试图改变冻结来源引用，必须在协调前失败。",
      reviewed_at: "2026-08-14T00:00:00.000Z",
    };
    await writeFile(visual, `${JSON.stringify(accepted, null, 2)}\n`);
    expect(() => reconcile(visual, physics, join(directory, "semantic-drift.json"))).toThrow();
  });

  it("requires canonical multi-event order instead of hiding opposite reviewer order", async () => {
    const { directory, visual, physics } = await writeInputs();
    const manifest = JSON.parse(await readFile(resolve(root, "research/board2skill/GOLD_INDEPENDENT_REVIEW_MANIFEST_V1.json"), "utf8"));
    const card = manifest.cards.find((item: Record<string, any>) => item.candidates.length === 2);
    expect(card).toBeTruthy();
    const buildDecision = (reverse: boolean) => {
      const candidates = [...card.candidates].sort((left, right) => left.time.start - right.time.start || left.event_id.localeCompare(right.event_id));
      if (reverse) candidates.reverse();
      return {
        disposition: "accept",
        selected_candidate_ids: candidates.map((candidate) => candidate.candidate_id),
        final_events: candidates.map((candidate) => ({
          event_id: candidate.event_id,
          source_event_refs: candidate.source_event_refs,
          operation: candidate.operation,
          time: candidate.time,
          semantic_label: candidate.semantic_label,
          region: candidate.region,
          relation: candidate.relation,
          modification: candidate.modification,
        })),
        rationale: "两个持久事件均有完整视觉证据，并按时间顺序记录。",
        reviewed_at: "2026-08-14T00:00:00.000Z",
      };
    };
    for (const [path, reverse] of [[visual, false], [physics, true]] as const) {
      const value = JSON.parse(await readFile(path, "utf8"));
      const item = value.items.find((entry: Record<string, unknown>) => entry.card_sha256 === card.card_sha256);
      item.decision = buildDecision(reverse);
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
    }
    expect(() => reconcile(visual, physics, join(directory, "opposite-order.json"))).toThrow();
  });

  it("rejects weakened frozen reviewer instructions", async () => {
    const { directory, visual, physics } = await writeInputs();
    const value = JSON.parse(await readFile(visual, "utf8"));
    value.instructions.do_not_open_peer_assessment_before_completion = false;
    value.instructions.inspect_all_evidence_for_final_boundaries = false;
    value.instructions.speech_is_context_not_gold = false;
    await writeFile(visual, `${JSON.stringify(value, null, 2)}\n`);
    expect(() => reconcile(visual, physics, join(directory, "weakened-instructions.json"))).toThrow();
  });
});
