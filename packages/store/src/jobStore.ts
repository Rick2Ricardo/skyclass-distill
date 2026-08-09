import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { JobEvent, JobState } from "../../contracts/src/index.js";
import { listJson, readJson, writeJson } from "./fileStore.js";

function now(): string { return new Date().toISOString(); }

export type NewJob = Partial<JobState> & Pick<JobState, "kind">;

export class JobStore {
  readonly directory: string;

  constructor(dataDir: string) { this.directory = join(dataDir, "jobs"); }

  async create(input: NewJob): Promise<JobState> {
    const timestamp = now();
    const { kind, ...values } = input;
    const job: JobState = {
      id: randomBytes(5).toString("hex"),
      status: "queued",
      stage: "queued",
      progress: 0,
      kind,
      project_id: input.project_id ?? null,
      video_ids: input.video_ids ?? [],
      events: input.events ?? [],
      error: null,
      created_at: timestamp,
      updated_at: timestamp,
      artifacts: input.artifacts ?? {},
      ...values,
    };
    await this.save(job);
    return job;
  }

  async save(job: JobState): Promise<JobState> {
    job.updated_at = now();
    await writeJson(join(this.directory, `${job.id}.json`), job);
    return job;
  }

  async get(jobId: string): Promise<JobState> {
    return readJson<JobState>(join(this.directory, `${jobId}.json`));
  }

  async list(): Promise<JobState[]> {
    const jobs = await listJson<JobState>(this.directory);
    return jobs.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }

  async update(jobId: string, values: Partial<JobState>): Promise<JobState> {
    const job = await this.get(jobId);
    Object.assign(job, values);
    return this.save(job);
  }

  async event(job: JobState, message: string, level: JobEvent["level"] = "info"): Promise<void> {
    job.events = [...(job.events ?? []), { time: now(), level, message }].slice(-200);
    await this.save(job);
  }

  async stage(job: JobState, stage: string, progress: number, message: string): Promise<void> {
    job.stage = stage;
    job.progress = Math.max(0, Math.min(1, progress));
    job.status = "running";
    await this.event(job, message);
  }
}
