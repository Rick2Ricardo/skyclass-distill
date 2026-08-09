import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  defineTool,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { extname, join, resolve } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import type { JsonObject } from "../shared/types.js";

export interface PiSkill {
  key: string;
  name: string;
  summary?: string;
  teaching_goal?: string;
  modalities?: string[];
  lesson_flow?: unknown[];
  assessment_checkpoints?: unknown[];
  evidence?: unknown[];
}

export interface PiImage { label: string; path: string; }

export interface PiRunInput {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  question: string;
  subject: string;
  skills: PiSkill[];
  images: PiImage[];
  temperature?: number;
}

export interface PiRunOutput {
  answer: JsonObject;
  toolCalls: Array<{ tool: string; ok: boolean }>;
  toolCallCount: number;
  visualCount: number;
}

const MAX_TOOL_CALLS = 8;

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/chat\/completions\/?$/i, "").replace(/\/+$/, "");
}

function mimeTypeFor(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/jpeg";
}

async function loadImages(images: PiImage[]): Promise<Array<{ type: "image"; data: string; mimeType: string }>> {
  return Promise.all(images.slice(0, 4).map(async (item) => ({
    type: "image" as const,
    data: (await readFile(resolve(item.path))).toString("base64"),
    mimeType: mimeTypeFor(item.path),
  })));
}

function catalog(skills: PiSkill[]): string {
  return JSON.stringify(skills.map(({ key, name, summary, teaching_goal, modalities }) => ({
    key, name, summary: summary ?? "", teaching_goal: teaching_goal ?? "", modalities: modalities ?? ["text"],
  })));
}

function makeExtension(input: PiRunInput, toolEvents: PiRunOutput["toolCalls"]): (pi: any) => void | Promise<void> {
  const skills = new Map(input.skills.map((skill) => [skill.key, skill]));
  const visualEvidence = input.images.map((image) => ({ label: image.label, file: image.path.split(/[\\/]/).pop() }));
  return async (pi: any) => {
    if (skills.size) {
      pi.registerTool(defineTool({
        name: "load_teaching_skill",
        label: "Load Teaching Skill",
        description: "读取一个已经由蒸馏系统选中的教学 Skill。回答前必须调用。",
        parameters: Type.Object({ skill_key: Type.String({ description: "候选 Skill 的 key" }) }),
        async execute(_id: string, params: { skill_key: string }) {
          const skill = skills.get(String(params.skill_key));
          return skill
            ? { content: [{ type: "text", text: JSON.stringify(skill) }], details: { found: true } }
            : { content: [{ type: "text", text: `未知 Skill：${params.skill_key}` }], details: { found: false } };
        },
      }));
    }
    if (visualEvidence.length) {
      pi.registerTool(defineTool({
        name: "inspect_visual_evidence",
        label: "Inspect Visual Evidence",
        description: "确认当前请求携带的课堂视觉证据标签。",
        parameters: Type.Object({}),
        async execute() { return { content: [{ type: "text", text: JSON.stringify(visualEvidence) }], details: { count: visualEvidence.length } }; },
      }));
    }
    pi.on("tool_call", async (event: any) => {
      if (["load_teaching_skill", "inspect_visual_evidence"].includes(event.toolName)) return undefined;
      return { block: true, reason: "教学运行时只允许读取 Skill 和视觉证据。" };
    });
    pi.on("tool_result", async (event: any) => { toolEvents.push({ tool: event.toolName, ok: !event.isError }); });
    pi.on("before_agent_start", async (event: any) => ({
      systemPrompt: [
        event.systemPrompt,
        "# AnyTeacher 教学运行时",
        "你是直接面向学生授课的老师，不是教案生成器。先诊断卡点，再给直观解释、精确定义、例子和一个小检查。",
        "全程使用第二人称‘你’，禁止输出‘教师可以’或‘让学生’。",
        skills.size ? `候选 Skill 目录：${catalog(input.skills)}\n回答前必须调用 load_teaching_skill 读取真正需要的 Skill。` : "这是无 Skill 基线，不得声称使用课堂 Skill。",
        visualEvidence.length ? "本轮附带课堂关键帧；需要引用画面时先调用 inspect_visual_evidence。" : "本轮没有课堂关键帧，不得虚构视觉证据。",
        "最多执行 8 次工具调用，完成后立即作答。",
        "最终只输出 JSON：{\"answer\":\"面向学生的 Markdown\",\"assumptions\":[],\"learning_checks\":[]}",
      ].join("\n\n"),
    }));
  };
}

function finalAssistantText(messages: any[]): string {
  const message = [...messages].reverse().find((item) => item?.role === "assistant");
  return Array.isArray(message?.content) ? message.content.filter((item: any) => item?.type === "text").map((item: any) => String(item.text ?? "")).join("") : "";
}

function parseJson(text: string): JsonObject {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(cleaned) as JsonObject; } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    return start >= 0 && end > start ? JSON.parse(cleaned.slice(start, end + 1)) as JsonObject : { answer: cleaned, assumptions: [], learning_checks: [] };
  }
}

export async function runPiAgent(input: PiRunInput): Promise<PiRunOutput> {
  const toolCalls: PiRunOutput["toolCalls"] = [];
  const imageContent = await loadImages(input.images);
  const workDir = join(process.cwd(), ".runtime", "pi-agent");
  await mkdir(workDir, { recursive: true });
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
  const sessionManager = SessionManager.inMemory(workDir);
  const extension = makeExtension(input, toolCalls);
  const createRuntime = async ({ cwd, sessionManager: manager, sessionStartEvent }: any) => {
    const services = await createAgentSessionServices({
      cwd,
      settingsManager,
      resourceLoaderOptions: { extensionFactories: [extension], noSkills: true, noPromptTemplates: true, noThemes: true },
    });
    services.modelRegistry.registerProvider("anyteacher-relay", {
      baseUrl: normalizeBaseUrl(input.baseUrl), apiKey: input.apiKey, api: "openai-completions",
      models: [{ id: input.modelId, name: input.modelId, reasoning: false, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 8192, compat: { supportsDeveloperRole: false } }],
    });
    services.modelRegistry.refresh();
    const model = services.modelRegistry.find("anyteacher-relay", input.modelId);
    if (!model) throw new Error(`Pi Agent 无法加载模型：${input.modelId}`);
    const created = await createAgentSessionFromServices({ services, sessionManager: manager, sessionStartEvent, model, noTools: "builtin" });
    return { ...created, services, diagnostics: [...services.diagnostics] };
  };
  const runtime = await createAgentSessionRuntime(createRuntime, { cwd: workDir, agentDir: join(workDir, "agent"), sessionManager });
  try {
    const prompt = [`学科：${input.subject}`, `学生的问题或学习任务：${input.question}`, input.images.length ? `随请求提供了 ${input.images.length} 张课堂关键帧。` : ""].filter(Boolean).join("\n\n");
    let output = "";
    const unsubscribe = runtime.session.subscribe((event: any) => {
      if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") output += event.assistantMessageEvent.delta;
      if (event.type === "tool_execution_start" && toolCalls.length >= MAX_TOOL_CALLS) void runtime.session.abort();
    });
    try { await runtime.session.prompt(prompt, imageContent.length ? { images: imageContent } : undefined); } finally { unsubscribe(); }
    output = finalAssistantText(runtime.session.messages) || output;
    return { answer: parseJson(output), toolCalls, toolCallCount: toolCalls.length, visualCount: input.images.length };
  } finally {
    runtime.session.dispose();
  }
}
