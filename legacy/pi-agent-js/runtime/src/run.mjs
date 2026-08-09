import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  defineTool,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

const RESULT_PREFIX = "PI_AGENT_RESULT=";
const MAX_TOOL_CALLS = 8;

function writeResult(value) {
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(value)}\n`);
}

async function readStdin() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) throw new Error("Pi Agent 没有收到运行参数");
  return JSON.parse(input);
}

function normalizeBaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/chat\/completions\/?$/i, "")
    .replace(/\/+$/, "");
}

function mimeTypeFor(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/jpeg";
}

async function loadImages(images) {
  const result = [];
  for (const item of Array.isArray(images) ? images.slice(0, 4) : []) {
    const path = resolve(String(item.path || ""));
    const data = await readFile(path);
    result.push({
      type: "image",
      data: data.toString("base64"),
      mimeType: mimeTypeFor(path),
    });
  }
  return result;
}

function skillCatalog(skills) {
  return skills.map((skill) => ({
    key: skill.key,
    name: skill.name,
    summary: skill.summary || "",
    teaching_goal: skill.teaching_goal || "",
    modalities: skill.modalities || ["text"],
  }));
}

function createEvaluationExtension(input, toolEvents) {
  const skills = new Map(input.skills.map((skill) => [String(skill.key), skill]));
  const visualEvidence = (input.images || []).map((image) => ({
    label: String(image.label || ""),
    file: String(image.path || "").split(/[\\/]/).pop(),
  }));

  return async (pi) => {
    if (skills.size > 0) {
      pi.registerTool(defineTool({
        name: "load_teaching_skill",
        label: "Load Teaching Skill",
        description:
          "读取一个已经由实验系统选中的教学 Skill。回答前必须调用；只采用与学生当前问题有关的步骤。",
        parameters: Type.Object({
          skill_key: Type.String({ description: "候选 Skill 的 key" }),
        }),
        async execute(_toolCallId, params) {
          const skill = skills.get(String(params.skill_key));
          if (!skill) {
            return {
              content: [{ type: "text", text: `未知 Skill：${params.skill_key}` }],
              details: { found: false },
            };
          }
          return {
            content: [{ type: "text", text: JSON.stringify(skill, null, 2) }],
            details: { found: true, skillKey: skill.key },
          };
        },
      }));
    }

    if (visualEvidence.length > 0) {
      pi.registerTool(defineTool({
        name: "inspect_visual_evidence",
        label: "Inspect Visual Evidence",
        description:
          "读取随本轮输入提供的课堂关键帧编号。图片本身已作为多模态输入提供；该工具用于确认可引用的证据标签。",
        parameters: Type.Object({}),
        async execute() {
          return {
            content: [{ type: "text", text: JSON.stringify(visualEvidence, null, 2) }],
            details: { count: visualEvidence.length },
          };
        },
      }));
    }

    pi.on("tool_call", async (event) => {
      const allowed = new Set(["load_teaching_skill", "inspect_visual_evidence"]);
      if (allowed.has(event.toolName)) return undefined;
      return {
        block: true,
        reason: "本次是隔离的教学评测，只允许读取蒸馏 Skill 和关键帧元数据。",
      };
    });

    pi.on("tool_result", async (event) => {
      toolEvents.push({
        tool: event.toolName,
        ok: !event.isError,
      });
    });

    pi.on("before_agent_start", async (event) => {
      const catalog = skillCatalog(input.skills);
      const experimentRule = catalog.length > 0
        ? [
            "你拿到的是候选 Skill 目录，不是完整内容。",
            "回答前必须调用 load_teaching_skill 读取每个真正需要的 Skill；不能只根据目录名称猜测。",
            `候选 Skill：${JSON.stringify(catalog)}`,
          ].join("\n")
        : [
            "这是无 Skill 基线条件。",
            "不得调用或声称使用任何蒸馏 Skill、课程视频或课堂证据。",
          ].join("\n");
      const visualRule = visualEvidence.length > 0
        ? "本轮附带课堂关键帧。需要引用画面时，先调用 inspect_visual_evidence；只描述图片直接可见内容。"
        : "本轮没有课堂关键帧，不得虚构视觉证据。";
      const systemPrompt = [
        event.systemPrompt,
        "# SkyClass 教学 Agent 评测",
        "你是直接面向学生授课的学科老师，不是教案生成器，也不是教师教练。",
        "先诊断学生卡点，再给直观解释、精确定义或推理、一个具体例子，以及一个学生马上可以回答的小检查。",
        "全程使用第二人称“你”。禁止输出“教师可以”“让学生”等课堂设计措辞。",
        "Skill 是教学方法，不是学科事实来源；证据不足时依靠可靠的基础学科知识，并明确必要假设。",
        "最多执行 8 次工具调用。完成必要工具调用后立即作答。",
        experimentRule,
        visualRule,
        "# 最终输出",
        "最终只能输出一个 JSON 对象，不要使用 Markdown 代码围栏，也不要在 JSON 前后添加文字：",
        '{"answer":"直接面向学生的 Markdown 讲解","assumptions":["必要假设"],"learning_checks":["学生现在可回答的短问题或练习"]}',
      ].join("\n\n");
      return { systemPrompt };
    });
  };
}

function parseJsonObject(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    for (let index = cleaned.indexOf("{"); index >= 0; index = cleaned.indexOf("{", index + 1)) {
      for (let end = cleaned.lastIndexOf("}"); end > index; end = cleaned.lastIndexOf("}", end - 1)) {
        try {
          return JSON.parse(cleaned.slice(index, end + 1));
        } catch {
          // Try the next candidate.
        }
      }
    }
  }
  return {
    answer: cleaned || "Pi Agent 没有返回可显示的回答。",
    assumptions: [],
    learning_checks: [],
  };
}

function finalAssistantMessage(messages) {
  return [...messages].reverse().find((message) => message?.role === "assistant");
}

function assistantText(message) {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .filter((item) => item?.type === "text")
    .map((item) => String(item.text || ""))
    .join("");
}

function recordedToolEvents(messages, extensionEvents) {
  const events = extensionEvents.length > 0
    ? extensionEvents
    : messages
      .filter((message) => message?.role === "toolResult")
      .map((message) => ({
        tool: String(message.toolName || ""),
        ok: !message.isError,
      }));
  return events.filter((event) => event.tool);
}

async function run(input) {
  const required = ["base_url", "api_key", "model", "question", "subject", "run_dir"];
  for (const key of required) {
    if (!String(input[key] || "").trim()) throw new Error(`缺少运行参数：${key}`);
  }
  input.skills = Array.isArray(input.skills) ? input.skills : [];
  input.images = Array.isArray(input.images) ? input.images : [];

  const runDir = resolve(input.run_dir);
  const cwd = join(runDir, "workspace");
  const agentDir = join(runDir, "agent");
  const sessionDir = join(runDir, "sessions");
  await Promise.all([
    mkdir(cwd, { recursive: true }),
    mkdir(agentDir, { recursive: true }),
    mkdir(sessionDir, { recursive: true }),
  ]);

  const toolEvents = [];
  const extension = createEvaluationExtension(input, toolEvents);
  const settingsManager = SettingsManager.create(cwd, agentDir);
  settingsManager.setHttpIdleTimeoutMs(Math.max(1_000, Number(input.timeout_ms) || 240_000));
  const createRuntime = async ({
    cwd: runtimeCwd,
    agentDir: runtimeAgentDir,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({
      cwd: runtimeCwd,
      agentDir: runtimeAgentDir,
      settingsManager,
      resourceLoaderOptions: {
        extensionFactories: [extension],
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
      },
    });
    services.modelRegistry.registerProvider("skyclass-relay", {
      baseUrl: normalizeBaseUrl(input.base_url),
      apiKey: input.api_key,
      api: "openai-completions",
      models: [{
        id: input.model,
        name: input.model,
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
        compat: { supportsDeveloperRole: false },
      }],
    });
    services.modelRegistry.refresh();
    const model = services.modelRegistry.find("skyclass-relay", input.model);
    if (!model) throw new Error(`Pi Agent 无法加载模型：${input.model}`);
    const created = await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      model,
      noTools: "builtin",
    });
    return { ...created, services, diagnostics: [...services.diagnostics] };
  };

  const sessionManager = SessionManager.create(cwd, sessionDir);
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir,
    sessionManager,
  });
  try {
    const session = runtime.session;
    if (input.init_only) {
      return {
        ok: true,
        agent: {
          runtime: "pi-agent",
          initialized: true,
          active_tools: session.getActiveToolNames(),
        },
      };
    }

    let output = "";
    let streamError = "";
    let toolCallCount = 0;
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_update") {
        const update = event.assistantMessageEvent;
        if (update.type === "text_delta") output += update.delta;
        if (update.type === "error") {
          streamError = update.error?.errorMessage || "模型流式响应失败";
        }
      }
      if (event.type === "tool_execution_start") {
        toolCallCount += 1;
        if (toolCallCount > MAX_TOOL_CALLS) void session.abort();
      }
    });

    const prompt = [
      `学科：${input.subject}`,
      `学生的问题或学习任务：${input.question}`,
      input.images.length > 0
        ? `随请求提供了 ${input.images.length} 张课堂关键帧，标签为：${input.images.map((item) => item.label).join("；")}`
        : "",
    ].filter(Boolean).join("\n\n");
    const images = await loadImages(input.images);
    try {
      await session.prompt(prompt, images.length > 0 ? { images } : undefined);
    } finally {
      unsubscribe();
    }
    if (streamError) throw new Error(streamError);
    const messages = session.messages;
    const finalMessage = finalAssistantMessage(messages);
    output = assistantText(finalMessage) || output;
    if (!output.trim()) {
      const reason = finalMessage?.errorMessage || finalMessage?.stopReason || "empty";
      throw new Error(`Pi Agent 未返回文本（${reason}）`);
    }
    const recordedTools = recordedToolEvents(messages, toolEvents);

    return {
      answer: parseJsonObject(output),
      agent: {
        runtime: "pi-agent",
        tool_calls: recordedTools,
        tool_call_count: recordedTools.length,
        skill_count: input.skills.length,
        visual_count: input.images.length,
        stop_reason: finalMessage?.stopReason || "",
      },
    };
  } finally {
    await runtime.dispose();
  }
}

if (process.argv.includes("--smoke")) {
  writeResult({ ok: true, runtime: "pi-agent", node: process.version });
} else if (process.argv.includes("--runtime-smoke")) {
  const runDir = await mkdtemp(join(tmpdir(), "skyclass-pi-runtime-"));
  try {
    writeResult(await run({
      base_url: "http://127.0.0.1:1/v1",
      api_key: "runtime-smoke",
      model: "runtime-smoke",
      question: "运行时自检",
      subject: "高中物理",
      run_dir: runDir,
      skills: [{
        key: "smoke-skill",
        name: "运行时自检 Skill",
        summary: "只用于验证只读 Skill 工具是否被装载。",
      }],
      images: [],
      init_only: true,
    }));
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
} else {
  try {
    writeResult(await run(await readStdin()));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Pi Agent failed: ${message}\n`);
    process.exitCode = 1;
  }
}
