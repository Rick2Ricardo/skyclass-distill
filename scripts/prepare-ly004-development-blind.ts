import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateOracleGateResponse, type OracleGateResponseArm } from "../packages/contracts/src/oracle-gate-response.js";

const ARMS = ["transcript_only", "static_final_board", "uniform_frame", "oracle_delta"] as const;
const MATRIX_DOMAIN = "skyclass/ly004-development-matrix-receipt/v2\0";
const RATER_ORDER_DOMAINS = {
  R1: "skyclass/ly004-development-rater-order/r1/v1\0",
  R2: "skyclass/ly004-development-rater-order/r2/v1\0",
} as const;
const ACTIVE_BLOCKS = [
  { run: "run-01", spec: "ly004-development-seed-01.json", spec_seed_index: 0, generation_seed: 20260814 },
  { run: "run-03", spec: "ly004-development-seed-03.json", spec_seed_index: 2, generation_seed: 20260816 },
  { run: "run-04", spec: "ly004-development-seed-04.json", spec_seed_index: 3, generation_seed: 20260817 },
] as const;

interface DevelopmentSpec {
  schema_version: "oracle-gate-smoke-spec-v1";
  protocol_scope: string;
  protocol_document: string;
  prompt_version: string;
  blind_seed_sha256: string;
  generation_seed: number;
  seed_index: number;
  cases: Array<{ case_id: string; delta_id: string; uniform_frame_id: string }>;
}
interface RunManifest {
  schema_version: string;
  decision: string;
  model: string;
  prompt_sha256: string;
  output_schema_sha256: string;
  case_count: number;
  arm_count: number;
  seed_count: number;
  request_count: number;
  protocol_fingerprint_sha256: string;
  warning: string;
}
interface AnswerKeyItem {
  blind_id: string;
  paired_case_id: string;
  case_id: string;
  arm: OracleGateResponseArm;
  seed: number;
  condition_sha256: string;
}
interface BlindItem {
  blind_id: string;
  paired_case_id: string;
  seed_index: number;
  response: Record<string, unknown>;
  response_sha256: string;
}
interface PrivateRunRecord extends AnswerKeyItem {
  response: Record<string, unknown>;
  response_sha256: string;
  run_id: string;
  request_audit: {
    request_sha256: string;
    model: string;
    attempt_count: number;
    provider_response_received: boolean;
    stop_reason: string;
    temperature: number;
    max_output_tokens: number;
    seed: number;
    cache_retention: string;
    tools_policy: string;
  };
}
interface PilotPackage {
  schema_version: string;
  bundle_id: string;
  protocol: { prompt_version: string; visual_items_per_visual_arm: number };
  samples: Array<{
    case_id: string;
    arm: OracleGateResponseArm;
    delta_id: string;
    condition_sha256: string;
    image_assets: Array<{ sha256: string }>;
  }>;
}
interface RaterItem {
  blind_id: string;
  response: Record<string, unknown>;
  response_sha256: string;
  evidence_card: {
    schema_version: "ly004-development-item-evidence-v2";
    evidence_units: Array<{ unit_id: string; kind: "transcript" | "board_edit"; content: string }>;
    target_operation: "ADD";
    temporal_fidelity: "not_applicable_single_event";
  };
}

const root = process.cwd();
const sourceRoot = resolve(root, "data/board2skill/oracle-gate-development");
const outputRoot = join(sourceRoot, "blind-package");
const privateRoot = join(sourceRoot, "private");
const protocolDocument = "research/board2skill/experiments/LY004_DEVELOPMENT_VALUE_GATE_V1.md";
const expectedBlindSeedSha256 = "3c78aab1296ba6f1f9c93f4df24df02e8982ad25fa86bcc765ef6ba6fc34bc3e";
const cases: Record<string, Omit<RaterItem["evidence_card"], "schema_version">> = {
  "ly004-known-condition": {
    evidence_units: [
      { unit_id: "T1", kind: "transcript", content: "教师陈述支持力等于 1.2mg。" },
      { unit_id: "T2", kind: "transcript", content: "教师随后提出摩擦力和加速度两个问题。" },
      { unit_id: "B1", kind: "board_edit", content: "目标板书编辑为 ADD：N = 1.2mg。" },
    ],
    target_operation: "ADD",
    temporal_fidelity: "not_applicable_single_event",
  },
  "ly004-question-pair": {
    evidence_units: [
      { unit_id: "T1", kind: "transcript", content: "教师陈述支持力等于 1.2mg。" },
      { unit_id: "T2", kind: "transcript", content: "教师提出摩擦力大小问题。" },
      { unit_id: "T3", kind: "transcript", content: "教师提出加速度大小问题。" },
      { unit_id: "B1", kind: "board_edit", content: "目标板书编辑为 ADD：f=? 与 a=? 两个待求量。" },
    ],
    target_operation: "ADD",
    temporal_fidelity: "not_applicable_single_event",
  },
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function sha(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}
function parseJsonLines<T>(text: string): T[] {
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}
function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()), `${label} 字段不精确`);
}
function normalizedLeakText(value: string): string {
  return value.normalize("NFKC").replace(/\p{Default_Ignorable_Code_Point}/gu, "").replace(/\s+/gu, "").toLowerCase();
}
function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, output));
  else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((item) => collectStrings(item, output));
  return output;
}
function validateRaterItem(item: RaterItem, privateValues: Set<string>): void {
  exactKeys(item as unknown as Record<string, unknown>, ["blind_id", "response", "response_sha256", "evidence_card"], "rater item");
  exactKeys(item.evidence_card as unknown as Record<string, unknown>, ["schema_version", "evidence_units", "target_operation", "temporal_fidelity"], "evidence card");
  for (const unit of item.evidence_card.evidence_units) exactKeys(unit as unknown as Record<string, unknown>, ["unit_id", "kind", "content"], "evidence unit");
  const allowedPublicStrings = new Set([item.blind_id]);
  for (const raw of collectStrings(item)) {
    if (allowedPublicStrings.has(raw)) continue;
    const normalized = normalizedLeakText(raw);
    for (const privateValue of privateValues) {
      if (privateValue.length >= 6 && normalized.includes(privateValue)) throw new Error(`${item.blind_id} 公共文本包含已知私有值`);
    }
  }
}

const publicItems: RaterItem[] = [];
const privateMap: Array<AnswerKeyItem & { development_seed_index: number; spec_sha256: string }> = [];
const sourceRoots: Array<Record<string, unknown>> = [];
const privateValues = new Set<string>();
let commonModel = "";
let commonPromptSha = "";
let commonSchemaSha = "";

for (let developmentSeedIndex = 0; developmentSeedIndex < ACTIVE_BLOCKS.length; developmentSeedIndex += 1) {
  const block = ACTIVE_BLOCKS[developmentSeedIndex];
  const run = block.run;
  const specPath = resolve(root, `research/board2skill/experiments/${block.spec}`);
  const specBytes = await readFile(specPath);
  const spec = JSON.parse(specBytes.toString("utf8")) as DevelopmentSpec;
  const manifestBytes = await readFile(join(sourceRoot, run, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as RunManifest;
  const blindBytes = await readFile(join(sourceRoot, run, "blind/items.jsonl"));
  const recordsBytes = await readFile(join(sourceRoot, run, "private/run-records.jsonl"));
  const pilotBytes = await readFile(join(sourceRoot, run, "private/input-pilot.json"));
  const pilot = JSON.parse(pilotBytes.toString("utf8")) as PilotPackage;
  const answerKey = JSON.parse(await readFile(join(sourceRoot, run, "private/answer-key.json"), "utf8")) as AnswerKeyItem[];
  const blindItems = parseJsonLines<BlindItem>(blindBytes.toString("utf8"));
  const records = parseJsonLines<PrivateRunRecord>(recordsBytes.toString("utf8"));

  exactKeys(spec as unknown as Record<string, unknown>, ["schema_version","protocol_scope","protocol_document","prompt_version","blind_seed_sha256","generation_seed","seed_index","cases"], `${run} spec`);
  spec.cases.forEach((item,index)=>exactKeys(item as unknown as Record<string,unknown>,["case_id","delta_id","uniform_frame_id"],`${run} spec case ${index}`));
  exactKeys(manifest as unknown as Record<string, unknown>, ["schema_version","decision","model","protocol_fingerprint_sha256","prompt_sha256","output_schema_sha256","case_count","arm_count","seed_count","request_count","warning"], `${run} manifest`);
  assert(spec.seed_index === block.spec_seed_index && spec.generation_seed === block.generation_seed, `${run} spec seed 不匹配`);
  assert(spec.schema_version === "oracle-gate-smoke-spec-v1" && spec.protocol_document === protocolDocument && spec.blind_seed_sha256 === expectedBlindSeedSha256, `${run} spec固定字段不匹配`);
  assert((spec.protocol_scope === "ly004_preregistered_development_value_gate_v1" || spec.protocol_scope === "ly004_preregistered_development_value_gate_v1_replacement_block") && spec.prompt_version === "oracle-gate-prompt-v1", `${run} spec protocol 不匹配`);
  assert(JSON.stringify(spec.cases.map((item) => item.case_id).sort()) === JSON.stringify(Object.keys(cases).sort()), `${run} spec case 集合不匹配`);
  assert(manifest.case_count === 2 && manifest.arm_count === 4 && manifest.seed_count === 1 && manifest.request_count === 8, `${run} manifest 矩阵计数无效`);
  assert(manifest.schema_version === "oracle-gate-smoke-manifest-v1" && manifest.decision === "not_evaluable" && manifest.warning === "engineering_wiring_smoke_not_an_experiment_result" && /^[a-f0-9]{64}$/.test(manifest.protocol_fingerprint_sha256), `${run} manifest固定字段无效`);
  assert(answerKey.length === 8 && blindItems.length === 8 && records.length === 8, `${run} 必须恰有8项`);
  assert(pilot.schema_version === "oracle-pilot-package-v1" && pilot.bundle_id === "tbv2-ly-004-01-gold-dev-v2" && pilot.protocol.prompt_version === spec.prompt_version && pilot.protocol.visual_items_per_visual_arm === 1, `${run} pilot protocol 漂移`);
  assert(pilot.samples.length === 8, `${run} pilot 必须恰有8项`);
  if (!commonModel) ({ model: commonModel, prompt_sha256: commonPromptSha, output_schema_sha256: commonSchemaSha } = manifest);
  assert(manifest.model === commonModel && manifest.prompt_sha256 === commonPromptSha && manifest.output_schema_sha256 === commonSchemaSha, `${run} model/prompt/schema 漂移`);

  const keyByBlind = new Map(answerKey.map((item) => [item.blind_id, item]));
  const blindById = new Map(blindItems.map((item) => [item.blind_id, item]));
  const recordById = new Map(records.map((item) => [item.blind_id, item]));
  assert(keyByBlind.size === 8 && blindById.size === 8 && recordById.size === 8, `${run} blind id 必须唯一`);

  for (const caseId of Object.keys(cases)) {
    const caseKeys = answerKey.filter((item) => item.case_id === caseId);
    assert(caseKeys.length === 4, `${run}/${caseId} 必须恰有4项`);
    assert(JSON.stringify(caseKeys.map((item) => item.arm).sort()) === JSON.stringify([...ARMS].sort()), `${run}/${caseId} 未精确覆盖四臂`);
    assert(caseKeys.every((item) => item.seed === spec.generation_seed), `${run}/${caseId} seed 漂移`);
    assert(new Set(caseKeys.map((item) => item.paired_case_id)).size === 1, `${run}/${caseId} pair 漂移`);
    const caseSpec = spec.cases.find((item) => item.case_id === caseId);
    assert(caseSpec, `${run}/${caseId} 缺spec case`);
    const pilotSamples = pilot.samples.filter((item) => item.case_id === caseId);
    assert(pilotSamples.length === 4 && JSON.stringify(pilotSamples.map((item) => item.arm).sort()) === JSON.stringify([...ARMS].sort()), `${run}/${caseId} pilot未精确覆盖四臂`);
    assert(pilotSamples.every((item) => item.delta_id === caseSpec.delta_id), `${run}/${caseId} pilot delta漂移`);
    assert(pilotSamples.find((item) => item.arm === "transcript_only")?.image_assets.length === 0, `${run}/${caseId} transcript视觉预算无效`);
    assert(pilotSamples.filter((item) => item.arm !== "transcript_only").every((item) => item.image_assets.length === 1 && /^[a-f0-9]{64}$/.test(item.image_assets[0].sha256)), `${run}/${caseId} visual arm预算无效`);
  }

  for (const key of answerKey) {
    const blind = blindById.get(key.blind_id);
    const record = recordById.get(key.blind_id);
    assert(blind && record, `${run} blind/key/record 集合不闭合`);
    assert(blind.paired_case_id === key.paired_case_id && blind.seed_index === 0, `${run} blind pair/legacy seed index 漂移`);
    assert(record.case_id === key.case_id && record.arm === key.arm && record.seed === key.seed && record.condition_sha256 === key.condition_sha256, `${run} record/key 漂移`);
    const pilotSample = pilot.samples.find((item) => item.case_id === key.case_id && item.arm === key.arm);
    assert(pilotSample?.condition_sha256 === key.condition_sha256, `${run} pilot/key condition 漂移`);
    assert(record.request_audit.model === manifest.model && record.request_audit.seed === spec.generation_seed && record.request_audit.attempt_count === 1 && record.request_audit.provider_response_received === true && record.request_audit.stop_reason === "stop" && record.request_audit.temperature === 0 && record.request_audit.max_output_tokens === 2048 && record.request_audit.cache_retention === "none" && record.request_audit.tools_policy === "none", `${run} request audit不符合冻结生成条件`);
    assert(stableJson(record.response) === stableJson(blind.response) && record.response_sha256 === blind.response_sha256, `${run} response 漂移`);
    assert(sha(JSON.stringify(blind.response)) === blind.response_sha256, `${run} response bytes hash 漂移`);
    validateOracleGateResponse(blind.response, key.arm);
    const evidence = cases[key.case_id];
    assert(evidence, `${run} 未知 case`);
    publicItems.push({
      blind_id: blind.blind_id,
      response: blind.response,
      response_sha256: blind.response_sha256,
      evidence_card: { schema_version: "ly004-development-item-evidence-v2", ...evidence },
    });
    privateMap.push({ ...key, development_seed_index: developmentSeedIndex, spec_sha256: sha(specBytes) });
    [key.paired_case_id, key.case_id, key.arm, String(key.seed), key.condition_sha256, record.run_id, record.request_audit.request_sha256, spec.protocol_scope, spec.blind_seed_sha256, ...spec.cases.flatMap((item) => [item.delta_id, item.uniform_frame_id])].forEach((value) => privateValues.add(normalizedLeakText(value)));
  }
  sourceRoots.push({
    development_seed_index: developmentSeedIndex,
    generation_spec_sha256: sha(specBytes),
    run_manifest_sha256: sha(manifestBytes),
    blind_items_sha256: sha(blindBytes),
    private_run_records_sha256: sha(recordsBytes),
    input_pilot_sha256: sha(pilotBytes),
    item_count: 8,
  });
}

assert(publicItems.length === 24 && new Set(publicItems.map((item) => item.blind_id)).size === 24, "合并盲包必须恰有24个唯一blind_id");
publicItems.forEach((item) => validateRaterItem(item, privateValues));
const sortedPrivateMap = privateMap.sort((a, b) => a.blind_id.localeCompare(b.blind_id, "en"));
const privateMapPayload = { schema_version: "ly004-development-private-rating-map-payload-v2", items: sortedPrivateMap };
const privateMapPayloadSha256 = sha("skyclass/ly004-development-private-rating-map-payload/v2\0" + stableJson(privateMapPayload));
const orderedViews = Object.fromEntries((["R1", "R2"] as const).map((raterId) => {
  const ordered = [...publicItems].sort((a, b) => sha(RATER_ORDER_DOMAINS[raterId] + a.blind_id).localeCompare(sha(RATER_ORDER_DOMAINS[raterId] + b.blind_id), "en"));
  const serialized = ordered.map((item) => JSON.stringify(item)).join("\n") + "\n";
  return [raterId, { serialized, items_sha256: sha(serialized) }];
})) as Record<"R1" | "R2", { serialized: string; items_sha256: string }>;
const matrixPayload = {
  protocol_scope: "ly004_preregistered_development_value_gate_v1",
  protocol_document_sha256: sha(await readFile(resolve(root, protocolDocument))),
  case_count: 2,
  arm_count: 4,
  arms_sha256: sha(stableJson([...ARMS].sort())),
  development_seed_count: 3,
  active_generation_seeds_sha256: sha(stableJson(ACTIVE_BLOCKS.map((item) => item.generation_seed))),
  request_count: 24,
  model: commonModel,
  prompt_sha256: commonPromptSha,
  output_schema_sha256: commonSchemaSha,
  source_roots: sourceRoots,
  private_map_payload_sha256: privateMapPayloadSha256,
  rater_item_roots: { R1: orderedViews.R1.items_sha256, R2: orderedViews.R2.items_sha256 },
};
const matrixReceiptSha256 = sha(MATRIX_DOMAIN + stableJson(matrixPayload));

await rm(outputRoot, { recursive: true, force: true });
for (const raterId of ["R1", "R2"] as const) {
  const serialized = orderedViews[raterId].serialized;
  const raterRoot = join(outputRoot, raterId.toLowerCase());
  await mkdir(raterRoot, { recursive: true });
  await writeFile(join(raterRoot, "items.jsonl"), serialized, "utf8");
  await writeFile(join(raterRoot, "manifest.json"), JSON.stringify({
    schema_version: "ly004-development-rater-view-v2",
    rater_id: raterId,
    item_count: 24,
    items_sha256: sha(serialized),
    matrix_receipt_sha256: matrixReceiptSha256,
    item_order_status: "rater_specific_deterministic_blind_order",
    visible_fields: ["blind_id", "response", "response_sha256", "evidence_card"],
    privacy_check_status: "exact_dto_and_normalized_known_private_values_checked_semantic_condition_inference_not_prevented",
    status: "development_agent_rating_only_not_paper_result",
  }, null, 2) + "\n", "utf8");
}
await mkdir(privateRoot, { recursive: true, mode: 0o700 });
await writeFile(join(privateRoot, "rating-map-v2.json"), JSON.stringify({
  schema_version: "ly004-development-private-rating-map-v2",
  matrix_receipt_sha256: matrixReceiptSha256,
  private_map_payload_sha256: privateMapPayloadSha256,
  items: sortedPrivateMap,
}, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
await writeFile(join(outputRoot, "manifest.json"), JSON.stringify({
  schema_version: "ly004-development-blind-package-v2",
  protocol_document: "research/board2skill/experiments/LY004_DEVELOPMENT_VALUE_GATE_V1.md",
  matrix_receipt_domain: MATRIX_DOMAIN,
  matrix_receipt_sha256: matrixReceiptSha256,
  matrix: matrixPayload,
  rater_views: ["r1", "r2"],
  public_grouping_metadata_status: "absent",
  condition_blindness_claim: "explicit_labels_absent_semantic_condition_inference_not_prevented",
  status: "development_blind_rating_only_not_paper_result",
}, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ output: outputRoot, items: publicItems.length, matrix_receipt_sha256: matrixReceiptSha256 }));
