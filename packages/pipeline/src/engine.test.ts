import { describe, expect, it } from "vitest";
import { PipelineEngine } from "./engine.js";

function engine(options: { dataDir?: string; artifacts?: Record<string, string>; jobs?: Record<string, unknown> } = {}): PipelineEngine {
  const library = {
    getProject: async () => ({ id: "project", name: "物理", subject: "物理", grade: "高中" }),
    getVideo: async (id: string) => ({ id, project_id: "project", artifacts: options.artifacts }),
  };
  const jobs = options.jobs ?? {};
  const settings = {};
  return new PipelineEngine(process.cwd(), options.dataDir ?? "/tmp/anyteacher-test", library as any, jobs as any, settings as any);
}

describe("PipelineEngine distillation contract", () => {
  it("requires exactly one video for single-lesson mode", async () => {
    await expect(engine().createDistill("project", {
      video_ids: ["a", "b"],
      mode: "single",
      modality: "text",
    })).rejects.toThrow("单课模式必须且只能选择一个视频");
  });

  it("requires at least four videos for common-skill mode", async () => {
    await expect(engine().createDistill("project", {
      video_ids: ["a", "b", "c"],
      mode: "common",
      modality: "multimodal",
    })).rejects.toThrow("跨课共性模式至少需要四段课堂");
  });

  it("only permits temporal board evidence in single-lesson mode", async () => {
    await expect(engine().createDistill("project", {
      video_ids: ["a", "b", "c", "d"],
      mode: "common",
      modality: "multimodal",
      evidence_mode: "temporal_board",
    })).rejects.toThrow("时序板书 v2 首批仅支持单课模式");
  });

  it("requires a controlled adjudicated bundle for temporal board distillation", async () => {
    await expect(engine().createDistill("project", {
      video_ids: ["a"],
      mode: "single",
      modality: "multimodal",
      evidence_mode: "temporal_board",
      board_bundle_uri: "../outside.json",
    })).rejects.toThrow("受控路径");
    await expect(engine().createDistill("project", {
      video_ids: ["a"], mode: "single", modality: "multimodal", evidence_mode: "temporal_board",
      board_bundle_uri: "%252e%252e%252foutside.json",
    })).rejects.toThrow("受控路径");
    await expect(engine().createDistill("project", {
      video_ids: ["a"], mode: "single", modality: "multimodal", evidence_mode: "temporal_board",
      board_bundle_uri: "/tmp/outside.json",
    })).rejects.toThrow("受控路径");
    await expect(engine().createDistill("project", {
      video_ids: ["a"],
      mode: "single",
      modality: "multimodal",
      evidence_mode: "temporal_board",
    })).rejects.toThrow("已仲裁的 board_bundle_json");
  });

});
