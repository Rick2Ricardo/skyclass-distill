import { describe, expect, it } from "vitest";
import { PipelineEngine } from "./engine.js";

function engine(): PipelineEngine {
  const library = {
    getProject: async () => ({ id: "project", name: "物理", subject: "物理", grade: "高中" }),
    getVideo: async (id: string) => ({ id, project_id: "project" }),
  };
  const jobs = {};
  const settings = {};
  return new PipelineEngine(process.cwd(), "/tmp/anyteacher-test", library as any, jobs as any, settings as any);
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
});
