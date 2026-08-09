import { join } from "node:path";
import type {
  BenchmarkDataset,
  ExperimentRun,
  ExperimentSummary,
  TutorMode,
} from "../../contracts/src/index.js";
import { listJson, writeJson } from "./fileStore.js";

const MODES: TutorMode[] = ["base", "text_skill", "multimodal_skill"];

function isMode(value: unknown): value is TutorMode {
  return MODES.includes(value as TutorMode);
}

function modeList(value: unknown): TutorMode[] {
  return Array.isArray(value) ? value.filter(isMode) : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function legacyModes(value: Record<string, unknown>): TutorMode[] {
  const results = Array.isArray(value.results) ? value.results : [];
  const first = record(results[0]);
  return Object.keys(record(first.arms)).filter(isMode);
}

function summarize(value: Record<string, unknown>): ExperimentSummary | null {
  const projectId = typeof value.project_id === "string" ? value.project_id : "";
  if (!projectId) return null;

  const modes = modeList(value.modes);
  if (modes.length) {
    const errors = record(value.errors);
    const results = record(value.results);
    const completed = modes.filter((mode) => results[mode]).length;
    return {
      id: String(value.id || "unknown-run"),
      project_id: projectId,
      benchmark_id: typeof value.benchmark_id === "string" ? value.benchmark_id : undefined,
      question: typeof value.question === "string" ? value.question : undefined,
      created_at: typeof value.created_at === "string" ? value.created_at : undefined,
      scenario_count: 1,
      modes,
      status: completed === 0 ? "failed" : Object.keys(errors).length ? "partial" : "completed",
      source: "quick",
    };
  }

  const scenarioIds = Array.isArray(value.scenario_ids) ? value.scenario_ids.map(String) : [];
  const results = Array.isArray(value.results) ? value.results : [];
  const benchmarkId = typeof value.benchmark_id === "string" ? value.benchmark_id : undefined;
  if (!benchmarkId && !results.length) return null;
  const firstScenario = record(record(results[0]).scenario);
  return {
    id: `${benchmarkId || "legacy"}-${String(value.baseline_version || scenarioIds[0] || "run")}`,
    project_id: projectId,
    benchmark_id: benchmarkId,
    question: typeof firstScenario.question === "string" ? firstScenario.question : undefined,
    created_at: typeof value.created_at === "string" ? value.created_at : undefined,
    scenario_count: scenarioIds.length || results.length,
    modes: legacyModes(value),
    status: results.length ? "completed" : "failed",
    source: "benchmark",
  };
}

export class EvaluationStore {
  readonly datasetDirectory: string;
  readonly experimentDirectory: string;

  constructor(root: string, dataDir: string) {
    this.datasetDirectory = join(root, "benchmark", "pilot");
    this.experimentDirectory = join(dataDir, "experiments");
  }

  async listDatasets(): Promise<BenchmarkDataset[]> {
    const datasets = await listJson<BenchmarkDataset>(this.datasetDirectory);
    return datasets
      .filter((item) => item.benchmark_id && Array.isArray(item.scenarios))
      .map((item) => ({ ...item, scenario_count: item.scenarios.length }))
      .sort((a, b) => a.benchmark_id.localeCompare(b.benchmark_id));
  }

  async saveRun(run: ExperimentRun): Promise<void> {
    await writeJson(join(this.experimentDirectory, `run-${run.id}.json`), run);
  }

  async listRuns(projectId: string): Promise<ExperimentSummary[]> {
    const values = await listJson<Record<string, unknown>>(this.experimentDirectory);
    return values
      .map(summarize)
      .filter((item): item is ExperimentSummary => Boolean(item && item.project_id === projectId))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }
}
