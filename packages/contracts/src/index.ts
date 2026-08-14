export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export * from "./board2skill.js";
export * from "./gold-review.js";
export * from "./gold-independent-review-quality.js";
export * from "./oracle-gate-bytes.js";
export * from "./oracle-gate-composition.js";
export * from "./oracle-gate-input-token-count.js";
export * from "./oracle-gate-blind-rating.js";
export * from "./oracle-gate-public-evidence-v2.js";
export * from "./oracle-gate-preregistration-v2.js";
export * from "./oracle-gate-execution-v2.js";
export * from "./oracle-gate-execution-records-v2.js";
export * from "./oracle-gate-formal.js";
export * from "./oracle-gate-frame-derivation.js";
export * from "./oracle-gate-response.js";
export * from "./oracle-gate-request.js";
export * from "./oracle-gate-provider-request.js";
export * from "./oracle-gate-pi-response-stream.js";
export * from "./oracle-gate-pi-fetch-boundary-proof.js";
export * from "./oracle-gate-invalid-response.js";
export * from "./oracle-gate-user-prompt.js";
export * from "./oracle-gate-run.js";
export * from "./oracle-gate-trusted.js";
export * from "./oracle-gate-transport-authority.js";
export * from "./oracle-gate-transport-capture.js";
export * from "./signed-gold.js";
export * from "./skill-distillation.js";
export * from "./temporal-board.js";

export type Modality = "text" | "multimodal";
export type EvidenceMode = "text" | "static_frames" | "temporal_board";
export type TutorMode = "base" | "text_skill" | "multimodal_skill";
export type DistillMode = "single" | "common";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Project {
  id: string;
  name: string;
  subject: string;
  grade: string;
  description?: string;
  video_count?: number;
  skill_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface VideoAsset {
  id: string;
  project_id: string;
  title: string;
  source_url: string;
  source?: string;
  duration?: number | null;
  cover_url?: string | null;
  status: "ready" | "failed";
  job_id: string;
  course_item_id: string;
  artifacts?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

export interface CourseItem {
  id: string;
  source_url: string;
  title: string;
  index: number;
  duration?: number | null;
  cover_url?: string | null;
  source: string;
  metadata: Record<string, unknown>;
}

export interface Skill {
  name: string;
  display_name?: string;
  summary?: string;
  path?: string;
  valid?: boolean;
  errors?: string[];
  distill_mode?: DistillMode;
  distill_modality?: Modality;
  distill_evidence_mode?: EvidenceMode;
  modalities?: string[];
  visual_asset_count?: number;
  has_executable_asset?: boolean;
  board_action_count?: number;
  render_targets?: string[];
  generate_executable_assets?: boolean;
  job_id?: string;
  video_ids?: string[];
  created_at?: string;
}

export interface SkillDetail {
  name: string;
  display_name: string;
  valid: boolean;
  errors: string[];
  documents: Record<string, string>;
}

export interface JobEvent {
  time: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

export interface JobState {
  id: string;
  status: JobStatus;
  stage: string;
  progress: number;
  kind: "legacy" | "ingest" | "distill" | "qa";
  project_id?: string | null;
  video_ids?: string[];
  events: JobEvent[];
  error?: string | null;
  created_at: string;
  updated_at: string;
  artifacts?: Record<string, unknown>;
  request?: Record<string, unknown>;
  items?: CourseItem[];
  current_item?: number;
  distill_mode?: DistillMode | null;
  distill_modality?: Modality;
  evidence_mode?: EvidenceMode;
  board_bundle_uri?: string;
  board_bundle_schema_version?: string;
  generate_executable_assets?: boolean;
  qa_mode?: "qa" | "ab" | null;
  qa_question?: string | null;
  qa_skill_modality?: Modality;
  qa_max_skills?: number;
  qa_parent_id?: string | null;
  qa_student_response?: string | null;
}

export interface RuntimeSettings {
  llm_base_url?: string;
  llm_api_key_hint?: string;
  llm_model?: string;
  llm_timeout_seconds?: number;
  llm_max_attempts?: number;
  whisper_model?: string;
  whisper_command?: string;
  whisper_model_path?: string;
  max_upload_size_mb?: number;
}

export interface Health {
  ok: boolean;
  studio: "skyclass";
  backend: "node";
  ts_runtime: boolean;
  media_ready: boolean;
  media_runtime: {
    ffmpeg: boolean;
    ffprobe: boolean;
    yt_dlp: boolean;
    whisper_cpp: boolean;
  };
  api_configured: boolean;
  pi_agent: boolean;
  model?: string;
}

export interface DeliveryAudit {
  requested: Modality | string;
  actual: Modality | "local" | string;
  actual_visual_count: number;
  attempted_visual_count: number;
  candidate_visual_count?: number;
  tool_call_count: number;
  fallback_occurred: boolean;
  fallback_reason: string;
  multimodal_valid?: boolean;
  include_in_primary_result?: boolean;
  candidate_skill_count?: number;
  used_skill_count?: number;
  used_skill_keys?: string[];
  stop_reason?: string;
  model?: string;
  provider?: string;
  duration_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}

export interface TutorAnswer {
  answer: string;
  assumptions: string[];
  learning_check: { prompts: string[]; success_criteria: string[] };
  student_response: string;
  assessment: { status: string; feedback: string; evidence: string[] };
  next_action: { type: string; instruction: string; reason: string };
  delivery: DeliveryAudit & { engine?: string };
  student_visible_sha256?: string;
}

export { splitLearningCheck, studentVisibleAnswer } from "./studentContent.js";

export type TeachingArtifactKind = "concept_map" | "process" | "force" | "coordinate" | "trajectory";

export interface TeachingArtifact {
  id: string;
  type: "diagram";
  kind: TeachingArtifactKind;
  title: string;
  summary: string;
  svg: string;
  created_at: string;
}

export interface TutorToolTrace {
  id: string;
  tool: string;
  label: string;
  ok: boolean;
  summary: string;
  artifact_id?: string;
  skill_key?: string;
  evidence_ids?: string[];
  started_at?: string;
  ended_at?: string;
  duration_ms?: number;
  args_summary?: string;
}

export type TutorAgentEventType =
  | "agent_start"
  | "agent_end"
  | "turn_start"
  | "turn_end"
  | "message_start"
  | "message_update"
  | "message_end"
  | "tool_execution_start"
  | "tool_execution_update"
  | "tool_execution_end";

export interface TutorRuntimeEvent {
  type: TutorAgentEventType;
  timestamp: string;
  message_role?: string;
  tool_call_id?: string;
  tool_name?: string;
  is_error?: boolean;
  trace?: TutorToolTrace;
  artifact?: TeachingArtifact;
}

export interface TutorResult {
  project_id: string;
  question: string;
  mode: TutorMode;
  modality: Modality;
  answer: TutorAnswer;
  selected_skills: Skill[];
  execution_audit: DeliveryAudit;
  tool_trace: TutorToolTrace[];
  artifacts: TeachingArtifact[];
}

export interface TutorTurn {
  id: string;
  created_at: string;
  question: string;
  mode: TutorMode;
  result: TutorResult;
}

export interface TutorConversation {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  turns: TutorTurn[];
}

export interface TutorConversationSummary {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  turn_count: number;
  artifact_count: number;
  last_question?: string;
}

export type TutorStreamEvent =
  | { type: "runtime"; seq: number; run_id: string; conversation_id: string; event: TutorRuntimeEvent }
  | { type: "complete"; seq: number; run_id: string; conversation_id: string; conversation: TutorConversation }
  | { type: "error"; seq: number; run_id: string; conversation_id: string; detail: string };

export interface ExperimentRun {
  id: string;
  project_id: string;
  question: string;
  created_at: string;
  benchmark_id?: string;
  scenario_id?: string;
  modes: TutorMode[];
  results: Partial<Record<TutorMode, TutorResult>>;
  errors: Partial<Record<TutorMode, string>>;
}

export interface BenchmarkScenario {
  id: string;
  unit: string;
  difficulty: "basic" | "intermediate" | "advanced" | string;
  visual_required: boolean;
  error_type: string;
  question: string;
}

export interface BenchmarkDataset {
  benchmark_id: string;
  version: number;
  subject: string;
  language: string;
  scenario_count: number;
  scenarios: BenchmarkScenario[];
}

export interface ExperimentSummary {
  id: string;
  project_id: string;
  benchmark_id?: string;
  question?: string;
  created_at?: string;
  scenario_count: number;
  modes: TutorMode[];
  status: "completed" | "partial" | "failed";
  source: "quick" | "benchmark";
}

export interface QaHistoryItem {
  id: string;
  status: JobStatus;
  stage: string;
  question?: string;
  mode?: "qa" | "ab";
  skill_modality?: Modality;
  created_at: string;
  updated_at: string;
  result?: unknown;
  error?: string | null;
}
