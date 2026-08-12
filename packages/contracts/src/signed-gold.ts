import type {
  GoldReviewDecisionRecord,
  GoldReviewEvent,
  GoldReviewPackageSignoff,
} from "./gold-review.js";
import {
  canonicalGoldReviewDecisionSignaturePayload,
  canonicalGoldReviewPackageSignoffSignaturePayload,
} from "./gold-review.js";

export interface SignedGoldVisualEvidence {
  evidence_id: string;
  side: string;
  kind: string;
  label: string;
  asset_uri: string;
  sha256: string;
  mime_type: "image/png" | "image/jpeg";
  width: number;
  height: number;
  byte_length: number;
}

export interface SignedGoldGroup {
  group_id: string;
  alignment_class: string;
  decision_signature_sha256: string;
  decision_revision: number;
  final_events: GoldReviewEvent[];
  canonical_visual_evidence_id: string;
  visual_evidence: SignedGoldVisualEvidence[];
  speech_context: {
    text: string;
    status: "context_not_gold";
  };
}

export interface SignedGoldPackage {
  package_id: string;
  source_video_id: string;
  source_intake_uri: string;
  source_intake_sha256: string;
  reviewed_group_count: number;
  accepted_group_count: number;
  accepted_event_count: number;
  decision_signatures: string[];
  decisions: GoldReviewDecisionRecord[];
  signoffs: GoldReviewPackageSignoff[];
  groups: SignedGoldGroup[];
}

export interface SignedGoldDataset {
  schema_version: "signed-gold-dataset-v1";
  dataset_id: string;
  dataset_sha256: string;
  status: "paper_gold_signed";
  frozen_at: string;
  source_queue_schema_version: "gold-review-queue-v1";
  package_count: number;
  reviewed_group_count: number;
  accepted_group_count: number;
  accepted_event_count: number;
  minimum_required_event_count: number;
  packages: SignedGoldPackage[];
}

export interface SignedGoldCompileResult {
  dataset_uri: string;
  dataset: SignedGoldDataset;
}

export interface SignedGoldValidationIssue {
  path: string;
  message: string;
}

export interface SignedGoldValidationReport {
  valid: boolean;
  issues: SignedGoldValidationIssue[];
}

export function validateSignedGoldRecordSignatures(
  dataset: SignedGoldDataset,
  digest: (payload: string) => string,
): SignedGoldValidationIssue[] {
  const issues: SignedGoldValidationIssue[] = [];
  dataset.packages.forEach((reviewPackage, packageIndex) => {
    reviewPackage.decisions.forEach((decision, decisionIndex) => {
      if (digest(canonicalGoldReviewDecisionSignaturePayload(decision)) !== decision.signature_sha256) {
        issues.push({ path: `packages[${packageIndex}].decisions[${decisionIndex}].signature_sha256`, message: "决策正文哈希不匹配" });
      }
    });
    reviewPackage.signoffs.forEach((signoff, signoffIndex) => {
      if (digest(canonicalGoldReviewPackageSignoffSignaturePayload(signoff)) !== signoff.signature_sha256) {
        issues.push({ path: `packages[${packageIndex}].signoffs[${signoffIndex}].signature_sha256`, message: "签字正文哈希不匹配" });
      }
    });
  });
  return issues;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return "null";
}

/** Canonical payload for content addressing; dataset identity fields are excluded. */
export function canonicalSignedGoldDatasetPayload(input: SignedGoldDataset | Omit<SignedGoldDataset, "dataset_id" | "dataset_sha256">): string {
  const { dataset_id: _datasetId, dataset_sha256: _datasetSha256, ...payload } = input as SignedGoldDataset;
  return stableJson(payload);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function isSafeRelativeUri(value: unknown): value is string {
  if (!isNonEmpty(value) || value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
  let decoded = value;
  let stable = false;
  try {
    for (let index = 0; index < 16; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) { stable = true; break; }
      decoded = next;
    }
  } catch { return false; }
  if (!stable || !decoded || decoded.includes("\\") || decoded.includes("\0") || decoded.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) return false;
  return decoded.split("/").every((part) => Boolean(part) && part !== "." && part !== "..");
}

function exactStringSet(left: unknown, right: string[]): boolean {
  return Array.isArray(left)
    && left.every(isSha256)
    && new Set(left).size === left.length
    && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

const CHINESE_LEARNER_SUBJECT = /(?:学生|学员|同学|孩子|儿童|班级|全班|大家)/g;
const CHINESE_LEARNER_OUTCOME = /(?:听懂|理解|明白|掌握|熟悉|学会|会做|作答|答对|做对|解出|解答|算出|独立完成|正确完成|顺利完成|不再犯错|进步|提高|提升|改善|下降|正确率|错误率|成绩|学习效果|学习增益|教学效果|(?:均|都|已经|已|现在|目前)*\s*(?:能|会|能够|可以)(?:\s*(?:了|独立|正确|顺利|完成|解出|解答|做对|答对))*)/i;
const CHINESE_HYPOTHETICAL_PREFIX = /(?:引导|指导|帮助|协助|使|让|鼓励|支持|训练|要求|提示|请|询问|安排|邀请|以便|为了|旨在|希望|期望|预期|若|如果|假如)\s*$/;
const CHINESE_HYPOTHETICAL_MODAL = /(?:将|应该|应当|可能|或许|预计|预期|需要|需|尝试|练习)/;
const CHINESE_NAMED_LEARNER_OUTCOME = /(?:^|[，。；：,:;\s])(?!(?:老师|教师|教员))\p{Script=Han}{2,4}(?:已经|已|正在|独立|正确|顺利)*\s*(?:作答|答对|做对)/u;
const ENGLISH_LEARNER_SUBJECT = /\b(?:students?|learners?|pupils?|the\s+class|class)\b/gi;
const ENGLISH_LEARNER_OUTCOME = /\b(?:understand|understood|master(?:ed|y)?|learned|familiar|improv\w*|performed\s+better|solv(?:e|es|ed|ing)|can\s+(?:now\s+)?solve|(?:is|are|was|were)\s+able\s+to|complet(?:e|es|ed|ing)|answer(?:ed)?\s+correctly|responded\s+correctly|got\s+(?:it|the\s+(?:answer|problem))\s+right|fewer\s+errors|reduced\s+errors|accuracy|scores?|learning\s+(?:outcome|gain)|teaching\s+effect)\b/i;
const ENGLISH_HYPOTHETICAL_PREFIX = /\b(?:help|enable|allow|guide|encourage|support|teach|ask|prompt|train|require|instruct|invite|have|expect|hope|if|when|unless|let)\s+(?:the\s+)?$/i;
const ENGLISH_HYPOTHETICAL_MODAL = /\b(?:should|would|could|may|might|will|expected|asked|need|needs|practice)\b/i;
const CHINESE_CLAUSE_BOUNDARY = /(?:[，,；;。.!?！？]|但是|然而|随后|后来|最后|最终|但|却)/;
const ENGLISH_CLAUSE_BOUNDARY = /(?:[,;.!?]|\b(?:but|however|then|later|afterwards|eventually)\b)/i;

function outcomeClausePrefix(textBeforeOutcome: string, boundary: RegExp): string {
  return textBeforeOutcome.split(boundary).at(-1) ?? "";
}

/**
 * Shared semantic guard: asserted learner/class outcomes are not observable
 * board facts. Teacher-intended or explicitly hypothetical frames are excluded.
 */
export function containsFabricatedLearnerOutcome(value: string): boolean {
  CHINESE_LEARNER_SUBJECT.lastIndex = 0;
  for (let subject = CHINESE_LEARNER_SUBJECT.exec(value); subject; subject = CHINESE_LEARNER_SUBJECT.exec(value)) {
    const prefix = value.slice(Math.max(0, subject.index - 16), subject.index);
    const suffix = value.slice(subject.index + subject[0].length, subject.index + subject[0].length + 48);
    const outcome = CHINESE_LEARNER_OUTCOME.exec(suffix);
    const beforeOutcome = outcome ? suffix.slice(0, outcome.index) : "";
    const sameClauseAsSubject = !CHINESE_CLAUSE_BOUNDARY.test(beforeOutcome);
    if (outcome && !(sameClauseAsSubject && CHINESE_HYPOTHETICAL_PREFIX.test(prefix))
      && !CHINESE_HYPOTHETICAL_MODAL.test(outcomeClausePrefix(suffix.slice(0, outcome.index), CHINESE_CLAUSE_BOUNDARY))) return true;
  }
  if (CHINESE_NAMED_LEARNER_OUTCOME.test(value) && !CHINESE_HYPOTHETICAL_PREFIX.test(value.slice(0, 16))) return true;

  ENGLISH_LEARNER_SUBJECT.lastIndex = 0;
  for (let subject = ENGLISH_LEARNER_SUBJECT.exec(value); subject; subject = ENGLISH_LEARNER_SUBJECT.exec(value)) {
    const prefix = value.slice(Math.max(0, subject.index - 32), subject.index);
    const suffix = value.slice(subject.index + subject[0].length, subject.index + subject[0].length + 80);
    const outcome = ENGLISH_LEARNER_OUTCOME.exec(suffix);
    const beforeOutcome = outcome ? suffix.slice(0, outcome.index) : "";
    const sameClauseAsSubject = !ENGLISH_CLAUSE_BOUNDARY.test(beforeOutcome);
    if (outcome && !(sameClauseAsSubject && ENGLISH_HYPOTHETICAL_PREFIX.test(prefix))
      && !ENGLISH_HYPOTHETICAL_MODAL.test(outcomeClausePrefix(suffix.slice(0, outcome.index), ENGLISH_CLAUSE_BOUNDARY))) return true;
  }
  return false;
}

function validComparisonKind(value: unknown): boolean {
  return value === "comparison" || value === "comparison_asset" || value === "delta_comparison";
}

/**
 * Runtime guard for immutable signed datasets. Cryptographic payload equality is
 * deliberately checked by the caller so this contract remains browser-safe.
 */
export function validateSignedGoldDataset(input: unknown): SignedGoldValidationReport {
  const issues: SignedGoldValidationIssue[] = [];
  const issue = (path: string, message: string): void => { issues.push({ path, message }); };
  if (!isRecord(input)) return { valid: false, issues: [{ path: "$", message: "必须是对象" }] };
  if (input.schema_version !== "signed-gold-dataset-v1") issue("schema_version", "必须是 signed-gold-dataset-v1");
  if (input.status !== "paper_gold_signed") issue("status", "必须是 paper_gold_signed");
  if (!isNonEmpty(input.dataset_id)) issue("dataset_id", "不能为空");
  if (!isSha256(input.dataset_sha256)) issue("dataset_sha256", "必须是小写 SHA-256");
  if (input.source_queue_schema_version !== "gold-review-queue-v1") issue("source_queue_schema_version", "来源队列版本无效");
  if (typeof input.frozen_at !== "string" || !Number.isFinite(Date.parse(input.frozen_at))) issue("frozen_at", "必须是有效时间");
  for (const field of ["package_count", "reviewed_group_count", "accepted_group_count", "accepted_event_count", "minimum_required_event_count"] as const) {
    if (!Number.isSafeInteger(input[field]) || Number(input[field]) < 0) issue(field, "必须是非负安全整数");
  }
  if (Number(input.minimum_required_event_count) < 30) issue("minimum_required_event_count", "Paper Gold 门槛不得低于 30 个事件");
  if (Number(input.accepted_event_count) < Number(input.minimum_required_event_count)) issue("accepted_event_count", "低于 Paper Gold 冻结门槛");
  if (!Array.isArray(input.packages)) return { valid: false, issues: [...issues, { path: "packages", message: "必须是数组" }] };

  const packageIds = new Set<string>();
  const sourceVideoIds = new Set<string>();
  const globalEventKeys = new Set<string>();
  let reviewedGroupCount = 0;
  let acceptedGroupCount = 0;
  let acceptedEventCount = 0;
  input.packages.forEach((rawPackage, packageIndex) => {
    const base = `packages[${packageIndex}]`;
    if (!isRecord(rawPackage)) { issue(base, "必须是对象"); return; }
    const packageId = rawPackage.package_id;
    const sourceVideoId = rawPackage.source_video_id;
    if (!isNonEmpty(packageId)) issue(`${base}.package_id`, "不能为空");
    else if (packageIds.has(packageId)) issue(`${base}.package_id`, "不得重复");
    else packageIds.add(packageId);
    if (!isNonEmpty(sourceVideoId)) issue(`${base}.source_video_id`, "不能为空");
    else if (sourceVideoIds.has(sourceVideoId)) issue(`${base}.source_video_id`, "一个数据集内每节课只能有一个签字包");
    else sourceVideoIds.add(sourceVideoId);
    if (!isSafeRelativeUri(rawPackage.source_intake_uri)) issue(`${base}.source_intake_uri`, "必须是受控相对路径");
    if (!isSha256(rawPackage.source_intake_sha256)) issue(`${base}.source_intake_sha256`, "必须是 SHA-256");
    for (const field of ["reviewed_group_count", "accepted_group_count", "accepted_event_count"] as const) {
      if (!Number.isSafeInteger(rawPackage[field]) || Number(rawPackage[field]) < 0) issue(`${base}.${field}`, "必须是非负安全整数");
    }
    const decisionSignatures = Array.isArray(rawPackage.decision_signatures) && rawPackage.decision_signatures.every(isSha256)
      ? rawPackage.decision_signatures as string[] : [];
    if (!exactStringSet(rawPackage.decision_signatures, decisionSignatures)) issue(`${base}.decision_signatures`, "必须是唯一 SHA-256 集合");
    if (!Array.isArray(rawPackage.decisions)) issue(`${base}.decisions`, "必须包含全部当前决策记录");
    const decisions = (Array.isArray(rawPackage.decisions) ? rawPackage.decisions : []).filter(isRecord);
    if (decisions.length !== Number(rawPackage.reviewed_group_count)) issue(`${base}.decisions`, "必须覆盖全部 review groups");
    const decisionByGroup = new Map<string, Record<string, unknown>>();
    decisions.forEach((rawDecision, decisionIndex) => {
      const decisionPath = `${base}.decisions[${decisionIndex}]`;
      if (rawDecision.schema_version !== "gold-review-decision-v1") issue(`${decisionPath}.schema_version`, "决策版本无效");
      if (rawDecision.package_id !== packageId) issue(`${decisionPath}.package_id`, "必须与所属包一致");
      if (!isNonEmpty(rawDecision.group_id) || decisionByGroup.has(String(rawDecision.group_id))) issue(`${decisionPath}.group_id`, "不能为空或重复");
      else decisionByGroup.set(rawDecision.group_id, rawDecision);
      if (!Number.isSafeInteger(rawDecision.revision) || Number(rawDecision.revision) < 1) issue(`${decisionPath}.revision`, "必须是正整数");
      if (rawDecision.parent_signature_sha256 !== null && !isSha256(rawDecision.parent_signature_sha256)) issue(`${decisionPath}.parent_signature_sha256`, "父签名无效");
      if (rawDecision.source_intake_sha256 !== rawPackage.source_intake_sha256) issue(`${decisionPath}.source_intake_sha256`, "必须与所属包一致");
      if (!["accept", "reject", "not_an_event", "unknown"].includes(String(rawDecision.disposition))) issue(`${decisionPath}.disposition`, "决策状态无效");
      if (!Array.isArray(rawDecision.selected_candidate_ids) || !rawDecision.selected_candidate_ids.every(isNonEmpty) || new Set(rawDecision.selected_candidate_ids).size !== rawDecision.selected_candidate_ids.length) issue(`${decisionPath}.selected_candidate_ids`, "候选集合无效");
      if (!Array.isArray(rawDecision.final_events)) issue(`${decisionPath}.final_events`, "必须是数组");
      if (rawDecision.disposition === "accept" && (!Array.isArray(rawDecision.final_events) || !rawDecision.final_events.length)) issue(`${decisionPath}.final_events`, "接受决策必须包含最终事件");
      if (rawDecision.disposition === "accept" && Array.isArray(rawDecision.final_events) && Array.isArray(rawDecision.selected_candidate_ids)) {
        const finalEventIds = rawDecision.final_events.filter(isRecord).map((item) => item.event_id).filter(isNonEmpty);
        if (JSON.stringify([...rawDecision.selected_candidate_ids].sort()) !== JSON.stringify([...finalEventIds].sort())) issue(`${decisionPath}.selected_candidate_ids`, "必须与最终事件一一覆盖");
      }
      if (rawDecision.disposition !== "accept" && Array.isArray(rawDecision.final_events) && rawDecision.final_events.length) issue(`${decisionPath}.final_events`, "非接受决策不得包含最终事件");
      if (!isNonEmpty(rawDecision.adjudicator_id) || !isNonEmpty(rawDecision.adjudicator_role) || !isNonEmpty(rawDecision.rationale)) issue(decisionPath, "裁决者与理由不能为空");
      if (typeof rawDecision.decided_at !== "string" || !Number.isFinite(Date.parse(rawDecision.decided_at))) issue(`${decisionPath}.decided_at`, "裁决时间无效");
      if (!isSha256(rawDecision.signature_sha256) || !decisionSignatures.includes(rawDecision.signature_sha256)) issue(`${decisionPath}.signature_sha256`, "必须属于包内当前决策集合");
    });
    if (!exactStringSet(decisionSignatures, decisions.map((item) => String(item.signature_sha256)).filter(isSha256))) issue(`${base}.decision_signatures`, "必须精确对应全部决策记录");
    if (!Array.isArray(rawPackage.signoffs) || rawPackage.signoffs.length !== 2) issue(`${base}.signoffs`, "必须恰有视觉与物理双签");
    const signoffRoles = new Set<string>();
    const adjudicators = new Set<string>();
    for (const [signoffIndex, rawSignoff] of (Array.isArray(rawPackage.signoffs) ? rawPackage.signoffs : []).entries()) {
      const signoffPath = `${base}.signoffs[${signoffIndex}]`;
      if (!isRecord(rawSignoff)) { issue(signoffPath, "必须是对象"); continue; }
      if (rawSignoff.schema_version !== "gold-review-package-signoff-v1") issue(`${signoffPath}.schema_version`, "签字版本无效");
      if (rawSignoff.package_id !== packageId) issue(`${signoffPath}.package_id`, "必须与所属包一致");
      if (rawSignoff.source_intake_sha256 !== rawPackage.source_intake_sha256) issue(`${signoffPath}.source_intake_sha256`, "必须与所属包一致");
      if (rawSignoff.signoff_role !== "visual_adjudicator" && rawSignoff.signoff_role !== "physics_reviewer") issue(`${signoffPath}.signoff_role`, "签字角色无效");
      else if (signoffRoles.has(rawSignoff.signoff_role)) issue(`${signoffPath}.signoff_role`, "签字角色不得重复");
      else signoffRoles.add(rawSignoff.signoff_role);
      if (!isNonEmpty(rawSignoff.adjudicator_id)) issue(`${signoffPath}.adjudicator_id`, "不能为空");
      else if (adjudicators.has(rawSignoff.adjudicator_id)) issue(`${signoffPath}.adjudicator_id`, "双签必须由不同人员完成");
      else adjudicators.add(rawSignoff.adjudicator_id);
      if (!isNonEmpty(rawSignoff.adjudicator_role) || !isNonEmpty(rawSignoff.statement)) issue(signoffPath, "签字身份与声明不能为空");
      if (typeof rawSignoff.signed_at !== "string" || !Number.isFinite(Date.parse(rawSignoff.signed_at))) issue(`${signoffPath}.signed_at`, "签字时间无效");
      if (!isSha256(rawSignoff.signature_sha256)) issue(`${signoffPath}.signature_sha256`, "签字哈希无效");
      if (!exactStringSet(rawSignoff.decision_signatures, decisionSignatures)) issue(`${signoffPath}.decision_signatures`, "必须精确覆盖包内全部当前决策");
    }
    if (!signoffRoles.has("visual_adjudicator") || !signoffRoles.has("physics_reviewer")) issue(`${base}.signoffs`, "缺少视觉或物理签字");
    if (!Array.isArray(rawPackage.groups)) { issue(`${base}.groups`, "必须是数组"); return; }
    const groupIds = new Set<string>();
    let packageEventCount = 0;
    rawPackage.groups.forEach((rawGroup, groupIndex) => {
      const groupPath = `${base}.groups[${groupIndex}]`;
      if (!isRecord(rawGroup)) { issue(groupPath, "必须是对象"); return; }
      if (!isNonEmpty(rawGroup.group_id)) issue(`${groupPath}.group_id`, "不能为空");
      else if (groupIds.has(rawGroup.group_id)) issue(`${groupPath}.group_id`, "不得重复");
      else groupIds.add(rawGroup.group_id);
      if (!isNonEmpty(rawGroup.alignment_class)) issue(`${groupPath}.alignment_class`, "不能为空");
      if (!isSha256(rawGroup.decision_signature_sha256) || !decisionSignatures.includes(rawGroup.decision_signature_sha256)) issue(`${groupPath}.decision_signature_sha256`, "必须属于包内当前决策");
      const decision = decisionByGroup.get(String(rawGroup.group_id));
      if (!decision || decision.disposition !== "accept" || decision.signature_sha256 !== rawGroup.decision_signature_sha256) issue(`${groupPath}.decision_signature_sha256`, "必须指向本组接受决策");
      if (!Number.isSafeInteger(rawGroup.decision_revision) || Number(rawGroup.decision_revision) < 1) issue(`${groupPath}.decision_revision`, "必须是正整数");
      if (decision && rawGroup.decision_revision !== decision.revision) issue(`${groupPath}.decision_revision`, "必须与接受决策一致");
      if (!isRecord(rawGroup.speech_context) || rawGroup.speech_context.status !== "context_not_gold" || typeof rawGroup.speech_context.text !== "string") issue(`${groupPath}.speech_context`, "只能作为 context_not_gold 文本上下文");
      if (!Array.isArray(rawGroup.visual_evidence) || !rawGroup.visual_evidence.length) issue(`${groupPath}.visual_evidence`, "至少需要一份视觉证据");
      const evidenceIds = new Set<string>();
      const evidenceById = new Map<string, Record<string, unknown>>();
      for (const [evidenceIndex, rawEvidence] of (Array.isArray(rawGroup.visual_evidence) ? rawGroup.visual_evidence : []).entries()) {
        const evidencePath = `${groupPath}.visual_evidence[${evidenceIndex}]`;
        if (!isRecord(rawEvidence)) { issue(evidencePath, "必须是对象"); continue; }
        if (!isNonEmpty(rawEvidence.evidence_id)) issue(`${evidencePath}.evidence_id`, "不能为空");
        else if (evidenceIds.has(rawEvidence.evidence_id)) issue(`${evidencePath}.evidence_id`, "不得重复");
        else { evidenceIds.add(rawEvidence.evidence_id); evidenceById.set(rawEvidence.evidence_id, rawEvidence); }
        if (!isNonEmpty(rawEvidence.side) || !isNonEmpty(rawEvidence.kind) || !isNonEmpty(rawEvidence.label)) issue(evidencePath, "side/kind/label 不能为空");
        if (!isSafeRelativeUri(rawEvidence.asset_uri)) issue(`${evidencePath}.asset_uri`, "必须是受控相对路径");
        if (!isSha256(rawEvidence.sha256)) issue(`${evidencePath}.sha256`, "必须是 SHA-256");
        if (rawEvidence.mime_type !== "image/png" && rawEvidence.mime_type !== "image/jpeg") issue(`${evidencePath}.mime_type`, "只允许 PNG/JPEG");
        for (const field of ["width", "height", "byte_length"] as const) if (!Number.isSafeInteger(rawEvidence[field]) || Number(rawEvidence[field]) < 1) issue(`${evidencePath}.${field}`, "必须是正安全整数");
      }
      if (!isNonEmpty(rawGroup.canonical_visual_evidence_id)) issue(`${groupPath}.canonical_visual_evidence_id`, "不能为空");
      const canonical = evidenceById.get(String(rawGroup.canonical_visual_evidence_id));
      if (!canonical || !validComparisonKind(canonical.kind)) issue(`${groupPath}.canonical_visual_evidence_id`, "必须指向规范 comparison 视觉证据");
      if (!Array.isArray(rawGroup.final_events) || !rawGroup.final_events.length) { issue(`${groupPath}.final_events`, "接受组至少需要一个事件"); return; }
      const eventIds = new Set<string>();
      for (const [eventIndex, rawEvent] of rawGroup.final_events.entries()) {
        const eventPath = `${groupPath}.final_events[${eventIndex}]`;
        if (!isRecord(rawEvent)) { issue(eventPath, "必须是对象"); continue; }
        if (!isNonEmpty(rawEvent.event_id)) issue(`${eventPath}.event_id`, "不能为空");
        else {
          if (eventIds.has(rawEvent.event_id)) issue(`${eventPath}.event_id`, "组内不得重复");
          eventIds.add(rawEvent.event_id);
          const globalKey = `${String(packageId)}:${String(rawGroup.group_id)}:${rawEvent.event_id}`;
          if (globalEventKeys.has(globalKey)) issue(`${eventPath}.event_id`, "数据集内组合键不得重复");
          globalEventKeys.add(globalKey);
        }
        if (!Array.isArray(rawEvent.source_event_refs) || !rawEvent.source_event_refs.length || !rawEvent.source_event_refs.every(isNonEmpty) || new Set(rawEvent.source_event_refs).size !== rawEvent.source_event_refs.length) issue(`${eventPath}.source_event_refs`, "必须是非空唯一来源集合");
        if (!["ADD", "ERASE", "MODIFY", "CONNECT", "atomic_ERASE+ADD"].includes(String(rawEvent.operation))) issue(`${eventPath}.operation`, "Gold 事件不得为 unknown");
        if (!isRecord(rawEvent.time) || !Number.isFinite(rawEvent.time.start) || !Number.isFinite(rawEvent.time.end) || Number(rawEvent.time.start) < 0 || Number(rawEvent.time.start) >= Number(rawEvent.time.end)) issue(`${eventPath}.time`, "时间范围无效");
        if (!isNonEmpty(rawEvent.semantic_label)) issue(`${eventPath}.semantic_label`, "不能为空");
        else if (containsFabricatedLearnerOutcome(rawEvent.semantic_label)) issue(`${eventPath}.semantic_label`, "不得把学生学习结果写成板书事实");
        if (rawEvent.region !== null) {
          const region = rawEvent.region;
          if (!isRecord(region) || !["x", "y", "width", "height"].every((field) => Number.isFinite(region[field])) || Number(region.x) < 0 || Number(region.y) < 0 || Number(region.width) <= 0 || Number(region.height) <= 0 || Number(region.x) + Number(region.width) > 1 || Number(region.y) + Number(region.height) > 1) issue(`${eventPath}.region`, "必须是 [0,1] 内的归一化区域");
        }
        if (rawEvent.operation === "CONNECT") {
          const relation = rawEvent.relation;
          if (!isRecord(relation) || !Array.isArray(relation.source_object_ids) || !relation.source_object_ids.length || !relation.source_object_ids.every(isNonEmpty) || !Array.isArray(relation.target_object_ids) || !relation.target_object_ids.length || !relation.target_object_ids.every(isNonEmpty) || !isNonEmpty(relation.relation_type)) issue(`${eventPath}.relation`, "CONNECT 必须有非空关系闭包");
        }
        if (rawEvent.operation !== "CONNECT" && rawEvent.relation !== null) issue(`${eventPath}.relation`, "非 CONNECT 事件不得携带 relation");
        if (rawEvent.operation === "MODIFY") {
          const modification = rawEvent.modification;
          if (!isRecord(modification) || !Array.isArray(modification.old_object_ids) || !modification.old_object_ids.length || !modification.old_object_ids.every(isNonEmpty) || !Array.isArray(modification.new_object_ids) || !modification.new_object_ids.length || !modification.new_object_ids.every(isNonEmpty) || !isNonEmpty(modification.semantic_slot) || !isNonEmpty(modification.change_description)) issue(`${eventPath}.modification`, "MODIFY 必须有非空 old→new 修改闭包");
        }
        if (rawEvent.operation !== "MODIFY" && rawEvent.modification !== null) issue(`${eventPath}.modification`, "非 MODIFY 事件不得携带 modification");
      }
      if (decision && JSON.stringify(decision.final_events) !== JSON.stringify(rawGroup.final_events)) issue(`${groupPath}.final_events`, "必须与签字决策中的最终事件完全一致");
      packageEventCount += rawGroup.final_events.length;
    });
    if (Number(rawPackage.reviewed_group_count) < rawPackage.groups.length) issue(`${base}.reviewed_group_count`, "不得小于接受组数");
    if (rawPackage.accepted_group_count !== rawPackage.groups.length) issue(`${base}.accepted_group_count`, "Signed Gold 只应保留接受组");
    if (decisions.filter((item) => item.disposition === "accept").length !== rawPackage.groups.length) issue(`${base}.groups`, "必须与全部接受决策一一对应");
    if (rawPackage.accepted_event_count !== packageEventCount) issue(`${base}.accepted_event_count`, "与最终事件数不一致");
    if (decisionSignatures.length !== Number(rawPackage.reviewed_group_count)) issue(`${base}.decision_signatures`, "必须覆盖接受与拒绝在内的全部组决策");
    reviewedGroupCount += Number(rawPackage.reviewed_group_count) || 0;
    acceptedGroupCount += rawPackage.groups.length;
    acceptedEventCount += packageEventCount;
  });
  if (input.package_count !== input.packages.length) issue("package_count", "与 packages 长度不一致");
  if (input.reviewed_group_count !== reviewedGroupCount) issue("reviewed_group_count", "与包内 review group 总数不一致");
  if (input.accepted_group_count !== acceptedGroupCount) issue("accepted_group_count", "与接受组总数不一致");
  if (input.accepted_event_count !== acceptedEventCount) issue("accepted_event_count", "与最终事件总数不一致");
  return { valid: issues.length === 0, issues };
}
