export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export type Modality = "text" | "multimodal";
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
  modalities?: string[];
  visual_asset_count?: number;
  has_executable_asset?: boolean;
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
  studio: "anyteacher";
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
  tool_call_count: number;
  fallback_occurred: boolean;
  fallback_reason: string;
  multimodal_valid?: boolean;
  include_in_primary_result?: boolean;
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

export interface TutorResult {
  project_id: string;
  question: string;
  mode: TutorMode;
  modality: Modality;
  answer: TutorAnswer;
  selected_skills: Skill[];
  execution_audit: DeliveryAudit;
}

export interface ExperimentRun {
  id: string;
  project_id: string;
  question: string;
  created_at: string;
  modes: TutorMode[];
  results: Partial<Record<TutorMode, TutorResult>>;
  errors: Partial<Record<TutorMode, string>>;
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
