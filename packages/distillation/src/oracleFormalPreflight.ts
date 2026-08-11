import { createHash } from "node:crypto";
import type {
  OracleGateFormalCase,
  OracleGateFormalInputManifest,
  OracleGateFormalSpec,
  SignedGoldDataset,
} from "../../contracts/src/index.js";
import {
  canonicalOracleGateFormalInputPayload,
  canonicalOracleGateFormalSpecPayload,
  canonicalSignedGoldDatasetPayload,
  validateOracleGateFormalInput,
  validateOracleGateFormalSpec,
  validateSignedGoldDataset,
  validateSignedGoldRecordSignatures,
} from "../../contracts/src/index.js";
import type { OraclePilotArm } from "./oraclePilot.js";

const ARMS: OraclePilotArm[] = [
  "transcript_only",
  "static_final_board",
  "uniform_frame",
  "oracle_delta",
];

export interface OracleGateFormalScheduleItem {
  request_id: string;
  idempotency_key: string;
  case_id: string;
  package_id: string;
  group_id: string;
  source_video_id: string;
  arm: OraclePilotArm;
  seed: number;
}

export interface OracleGateFormalStructuralPreflight {
  schema_version: "oracle-gate-formal-structural-preflight-v1";
  status: "untrusted_structure_valid";
  api_execution_allowed: false;
  reason: "not_attested_to_current_review_ledger_or_frozen_registry";
  dataset_sha256: string;
  input_manifest_sha256: string;
  spec_sha256: string;
  case_count: number;
  event_count: number;
  teacher_count: number;
  multi_edit_window_count: number;
  seed_count: number;
  request_count: number;
  operation_counts: Record<"ADD" | "ERASE" | "MODIFY" | "CONNECT", number>;
  schedule_sha256: string;
  schedule: OracleGateFormalScheduleItem[];
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestJson(value: unknown): string {
  return digest(JSON.stringify(value));
}

function exactStrings(left: string[], right: string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function caseId(datasetSha256: string, packageId: string, groupId: string): string {
  return `FCASE-${digestJson({ dataset_sha256: datasetSha256, package_id: packageId, group_id: groupId }).slice(0, 20)}`;
}

export function deriveOracleGateFormalCaseId(input: {
  dataset_sha256: string;
  package_id: string;
  group_id: string;
}): string {
  return caseId(input.dataset_sha256, input.package_id, input.group_id);
}

function assertDataset(dataset: SignedGoldDataset): void {
  const report = validateSignedGoldDataset(dataset);
  if (!report.valid) throw new Error(`Formal Oracle Gate Signed Gold 无效：${report.issues.slice(0, 6).map((item) => `${item.path} ${item.message}`).join("；")}`);
  const signatureIssues = validateSignedGoldRecordSignatures(dataset, digest);
  if (signatureIssues.length) throw new Error(`Formal Oracle Gate Signed Gold 签字链无效：${signatureIssues.slice(0, 6).map((item) => `${item.path} ${item.message}`).join("；")}`);
  if (digest(canonicalSignedGoldDatasetPayload(dataset)) !== dataset.dataset_sha256) throw new Error("Formal Oracle Gate Signed Gold 内容哈希不匹配");
  if (dataset.dataset_id !== `signed-gold-${dataset.dataset_sha256.slice(0, 16)}`) throw new Error("Formal Oracle Gate Signed Gold dataset_id 与内容哈希不匹配");
}

function assertManifestAndSpec(
  dataset: SignedGoldDataset,
  manifest: OracleGateFormalInputManifest,
  spec: OracleGateFormalSpec,
): void {
  const manifestReport = validateOracleGateFormalInput(manifest);
  if (!manifestReport.valid) throw new Error(`Formal Oracle Gate 输入清单无效：${manifestReport.issues.slice(0, 6).map((item) => `${item.path} ${item.message}`).join("；")}`);
  const specReport = validateOracleGateFormalSpec(spec);
  if (!specReport.valid) throw new Error(`Formal Oracle Gate 冻结协议无效：${specReport.issues.slice(0, 6).map((item) => `${item.path} ${item.message}`).join("；")}`);
  const manifestSha = digest(canonicalOracleGateFormalInputPayload(manifest));
  const specSha = digest(canonicalOracleGateFormalSpecPayload(spec));
  if (manifestSha !== manifest.manifest_sha256) throw new Error("Formal Oracle Gate 输入清单内容哈希不匹配");
  if (specSha !== spec.spec_sha256) throw new Error("Formal Oracle Gate 冻结协议内容哈希不匹配");
  if (manifest.signed_gold_dataset_sha256 !== dataset.dataset_sha256 || spec.signed_gold_dataset_sha256 !== dataset.dataset_sha256) throw new Error("Formal Oracle Gate 输入或协议未绑定当前 Signed Gold 数据集");
  if (spec.input_manifest_sha256 !== manifest.manifest_sha256) throw new Error("Formal Oracle Gate 协议未绑定当前输入清单");
}

function assertCaseCoverage(
  dataset: SignedGoldDataset,
  manifest: OracleGateFormalInputManifest,
): { eventCount: number; multiEditWindowCount: number; operationCounts: Record<"ADD" | "ERASE" | "MODIFY" | "CONNECT", number> } {
  const sources = new Map(manifest.sources.map((item) => [item.source_video_id, item]));
  const cases = new Map(manifest.cases.map((item) => [`${item.package_id}:${item.group_id}`, item]));
  let eventCount = 0;
  let multiEditWindowCount = 0;
  const operationCounts = { ADD: 0, ERASE: 0, MODIFY: 0, CONNECT: 0 };
  const expectedGroupKeys = new Set<string>();

  for (const reviewPackage of dataset.packages) {
    const source = sources.get(reviewPackage.source_video_id);
    if (!source) throw new Error(`Formal Oracle Gate 缺少来源清单：${reviewPackage.source_video_id}`);
    for (const group of reviewPackage.groups) {
      const key = `${reviewPackage.package_id}:${group.group_id}`;
      expectedGroupKeys.add(key);
      const formalCase = cases.get(key);
      if (!formalCase) throw new Error(`Formal Oracle Gate 缺少 Signed Gold group 对应 case：${key}`);
      if (formalCase.source_video_id !== reviewPackage.source_video_id) throw new Error(`Formal Oracle Gate case ${formalCase.case_id} 混入其他视频`);
      if (formalCase.case_id !== caseId(dataset.dataset_sha256, reviewPackage.package_id, group.group_id)) throw new Error(`Formal Oracle Gate case_id 不是由 Signed Gold 组合键确定性派生：${key}`);
      const eventIds = group.final_events.map((event) => event.event_id);
      if (!exactStrings(formalCase.event_ids, eventIds)) throw new Error(`Formal Oracle Gate case ${formalCase.case_id} 未按签字顺序精确覆盖最终事件`);
      for (let index = 1; index < group.final_events.length; index += 1) {
        const previous = group.final_events[index - 1];
        const current = group.final_events[index];
        if (current.time.start < previous.time.start || (current.time.start === previous.time.start && current.time.end < previous.time.end)) throw new Error(`Formal Oracle Gate case ${formalCase.case_id} 的签字事件不是稳定时间顺序`);
      }
      if (group.final_events.some((event) => event.operation === "atomic_ERASE+ADD")) throw new Error(`Formal Oracle Gate case ${formalCase.case_id} 的 atomic_ERASE+ADD 必须在签字数据中展开为两个有序事件`);
      const start = Math.min(...group.final_events.map((event) => event.time.start));
      const end = Math.max(...group.final_events.map((event) => event.time.end));
      if (formalCase.event_window.start !== start || formalCase.event_window.end !== end) throw new Error(`Formal Oracle Gate case ${formalCase.case_id} 时间窗未与 Gold 事件并集闭合`);
      if (formalCase.oracle_comparison_evidence_id !== group.canonical_visual_evidence_id) throw new Error(`Formal Oracle Gate case ${formalCase.case_id} 未绑定规范 comparison 证据`);
      const oracleEvidence = group.visual_evidence.find((item) => item.evidence_id === group.canonical_visual_evidence_id);
      if (!oracleEvidence) throw new Error(`Formal Oracle Gate case ${formalCase.case_id} 缺少规范 comparison 证据`);
      if (formalCase.static_final.sha256 === formalCase.uniform_frame.sha256) throw new Error(`Formal Oracle Gate case ${formalCase.case_id} 的 Static-Final 与 Uniform 不得复用同一图像`);
      if (oracleEvidence.sha256 === formalCase.static_final.sha256 || oracleEvidence.sha256 === formalCase.uniform_frame.sha256) throw new Error(`Formal Oracle Gate case ${formalCase.case_id} 的非 Oracle 视觉不得复用 Oracle comparison 图像`);
      eventCount += group.final_events.length;
      for (const event of group.final_events) {
        if (event.operation === "ADD" || event.operation === "ERASE" || event.operation === "MODIFY" || event.operation === "CONNECT") operationCounts[event.operation] += 1;
      }
      if (group.final_events.length > 1) multiEditWindowCount += 1;
    }
  }

  if (cases.size !== expectedGroupKeys.size || [...cases.keys()].some((key) => !expectedGroupKeys.has(key))) throw new Error("Formal Oracle Gate case 必须与 Signed Gold 接受组一一对应，不得增加或遗漏");
  if (sources.size !== dataset.packages.length || dataset.packages.some((item) => !sources.has(item.source_video_id))) throw new Error("Formal Oracle Gate sources 必须与 Signed Gold 课程一一对应");
  if (eventCount !== dataset.accepted_event_count) throw new Error("Formal Oracle Gate 事件计数必须从 Signed Gold 派生");
  return { eventCount, multiEditWindowCount, operationCounts };
}

function schedule(
  dataset: SignedGoldDataset,
  manifest: OracleGateFormalInputManifest,
  spec: OracleGateFormalSpec,
): OracleGateFormalScheduleItem[] {
  const orderedCases = [...manifest.cases].sort((left, right) => left.case_id.localeCompare(right.case_id));
  const orderedSeeds = [...spec.seeds].sort((left, right) => left - right);
  return orderedCases.flatMap((formalCase) => orderedSeeds.flatMap((seed) => ARMS.map((arm) => {
    const identity = {
      dataset_sha256: dataset.dataset_sha256,
      input_manifest_sha256: manifest.manifest_sha256,
      spec_sha256: spec.spec_sha256,
      case_id: formalCase.case_id,
      arm,
      seed,
    };
    return {
      request_id: `FREQ-${digestJson(identity).slice(0, 24)}`,
      idempotency_key: digestJson({ kind: "oracle-gate-formal", ...identity }),
      case_id: formalCase.case_id,
      package_id: formalCase.package_id,
      group_id: formalCase.group_id,
      source_video_id: formalCase.source_video_id,
      arm,
      seed,
    };
  })));
}

/**
 * Structural-only gate. It deliberately never accepts a client and always keeps
 * API execution closed until a later byte-level asset/speech verifier and the
 * private checkpoint store have also passed.
 */
export function prepareOracleGateFormalStructuralPreflight(input: {
  dataset: SignedGoldDataset;
  manifest: OracleGateFormalInputManifest;
  spec: OracleGateFormalSpec;
}): OracleGateFormalStructuralPreflight {
  assertDataset(input.dataset);
  assertManifestAndSpec(input.dataset, input.manifest, input.spec);
  const { eventCount, multiEditWindowCount, operationCounts } = assertCaseCoverage(input.dataset, input.manifest);
  const teacherCount = new Set(input.manifest.sources.map((item) => item.teacher_id)).size;
  if (eventCount < 30) throw new Error("Formal Oracle Gate 至少需要 30 个签字 Gold 事件");
  if (eventCount > 50) throw new Error("Formal Oracle Gate development pilot 最多使用 50 个签字 Gold 事件");
  if (teacherCount < 2) throw new Error("Formal Oracle Gate 至少需要 2 位教师");
  if (multiEditWindowCount < 1) throw new Error("Formal Oracle Gate 至少需要一个多编辑窗口");
  const missingOperations = Object.entries(operationCounts).filter(([, count]) => count < 1).map(([operation]) => operation);
  if (missingOperations.length) throw new Error(`Formal Oracle Gate 30–50 事件必须覆盖 ADD/ERASE/MODIFY/CONNECT；当前缺少 ${missingOperations.join(", ")}`);
  const frozenSchedule = schedule(input.dataset, input.manifest, input.spec);
  const expectedRequests = input.manifest.cases.length * ARMS.length * input.spec.seeds.length;
  if (frozenSchedule.length !== expectedRequests || new Set(frozenSchedule.map((item) => item.request_id)).size !== expectedRequests || new Set(frozenSchedule.map((item) => item.idempotency_key)).size !== expectedRequests) throw new Error("Formal Oracle Gate 调度未形成完整唯一的 case × arm × seed 笛卡尔积");
  return {
    schema_version: "oracle-gate-formal-structural-preflight-v1",
    status: "untrusted_structure_valid",
    api_execution_allowed: false,
    reason: "not_attested_to_current_review_ledger_or_frozen_registry",
    dataset_sha256: input.dataset.dataset_sha256,
    input_manifest_sha256: input.manifest.manifest_sha256,
    spec_sha256: input.spec.spec_sha256,
    case_count: input.manifest.cases.length,
    event_count: eventCount,
    teacher_count: teacherCount,
    multi_edit_window_count: multiEditWindowCount,
    seed_count: input.spec.seeds.length,
    request_count: frozenSchedule.length,
    operation_counts: operationCounts,
    schedule_sha256: digestJson(frozenSchedule),
    schedule: frozenSchedule,
  };
}

export function formalCaseForGroup(
  cases: OracleGateFormalCase[],
  packageId: string,
  groupId: string,
): OracleGateFormalCase | undefined {
  return cases.find((item) => item.package_id === packageId && item.group_id === groupId);
}
