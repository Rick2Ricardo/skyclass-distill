import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { BoardEvidenceBundle } from "../packages/contracts/src/index.js";
import { canonicalBoardEvidencePayload, validateBoardEvidenceBundle } from "../packages/contracts/src/index.js";
import { distillGroundedSkills } from "../packages/distillation/src/index.js";
import { LlmClient } from "../packages/llm/src/client.js";
import { SettingsStore } from "../packages/runtime-config/src/settings.js";
import { buildSkillSuite } from "../packages/skills/src/builder.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const bundleArg = process.argv[2];
const outputArg = process.argv[3];
if (!bundleArg || !outputArg) throw new Error("用法：npx tsx scripts/run-grounded-gold.ts <bundle.json> <output-directory>");

const root = process.cwd();
const dataDir = join(root, "data");
const bundlePath = resolve(root, bundleArg);
const outputRoot = resolve(root, outputArg);
const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as BoardEvidenceBundle;
const report = validateBoardEvidenceBundle(bundle);
assert(report.valid, `Bundle 无效：${report.issues.slice(0, 8).map((item) => `${item.path} ${item.message}`).join("；")}`);
const actualPayload = createHash("sha256").update(canonicalBoardEvidencePayload(bundle)).digest("hex");
assert(actualPayload === bundle.payload_sha256, "Bundle payload SHA-256 不匹配");
assert(bundle.warnings.includes("engineering_gold_dev_not_paper_gold"), "当前脚本只允许显式标记的工程 Gold-dev，防止误写论文 Gold");

const settings = await new SettingsStore(root, dataDir).private();
const client = new LlmClient({
  baseUrl: settings.llm_base_url,
  apiKey: settings.llm_api_key,
  model: settings.llm_model,
  timeoutSeconds: settings.llm_timeout_seconds,
  maxAttempts: settings.llm_max_attempts,
});
assert(client.configured, "LLM API 尚未配置");
await mkdir(outputRoot, { recursive: true });
const grounded = await distillGroundedSkills(client, {
  subject: "高中物理",
  bundle,
  bundlePath,
  mode: "single",
  validationAttempts: 3,
});
await writeFile(join(outputRoot, "suite.json"), `${JSON.stringify(grounded.suite, null, 2)}\n`, "utf8");
await writeFile(join(outputRoot, "visual-audit.json"), `${JSON.stringify(grounded.visual_audit, null, 2)}\n`, "utf8");
await writeFile(join(outputRoot, "source-catalog.json"), `${JSON.stringify(grounded.source_catalog, null, 2)}\n`, "utf8");
const skills = await buildSkillSuite({
  suite: grounded.suite as unknown as Record<string, unknown>,
  outputRoot: join(outputRoot, "skills"),
  subject: "高中物理",
  groundedSourceCatalog: grounded.source_catalog,
  provenance: {
    run_kind: "standalone-grounded-gold-dev",
    bundle_id: bundle.bundle_id,
    bundle_payload_sha256: bundle.payload_sha256,
    model: settings.llm_model,
    visual_audit_schema_version: grounded.visual_audit.schema_version,
    submitted_delta_ids: grounded.visual_audit.submitted_delta_ids,
    paper_gold_status: "requires_human_signoff",
  },
});
await writeFile(join(outputRoot, "run-report.json"), `${JSON.stringify({
  schema_version: "grounded-gold-dev-run-v1",
  bundle_id: bundle.bundle_id,
  bundle_file: basename(bundlePath),
  model: settings.llm_model,
  capability_count: grounded.suite.capabilities.length,
  skill_count: skills.length,
  submitted_delta_ids: grounded.visual_audit.submitted_delta_ids,
  submitted_visual_evidence_ids: grounded.visual_audit.submitted_visual_evidence_ids,
  visual_batch_count: grounded.visual_audit.batches.length,
  request_sha256: grounded.visual_audit.batches.flatMap((batch) => batch.requests.map((request) => request.request_sha256)),
  paper_gold_status: "requires_human_signoff",
}, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: outputRoot, capabilities: grounded.suite.capabilities.length, skills: skills.length, model: settings.llm_model }));
