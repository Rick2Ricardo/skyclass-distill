import Fastify, { type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { createReadStream, existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
  ExperimentRun,
  Health,
  JobState,
  Project,
  RuntimeSettings,
  Skill,
  SkillDetail,
  TutorMode,
  TutorResult,
  VideoAsset,
} from "../../../packages/contracts/src/index.js";
import { LlmClient } from "../../../packages/llm/src/client.js";
import { discoverSource, runtimeStatus } from "../../../packages/media/src/tools.js";
import { PipelineEngine } from "../../../packages/pipeline/src/engine.js";
import { SettingsStore } from "../../../packages/runtime-config/src/settings.js";
import { JobStore } from "../../../packages/store/src/jobStore.js";
import { LibraryStore } from "../../../packages/store/src/libraryStore.js";
import { DATA_DIR, PORT, ROOT, WEB_DIST_DIR } from "./config.js";
import { TutorService } from "./services/tutorService.js";

type RequestBody = Record<string, unknown>;

const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 * 1024 });
const library = new LibraryStore(DATA_DIR);
const jobs = new JobStore(DATA_DIR);
const settings = new SettingsStore(ROOT, DATA_DIR);
const pipeline = new PipelineEngine(ROOT, DATA_DIR, library, jobs, settings);
const tutor = new TutorService(library, jobs, settings);
const webRoot = WEB_DIST_DIR;

app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
app.addContentTypeParser(/^(?:video|audio)\//, { parseAs: "buffer" }, (_request, body, done) => done(null, body));
if (existsSync(webRoot)) await app.register(fastifyStatic, { root: webRoot, prefix: "/" });

function bodyOf(request: FastifyRequest): RequestBody {
  return request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body) ? request.body as RequestBody : {};
}

function paramsOf<T>(request: FastifyRequest): T { return request.params as T; }

function httpError(reply: any, error: unknown, fallback = 400): any {
  const message = error instanceof Error ? error.message : String(error);
  const status = /不存在|not found/i.test(message) ? 404 : fallback;
  return reply.code(status).send({ detail: message });
}

function inside(root: string, path: string): boolean {
  const value = relative(resolve(root), resolve(path));
  return value === "" || (!value.startsWith("..") && !value.startsWith("/") && !value.startsWith("\\"));
}

app.get("/api/health", async (): Promise<Health> => {
  const [runtime, privateSettings] = await Promise.all([runtimeStatus(ROOT), settings.private()]);
  const apiConfigured = Boolean(privateSettings.llm_base_url && privateSettings.llm_api_key && privateSettings.llm_model);
  const mediaReady = Boolean(runtime.ffmpeg && runtime.ffprobe && runtime.yt_dlp && (runtime.whisper_cli || apiConfigured));
  return {
    ok: true,
    studio: "anyteacher",
    backend: "node",
    ts_runtime: true,
    media_ready: mediaReady,
    media_runtime: {
      ffmpeg: Boolean(runtime.ffmpeg),
      ffprobe: Boolean(runtime.ffprobe),
      yt_dlp: Boolean(runtime.yt_dlp),
      whisper_cpp: Boolean(runtime.whisper_cli),
    },
    api_configured: apiConfigured,
    pi_agent: true,
    model: privateSettings.llm_model,
  };
});

app.get("/api/settings", async (): Promise<RuntimeSettings> => settings.public());
app.put("/api/settings", async (request): Promise<RuntimeSettings> => settings.save(bodyOf(request)));
app.post("/api/settings/test", async (request, reply) => {
  try {
    const body = bodyOf(request);
    const current = await settings.private();
    const client = new LlmClient({
      baseUrl: String(body.llm_base_url || current.llm_base_url),
      apiKey: String(body.llm_api_key || current.llm_api_key),
      model: String(body.llm_model || current.llm_model),
      timeoutSeconds: Number(body.llm_timeout_seconds || current.llm_timeout_seconds),
      maxAttempts: 1,
    });
    return await client.test();
  } catch (error) { return httpError(reply, error, 502); }
});

app.get("/api/sources", async () => ({
  sites: ["bilibili.com", "youtube.com", "youtu.be", "公开的 yt-dlp 兼容站点"],
  notice: "仅处理公开、无 DRM 且用户有权使用的课堂素材。",
}));
app.post("/api/discover", async (request, reply) => {
  try {
    const body = bodyOf(request);
    return { items: await discoverSource(ROOT, String(body.url || ""), Number(body.limit || 5)) };
  } catch (error) { return httpError(reply, error); }
});

app.get("/api/projects", async (): Promise<Project[]> => {
  const allJobs = await jobs.list();
  return Promise.all((await library.listProjects()).map(async (project) => ({
    ...project,
    video_count: (await library.listVideos(project.id)).length,
    skill_count: (await Promise.all(allJobs.filter((job) => job.project_id === project.id && job.kind === "distill" && job.status === "completed").flatMap((job) => {
      const values = Array.isArray(job.artifacts?.skills) ? job.artifacts.skills as Array<Record<string, unknown>> : [];
      return values.map(async (skill) => await library.skillDeleted(job.id, String(skill.name || "")) ? 0 : 1);
    }))).reduce<number>((sum, value) => sum + value, 0),
  })));
});

app.post("/api/projects", async (request, reply): Promise<Project | unknown> => {
  try {
    const body = bodyOf(request);
    const name = String(body.name || "").trim();
    if (!name) return reply.code(422).send({ detail: "项目名称不能为空" });
    return { ...(await library.createProject({ name, subject: String(body.subject || "高中物理"), grade: String(body.grade || "高中"), description: String(body.description || "") })), video_count: 0, skill_count: 0 };
  } catch (error) { return httpError(reply, error); }
});

app.get("/api/projects/:id", async (request, reply): Promise<Project | unknown> => {
  try {
    const project = await library.getProject(paramsOf<{ id: string }>(request).id);
    return { ...project, video_count: (await library.listVideos(project.id)).length, skill_count: (await tutor.listSkills(project.id)).length };
  } catch (error) { return httpError(reply, error); }
});

app.delete("/api/projects/:id", async (request, reply) => {
  try {
    const permanent = String((request.query as Record<string, unknown>).permanent || "false") === "true";
    return await pipeline.deleteProject(paramsOf<{ id: string }>(request).id, permanent);
  } catch (error) { return httpError(reply, error); }
});

app.get("/api/projects/:id/videos", async (request, reply): Promise<VideoAsset[] | unknown> => {
  try {
    const id = paramsOf<{ id: string }>(request).id;
    await library.getProject(id);
    return await library.listVideos(id);
  } catch (error) { return httpError(reply, error); }
});

app.post("/api/projects/:id/videos", async (request, reply): Promise<JobState | unknown> => {
  try {
    const body = bodyOf(request);
    return await pipeline.createIngest(paramsOf<{ id: string }>(request).id, {
      source_url: String(body.source_url || ""),
      limit: Math.max(1, Math.min(50, Number(body.limit || 1))),
      language: String(body.language || "zh"),
      whisper_model: typeof body.whisper_model === "string" ? body.whisper_model : undefined,
    });
  } catch (error) { return httpError(reply, error); }
});

app.delete("/api/projects/:id/videos", async (request, reply) => {
  try {
    const body = bodyOf(request);
    const ids = Array.isArray(body.video_ids) ? body.video_ids.map(String) : [];
    return { deleted_count: (await library.deleteVideos(paramsOf<{ id: string }>(request).id, ids)).length, video_ids: ids };
  } catch (error) { return httpError(reply, error); }
});

app.post("/api/uploads", async (request, reply) => {
  try {
    if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ detail: "上传内容为空" });
    const query = request.query as Record<string, unknown>;
    const current = await settings.private();
    return await pipeline.uploads.save(String(query.filename || "upload.mp4"), request.body, typeof query.upload_id === "string" ? query.upload_id : undefined, current.max_upload_size_mb);
  } catch (error) { return httpError(reply, error); }
});

app.post("/api/projects/:id/videos/local", async (request, reply): Promise<JobState | unknown> => {
  try {
    const body = bodyOf(request);
    const uploadId = String(body.upload_id || "");
    return await pipeline.createIngest(paramsOf<{ id: string }>(request).id, {
      source_url: `local://${uploadId}`,
      upload_id: uploadId,
      limit: 50,
      language: String(body.language || "zh"),
      whisper_model: typeof body.whisper_model === "string" ? body.whisper_model : undefined,
    });
  } catch (error) { return httpError(reply, error); }
});

app.post("/api/projects/:id/distill", async (request, reply): Promise<JobState | unknown> => {
  try {
    const body = bodyOf(request);
    return await pipeline.createDistill(paramsOf<{ id: string }>(request).id, {
      video_ids: Array.isArray(body.video_ids) ? body.video_ids.map(String) : [],
      mode: body.mode === "common" ? "common" : "single",
      modality: body.modality === "multimodal" ? "multimodal" : "text",
    });
  } catch (error) { return httpError(reply, error); }
});

app.get("/api/projects/:id/skills", async (request, reply): Promise<Skill[] | unknown> => {
  try { return await tutor.listSkills(paramsOf<{ id: string }>(request).id); }
  catch (error) { return httpError(reply, error); }
});

app.delete("/api/projects/:projectId/skills/:jobId/:skillName", async (request, reply) => {
  try {
    const { projectId, jobId, skillName } = paramsOf<{ projectId: string; jobId: string; skillName: string }>(request);
    const job = await jobs.get(jobId);
    if (job.project_id !== projectId) return reply.code(400).send({ detail: "Skill 不属于当前项目" });
    await library.deleteSkill(jobId, skillName);
    return { deleted: true, job_id: jobId, skill_name: skillName };
  } catch (error) { return httpError(reply, error); }
});

app.get("/api/jobs", async (): Promise<JobState[]> => jobs.list());
app.get("/api/jobs/:id", async (request, reply): Promise<JobState | unknown> => {
  try { return await jobs.get(paramsOf<{ id: string }>(request).id); }
  catch (error) { return httpError(reply, error); }
});
app.post("/api/jobs/:id/cancel", async (request, reply): Promise<JobState | unknown> => {
  try { return await pipeline.cancel(paramsOf<{ id: string }>(request).id); }
  catch (error) { return httpError(reply, error); }
});

function skillFromJob(job: JobState, skillName: string): Skill {
  const values = Array.isArray(job.artifacts?.skills) ? job.artifacts.skills : [];
  const raw = values.find((item) => item && typeof item === "object" && String((item as Record<string, unknown>).name) === skillName);
  if (!raw) throw new Error("Skill 不存在");
  return raw as unknown as Skill;
}

app.get("/api/jobs/:jobId/skills/:skillName", async (request, reply): Promise<SkillDetail | unknown> => {
  try {
    const { jobId, skillName } = paramsOf<{ jobId: string; skillName: string }>(request);
    const skill = skillFromJob(await jobs.get(jobId), skillName);
    if (!skill.path || !inside(DATA_DIR, skill.path)) throw new Error("Skill 路径无效");
    const files: Record<string, string> = {
      skill: join(skill.path, "SKILL.md"), pattern: join(skill.path, "references", "pattern.md"),
      evidence: join(skill.path, "references", "evidence.md"), visual: join(skill.path, "references", "visual-evidence.md"),
      code: join(skill.path, "references", "executable-asset.md"),
    };
    const documents: Record<string, string> = {};
    for (const [key, path] of Object.entries(files)) documents[key] = await readFile(path, "utf8").catch(() => "");
    return { name: skill.name, display_name: skill.display_name || skill.name, valid: skill.valid !== false, errors: skill.errors ?? [], documents };
  } catch (error) { return httpError(reply, error); }
});

// Download stays dependency-free: the endpoint returns the canonical Skill file
// until the TS ZIP packager lands; all runtime data remains available via detail API.
app.get("/api/jobs/:jobId/skills/:skillName/download", async (request, reply) => {
  try {
    const { jobId, skillName } = paramsOf<{ jobId: string; skillName: string }>(request);
    const skill = skillFromJob(await jobs.get(jobId), skillName);
    if (!skill.path || !inside(DATA_DIR, skill.path)) throw new Error("Skill 路径无效");
    reply.header("Content-Disposition", `attachment; filename="${skillName}.md"`).type("text/markdown; charset=utf-8");
    return reply.send(createReadStream(join(skill.path, "SKILL.md")));
  } catch (error) { return httpError(reply, error); }
});

app.post("/api/tutor", async (request, reply): Promise<TutorResult | unknown> => {
  try {
    const body = bodyOf(request);
    const projectId = typeof body.project_id === "string" ? body.project_id : "";
    if (!projectId) return reply.code(400).send({ detail: "缺少项目" });
    return await tutor.answer(projectId, body);
  } catch (error) { return httpError(reply, error, 502); }
});

app.post("/api/experiments/compare", async (request, reply): Promise<ExperimentRun | unknown> => {
  try {
    const body = bodyOf(request);
    const projectId = typeof body.project_id === "string" ? body.project_id : "";
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const modes = Array.isArray(body.modes) ? body.modes.filter((mode): mode is TutorMode => ["base", "text_skill", "multimodal_skill"].includes(String(mode))) : undefined;
    if (!projectId) return reply.code(400).send({ detail: "缺少项目" });
    if (question.length < 4) return reply.code(400).send({ detail: "请输入至少 4 个字符的实验问题" });
    return await tutor.compare(projectId, question, modes);
  } catch (error) { return httpError(reply, error, 502); }
});

app.get("/api/projects/:id/qa", async (request) => (await jobs.list()).filter((job) => job.project_id === paramsOf<{ id: string }>(request).id && job.kind === "qa"));

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith("/api/")) return reply.code(404).send({ detail: "Not found" });
  if (existsSync(join(webRoot, "index.html"))) return reply.sendFile("index.html");
  return reply.code(503).type("text/plain").send("AnyTeacher Studio 尚未构建，请运行 npm run build:web");
});

await app.listen({ host: "127.0.0.1", port: PORT });
console.log(`AnyTeacher Studio running at http://127.0.0.1:${PORT}`);
