import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
  DeliveryAudit,
  ExperimentRun,
  JsonObject,
  Modality,
  Project,
  Skill,
  TutorMode,
  TutorResult,
  TutorRuntimeEvent,
} from "../../../../packages/contracts/src/index.js";
import { splitLearningCheck } from "../../../../packages/contracts/src/index.js";
import { runPiAgent, type PiSkill } from "../../../../packages/pi-runtime/src/index.js";
import type { SettingsStore } from "../../../../packages/runtime-config/src/settings.js";
import type { JobStore } from "../../../../packages/store/src/jobStore.js";
import type { LibraryStore } from "../../../../packages/store/src/libraryStore.js";
import { DATA_DIR } from "../config.js";

function isInside(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate));
  return path === "" || (!path.startsWith("..") && !path.startsWith(`/`) && !path.startsWith(`\\`));
}

function parseMode(value: unknown): { mode: TutorMode; modality: Modality; skills: boolean } {
  const mode = value === "base" || value === "text_skill" || value === "multimodal_skill"
    ? value
    : "multimodal_skill";
  return {
    mode,
    modality: mode === "multimodal_skill" ? "multimodal" : "text",
    skills: mode !== "base",
  };
}

async function safeSkillManifest(skill: Skill): Promise<{ manifest: Record<string, unknown>; folder: string } | null> {
  if (!skill.path) return null;
  try {
    const [dataRoot, folder] = await Promise.all([realpath(DATA_DIR), realpath(resolve(skill.path))]);
    if (!isInside(dataRoot, folder)) return null;
    const manifestPath = await realpath(join(folder, "manifest.json"));
    if (!isInside(folder, manifestPath)) return null;
    return { manifest: JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>, folder };
  } catch {
    return null;
  }
}

async function compactSkill(skill: Skill): Promise<PiSkill> {
  const safe = await safeSkillManifest(skill);
  const manifest = safe?.manifest;
  const capability = manifest?.capability && typeof manifest.capability === "object"
    ? manifest.capability as Record<string, unknown>
    : {};
  return {
    key: `${skill.job_id ?? "skill"}:${skill.name}`,
    name: skill.display_name ?? skill.name,
    summary: String(capability.summary ?? skill.summary ?? ""),
    teaching_goal: String(capability.teaching_goal ?? ""),
    modalities: Array.isArray(manifest?.modalities) ? manifest.modalities.map(String) : skill.modalities ?? ["text"],
    lesson_flow: Array.isArray(capability.lesson_flow)
      ? capability.lesson_flow
      : Array.isArray(capability.procedure) ? capability.procedure : [],
    assessment_checkpoints: Array.isArray(capability.assessment_checkpoints) ? capability.assessment_checkpoints : [],
    evidence: Array.isArray(capability.evidence) ? capability.evidence : [],
  };
}

async function visualInputs(skills: Skill[]): Promise<Array<{ label: string; path: string; root: string }>> {
  const images: Array<{ label: string; path: string; root: string }> = [];
  for (const skill of skills) {
    const safe = await safeSkillManifest(skill);
    const manifest = safe?.manifest;
    const capability = manifest?.capability && typeof manifest.capability === "object"
      ? manifest.capability as Record<string, unknown>
      : {};
    const evidence = Array.isArray(capability.evidence) ? capability.evidence : [];
    for (const rawItem of evidence) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;
      const relativeAsset = typeof item.visual_asset === "string" ? item.visual_asset : "";
      if (!relativeAsset || !safe) continue;
      const path = await realpath(resolve(safe.folder, relativeAsset)).catch(() => "");
      if (path && isInside(safe.folder, path)) images.push({
        label: `${skill.name} · ${String(item.frame_id ?? "evidence")}`,
        path,
        root: safe.folder,
      });
      if (images.length >= 4) return images;
    }
  }
  return images;
}

function normalizeDelivery(
  requested: Modality,
  actual: Modality,
  candidateVisualCount: number,
  inspectedVisualCount: number,
  toolCallCount: number,
  fallbackReason = "",
): DeliveryAudit {
  const actualVisual = actual === "multimodal" ? inspectedVisualCount : 0;
  return {
    requested,
    actual,
    actual_visual_count: actualVisual,
    attempted_visual_count: candidateVisualCount,
    tool_call_count: toolCallCount,
    fallback_occurred: Boolean(fallbackReason),
    fallback_reason: fallbackReason,
    multimodal_valid: requested !== "multimodal" || (actual === "multimodal" && actualVisual > 0 && !fallbackReason),
    include_in_primary_result: requested !== "multimodal" || (actual === "multimodal" && actualVisual > 0 && !fallbackReason),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function conversationHistory(value: unknown): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) return [];
  return value.slice(-200).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const question = String(record.question ?? "").trim().slice(0, 20_000);
    const answer = String(record.answer ?? "").trim().slice(0, 40_000);
    return question && answer ? [{ question, answer }] : [];
  });
}

export class TutorService {
  constructor(
    private readonly library: LibraryStore,
    private readonly jobs: JobStore,
    private readonly settings: SettingsStore,
  ) {}

  async listSkills(projectId: string): Promise<Skill[]> {
    await this.library.getProject(projectId);
    const result: Skill[] = [];
    for (const job of await this.jobs.list()) {
      if (job.project_id !== projectId || job.kind !== "distill" || job.status !== "completed") continue;
      const skills = Array.isArray(job.artifacts?.skills) ? job.artifacts.skills : [];
      for (const raw of skills) {
        if (!raw || typeof raw !== "object") continue;
        const skill = raw as unknown as Skill;
        if (await this.library.skillDeleted(job.id, skill.name)) continue;
        result.push({
          ...skill,
          job_id: job.id,
          distill_mode: job.distill_mode ?? undefined,
          distill_modality: job.distill_modality ?? "text",
          generate_executable_assets: job.generate_executable_assets,
          video_ids: job.video_ids ?? [],
          created_at: job.updated_at,
        });
      }
    }
    return result;
  }

  async answer(
    projectId: string,
    body: Record<string, unknown>,
    runOptions: { signal?: AbortSignal; onEvent?: (event: TutorRuntimeEvent) => void | Promise<void> } = {},
  ): Promise<TutorResult> {
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (question.length < 4) throw new Error("请输入至少 4 个字符的问题");

    const parsed = parseMode(body.mode);
    const [project, allSkills] = await Promise.all([
      this.library.getProject(projectId),
      this.listSkills(projectId),
    ]);
    const skills = parsed.skills ? allSkills.filter((item) => item.valid !== false).slice(0, 3) : [];
    const images = parsed.modality === "multimodal" ? await visualInputs(skills) : [];
    const settings = await this.settings.private();
    if (!settings.llm_base_url || !settings.llm_api_key || !settings.llm_model) {
      throw new Error("尚未配置模型 API，请先在设置中完成配置");
    }

    const agentRun = await runPiAgent({
      baseUrl: settings.llm_base_url,
      apiKey: settings.llm_api_key,
      modelId: settings.llm_model,
      question,
      subject: project.subject,
      skills: await Promise.all(skills.map(compactSkill)),
      images,
      history: conversationHistory(body.history),
      sessionId: typeof body.conversation_id === "string" ? body.conversation_id : undefined,
      timeoutMs: Math.max(1, Number(settings.llm_timeout_seconds ?? 120)) * 1000,
      maxRetries: Math.max(0, Number(settings.llm_max_attempts ?? 2) - 1),
      signal: runOptions.signal,
      onEvent: runOptions.onEvent,
    });
    const raw = agentRun.answer as JsonObject;
    const answerText = typeof raw.answer === "string" ? raw.answer : "模型没有返回可显示的回答。";
    const parsedChecks = stringArray(raw.learning_checks).map(splitLearningCheck).filter((item) => item.prompt);
    const learningChecks = parsedChecks.map((item) => item.prompt);
    const explicitCriteria = stringArray(raw.success_criteria);
    const successCriteria = explicitCriteria.length
      ? explicitCriteria
      : parsedChecks.map((item) => item.successCriterion).filter(Boolean);
    const fallbackReason = parsed.modality === "multimodal"
      ? !images.length
        ? "当前 Skill 没有可读取的视觉证据"
        : !agentRun.visualCount ? "Pi Agent 没有实际读取视觉证据" : ""
      : "";
    const actual: Modality = agentRun.visualCount > 0 ? "multimodal" : "text";
    const delivery = normalizeDelivery(
      parsed.modality,
      actual,
      agentRun.attemptedVisualCount,
      agentRun.visualCount,
      agentRun.toolCallCount,
      fallbackReason,
    );
    Object.assign(delivery, {
      candidate_skill_count: skills.length,
      candidate_visual_count: agentRun.candidateVisualCount,
      used_skill_count: agentRun.usedSkillKeys.length,
      used_skill_keys: agentRun.usedSkillKeys,
      stop_reason: agentRun.stopReason,
      model: settings.llm_model,
      provider: "anyteacher-relay",
      duration_ms: agentRun.durationMs,
      input_tokens: agentRun.usage.input,
      output_tokens: agentRun.usage.output,
      cache_read_tokens: agentRun.usage.cacheRead,
      cache_write_tokens: agentRun.usage.cacheWrite,
    } satisfies Partial<DeliveryAudit>);

    return {
      project_id: projectId,
      question,
      mode: parsed.mode,
      modality: parsed.modality,
      answer: {
        answer: answerText,
        assumptions: stringArray(raw.assumptions),
        learning_check: { prompts: learningChecks, success_criteria: successCriteria },
        student_response: "",
        assessment: { status: "pending", feedback: "", evidence: [] },
        next_action: {
          type: "await_student_response",
          instruction: learningChecks[0] ?? "",
          reason: "",
        },
        delivery: { ...delivery, engine: "pi-agent" },
      },
      selected_skills: skills,
      execution_audit: delivery,
      tool_trace: agentRun.toolCalls,
      artifacts: agentRun.artifacts,
    };
  }

  async compare(projectId: string, question: string, modes?: TutorMode[]): Promise<ExperimentRun> {
    const selectedModes: TutorMode[] = modes?.length ? modes : ["base", "text_skill", "multimodal_skill"];
    const settled = await Promise.allSettled(
      selectedModes.map((mode) => this.answer(projectId, { question, mode })),
    );
    const results: ExperimentRun["results"] = {};
    const errors: ExperimentRun["errors"] = {};
    settled.forEach((result, index) => {
      const mode = selectedModes[index];
      if (result.status === "fulfilled") results[mode] = result.value;
      else errors[mode] = result.reason instanceof Error ? result.reason.message : String(result.reason);
    });
    return {
      id: randomUUID(),
      project_id: projectId,
      question,
      created_at: new Date().toISOString(),
      modes: selectedModes,
      results,
      errors,
    };
  }
}
