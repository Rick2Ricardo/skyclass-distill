export type TemporalBoardEvidenceLevel = "observable" | "teacher_stated" | "inferred" | "unknown";
export type TemporalBoardReviewStatus = "accepted" | "needs_review" | "abstained";
export type TemporalBoardOperation = "add" | "erase" | "modify" | "connect" | "move" | "unknown";

export interface TemporalBoardTimeRange {
  start: number;
  end: number;
}

export interface TemporalBoardPoint {
  x: number;
  y: number;
}

export interface TemporalBoardRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TemporalBoardAsset {
  asset_uri: string;
  sha256: string;
}

export interface TemporalBoardSource {
  source_video_id: string;
  video: TemporalBoardAsset;
  duration_seconds: number;
}

export interface BoardSurface {
  surface_id: string;
  source_video_id: string;
  kind: "chalkboard" | "whiteboard" | "digital_ink" | "unknown";
  calibration: "manual" | "auto_confirmed";
  polygon: TemporalBoardPoint[];
  ignore_regions: TemporalBoardRegion[];
  valid_during: TemporalBoardTimeRange;
  status: TemporalBoardReviewStatus;
  diagnostics: string[];
}

export interface FrameObservation {
  frame_id: string;
  source_video_id: string;
  surface_id: string;
  timestamp: number;
  source_asset: TemporalBoardAsset;
  board_asset?: TemporalBoardAsset;
  ink_mask?: TemporalBoardAsset;
  occlusion_mask?: TemporalBoardAsset;
  registration_score: number | null;
  visible_fraction: number | null;
}

export interface BoardObject {
  object_id: string;
  source_video_id: string;
  surface_id: string;
  kind: "text" | "formula" | "diagram" | "arrow" | "mark" | "unknown";
  region: TemporalBoardRegion;
  semantic_text: string | null;
  semantic_source: "ocr" | "vlm" | "human" | "none";
  first_visible: number;
  last_visible: number;
  evidence_refs: string[];
}

export interface BoardState {
  state_id: string;
  source_video_id: string;
  surface_id: string;
  stable_during: TemporalBoardTimeRange;
  representative_asset: TemporalBoardAsset;
  visibility_asset?: TemporalBoardAsset;
  object_ids: string[];
  observed_support: number;
  evidence_refs: string[];
  status: TemporalBoardReviewStatus;
}

export interface TemporalBoardConfidenceVector {
  visibility: number | null;
  registration: number | null;
  persistence: number | null;
  operation: number | null;
  ocr: number | null;
  speech_alignment: number | null;
  pedagogical_inference: number | null;
}

export interface TemporalBoardEraseEvidence {
  visibility_restored: boolean;
  absent_from_after_state: boolean;
  confirmed_until: number | null;
  supporting_frame_ids: string[];
}

export interface TemporalBoardRelation {
  source_object_ids: string[];
  target_object_ids: string[];
  relation_type: string;
}

export interface TemporalBoardModification {
  old_object_ids: string[];
  new_object_ids: string[];
  semantic_slot_id: string;
}

export interface BoardDeltaEvent {
  delta_id: string;
  source_video_id: string;
  surface_id: string;
  time: TemporalBoardTimeRange;
  before_state_id: string;
  after_state_id: string;
  operation: TemporalBoardOperation;
  region: TemporalBoardRegion;
  affected_object_ids: string[];
  delta_mask: TemporalBoardAsset;
  comparison_asset: TemporalBoardAsset;
  semantic_label: string | null;
  confidence: TemporalBoardConfidenceVector;
  evidence_refs: string[];
  erase_evidence: TemporalBoardEraseEvidence | null;
  relation: TemporalBoardRelation | null;
  modification: TemporalBoardModification | null;
  status: TemporalBoardReviewStatus;
  uncertainty_codes: string[];
}

export interface SpeechSpan {
  speech_id: string;
  source_video_id: string;
  time: TemporalBoardTimeRange;
  raw_text: string;
  normalized_text: string | null;
  normalization: "none" | "lexicon" | "human";
  source_segment_indexes: number[];
}

export interface TemporalBoardGroundedClaim<T> {
  value: T | null;
  subject: "board" | "teacher" | "content" | "learner_hypothesis" | "learner_observed" | "unknown";
  level: TemporalBoardEvidenceLevel;
  confidence: number | null;
  evidence_refs: string[];
}

export interface TemporalBoardExecutableMove {
  step: number;
  operation: "introduce" | "annotate" | "connect" | "contrast" | "revise" | "clear";
  pedagogical_target: string;
  render_instruction: string;
  success_signal: string | null;
  source_delta_ids: string[];
}

export interface BoardGroundedTransition {
  transition_id: string;
  source_video_id: string;
  time: TemporalBoardTimeRange;
  delta_ids: string[];
  speech_ids: string[];
  evidence_refs: string[];
  trigger: TemporalBoardGroundedClaim<string>;
  teaching_action: TemporalBoardGroundedClaim<string>;
  board_action: TemporalBoardGroundedClaim<string>;
  pedagogical_role: TemporalBoardGroundedClaim<
    | "definition"
    | "progressive_scaffolding"
    | "representation_switch"
    | "comparison"
    | "worked_example"
    | "emphasis"
    | "error_correction"
    | "check"
    | "other"
  >;
  expected_learner_change: TemporalBoardGroundedClaim<string>;
  learning_check: TemporalBoardGroundedClaim<string>;
  remediation: TemporalBoardGroundedClaim<string>;
  observed_learner_response: TemporalBoardGroundedClaim<string> | null;
  executable_board_moves: TemporalBoardExecutableMove[];
  status: TemporalBoardReviewStatus;
  uncertainty_codes: string[];
}

export interface TemporalBoardLearnerObservation {
  observation_id: string;
  source_video_id: string;
  time: TemporalBoardTimeRange;
  value: string;
  evidence_refs: string[];
}

export interface TemporalBoardEvidenceRef {
  evidence_id: string;
  kind: "frame" | "board_state" | "board_delta" | "speech";
  target_id: string;
  source_video_id: string;
  time: TemporalBoardTimeRange;
  region?: TemporalBoardRegion;
  asset?: TemporalBoardAsset;
  evidence_level: TemporalBoardEvidenceLevel;
}

export interface TemporalBoardRecoveryConfig {
  mode: "fixed_camera_oracle_pilot";
  minimum_stable_seconds: number;
  speech_window_seconds: number;
  board_roi?: TemporalBoardPoint[];
  ignore_regions: TemporalBoardRegion[];
}

export interface BoardEvidenceBundle {
  schema_version: "temporal-board-v2";
  bundle_id: string;
  created_at: string;
  source: TemporalBoardSource;
  teacher_only_recording: boolean;
  config: TemporalBoardRecoveryConfig;
  surfaces: BoardSurface[];
  frames: FrameObservation[];
  objects: BoardObject[];
  states: BoardState[];
  deltas: BoardDeltaEvent[];
  speech: SpeechSpan[];
  evidence: TemporalBoardEvidenceRef[];
  transitions: BoardGroundedTransition[];
  learner_observations: TemporalBoardLearnerObservation[];
  warnings: string[];
  immutable: true;
  payload_sha256: string;
}

export interface TemporalBoardValidationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface TemporalBoardValidationReport {
  valid: boolean;
  issues: TemporalBoardValidationIssue[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return "null";
}

/** Canonical payload used for the bundle's content-addressed SHA-256. */
export function canonicalBoardEvidencePayload(input: BoardEvidenceBundle): string {
  const { payload_sha256: _declaredHash, ...payload } = input;
  return stableJson(payload);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isControlledRelativeAssetUri(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.trim() !== value || value.includes("\\") || value.includes("\0")) return false;
  let decoded = value;
  let stable = false;
  try {
    for (let index = 0; index < 16; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        stable = true;
        break;
      }
      decoded = next;
    }
  } catch {
    return false;
  }
  if (!stable || !decoded || decoded.includes("\\") || decoded.includes("\0") || decoded.includes("?") || decoded.includes("#")) return false;
  if (decoded.startsWith("/") || decoded.startsWith("~") || /^[a-zA-Z]:\//.test(decoded)) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) return false;
  const parts = decoded.split("/");
  return parts.every((part) => Boolean(part) && part !== "." && part !== "..");
}

export function validateBoardEvidenceBundle(input: unknown): TemporalBoardValidationReport {
  const issues: TemporalBoardValidationIssue[] = [];
  const error = (code: string, path: string, message: string) => issues.push({ severity: "error", code, path, message });

  if (!isObject(input)) {
    return { valid: false, issues: [{ severity: "error", code: "bundle.type", path: "$", message: "Bundle 必须是对象。" }] };
  }

  const requireString = (value: unknown, path: string, code = "field.string") => {
    if (!isNonEmptyString(value)) error(code, path, "必须是非空字符串。");
  };
  const requireFinite = (value: unknown, path: string, code = "field.number") => {
    if (typeof value !== "number" || !Number.isFinite(value)) error(code, path, "必须是有限数值。");
  };
  const requireProbability = (value: unknown, path: string) => {
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) {
      error("field.probability", path, "置信度必须为 null 或 [0, 1] 内有限数值。");
    }
  };
  const requireStringList = (value: unknown, path: string) => {
    if (!Array.isArray(value) || value.some((item) => !isNonEmptyString(item))) error("field.string_array", path, "必须是非空字符串数组。可为空数组，但元素不能为空。");
  };
  const requireArray = (key: string) => {
    if (!Array.isArray(input[key])) error("bundle.array", `$.${key}`, `${key} 必须是数组。`);
  };

  if (input.schema_version !== "temporal-board-v2") error("bundle.schema_version", "$.schema_version", "仅接受 temporal-board-v2。");
  requireString(input.bundle_id, "$.bundle_id", "bundle.id");
  if (typeof input.created_at !== "string" || !Number.isFinite(Date.parse(input.created_at))) {
    error("bundle.created_at", "$.created_at", "created_at 必须是有效 ISO 时间。");
  }
  if (input.teacher_only_recording !== true && input.teacher_only_recording !== false) {
    error("bundle.teacher_only", "$.teacher_only_recording", "teacher_only_recording 必须显式为布尔值。");
  }
  if (input.immutable !== true) error("bundle.immutable", "$.immutable", "已标注 bundle 必须不可变。");
  if (!isSha256(input.payload_sha256)) error("bundle.payload_sha256", "$.payload_sha256", "payload_sha256 必须是 64 位 SHA-256。");
  for (const key of ["surfaces", "frames", "objects", "states", "deltas", "speech", "evidence", "transitions", "learner_observations", "warnings"]) {
    requireArray(key);
  }
  if (Array.isArray(input.warnings)) requireStringList(input.warnings, "$.warnings");
  if (!isObject(input.source)) error("bundle.source", "$.source", "source 必须是对象。");
  if (!isObject(input.config)) error("bundle.config", "$.config", "config 必须是对象。");

  const source = isObject(input.source) ? input.source : {};
  const sourceVideoId = isNonEmptyString(source.source_video_id) ? source.source_video_id : "";
  requireString(source.source_video_id, "$.source.source_video_id", "source.id");
  const duration = source.duration_seconds;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
    error("source.duration", "$.source.duration_seconds", "视频时长必须是正的有限秒数。");
  }

  const validateAsset = (value: unknown, path: string, required = true) => {
    if (value === undefined && !required) return;
    if (!isObject(value)) return error("asset.missing", path, "资产必须包含受控 URI 与 SHA-256。");
    if (!isControlledRelativeAssetUri(value.asset_uri)) error("asset.uri", `${path}.asset_uri`, "asset_uri 必须是受控相对路径。");
    if (!isSha256(value.sha256)) error("asset.sha256", `${path}.sha256`, "sha256 必须是 64 位十六进制摘要。");
  };
  validateAsset(source.video, "$.source.video");

  const validateTime = (value: unknown, path: string): TemporalBoardTimeRange | null => {
    if (!isObject(value)) {
      error("time.missing", path, "时间范围不能为空。");
      return null;
    }
    const start = value.start;
    const end = value.end;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      error("time.invalid", path, "时间必须满足 0 <= start < end，且均为有限数值。");
      return null;
    }
    if (typeof duration === "number" && Number.isFinite(duration) && end > duration) {
      error("time.out_of_bounds", path, "时间范围不得超过源视频时长。");
    }
    return { start, end };
  };
  const validateTimestamp = (value: unknown, path: string): value is number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (typeof duration === "number" && value > duration)) {
      error("time.timestamp", path, "时间戳必须位于源视频范围内。");
      return false;
    }
    return true;
  };
  const validateRegion = (value: unknown, path: string) => {
    if (!isObject(value)) return error("region.missing", path, "归一化区域不能为空。");
    const { x, y, width, height } = value;
    if ([x, y, width, height].some((number) => typeof number !== "number" || !Number.isFinite(number))) {
      return error("region.invalid", path, "归一化区域必须由有限数值构成。");
    }
    if ((x as number) < 0 || (y as number) < 0 || (width as number) <= 0 || (height as number) <= 0
      || (x as number) + (width as number) > 1 || (y as number) + (height as number) > 1) {
      error("region.bounds", path, "区域必须完整位于 [0, 1] 板面坐标内且面积为正。");
    }
  };
  const validatePointList = (value: unknown, path: string) => {
    if (!Array.isArray(value) || value.length < 4) return error("polygon.invalid", path, "板面多边形至少需要四个归一化点。");
    const signatures = new Set<string>();
    value.forEach((point, index) => {
      if (!isObject(point) || typeof point.x !== "number" || typeof point.y !== "number"
        || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
        error("polygon.point", `${path}[${index}]`, "多边形点必须位于 [0, 1]。 ");
      } else {
        signatures.add(`${point.x}:${point.y}`);
      }
    });
    if (signatures.size < 4) error("polygon.degenerate", path, "板面多边形至少需要四个不同的点。");
  };
  const validateSource = (value: unknown, path: string) => {
    requireString(value, path, "source.ref");
    if (isNonEmptyString(value) && sourceVideoId && value !== sourceVideoId) error("source.mismatch", path, "条目必须属于 bundle 的源视频。");
  };
  const validateStatus = (value: unknown, path: string) => {
    if (!["accepted", "needs_review", "abstained"].includes(String(value))) error("status.invalid", path, "review status 不合法。");
  };

  const config = isObject(input.config) ? input.config : {};
  if (config.mode !== "fixed_camera_oracle_pilot") error("config.mode", "$.config.mode", "Oracle pilot 仅接受 fixed_camera_oracle_pilot。");
  for (const key of ["minimum_stable_seconds", "speech_window_seconds"] as const) {
    const value = config[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) error("config.number", `$.config.${key}`, `${key} 必须是正的有限数值。`);
  }
  if (config.board_roi !== undefined) validatePointList(config.board_roi, "$.config.board_roi");
  if (!Array.isArray(config.ignore_regions)) error("config.ignore_regions", "$.config.ignore_regions", "ignore_regions 必须是数组。");
  else config.ignore_regions.forEach((region, index) => validateRegion(region, `$.config.ignore_regions[${index}]`));

  const surfaces = Array.isArray(input.surfaces) ? input.surfaces : [];
  const frames = Array.isArray(input.frames) ? input.frames : [];
  const objects = Array.isArray(input.objects) ? input.objects : [];
  const states = Array.isArray(input.states) ? input.states : [];
  const deltas = Array.isArray(input.deltas) ? input.deltas : [];
  const speech = Array.isArray(input.speech) ? input.speech : [];
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const transitions = Array.isArray(input.transitions) ? input.transitions : [];
  const learnerObservations = Array.isArray(input.learner_observations) ? input.learner_observations : [];

  const surfaceIds = new Set<string>();
  const frameIds = new Set<string>();
  const objectIds = new Set<string>();
  const stateIds = new Set<string>();
  const deltaIds = new Set<string>();
  const speechIds = new Set<string>();
  const transitionIds = new Set<string>();
  const evidenceIds = new Set<string>();
  const learnerObservationIds = new Set<string>();
  const allArtifactIds = new Set<string>();
  const registerId = (set: Set<string>, value: unknown, path: string, duplicateCode: string) => {
    requireString(value, path);
    if (!isNonEmptyString(value)) return;
    if (set.has(value)) error(duplicateCode, path, "ID 在 bundle 内必须唯一。");
    if (allArtifactIds.has(value)) error("bundle.id_collision", path, "不同 artifact 也不得复用同一 ID。");
    set.add(value);
    allArtifactIds.add(value);
  };

  surfaces.forEach((item, index) => { if (isObject(item)) registerId(surfaceIds, item.surface_id, `$.surfaces[${index}].surface_id`, "surface.duplicate"); });
  frames.forEach((item, index) => { if (isObject(item)) registerId(frameIds, item.frame_id, `$.frames[${index}].frame_id`, "frame.duplicate"); });
  objects.forEach((item, index) => { if (isObject(item)) registerId(objectIds, item.object_id, `$.objects[${index}].object_id`, "object.duplicate"); });
  states.forEach((item, index) => { if (isObject(item)) registerId(stateIds, item.state_id, `$.states[${index}].state_id`, "state.duplicate"); });
  deltas.forEach((item, index) => { if (isObject(item)) registerId(deltaIds, item.delta_id, `$.deltas[${index}].delta_id`, "delta.duplicate"); });
  speech.forEach((item, index) => { if (isObject(item)) registerId(speechIds, item.speech_id, `$.speech[${index}].speech_id`, "speech.duplicate"); });
  transitions.forEach((item, index) => { if (isObject(item)) registerId(transitionIds, item.transition_id, `$.transitions[${index}].transition_id`, "transition.duplicate"); });
  evidence.forEach((item, index) => { if (isObject(item)) registerId(evidenceIds, item.evidence_id, `$.evidence[${index}].evidence_id`, "evidence.duplicate"); });
  learnerObservations.forEach((item, index) => { if (isObject(item)) registerId(learnerObservationIds, item.observation_id, `$.learner_observations[${index}].observation_id`, "learner_observation.duplicate"); });

  if (!surfaces.length) error("bundle.surface_empty", "$.surfaces", "至少需要一个已校准板面。");
  if (!frames.length) error("bundle.frame_empty", "$.frames", "至少需要一个观测帧。");
  if (!states.length) error("bundle.state_empty", "$.states", "至少需要一个稳定板书状态。");

  const evidenceById = new Map<string, Record<string, unknown>>();
  evidence.forEach((item) => { if (isObject(item) && isNonEmptyString(item.evidence_id)) evidenceById.set(item.evidence_id, item); });
  const targetSurface = (kind: unknown, targetId: unknown): unknown => {
    if (!isNonEmptyString(targetId)) return undefined;
    const collection = kind === "frame" ? frames : kind === "board_state" ? states : kind === "board_delta" ? deltas : [];
    const idKey = kind === "frame" ? "frame_id" : kind === "board_state" ? "state_id" : "delta_id";
    const target = collection.find((item) => isObject(item) && item[idKey] === targetId);
    return isObject(target) ? target.surface_id : undefined;
  };
  const validateEvidenceRefs = (
    value: unknown,
    path: string,
    ownerSource: unknown,
    allowedKinds?: string[],
    ownerSurface?: unknown,
  ): string[] => {
    requireStringList(value, path);
    const refs = stringArray(value);
    if (new Set(refs).size !== refs.length) error("evidence_ref.duplicate", path, "evidence_refs 不得重复。");
    refs.forEach((id, index) => {
      const ref = evidenceById.get(id);
      if (!ref) error("evidence_ref.missing", `${path}[${index}]`, "引用的 evidence_id 不存在。");
      else if (isNonEmptyString(ownerSource) && ref.source_video_id !== ownerSource) error("evidence_ref.source", `${path}[${index}]`, "证据与条目必须属于同一源视频。");
      else if (allowedKinds && !allowedKinds.includes(String(ref.kind))) error("evidence_ref.kind", `${path}[${index}]`, "证据类型不能支持此 artifact。");
      else if (isNonEmptyString(ownerSurface) && ["frame", "board_state", "board_delta"].includes(String(ref.kind))
        && targetSurface(ref.kind, ref.target_id) !== ownerSurface) {
        error("evidence_ref.surface", `${path}[${index}]`, "视觉证据与条目必须属于同一板面。");
      }
    });
    return refs;
  };

  const surfaceById = new Map<string, Record<string, unknown>>();
  surfaces.forEach((item, index) => {
    const path = `$.surfaces[${index}]`;
    if (!isObject(item)) return error("surface.type", path, "BoardSurface 必须是对象。");
    if (isNonEmptyString(item.surface_id)) surfaceById.set(item.surface_id, item);
    validateSource(item.source_video_id, `${path}.source_video_id`);
    if (!["chalkboard", "whiteboard", "digital_ink", "unknown"].includes(String(item.kind))) error("surface.kind", `${path}.kind`, "板面类型不合法。");
    if (!["manual", "auto_confirmed"].includes(String(item.calibration))) error("surface.calibration", `${path}.calibration`, "板面校准必须经人工或确认。");
    validatePointList(item.polygon, `${path}.polygon`);
    if (!Array.isArray(item.ignore_regions)) error("surface.ignore_regions", `${path}.ignore_regions`, "ignore_regions 必须是数组。");
    else item.ignore_regions.forEach((region, regionIndex) => validateRegion(region, `${path}.ignore_regions[${regionIndex}]`));
    validateTime(item.valid_during, `${path}.valid_during`);
    validateStatus(item.status, `${path}.status`);
    requireStringList(item.diagnostics, `${path}.diagnostics`);
  });

  const frameById = new Map<string, Record<string, unknown>>();
  let priorFrameTimestamp = -1;
  frames.forEach((item, index) => {
    const path = `$.frames[${index}]`;
    if (!isObject(item)) return error("frame.type", path, "FrameObservation 必须是对象。");
    if (isNonEmptyString(item.frame_id)) frameById.set(item.frame_id, item);
    validateSource(item.source_video_id, `${path}.source_video_id`);
    if (!isNonEmptyString(item.surface_id) || !surfaceIds.has(item.surface_id)) error("frame.surface_ref", `${path}.surface_id`, "frame 必须引用存在的板面。");
    if (validateTimestamp(item.timestamp, `${path}.timestamp`)) {
      if (item.timestamp < priorFrameTimestamp) error("frame.order", `${path}.timestamp`, "frames 必须按时间升序排列。");
      priorFrameTimestamp = item.timestamp;
      const surface = isNonEmptyString(item.surface_id) ? surfaceById.get(item.surface_id) : undefined;
      const validDuring = surface && isObject(surface.valid_during) ? surface.valid_during : null;
      if (validDuring && typeof validDuring.start === "number" && typeof validDuring.end === "number"
        && (item.timestamp < validDuring.start || item.timestamp > validDuring.end)) {
        error("frame.surface_time", `${path}.timestamp`, "frame 时间必须位于板面有效区间内。");
      }
    }
    validateAsset(item.source_asset, `${path}.source_asset`);
    validateAsset(item.board_asset, `${path}.board_asset`, false);
    validateAsset(item.ink_mask, `${path}.ink_mask`, false);
    validateAsset(item.occlusion_mask, `${path}.occlusion_mask`, false);
    requireProbability(item.registration_score, `${path}.registration_score`);
    requireProbability(item.visible_fraction, `${path}.visible_fraction`);
  });

  const objectById = new Map<string, Record<string, unknown>>();
  objects.forEach((item, index) => {
    const path = `$.objects[${index}]`;
    if (!isObject(item)) return error("object.type", path, "BoardObject 必须是对象。");
    if (isNonEmptyString(item.object_id)) objectById.set(item.object_id, item);
    validateSource(item.source_video_id, `${path}.source_video_id`);
    if (!isNonEmptyString(item.surface_id) || !surfaceIds.has(item.surface_id)) error("object.surface_ref", `${path}.surface_id`, "object 必须引用存在的板面。");
    if (!["text", "formula", "diagram", "arrow", "mark", "unknown"].includes(String(item.kind))) error("object.kind", `${path}.kind`, "板书对象类型不合法。");
    validateRegion(item.region, `${path}.region`);
    if (item.semantic_text !== null && typeof item.semantic_text !== "string") error("object.semantic_text", `${path}.semantic_text`, "semantic_text 必须是字符串或 null。");
    if (!["ocr", "vlm", "human", "none"].includes(String(item.semantic_source))) error("object.semantic_source", `${path}.semantic_source`, "semantic_source 不合法。");
    if (item.semantic_source === "none" && item.semantic_text !== null) error("object.semantic_without_source", `${path}.semantic_text`, "无语义来源时 semantic_text 必须为 null。");
    const firstVisible = item.first_visible;
    const lastVisible = item.last_visible;
    const firstOk = validateTimestamp(firstVisible, `${path}.first_visible`);
    const lastOk = validateTimestamp(lastVisible, `${path}.last_visible`);
    if (firstOk && lastOk && lastVisible < firstVisible) error("object.time_order", path, "last_visible 不得早于 first_visible。");
    const surface = isNonEmptyString(item.surface_id) ? surfaceById.get(item.surface_id) : undefined;
    const surfaceTime = surface && isObject(surface.valid_during) ? surface.valid_during : null;
    if (firstOk && lastOk && surfaceTime && typeof surfaceTime.start === "number" && typeof surfaceTime.end === "number"
      && (firstVisible < surfaceTime.start || lastVisible > surfaceTime.end)) {
      error("object.surface_time", path, "object 可见时间必须位于板面有效区间内。");
    }
    const refs = validateEvidenceRefs(item.evidence_refs, `${path}.evidence_refs`, item.source_video_id, ["frame", "board_state"], item.surface_id);
    if (!refs.length) error("object.evidence_empty", `${path}.evidence_refs`, "板书对象至少需要一条观测证据。");
    if (firstOk && lastOk) {
      refs.forEach((id, refIndex) => {
        const ref = evidenceById.get(id);
        if (!ref) return;
        if (ref.kind === "frame" && isNonEmptyString(ref.target_id)) {
          const frame = frameById.get(ref.target_id);
          if (frame && (typeof frame.timestamp !== "number" || frame.timestamp < firstVisible || frame.timestamp > lastVisible)) {
            error("object.evidence_time", `${path}.evidence_refs[${refIndex}]`, "object 的证据帧必须位于其可见生命周期内。");
          }
        }
        if (ref.kind === "board_state" && isNonEmptyString(ref.target_id)) {
          const state = states.find((candidate) => isObject(candidate) && candidate.state_id === ref.target_id);
          const stateTime = isObject(state) && isObject(state.stable_during) ? state.stable_during : null;
          if (stateTime && (typeof stateTime.start !== "number" || typeof stateTime.end !== "number"
            || stateTime.start < firstVisible || stateTime.end > lastVisible)) {
            error("object.evidence_time", `${path}.evidence_refs[${refIndex}]`, "object 的状态证据必须完整位于其可见生命周期内。");
          }
        }
      });
    }
  });

  const stateById = new Map<string, Record<string, unknown>>();
  let priorStateStart = -1;
  states.forEach((item, index) => {
    const path = `$.states[${index}]`;
    if (!isObject(item)) return error("state.type", path, "BoardState 必须是对象。");
    if (isNonEmptyString(item.state_id)) stateById.set(item.state_id, item);
    validateSource(item.source_video_id, `${path}.source_video_id`);
    if (!isNonEmptyString(item.surface_id) || !surfaceIds.has(item.surface_id)) error("state.surface_ref", `${path}.surface_id`, "state 必须引用存在的板面。");
    const time = validateTime(item.stable_during, `${path}.stable_during`);
    if (time) {
      if (time.start < priorStateStart) error("state.order", `${path}.stable_during`, "states 必须按开始时间升序排列。");
      priorStateStart = time.start;
      const surface = isNonEmptyString(item.surface_id) ? surfaceById.get(item.surface_id) : undefined;
      const surfaceTime = surface && isObject(surface.valid_during) ? surface.valid_during : null;
      if (surfaceTime && typeof surfaceTime.start === "number" && typeof surfaceTime.end === "number"
        && (time.start < surfaceTime.start || time.end > surfaceTime.end)) {
        error("state.surface_time", `${path}.stable_during`, "state 时间必须位于板面有效区间内。");
      }
    }
    validateAsset(item.representative_asset, `${path}.representative_asset`);
    validateAsset(item.visibility_asset, `${path}.visibility_asset`, false);
    requireStringList(item.object_ids, `${path}.object_ids`);
    const ids = stringArray(item.object_ids);
    if (new Set(ids).size !== ids.length) error("state.object_duplicate", `${path}.object_ids`, "object_ids 不得重复。");
    ids.forEach((id, idIndex) => {
      const object = objectById.get(id);
      if (!object) error("state.object_ref", `${path}.object_ids[${idIndex}]`, "引用的 object 不存在。");
      else if (object.source_video_id !== item.source_video_id || object.surface_id !== item.surface_id) {
        error("state.object_scope", `${path}.object_ids[${idIndex}]`, "state 与 object 必须属于同一视频与板面。");
      } else if (time && (typeof object.first_visible !== "number" || typeof object.last_visible !== "number"
        || object.first_visible > time.start || object.last_visible < time.end)) {
        error("state.object_time", `${path}.object_ids[${idIndex}]`, "state 中的 object 必须覆盖完整 stable_during，而非仅与时间窗相交。");
      }
    });
    if (typeof item.observed_support !== "number" || !Number.isFinite(item.observed_support) || item.observed_support < 0 || item.observed_support > 1) {
      error("state.observed_support", `${path}.observed_support`, "observed_support 必须位于 [0, 1]。");
    }
    const refs = validateEvidenceRefs(item.evidence_refs, `${path}.evidence_refs`, item.source_video_id, ["frame"], item.surface_id);
    if (!refs.length) error("state.evidence_empty", `${path}.evidence_refs`, "稳定状态至少需要一条帧证据。");
    if (time) {
      refs.forEach((id, refIndex) => {
        const ref = evidenceById.get(id);
        const frame = ref?.kind === "frame" && isNonEmptyString(ref.target_id) ? frameById.get(ref.target_id) : undefined;
        if (frame && (typeof frame.timestamp !== "number" || frame.timestamp < time.start || frame.timestamp > time.end)) {
          error("state.evidence_time", `${path}.evidence_refs[${refIndex}]`, "state 的证据帧必须落在 stable_during 内。");
        }
      });
    }
    validateStatus(item.status, `${path}.status`);
    if (item.status === "accepted") {
      const surface = isNonEmptyString(item.surface_id) ? surfaceById.get(item.surface_id) : undefined;
      if (surface?.status !== "accepted") error("state.accepted_surface_status", path, "accepted state 必须依赖 accepted surface。");
      if (typeof item.observed_support !== "number" || !Number.isFinite(item.observed_support) || item.observed_support <= 0) {
        error("state.accepted_support", `${path}.observed_support`, "accepted state 必须有正的 observed_support。");
      }
      const minimumStable = config.minimum_stable_seconds;
      if (time && typeof minimumStable === "number" && Number.isFinite(minimumStable)
        && time.end - time.start < minimumStable) {
        error("state.minimum_stable", `${path}.stable_during`, "accepted state 的稳定时长不得短于 minimum_stable_seconds。");
      }
    }
  });

  const deltaById = new Map<string, Record<string, unknown>>();
  let priorDeltaStart = -1;
  deltas.forEach((item, index) => {
    const path = `$.deltas[${index}]`;
    if (!isObject(item)) return error("delta.type", path, "BoardDeltaEvent 必须是对象。");
    if (isNonEmptyString(item.delta_id)) deltaById.set(item.delta_id, item);
    validateSource(item.source_video_id, `${path}.source_video_id`);
    if (!isNonEmptyString(item.surface_id) || !surfaceIds.has(item.surface_id)) error("delta.surface_ref", `${path}.surface_id`, "delta 必须引用存在的板面。");
    const time = validateTime(item.time, `${path}.time`);
    if (time) {
      if (time.start < priorDeltaStart) error("delta.order", `${path}.time`, "deltas 必须按开始时间升序排列。");
      priorDeltaStart = time.start;
      const surface = isNonEmptyString(item.surface_id) ? surfaceById.get(item.surface_id) : undefined;
      const surfaceTime = surface && isObject(surface.valid_during) ? surface.valid_during : null;
      if (surfaceTime && typeof surfaceTime.start === "number" && typeof surfaceTime.end === "number"
        && (time.start < surfaceTime.start || time.end > surfaceTime.end)) {
        error("delta.surface_time", `${path}.time`, "delta 时间必须位于板面有效区间内。");
      }
    }
    const before = isNonEmptyString(item.before_state_id) ? stateById.get(item.before_state_id) : undefined;
    const after = isNonEmptyString(item.after_state_id) ? stateById.get(item.after_state_id) : undefined;
    if (!before) error("delta.before_ref", `${path}.before_state_id`, "before state 不存在。");
    if (!after) error("delta.after_ref", `${path}.after_state_id`, "after state 不存在。");
    if (item.before_state_id === item.after_state_id) error("delta.same_state", path, "before 与 after state 必须不同。");
    if (before && after && time) {
      const beforeTime = isObject(before.stable_during) ? before.stable_during : null;
      const afterTime = isObject(after.stable_during) ? after.stable_during : null;
      if (before.source_video_id !== item.source_video_id || after.source_video_id !== item.source_video_id
        || before.surface_id !== item.surface_id || after.surface_id !== item.surface_id) {
        error("delta.state_scope", path, "before/delta/after 必须属于同一视频与板面。");
      }
      if (!beforeTime || typeof beforeTime.end !== "number" || beforeTime.end > time.start
        || !afterTime || typeof afterTime.start !== "number" || afterTime.start < time.end) {
        error("delta.temporal_order", path, "必须满足 before.stable_end <= delta.start < delta.end <= after.stable_start。");
      }
    }
    if (!["add", "erase", "modify", "connect", "move", "unknown"].includes(String(item.operation))) error("delta.operation", `${path}.operation`, "板书变化类型不合法。");
    validateRegion(item.region, `${path}.region`);
    requireStringList(item.affected_object_ids, `${path}.affected_object_ids`);
    const affected = stringArray(item.affected_object_ids);
    if (new Set(affected).size !== affected.length) error("delta.object_duplicate", `${path}.affected_object_ids`, "affected_object_ids 不得重复。");
    affected.forEach((id, idIndex) => {
      const object = objectById.get(id);
      if (!object) error("delta.object_ref", `${path}.affected_object_ids[${idIndex}]`, "受影响 object 不存在。");
      else if (object.source_video_id !== item.source_video_id || object.surface_id !== item.surface_id) {
        error("delta.object_scope", `${path}.affected_object_ids[${idIndex}]`, "delta 与 object 必须属于同一视频与板面。");
      }
    });
    if (item.operation !== "unknown" && !affected.length) error("delta.object_empty", `${path}.affected_object_ids`, "已分类变化必须引用至少一个受影响对象。");
    validateAsset(item.delta_mask, `${path}.delta_mask`);
    validateAsset(item.comparison_asset, `${path}.comparison_asset`);
    if (item.semantic_label !== null && typeof item.semantic_label !== "string") error("delta.semantic_label", `${path}.semantic_label`, "semantic_label 必须是字符串或 null。");
    if (!isObject(item.confidence)) error("delta.confidence", `${path}.confidence`, "confidence 必须是对象。");
    else for (const key of ["visibility", "registration", "persistence", "operation", "ocr", "speech_alignment", "pedagogical_inference"]) {
      requireProbability(item.confidence[key], `${path}.confidence.${key}`);
    }
    const refs = validateEvidenceRefs(item.evidence_refs, `${path}.evidence_refs`, item.source_video_id, ["frame", "board_state"], item.surface_id);
    if (!refs.length) error("delta.evidence_empty", `${path}.evidence_refs`, "变化事件至少需要一条视觉证据。");
    validateStatus(item.status, `${path}.status`);
    requireStringList(item.uncertainty_codes, `${path}.uncertainty_codes`);

    const beforeObjects = before ? new Set(stringArray(before.object_ids)) : new Set<string>();
    const afterObjects = after ? new Set(stringArray(after.object_ids)) : new Set<string>();
    if (item.operation === "add") {
      affected.forEach((id, objectIndex) => {
        if (beforeObjects.has(id)) error("add.before_object", `${path}.affected_object_ids[${objectIndex}]`, "新增对象不得已存在于 before state。");
        if (!afterObjects.has(id)) error("add.after_object", `${path}.affected_object_ids[${objectIndex}]`, "新增对象必须存在于 after state。");
        const object = objectById.get(id);
        if (object && time && (typeof object.first_visible !== "number" || object.first_visible < time.start || object.first_visible > time.end)) {
          error("add.first_visible", `${path}.affected_object_ids[${objectIndex}]`, "新增对象的 first_visible 必须落在 delta 时间窗内。");
        }
      });
    }
    if (item.operation === "move") {
      affected.forEach((id, objectIndex) => {
        if (!beforeObjects.has(id) || !afterObjects.has(id)) error("move.object_persistence", `${path}.affected_object_ids[${objectIndex}]`, "移动对象必须同时存在于 before 与 after state。");
      });
      if (item.status === "accepted") error("move.unverifiable", `${path}.status`, "当前 state contract 不保存对象逐状态位置，move 只能 needs_review，不能直接 accepted。");
    }
    if (item.operation === "modify") {
      const hasBefore = affected.some((id) => beforeObjects.has(id));
      const hasAfter = affected.some((id) => afterObjects.has(id));
      const membershipChanged = affected.some((id) => beforeObjects.has(id) !== afterObjects.has(id));
      if (!hasBefore || !hasAfter || !membershipChanged) {
        error("modify.state_change", `${path}.affected_object_ids`, "modify 必须同时引用 before 旧对象和 after 新对象，并体现对象成员变化。");
      }
      affected.forEach((id, objectIndex) => {
        const object = objectById.get(id);
        if (!object || !time) return;
        if (beforeObjects.has(id) && !afterObjects.has(id)
          && (typeof object.last_visible !== "number" || object.last_visible < time.start || object.last_visible > time.end)) {
          error("modify.old_last_visible", `${path}.affected_object_ids[${objectIndex}]`, "被修改旧对象的 last_visible 必须落在 delta 时间窗内。");
        }
        if (!beforeObjects.has(id) && afterObjects.has(id)
          && (typeof object.first_visible !== "number" || object.first_visible < time.start || object.first_visible > time.end)) {
          error("modify.new_first_visible", `${path}.affected_object_ids[${objectIndex}]`, "修改后新对象的 first_visible 必须落在 delta 时间窗内。");
        }
      });
      if (!isObject(item.modification)) {
        error("modify.relation_missing", `${path}.modification`, "modify 必须显式记录 old/new 对象和稳定语义槽。");
      } else {
        requireStringList(item.modification.old_object_ids, `${path}.modification.old_object_ids`);
        requireStringList(item.modification.new_object_ids, `${path}.modification.new_object_ids`);
        requireString(item.modification.semantic_slot_id, `${path}.modification.semantic_slot_id`, "modify.semantic_slot_id");
        const oldIds = stringArray(item.modification.old_object_ids);
        const newIds = stringArray(item.modification.new_object_ids);
        if (!oldIds.length || !newIds.length) error("modify.relation_empty", `${path}.modification`, "modify 至少需要一个旧对象和一个新对象。");
        oldIds.forEach((id, relationIndex) => {
          if (!affected.includes(id) || !beforeObjects.has(id) || afterObjects.has(id)) {
            error("modify.old_object", `${path}.modification.old_object_ids[${relationIndex}]`, "old object 必须属于 affected、仅存在于 before state。");
          }
        });
        newIds.forEach((id, relationIndex) => {
          if (!affected.includes(id) || beforeObjects.has(id) || !afterObjects.has(id)) {
            error("modify.new_object", `${path}.modification.new_object_ids[${relationIndex}]`, "new object 必须属于 affected、仅存在于 after state。");
          }
        });
      }
    } else if (item.modification !== null) {
      error("delta.unexpected_modification", `${path}.modification`, "非 modify 事件的 modification 必须为 null。");
    }
    if (item.operation === "connect") {
      const createdConnector = affected.some((id) => !beforeObjects.has(id) && afterObjects.has(id));
      const persistentEndpoints = affected.filter((id) => beforeObjects.has(id) && afterObjects.has(id));
      if (!createdConnector || new Set(persistentEndpoints).size < 2) {
        error("connect.state_change", `${path}.affected_object_ids`, "connect 必须引用 after 新增的连接对象，并至少引用两个前后持续存在的端点对象。");
      }
      affected.forEach((id, objectIndex) => {
        const object = objectById.get(id);
        if (object && time && !beforeObjects.has(id) && afterObjects.has(id)
          && (typeof object.first_visible !== "number" || object.first_visible < time.start || object.first_visible > time.end)) {
          error("connect.first_visible", `${path}.affected_object_ids[${objectIndex}]`, "新增连接对象的 first_visible 必须落在 delta 时间窗内。");
        }
      });
      if (!isObject(item.relation)) {
        error("connect.relation_missing", `${path}.relation`, "connect 必须显式记录 source/target 锚点和关系类型。");
      } else {
        requireStringList(item.relation.source_object_ids, `${path}.relation.source_object_ids`);
        requireStringList(item.relation.target_object_ids, `${path}.relation.target_object_ids`);
        requireString(item.relation.relation_type, `${path}.relation.relation_type`, "connect.relation_type");
        const sourceIds = stringArray(item.relation.source_object_ids);
        const targetIds = stringArray(item.relation.target_object_ids);
        const allAnchors = [...sourceIds, ...targetIds];
        if (!sourceIds.length || !targetIds.length || new Set(allAnchors).size < 2) {
          error("connect.relation_anchors", `${path}.relation`, "connect 必须有非空且可区分的 source/target 锚点。");
        }
        allAnchors.forEach((id, relationIndex) => {
          if (!affected.includes(id) || !beforeObjects.has(id) || !afterObjects.has(id)) {
            error("connect.relation_object", `${path}.relation`, `关系锚点 ${relationIndex + 1} 必须属于 affected 且在 before/after 中持续存在。`);
          }
        });
      }
    } else if (item.relation !== null) {
      error("delta.unexpected_relation", `${path}.relation`, "非 connect 事件的 relation 必须为 null。");
    }
    if (item.operation === "erase") {
      if (!isObject(item.erase_evidence)) error("erase.evidence_missing", `${path}.erase_evidence`, "erase 必须提供持久缺失证据。");
      else {
        if (item.erase_evidence.visibility_restored !== true) error("erase.visibility", `${path}.erase_evidence.visibility_restored`, "遮挡解除且区域重新可见后才能确认擦除。");
        if (item.erase_evidence.absent_from_after_state !== true) error("erase.after_absence", `${path}.erase_evidence.absent_from_after_state`, "擦除对象必须在 after state 中持续缺失。");
        const confirmedUntil = item.erase_evidence.confirmed_until;
        if (typeof confirmedUntil !== "number" || !Number.isFinite(confirmedUntil)) error("erase.confirmed_until", `${path}.erase_evidence.confirmed_until`, "erase 需要有限的持续缺失确认时间。");
        else {
          validateTimestamp(confirmedUntil, `${path}.erase_evidence.confirmed_until`);
          const afterTime = after && isObject(after.stable_during) ? after.stable_during : null;
          if (afterTime && typeof afterTime.end === "number" && confirmedUntil < afterTime.end) {
            error("erase.persistence", `${path}.erase_evidence.confirmed_until`, "持续缺失确认必须覆盖 after state 稳定区间。");
          }
          const minimumStable = config.minimum_stable_seconds;
          if (time && typeof minimumStable === "number" && Number.isFinite(minimumStable) && confirmedUntil - time.end < minimumStable) {
            error("erase.minimum_stable", `${path}.erase_evidence.confirmed_until`, "擦除后的持续缺失时长不足 minimum_stable_seconds。");
          }
        }
        requireStringList(item.erase_evidence.supporting_frame_ids, `${path}.erase_evidence.supporting_frame_ids`);
        const supportFrames = stringArray(item.erase_evidence.supporting_frame_ids);
        if (!supportFrames.length) error("erase.support_empty", `${path}.erase_evidence.supporting_frame_ids`, "erase 至少需要一个后续可见帧支持。");
        supportFrames.forEach((id, frameIndex) => {
          if (!frameIds.has(id)) error("erase.frame_ref", `${path}.erase_evidence.supporting_frame_ids[${frameIndex}]`, "supporting frame 不存在。");
          const frame = frameById.get(id);
          if (frame && (frame.source_video_id !== item.source_video_id || frame.surface_id !== item.surface_id)) {
            error("erase.frame_scope", `${path}.erase_evidence.supporting_frame_ids[${frameIndex}]`, "持久缺失帧必须属于同一视频与板面。");
          }
          if (frame && time && (typeof frame.timestamp !== "number" || frame.timestamp < time.end)) {
            error("erase.frame_time", `${path}.erase_evidence.supporting_frame_ids[${frameIndex}]`, "持久缺失帧必须位于 erase 结束之后。");
          }
          if (frame && (typeof frame.visible_fraction !== "number" || frame.visible_fraction <= 0)) {
            error("erase.frame_visibility", `${path}.erase_evidence.supporting_frame_ids[${frameIndex}]`, "持久缺失帧必须提供重新可见的板面证据。");
          }
        });
        if (typeof item.erase_evidence.confirmed_until === "number" && Number.isFinite(item.erase_evidence.confirmed_until)) {
          const latestSupport = supportFrames.reduce((latest, id) => {
            const frame = frameById.get(id);
            return frame && typeof frame.timestamp === "number" && Number.isFinite(frame.timestamp)
              ? Math.max(latest, frame.timestamp)
              : latest;
          }, -Infinity);
          if (latestSupport < item.erase_evidence.confirmed_until) {
            error("erase.support_horizon", `${path}.erase_evidence.supporting_frame_ids`, "至少一条同板面支持帧必须达到 confirmed_until。");
          }
        }
      }
      affected.forEach((id, objectIndex) => {
        if (!beforeObjects.has(id)) error("erase.before_object", `${path}.affected_object_ids[${objectIndex}]`, "擦除对象必须存在于 before state。");
        if (afterObjects.has(id)) error("erase.after_object", `${path}.affected_object_ids[${objectIndex}]`, "擦除对象不得仍存在于 after state。");
        const object = objectById.get(id);
        const beforeTime = before && isObject(before.stable_during) ? before.stable_during : null;
        if (object && time && (typeof object.last_visible !== "number" || object.last_visible < time.start || object.last_visible > time.end)) {
          error("erase.last_visible", `${path}.affected_object_ids[${objectIndex}]`, "擦除对象的 last_visible 必须落在 delta 时间窗内。");
        }
        if (object && beforeTime && typeof beforeTime.end === "number" && typeof object.last_visible === "number" && object.last_visible < beforeTime.end) {
          error("erase.before_lifecycle", `${path}.affected_object_ids[${objectIndex}]`, "擦除对象必须至少持续可见到 before state 结束。");
        }
      });
    } else if (item.erase_evidence !== null) {
      error("delta.unexpected_erase_evidence", `${path}.erase_evidence`, "非 erase 事件的 erase_evidence 必须为 null。");
    }
    if (item.status === "accepted") {
      if (!["add", "erase", "modify", "connect"].includes(String(item.operation))) {
        error("delta.accepted_operation", `${path}.operation`, "accepted delta 仅允许 add / erase / modify / connect；move 与 unknown 必须留待复核。");
      }
      if (before?.status !== "accepted" || after?.status !== "accepted") {
        error("delta.accepted_state_status", path, "accepted delta 的 before/after state 必须均为 accepted。");
      }
      if (isObject(item.confidence)) {
        for (const key of ["visibility", "registration", "persistence", "operation"]) {
          if (typeof item.confidence[key] !== "number" || !Number.isFinite(item.confidence[key])) {
            error("delta.accepted_confidence", `${path}.confidence.${key}`, "accepted delta 必须提供有限的核心视觉置信度。");
          }
        }
      }
    }
  });

  const speechById = new Map<string, Record<string, unknown>>();
  let priorSpeechStart = -1;
  speech.forEach((item, index) => {
    const path = `$.speech[${index}]`;
    if (!isObject(item)) return error("speech.type", path, "SpeechSpan 必须是对象。");
    if (isNonEmptyString(item.speech_id)) speechById.set(item.speech_id, item);
    validateSource(item.source_video_id, `${path}.source_video_id`);
    const time = validateTime(item.time, `${path}.time`);
    if (time) {
      if (time.start < priorSpeechStart) error("speech.order", `${path}.time`, "speech 必须按开始时间升序排列。");
      priorSpeechStart = time.start;
    }
    requireString(item.raw_text, `${path}.raw_text`, "speech.raw_text");
    if (item.normalized_text !== null && typeof item.normalized_text !== "string") error("speech.normalized_text", `${path}.normalized_text`, "normalized_text 必须是字符串或 null。");
    if (!["none", "lexicon", "human"].includes(String(item.normalization))) error("speech.normalization", `${path}.normalization`, "normalization 不合法。");
    if (item.normalization === "none" && item.normalized_text !== null) error("speech.untracked_normalization", `${path}.normalized_text`, "未规范化时 normalized_text 必须为 null。");
    if (!Array.isArray(item.source_segment_indexes) || !item.source_segment_indexes.length
      || item.source_segment_indexes.some((value) => !Number.isInteger(value) || (value as number) < 0)) {
      error("speech.segment_indexes", `${path}.source_segment_indexes`, "speech 必须追溯到至少一个非负 ASR segment index。");
    }
  });

  const targetSets: Record<string, Set<string>> = { frame: frameIds, board_state: stateIds, board_delta: deltaIds, speech: speechIds };
  evidence.forEach((item, index) => {
    const path = `$.evidence[${index}]`;
    if (!isObject(item)) return error("evidence.type", path, "EvidenceRef 必须是对象。");
    validateSource(item.source_video_id, `${path}.source_video_id`);
    if (!Object.hasOwn(targetSets, String(item.kind))) error("evidence.kind", `${path}.kind`, "evidence kind 不合法。");
    requireString(item.target_id, `${path}.target_id`, "evidence.target_id");
    const targets = targetSets[String(item.kind)];
    if (targets && isNonEmptyString(item.target_id) && !targets.has(item.target_id)) error("evidence.target_ref", `${path}.target_id`, "evidence target 不存在或与 kind 不匹配。");
    const evidenceTime = validateTime(item.time, `${path}.time`);
    if (item.region !== undefined) validateRegion(item.region, `${path}.region`);
    validateAsset(item.asset, `${path}.asset`, false);
    if (!["observable", "teacher_stated", "inferred", "unknown"].includes(String(item.evidence_level))) error("evidence.level", `${path}.evidence_level`, "evidence level 不合法。");
    if (item.kind === "frame" && item.evidence_level !== "observable") error("evidence.frame_level", `${path}.evidence_level`, "原始帧证据必须标为 observable。");
    if (["board_state", "board_delta"].includes(String(item.kind)) && item.evidence_level !== "observable") {
      error("evidence.board_level", `${path}.evidence_level`, "板书状态与变化证据必须标为 observable。");
    }
    if (item.kind === "speech" && item.evidence_level !== "teacher_stated") {
      error("evidence.speech_level", `${path}.evidence_level`, "教师语音证据必须标为 teacher_stated。");
    }
    if (evidenceTime && isNonEmptyString(item.target_id)) {
      let targetStart: number | undefined;
      let targetEnd: number | undefined;
      if (item.kind === "frame") {
        const frame = frameById.get(item.target_id);
        if (frame && typeof frame.timestamp === "number") targetStart = targetEnd = frame.timestamp;
      } else if (item.kind === "board_state") {
        const state = stateById.get(item.target_id);
        if (state && isObject(state.stable_during)) {
          targetStart = typeof state.stable_during.start === "number" ? state.stable_during.start : undefined;
          targetEnd = typeof state.stable_during.end === "number" ? state.stable_during.end : undefined;
        }
      } else if (item.kind === "board_delta") {
        const delta = deltaById.get(item.target_id);
        if (delta && isObject(delta.time)) {
          targetStart = typeof delta.time.start === "number" ? delta.time.start : undefined;
          targetEnd = typeof delta.time.end === "number" ? delta.time.end : undefined;
        }
      } else if (item.kind === "speech") {
        const span = speechById.get(item.target_id);
        if (span && isObject(span.time)) {
          targetStart = typeof span.time.start === "number" ? span.time.start : undefined;
          targetEnd = typeof span.time.end === "number" ? span.time.end : undefined;
        }
      }
      if (targetStart !== undefined && targetEnd !== undefined && (evidenceTime.end < targetStart || evidenceTime.start > targetEnd)) {
        error("evidence.time_mismatch", `${path}.time`, "evidence 时间必须与目标 artifact 相交。");
      }
    }
  });

  learnerObservations.forEach((item, index) => {
    const path = `$.learner_observations[${index}]`;
    if (!isObject(item)) return error("learner_observation.type", path, "learner observation 必须是对象。");
    validateSource(item.source_video_id, `${path}.source_video_id`);
    validateTime(item.time, `${path}.time`);
    requireString(item.value, `${path}.value`);
    const refs = validateEvidenceRefs(item.evidence_refs, `${path}.evidence_refs`, item.source_video_id, ["frame", "speech"]);
    if (!refs.length) error("learner_observation.evidence_empty", `${path}.evidence_refs`, "学生观察必须有可审计证据。");
  });
  if (input.teacher_only_recording !== false && learnerObservations.length) {
    error("bundle.fabricated_learner", "$.learner_observations", "teacher-only 录课不得写入学生观察。");
  }

  const validateClaim = (value: unknown, path: string, ownerSource: unknown) => {
    if (!isObject(value)) return error("claim.type", path, "grounded claim 必须是对象。");
    if (value.value !== null && typeof value.value !== "string") error("claim.value", `${path}.value`, "claim value 必须是字符串或 null。");
    if (!["board", "teacher", "content", "learner_hypothesis", "learner_observed", "unknown"].includes(String(value.subject))) {
      error("claim.subject", `${path}.subject`, "claim subject 不合法。");
    }
    if (!["observable", "teacher_stated", "inferred", "unknown"].includes(String(value.level))) error("claim.level", `${path}.level`, "claim level 不合法。");
    requireProbability(value.confidence, `${path}.confidence`);
    const refs = validateEvidenceRefs(value.evidence_refs, `${path}.evidence_refs`, ownerSource);
    if (value.value !== null && value.level !== "unknown" && !refs.length) error("claim.evidence_empty", `${path}.evidence_refs`, "非 unknown claim 必须有证据。");
    if (value.value === null && value.level !== "unknown") error("claim.null_level", path, "null claim 必须标为 unknown。");
    if (value.level === "unknown" && value.value !== null) error("claim.unknown_value", `${path}.value`, "unknown claim 不得携带事实文本，value 必须为 null。");
    if (value.level === "unknown" && value.subject !== "unknown") error("claim.unknown_subject", `${path}.subject`, "unknown claim 的 subject 必须为 unknown。");
    if (value.subject === "learner_hypothesis" && value.level === "observable") {
      error("claim.hypothesis_observable", `${path}.level`, "假设性学生状态不得标为 observable。");
    }
    const supportingEvidence = refs.map((id) => evidenceById.get(id)).filter(Boolean);
    if (value.value !== null && value.level === "observable"
      && !supportingEvidence.some((ref) => ref?.evidence_level === "observable" && ["frame", "board_state", "board_delta"].includes(String(ref.kind)))) {
      error("claim.observable_support", `${path}.evidence_refs`, "observable claim 至少需要一条 observable 视觉证据。");
    }
    if (value.value !== null && value.level === "teacher_stated"
      && !supportingEvidence.some((ref) => ref?.kind === "speech" && ref?.evidence_level === "teacher_stated")) {
      error("claim.teacher_stated_support", `${path}.evidence_refs`, "teacher_stated claim 至少需要一条 teacher_stated speech 证据。");
    }
  };

  transitions.forEach((item, index) => {
    const path = `$.transitions[${index}]`;
    if (!isObject(item)) return error("transition.type", path, "BoardGroundedTransition 必须是对象。");
    validateSource(item.source_video_id, `${path}.source_video_id`);
    const transitionTime = validateTime(item.time, `${path}.time`);
    requireStringList(item.delta_ids, `${path}.delta_ids`);
    requireStringList(item.speech_ids, `${path}.speech_ids`);
    const transitionDeltaIds = stringArray(item.delta_ids);
    const transitionSpeechIds = stringArray(item.speech_ids);
    if (new Set(transitionDeltaIds).size !== transitionDeltaIds.length) error("transition.delta_duplicate", `${path}.delta_ids`, "delta_ids 不得重复。");
    if (new Set(transitionSpeechIds).size !== transitionSpeechIds.length) error("transition.speech_duplicate", `${path}.speech_ids`, "speech_ids 不得重复。");
    transitionDeltaIds.forEach((id, idIndex) => {
      const delta = deltaById.get(id);
      if (!delta) error("transition.delta_ref", `${path}.delta_ids[${idIndex}]`, "transition 引用的 delta 不存在。");
      else if (transitionTime && isObject(delta.time)
        && (typeof delta.time.start !== "number" || typeof delta.time.end !== "number"
          || delta.time.start < transitionTime.start || delta.time.end > transitionTime.end)) {
        error("transition.delta_time", `${path}.delta_ids[${idIndex}]`, "transition 时间窗必须覆盖引用的 delta。");
      }
    });
    transitionSpeechIds.forEach((id, idIndex) => {
      const span = speechById.get(id);
      if (!span) error("transition.speech_ref", `${path}.speech_ids[${idIndex}]`, "transition 引用的 speech 不存在。");
      else if (transitionTime && isObject(span.time)
        && (typeof span.time.start !== "number" || typeof span.time.end !== "number"
          || span.time.start < transitionTime.start || span.time.end > transitionTime.end)) {
        error("transition.speech_time", `${path}.speech_ids[${idIndex}]`, "transition 时间窗必须覆盖引用的 speech。");
      }
    });
    const transitionEvidenceRefs = validateEvidenceRefs(item.evidence_refs, `${path}.evidence_refs`, item.source_video_id);
    const claimSubjectRules: Record<string, string[]> = {
      trigger: ["content", "teacher", "learner_hypothesis", "unknown"],
      teaching_action: ["teacher", "unknown"],
      board_action: ["board", "unknown"],
      pedagogical_role: ["teacher", "unknown"],
      expected_learner_change: ["learner_hypothesis", "unknown"],
      learning_check: ["teacher", "unknown"],
      remediation: ["teacher", "unknown"],
    };
    for (const claimKey of ["trigger", "teaching_action", "board_action", "pedagogical_role", "expected_learner_change", "learning_check", "remediation"]) {
      validateClaim(item[claimKey], `${path}.${claimKey}`, item.source_video_id);
      if (isObject(item[claimKey]) && !claimSubjectRules[claimKey].includes(String(item[claimKey].subject))) {
        error("claim.subject_slot", `${path}.${claimKey}.subject`, `${claimKey} 的 subject 与字段语义不匹配。`);
      }
      if (input.teacher_only_recording !== false && isObject(item[claimKey]) && item[claimKey].subject === "learner_observed") {
        error("transition.fabricated_learner_claim", `${path}.${claimKey}.subject`, "teacher-only 录课不得通过通用 claim 槽写入实际学生观察。");
      }
    }
    if (isObject(item.pedagogical_role) && item.pedagogical_role.value !== null
      && !["definition", "progressive_scaffolding", "representation_switch", "comparison", "worked_example", "emphasis", "error_correction", "check", "other"].includes(String(item.pedagogical_role.value))) {
      error("transition.pedagogical_role", `${path}.pedagogical_role.value`, "pedagogical_role 不在冻结本体中。");
    }
    if (item.observed_learner_response !== null) {
      validateClaim(item.observed_learner_response, `${path}.observed_learner_response`, item.source_video_id);
      if (isObject(item.observed_learner_response) && item.observed_learner_response.subject !== "learner_observed") {
        error("transition.learner_response_subject", `${path}.observed_learner_response.subject`, "observed_learner_response 必须显式标为 learner_observed。");
      }
    }
    if (input.teacher_only_recording !== false && item.observed_learner_response !== null) {
      error("transition.fabricated_learner", `${path}.observed_learner_response`, "teacher-only 录课不得声称观察到学生反应。");
    }
    if (!Array.isArray(item.executable_board_moves)) error("transition.moves", `${path}.executable_board_moves`, "executable_board_moves 必须是数组。");
    else {
      const steps = new Set<number>();
      item.executable_board_moves.forEach((move, moveIndex) => {
        const movePath = `${path}.executable_board_moves[${moveIndex}]`;
        if (!isObject(move)) return error("transition.move_type", movePath, "board move 必须是对象。");
        if (!Number.isInteger(move.step) || (move.step as number) < 1 || steps.has(move.step as number)) error("transition.move_step", `${movePath}.step`, "move step 必须是唯一正整数。");
        else steps.add(move.step as number);
        if (!["introduce", "annotate", "connect", "contrast", "revise", "clear"].includes(String(move.operation))) error("transition.move_operation", `${movePath}.operation`, "执行板书动作不合法。");
        requireString(move.pedagogical_target, `${movePath}.pedagogical_target`);
        requireString(move.render_instruction, `${movePath}.render_instruction`);
        if (move.success_signal !== null && typeof move.success_signal !== "string") error("transition.move_success_signal", `${movePath}.success_signal`, "success_signal 必须是字符串或 null。");
        requireStringList(move.source_delta_ids, `${movePath}.source_delta_ids`);
        const moveDeltas = stringArray(move.source_delta_ids);
        if (!moveDeltas.length) error("transition.move_delta_empty", `${movePath}.source_delta_ids`, "可执行板书动作必须回溯到 delta。");
        moveDeltas.forEach((id, idIndex) => {
          if (!transitionDeltaIds.includes(id)) error("transition.move_delta_ref", `${movePath}.source_delta_ids[${idIndex}]`, "move 只能引用本 transition 的 delta。");
        });
      });
    }
    validateStatus(item.status, `${path}.status`);
    requireStringList(item.uncertainty_codes, `${path}.uncertainty_codes`);
    if (item.status === "accepted") {
      if (!transitionDeltaIds.length) error("transition.accepted_delta", `${path}.delta_ids`, "accepted transition 至少需要一个 delta。");
      if (!transitionSpeechIds.length) error("transition.accepted_speech", `${path}.speech_ids`, "accepted transition 至少需要一个同期 speech。");
      transitionDeltaIds.forEach((id, idIndex) => {
        if (deltaById.get(id)?.status !== "accepted") {
          error("transition.accepted_delta_status", `${path}.delta_ids[${idIndex}]`, "accepted transition 只能引用 accepted delta。");
        }
      });
      const acceptedEvidence = transitionEvidenceRefs.map((id) => evidenceById.get(id)).filter(Boolean);
      transitionDeltaIds.forEach((id) => {
        const deltaEvidence = acceptedEvidence.filter((ref) => ref?.kind === "board_delta" && ref.target_id === id);
        if (!deltaEvidence.length) {
          error("transition.accepted_delta_evidence", `${path}.evidence_refs`, `accepted transition 缺少 delta ${id} 的证据引用。`);
        } else {
          const delta = deltaById.get(id);
          const comparison = delta && isObject(delta.comparison_asset) ? delta.comparison_asset : null;
          if (!comparison || !deltaEvidence.some((ref) => isObject(ref?.asset)
            && ref.asset.asset_uri === comparison.asset_uri
            && ref.asset.sha256 === comparison.sha256)) {
            error("transition.accepted_delta_asset", `${path}.evidence_refs`, `delta ${id} 的 board_delta evidence asset 必须与 comparison_asset URI 和 SHA-256 完全一致。`);
          }
        }
      });
      transitionSpeechIds.forEach((id) => {
        if (!acceptedEvidence.some((ref) => ref?.kind === "speech" && ref.target_id === id)) {
          error("transition.accepted_speech_evidence", `${path}.evidence_refs`, `accepted transition 缺少 speech ${id} 的证据引用。`);
        }
      });
    }
  });

  return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}
