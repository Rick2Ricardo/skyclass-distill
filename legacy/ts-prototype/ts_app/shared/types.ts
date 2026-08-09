export type Modality = "text" | "multimodal";
export type TutorMode = "base" | "text_skill" | "multimodal_skill";
export type JsonObject = Record<string, any>;

export interface Project {
  id: string;
  name: string;
  subject: string;
  grade: string;
  description?: string;
  video_count?: number;
  skill_count?: number;
  updated_at?: string;
}

export interface Skill {
  name: string;
  display_name?: string;
  summary?: string;
  path?: string;
  valid?: boolean;
  distill_modality?: Modality;
  modalities?: string[];
  visual_asset_count?: number;
  has_executable_asset?: boolean;
  job_id?: string;
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

export interface Health {
  ok: boolean;
  ts_runtime: boolean;
  python_worker: boolean;
  pi_agent: boolean;
  model?: string;
}
