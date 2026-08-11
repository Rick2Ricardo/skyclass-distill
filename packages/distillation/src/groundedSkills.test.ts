import { describe, expect, it, vi } from "vitest";
import type { BoardEvidenceBundle } from "../../contracts/src/index.js";
import { buildGroundedSkillSourceCatalog, distillGroundedSkills } from "./groundedSkills.js";

describe("grounded Skill distillation entry", () => {
  it("refuses to build a source catalog from a partial or unvalidated bundle", () => {
    const bundle = {
      bundle_id: "bundle-1",
      teacher_only_recording: true,
      transitions: [{
        transition_id: "accepted-1",
        status: "accepted",
        delta_ids: ["delta-1"],
        evidence_refs: ["ev-accepted"],
      }, {
        transition_id: "pending-1",
        status: "needs_review",
        delta_ids: ["delta-pending"],
        evidence_refs: ["ev-pending"],
      }],
      evidence: [{ evidence_id: "ev-accepted" }, { evidence_id: "ev-pending" }, { evidence_id: "ev-unrelated" }],
    } as unknown as BoardEvidenceBundle;
    expect(() => buildGroundedSkillSourceCatalog(bundle)).toThrow("无效 BoardEvidenceBundle");
  });

  it("rejects an invalid BoardEvidenceBundle before calling the model", async () => {
    const chatJson = vi.fn();
    await expect(distillGroundedSkills({ chatJson }, {
      subject: "高中物理",
      mode: "single",
      bundle: { bundle_id: "invalid" } as unknown as BoardEvidenceBundle,
    })).rejects.toThrow("BoardEvidenceBundle 未通过校验");
    expect(chatJson).not.toHaveBeenCalled();
  });

  it("does not let a single lesson bundle impersonate cross-lesson common support", async () => {
    const chatJson = vi.fn();
    await expect(distillGroundedSkills({ chatJson }, {
      subject: "高中物理",
      mode: "common",
      bundle: { bundle_id: "one-lesson-only" } as unknown as BoardEvidenceBundle,
    })).rejects.toThrow("多个独立 BoardEvidenceBundle");
    expect(chatJson).not.toHaveBeenCalled();
  });
});
