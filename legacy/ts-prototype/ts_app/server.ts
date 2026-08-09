import Fastify, { type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runPiAgent } from "./services/piRuntime.js";
import type { DeliveryAudit, Modality, Project, Skill, TutorMode, TutorResult } from "./shared/types.js";

const ROOT = resolve(process.cwd());
const PYTHON_URL = process.env.PYTHON_URL ?? "http://127.0.0.1:8000";
const DATA_DIR = resolve(process.env.DATA_DIR ?? join(ROOT, "data"));
const PORT = Number(process.env.PORT ?? 3000);

type Json = Record<string, unknown>;

function readEnvFile(): Record<string, string> {
  const values: Record<string, string> = {};
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return values;
  for (const line of requireText(path).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?([^"']*)["']?\s*$/);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

function requireText(path: string): string {
  // This tiny sync reader keeps server bootstrap independent from a config package.
  return readFileSync(path, "utf8");
}

function runtimeSettings(): Record<string, string> {
  const env = readEnvFile();
  try {
    const runtime = JSON.parse(requireText(join(DATA_DIR, "runtime_settings.json"))) as Json;
    for (const key of ["llm_base_url", "llm_api_key", "llm_model"]) {
      if (typeof runtime[key] === "string") env[key.toUpperCase()] = runtime[key] as string;
    }
  } catch {
    // Runtime settings are optional when the UI is only used for project browsing.
  }
  return env;
}

async function pythonFetch(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${PYTHON_URL}${path}`, init);
  const data = await response.json().catch(() => ({ detail: "Python worker returned non-JSON" }));
  if (!response.ok) throw new Error((data as Json).detail as string || `Worker HTTP ${response.status}`);
  return data;
}

function jsonBody(request: FastifyRequest): Json {
  return (request.body && typeof request.body === "object" ? request.body : {}) as Json;
}

function parseMode(value: unknown): { mode: TutorMode; modality: Modality; skills: boolean } {
  const mode = value === "base" || value === "text_skill" || value === "multimodal_skill" ? value : "multimodal_skill";
  return {
    mode,
    modality: mode === "multimodal_skill" ? "multimodal" : "text",
    skills: mode !== "base",
  };
}

function safeSkillManifest(skill: Skill): Json | null {
  if (!skill.path) return null;
  const folder = resolve(skill.path);
  const dataRoot = resolve(DATA_DIR);
  if (!folder.startsWith(dataRoot) || !existsSync(join(folder, "manifest.json"))) return null;
  try {
    return JSON.parse(requireText(join(folder, "manifest.json"))) as Json;
  } catch {
    return null;
  }
}

function compactSkill(skill: Skill): Json {
  const manifest = safeSkillManifest(skill);
  const capability = (manifest?.capability as Json | undefined) ?? {};
  return {
    key: skill.name,
    name: skill.display_name ?? skill.name,
    summary: capability.summary ?? skill.summary ?? "",
    teaching_goal: capability.teaching_goal ?? "",
    modalities: manifest?.modalities ?? skill.modalities ?? ["text"],
    lesson_flow: capability.lesson_flow ?? capability.procedure ?? [],
    assessment_checkpoints: capability.assessment_checkpoints ?? [],
    evidence: capability.evidence ?? [],
  };
}

function visualInputs(skills: Skill[]): Array<{ label: string; path: string }> {
  const images: Array<{ label: string; path: string }> = [];
  for (const skill of skills) {
    const manifest = safeSkillManifest(skill);
    const capability = (manifest?.capability as Json | undefined) ?? {};
    const evidence = Array.isArray(capability.evidence) ? capability.evidence : [];
    for (const item of evidence as Json[]) {
      const relative = typeof item.visual_asset === "string" ? item.visual_asset : "";
      if (!relative || !skill.path) continue;
      const folder = resolve(skill.path);
      const path = resolve(folder, relative);
      if (path.startsWith(folder) && existsSync(path)) {
        images.push({ label: `${skill.name} · ${String(item.frame_id ?? "evidence")}`, path });
      }
      if (images.length >= 4) return images;
    }
  }
  return images;
}

function normalizeDelivery(raw: Json, requested: Modality, attemptedVisualCount: number): DeliveryAudit {
  const actual = typeof raw.actual === "string" ? raw.actual as string : "text";
  const fallbackReason = typeof raw.fallback_reason === "string" ? raw.fallback_reason : "";
  const actualVisual = actual === "multimodal" ? attemptedVisualCount : 0;
  return {
    requested,
    actual,
    actual_visual_count: actualVisual,
    attempted_visual_count: attemptedVisualCount,
    tool_call_count: Number(raw.tool_call_count ?? 0),
    fallback_occurred: Boolean(fallbackReason),
    fallback_reason: fallbackReason,
    multimodal_valid: requested !== "multimodal" || (actual === "multimodal" && actualVisual > 0 && !fallbackReason),
    include_in_primary_result: requested !== "multimodal" || (actual === "multimodal" && actualVisual > 0 && !fallbackReason),
  };
}

async function tutorAnswer(projectId: string, body: Json): Promise<TutorResult> {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 4) throw new Error("请输入至少 4 个字符的问题");
  const parsed = parseMode(body.mode);
  const project = (await pythonFetch(`/api/projects/${projectId}`)) as Project;
  const allSkills = (await pythonFetch(`/api/projects/${projectId}/skills`)) as Skill[];
  const skills = parsed.skills ? allSkills.filter((item) => item.valid !== false).slice(0, 3) : [];
  const images = parsed.modality === "multimodal" ? visualInputs(skills) : [];
  const settings = runtimeSettings();
  if (!settings.LLM_BASE_URL || !settings.LLM_API_KEY || !settings.LLM_MODEL) throw new Error("LLM API is not configured");
  const runtime = await runPiAgent({
    baseUrl: settings.LLM_BASE_URL,
    apiKey: settings.LLM_API_KEY,
    modelId: settings.LLM_MODEL,
    question,
    subject: project.subject,
    skills: skills.map((skill) => compactSkill(skill) as any),
    images,
  });
  const raw = runtime.answer;
  const answer = (raw.answer as string) ? raw : {
    answer: "模型没有返回可显示的回答。",
    assumptions: [],
    learning_checks: [],
    _agent: {},
  };
  const delivery = normalizeDelivery({
    actual: images.length ? "multimodal" : "text",
    tool_call_count: runtime.toolCallCount,
    fallback_reason: parsed.modality === "multimodal" && !images.length ? "当前 Skill 没有可读取的视觉证据" : "",
  }, parsed.modality, images.length);
  return {
    project_id: projectId,
    question,
    mode: parsed.mode,
    modality: parsed.modality,
    answer: {
      answer: String(answer.answer ?? ""),
      assumptions: Array.isArray(answer.assumptions) ? answer.assumptions.map(String) : [],
      learning_check: { prompts: Array.isArray(answer.learning_checks) ? answer.learning_checks.map(String) : [], success_criteria: [] },
      student_response: "",
      assessment: { status: "pending", feedback: "", evidence: [] },
      next_action: { type: "await_student_response", instruction: String((answer.learning_checks as string[] | undefined)?.[0] ?? ""), reason: "" },
      delivery: { ...delivery, engine: "pi-agent" },
    },
    selected_skills: skills,
    execution_audit: delivery,
  };
}

const app = Fastify({ logger: true });
await app.register(fastifyStatic, { root: join(ROOT, "ts_app/public"), prefix: "/" });

app.get("/api/health", async (): Promise<unknown> => {
  let worker = false;
  try { worker = Boolean((await pythonFetch("/api/health") as Json).ok); } catch { /* worker offline */ }
  const settings = runtimeSettings();
  return { ok: true, ts_runtime: true, python_worker: worker, pi_agent: true, model: settings.LLM_MODEL ?? "" };
});

app.get("/api/projects", async () => pythonFetch("/api/projects"));
app.get("/api/projects/:id", async (request) => pythonFetch(`/api/projects/${(request.params as { id: string }).id}`));
app.get("/api/projects/:id/skills", async (request) => pythonFetch(`/api/projects/${(request.params as { id: string }).id}/skills`));
app.get("/api/projects/:id/qa", async (request) => pythonFetch(`/api/projects/${(request.params as { id: string }).id}/qa`));
app.post("/api/tutor", async (request, reply) => {
  try {
    const body = jsonBody(request);
    const projectId = typeof body.project_id === "string" ? body.project_id : "";
    if (!projectId) return reply.code(400).send({ detail: "缺少项目" });
    return await tutorAnswer(projectId, body);
  } catch (error) {
    return reply.code(502).send({ detail: error instanceof Error ? error.message : String(error) });
  }
});

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith("/api/")) return reply.code(404).send({ detail: "Not found" });
  return reply.sendFile("index.html");
});

await app.listen({ host: "127.0.0.1", port: PORT });
console.log(`AnyTeacher Studio running at http://127.0.0.1:${PORT}`);
