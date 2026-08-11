import { createHash } from "node:crypto";
import type {
  BoardDeltaEvent,
  BoardEvidenceBundle,
  EvidenceMode,
  TemporalBoardAsset,
  TemporalBoardTimeRange,
} from "../../contracts/src/index.js";
import { validateBoardEvidenceBundle } from "../../contracts/src/index.js";

export type OraclePilotArm =
  | "transcript_only"
  | "static_final_board"
  | "uniform_frame"
  | "oracle_delta";

export interface OraclePilotCaseSpec {
  case_id: string;
  delta_id: string;
  uniform_frame_id: string;
}

export interface OraclePilotProtocol {
  protocol_version: "oracle-value-gate-v1";
  prompt_version: string;
  visual_items_per_visual_arm: 1;
  speech_window_seconds: number;
  visual_budget_rule: "one_preprocessed_canvas_per_visual_arm";
  runtime_pixel_and_token_audit_required: true;
}

export interface OraclePilotArmInput {
  case_id: string;
  arm: OraclePilotArm;
  evidence_mode: EvidenceMode;
  source_video_id: string;
  delta_id: string;
  time: TemporalBoardTimeRange;
  speech_ids: string[];
  transcript: string;
  evidence_text: string;
  image_assets: TemporalBoardAsset[];
  paired_context_sha256: string;
  condition_sha256: string;
}

export interface OraclePilotBlindEvaluationItem {
  blind_id: string;
  paired_case_id: string;
  response: null;
  response_sha256: null;
}

export interface OraclePilotPackage {
  schema_version: "oracle-pilot-package-v1";
  bundle_id: string;
  protocol: OraclePilotProtocol;
  samples: OraclePilotArmInput[];
  blind_evaluation_items: OraclePilotBlindEvaluationItem[];
  answer_key: Array<{
    blind_id: string;
    paired_case_id: string;
    case_id: string;
    arm: OraclePilotArm;
    evidence_mode: EvidenceMode;
    condition_sha256: string;
  }>;
}

const ARMS: OraclePilotArm[] = [
  "transcript_only",
  "static_final_board",
  "uniform_frame",
  "oracle_delta",
];
const ORACLE_PILOT_OPERATIONS = new Set(["add", "erase", "modify", "connect"]);

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function overlap(left: TemporalBoardTimeRange, right: TemporalBoardTimeRange): boolean {
  return left.start < right.end && right.start < left.end;
}

function expanded(time: TemporalBoardTimeRange, seconds: number, duration: number): TemporalBoardTimeRange {
  return {
    start: Math.max(0, time.start - seconds),
    end: Math.min(duration, time.end + seconds),
  };
}

function evidenceForArm(
  arm: OraclePilotArm,
  delta: BoardDeltaEvent,
  finalBoard: TemporalBoardAsset,
  uniformFrame: TemporalBoardAsset,
): { text: string; images: TemporalBoardAsset[] } {
  if (arm === "transcript_only") {
    return { text: "本条件只提供同一事件时间窗内的课堂语音。", images: [] };
  }
  if (arm === "static_final_board") {
    return { text: "本条件提供事件结束后的稳定板书，不提供板书变化过程或操作类型。", images: [finalBoard] };
  }
  if (arm === "uniform_frame") {
    return { text: "本条件提供与其他视觉条件匹配预算的一张均匀抽样画面，不提供板书变化过程或操作类型。", images: [uniformFrame] };
  }
  return {
    text: `本条件提供人工仲裁的 before/delta/after 对照图；板书操作类型：${delta.operation}；变化区域：${JSON.stringify(delta.region)}；可见变化：${delta.semantic_label}。不提供教学功能标签，不得补写学生反应、教学效果或教学角色。`,
    images: [delta.comparison_asset],
  };
}

function evidenceModeForArm(arm: OraclePilotArm): EvidenceMode {
  if (arm === "transcript_only") return "text";
  if (arm === "oracle_delta") return "temporal_board";
  return "static_frames";
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} 不能为空`);
}

export function buildOraclePilotPackage(input: {
  bundle: BoardEvidenceBundle;
  cases: OraclePilotCaseSpec[];
  prompt_version: string;
  blind_seed: string;
}): OraclePilotPackage {
  const report = validateBoardEvidenceBundle(input.bundle);
  if (!report.valid) {
    const summary = report.issues.filter((issue) => issue.severity === "error").slice(0, 5)
      .map((issue) => `${issue.path}: ${issue.message}`).join("；");
    throw new Error(`Temporal Board bundle 未通过校验：${summary}`);
  }
  assertNonEmpty(input.prompt_version, "prompt_version");
  assertNonEmpty(input.blind_seed, "blind_seed");
  if (!input.cases.length) throw new Error("Oracle pilot 至少需要一个 case");

  const caseIds = new Set<string>();
  const deltaIds = new Set<string>();
  const samples: OraclePilotArmInput[] = [];
  const speechWindow = input.bundle.config.speech_window_seconds;

  for (const spec of input.cases) {
    assertNonEmpty(spec.case_id, "case_id");
    if (caseIds.has(spec.case_id)) throw new Error(`case_id 重复：${spec.case_id}`);
    if (deltaIds.has(spec.delta_id)) throw new Error(`同一 delta 不得重复进入 pilot：${spec.delta_id}`);
    caseIds.add(spec.case_id);
    deltaIds.add(spec.delta_id);

    const delta = input.bundle.deltas.find((item) => item.delta_id === spec.delta_id);
    if (!delta) throw new Error(`找不到 delta：${spec.delta_id}`);
    if (delta.status !== "accepted") throw new Error(`delta ${spec.delta_id} 尚未仲裁为 accepted，不能进入 Oracle arm`);
    if (!ORACLE_PILOT_OPERATIONS.has(delta.operation)) {
      throw new Error(`delta ${spec.delta_id} 的操作类型 ${delta.operation} 不在首轮 Oracle pilot 的冻结范围内`);
    }

    const before = input.bundle.states.find((item) => item.state_id === delta.before_state_id);
    const after = input.bundle.states.find((item) => item.state_id === delta.after_state_id);
    const uniform = input.bundle.frames.find((item) => item.frame_id === spec.uniform_frame_id);
    if (!before || !after) throw new Error(`delta ${spec.delta_id} 缺少 before/after state`);
    if (!uniform) throw new Error(`找不到均匀帧：${spec.uniform_frame_id}`);
    if (before.source_video_id !== delta.source_video_id || after.source_video_id !== delta.source_video_id || uniform.source_video_id !== delta.source_video_id) {
      throw new Error(`case ${spec.case_id} 混入了其他视频的视觉证据`);
    }

    const speechRange = expanded(delta.time, speechWindow, input.bundle.source.duration_seconds);
    if (uniform.surface_id !== delta.surface_id || uniform.timestamp < speechRange.start || uniform.timestamp > speechRange.end) {
      throw new Error(`case ${spec.case_id} 的均匀帧必须来自同一板面并落在预注册事件窗口内`);
    }
    const speech = input.bundle.speech.filter((item) => overlap(item.time, speechRange));
    if (!speech.length) throw new Error(`delta ${spec.delta_id} 的语音窗口为空`);
    const transcript = speech.map((item) => `[${item.speech_id}] ${item.normalized_text || item.raw_text}`).join("\n");
    const common = {
      case_id: spec.case_id,
      source_video_id: delta.source_video_id,
      delta_id: delta.delta_id,
      time: delta.time,
      speech_ids: speech.map((item) => item.speech_id),
      transcript,
      prompt_version: input.prompt_version,
    };
    const pairedContext = sha256(common);

    for (const arm of ARMS) {
      const evidence = evidenceForArm(
        arm,
        delta,
        after.representative_asset,
        uniform.board_asset ?? uniform.source_asset,
      );
      samples.push({
        case_id: spec.case_id,
        arm,
        evidence_mode: evidenceModeForArm(arm),
        source_video_id: delta.source_video_id,
        delta_id: delta.delta_id,
        time: delta.time,
        speech_ids: common.speech_ids,
        transcript,
        evidence_text: evidence.text,
        image_assets: evidence.images,
        paired_context_sha256: pairedContext,
        condition_sha256: sha256({ ...common, arm, evidence }),
      });
    }
  }

  const answer_key = samples.map((sample) => {
    const paired_case_id = `P-${sha256({ seed: input.blind_seed, case_id: sample.case_id }).slice(0, 16)}`;
    return {
      blind_id: `B-${sha256({ seed: input.blind_seed, case_id: sample.case_id, arm: sample.arm }).slice(0, 16)}`,
      paired_case_id,
      case_id: sample.case_id,
      arm: sample.arm,
      evidence_mode: sample.evidence_mode,
      condition_sha256: sample.condition_sha256,
    };
  });
  const blind_evaluation_items = answer_key.map((item) => ({
    blind_id: item.blind_id,
    paired_case_id: item.paired_case_id,
    response: null,
    response_sha256: null,
  })).sort((left, right) => left.blind_id.localeCompare(right.blind_id));

  return {
    schema_version: "oracle-pilot-package-v1",
    bundle_id: input.bundle.bundle_id,
    protocol: {
      protocol_version: "oracle-value-gate-v1",
      prompt_version: input.prompt_version,
      visual_items_per_visual_arm: 1,
      speech_window_seconds: speechWindow,
      visual_budget_rule: "one_preprocessed_canvas_per_visual_arm",
      runtime_pixel_and_token_audit_required: true,
    },
    samples,
    blind_evaluation_items,
    answer_key,
  };
}

export function validateOraclePilotPairing(pilot: OraclePilotPackage): string[] {
  const issues: string[] = [];
  const groups = new Map<string, OraclePilotArmInput[]>();
  for (const sample of pilot.samples) groups.set(sample.case_id, [...(groups.get(sample.case_id) ?? []), sample]);
  for (const [caseId, samples] of groups) {
    const arms = new Set(samples.map((sample) => sample.arm));
    if (samples.length !== ARMS.length || ARMS.some((arm) => !arms.has(arm))) issues.push(`${caseId}: 四个条件不完整`);
    const first = samples[0];
    const contextSignatures = samples.map((sample) => JSON.stringify({
      source_video_id: sample.source_video_id,
      delta_id: sample.delta_id,
      time: sample.time,
      speech_ids: sample.speech_ids,
      transcript: sample.transcript,
    }));
    if (new Set(contextSignatures).size !== 1) issues.push(`${caseId}: 语音或事件上下文未配对`);
    for (const sample of samples) {
      const common = {
        case_id: sample.case_id,
        source_video_id: sample.source_video_id,
        delta_id: sample.delta_id,
        time: sample.time,
        speech_ids: sample.speech_ids,
        transcript: sample.transcript,
        prompt_version: pilot.protocol.prompt_version,
      };
      if (sample.paired_context_sha256 !== sha256(common)) issues.push(`${caseId}/${sample.arm}: paired_context_sha256 与实际上下文不符`);
      const evidence = { text: sample.evidence_text, images: sample.image_assets };
      if (sample.condition_sha256 !== sha256({ ...common, arm: sample.arm, evidence })) issues.push(`${caseId}/${sample.arm}: condition_sha256 与实际输入不符`);
    }
    if (!first) issues.push(`${caseId}: 空配对组`);
    for (const sample of samples) {
      const expected = sample.arm === "transcript_only" ? 0 : pilot.protocol.visual_items_per_visual_arm;
      if (sample.image_assets.length !== expected) issues.push(`${caseId}/${sample.arm}: 视觉预算应为 ${expected}`);
    }
  }
  if (pilot.answer_key.length !== pilot.samples.length || pilot.blind_evaluation_items.length !== pilot.samples.length) issues.push("盲评样本或 answer key 数量不一致");
  if (new Set(pilot.answer_key.map((item) => item.blind_id)).size !== pilot.answer_key.length) issues.push("blind_id 重复");
  const blindById = new Map(pilot.blind_evaluation_items.map((item) => [item.blind_id, item]));
  for (const key of pilot.answer_key) {
    const blind = blindById.get(key.blind_id);
    if (!blind) issues.push(`${key.blind_id}: answer key 缺少盲评条目`);
    else if (blind.paired_case_id !== key.paired_case_id) issues.push(`${key.blind_id}: 配对组映射不一致`);
  }
  return issues;
}
