import { createHash } from "node:crypto";
import { dirname } from "node:path";
import type {
  AuditedJsonResponse,
  ImageInput,
  LlmClient,
  LlmRequestAudit,
} from "../../llm/src/client.js";
import { verifyImageEvidence } from "../../media/src/imageEvidence.js";
import type {
  BoardEvidenceBundle,
  DistillMode,
  GroundedSkillDistillationSuite,
  GroundedSkillSourceCatalog,
  SignedGoldDataset,
  SignedGoldPackage,
} from "../../contracts/src/index.js";
import {
  canonicalSignedGoldDatasetPayload,
  validateBoardEvidenceBundle,
  validateGroundedSkillDistillationSuite,
  validateSignedGoldDataset,
  validateSignedGoldRecordSignatures,
} from "../../contracts/src/index.js";

const MAX_VISUALS_PER_REQUEST = 4;
const MAX_VISUAL_BYTES_PER_REQUEST = 20 * 1024 * 1024;
const MAX_PROMPT_CHARS = 120_000;

const GROUNDED_DISTILL_SYSTEM = `你是一名严格的课堂能力蒸馏器。输入是已经通过人工仲裁的时序板书与课堂语音证据。

你的任务是生成 renderer-neutral 的 Teaching Skill 草案：
1. Board Action IR 只描述教学语义、内容模板、空间约束和渐进呈现，不能写 HTML、SVG、Canvas 代码，也不能在 action 中绑定渲染器。
2. HTML / SVG / Ink 的选择只能出现在独立 Render Plan。结构化解释、公式卡片、表格和对比通常允许 HTML；几何、受力、坐标与关系图通常允许 SVG；需要保留手写节奏与笔迹时允许 Ink。preferred_target 可以是 auto。
3. 每张 [VISUAL ...] 图像都是一个 accepted delta 的 before/delta/after 对照 montage。先核对标签中的 transition_id、delta_id、evidence_ids，再解释板书动作。
4. 只引用本批输入中存在且 accepted 的 transition_id、delta_id 和 evidence_id。teacher_replay / merged 的每个 delta 必须引用标签中与该 delta 精确对应的 board_delta evidence_id。
5. 网课只有老师：不能声称观察到学生点头、回答、理解或学习增益。学习检查是未来执行策略，不是原课堂事实。
6. 不能把原题答案或常数固化进可迁移 Skill；用参数化内容模板。
7. 不填默认套话。证据不足时减少 Skill 数量或写入 limitations。

只输出严格 JSON，不要 Markdown。`;

const GROUNDED_MERGE_SYSTEM = `你是一名严格的课堂能力蒸馏合并器。输入候选均来自成功提交真实 before/delta/after montage 后通过 schema 与来源校验的分批结果。
把重复候选合并为 1–3 个 renderer-neutral Teaching Skills。不能增加候选中不存在的 transition_id、delta_id、evidence_id，也不能丢掉 teacher_replay / merged 动作与精确视觉 evidence 的绑定。HTML / SVG / Ink 只能出现在 Render Plan。教师单人网课不得补写学生事实。只输出严格 JSON。`;

const SIGNED_GOLD_DISTILL_SYSTEM = `你是一名严格的课堂能力蒸馏器。输入来自已经完成视觉仲裁与物理复核双签的 Signed Gold 单课数据。
每张 [VISUAL ...] 是一个人工接受组的规范 comparison 证据；同组 final_events 是可见板书事实，speech_context 只作未仲裁语境，不能覆盖视觉事实。
生成 renderer-neutral Teaching Skill：Board Action IR 只写教学语义、参数化内容模板、空间约束与渐进呈现；HTML/SVG/Ink 只能出现在独立 Render Plan。
teacher_replay 或 merged 动作必须引用本批真实 transition_id、delta_id 与实际提交的 visual evidence_id。不得补写学生反应、学习结果、原题固定答案或未签字的教学意图。证据不足时减少 Skill 或写 limitations。
只输出严格 JSON，不要 Markdown。`;

export interface GroundedSkillVisualEvidence {
  transition_ids: string[];
  delta_id: string;
  evidence_ids: string[];
  asset_uri: string;
  sha256: string;
  label: string;
  width: number;
  height: number;
  byte_length: number;
  image: ImageInput;
}

export interface GroundedSkillVisualBatchAudit {
  batch_id: string;
  transition_ids: string[];
  delta_ids: string[];
  evidence_ids: string[];
  visual_set_sha256: string;
  prompt_char_count: number;
  visuals: Array<{
    delta_id: string;
    evidence_ids: string[];
    asset_uri: string;
    sha256: string;
    width: number;
    height: number;
    byte_length: number;
  }>;
  requests: LlmRequestAudit[];
}

export interface GroundedSkillVisualAudit {
  schema_version: "grounded-skill-visual-audit-v1";
  source_bundle_id: string;
  evidence_package_sha256: string;
  batching_rule: "accepted-delta-comparison-montage-max-4-and-20mb" | "signed-gold-group-comparison-max-4-and-20mb";
  batches: GroundedSkillVisualBatchAudit[];
  merge_requests: LlmRequestAudit[];
  submitted_visual_evidence_ids: string[];
  submitted_delta_ids: string[];
  all_visual_batches_succeeded: true;
}

export interface GroundedSkillDistillationResult {
  suite: GroundedSkillDistillationSuite;
  source_catalog: GroundedSkillSourceCatalog;
  visual_audit: GroundedSkillVisualAudit;
}

interface GroundedDistillationClient extends Pick<LlmClient, "chatJsonAudited"> {}

interface CatalogOptions {
  transitionIds?: Set<string>;
  deltaIds?: Set<string>;
  submittedVisualEvidenceIds?: Iterable<string>;
}

function stableUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function visualRefsForDelta(bundle: BoardEvidenceBundle, transitionEvidenceRefs: string[], deltaId: string): string[] {
  const permitted = new Set(transitionEvidenceRefs);
  const comparison = bundle.deltas.find((item) => item.delta_id === deltaId)?.comparison_asset;
  return bundle.evidence
    .filter((item) => item.kind === "board_delta"
      && item.target_id === deltaId
      && permitted.has(item.evidence_id)
      && item.asset?.asset_uri === comparison?.asset_uri
      && item.asset?.sha256 === comparison?.sha256)
    .map((item) => item.evidence_id)
    .sort();
}

export function buildGroundedSkillSourceCatalog(bundle: BoardEvidenceBundle, options: CatalogOptions = {}): GroundedSkillSourceCatalog {
  const report = validateBoardEvidenceBundle(bundle);
  if (!report.valid) throw new Error(`不能从无效 BoardEvidenceBundle 构建 source catalog：${report.issues.slice(0, 4).map((issue) => `${issue.path} ${issue.message}`).join("；")}`);
  const acceptedTransitions = bundle.transitions
    .filter((transition) => transition.status === "accepted" && (!options.transitionIds || options.transitionIds.has(transition.transition_id)))
    .map((transition) => {
      const deltaIds = transition.delta_ids.filter((id) => !options.deltaIds || options.deltaIds.has(id));
      return {
        transition_id: transition.transition_id,
        delta_ids: deltaIds,
        evidence_refs: [...transition.evidence_refs],
        visual_evidence_by_delta: Object.fromEntries(deltaIds.map((deltaId) => [deltaId, visualRefsForDelta(bundle, transition.evidence_refs, deltaId)])),
      };
    })
    .filter((transition) => transition.delta_ids.length > 0);
  return {
    source_bundle_id: bundle.bundle_id,
    teacher_only_recording: bundle.teacher_only_recording,
    accepted_transitions: acceptedTransitions,
    evidence_ids: stableUnique(acceptedTransitions.flatMap((transition) => transition.evidence_refs)),
    submitted_visual_evidence_ids: stableUnique([...(options.submittedVisualEvidenceIds ?? [])]),
  };
}

export async function prepareGroundedVisualEvidence(
  bundle: BoardEvidenceBundle,
  bundlePath: string,
): Promise<GroundedSkillVisualEvidence[]> {
  const report = validateBoardEvidenceBundle(bundle);
  if (!report.valid) throw new Error(`BoardEvidenceBundle 未通过校验：${report.issues.slice(0, 6).map((issue) => `${issue.path} ${issue.message}`).join("；")}`);
  const accepted = bundle.transitions.filter((transition) => transition.status === "accepted");
  const transitionsByDelta = new Map<string, string[]>();
  const evidenceByDelta = new Map<string, string[]>();
  for (const transition of accepted) {
    for (const deltaId of transition.delta_ids) {
      transitionsByDelta.set(deltaId, stableUnique([...(transitionsByDelta.get(deltaId) ?? []), transition.transition_id]));
      evidenceByDelta.set(deltaId, stableUnique([...(evidenceByDelta.get(deltaId) ?? []), ...visualRefsForDelta(bundle, transition.evidence_refs, deltaId)]));
    }
  }
  const acceptedDeltas = bundle.deltas
    .filter((delta) => delta.status === "accepted" && transitionsByDelta.has(delta.delta_id))
    .sort((left, right) => left.time.start - right.time.start || left.delta_id.localeCompare(right.delta_id));
  const seenSha = new Map<string, string>();
  const root = dirname(bundlePath);
  const result: GroundedSkillVisualEvidence[] = [];
  for (const delta of acceptedDeltas) {
    const evidenceIds = evidenceByDelta.get(delta.delta_id) ?? [];
    if (!evidenceIds.length) throw new Error(`accepted delta ${delta.delta_id} 缺少精确 board_delta evidence_id`);
    const previousDelta = seenSha.get(delta.comparison_asset.sha256);
    if (previousDelta && previousDelta !== delta.delta_id) {
      throw new Error(`不同 delta 不能共享同一个 comparison montage SHA-256：${previousDelta} / ${delta.delta_id}`);
    }
    seenSha.set(delta.comparison_asset.sha256, delta.delta_id);
    const verified = await verifyImageEvidence({
      root,
      assetUri: delta.comparison_asset.asset_uri,
      expectedSha256: delta.comparison_asset.sha256,
    });
    const transitionIds = transitionsByDelta.get(delta.delta_id) ?? [];
    const label = `transition_id=${transitionIds.join(",")} delta_id=${delta.delta_id} evidence_ids=${evidenceIds.join(",")}`;
    result.push({
      transition_ids: transitionIds,
      delta_id: delta.delta_id,
      evidence_ids: evidenceIds,
      asset_uri: delta.comparison_asset.asset_uri,
      sha256: verified.sha256,
      label,
      width: verified.width,
      height: verified.height,
      byte_length: verified.byte_length,
      image: {
        label,
        bytes: verified.bytes,
        mime_type: verified.mime_type,
        sha256: verified.sha256,
      },
    });
  }
  if (!result.length) throw new Error("没有可提交的 accepted delta comparison montage");
  return result;
}

export function batchGroundedVisualEvidence(visuals: GroundedSkillVisualEvidence[]): GroundedSkillVisualEvidence[][] {
  const batches: GroundedSkillVisualEvidence[][] = [];
  let current: GroundedSkillVisualEvidence[] = [];
  let bytes = 0;
  for (const visual of visuals) {
    if (current.length && (current.length >= MAX_VISUALS_PER_REQUEST || bytes + visual.byte_length > MAX_VISUAL_BYTES_PER_REQUEST)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    if (visual.byte_length > MAX_VISUAL_BYTES_PER_REQUEST) throw new Error(`单个 montage 超过 ${MAX_VISUAL_BYTES_PER_REQUEST} 字节批预算`);
    current.push(visual);
    bytes += visual.byte_length;
  }
  if (current.length) batches.push(current);
  return batches;
}

function evidenceForPrompt(bundle: BoardEvidenceBundle, catalog: GroundedSkillSourceCatalog): Record<string, unknown> {
  const transitions = new Map(catalog.accepted_transitions.map((item) => [item.transition_id, item]));
  const deltaIds = new Set(catalog.accepted_transitions.flatMap((item) => item.delta_ids));
  const sourceTransitions = bundle.transitions
    .filter((transition) => transitions.has(transition.transition_id))
    .map((transition) => ({ ...transition, delta_ids: transition.delta_ids.filter((id) => deltaIds.has(id)) }));
  const speechIds = new Set(sourceTransitions.flatMap((transition) => transition.speech_ids));
  const evidenceIds = new Set(catalog.evidence_ids);
  return {
    bundle_id: bundle.bundle_id,
    teacher_only_recording: bundle.teacher_only_recording,
    transitions: sourceTransitions,
    deltas: bundle.deltas.filter((delta) => deltaIds.has(delta.delta_id)),
    speech: bundle.speech.filter((span) => speechIds.has(span.speech_id)),
    evidence: bundle.evidence.filter((item) => evidenceIds.has(item.evidence_id)),
  };
}

function suiteShape(subject: string, sourceBundleId: string, teacherOnlyRecording: boolean): string {
  return `{
  "schema_version":"grounded-skill-distillation-v2",
  "suite_name":"...",
  "subject":"${subject}",
  "source_bundle_id":"${sourceBundleId}",
  "renderer_neutral":true,
  "teacher_only_recording":${teacherOnlyRecording},
  "capabilities":[{
    "key":"english-kebab-case","name":"...","summary":"...","teaching_goal":"...","mechanism":"...",
    "use_when":["未来使用时可观察的条件"],"prerequisites":["..."],
    "variants":[{
      "variant_id":"main","use_when":["..."],
      "board_actions":[{
        "action_id":"action-1","step":1,"origin":"teacher_replay|counterfactual|repair|merged",
        "operation":"introduce|annotate|connect|contrast|revise|clear","pedagogical_target":"...",
        "content_template":"参数化语义内容","artifact_kind":"explanation|formula|comparison|table|diagram|simulation|annotation",
        "spatial_constraints":["..."],"progressive_reveal":true,
        "source_transition_ids":["..."],"source_delta_ids":["..."],"evidence_refs":["..."]
      }],
      "render_plans":[{"plan_id":"plan-1","board_action_ids":["action-1"],"preferred_target":"auto|html|svg|ink","allowed_targets":["html","svg"],"fallback_targets":["html"],"layout_mode":"document|split|grid|freeform","interaction_mode":"static|stepwise|interactive","rationale":"..."}],
      "learning_checks":[{"check_id":"check-1","prompt_template":"未来执行时的检查任务","success_criteria":["可观察标准"],"failure_codes":["..."]}],
      "remediation_actions":[]
    }],
    "abstain_when":["..."],"source_transition_ids":["..."],"evidence_refs":["..."],"limitations":["..."]
  }],
  "limitations":["..."]
}`;
}

function promptForGroundedSkills(input: {
  subject: string;
  bundle: BoardEvidenceBundle;
  catalog: GroundedSkillSourceCatalog;
  visuals: GroundedSkillVisualEvidence[];
  priorErrors: string[];
}): string {
  const visualIndex = input.visuals.map((visual) => ({
    label: visual.label,
    transition_ids: visual.transition_ids,
    delta_id: visual.delta_id,
    evidence_ids: visual.evidence_ids,
    comparison_asset_sha256: visual.sha256,
  }));
  const repair = input.priorErrors.length
    ? `\n\n上一次输出未通过校验，请只修复这些问题：\n${input.priorErrors.map((item) => `- ${item}`).join("\n")}`
    : "";
  const prompt = `输出 1–3 个候选 Skill。学科：${input.subject}。

严格输出以下结构，不能增加字段：
${suiteShape(input.subject, input.bundle.bundle_id, input.bundle.teacher_only_recording)}

本批实际提交视觉索引：
${JSON.stringify(visualIndex)}

已仲裁证据：
${JSON.stringify(evidenceForPrompt(input.bundle, input.catalog))}${repair}`;
  if (prompt.length > MAX_PROMPT_CHARS) throw new Error(`Grounded Skill 批提示超过 ${MAX_PROMPT_CHARS} 字符预算`);
  return prompt;
}

function mergePrompt(input: {
  subject: string;
  sourceBundleId: string;
  teacherOnlyRecording: boolean;
  candidates: GroundedSkillDistillationSuite[];
  priorErrors: string[];
}): string {
  const repair = input.priorErrors.length
    ? `\n\n上一次合并未通过校验，请只修复：\n${input.priorErrors.map((item) => `- ${item}`).join("\n")}`
    : "";
  const prompt = `合并为 1–3 个候选 Skill。输出结构：\n${suiteShape(input.subject, input.sourceBundleId, input.teacherOnlyRecording)}\n\n已经过视觉验证的分批候选：\n${JSON.stringify(input.candidates)}${repair}`;
  if (prompt.length > MAX_PROMPT_CHARS) throw new Error(`Grounded Skill 合并提示超过 ${MAX_PROMPT_CHARS} 字符预算`);
  return prompt;
}

function suiteErrors(raw: Record<string, unknown>, subject: string, catalog: GroundedSkillSourceCatalog): string[] {
  const report = validateGroundedSkillDistillationSuite(raw, catalog);
  if (raw.subject !== subject) report.issues.push({ code: "suite.subject", path: "$.subject", message: "subject 必须与蒸馏请求一致。" });
  if (Array.isArray(raw.capabilities) && (raw.capabilities.length < 1 || raw.capabilities.length > 3)) {
    report.issues.push({ code: "suite.capability_count", path: "$.capabilities", message: "single 模式要求 1–3 个 Skill。" });
  }
  return report.issues.slice(0, 12).map((issue) => `${issue.path}: ${issue.message}`);
}

function assertVisualRequestAudit(audit: LlmRequestAudit, visuals: GroundedSkillVisualEvidence[]): void {
  const expected = visuals.map((visual) => ({ label: visual.label, sha256: visual.sha256 }));
  const submitted = audit.submitted_visuals.map((visual) => ({ label: visual.label, sha256: visual.sha256 }));
  if (JSON.stringify(submitted) !== JSON.stringify(expected)) throw new Error("模型请求审计中的视觉集合与预校验集合不一致");
}

async function generateValidatedSuite(input: {
  client: GroundedDistillationClient;
  system: string;
  prompt: (priorErrors: string[]) => string;
  images: ImageInput[];
  visuals: GroundedSkillVisualEvidence[];
  subject: string;
  catalog: GroundedSkillSourceCatalog;
  attempts: number;
  requestAudits: LlmRequestAudit[];
}): Promise<GroundedSkillDistillationSuite> {
  let priorErrors: string[] = [];
  for (let attempt = 1; attempt <= input.attempts; attempt += 1) {
    const response: AuditedJsonResponse = await input.client.chatJsonAudited(input.system, input.prompt(priorErrors), input.images, 0);
    if (input.visuals.length) assertVisualRequestAudit(response.audit, input.visuals);
    input.requestAudits.push(response.audit);
    const errors = suiteErrors(response.value, input.subject, input.catalog);
    if (!errors.length) return response.value as unknown as GroundedSkillDistillationSuite;
    priorErrors = errors;
  }
  throw new Error(`grounded-skill-distillation-v2 连续校验失败：${priorErrors.join("；")}`);
}

function signedSourceBundleId(dataset: SignedGoldDataset, source: SignedGoldPackage): string {
  return `signed-gold:${dataset.dataset_id}:${source.package_id}`;
}

function signedTransitionId(source: SignedGoldPackage, groupId: string): string {
  return `gold-transition:${source.package_id}:${groupId}`;
}

function signedDeltaId(source: SignedGoldPackage, groupId: string): string {
  return `gold-delta:${source.package_id}:${groupId}`;
}

function signedEvidenceId(source: SignedGoldPackage, groupId: string, evidenceId: string): string {
  return `gold-evidence:${source.package_id}:${groupId}:${evidenceId}`;
}

function buildSignedGoldSourceCatalog(
  dataset: SignedGoldDataset,
  source: SignedGoldPackage,
  options: { transitionIds?: Set<string>; submittedVisualEvidenceIds?: Iterable<string> } = {},
): GroundedSkillSourceCatalog {
  const sourceBundleId = signedSourceBundleId(dataset, source);
  const acceptedTransitions = source.groups.map((group) => {
    const transitionId = signedTransitionId(source, group.group_id);
    const deltaId = signedDeltaId(source, group.group_id);
    const evidenceId = signedEvidenceId(source, group.group_id, group.canonical_visual_evidence_id);
    return {
      transition_id: transitionId,
      delta_ids: [deltaId],
      evidence_refs: [evidenceId],
      visual_evidence_by_delta: { [deltaId]: [evidenceId] },
    };
  }).filter((item) => !options.transitionIds || options.transitionIds.has(item.transition_id));
  return {
    source_bundle_id: sourceBundleId,
    teacher_only_recording: true,
    accepted_transitions: acceptedTransitions,
    evidence_ids: stableUnique(acceptedTransitions.flatMap((item) => item.evidence_refs)),
    submitted_visual_evidence_ids: stableUnique([...(options.submittedVisualEvidenceIds ?? [])]),
  };
}

async function prepareSignedGoldVisualEvidence(
  root: string,
  source: SignedGoldPackage,
): Promise<GroundedSkillVisualEvidence[]> {
  const output: GroundedSkillVisualEvidence[] = [];
  const seenSha = new Map<string, string>();
  for (const group of [...source.groups].sort((left, right) => left.group_id.localeCompare(right.group_id, "en"))) {
    const canonical = group.visual_evidence.find((item) => item.evidence_id === group.canonical_visual_evidence_id);
    if (!canonical || !canonical.kind.toLowerCase().includes("comparison")) {
      throw new Error(`Signed Gold 组缺少规范 comparison 证据：${source.package_id}/${group.group_id}`);
    }
    const verified = await verifyImageEvidence({ root, assetUri: canonical.asset_uri, expectedSha256: canonical.sha256 });
    if (verified.mime_type !== canonical.mime_type || verified.width !== canonical.width || verified.height !== canonical.height || verified.byte_length !== canonical.byte_length) {
      throw new Error(`Signed Gold 视觉元数据与实际文件不一致：${source.package_id}/${group.group_id}`);
    }
    const previous = seenSha.get(verified.sha256);
    if (previous) throw new Error(`不同 Signed Gold 组不得共享同一规范视觉证据：${previous}/${group.group_id}`);
    seenSha.set(verified.sha256, group.group_id);
    const transitionId = signedTransitionId(source, group.group_id);
    const deltaId = signedDeltaId(source, group.group_id);
    const evidenceId = signedEvidenceId(source, group.group_id, canonical.evidence_id);
    const label = `transition_id=${transitionId} delta_id=${deltaId} evidence_ids=${evidenceId}`;
    output.push({
      transition_ids: [transitionId],
      delta_id: deltaId,
      evidence_ids: [evidenceId],
      asset_uri: canonical.asset_uri,
      sha256: verified.sha256,
      label,
      width: verified.width,
      height: verified.height,
      byte_length: verified.byte_length,
      image: { label, bytes: verified.bytes, mime_type: verified.mime_type, sha256: verified.sha256 },
    });
  }
  if (!output.length) throw new Error(`Signed Gold 单课没有可蒸馏的接受组：${source.package_id}`);
  return output;
}

function promptForSignedGold(input: {
  subject: string;
  dataset: SignedGoldDataset;
  source: SignedGoldPackage;
  catalog: GroundedSkillSourceCatalog;
  visuals: GroundedSkillVisualEvidence[];
  priorErrors: string[];
}): string {
  const transitionIds = new Set(input.catalog.accepted_transitions.map((item) => item.transition_id));
  const groups = input.source.groups.filter((group) => transitionIds.has(signedTransitionId(input.source, group.group_id))).map((group) => ({
    group_id: group.group_id,
    transition_id: signedTransitionId(input.source, group.group_id),
    delta_id: signedDeltaId(input.source, group.group_id),
    decision_signature_sha256: group.decision_signature_sha256,
    final_events: group.final_events,
    canonical_visual_evidence_id: signedEvidenceId(input.source, group.group_id, group.canonical_visual_evidence_id),
    speech_context: group.speech_context,
  }));
  const visualIndex = input.visuals.map((visual) => ({
    label: visual.label,
    transition_ids: visual.transition_ids,
    delta_id: visual.delta_id,
    evidence_ids: visual.evidence_ids,
    comparison_asset_sha256: visual.sha256,
  }));
  const repair = input.priorErrors.length
    ? `\n\n上一次输出未通过校验，请只修复这些问题：\n${input.priorErrors.map((item) => `- ${item}`).join("\n")}`
    : "";
  const prompt = `输出 1–3 个本课可迁移候选 Skill。学科：${input.subject}。

严格输出以下结构，不能增加字段：
${suiteShape(input.subject, signedSourceBundleId(input.dataset, input.source), true)}

本批实际提交视觉索引：
${JSON.stringify(visualIndex)}

双签 Signed Gold 事件（speech_context.status=context_not_gold，不得冒充可见事实）：
${JSON.stringify({ dataset_id: input.dataset.dataset_id, package_id: input.source.package_id, source_video_id: input.source.source_video_id, groups })}${repair}`;
  if (prompt.length > MAX_PROMPT_CHARS) throw new Error(`Signed Gold Skill 批提示超过 ${MAX_PROMPT_CHARS} 字符预算`);
  return prompt;
}

export async function distillSignedGoldLesson(
  client: GroundedDistillationClient,
  input: {
    subject: string;
    dataset: SignedGoldDataset;
    evidenceRoot: string;
    sourceVideoId: string;
    mode: DistillMode;
    validationAttempts?: number;
  },
): Promise<GroundedSkillDistillationResult> {
  if (input.mode !== "single") throw new Error("Signed Gold 首批入口仅支持单课蒸馏；多教师共性融合必须走后续独立 gate。");
  const datasetReport = validateSignedGoldDataset(input.dataset);
  if (!datasetReport.valid) throw new Error(`Signed Gold 数据集校验失败：${datasetReport.issues.slice(0, 6).map((item) => `${item.path} ${item.message}`).join("；")}`);
  const signatureIssues = validateSignedGoldRecordSignatures(input.dataset, (payload) => createHash("sha256").update(payload).digest("hex"));
  if (signatureIssues.length) throw new Error(`Signed Gold 签字链校验失败：${signatureIssues.slice(0, 6).map((item) => `${item.path} ${item.message}`).join("；")}`);
  const declaredSha = input.dataset.dataset_sha256;
  const actualSha = createHash("sha256").update(canonicalSignedGoldDatasetPayload(input.dataset)).digest("hex");
  if (actualSha !== declaredSha || input.dataset.dataset_id !== `signed-gold-${declaredSha.slice(0, 16)}`) {
    throw new Error("Signed Gold 数据集内容哈希不匹配");
  }
  const matches = input.dataset.packages.filter((item) => item.source_video_id === input.sourceVideoId);
  if (matches.length !== 1) throw new Error(`Signed Gold 必须恰好包含一个所选单课包：${input.sourceVideoId}`);
  const source = matches[0];
  if (source.signoffs.length !== 2 || !source.groups.length || source.accepted_event_count < 1) throw new Error("Signed Gold 单课包缺少双签或接受事件");
  const attempts = Math.min(3, Math.max(1, input.validationAttempts ?? 2));
  const visuals = await prepareSignedGoldVisualEvidence(input.evidenceRoot, source);
  const batches = batchGroundedVisualEvidence(visuals);
  const candidates: GroundedSkillDistillationSuite[] = [];
  const batchAudits: GroundedSkillVisualBatchAudit[] = [];
  const submittedEvidence = new Set<string>();
  for (const [index, batch] of batches.entries()) {
    const transitionIds = new Set(batch.flatMap((item) => item.transition_ids));
    const batchEvidence = stableUnique(batch.flatMap((item) => item.evidence_ids));
    const catalog = buildSignedGoldSourceCatalog(input.dataset, source, { transitionIds, submittedVisualEvidenceIds: batchEvidence });
    const requests: LlmRequestAudit[] = [];
    const prompt = (priorErrors: string[]) => promptForSignedGold({
      subject: input.subject,
      dataset: input.dataset,
      source,
      catalog,
      visuals: batch,
      priorErrors,
    });
    const suite = await generateValidatedSuite({
      client,
      system: SIGNED_GOLD_DISTILL_SYSTEM,
      prompt,
      images: batch.map((item) => item.image),
      visuals: batch,
      subject: input.subject,
      catalog,
      attempts,
      requestAudits: requests,
    });
    batchEvidence.forEach((item) => submittedEvidence.add(item));
    candidates.push(suite);
    batchAudits.push({
      batch_id: `signed-gold-batch-${String(index + 1).padStart(3, "0")}`,
      transition_ids: stableUnique(batch.flatMap((item) => item.transition_ids)),
      delta_ids: batch.map((item) => item.delta_id),
      evidence_ids: batchEvidence,
      visual_set_sha256: sha256(batch.map((item) => ({ label: item.label, sha256: item.sha256 }))),
      prompt_char_count: prompt([]).length,
      visuals: batch.map((item) => ({
        delta_id: item.delta_id,
        evidence_ids: item.evidence_ids,
        asset_uri: item.asset_uri,
        sha256: item.sha256,
        width: item.width,
        height: item.height,
        byte_length: item.byte_length,
      })),
      requests,
    });
  }
  const sourceCatalog = buildSignedGoldSourceCatalog(input.dataset, source, { submittedVisualEvidenceIds: submittedEvidence });
  let suite = candidates[0];
  let mergeRequests: LlmRequestAudit[] = [];
  if (candidates.length > 1) {
    const requests: LlmRequestAudit[] = [];
    suite = await generateValidatedSuite({
      client,
      system: GROUNDED_MERGE_SYSTEM,
      prompt: (priorErrors) => mergePrompt({
        subject: input.subject,
        sourceBundleId: sourceCatalog.source_bundle_id,
        teacherOnlyRecording: true,
        candidates,
        priorErrors,
      }),
      images: [],
      visuals: [],
      subject: input.subject,
      catalog: sourceCatalog,
      attempts,
      requestAudits: requests,
    });
    mergeRequests = requests;
  }
  return {
    suite,
    source_catalog: sourceCatalog,
    visual_audit: {
      schema_version: "grounded-skill-visual-audit-v1",
      source_bundle_id: sourceCatalog.source_bundle_id,
      evidence_package_sha256: input.dataset.dataset_sha256,
      batching_rule: "signed-gold-group-comparison-max-4-and-20mb",
      batches: batchAudits,
      merge_requests: mergeRequests,
      submitted_visual_evidence_ids: stableUnique([...submittedEvidence]),
      submitted_delta_ids: visuals.map((item) => item.delta_id),
      all_visual_batches_succeeded: true,
    },
  };
}

export async function distillGroundedSkills(
  client: GroundedDistillationClient,
  input: {
    subject: string;
    bundle: BoardEvidenceBundle;
    bundlePath: string;
    mode: DistillMode;
    validationAttempts?: number;
  },
): Promise<GroundedSkillDistillationResult> {
  if (input.mode === "common") {
    throw new Error("时序板书 v2 的跨课共性蒸馏需要多个独立 BoardEvidenceBundle；当前单 bundle 入口仅支持 single 模式。");
  }
  const bundleReport = validateBoardEvidenceBundle(input.bundle);
  if (!bundleReport.valid) {
    throw new Error(`BoardEvidenceBundle 未通过校验：${bundleReport.issues.slice(0, 6).map((issue) => `${issue.path} ${issue.message}`).join("；")}`);
  }
  if (!input.bundle.transitions.some((transition) => transition.status === "accepted")) throw new Error("没有 accepted transition，不能进入 Skill 蒸馏。");
  const attempts = Math.min(3, Math.max(1, input.validationAttempts ?? 2));
  const visuals = await prepareGroundedVisualEvidence(input.bundle, input.bundlePath);
  const visualBatches = batchGroundedVisualEvidence(visuals);
  const candidateSuites: GroundedSkillDistillationSuite[] = [];
  const batchAudits: GroundedSkillVisualBatchAudit[] = [];
  const submittedEvidence = new Set<string>();

  for (const [index, batch] of visualBatches.entries()) {
    const transitionIds = new Set(batch.flatMap((item) => item.transition_ids));
    const deltaIds = new Set(batch.map((item) => item.delta_id));
    const batchEvidence = stableUnique(batch.flatMap((item) => item.evidence_ids));
    const catalog = buildGroundedSkillSourceCatalog(input.bundle, {
      transitionIds,
      deltaIds,
      submittedVisualEvidenceIds: batchEvidence,
    });
    const requests: LlmRequestAudit[] = [];
    const prompt = (priorErrors: string[]) => promptForGroundedSkills({
      subject: input.subject,
      bundle: input.bundle,
      catalog,
      visuals: batch,
      priorErrors,
    });
    const suite = await generateValidatedSuite({
      client,
      system: GROUNDED_DISTILL_SYSTEM,
      prompt,
      images: batch.map((item) => item.image),
      visuals: batch,
      subject: input.subject,
      catalog,
      attempts,
      requestAudits: requests,
    });
    batchEvidence.forEach((id) => submittedEvidence.add(id));
    candidateSuites.push(suite);
    batchAudits.push({
      batch_id: `visual-batch-${String(index + 1).padStart(3, "0")}`,
      transition_ids: stableUnique(batch.flatMap((item) => item.transition_ids)),
      delta_ids: batch.map((item) => item.delta_id),
      evidence_ids: batchEvidence,
      visual_set_sha256: sha256(batch.map((item) => ({ label: item.label, sha256: item.sha256 }))),
      prompt_char_count: prompt([]).length,
      visuals: batch.map((item) => ({
        delta_id: item.delta_id,
        evidence_ids: item.evidence_ids,
        asset_uri: item.asset_uri,
        sha256: item.sha256,
        width: item.width,
        height: item.height,
        byte_length: item.byte_length,
      })),
      requests,
    });
  }

  const sourceCatalog = buildGroundedSkillSourceCatalog(input.bundle, { submittedVisualEvidenceIds: submittedEvidence });
  let suite = candidateSuites[0];
  let mergeRequests: LlmRequestAudit[] = [];
  if (candidateSuites.length > 1) {
    const requests: LlmRequestAudit[] = [];
    suite = await generateValidatedSuite({
      client,
      system: GROUNDED_MERGE_SYSTEM,
      prompt: (priorErrors) => mergePrompt({ subject: input.subject, sourceBundleId: input.bundle.bundle_id, teacherOnlyRecording: input.bundle.teacher_only_recording, candidates: candidateSuites, priorErrors }),
      images: [],
      visuals: [],
      subject: input.subject,
      catalog: sourceCatalog,
      attempts,
      requestAudits: requests,
    });
    mergeRequests = requests;
  }

  return {
    suite,
    source_catalog: sourceCatalog,
    visual_audit: {
      schema_version: "grounded-skill-visual-audit-v1",
      source_bundle_id: input.bundle.bundle_id,
      evidence_package_sha256: input.bundle.payload_sha256,
      batching_rule: "accepted-delta-comparison-montage-max-4-and-20mb",
      batches: batchAudits,
      merge_requests: mergeRequests,
      submitted_visual_evidence_ids: stableUnique([...submittedEvidence]),
      submitted_delta_ids: visuals.map((item) => item.delta_id),
      all_visual_batches_succeeded: true,
    },
  };
}
