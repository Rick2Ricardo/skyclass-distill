import { createServer, type Server } from "node:http";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TutorRuntimeEvent } from "../../contracts/src/index.js";
import { compactTutorHistory, runPiAgent } from "./index.js";

interface ChatRequest {
  messages?: Array<{ role?: string; content?: unknown }>;
}

const servers: Server[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all([
    ...servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })),
    ...temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  ]);
});

function toolChunk(name: string, args: Record<string, unknown>, id: string): string {
  const chunk = {
    id: `chatcmpl-${id}`,
    object: "chat.completion.chunk",
    created: 1,
    model: "test-model",
    choices: [{
      index: 0,
      delta: {
        role: "assistant",
        tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
      },
      finish_reason: null,
    }],
  };
  const done = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] };
  return `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`;
}

async function fakeOpenAiServer(responses: Array<{ name: string; args: Record<string, unknown> }>): Promise<{
  baseUrl: string;
  requests: ChatRequest[];
}> {
  const requests: ChatRequest[] = [];
  let responseIndex = 0;
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push(JSON.parse(body) as ChatRequest);
      const next = responses[responseIndex++];
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(toolChunk(next.name, next.args, `call-${responseIndex}`));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fake server did not bind a TCP port");
  return { baseUrl: `http://127.0.0.1:${address.port}/v1`, requests };
}

describe("runPiAgent", () => {
  it("uses the core Agent loop, restores history, emits tool events, and requires structured submission", async () => {
    const relay = await fakeOpenAiServer([
      { name: "load_teaching_skill", args: { skill_key: "job-1:force-boundary" } },
      {
        name: "draw_teaching_diagram",
        args: {
          title: "斜面受力图",
          summary: "区分实际力与重力分量",
          kind: "force",
          surface: "incline",
          incline_angle: 30,
          nodes: [{ id: "block", label: "物块" }],
          edges: [],
          forces: [
            { label: "重力", symbol: "mg", direction: "down", role: "actual" },
            { label: "支持力", symbol: "N", direction: "normal_out", role: "actual" },
          ],
        },
      },
      {
        name: "submit_tutor_answer",
        args: {
          answer: "先隔离物块，再从物块中心画出重力与支持力。",
          assumptions: ["忽略空气阻力"],
          learning_checks: ["支持力为什么垂直斜面？"],
          success_criteria: ["指出支持力来自接触面且方向垂直接触面"],
        },
      },
    ]);
    const events: TutorRuntimeEvent[] = [];

    const result = await runPiAgent({
      baseUrl: relay.baseUrl,
      apiKey: "test-key",
      modelId: "test-model",
      question: "接着上一轮，画出斜面受力图",
      subject: "高中物理",
      history: [{ question: "上一轮讲了什么？", answer: "上一轮确定了研究对象是物块。" }],
      skills: [{ key: "job-1:force-boundary", name: "系统边界", summary: "先隔离研究对象" }],
      images: [],
      maxRetries: 0,
      onEvent: (event) => { events.push(event); },
    });

    expect(result.answer.answer).toContain("隔离物块");
    expect(result.toolCalls.map((item) => item.tool)).toEqual(["load_teaching_skill", "draw_teaching_diagram"]);
    expect(result.artifacts).toHaveLength(1);
    expect(events[0]?.type).toBe("agent_start");
    expect(events.at(-1)?.type).toBe("agent_end");
    expect(events.some((event) => event.type === "tool_execution_end" && event.artifact?.title === "斜面受力图")).toBe(true);
    expect(relay.requests).toHaveLength(3);
    expect(JSON.stringify(relay.requests[0]?.messages)).toContain("上一轮讲了什么");
    expect(JSON.stringify(relay.requests[0]?.messages)).toContain("上一轮确定了研究对象是物块");
  });

  it("loads only explicitly selected visual evidence and records the inspected ids", async () => {
    const directory = await mkdtemp(join(tmpdir(), "skyclass-visual-"));
    temporaryDirectories.push(directory);
    const imagePath = join(directory, "frame.png");
    const imageBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0qAAAAAASUVORK5CYII=",
      "base64",
    );
    await writeFile(imagePath, imageBytes);
    const unusedImagePath = join(directory, "unused.png");
    await writeFile(unusedImagePath, imageBytes);
    const relay = await fakeOpenAiServer([
      { name: "inspect_visual_evidence", args: { evidence_ids: ["evidence-1"] } },
      {
        name: "submit_tutor_answer",
        args: {
          answer: "从关键帧可以看到老师先圈定研究对象。",
          assumptions: [],
          learning_checks: ["研究对象应该怎样选？"],
          success_criteria: ["能够指出先确定系统边界"],
        },
      },
    ]);

    const result = await runPiAgent({
      baseUrl: relay.baseUrl,
      apiKey: "test-key",
      modelId: "test-model",
      question: "根据课堂关键帧解释老师怎样确定研究对象",
      subject: "高中物理",
      skills: [],
      images: [
        { label: "系统边界关键帧", path: imagePath, root: directory },
        { label: "未选择关键帧", path: unusedImagePath, root: directory },
      ],
      maxRetries: 0,
    });

    expect(result.candidateVisualCount).toBe(2);
    expect(result.attemptedVisualCount).toBe(1);
    expect(result.visualCount).toBe(1);
    expect(result.toolCalls[0]?.evidence_ids).toEqual(["evidence-1"]);
    expect(result.toolCalls[0]?.duration_ms).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(relay.requests[1]?.messages)).toContain("data:image/png;base64");
  });

  it("rejects visual evidence whose symlink resolves outside its approved root", async () => {
    const approvedRoot = await mkdtemp(join(tmpdir(), "skyclass-approved-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "skyclass-outside-"));
    temporaryDirectories.push(approvedRoot, outsideRoot);
    const outsideImagePath = join(outsideRoot, "private.png");
    await writeFile(outsideImagePath, Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0qAAAAAASUVORK5CYII=",
      "base64",
    ));
    const linkedPath = join(approvedRoot, "linked.png");
    await symlink(outsideImagePath, linkedPath);
    const relay = await fakeOpenAiServer([
      { name: "inspect_visual_evidence", args: { evidence_ids: ["evidence-1"] } },
      {
        name: "submit_tutor_answer",
        args: {
          answer: "这张关键帧未通过安全检查，因此不能据此下结论。",
          assumptions: [],
          learning_checks: ["缺少证据时应该怎样处理？"],
          success_criteria: ["明确说明证据不足"],
        },
      },
    ]);

    const result = await runPiAgent({
      baseUrl: relay.baseUrl,
      apiKey: "test-key",
      modelId: "test-model",
      question: "检查这张越界关键帧",
      subject: "高中物理",
      skills: [],
      images: [{ label: "越界关键帧", path: linkedPath, root: approvedRoot }],
      maxRetries: 0,
    });

    expect(result.attemptedVisualCount).toBe(1);
    expect(result.visualCount).toBe(0);
    expect(result.toolCalls[0]?.ok).toBe(false);
    expect(JSON.stringify(relay.requests[1]?.messages)).not.toContain(outsideImagePath);
  });
});

describe("compactTutorHistory", () => {
  it("keeps the latest turns and replaces oversized older context with a bounded summary", () => {
    const history = Array.from({ length: 40 }, (_, index) => ({
      question: `第 ${index + 1} 轮问题：${"问".repeat(900)}`,
      answer: `第 ${index + 1} 轮回答：${"答".repeat(1800)}`,
    }));

    const compacted = compactTutorHistory(history);

    expect(compacted.summarizedTurnCount).toBeGreaterThan(0);
    expect(compacted.turns[0]?.question).toContain("较早对话摘要");
    expect(compacted.turns.at(-1)?.question).toContain("第 40 轮问题");
    expect(JSON.stringify(compacted.turns).length).toBeLessThan(28_000);
  });
});
