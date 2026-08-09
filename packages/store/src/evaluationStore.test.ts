import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BenchmarkDataset, ExperimentRun } from "../../contracts/src/index.js";
import { writeJson } from "./fileStore.js";
import { EvaluationStore } from "./evaluationStore.js";

describe("EvaluationStore", () => {
  it("loads benchmark datasets and persists quick experiment summaries", async () => {
    const root = await mkdtemp(join(tmpdir(), "skyclass-evaluation-root-"));
    const data = await mkdtemp(join(tmpdir(), "skyclass-evaluation-data-"));
    const store = new EvaluationStore(root, data);
    const dataset: BenchmarkDataset = {
      benchmark_id: "physics-smoke-v1",
      version: 1,
      subject: "高中物理",
      language: "zh-CN",
      scenario_count: 1,
      scenarios: [{ id: "motion-01", unit: "运动", difficulty: "basic", visual_required: false, error_type: "概念", question: "测试问题" }],
    };
    await writeJson(join(root, "benchmark", "pilot", "physics.json"), dataset);

    const run: ExperimentRun = {
      id: "run-01",
      project_id: "project-01",
      question: "测试问题",
      created_at: "2026-08-09T00:00:00.000Z",
      benchmark_id: "physics-smoke-v1",
      scenario_id: "motion-01",
      modes: ["base", "text_skill"],
      results: {},
      errors: { base: "failed" },
    };
    await store.saveRun(run);

    expect((await store.listDatasets())[0].scenario_count).toBe(1);
    expect(await store.listRuns("project-01")).toEqual([expect.objectContaining({
      id: "run-01",
      benchmark_id: "physics-smoke-v1",
      status: "failed",
      scenario_count: 1,
    })]);
  });
});
