import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GoldReviewStore } from "./goldReviewStore.js";

const root = resolve(import.meta.dirname, "../../..");
const data = resolve(root, "data");
const artifactUri = "research/board2skill/GOLD_ADJUDICATION_BATCH_03_REMAINING_V1.json";
const digest = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");

describe("Gold adjudication batch 03", () => {
  it("deterministically covers the remaining 36 real queue groups without creating Gold", async () => {
    execFileSync(resolve(root, "node_modules/.bin/tsx"), ["scripts/build-gold-adjudication-batch-03.ts", "--check"], {
      cwd: root,
      env: { ...process.env, PATH: `/opt/homebrew/opt/node@22/bin:${process.env.PATH ?? ""}` },
      stdio: "pipe",
    });
    const artifact = JSON.parse(await readFile(resolve(root, artifactUri), "utf8"));
    const queue = await new GoldReviewStore(root, data).queue();
    const queueSha256 = digest(JSON.stringify(queue));

    expect(queueSha256).toBe(artifact.source_snapshot.queue_sha256);
    expect(artifact.coverage).toMatchObject({
      total_queue_groups: 52,
      earlier_batch_01_groups: 12,
      erase_batch_02_groups: 4,
      this_batch_groups: 36,
      union_group_count: 52,
      this_batch_package_group_counts: [19, 17],
      tier_counts: { quick_confirmation: 16, bounded_review: 9, specialist_adjudication: 11 },
    });
    expect(artifact.items).toHaveLength(36);
    expect(new Set(artifact.items.map((item: { package_id: string; group_id: string }) => `${item.package_id}/${item.group_id}`)).size).toBe(36);
    expect(artifact.output_invariants).toEqual({
      decision_count: 0,
      accepted_event_count: 0,
      reviewer_identity_count: 0,
      package_signoff_count: 0,
      signed_gold_dataset_created: false,
    });
    expect(queue.summary).toMatchObject({ decided_count: 0, accepted_event_count: 0, signed_package_count: 0, paper_gold_ready: false });
    for (const item of artifact.items) {
      expect(item.proposed_candidate.status).toBe("unverified_machine_proposal_not_gold");
      expect(item.comparison_evidence.length).toBeGreaterThan(0);
      expect(item.compiler_canonical_comparison).toEqual(item.comparison_evidence[0]);
      expect(item.required_human_questions.length).toBeGreaterThanOrEqual(3);
      expect(item).toMatchObject({
        human_decision_created: false,
        accepted_event_created: false,
        reviewer_identity_created: false,
        package_signoff_created: false,
      });
    }

    const { batch_payload_sha256: commitment, ...payload } = artifact;
    expect(commitment).toBe(digest(`skyclass/gold-adjudication-pre-review-batch/v1\0${JSON.stringify(payload)}`));
  });

  it("binds every listed evidence byte and keeps speech outside Gold", async () => {
    const artifact = JSON.parse(await readFile(resolve(root, artifactUri), "utf8"));
    const evidenceIds = new Set<string>();
    for (const item of artifact.items) {
      expect(item.speech_context.status).toBe("context_not_gold");
      for (const evidence of item.evidence) {
        const bytes = await readFile(resolve(root, evidence.asset_uri));
        expect(bytes.byteLength).toBe(evidence.byte_length);
        expect(digest(bytes)).toBe(evidence.sha256);
        const identity = `${item.package_id}/${item.group_id}/${evidence.evidence_index}/${evidence.asset_uri}/${evidence.sha256}`;
        expect(evidenceIds.has(identity)).toBe(false);
        evidenceIds.add(identity);
      }
    }
  });
});
