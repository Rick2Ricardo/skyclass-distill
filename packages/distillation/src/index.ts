import type { ImageInput, LlmClient } from "../../llm/src/client.js";
import type { Transcript } from "../../media/src/transcribe.js";

export * from "./oraclePilot.js";
export * from "./oracleGateRunner.js";
export * from "./oracleFormalPreflight.js";
export * from "./oracleBytePreflight.js";
export * from "./oracleTrustedPreflight.js";
export * from "./groundedSkills.js";

export interface LessonInput {
  title: string;
  subject: string;
  transcript: Transcript;
  frames?: Array<{ frame_id: string; timestamp: number; path: string }>;
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remain = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function transcriptText(transcript: Transcript): string {
  return transcript.segments.map((item) => `[${clock(item.start)}] ${item.text}`).join("\n");
}

function chunks(value: string, limit = 26_000): string[] {
  const lines = value.split("\n");
  const result: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > limit && current) { result.push(current); current = ""; }
    current += `${line}\n`;
  }
  if (current.trim()) result.push(current);
  return result.length ? result : [value.slice(0, limit)];
}

const ANALYSIS_SYSTEM = `你是一名严谨的课堂教研分析员。只根据逐字稿和本轮真实提供的关键帧提取事实，不补写课堂中没有发生的内容。网课只有老师时，不得声称观察到学生反应、理解或学习增益；只能记录教师明确预判的困难，或把学习变化标为待验证假设。重点恢复教师动作、表征变化、检查设计和证据。输出严格 JSON。`;

function analysisUser(input: LessonInput, transcript: string): string {
  const frameIndex = (input.frames ?? []).map((frame) => `${frame.frame_id} @ ${clock(frame.timestamp)}`).join("；") || "无";
  return `分析课程《${input.title}》（${input.subject}）的这段课堂证据。\n\n输出：\n{\n  "lesson_title":"...",\n  "knowledge_focus":["..."],\n  "anticipated_difficulties":[{"value":"教师明确预判的困难；没有就不写","evidence_level":"teacher_stated|inferred","evidence":[{"timestamp":"MM:SS","quote":"不超过30字"}]}],\n  "teaching_transitions":[{\n    "trigger":"内容条件或教师预判；不能伪装成观察到的学生状态",\n    "teaching_action":"教师实际做了什么",\n    "representation":"语言、图、公式、板书或实验",\n    "anticipated_learner_change":{"value":"未来待验证的变化或null","evidence_level":"inferred|unknown"},\n    "learning_check":"教师实际使用的检查；没有证据写null",\n    "remediation":"教师实际使用的补救；没有证据写null",\n    "evidence":[{"timestamp":"MM:SS","quote":"不超过30字","frame_id":"可选"}]\n  }],\n  "visual_evidence":[{"frame_id":"必须来自输入索引","observation":"画面直接可见事实","supports":"支持哪一动作"}],\n  "uncertainties":["..."]\n}\n\n严禁输出 observed_student_response、expected_student_response、learner_observation 或 student_outcome。\n\n关键帧索引：${frameIndex}\n\n逐字稿：\n${transcript}`;
}

const REDUCE_SYSTEM = "合并同一节课的分段教研分析，去重、保留原时间戳和 frame_id，不发明证据。输出沿用输入字段的严格 JSON。";

export async function analyzeLesson(client: LlmClient, input: LessonInput): Promise<Record<string, unknown>> {
  const parts = chunks(transcriptText(input.transcript));
  const analyses: Record<string, unknown>[] = [];
  const images: ImageInput[] = (input.frames ?? []).slice(0, 4).map((frame) => ({ label: frame.frame_id, path: frame.path }));
  for (let index = 0; index < parts.length; index += 1) {
    analyses.push(await client.chatJson(ANALYSIS_SYSTEM, analysisUser(input, parts[index]), index === 0 ? images : []));
  }
  if (analyses.length === 1) return analyses[0];
  return client.chatJson(REDUCE_SYSTEM, `课程：${input.title}\n分段分析：\n${JSON.stringify(analyses)}`);
}

const DISTILL_SYSTEM = `你是一名资深教研员。把真实课堂中的教学状态转换蒸馏为少而精的可执行 Teaching Skills。Skill 不是知识摘要或教师风格模仿。必须严格区分课堂实际发生的教师动作、基于证据的意图假设，以及为未来使用设计的回应/检查/补救。网课没有学生时，绝不能把预期回应写成课堂中观察到的事实。输出严格 JSON。`;

function distillUser(subject: string, analyses: Array<{ title: string; analysis: Record<string, unknown> }>, mode: "single" | "common"): string {
  const countRule = mode === "single" ? "输出 1–3 个本课可迁移能力" : "输出 3–5 个至少由两节不同课程支持的共性能力";
  return `${countRule}。学科：${subject}\n\n输出：\n{\n  "suite_name":"AnyTeacher 教学能力",\n  "methodology":"证据筛选原则",\n  "capabilities":[{\n    "key":"英文小写连字符",\n    "name":"中文能力名",\n    "summary":"这种教学策略怎样帮助学习",\n    "teaching_goal":"学生最终能做什么",\n    "use_when":["可观察触发条件"],\n    "prerequisites":["前置条件"],\n    "lesson_flow":[{\n      "phase":"步骤",\n      "teacher_action":"教师具体动作",\n      "suggested_language":"直接对学生说的话",\n      "expected_student_response":"未来执行时用于判断的可观察回应假设；不是原课堂事实",\n      "if_student_struggles":"未来执行时的补救设计"\n    }],\n    "assessment_checkpoints":[{\n      "check":"检查任务",\n      "success_signal":"达标信号",\n      "next_move_if_not":"未达标下一步"\n    }],\n    "adaptations":[{"learner_signal":"未来运行时观察到的信号","adjustment":"调整"}],\n    "abstain_when":["不适用条件"],\n    "quality_checks":["质量标准"],\n    "failure_modes":["失败模式与纠偏"],\n    "evidence":[{"lesson":"课程名","timestamp":"MM:SS","quote":"不超过30字","supports":"支持的动作","frame_id":"可选"}],\n    "supporting_lessons":1,\n    "confidence":0.0\n  }],\n  "limitations":["..."]\n}\n\n要求：lesson_flow 为 3–5 步；必须包含学习检查、补救和 abstain_when；建议话术不能冒充原课引用；课程知识本身不能作为能力；不得输出 observed_student_response、learner_observation 或声称原课堂学生已经掌握。\n\n课程分析：\n${JSON.stringify(analyses)}`;
}

export async function distillSkills(client: LlmClient, subject: string, lessons: Array<{ title: string; analysis: Record<string, unknown> }>, mode: "single" | "common"): Promise<Record<string, unknown>> {
  return client.chatJson(DISTILL_SYSTEM, distillUser(subject, lessons, mode));
}

export function attachFramePaths(
  suite: Record<string, unknown>,
  lessons: Array<{ title: string; frames: Array<{ frame_id: string; timestamp: number; path: string }>; videoId: string }>,
): Record<string, unknown> {
  const capabilities = Array.isArray(suite.capabilities) ? suite.capabilities : [];
  const normalized = capabilities.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const capability = { ...(raw as Record<string, unknown>) };
    capability.evidence = (Array.isArray(capability.evidence) ? capability.evidence : []).map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const evidence = { ...(entry as Record<string, unknown>) };
      const lesson = lessons.find((item) => item.title === evidence.lesson);
      const frame = lesson?.frames.find((item) => item.frame_id === evidence.frame_id);
      if (frame) {
        evidence.frame_path = frame.path;
        evidence.frame_timestamp = clock(frame.timestamp);
        evidence.source_video_id = lesson?.videoId;
      }
      return evidence;
    });
    return capability;
  });
  return { ...suite, capabilities: normalized };
}
