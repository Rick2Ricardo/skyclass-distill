import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type {
  GroundedBoardActionIR,
  GroundedSkillCapability,
  GroundedSkillDistillationSuite,
  GroundedSkillLearningCheck,
  GroundedSkillRenderPlan,
  GroundedSkillSourceCatalog,
  GroundedSkillVariant,
  Skill,
} from "../../contracts/src/index.js";
import { validateGroundedSkillDistillationSuite } from "../../contracts/src/index.js";
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
    return `### ${index + 1}. ${String(step.phase ?? `第 ${index + 1} 步`)}\n\n- **老师做**：${String(step.teacher_action ?? "未提供（需复核）")}\n- **可以这样说**：${String(step.suggested_language ?? "未提供（需复核）")}\n- **未来执行时的达标假设**：${String(step.expected_student_response ?? "未提供（需复核）")}\n- **未来执行时的补救设计**：${String(step.if_student_struggles ?? "未提供（需复核）")}\n`;
  }).join("\n") || "未提供可执行步骤；此 Skill 不应进入运行态。";
}

function checkpoints(value: unknown): string {
  return array(value).map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : { check: String(raw) };
    return `${index + 1}. **检查**：${String(item.check ?? "未提供（需复核）")}  \n   **达标信号**：${String(item.success_signal ?? "未提供（需复核）")}  \n   **未达标下一步**：${String(item.next_move_if_not ?? "未提供（需复核）")}`;
  }).join("\n") || "未提供学习检查；此 Skill 不应进入运行态。";
}

function adaptations(value: unknown): string {
  return array(value).map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : { adjustment: String(raw) };
    return `${index + 1}. 未来运行时检测到“${String(item.learner_signal ?? "未提供（需复核）")}”时：${String(item.adjustment ?? "未提供（需复核）")}`;
  }).join("\n") || "未提供条件化调整策略。";
}

function legacyCapabilityErrors(capability: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!String(capability.key ?? "").trim()) errors.push("缺少 capability.key");
  if (!String(capability.name ?? "").trim()) errors.push("缺少 capability.name");
  if (!String(capability.summary ?? "").trim()) errors.push("缺少 capability.summary");
  if (!String(capability.teaching_goal ?? "").trim()) errors.push("缺少 teaching_goal");
  if (!array(capability.use_when).length) errors.push("缺少 use_when");
  if (!Array.isArray(capability.prerequisites)) errors.push("缺少 prerequisites 数组");
  const lessonFlow = array(capability.lesson_flow);
  if (!lessonFlow.length) errors.push("缺少 lesson_flow");
  lessonFlow.forEach((raw, index) => {
    const step = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    if (!String(step.teacher_action ?? "").trim()) errors.push(`lesson_flow[${index}] 缺少 teacher_action`);
    if (!String(step.expected_student_response ?? "").trim()) errors.push(`lesson_flow[${index}] 缺少未来达标假设`);
  });
  const checkpoints = array(capability.assessment_checkpoints);
  if (!checkpoints.length) errors.push("缺少 assessment_checkpoints");
  checkpoints.forEach((raw, index) => {
    const check = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    if (!String(check.check ?? "").trim()) errors.push(`assessment_checkpoints[${index}] 缺少 check`);
    if (!String(check.success_signal ?? "").trim()) errors.push(`assessment_checkpoints[${index}] 缺少 success_signal`);
    if (!String(check.next_move_if_not ?? "").trim()) errors.push(`assessment_checkpoints[${index}] 缺少 next_move_if_not`);
  });
  if (!array(capability.abstain_when).length) errors.push("缺少 abstain_when");
  if (!array(capability.quality_checks).length) errors.push("缺少 quality_checks");
  if (!array(capability.failure_modes).length) errors.push("缺少 failure_modes");
  if (!array(capability.evidence).length) errors.push("缺少来源 evidence");
  if (/observed_student_response|learner_observation|student_outcome/i.test(JSON.stringify(capability))) {
    errors.push("包含无学生网课不可使用的学生事实字段");
  }
  return errors;
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

function groundedAction(action: GroundedBoardActionIR): string {
  return `### ${action.step}. ${action.pedagogical_target}\n\n- **动作来源**：${action.origin}\n- **语义操作**：${action.operation}\n- **教学表示**：${action.artifact_kind}\n- **内容模板**：${action.content_template}\n- **空间约束**：${action.spatial_constraints.join("；") || "无额外约束"}\n- **渐进呈现**：${action.progressive_reveal ? "是" : "否"}\n- **来源 transition**：${action.source_transition_ids.join(", ")}\n- **来源 delta**：${action.source_delta_ids.join(", ") || "无"}\n`;
}

function groundedRenderPlan(plan: GroundedSkillRenderPlan): string {
  return `### ${plan.plan_id}\n\n- **覆盖动作**：${plan.board_action_ids.join(", ")}\n- **首选路由**：${plan.preferred_target}\n- **允许渲染器**：${plan.allowed_targets.join(" / ")}\n- **降级顺序**：${plan.fallback_targets.join(" → ") || "无"}\n- **布局 / 交互**：${plan.layout_mode} / ${plan.interaction_mode}\n- **选择理由**：${plan.rationale}\n`;
}

function groundedCheck(check: GroundedSkillLearningCheck, index: number): string {
  return `${index + 1}. **${check.prompt_template}**  \n   达标：${check.success_criteria.join("；")}  \n   失败码：${check.failure_codes.join(", ")}`;
}

function groundedVariant(variant: GroundedSkillVariant): string {
  const remediation = variant.remediation_actions.length
    ? variant.remediation_actions.map(groundedAction).join("\n")
    : "无自动补写动作；证据不足时由运行时询问或安全降级。";
  return `## 变体：${variant.variant_id}\n\n### 使用条件\n\n${lines(variant.use_when, "由 Capability 的 use_when 决定。")}\n\n### Renderer-neutral Board Actions\n\n${variant.board_actions.map(groundedAction).join("\n")}\n\n### Render Plans\n\n${variant.render_plans.map(groundedRenderPlan).join("\n")}\n\n### 学习检查\n\n${variant.learning_checks.map(groundedCheck).join("\n")}\n\n### 补救动作\n\n${remediation}\n`;
}

async function buildGroundedSkillSuite(input: {
  suite: GroundedSkillDistillationSuite;
  outputRoot: string;
  subject: string;
  provenance: Record<string, unknown>;
  sourceCatalog: GroundedSkillSourceCatalog;
}): Promise<Skill[]> {
  const report = validateGroundedSkillDistillationSuite(input.suite, input.sourceCatalog);
  if (!report.valid) {
    throw new Error(`grounded-skill-distillation-v2 未通过校验：${report.issues.slice(0, 8).map((issue) => `${issue.path} ${issue.message}`).join("；")}`);
  }
  if (input.suite.subject !== input.subject) throw new Error("Skill suite subject 与构建请求不一致");
  await mkdir(input.outputRoot, { recursive: true });
  const built: Skill[] = [];
  for (let index = 0; index < input.suite.capabilities.length; index += 1) {
    const capability: GroundedSkillCapability = input.suite.capabilities[index];
    const skillName = slug(`${input.subject}-${capability.key}`, `grounded-teaching-capability-${index + 1}`);
    const folder = join(input.outputRoot, skillName);
    await rm(folder, { recursive: true, force: true });
    await Promise.all([mkdir(join(folder, "agents"), { recursive: true }), mkdir(join(folder, "references"), { recursive: true })]);
    const renderTargets = [...new Set(capability.variants.flatMap((variant) => variant.render_plans.flatMap((plan) => plan.allowed_targets)))];
    const boardActionCount = capability.variants.reduce((count, variant) => count + variant.board_actions.length + variant.remediation_actions.length, 0);
    const description = `基于已仲裁课堂证据执行${capability.name}；先生成 renderer-neutral Board Action，再在 ${renderTargets.join("/")} 中选择渲染方式。`;
    const skillText = `---\nname: ${skillName}\ndescription: ${description}\n---\n\n# ${capability.name}\n\n${capability.summary}\n\n## 教学目标\n\n${capability.teaching_goal}\n\n## 机制\n\n${capability.mechanism}\n\n## 什么时候使用\n\n${lines(capability.use_when, "无已验证使用条件。")}\n\n## 前置条件\n\n${lines(capability.prerequisites, "无已验证前置条件。")}\n\n${capability.variants.map(groundedVariant).join("\n")}\n\n## 不要在这些情况下使用\n\n${lines(capability.abstain_when, "证据不足时拒绝执行。")}\n\n## 局限\n\n${lines(capability.limitations, "尚未完成真实学生效果验证。")}\n\n## 证据边界\n\n读取 [references/evidence.md](references/evidence.md)。source transition 和 evidence 只证明课堂中发生过相应动作，不证明学生已经学会。\n`;
    await writeFile(join(folder, "SKILL.md"), skillText, "utf8");
    await writeFile(join(folder, "agents", "openai.yaml"), `interface:\n  display_name: ${JSON.stringify(capability.name)}\n  short_description: ${JSON.stringify(`以多渲染器黑板执行${capability.name}`.slice(0, 64))}\n  default_prompt: ${JSON.stringify(`使用 $${skillName} 先规划 Board Action，再选择 HTML、SVG 或 Ink 渲染。`)}\n`, "utf8");
    const evidenceText = `# ${capability.name}：证据索引\n\n- Source bundle：${input.suite.source_bundle_id}\n- Transition IDs：${capability.source_transition_ids.join(", ")}\n- Evidence IDs：${capability.evidence_refs.join(", ")}\n\n这些 ID 必须回到原始 BoardEvidenceBundle 解析；不得根据 ID 补写学生反应或学习效果。\n`;
    await writeFile(join(folder, "references", "evidence.md"), evidenceText, "utf8");
    const manifest = {
      skill: skillName,
      schema_version: "grounded-skill-distillation-v2",
      subject: input.subject,
      source_bundle_id: input.suite.source_bundle_id,
      renderer_neutral: true,
      render_targets: renderTargets,
      board_action_count: boardActionCount,
      capability,
      suite: input.suite.suite_name,
      provenance: input.provenance,
    };
    await writeJson(join(folder, "manifest.json"), manifest);
    built.push({
      name: skillName,
      display_name: capability.name,
      summary: capability.summary,
      path: folder,
      valid: true,
      errors: [],
      distill_evidence_mode: "temporal_board",
      modalities: ["text", "temporal_board"],
      visual_asset_count: 0,
      has_executable_asset: boardActionCount > 0,
      board_action_count: boardActionCount,
      render_targets: renderTargets,
    });
  }
  await writeJson(join(input.outputRoot, "suite.json"), input.suite);
  return built;
}

export async function buildSkillSuite(input: {
  suite: Record<string, unknown>;
  outputRoot: string;
  subject: string;
  provenance: Record<string, unknown>;
  groundedSourceCatalog?: GroundedSkillSourceCatalog;
}): Promise<Skill[]> {
  if (input.suite.schema_version === "grounded-skill-distillation-v2") {
    if (!input.groundedSourceCatalog) throw new Error("grounded-skill-distillation-v2 构建必须提供源 BoardEvidence catalog");
    return buildGroundedSkillSuite({
      ...input,
      suite: input.suite as unknown as GroundedSkillDistillationSuite,
      sourceCatalog: input.groundedSourceCatalog,
    });
  }
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
    const summary = String(capability.summary ?? "未提供能力摘要（需复核）");
    const validationErrors = legacyCapabilityErrors(capability);
    const description = `指导老师运用${displayName}实施、检查和调整${input.subject}教学。用于${array(capability.use_when).map(String).join("、") || "使用条件未提供（需复核）"}；提供可执行动作、学习检查和补救分支。`;
    const hasVisual = array(capability.evidence).some((item) => item && typeof item === "object" && "visual_asset" in item);
    const skillText = `---\nname: ${skillName}\ndescription: ${description.replace(/\n/g, " ")}\n---\n\n# ${displayName}\n\n${summary}\n\n## 教学目标\n\n${String(capability.teaching_goal ?? "未提供教学目标（需复核）")}\n\n## 什么时候使用\n\n${lines(capability.use_when, "未提供使用条件（需复核）")}\n\n## 前置条件\n\n${lines(capability.prerequisites, "未提供前置条件（需复核）")}\n\n## 按这个顺序教\n\n${flow(capability.lesson_flow)}\n\n## 学习检查\n\n${checkpoints(capability.assessment_checkpoints)}\n\n## 根据学生表现调整\n\n${adaptations(capability.adaptations)}\n\n## 不要在这些情况下使用\n\n${lines(capability.abstain_when, "未提供拒绝条件（需复核）")}\n\n## 质量与失败检查\n\n${lines(capability.quality_checks, "未提供质量标准（需复核）")}\n\n${lines(capability.failure_modes, "未提供失败模式（需复核）")}\n\n## 来源证据\n\n读取 [references/evidence.md](references/evidence.md)；证据用于溯源，不能扩写成未发生的课堂事实。\n`;
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
      validation_errors: validationErrors,
    };
    await writeJson(join(folder, "manifest.json"), manifest);
    built.push({
      name: skillName,
      display_name: displayName,
      summary,
      path: folder,
      valid: validationErrors.length === 0,
      errors: validationErrors,
      modalities: manifest.modalities,
      visual_asset_count: array(capability.evidence).filter((item) => item && typeof item === "object" && "visual_asset" in item).length,
      has_executable_asset: false,
    });
  }
  await writeJson(join(input.outputRoot, "suite.json"), input.suite);
  return built;
}
