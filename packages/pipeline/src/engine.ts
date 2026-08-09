import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { CourseItem, DistillMode, JobState, Modality, Project, Skill, VideoAsset } from "../../contracts/src/index.js";
import { analyzeLesson, attachFramePaths, distillSkills } from "../../distillation/src/index.js";
import { LlmClient } from "../../llm/src/client.js";
import { discoverSource, downloadVideo, extractAudio, extractFrames, mediaDuration, safeUploadName } from "../../media/src/tools.js";
import { transcribeAudio, type Transcript } from "../../media/src/transcribe.js";
import type { PrivateSettings, SettingsStore } from "../../runtime-config/src/settings.js";
import { buildSkillSuite } from "../../skills/src/builder.js";
import { JobStore } from "../../store/src/jobStore.js";
import { LibraryStore } from "../../store/src/libraryStore.js";
import { ensureDir, readJson } from "../../store/src/fileStore.js";

interface IngestRequest { source_url: string; limit: number; upload_id?: string; language?: string; whisper_model?: string }
interface DistillRequest { video_ids: string[]; mode: DistillMode; modality: Modality }

function stem(index: number, id: string): string {
  return `${String(index + 1).padStart(3, "0")}-${id.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80)}`;
}

function jobCancelled(job: JobState): void {
  if (job.status === "cancelled") throw new Error("__ANYTEACHER_CANCELLED__");
}

export class UploadStore {
  constructor(readonly dataDir: string) {}
  directory(id: string): string { return join(this.dataDir, "uploads", id); }

  async save(filename: string, body: Buffer, uploadId?: string, maxMb = 4096): Promise<{ upload_id: string; filename: string; size: number }> {
    if (body.byteLength > maxMb * 1024 * 1024) throw new Error(`文件超过 ${maxMb} MB 限制`);
    const id = uploadId && /^[a-f0-9]{10,32}$/.test(uploadId) ? uploadId : randomBytes(6).toString("hex");
    const directory = this.directory(id);
    await ensureDir(directory);
    const name = safeUploadName(filename);
    const target = join(directory, name);
    await writeFile(target, body);
    return { upload_id: id, filename: name, size: body.byteLength };
  }

  async items(uploadId: string): Promise<CourseItem[]> {
    if (!/^[a-f0-9]{10,32}$/.test(uploadId)) throw new Error("上传批次无效");
    const directory = this.directory(uploadId);
    const files = await readdir(directory).catch(() => []);
    return files.filter((name) => !name.startsWith(".")).map((name, index) => ({
      id: `${uploadId}-${index + 1}`,
      source_url: `local://${uploadId}/${encodeURIComponent(name)}`,
      title: basename(name, extname(name)),
      index: index + 1,
      source: "local",
      metadata: { local_path: join(directory, name) },
    }));
  }
}

export class PipelineEngine {
  readonly uploads: UploadStore;
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    readonly root: string,
    readonly dataDir: string,
    readonly library: LibraryStore,
    readonly jobs: JobStore,
    readonly settings: SettingsStore,
  ) { this.uploads = new UploadStore(dataDir); }

  async createIngest(projectId: string, request: IngestRequest): Promise<JobState> {
    const project = await this.library.getProject(projectId);
    const job = await this.jobs.create({
      kind: "ingest",
      project_id: projectId,
      request: { ...request, subject: project.subject, grade: project.grade },
    });
    await this.jobs.event(job, "素材任务已创建 · TypeScript Job Engine");
    this.start(job.id, () => this.runIngest(job.id, request));
    return job;
  }

  async createDistill(projectId: string, request: DistillRequest): Promise<JobState> {
    await this.library.getProject(projectId);
    if (!request.video_ids.length) throw new Error("至少选择一个视频");
    if (request.mode === "single" && request.video_ids.length !== 1) throw new Error("单课模式必须且只能选择一个视频");
    if (request.mode === "common" && request.video_ids.length < 4) throw new Error("跨课共性模式至少需要四段课堂");
    for (const id of request.video_ids) {
      const video = await this.library.getVideo(id);
      if (video.project_id !== projectId) throw new Error("视频不属于当前项目");
    }
    const job = await this.jobs.create({
      kind: "distill",
      project_id: projectId,
      video_ids: request.video_ids,
      distill_mode: request.mode,
      distill_modality: request.modality,
      request: request as unknown as Record<string, unknown>,
    });
    await this.jobs.event(job, `蒸馏任务已创建 · ${request.modality === "multimodal" ? "文本＋视觉" : "纯文本"} · TypeScript Pipeline`);
    this.start(job.id, () => this.runDistill(job.id, request));
    return job;
  }

  private start(jobId: string, task: () => Promise<void>): void {
    const promise = task().catch(async (error) => {
      const job = await this.jobs.get(jobId);
      if (String(error?.message) === "__ANYTEACHER_CANCELLED__") {
        job.status = "cancelled";
        job.stage = "cancelled";
        await this.jobs.event(job, "任务已取消", "warning");
      } else {
        job.status = "failed";
        job.stage = "failed";
        job.error = error instanceof Error ? error.message : String(error);
        await this.jobs.event(job, job.error, "error");
      }
    }).finally(() => this.running.delete(jobId));
    this.running.set(jobId, promise);
  }

  async cancel(jobId: string): Promise<JobState> {
    const job = await this.jobs.get(jobId);
    if (["completed", "failed", "cancelled"].includes(job.status)) return job;
    job.status = "cancelled";
    job.stage = "cancelling";
    await this.jobs.event(job, "正在停止任务", "warning");
    return job;
  }

  private client(settings: PrivateSettings): LlmClient {
    return new LlmClient({
      baseUrl: settings.llm_base_url,
      apiKey: settings.llm_api_key,
      model: settings.llm_model,
      timeoutSeconds: settings.llm_timeout_seconds,
      maxAttempts: settings.llm_max_attempts,
    });
  }

  private async runIngest(jobId: string, request: IngestRequest): Promise<void> {
    const job = await this.jobs.get(jobId);
    const project = await this.library.getProject(String(job.project_id));
    const settings = await this.settings.private();
    await this.jobs.stage(job, "discover", .04, "正在解析课堂来源");
    const items = request.upload_id
      ? await this.uploads.items(request.upload_id)
      : await discoverSource(this.root, request.source_url, request.limit);
    if (!items.length) throw new Error("没有发现可处理的视频");
    job.items = items;
    await this.jobs.save(job);

    const mediaDir = join(this.dataDir, "media", job.id);
    const transcriptDir = join(this.dataDir, "transcripts", job.id);
    await Promise.all([mkdir(mediaDir, { recursive: true }), mkdir(transcriptDir, { recursive: true })]);
    const created: VideoAsset[] = [];
    for (let index = 0; index < items.length; index += 1) {
      Object.assign(job, await this.jobs.get(jobId));
      jobCancelled(job);
      const item = items[index];
      const itemStem = stem(index, item.id);
      job.current_item = index;
      await this.jobs.stage(job, "download", .08 + index / items.length * .62, `正在获取课堂 ${index + 1}/${items.length}：${item.title}`);
      const videoPath = await downloadVideo(this.root, item, mediaDir, itemStem);
      const duration = item.duration ?? await mediaDuration(this.root, videoPath);
      const audioPath = join(mediaDir, `${itemStem}.wav`);
      await this.jobs.stage(job, "audio", .18 + index / items.length * .62, "正在提取音频");
      await extractAudio(this.root, videoPath, audioPath);
      await this.jobs.stage(job, "transcribe", .28 + index / items.length * .62, `正在转写课堂 · ${settings.whisper_model}`);
      const transcript = await transcribeAudio({
        root: this.root,
        audioPath,
        outputDir: transcriptDir,
        stem: itemStem,
        model: request.whisper_model || settings.whisper_model,
        language: request.language || "zh",
        local: {
          command: settings.whisper_command,
          modelPath: settings.whisper_model_path,
        },
        remote: settings.llm_base_url && settings.llm_api_key
          ? { baseUrl: settings.llm_base_url, apiKey: settings.llm_api_key, model: "whisper-1" }
          : undefined,
      });
      const video = await this.library.addVideo({
        project_id: project.id,
        title: item.title,
        source_url: item.source_url,
        source: item.source,
        duration: duration ?? transcript.transcript.duration ?? null,
        cover_url: item.cover_url ?? null,
        status: "ready",
        job_id: job.id,
        course_item_id: item.id,
        artifacts: { video: videoPath, audio: audioPath, transcript_json: transcript.json, transcript_txt: transcript.text, transcript_srt: transcript.srt },
      });
      created.push(video);
      await this.jobs.event(job, `课堂已就绪：${item.title}`, "success");
    }
    job.artifacts = { ...(job.artifacts ?? {}), videos: created };
    job.status = "completed";
    job.stage = "completed";
    job.progress = 1;
    await this.jobs.event(job, `素材处理完成 · ${created.length} 段课堂`, "success");
  }

  private async runDistill(jobId: string, request: DistillRequest): Promise<void> {
    const job = await this.jobs.get(jobId);
    const project = await this.library.getProject(String(job.project_id));
    const settings = await this.settings.private();
    const client = this.client(settings);
    if (!client.configured) throw new Error("LLM API 尚未配置");
    const lessons: Array<{ title: string; videoId: string; analysis: Record<string, unknown>; frames: Array<{ frame_id: string; timestamp: number; path: string }> }> = [];
    for (let index = 0; index < request.video_ids.length; index += 1) {
      Object.assign(job, await this.jobs.get(jobId));
      jobCancelled(job);
      const video = await this.library.getVideo(request.video_ids[index]);
      const transcriptPath = video.artifacts?.transcript_json;
      const videoPath = video.artifacts?.video;
      if (!transcriptPath) throw new Error(`缺少转写：${video.title}`);
      const transcript = await readJson<Transcript>(transcriptPath);
      await this.jobs.stage(job, "evidence", .05 + index / request.video_ids.length * .48, `正在恢复课堂证据 ${index + 1}/${request.video_ids.length}`);
      const frames = request.modality === "multimodal" && videoPath
        ? await extractFrames(this.root, videoPath, join(this.dataDir, "visual", job.id, video.id), video.duration ?? null, 6)
        : [];
      const analysis = await analyzeLesson(client, { title: video.title, subject: project.subject, transcript, frames });
      const analysisPath = join(this.dataDir, "analysis", job.id, `${video.id}.json`);
      await writeFile(analysisPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8").catch(async () => { await ensureDir(join(this.dataDir, "analysis", job.id)); await writeFile(analysisPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8"); });
      lessons.push({ title: video.title, videoId: video.id, analysis, frames });
    }
    await this.jobs.stage(job, "distill", .62, "正在归纳 Teaching Transitions");
    let suite = await distillSkills(client, project.subject, lessons.map(({ title, analysis }) => ({ title, analysis })), request.mode);
    suite = attachFramePaths(suite, lessons);
    await this.jobs.stage(job, "compile", .84, "正在编译并验证 Skills");
    const outputRoot = join(this.dataDir, "projects", project.id, "skills", job.id);
    const skills = await buildSkillSuite({
      suite,
      outputRoot,
      subject: project.subject,
      provenance: {
        job_id: job.id,
        project_id: project.id,
        video_ids: request.video_ids,
        mode: request.mode,
        modality: request.modality,
        model: settings.llm_model,
        schema_version: "teaching-transition-v1",
      },
    });
    job.artifacts = { ...(job.artifacts ?? {}), skills_dir: outputRoot, skills, suite };
    job.status = "completed";
    job.stage = "completed";
    job.progress = 1;
    await this.jobs.event(job, `Skill 蒸馏完成 · ${skills.length} 个能力`, "success");
  }

  async deleteProject(projectId: string, permanent = false): Promise<Record<string, unknown>> {
    const videos = await this.library.listVideos(projectId, true);
    const projectJobs = (await this.jobs.list()).filter((job) => job.project_id === projectId);
    if (!permanent) {
      await this.library.deleteProject(projectId);
      return { deleted: true, permanent: false, released_bytes: 0, video_count: videos.length, job_count: projectJobs.length };
    }
    let released = 0;
    const roots = new Set<string>();
    for (const video of videos) for (const path of Object.values(video.artifacts ?? {})) if (path) roots.add(resolve(path));
    roots.add(join(this.dataDir, "projects", projectId));
    for (const path of roots) {
      try { released += (await stat(path)).size; } catch { /* directories are counted coarsely */ }
      await rm(path, { recursive: true, force: true });
    }
    await this.library.purgeProjectCatalog(projectId);
    return { deleted: true, permanent: true, released_bytes: released, video_count: videos.length, job_count: projectJobs.length };
  }
}
