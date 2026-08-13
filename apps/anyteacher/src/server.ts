import Fastify, { type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type {
  BenchmarkDataset,
  BoardEvidenceBundle,
  ExperimentRun,
  ExperimentSummary,
  GoldReviewDecisionInput,
  GoldReviewPackageSignoffInput,
  GoldReviewQueue,
  Health,
  JobState,
  Project,
  RuntimeSettings,
  Skill,
  SkillDetail,
  TutorMode,
  TutorConversation,
  TutorConversationSummary,
  TutorResult,
  TutorStreamEvent,
  VideoAsset,
} from "../../../packages/contracts/src/index.js";
import { canonicalBoardEvidencePayload, validateBoardEvidenceBundle } from "../../../packages/contracts/src/index.js";
import { prepareGroundedVisualEvidence } from "../../../packages/distillation/src/index.js";
import { LlmClient } from "../../../packages/llm/src/client.js";
import { discoverSource, runtimeStatus } from "../../../packages/media/src/tools.js";
import { decodeControlledAssetUri } from "../../../packages/media/src/imageEvidence.js";
import { PipelineEngine } from "../../../packages/pipeline/src/engine.js";
import { SettingsStore } from "../../../packages/runtime-config/src/settings.js";
import { JobStore } from "../../../packages/store/src/jobStore.js";
import { LibraryStore } from "../../../packages/store/src/libraryStore.js";
import { EvaluationStore } from "../../../packages/store/src/evaluationStore.js";
import { ConversationStore } from "../../../packages/store/src/conversationStore.js";
import { GoldReviewStore } from "../../../packages/store/src/goldReviewStore.js";
import { DATA_DIR, PORT, ROOT, WEB_DIST_DIR } from "./config.js";
import { TutorService } from "./services/tutorService.js";

type RequestBody = Record<string, unknown>;

const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 * 1024 });
const library = new LibraryStore(DATA_DIR);
const jobs = new JobStore(DATA_DIR);
const evaluations = new EvaluationStore(ROOT, DATA_DIR);
const conversations = new ConversationStore(DATA_DIR);
const goldReviews = new GoldReviewStore(ROOT, DATA_DIR);
const settings = new SettingsStore(ROOT, DATA_DIR);
const pipeline = new PipelineEngine(ROOT, DATA_DIR, library, jobs, settings);
const tutor = new TutorService(library, jobs, settings);
const webRoot = WEB_DIST_DIR;
const activeConversationRuns = new Set<string>();

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

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function stagingUsage(root: string): Promise<{ files: number; bytes: number }> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  let files = 0;
  let bytes = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    files += 1;
    bytes += (await stat(resolve(entry.parentPath, entry.name))).size;
  }
  return { files, bytes };
}

function tutorHistory(conversation: TutorConversation): Array<{ question: string; answer: string }> {
  return conversation.turns.map((turn) => {
    const blackboard = turn.result.artifacts.map((artifact) => `${artifact.kind}「${artifact.title}」：${artifact.summary}`);
    return {
      question: turn.question,
      answer: [
        turn.result.answer.answer,
        blackboard.length ? `[本轮黑板记录]\n${blackboard.join("\n")}` : "",
      ].filter(Boolean).join("\n\n"),
    };
  });
}

async function withConversationRun<T>(conversationId: string, run: () => Promise<T>): Promise<T> {
  if (activeConversationRuns.has(conversationId)) throw new Error("当前会话已有一轮教学正在运行，请等待完成或先停止");
  activeConversationRuns.add(conversationId);
  try {
    return await run();
  } finally {
    activeConversationRuns.delete(conversationId);
  }
}

app.get("/api/health", async (): Promise<Health> => {
  const [runtime, privateSettings] = await Promise.all([runtimeStatus(ROOT), settings.private()]);
  const apiConfigured = Boolean(privateSettings.llm_base_url && privateSettings.llm_api_key && privateSettings.llm_model);
  const mediaReady = Boolean(runtime.ffmpeg && runtime.ffprobe && runtime.yt_dlp && (runtime.whisper_cli || apiConfigured));
  return {
    ok: true,
    studio: "skyclass",
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

app.get("/api/gold-review", async (_request, reply): Promise<GoldReviewQueue | unknown> => {
  try { return await goldReviews.queue(); }
  catch (error) { return httpError(reply, error, 500); }
});

app.get("/api/gold-review/compile-readiness", async (_request, reply) => {
  try { return await goldReviews.compileReadiness(); }
  catch (error) { return httpError(reply, error); }
});

app.get("/api/gold-review/evidence", async (request, reply) => {
  try {
    const query = request.query as Record<string, unknown>;
    const item = await goldReviews.evidence(String(query.package_id || ""), String(query.group_id || ""), Number(query.index));
    reply.header("Cache-Control", "private, no-store");
    reply.type(item.mime);
    return reply.send(item.bytes);
  } catch (error) { return httpError(reply, error); }
});

app.post("/api/gold-review/decisions", async (request, reply) => {
  try { return await goldReviews.decide(bodyOf(request) as unknown as GoldReviewDecisionInput); }
  catch (error) { return httpError(reply, error); }
});

app.post("/api/gold-review/package-signoffs", async (request, reply) => {
  try { return await goldReviews.signPackage(bodyOf(request) as unknown as GoldReviewPackageSignoffInput); }
  catch (error) { return httpError(reply, error); }
});

app.post("/api/gold-review/compile", async (_request, reply) => {
  try { return await goldReviews.compileDataset(); }
  catch (error) { return httpError(reply, error); }
});
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

app.post("/api/evidence-staging", { bodyLimit: 12 * 1024 * 1024 }, async (request, reply): Promise<{ staging_id: string; relative_path: string } | unknown> => {
  try {
    if (!Buffer.isBuffer(request.body)) throw new Error("证据文件内容为空");
    if (request.body.byteLength > 12 * 1024 * 1024) throw new Error("单个证据文件不得超过 12 MB");
    const query = request.query as Record<string, unknown>;
    const relativePath = decodeControlledAssetUri(String(query.relative_path || ""));
    const suppliedId = String(query.staging_id || "");
    const stagingId = suppliedId || randomUUID().replace(/-/g, "").slice(0, 20);
    if (!/^[a-f0-9]{20}$/.test(stagingId)) throw new Error("evidence staging id 无效");
    const stagingRoot = join(DATA_DIR, "evidence-staging", stagingId);
    const target = resolve(stagingRoot, relativePath);
    if (!inside(stagingRoot, target)) throw new Error("证据文件路径超出 staging 目录");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, request.body, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") throw new Error(`证据包包含重复路径：${relativePath}`);
      throw error;
    });
    const usage = await stagingUsage(stagingRoot);
    if (usage.files > 256 || usage.bytes > 200 * 1024 * 1024) {
      await rm(stagingRoot, { recursive: true, force: true });
      throw new Error("证据包超过 256 个文件或 200 MB 总限制，临时上传已清理");
    }
    return { staging_id: stagingId, relative_path: relativePath };
  } catch (error) { return httpError(reply, error); }
});

app.post("/api/projects/:projectId/videos/:videoId/board-bundle", async (request, reply): Promise<VideoAsset | unknown> => {
  let stagingRootToClean: string | null = null;
  try {
    const { projectId, videoId } = paramsOf<{ projectId: string; videoId: string }>(request);
    const video = await library.getVideo(videoId);
    if (video.project_id !== projectId) throw new Error("视频不属于当前项目");
    const body = bodyOf(request);
    const stagingId = String(body.staging_id || "");
    if (!/^[a-f0-9]{20}$/.test(stagingId)) throw new Error("必须上传完整 evidence package；不再接受会丢失图片路径的裸 JSON");
    const bundlePath = decodeControlledAssetUri(String(body.bundle_path || "bundle.json"));
    const stagingRoot = join(DATA_DIR, "evidence-staging", stagingId);
    stagingRootToClean = stagingRoot;
    const stagedBundlePath = resolve(stagingRoot, bundlePath);
    if (!inside(stagingRoot, stagedBundlePath)) throw new Error("bundle_path 超出 staging 目录");
    const resolvedStaging = await realpath(stagingRoot).catch(() => { throw new Error("evidence staging 不存在"); });
    const resolvedBundlePath = await realpath(stagedBundlePath).catch(() => { throw new Error("evidence package 中找不到 bundle JSON"); });
    if (!inside(resolvedStaging, resolvedBundlePath)) throw new Error("bundle_path 超出 staging 目录");
    const bundle = JSON.parse(await readFile(resolvedBundlePath, "utf8")) as BoardEvidenceBundle;
    const report = validateBoardEvidenceBundle(bundle);
    if (!report.valid) throw new Error(`BoardEvidenceBundle 未通过校验：${report.issues.slice(0, 6).map((issue) => `${issue.path} ${issue.message}`).join("；")}`);
    const actualPayloadHash = createHash("sha256").update(canonicalBoardEvidencePayload(bundle)).digest("hex");
    if (actualPayloadHash !== bundle.payload_sha256) throw new Error("BoardEvidenceBundle payload_sha256 与规范化内容不匹配");
    if (!bundle.transitions.some((transition) => transition.status === "accepted")) throw new Error("板书包尚无 accepted transition，不能绑定到蒸馏入口");
    const sourceUri = video.artifacts?.video;
    if (!sourceUri || !inside(DATA_DIR, sourceUri)) throw new Error("课堂源视频路径无效，无法校验板书包");
    const sourcePath = await realpath(sourceUri).catch(() => { throw new Error("课堂源视频不存在，无法校验板书包"); });
    if (!inside(await realpath(DATA_DIR).catch(() => DATA_DIR), sourcePath)) throw new Error("课堂源视频路径无效，无法校验板书包");
    if (await sha256File(sourcePath) !== bundle.source.video.sha256) throw new Error("板书包与所选课堂的视频 SHA-256 不匹配");
    await prepareGroundedVisualEvidence(bundle, resolvedBundlePath);
    const targetRoot = join(DATA_DIR, "projects", projectId, "evidence", videoId, bundle.payload_sha256);
    const targetBundle = join(targetRoot, bundlePath);
    if (existsSync(targetRoot)) {
      const existingBundle = await realpath(targetBundle).catch(() => { throw new Error("同 hash 证据包目录已存在但内容不完整"); });
      const existing = JSON.parse(await readFile(existingBundle, "utf8")) as BoardEvidenceBundle;
      if (existing.payload_sha256 !== bundle.payload_sha256) throw new Error("同 hash 证据包的 payload_sha256 声明冲突");
      if (createHash("sha256").update(canonicalBoardEvidencePayload(existing)).digest("hex") !== bundle.payload_sha256) {
        throw new Error("同 hash 证据包目录内容冲突");
      }
      await prepareGroundedVisualEvidence(existing, existingBundle);
      await rm(stagingRoot, { recursive: true, force: true });
      stagingRootToClean = null;
    } else {
      await mkdir(dirname(targetRoot), { recursive: true });
      await rename(stagingRoot, targetRoot);
      stagingRootToClean = null;
    }
    video.artifacts = { ...(video.artifacts ?? {}), board_bundle_json: targetBundle };
    await library.saveVideo(video);
    return video;
  } catch (error) {
    if (stagingRootToClean) await rm(stagingRootToClean, { recursive: true, force: true }).catch(() => undefined);
    return httpError(reply, error);
  }
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
      evidence_mode: body.evidence_mode === "temporal_board" ? "temporal_board" : body.evidence_mode === "static_frames" || body.modality === "multimodal" ? "static_frames" : "text",
    });
  } catch (error) { return httpError(reply, error); }
});

app.post("/api/projects/:id/distill-signed-gold", async (request, reply): Promise<JobState | unknown> => {
  try {
    const body = bodyOf(request);
    return await pipeline.createSignedGoldDistill(paramsOf<{ id: string }>(request).id, {
      dataset_uri: String(body.dataset_uri || ""),
      lesson_id: String(body.lesson_id || ""),
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

app.get("/api/projects/:id/conversations", async (request, reply): Promise<TutorConversationSummary[] | unknown> => {
  try {
    const projectId = paramsOf<{ id: string }>(request).id;
    await library.getProject(projectId);
    return await conversations.list(projectId);
  } catch (error) { return httpError(reply, error); }
});

app.post("/api/projects/:id/conversations", async (request, reply): Promise<TutorConversation | unknown> => {
  try {
    const projectId = paramsOf<{ id: string }>(request).id;
    await library.getProject(projectId);
    const body = bodyOf(request);
    return await conversations.create(projectId, typeof body.title === "string" ? body.title : undefined);
  } catch (error) { return httpError(reply, error); }
});

app.get("/api/projects/:projectId/conversations/:conversationId", async (request, reply): Promise<TutorConversation | unknown> => {
  try {
    const { projectId, conversationId } = paramsOf<{ projectId: string; conversationId: string }>(request);
    return await conversations.get(projectId, conversationId);
  } catch (error) { return httpError(reply, error); }
});

app.patch("/api/projects/:projectId/conversations/:conversationId", async (request, reply): Promise<TutorConversation | unknown> => {
  try {
    const { projectId, conversationId } = paramsOf<{ projectId: string; conversationId: string }>(request);
    const title = String(bodyOf(request).title || "");
    return await conversations.rename(projectId, conversationId, title);
  } catch (error) { return httpError(reply, error); }
});

app.delete("/api/projects/:projectId/conversations/:conversationId", async (request, reply) => {
  try {
    const { projectId, conversationId } = paramsOf<{ projectId: string; conversationId: string }>(request);
    await conversations.delete(projectId, conversationId);
    return { deleted: true, id: conversationId };
  } catch (error) { return httpError(reply, error); }
});

app.post("/api/projects/:projectId/conversations/:conversationId/turns", async (request, reply): Promise<TutorConversation | unknown> => {
  try {
    const { projectId, conversationId } = paramsOf<{ projectId: string; conversationId: string }>(request);
    const body = bodyOf(request);
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const mode: TutorMode = ["base", "text_skill", "multimodal_skill"].includes(String(body.mode)) ? body.mode as TutorMode : "multimodal_skill";
    if (question.length < 4) return reply.code(400).send({ detail: "请输入至少 4 个字符的问题" });
    return await withConversationRun(conversationId, async () => {
      const conversation = await conversations.get(projectId, conversationId);
      const history = tutorHistory(conversation);
      const result = await tutor.answer(projectId, { ...body, question, mode, history, conversation_id: conversationId });
      return await conversations.append(projectId, conversationId, question, mode, result);
    });
  } catch (error) { return httpError(reply, error, 502); }
});

app.post("/api/projects/:projectId/conversations/:conversationId/turns/stream", async (request, reply): Promise<void> => {
  const { projectId, conversationId } = paramsOf<{ projectId: string; conversationId: string }>(request);
  const body = bodyOf(request);
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const mode: TutorMode = ["base", "text_skill", "multimodal_skill"].includes(String(body.mode)) ? body.mode as TutorMode : "multimodal_skill";
  const runId = randomUUID();
  let seq = 0;
  const send = (event: TutorStreamEvent): void => {
    if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.write(`${JSON.stringify(event)}\n`);
  };

  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const controller = new AbortController();
  reply.raw.on("close", () => {
    if (!reply.raw.writableEnded) controller.abort();
  });

  try {
    if (question.length < 4) throw new Error("请输入至少 4 个字符的问题");
    const updated = await withConversationRun(conversationId, async () => {
      const conversation = await conversations.get(projectId, conversationId);
      const history = tutorHistory(conversation);
      const result = await tutor.answer(
        projectId,
        { ...body, question, mode, history, conversation_id: conversationId },
        {
          signal: controller.signal,
          onEvent: async (event) => send({
            type: "runtime",
            seq: ++seq,
            run_id: runId,
            conversation_id: conversationId,
            event,
          }),
        },
      );
      return await conversations.append(projectId, conversationId, question, mode, result);
    });
    send({ type: "complete", seq: ++seq, run_id: runId, conversation_id: conversationId, conversation: updated });
  } catch (error) {
    send({
      type: "error",
      seq: ++seq,
      run_id: runId,
      conversation_id: conversationId,
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (!reply.raw.writableEnded) reply.raw.end();
  }
});

app.post("/api/experiments/compare", async (request, reply): Promise<ExperimentRun | unknown> => {
  try {
    const body = bodyOf(request);
    const projectId = typeof body.project_id === "string" ? body.project_id : "";
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const modes = Array.isArray(body.modes) ? body.modes.filter((mode): mode is TutorMode => ["base", "text_skill", "multimodal_skill"].includes(String(mode))) : undefined;
    if (!projectId) return reply.code(400).send({ detail: "缺少项目" });
    if (question.length < 4) return reply.code(400).send({ detail: "请输入至少 4 个字符的实验问题" });
    const run = await tutor.compare(projectId, question, modes);
    run.benchmark_id = typeof body.benchmark_id === "string" ? body.benchmark_id : undefined;
    run.scenario_id = typeof body.scenario_id === "string" ? body.scenario_id : undefined;
    await evaluations.saveRun(run);
    return run;
  } catch (error) { return httpError(reply, error, 502); }
});

app.get("/api/evaluations/datasets", async (): Promise<BenchmarkDataset[]> => evaluations.listDatasets());
app.get("/api/projects/:id/experiments", async (request): Promise<ExperimentSummary[]> => (
  evaluations.listRuns(paramsOf<{ id: string }>(request).id)
));

app.get("/api/projects/:id/qa", async (request) => (await jobs.list()).filter((job) => job.project_id === paramsOf<{ id: string }>(request).id && job.kind === "qa"));

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith("/api/")) return reply.code(404).send({ detail: "Not found" });
  if (existsSync(join(webRoot, "index.html"))) return reply.sendFile("index.html");
  return reply.code(503).type("text/plain").send("SkyClass Distill 尚未构建，请运行 npm run build:web");
});

await app.listen({ host: "127.0.0.1", port: PORT });
console.log(`SkyClass Distill running at http://127.0.0.1:${PORT}`);
