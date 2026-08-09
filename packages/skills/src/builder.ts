import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { Skill } from "../../contracts/src/index.js";
import { writeJson } from "../../store/src/fileStore.js";

function slug(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  return (normalized || fallback).slice(0, 63).replace(/-$/, "");
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function lines(value: unknown, fallback: string): string {
  const values = array(value).map(String).filter(Boolean);
  return (values.length ? values : [fallback]).map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function flow(value: unknown): string {
  return array(value).map((raw, index) => {
    const step = raw && typeof raw === "object" ? raw as Record<string, unknown> : { teacher_action: String(raw) };
    return `### ${index + 1}. ${String(step.phase ?? `第 ${index + 1} 步`)}\n\n- **老师做**：${String(step.teacher_action ?? "推进一个可观察的教学动作。")}\n- **可以这样说**：${String(step.suggested_language ?? "用一个短问题推进学生思考。")}\n- **期待学生表现**：${String(step.expected_student_response ?? "学生用语言、图示、公式或操作呈现理解。")}\n- **学生卡住时**：${String(step.if_student_struggles ?? "降低一步难度并补充支架。")}\n`;
  }).join("\n") || "1. 先诊断学生当前状态。\n2. 执行一个教学动作。\n3. 使用学习检查并按结果补救。";
}

function checkpoints(value: unknown): string {
  return array(value).map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : { check: String(raw) };
    return `${index + 1}. **检查**：${String(item.check ?? "让学生完成一个小任务")}  \n   **达标信号**：${String(item.success_signal ?? "学生能独立完成并说明理由")}  \n   **未达标下一步**：${String(item.next_move_if_not ?? "回到前一步补充支架")}`;
  }).join("\n") || "1. 让学生独立回答一个变式问题；未达标时回到上一表征。";
}

function adaptations(value: unknown): string {
  return array(value).map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : { adjustment: String(raw) };
    return `${index + 1}. 看到“${String(item.learner_signal ?? "学生表现")}”时：${String(item.adjustment ?? "调整支架")}`;
  }).join("\n") || "1. 基础薄弱时减少同时处理的变量。\n2. 已经掌握时撤去支架并要求迁移。";
}

async function packageEvidence(folder: string, evidenceValue: unknown): Promise<Array<Record<string, unknown>>> {
  const result: Array<Record<string, unknown>> = [];
  let index = 0;
  for (const raw of array(evidenceValue).slice(0, 16)) {
    if (!raw || typeof raw !== "object") continue;
    const evidence = { ...(raw as Record<string, unknown>) };
    const source = typeof evidence.frame_path === "string" ? evidence.frame_path : "";
    delete evidence.frame_path;
    if (source) {
      index += 1;
      const extension = extname(source).toLowerCase() || ".jpg";
      const target = join(folder, "assets", "visual", `${String(index).padStart(2, "0")}-${slug(evidence.source_video_id, "video")}-${slug(evidence.frame_id, "frame")}${extension}`);
      await mkdir(join(folder, "assets", "visual"), { recursive: true });
      await copyFile(source, target);
      evidence.visual_asset = target.slice(folder.length + 1).split("\\").join("/");
    }
    result.push(evidence);
  }
  return result;
}

export async function buildSkillSuite(input: {
  suite: Record<string, unknown>;
  outputRoot: string;
  subject: string;
  provenance: Record<string, unknown>;
}): Promise<Skill[]> {
  await mkdir(input.outputRoot, { recursive: true });
  const built: Skill[] = [];
  const capabilities = array(input.suite.capabilities);
  for (let index = 0; index < capabilities.length; index += 1) {
    const raw = capabilities[index];
    if (!raw || typeof raw !== "object") continue;
    const capability = { ...(raw as Record<string, unknown>) };
    const skillName = slug(`physics-${String(capability.key ?? "")}`, `physics-teaching-capability-${index + 1}`);
    const folder = join(input.outputRoot, skillName);
    await rm(folder, { recursive: true, force: true });
    await Promise.all([mkdir(join(folder, "agents"), { recursive: true }), mkdir(join(folder, "references"), { recursive: true })]);
    capability.evidence = await packageEvidence(folder, capability.evidence);
    const displayName = String(capability.name ?? skillName);
    const summary = String(capability.summary ?? `运用${displayName}推进${input.subject}学习。`);
    const description = `指导老师运用${displayName}实施、检查和调整${input.subject}教学。用于${array(capability.use_when).map(String).join("、") || "推进学生理解"}；提供可执行动作、学习检查和补救分支。`;
    const hasVisual = array(capability.evidence).some((item) => item && typeof item === "object" && "visual_asset" in item);
    const skillText = `---\nname: ${skillName}\ndescription: ${description.replace(/\n/g, " ")}\n---\n\n# ${displayName}\n\n${summary}\n\n## 教学目标\n\n${String(capability.teaching_goal ?? "让学生独立完成目标任务并说明理由。")}\n\n## 什么时候使用\n\n${lines(capability.use_when, "观察到与本策略匹配的学生困难时。")}\n\n## 前置条件\n\n${lines(capability.prerequisites, "确认学生起点、学习目标与可用材料。")}\n\n## 按这个顺序教\n\n${flow(capability.lesson_flow)}\n\n## 学习检查\n\n${checkpoints(capability.assessment_checkpoints)}\n\n## 根据学生表现调整\n\n${adaptations(capability.adaptations)}\n\n## 不要在这些情况下使用\n\n${lines(capability.abstain_when, "证据不足或学生尚未具备必要前置知识时拒绝执行。")}\n\n## 质量与失败检查\n\n${lines(capability.quality_checks, "每个动作都应对应可观察的学生回应。")}\n\n${lines(capability.failure_modes, "学生未达标时不能机械重复同一解释。")}\n\n## 来源证据\n\n读取 [references/evidence.md](references/evidence.md)；证据用于溯源，不能扩写成未发生的课堂事实。\n`;
    await writeFile(join(folder, "SKILL.md"), skillText, "utf8");
    await writeFile(join(folder, "agents", "openai.yaml"), `interface:\n  display_name: ${JSON.stringify(displayName)}\n  short_description: ${JSON.stringify(`运用${displayName}完成可观察、可调整的课堂教学`.slice(0, 64))}\n  default_prompt: ${JSON.stringify(`使用 $${skillName} 根据学生当前状态执行教学、检查和补救。`)}\n`, "utf8");
    const evidenceLines = [`# ${displayName}：证据索引`, "", "以下短证据仅用于定位原课堂。", ""];
    for (const rawEvidence of array(capability.evidence)) {
      const evidence = rawEvidence as Record<string, unknown>;
      evidenceLines.push(`- **${String(evidence.lesson ?? "未知课程")} · ${String(evidence.timestamp ?? "--:--")}**：“${String(evidence.quote ?? "").slice(0, 36)}” — ${String(evidence.supports ?? "")}`);
    }
    await writeFile(join(folder, "references", "evidence.md"), `${evidenceLines.join("\n")}\n`, "utf8");
    await writeFile(join(folder, "references", "pattern.md"), `# ${displayName}\n\n${summary}\n\n- 支持课程数：${String(capability.supporting_lessons ?? "未标注")}\n- 置信度：${String(capability.confidence ?? "未标注")}\n`, "utf8");
    if (hasVisual) {
      const visualLines = [`# ${displayName}：视觉证据`, "", "只描述画面直接可见内容。", ""];
      for (const rawEvidence of array(capability.evidence)) {
        const evidence = rawEvidence as Record<string, unknown>;
        if (!evidence.visual_asset) continue;
        visualLines.push(`## ${String(evidence.frame_id ?? basename(String(evidence.visual_asset)))}`, "", `![关键帧](../${String(evidence.visual_asset)})`, "", `- 支持：${String(evidence.supports ?? "")}`, "");
      }
      await writeFile(join(folder, "references", "visual-evidence.md"), visualLines.join("\n"), "utf8");
    }
    const manifest = {
      skill: skillName,
      schema_version: "teaching-transition-v1",
      subject: input.subject,
      modalities: ["text", ...(hasVisual ? ["visual"] : [])],
      capability,
      suite: input.suite.suite_name,
      provenance: input.provenance,
    };
    await writeJson(join(folder, "manifest.json"), manifest);
    built.push({
      name: skillName,
      display_name: displayName,
      summary,
      path: folder,
      valid: true,
      errors: [],
      modalities: manifest.modalities,
      visual_asset_count: array(capability.evidence).filter((item) => item && typeof item === "object" && "visual_asset" in item).length,
      has_executable_asset: false,
    });
  }
  await writeJson(join(input.outputRoot, "suite.json"), input.suite);
  return built;
}
