import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { BoardEvidenceBundle } from "../packages/contracts/src/index.js";
import {
  buildOraclePilotPackage,
  runOracleGateSmoke,
  type OracleGateSmokeConfig,
  type OraclePilotCaseSpec,
} from "../packages/distillation/src/index.js";
import { LlmClient } from "../packages/llm/src/client.js";
import { SettingsStore } from "../packages/runtime-config/src/settings.js";

interface SmokeSpec {
  schema_version: "oracle-gate-smoke-spec-v1";
  prompt_version: string;
  blind_seed_sha256: string;
  generation_seed: number;
  cases: OraclePilotCaseSpec[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonLines(values: unknown[]): string {
  return values.map((value) => JSON.stringify(value)).join("\n") + "\n";
}

const [bundleArg, specArg, outputArg] = process.argv.slice(2);
if (!bundleArg || !specArg || !outputArg) {
  throw new Error("用法：npx tsx scripts/run-oracle-gate.ts <bundle.json> <smoke-spec.json> <output-directory>");
}

const root = process.cwd();
const bundlePath = resolve(root, bundleArg);
const specPath = resolve(root, specArg);
const outputRoot = resolve(root, outputArg);
const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as BoardEvidenceBundle;
const spec = JSON.parse(await readFile(specPath, "utf8")) as SmokeSpec;
assert(spec.schema_version === "oracle-gate-smoke-spec-v1", "smoke spec schema_version 无效");
const blindSeed = process.env.ORACLE_GATE_BLIND_SEED ?? "";
assert(blindSeed.length >= 32, "必须通过 ORACLE_GATE_BLIND_SEED 提供至少 32 字符的私有 blind seed");
assert(createHash("sha256").update(blindSeed).digest("hex") === spec.blind_seed_sha256, "ORACLE_GATE_BLIND_SEED 与 spec 的 SHA-256 承诺不匹配");
const pilot = buildOraclePilotPackage({
  bundle,
  cases: spec.cases,
  prompt_version: spec.prompt_version,
  blind_seed: blindSeed,
});
const settings = await new SettingsStore(root, join(root, "data")).private();
const client = new LlmClient({
  baseUrl: settings.llm_base_url,
  apiKey: settings.llm_api_key,
  model: settings.llm_model,
  timeoutSeconds: settings.llm_timeout_seconds,
  maxAttempts: settings.llm_max_attempts,
});
assert(client.configured, "LLM API 尚未配置");
const config: OracleGateSmokeConfig = {
  schema_version: "oracle-gate-smoke-config-v1",
  prompt_version: spec.prompt_version,
  output_schema_version: "teacher-evidence-response-v1",
  seeds: [spec.generation_seed],
  temperature: 0,
  max_output_tokens: 2048,
  cache_retention: "none",
  transport: "pi",
  tools_policy: "none",
  canvas: { mime_type: "image/jpeg", width: 1920, height: 360, quality: 88 },
};
const result = await runOracleGateSmoke({ client, pilot, bundlePath, config });
const blindRoot = join(outputRoot, "blind");
const privateRoot = join(outputRoot, "private");
await mkdir(blindRoot, { recursive: true });
await mkdir(privateRoot, { recursive: true, mode: 0o700 });
await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(result.manifest, null, 2)}\n`, "utf8");
await writeFile(join(blindRoot, "items.jsonl"), jsonLines(result.blind_items), "utf8");
await writeFile(join(privateRoot, "run-records.jsonl"), jsonLines(result.private_run_records), { encoding: "utf8", mode: 0o600 });
await writeFile(join(privateRoot, "answer-key.json"), `${JSON.stringify(result.private_answer_key, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
await writeFile(join(privateRoot, "input-pilot.json"), `${JSON.stringify(pilot, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ output: outputRoot, requests: result.manifest.request_count, decision: result.manifest.decision, bundle: dirname(bundlePath) }));
