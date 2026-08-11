import { runPiAgent, type PiRunInput } from "./index.js";

const RESULT_PREFIX = "PI_AGENT_RESULT=";

async function readStdin(): Promise<Record<string, unknown>> {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) throw new Error("Pi Agent 没有收到运行参数");
  return JSON.parse(input) as Record<string, unknown>;
}

function writeResult(value: unknown): void {
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(value)}\n`);
}

async function run(): Promise<void> {
  if (process.argv.includes("--smoke")) {
    writeResult({ ok: true, runtime: "pi-agent", node: process.version });
    return;
  }

  const raw = await readStdin();
  const input: PiRunInput = {
    baseUrl: String(raw.base_url ?? ""),
    apiKey: String(raw.api_key ?? ""),
    modelId: String(raw.model ?? ""),
    question: String(raw.question ?? ""),
    subject: String(raw.subject ?? ""),
    skills: Array.isArray(raw.skills) ? raw.skills as PiRunInput["skills"] : [],
    images: Array.isArray(raw.images) ? raw.images as PiRunInput["images"] : [],
    temperature: Number(raw.temperature ?? 0),
  };
  const output = await runPiAgent(input);
  writeResult({
    answer: output.answer,
    agent: {
      runtime: "pi-agent",
      tool_calls: output.toolCalls,
      tool_call_count: output.toolCallCount,
      skill_count: input.skills.length,
      visual_count: output.visualCount,
      stop_reason: output.stopReason,
    },
  });
}

run().catch((error) => {
  process.stderr.write(`Pi Agent failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
