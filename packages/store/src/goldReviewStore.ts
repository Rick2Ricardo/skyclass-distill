import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type {
  GoldReviewCandidate,
  GoldReviewDecisionInput,
  GoldReviewDecisionRecord,
  GoldReviewDisposition,
  GoldReviewEvent,
  GoldReviewEvidence,
  GoldReviewGroup,
  GoldReviewOperation,
  GoldReviewPackage,
  GoldReviewPackageSignoff,
  GoldReviewPackageSignoffInput,
  GoldReviewQueue,
  GoldReviewRegion,
  GoldReviewSourceEvent,
  GoldReviewSignoffRole,
  GoldReviewTimeRange,
  SignedGoldCompileResult,
} from "../../contracts/src/index.js";
import { canonicalGoldReviewDecisionSignaturePayload, canonicalGoldReviewPackageSignoffSignaturePayload } from "../../contracts/src/index.js";
import { verifyImageEvidence } from "../../media/src/imageEvidence.js";
import { ensureDir } from "./fileStore.js";
import { buildSignedGoldDataset } from "./signedGoldCompiler.js";

type JsonRecord = Record<string, unknown>;

const DISPOSITIONS: GoldReviewDisposition[] = ["accept", "reject", "not_an_event", "unknown"];
const OPERATIONS: GoldReviewOperation[] = ["ADD", "ERASE", "MODIFY", "CONNECT", "atomic_ERASE+ADD", "unknown"];
const SIGNOFF_ROLES: GoldReviewSignoffRole[] = ["visual_adjudicator", "physics_reviewer"];
const DEFAULT_MANIFEST = "research/board2skill/oracle_pilot_clips.json";

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record).filter((item) => Object.keys(item).length > 0) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function timeRange(value: unknown): GoldReviewTimeRange | null {
  const raw = record(value);
  const start = finite(raw.start);
  const end = finite(raw.end);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

function region(value: unknown): GoldReviewRegion | null {
  const raw = record(value);
  const x = finite(raw.x);
  const y = finite(raw.y);
  const width = finite(raw.width);
  const height = finite(raw.height);
  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function relation(value: unknown): GoldReviewEvent["relation"] {
  const raw = record(value);
  const source = strings(raw.source_object_ids);
  const target = strings(raw.target_object_ids);
  const relationType = text(raw.relation_type);
  return source.length && target.length && relationType ? { source_object_ids: source, target_object_ids: target, relation_type: relationType } : null;
}

function modification(value: unknown): GoldReviewEvent["modification"] {
  const raw = record(value);
  const oldObjects = strings(raw.old_object_ids);
  const newObjects = strings(raw.new_object_ids);
  const semanticSlot = text(raw.semantic_slot);
  const description = text(raw.change_description);
  return oldObjects.length && newObjects.length && semanticSlot && description
    ? { old_object_ids: oldObjects, new_object_ids: newObjects, semantic_slot: semanticSlot, change_description: description }
    : null;
}

function operation(value: unknown): GoldReviewOperation {
  const normalized = text(value).replaceAll("add", "ADD").replaceAll("erase", "ERASE").replaceAll("modify", "MODIFY").replaceAll("connect", "CONNECT");
  return OPERATIONS.includes(normalized as GoldReviewOperation) ? normalized as GoldReviewOperation : "unknown";
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeId(value: string, label: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error(`${label} 无效`);
  return value;
}

function inside(root: string, path: string): boolean {
  const value = relative(resolve(root), resolve(path));
  return value === "" || (!value.startsWith("..") && !value.startsWith("/") && !value.startsWith("\\"));
}

function containsFabricatedLearnerOutcome(value: string): boolean {
  const normalized = value.trim();
  return /(?:听懂|理解|明白|掌握|熟悉|学会|会做|作答|答对|进步|提高|提升|改善|下降|不再犯错|正确率|错误率|成绩|学习效果|学习增益|教学效果)/i.test(normalized)
    || /(?:understand|understood|master(?:ed|y)?|learned|familiar|improv|performed\s+better|fewer\s+errors|reduced\s+errors|accuracy|scores?|learning\s+(?:outcome|gain)|teaching\s+effect)/i.test(normalized);
}

function sourceEvent(value: unknown, side: string): GoldReviewSourceEvent | null {
  const raw = record(value);
  const id = text(raw.event_id || raw.delta_id || raw.id);
  if (!id) return null;
  return {
    event_id: id,
    side,
    operation: operation(raw.operation),
    time: timeRange(raw.time),
    semantic_label: text(raw.semantic_label || raw.label || raw.visual_candidate_label) || "未转写",
    region: region(raw.region),
    status: text(raw.status) || "needs_review",
  };
}

function sideEvents(group: JsonRecord, key: string, label: string): GoldReviewSourceEvent[] {
  return records(record(group[key]).events).map((item) => sourceEvent(item, label)).filter((item): item is GoldReviewSourceEvent => Boolean(item));
}

function evidenceList(group: JsonRecord, strictIntake: JsonRecord): GoldReviewEvidence[] {
  const raw = records(group.evidence_assets);
  if (!raw.length) {
    const links = record(strictIntake.critical_evidence_links);
    for (const [side, values] of Object.entries(links)) {
      for (const item of records(values)) raw.push({ ...item, side });
    }
  }
  const output: GoldReviewEvidence[] = [];
  const seen = new Set<string>();
  raw.forEach((item, index) => {
    const path = text(item.path || item.asset_uri);
    const digest = text(item.sha256 || item.actual_sha256);
    if (!path || !/^[a-f0-9]{64}$/.test(digest)) return;
    const key = `${path}:${digest}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push({
      evidence_id: text(item.evidence_id || item.event_id) || `evidence-${index + 1}`,
      side: text(item.side || item.annotator) || "shared",
      kind: text(item.kind) || (path.includes("mask") ? "delta_mask" : path.includes("comparison") ? "comparison" : "frame"),
      label: text(item.label) || text(item.kind) || `证据 ${index + 1}`,
      path,
      sha256: digest,
    });
  });
  return output;
}

function candidateFromRaw(value: JsonRecord, fallbackId: string, sourceRefs: string[], fallbackLabel: string): GoldReviewCandidate {
  const sequence = records(value.sequence);
  const firstSequence = sequence[0] ?? {};
  const eventTime = timeRange(value.time || firstSequence.time);
  const eventOperation = operation(value.operation || firstSequence.operation);
  const label = text(value.semantic_label || value.label) || fallbackLabel;
  const eventRegion = region(value.region);
  const eventRelation = relation(value.relation || value.relation_candidate);
  const eventModification = modification(value.modification || value.modification_candidate);
  const blockers: string[] = [];
  if (!eventTime) blockers.push("缺少规范时间边界");
  if (eventOperation === "unknown") blockers.push("操作类型尚未确定");
  if (!label || label === "未转写") blockers.push("可见语义尚未转写");
  if (eventOperation === "CONNECT" && !eventRelation) blockers.push("CONNECT 缺少双锚点 relation closure");
  if (eventOperation === "MODIFY" && !eventModification) blockers.push("MODIFY 缺少 old→new 语义槽 closure");
  return {
    candidate_id: text(value.candidate_id) || fallbackId,
    event_id: text(value.candidate_id) || fallbackId,
    source_event_refs: strings(value.source_event_refs).length ? strings(value.source_event_refs) : sourceRefs,
    operation: eventOperation,
    time: eventTime ?? { start: 0, end: 0 },
    semantic_label: label || "未转写",
    region: eventRegion,
    relation: eventRelation,
    modification: eventModification,
    acceptance_ready: blockers.length === 0,
    acceptance_blockers: blockers,
  };
}

function candidates(group: JsonRecord, sourceEvents: GoldReviewSourceEvent[]): GoldReviewCandidate[] {
  const proposal = record(group.proposal);
  const proposedCandidates = records(proposal.candidate_events);
  const sourceRefs = sourceEvents.map((item) => item.event_id);
  const label = text(group.visual_candidate_label) || sourceEvents[0]?.semantic_label || "未转写";
  if (proposedCandidates.length) return proposedCandidates.map((item, index) => candidateFromRaw(item, `candidate-${index + 1}`, sourceRefs, label));

  if (sourceEvents.length) {
    const knownOperations = [...new Set(sourceEvents.map((item) => item.operation).filter((item) => item !== "unknown"))];
    const times = sourceEvents.map((item) => item.time).filter((item): item is GoldReviewTimeRange => Boolean(item));
    const combinedTime = times.length ? { start: Math.min(...times.map((item) => item.start)), end: Math.max(...times.map((item) => item.end)) } : null;
    return [candidateFromRaw({
      candidate_id: `${text(group.group_id || group.pair_id) || "group"}-C1`,
      operation: knownOperations.length === 1 ? knownOperations[0] : "unknown",
      time: combinedTime,
      semantic_label: label,
      region: sourceEvents.find((item) => item.region)?.region ?? null,
      source_event_refs: sourceRefs,
    }, "candidate-1", sourceRefs, label)];
  }
  return [];
}

function strictEvents(group: JsonRecord): GoldReviewSourceEvent[] {
  const output: GoldReviewSourceEvent[] = [];
  const a = sourceEvent({ ...record(group.annotator_a), event_id: record(group.annotator_a).delta_id }, "A");
  const b = sourceEvent({ ...record(group.annotator_b2), event_id: record(group.annotator_b2).delta_id }, "B2");
  if (a) output.push(a);
  if (b) output.push(b);
  return output;
}

function unresolved(group: JsonRecord): string[] {
  const values = group.unresolved_fields;
  if (Array.isArray(values)) return values.map((item) => typeof item === "string" ? item : text(record(item).field || record(item).question)).filter(Boolean);
  return records(group.review_disagreements).map((item) => text(item.question || item.issue_id)).filter(Boolean);
}

function normalizeGroup(intake: JsonRecord, intakePath: string, packageId: string, sourceVideoId: string, value: JsonRecord): Omit<GoldReviewGroup, "current_decision" | "package_locked" | "package_signed"> {
  const groupId = text(value.group_id || value.pair_id);
  const sourceEvents = value.annotator_a || value.annotator_b2
    ? strictEvents(value)
    : [...sideEvents(value, "a_side", "A"), ...sideEvents(value, "b_side", "B")];
  const groupCandidates = candidates(value, sourceEvents);
  const evidence = evidenceList(value, intake);
  if (!evidence.length) groupCandidates.forEach((item) => {
    item.acceptance_ready = false;
    item.acceptance_blockers.push("缺少可校验视觉证据");
  });
  return {
    package_id: packageId,
    group_id: groupId,
    source_video_id: sourceVideoId,
    intake_path: intakePath,
    alignment_class: text(value.alignment_class || value.alignment_type) || "aligned_review_group",
    time: timeRange(value.alignment_window) || (() => {
      const times = sourceEvents.map((item) => item.time).filter((item): item is GoldReviewTimeRange => Boolean(item));
      return times.length ? { start: Math.min(...times.map((item) => item.start)), end: Math.max(...times.map((item) => item.end)) } : null;
    })(),
    speech_context: text(value.raw_text || record(value.speech_trace).raw_text || record(intake.canonical_asr_trace).raw_text),
    source_events: sourceEvents,
    candidates: groupCandidates,
    evidence,
    unresolved_fields: unresolved(value),
  };
}

function materializeFinalEvents(group: GoldReviewGroup, input: GoldReviewDecisionInput): GoldReviewEvent[] {
  if (input.disposition !== "accept") return [];
  if (!group.evidence.length) throw new Error("接受事件时必须存在至少一份可校验视觉证据");
  const selected = input.selected_candidate_ids ?? [];
  const explicit = input.final_events ?? [];
  const values = explicit.length
    ? explicit
    : group.candidates.filter((item) => selected.includes(item.candidate_id)).map((item) => ({
      event_id: item.event_id,
      source_event_refs: item.source_event_refs,
      operation: item.operation,
      time: item.time,
      semantic_label: item.semantic_label,
      region: item.region,
      relation: item.relation,
      modification: item.modification,
    }));
  if (!values.length) throw new Error("接受事件时必须选择至少一个候选事件");
  if (!selected.length) throw new Error("接受事件时必须明确选择候选事件");
  const selectedEventIds = group.candidates.filter((item) => selected.includes(item.candidate_id)).map((item) => item.event_id);
  const finalEventIds = values.map((item) => item.event_id);
  if (new Set(selectedEventIds).size !== selectedEventIds.length
    || selectedEventIds.length !== finalEventIds.length
    || JSON.stringify([...selectedEventIds].sort()) !== JSON.stringify([...finalEventIds].sort())) {
    throw new Error("每个已选择的候选事件必须恰好对应一个最终事件");
  }
  const eventIds = new Set<string>();
  values.forEach((item, index) => {
    if (!text(item.event_id)) throw new Error(`final_events[${index}] 缺少 event_id`);
    const selectedCandidate = group.candidates.find((candidate) => selected.includes(candidate.candidate_id) && candidate.event_id === item.event_id);
    if (!selectedCandidate) throw new Error(`final_events[${index}] 不对应已选择的候选事件`);
    if (eventIds.has(item.event_id)) throw new Error(`final_events[${index}] event_id 重复`);
    eventIds.add(item.event_id);
    if (!item.source_event_refs.length || item.source_event_refs.some((id) => !group.source_events.some((source) => source.event_id === id))) {
      throw new Error(`final_events[${index}] 必须引用本组真实 A/B 事件`);
    }
    if (new Set(item.source_event_refs).size !== item.source_event_refs.length) throw new Error(`final_events[${index}] source_event_refs 重复`);
    if (JSON.stringify([...item.source_event_refs].sort()) !== JSON.stringify([...selectedCandidate.source_event_refs].sort())) {
      throw new Error(`final_events[${index}] source_event_refs 必须与所选候选的冻结来源一致`);
    }
    if (!OPERATIONS.includes(item.operation) || item.operation === "unknown") throw new Error(`final_events[${index}] 操作类型尚未确定`);
    if (selectedCandidate.operation !== "unknown" && item.operation !== selectedCandidate.operation) throw new Error(`final_events[${index}] 不能静默改变候选操作类型`);
    if (!Number.isFinite(item.time.start) || !Number.isFinite(item.time.end) || item.time.end <= item.time.start) throw new Error(`final_events[${index}] 时间边界无效`);
    if (!group.time || item.time.start < group.time.start - 2 || item.time.end > group.time.end + 2) throw new Error(`final_events[${index}] 时间超出本组证据窗口`);
    if (!text(item.semantic_label)) throw new Error(`final_events[${index}] 缺少可见语义转写`);
    if (containsFabricatedLearnerOutcome(item.semantic_label)) throw new Error(`final_events[${index}] 可见语义不得写入未经观察的学生学习结果`);
    if (item.region && (!Number.isFinite(item.region.x) || !Number.isFinite(item.region.y) || !Number.isFinite(item.region.width) || !Number.isFinite(item.region.height)
      || item.region.x < 0 || item.region.y < 0 || item.region.width <= 0 || item.region.height <= 0 || item.region.x + item.region.width > 1 || item.region.y + item.region.height > 1)) {
      throw new Error(`final_events[${index}] 归一化区域无效`);
    }
    if (item.operation === "CONNECT" && (!item.relation || !item.relation.source_object_ids.length || !item.relation.target_object_ids.length || !text(item.relation.relation_type))) {
      throw new Error(`final_events[${index}] CONNECT 缺少可审计 relation closure`);
    }
    if (item.operation !== "CONNECT" && item.relation) throw new Error(`final_events[${index}] 非 CONNECT 事件不得携带 relation`);
    if (JSON.stringify(item.relation) !== JSON.stringify(selectedCandidate.relation)) throw new Error(`final_events[${index}] relation 必须来自冻结候选证据`);
    if (item.operation === "MODIFY" && (!item.modification || !item.modification.old_object_ids.length || !item.modification.new_object_ids.length || !text(item.modification.semantic_slot) || !text(item.modification.change_description))) {
      throw new Error(`final_events[${index}] MODIFY 缺少可审计 old→new closure`);
    }
    if (item.operation !== "MODIFY" && item.modification) throw new Error(`final_events[${index}] 非 MODIFY 事件不得携带 modification`);
    if (JSON.stringify(item.modification) !== JSON.stringify(selectedCandidate.modification)) throw new Error(`final_events[${index}] modification 必须来自冻结候选证据`);
  });
  return values;
}

export class GoldReviewStore {
  readonly decisionRoot: string;
  readonly signoffRoot: string;
  private readonly packageLocks = new Map<string, Promise<void>>();

  constructor(readonly root: string, readonly dataDir: string, readonly manifestPath = DEFAULT_MANIFEST) {
    this.decisionRoot = join(dataDir, "board2skill", "gold-review", "decisions");
    this.signoffRoot = join(dataDir, "board2skill", "gold-review", "package-signoffs");
  }

  private async intakePaths(): Promise<string[]> {
    const raw = JSON.parse(await readFile(resolve(this.root, this.manifestPath), "utf8")) as JsonRecord;
    const values = new Set<string>();
    for (const clip of records(raw.clips)) {
      const path = text(record(clip.oracle_labels).adjudication_intake_path || record(clip.oracle_annotation).adjudication_intake_path);
      if (path) values.add(path);
    }
    return [...values].sort();
  }

  private decisionDirectory(packageId: string, groupId: string): string {
    return join(this.decisionRoot, safeId(packageId, "package_id"), safeId(groupId, "group_id"));
  }

  private signoffPath(packageId: string, role: GoldReviewSignoffRole): string {
    return join(this.signoffRoot, safeId(packageId, "package_id"), `${role}.json`);
  }

  private async withPackageLock<T>(packageId: string, operation: () => Promise<T>): Promise<T> {
    const key = safeId(text(packageId), "package_id");
    const previous = this.packageLocks.get(key) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolveLock) => { release = resolveLock; });
    const queued = previous.then(() => current);
    this.packageLocks.set(key, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.packageLocks.get(key) === queued) this.packageLocks.delete(key);
    }
  }

  private async currentDecision(packageId: string, groupId: string, intakeSha256: string): Promise<GoldReviewDecisionRecord | null> {
    const directory = this.decisionDirectory(packageId, groupId);
    const names = (await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error)))
      .filter((name) => name.endsWith(".json")).sort();
    let previous: GoldReviewDecisionRecord | null = null;
    for (const [index, name] of names.entries()) {
      const decision = JSON.parse(await readFile(join(directory, name), "utf8")) as GoldReviewDecisionRecord;
      const { signature_sha256: signature, ...base } = decision;
      if (decision.schema_version !== "gold-review-decision-v1"
        || decision.package_id !== packageId
        || decision.group_id !== groupId
        || decision.source_intake_sha256 !== intakeSha256
        || decision.revision !== index + 1
        || decision.parent_signature_sha256 !== (previous?.signature_sha256 ?? null)
        || signature !== sha256(canonicalGoldReviewDecisionSignaturePayload(base))
        || !name.endsWith(`-${signature}.json`)) {
        throw new Error(`Gold 仲裁决策链校验失败：${packageId}/${groupId}/${name}`);
      }
      previous = decision;
    }
    return previous;
  }

  private async packageSignoffs(packageId: string, intakeSha256: string, decisionSignatures: string[]): Promise<GoldReviewPackageSignoff[]> {
    const output: GoldReviewPackageSignoff[] = [];
    for (const role of SIGNOFF_ROLES) {
      const signoff = JSON.parse(await readFile(this.signoffPath(packageId, role), "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "null";
        throw error;
      })) as GoldReviewPackageSignoff | null;
      if (!signoff) continue;
      const { signature_sha256: signature, ...base } = signoff;
      const expectedDecisions = [...decisionSignatures].sort();
      if (signoff.schema_version !== "gold-review-package-signoff-v1"
        || signoff.package_id !== packageId
        || signoff.signoff_role !== role
        || signoff.source_intake_sha256 !== intakeSha256
        || JSON.stringify(signoff.decision_signatures) !== JSON.stringify(expectedDecisions)
        || signature !== sha256(canonicalGoldReviewPackageSignoffSignaturePayload(base))) {
        throw new Error(`Gold 仲裁包签字链校验失败：${packageId}/${role}`);
      }
      output.push(signoff);
    }
    if (output.length === SIGNOFF_ROLES.length && new Set(output.map((item) => item.adjudicator_id)).size !== SIGNOFF_ROLES.length) {
      throw new Error(`Gold 仲裁包双签必须由不同人员完成：${packageId}`);
    }
    return output;
  }

  async queue(): Promise<GoldReviewQueue> {
    const groups: GoldReviewGroup[] = [];
    const packages: GoldReviewPackage[] = [];
    const rootReal = await realpath(this.root);
    for (const intakePath of await this.intakePaths()) {
      const absolute = resolve(this.root, intakePath);
      if (!inside(this.root, absolute)) throw new Error(`仲裁输入路径越界：${intakePath}`);
      const resolvedIntake = await realpath(absolute);
      if (!inside(rootReal, resolvedIntake)) throw new Error(`仲裁输入真实路径越界：${intakePath}`);
      if (!(await stat(resolvedIntake)).isFile()) throw new Error(`仲裁输入不是普通文件：${intakePath}`);
      const rawText = await readFile(resolvedIntake, "utf8");
      const intake = JSON.parse(rawText) as JsonRecord;
      const intakeSha256 = sha256(rawText);
      const packageId = text(intake.package_id || intake.intake_id || intake.case_id);
      const sourceVideoId = text(intake.source_video_id);
      if (!packageId || !sourceVideoId) throw new Error(`仲裁输入缺少 package/source ID：${intakePath}`);
      const rawGroups = records(intake.items).length ? records(intake.items) : records(record(intake.alignment).pairs);
      const normalized: GoldReviewGroup[] = [];
      for (const value of rawGroups) {
        const base = normalizeGroup(intake, intakePath, packageId, sourceVideoId, value);
        if (!base.group_id) throw new Error(`仲裁组缺少 group_id：${intakePath}`);
        normalized.push({ ...base, current_decision: await this.currentDecision(packageId, base.group_id, intakeSha256), package_locked: false, package_signed: false });
      }
      const signoffs = await this.packageSignoffs(packageId, intakeSha256, normalized.map((item) => item.current_decision?.signature_sha256).filter((item): item is string => Boolean(item)));
      const fullySigned = signoffs.length === SIGNOFF_ROLES.length;
      normalized.forEach((item) => {
        item.package_locked = signoffs.length > 0;
        item.package_signed = fullySigned;
      });
      groups.push(...normalized);
      packages.push({
        package_id: packageId,
        source_video_id: sourceVideoId,
        intake_path: intakePath,
        intake_sha256: intakeSha256,
        group_count: normalized.length,
        decided_count: normalized.filter((item) => item.current_decision).length,
        accepted_event_count: normalized.reduce((sum, item) => sum + (item.current_decision?.final_events.length ?? 0), 0),
        package_signoffs: signoffs,
        fully_signed: fullySigned,
      });
    }
    const decidedCount = groups.filter((item) => item.current_decision).length;
    const signedPackageCount = packages.filter((item) => item.fully_signed).length;
    const acceptedEventCount = groups.reduce((sum, item) => sum + (item.current_decision?.final_events.length ?? 0), 0);
    return {
      schema_version: "gold-review-queue-v1",
      packages,
      groups,
      summary: {
        package_count: packages.length,
        group_count: groups.length,
        decided_count: decidedCount,
        accepted_event_count: acceptedEventCount,
        minimum_required_event_count: 30,
        signed_package_count: signedPackageCount,
        paper_gold_ready: packages.length > 0 && signedPackageCount === packages.length && decidedCount === groups.length && acceptedEventCount >= 30,
      },
    };
  }

  async decide(input: GoldReviewDecisionInput): Promise<GoldReviewDecisionRecord> {
    return this.withPackageLock(input.package_id, () => this.decideUnlocked(input));
  }

  private async decideUnlocked(input: GoldReviewDecisionInput): Promise<GoldReviewDecisionRecord> {
    if (!DISPOSITIONS.includes(input.disposition)) throw new Error("仲裁 disposition 无效");
    const adjudicatorId = text(input.adjudicator_id);
    const adjudicatorRole = text(input.adjudicator_role);
    const rationale = text(input.rationale);
    if (adjudicatorId.length < 2 || adjudicatorRole.length < 2 || rationale.length < 8) throw new Error("仲裁人、角色和至少 8 字的判定依据均为必填");
    const queue = await this.queue();
    const group = queue.groups.find((item) => item.package_id === input.package_id && item.group_id === input.group_id);
    if (!group) throw new Error("Gold 仲裁组不存在");
    if (group.package_locked) throw new Error("该仲裁包已经进入签字锁定，不能再改写组决策");
    const selected = [...new Set(input.selected_candidate_ids ?? [])];
    if (selected.some((id) => !group.candidates.some((candidate) => candidate.candidate_id === id))) throw new Error("选择了不属于本组的候选事件");
    const finalEvents = materializeFinalEvents(group, { ...input, selected_candidate_ids: selected });
    if (input.disposition === "accept") {
      await Promise.all(group.evidence.map((item) => verifyImageEvidence({
        root: this.root,
        assetUri: item.path,
        expectedSha256: item.sha256,
      })));
    }
    const previous = group.current_decision;
    const base = {
      schema_version: "gold-review-decision-v1" as const,
      package_id: group.package_id,
      group_id: group.group_id,
      revision: (previous?.revision ?? 0) + 1,
      parent_signature_sha256: previous?.signature_sha256 ?? null,
      source_intake_sha256: queue.packages.find((item) => item.package_id === group.package_id)!.intake_sha256,
      disposition: input.disposition,
      selected_candidate_ids: selected,
      final_events: finalEvents,
      adjudicator_id: adjudicatorId,
      adjudicator_role: adjudicatorRole,
      rationale,
      decided_at: new Date().toISOString(),
    };
    const decision: GoldReviewDecisionRecord = { ...base, signature_sha256: sha256(canonicalGoldReviewDecisionSignaturePayload(base)) };
    const directory = this.decisionDirectory(group.package_id, group.group_id);
    await ensureDir(directory);
    const target = join(directory, `${String(decision.revision).padStart(4, "0")}-${decision.signature_sha256}.json`);
    await writeFile(target, `${JSON.stringify(decision, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    return decision;
  }

  async signPackage(input: GoldReviewPackageSignoffInput): Promise<GoldReviewPackageSignoff> {
    return this.withPackageLock(input.package_id, () => this.signPackageUnlocked(input));
  }

  private async signPackageUnlocked(input: GoldReviewPackageSignoffInput): Promise<GoldReviewPackageSignoff> {
    const adjudicatorId = text(input.adjudicator_id);
    const adjudicatorRole = text(input.adjudicator_role);
    const statement = text(input.statement);
    if (!SIGNOFF_ROLES.includes(input.signoff_role)) throw new Error("包级签字角色无效");
    if (adjudicatorId.length < 2 || adjudicatorRole.length < 2 || statement.length < 12) throw new Error("签字人、角色和至少 12 字的冻结声明均为必填");
    const queue = await this.queue();
    const pkg = queue.packages.find((item) => item.package_id === input.package_id);
    if (!pkg) throw new Error("Gold 仲裁包不存在");
    const existingRole = pkg.package_signoffs.find((item) => item.signoff_role === input.signoff_role);
    if (existingRole) return existingRole;
    const groups = queue.groups.filter((item) => item.package_id === pkg.package_id);
    if (!groups.length || groups.some((item) => !item.current_decision)) throw new Error("包内每个 review group 都必须先有人工决策");
    if (groups.some((item) => item.current_decision?.disposition === "accept" && !item.current_decision.final_events.length)) throw new Error("接受的 review group 缺少最终事件");
    await Promise.all(groups.filter((item) => item.current_decision?.disposition === "accept").flatMap((item) => item.evidence).map((item) => verifyImageEvidence({
      root: this.root,
      assetUri: item.path,
      expectedSha256: item.sha256,
    })));
    const signatures = groups.map((item) => item.current_decision!.signature_sha256).sort();
    if (pkg.package_signoffs.some((item) => item.adjudicator_id === adjudicatorId)) throw new Error("视觉仲裁与物理复核必须由不同人员签字");
    const base = {
      schema_version: "gold-review-package-signoff-v1" as const,
      package_id: pkg.package_id,
      signoff_role: input.signoff_role,
      source_intake_sha256: pkg.intake_sha256,
      decision_signatures: signatures,
      adjudicator_id: adjudicatorId,
      adjudicator_role: adjudicatorRole,
      statement,
      signed_at: new Date().toISOString(),
    };
    const signoff: GoldReviewPackageSignoff = { ...base, signature_sha256: sha256(canonicalGoldReviewPackageSignoffSignaturePayload(base)) };
    await ensureDir(dirname(this.signoffPath(pkg.package_id, input.signoff_role)));
    await writeFile(this.signoffPath(pkg.package_id, input.signoff_role), `${JSON.stringify(signoff, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    return signoff;
  }

  async evidence(packageId: string, groupId: string, index: number): Promise<{ bytes: Buffer; mime: string }> {
    const queue = await this.queue();
    const group = queue.groups.find((item) => item.package_id === packageId && item.group_id === groupId);
    const evidence = group?.evidence[index];
    if (!evidence) throw new Error("视觉证据不存在");
    const verified = await verifyImageEvidence({ root: this.root, assetUri: evidence.path, expectedSha256: evidence.sha256 });
    return { bytes: verified.bytes, mime: verified.mime_type };
  }

  async compileDataset(): Promise<SignedGoldCompileResult> {
    const dataset = await buildSignedGoldDataset(this.root, await this.queue());
    const directory = join(this.dataDir, "board2skill", "signed-gold", dataset.dataset_sha256);
    const serialized = `${JSON.stringify(dataset, null, 2)}\n`;
    await ensureDir(this.dataDir);
    const dataRootReal = await realpath(this.dataDir);
    await ensureDir(directory);
    const directoryReal = await realpath(directory);
    if (!inside(dataRootReal, directoryReal)) throw new Error("Signed Gold 内容寻址目录真实路径越界");
    const target = join(directoryReal, "dataset.json");
    try {
      await writeFile(target, serialized, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const targetStat = await lstat(target);
      if (!targetStat.isFile() || targetStat.isSymbolicLink()) throw new Error("已存在的 Signed Gold 数据集不是受控普通文件");
      if (await readFile(target, "utf8") !== serialized) throw new Error("已存在的 Signed Gold 数据集与内容地址不一致");
    }
    return {
      dataset_uri: relative(dataRootReal, target).split("\\").join("/"),
      dataset,
    };
  }
}
