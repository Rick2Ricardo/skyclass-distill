import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GoldReviewStore } from "./goldReviewStore.js";

const root = resolve(import.meta.dirname, "../../..");
const data = resolve(root, "data");
const digest = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");

describe("versioned ERASE persistence intakes", () => {
  it("binds all 19 source frames without creating a Gold decision", async () => {
    const extensionBytes = await readFile(resolve(root, "research/board2skill/ERASE_PERSISTENCE_EXTENSION_V1.json"));
    const extension = JSON.parse(extensionBytes.toString("utf8"));
    const queue = await new GoldReviewStore(root, data).queue();

    expect(extension.cases.map((value: { frames: unknown[] }) => value.frames.length)).toEqual([8, 11]);
    expect(queue.summary).toMatchObject({
      package_count: 6,
      group_count: 52,
      decided_count: 0,
      accepted_event_count: 0,
      signed_package_count: 0,
      paper_gold_ready: false,
    });

    const kg003 = queue.groups.find((value) => value.package_id === "kg003-erase-ab2-4422-4428-persistence-v2");
    const kg005 = queue.groups.find((value) => value.package_id === "kg005-erase-add-ab-1888-1905-persistence-v2" && value.group_id === "KG005-AB-003");
    expect(kg003).toMatchObject({ current_decision: null });
    expect(kg003?.evidence).toHaveLength(21);
    expect(kg003?.candidates[0]).toMatchObject({ operation: "ERASE", acceptance_ready: false });
    expect(kg003?.unresolved_fields).not.toContain(expect.stringContaining("minimum-stability policy"));
    expect(kg003?.unresolved_fields).not.toContain(expect.stringContaining("horizon is sufficient"));
    expect(kg005).toMatchObject({ current_decision: null });
    expect(kg005?.evidence).toHaveLength(19);
    expect(kg005?.candidates[0]).toMatchObject({ operation: "unknown", time: { end: 1905 }, acceptance_ready: false });

    for (const item of extension.cases.flatMap((value: { frames: Array<{ asset_uri: string; sha256: string; byte_length: number }> }) => value.frames)) {
      const bytes = await readFile(resolve(root, item.asset_uri));
      expect(bytes.byteLength).toBe(item.byte_length);
      expect(digest(bytes)).toBe(item.sha256);
    }
  });

  it("keeps both source intake byte roots as immutable provenance", async () => {
    for (const uri of [
      "research/board2skill/KG003_ERASE_AB2_ADJUDICATION_INPUT_4420_4428_V2.json",
      "research/board2skill/KG005_ERASE_ADD_AB_ADJUDICATION_INPUT_1888_1908_V2.json",
    ]) {
      const value = JSON.parse(await readFile(resolve(root, uri), "utf8"));
      const sourceBytes = await readFile(resolve(root, value.source_intake_provenance.source_intake_uri));
      expect(digest(sourceBytes)).toBe(value.source_intake_provenance.source_intake_sha256);
      expect(value.source_intake_provenance.persistence_extension_sha256).toBe(
        digest(await readFile(resolve(root, value.source_intake_provenance.persistence_extension_uri))),
      );
      expect(value.source_intake_provenance.persistence_policy_sha256).toBe(
        digest(await readFile(resolve(root, value.source_intake_provenance.persistence_policy_uri))),
      );
    }
  });
});
