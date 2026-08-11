import { createHash } from "node:crypto";
import { dirname } from "node:path";
import type { AuditedJsonResponse, ImageInput, LlmCallControl, LlmClient, LlmRequestAudit } from "../../llm/src/client.js";
import { canonicalizeOracleGateCanvas } from "../../media/src/oracleGateCanvas.js";
import { verifyImageEvidence } from "../../media/src/imageEvidence.js";
import type { OraclePilotArm, OraclePilotArmInput, OraclePilotPackage } from "./oraclePilot.js";
import { validateOraclePilotPairing } from "./oraclePilot.js";

export interface OracleGateSmokeConfig {
  schema_version: "oracle-gate-smoke-config-v1";
  prompt_version: string;
  output_schema_version: "oracle-gate-response-v1";
  seeds: number[];
  temperature: number;
  max_output_tokens: number;
  cache_retention: "none";
  transport: "pi";
  tools_policy: "none";
  canvas: { mime_type: "image/jpeg"; width: 1920; height: 360; quality: 88 };
}

export interface OracleGateRunRecord {
  run_id: string;
  blind_id: string;
  paired_case_id: string;
  case_id: string;
  arm: OraclePilotArm;
  seed: number;
  condition_sha256: string;
  response_sha256: string;
  response: Record<string, unknown>;
  request_audit: LlmRequestAudit;
  canonical_visual: null | {
    source_asset_uri: string;
    source_sha256: string;
    submitted_sha256: string;
    mime_type: "image/jpeg";
    width: 1920;
    height: 360;
    transform: "triplicate_single_frame" | "resize_temporal_montage";
  };
}

export interface OracleGateSmokeResult {
  manifest: {
    schema_version: "oracle-gate-smoke-manifest-v1";
    decision: "not_evaluable";
    model: string;
    protocol_fingerprint_sha256: string;
    prompt_sha256: string;
    output_schema_sha256: string;
    case_count: number;
    arm_count: 4;
    seed_count: number;
    request_count: number;
    warning: "engineering_wiring_smoke_not_an_experiment_result";
  };
  private_run_records: OracleGateRunRecord[];
  blind_items: Array<{
    blind_id: string;
    paired_case_id: string;
    seed_index: number;
    response: Record<string, unknown>;
    response_sha256: string;
  }>;
  private_answer_key: Array<{
    blind_id: string;
    paired_case_id: string;
    case_id: string;
    arm: OraclePilotArm;
    seed: number;
    condition_sha256: string;
  }>;
}

export interface OracleGateClient {
  options: { model: string };
  chatJsonAudited(
    system: string,
    user: string,
    images?: ImageInput[],
    temperature?: number,
    control?: LlmCallControl,
  ): Promise<AuditedJsonResponse>;
}

const ARM_ORDER: OraclePilotArm[] = ["transcript_only", "static_final_board", "uniform_frame", "oracle_delta"];

const OUTPUT_SCHEMA = {
  schema_version: "oracle-gate-response-v1",
  observed_board_actions: [{ sequence_index: 1, operation: "add|erase|modify|connect|unknown", content: "string|null", region: "string|null" }],
  generalized_teaching_capability: { name: "string", mechanism: "string", action_program: ["renderer-neutral teacher action"] },
  evidence_claims: [{ claim: "string", evidence_slot: "transcript|visual-1|uncertain" }],
  uncertainties: ["string"],
};

const SYSTEM = `你是严格的板书教学能力蒸馏器。只使用本次请求提供的语音和视觉证据。先记录可见板书动作，再抽象可迁移的教学能力；不得把原题常数固化为通用规则，不得补写课堂中不存在的学生反应、学习增益或教学效果。输出动作必须与 HTML、SVG、Canvas、Ink 等渲染器解耦。证据不足时使用 unknown/null 和 uncertainties，不得猜测。只输出符合给定结构的 JSON。`;

function digest(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function assertFiniteInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} 必须是安全整数`);
}

function assertExactKeys(value: Record<string, unknown>, allowed: string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unexpected.length) throw new Error(`${label} 包含未注册字段：${unexpected.join(", ")}`);
}

export function validateOracleGateResponse(value: Record<string, unknown>, allowedEvidenceSlots: ReadonlySet<string>): void {
  const allowedTopLevel = new Set([
    "schema_version",
    "observed_board_actions",
    "generalized_teaching_capability",
    "evidence_claims",
    "uncertainties",
  ]);
  const unexpected = Object.keys(value).filter((key) => !allowedTopLevel.has(key));
  if (unexpected.length) throw new Error(`Oracle Gate 响应包含未注册字段：${unexpected.join(", ")}`);
  if (value.schema_version !== "oracle-gate-response-v1") throw new Error("Oracle Gate 响应 schema_version 无效");
  if (!Array.isArray(value.observed_board_actions)) throw new Error("Oracle Gate 响应缺少 observed_board_actions");
  if (!value.generalized_teaching_capability || typeof value.generalized_teaching_capability !== "object" || Array.isArray(value.generalized_teaching_capability)) {
    throw new Error("Oracle Gate 响应缺少 generalized_teaching_capability");
  }
  if (!Array.isArray(value.evidence_claims) || !Array.isArray(value.uncertainties)) throw new Error("Oracle Gate 响应证据或不确定性字段无效");
  const operations = new Set(["add", "erase", "modify", "connect", "unknown"]);
  let previousSequence = 0;
  for (const [index, raw] of value.observed_board_actions.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`observed_board_actions[${index}] 必须是对象`);
    const action = raw as Record<string, unknown>;
    assertExactKeys(action, ["sequence_index", "operation", "content", "region"], `observed_board_actions[${index}]`);
    if (!Number.isSafeInteger(action.sequence_index) || Number(action.sequence_index) <= previousSequence) {
      throw new Error(`observed_board_actions[${index}].sequence_index 必须严格递增`);
    }
    previousSequence = Number(action.sequence_index);
    if (typeof action.operation !== "string" || !operations.has(action.operation)) throw new Error(`observed_board_actions[${index}].operation 无效`);
    if (action.content !== null && typeof action.content !== "string") throw new Error(`observed_board_actions[${index}].content 无效`);
    if (action.region !== null && typeof action.region !== "string") throw new Error(`observed_board_actions[${index}].region 无效`);
  }
  const capability = value.generalized_teaching_capability as Record<string, unknown>;
  assertExactKeys(capability, ["name", "mechanism", "action_program"], "generalized_teaching_capability");
  if (typeof capability.name !== "string" || !capability.name.trim()
    || typeof capability.mechanism !== "string" || !capability.mechanism.trim()
    || !Array.isArray(capability.action_program) || !capability.action_program.length
    || capability.action_program.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error("generalized_teaching_capability 必须包含非空 name、mechanism 和 action_program");
  }
  for (const [index, raw] of value.evidence_claims.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`evidence_claims[${index}] 必须是对象`);
    const claim = raw as Record<string, unknown>;
    assertExactKeys(claim, ["claim", "evidence_slot"], `evidence_claims[${index}]`);
    if (typeof claim.claim !== "string" || !claim.claim.trim() || typeof claim.evidence_slot !== "string" || !allowedEvidenceSlots.has(claim.evidence_slot)) {
      throw new Error(`evidence_claims[${index}] 的 claim 或 evidence_slot 无效`);
    }
  }
  if (value.uncertainties.some((item) => typeof item !== "string" || !item.trim())) throw new Error("uncertainties 必须是非空字符串数组");
  const serialized = JSON.stringify(value);
  if (/(?:学生|学员|同学).*?(?:已经|已|都).{0,8}(?:掌握|听懂|明白|学会)|students? (?:have|had) (?:understood|learned|mastered)/i.test(serialized)) {
    throw new Error("Oracle Gate 响应把学生学习结果伪装成课堂事实");
  }
}

function expectedRequestSha(input: {
  model: string;
  user: string;
  temperature: number;
  control: LlmCallControl;
  images: ImageInput[];
}): string {
  return digest({
    model: input.model,
    system: SYSTEM,
    user: input.user,
    temperature: input.temperature,
    control: {
      transport: input.control.transport ?? "auto",
      max_output_tokens: input.control.maxOutputTokens ?? null,
      seed: input.control.seed ?? null,
      cache_retention: input.control.cacheRetention ?? null,
      tools_policy: "none",
    },
    visuals: input.images.map((image) => ({
      label: image.label,
      sha256: String(image.sha256),
      mime_type: image.mime_type,
      byte_length: image.bytes?.byteLength ?? 0,
    })),
  });
}

function assertProviderAudit(input: {
  audit: LlmRequestAudit;
  model: string;
  user: string;
  images: ImageInput[];
  temperature: number;
  control: LlmCallControl;
  label: string;
}): void {
  const { audit } = input;
  if (audit.model !== input.model || audit.transport !== "pi" || audit.stop_reason !== "stop" || audit.tools_policy !== "none") {
    throw new Error(`${input.label}: provider audit 未满足冻结协议`);
  }
  if (!Number.isSafeInteger(audit.attempt_count) || audit.attempt_count < 1 || audit.provider_response_received !== true || !audit.usage) {
    throw new Error(`${input.label}: provider audit 缺少有效 attempt、response 或 usage`);
  }
  const usage = audit.usage;
  const numeric = (key: string): boolean => typeof usage[key] === "number" && Number.isFinite(usage[key]) && Number(usage[key]) >= 0;
  const hasInput = numeric("input") || numeric("prompt_tokens");
  const hasOutput = numeric("output") || numeric("completion_tokens");
  const hasTotal = numeric("totalTokens") || numeric("total_tokens");
  if (!hasInput || !hasOutput || !hasTotal) throw new Error(`${input.label}: provider usage 缺少可审计的 input/output/total token 数值`);
  if (audit.max_output_tokens !== input.control.maxOutputTokens || audit.temperature !== input.temperature
    || audit.seed !== input.control.seed || audit.cache_retention !== input.control.cacheRetention) {
    throw new Error(`${input.label}: provider audit 与冻结采样配置不一致`);
  }
  const expectedVisuals = input.images.map((image) => ({
    label: image.label,
    sha256: String(image.sha256),
    mime_type: image.mime_type,
    byte_length: image.bytes?.byteLength ?? 0,
  }));
  if (JSON.stringify(audit.submitted_visuals) !== JSON.stringify(expectedVisuals)) {
    throw new Error(`${input.label}: provider audit 的 submitted_visuals 与 canonical canvas 不一致`);
  }
  if (audit.request_sha256 !== expectedRequestSha(input)) throw new Error(`${input.label}: provider request_sha256 与实际冻结请求不一致`);
}

function userPrompt(sample: OraclePilotArmInput): string {
  return `请分析同一课堂事件。四个实验条件使用相同任务与输出结构；你只能依据本请求实际出现的证据槽。

证据说明：${sample.evidence_text}

课堂语音：
${sample.transcript}

输出结构：
${JSON.stringify(OUTPUT_SCHEMA)}

规则：observed_board_actions 按可恢复的时间顺序排列；看不到板书变化时允许 operation=unknown。generalized_teaching_capability 必须参数化、可迁移且渲染器中立。evidence_slot 只能写 transcript、visual-1 或 uncertain。`;
}

async function canonicalVisual(sample: OraclePilotArmInput, bundleRoot: string): Promise<{
  input: ImageInput[];
  audit: OracleGateRunRecord["canonical_visual"];
}> {
  if (sample.arm === "transcript_only") return { input: [], audit: null };
  if (sample.image_assets.length !== 1) throw new Error(`${sample.case_id}/${sample.arm}: 视觉条件必须恰好一张源图`);
  const source = sample.image_assets[0];
  const verified = await verifyImageEvidence({ root: bundleRoot, assetUri: source.asset_uri, expectedSha256: source.sha256 });
  const canvas = canonicalizeOracleGateCanvas(verified.bytes, sample.arm);
  return {
    input: [{ label: "visual-1", bytes: canvas.bytes, mime_type: canvas.mime_type, sha256: canvas.sha256 }],
    audit: {
      source_asset_uri: source.asset_uri,
      source_sha256: canvas.source_sha256,
      submitted_sha256: canvas.sha256,
      mime_type: canvas.mime_type,
      width: canvas.width,
      height: canvas.height,
      transform: canvas.transform,
    },
  };
}

export function assertOracleGateFormalReadiness(input: {
  event_count: number;
  signed_event_count: number;
  teacher_ids: string[];
  seeds: number[];
  multi_edit_window_count: number;
}): void {
  if (!Number.isSafeInteger(input.event_count) || input.event_count < 0
    || !Number.isSafeInteger(input.signed_event_count) || input.signed_event_count < 0
    || !Number.isSafeInteger(input.multi_edit_window_count) || input.multi_edit_window_count < 0) {
    throw new Error("正式 Oracle Gate 的事件、签字和窗口计数必须是有限非负安全整数");
  }
  input.seeds.forEach((seed) => assertFiniteInteger(seed, "formal seed"));
  if (input.event_count < 30) throw new Error("正式 Oracle Gate 至少需要 30 个 Gold 事件");
  if (input.signed_event_count !== input.event_count) throw new Error("正式 Oracle Gate 的全部事件必须完成人工签字");
  if (new Set(input.teacher_ids.map((item) => item.trim()).filter(Boolean)).size < 2) throw new Error("正式 Oracle Gate 至少需要 2 位教师");
  if (new Set(input.seeds).size < 3) throw new Error("正式 Oracle Gate 至少需要 3 个预注册 seed");
  if (input.multi_edit_window_count < 1) throw new Error("正式 Oracle Gate 至少需要一个含两个有序编辑的窗口才能评估时序保真度");
}

export async function runOracleGateSmoke(input: {
  client: OracleGateClient | LlmClient;
  pilot: OraclePilotPackage;
  bundlePath: string;
  config: OracleGateSmokeConfig;
}): Promise<OracleGateSmokeResult> {
  const pairingIssues = validateOraclePilotPairing(input.pilot);
  if (pairingIssues.length) throw new Error(`Oracle Gate 配对输入无效：${pairingIssues.slice(0, 6).join("；")}`);
  if (input.pilot.protocol.protocol_version !== "oracle-value-gate-v1"
    || input.pilot.protocol.visual_items_per_visual_arm !== 1
    || input.pilot.protocol.visual_budget_rule !== "one_preprocessed_canvas_per_visual_arm"
    || input.pilot.protocol.runtime_pixel_and_token_audit_required !== true) {
    throw new Error("Oracle Gate pilot protocol 未满足冻结的视觉与运行时审计契约");
  }
  if (input.config.schema_version !== "oracle-gate-smoke-config-v1" || input.config.output_schema_version !== "oracle-gate-response-v1") {
    throw new Error("Oracle Gate smoke config schema 无效");
  }
  if (!input.config.prompt_version.trim() || input.config.prompt_version !== input.pilot.protocol.prompt_version) {
    throw new Error("Oracle Gate prompt_version 必须与配对输入一致");
  }
  if (input.config.seeds.length !== 1) throw new Error("Oracle Gate engineering smoke 必须恰好使用一个冻结 seed");
  input.config.seeds.forEach((seed) => assertFiniteInteger(seed, "seed"));
  if (!Number.isFinite(input.config.temperature) || input.config.temperature < 0) throw new Error("temperature 无效");
  if (!Number.isSafeInteger(input.config.max_output_tokens) || input.config.max_output_tokens < 128) throw new Error("max_output_tokens 无效");
  if (input.config.transport !== "pi" || input.config.cache_retention !== "none" || input.config.tools_policy !== "none") {
    throw new Error("Oracle Gate smoke 必须冻结为 Pi transport、无缓存、无工具");
  }
  const expectedCanvas = input.config.canvas;
  if (expectedCanvas.mime_type !== "image/jpeg" || expectedCanvas.width !== 1920 || expectedCanvas.height !== 360 || expectedCanvas.quality !== 88) {
    throw new Error("Oracle Gate canonical canvas 配置必须是 1920x360 JPEG quality=88");
  }

  const promptSha = digest({ version: input.config.prompt_version, system: SYSTEM });
  const outputSchemaSha = digest(OUTPUT_SCHEMA);
  const protocolFingerprint = digest({
    model: input.client.options.model,
    prompt_sha256: promptSha,
    output_schema_sha256: outputSchemaSha,
    temperature: input.config.temperature,
    max_output_tokens: input.config.max_output_tokens,
    cache_retention: input.config.cache_retention,
    transport: input.config.transport,
    tools_policy: input.config.tools_policy,
    canvas: input.config.canvas,
    seeds: input.config.seeds,
  });
  const bundleRoot = dirname(input.bundlePath);
  const keyByCondition = new Map(input.pilot.answer_key.map((item) => [item.condition_sha256, item]));
  const samples = [...input.pilot.samples].sort((left, right) => (
    left.case_id.localeCompare(right.case_id) || ARM_ORDER.indexOf(left.arm) - ARM_ORDER.indexOf(right.arm)
  ));
  const caseCount = new Set(samples.map((sample) => sample.case_id)).size;
  if (caseCount !== 2 || samples.length !== 8) throw new Error("Oracle Gate engineering smoke 必须恰好包含 2 cases × 4 arms");
  const records: OracleGateRunRecord[] = [];

  for (const seed of input.config.seeds) {
    for (const sample of samples) {
      const key = keyByCondition.get(sample.condition_sha256);
      if (!key) throw new Error(`Oracle Gate answer key 缺少 condition：${sample.condition_sha256}`);
      const visual = await canonicalVisual(sample, bundleRoot);
      const runBlindId = `B-${digest({ blind_id: key.blind_id, seed }).slice(0, 20)}`;
      const pairedCaseId = `P-${digest({ paired_case_id: key.paired_case_id, seed }).slice(0, 20)}`;
      const control: LlmCallControl = {
        transport: "pi",
        maxOutputTokens: input.config.max_output_tokens,
        seed,
        cacheRetention: "none",
      };
      const prompt = userPrompt(sample);
      const result = await input.client.chatJsonAudited(SYSTEM, prompt, visual.input, input.config.temperature, control);
      validateOracleGateResponse(
        result.value,
        sample.arm === "transcript_only" ? new Set(["transcript", "uncertain"]) : new Set(["transcript", "visual-1", "uncertain"]),
      );
      assertProviderAudit({
        audit: result.audit,
        model: input.client.options.model,
        user: prompt,
        images: visual.input,
        temperature: input.config.temperature,
        control,
        label: `${sample.case_id}/${sample.arm}`,
      });
      const responseSha = digest(result.value);
      records.push({
        run_id: `RUN-${digest({ condition: sample.condition_sha256, seed }).slice(0, 20)}`,
        blind_id: runBlindId,
        paired_case_id: pairedCaseId,
        case_id: sample.case_id,
        arm: sample.arm,
        seed,
        condition_sha256: sample.condition_sha256,
        response_sha256: responseSha,
        response: result.value,
        request_audit: result.audit,
        canonical_visual: visual.audit,
      });
    }
  }

  return {
    manifest: {
      schema_version: "oracle-gate-smoke-manifest-v1",
      decision: "not_evaluable",
      model: input.client.options.model,
      protocol_fingerprint_sha256: protocolFingerprint,
      prompt_sha256: promptSha,
      output_schema_sha256: outputSchemaSha,
      case_count: caseCount,
      arm_count: 4,
      seed_count: input.config.seeds.length,
      request_count: records.length,
      warning: "engineering_wiring_smoke_not_an_experiment_result",
    },
    private_run_records: records,
    blind_items: records.map((record, index) => ({
      blind_id: record.blind_id,
      paired_case_id: record.paired_case_id,
      seed_index: index < samples.length ? 0 : Math.floor(index / samples.length),
      response: record.response,
      response_sha256: record.response_sha256,
    })).sort((left, right) => left.blind_id.localeCompare(right.blind_id)),
    private_answer_key: records.map((record) => ({
      blind_id: record.blind_id,
      paired_case_id: record.paired_case_id,
      case_id: record.case_id,
      arm: record.arm,
      seed: record.seed,
      condition_sha256: record.condition_sha256,
    })),
  };
}
