import type { LlmClient } from "../../llm/src/client.js";
import type {
  BoardEvidenceBundle,
  DistillMode,
  GroundedSkillDistillationSuite,
  GroundedSkillSourceCatalog,
} from "../../contracts/src/index.js";
import {
  validateBoardEvidenceBundle,
  validateGroundedSkillDistillationSuite,
} from "../../contracts/src/index.js";

const GROUNDED_DISTILL_SYSTEM = `你是一名严格的课堂能力蒸馏器。输入是已经通过人工仲裁的时序板书与课堂语音证据。

你的任务是生成 renderer-neutral 的 Teaching Skill 草案：
1. Board Action IR 只描述教学语义、内容模板、空间约束和渐进呈现，不能写 HTML、SVG、Canvas 代码，也不能在 action 中绑定渲染器。
2. HTML / SVG / Ink 的选择只能出现在独立 Render Plan。结构化解释、公式卡片、表格和对比通常允许 HTML；几何、受力、坐标与关系图通常允许 SVG；需要保留手写节奏与笔迹时允许 Ink。preferred_target 可以是 auto。
3. 只引用输入中存在且 accepted 的 transition_id、delta_id 和 evidence_id。
4. 网课只有老师：不能声称观察到学生点头、回答、理解或学习增益。学习检查是未来执行策略，不是原课堂事实。
5. 不能把原题答案或常数固化进可迁移 Skill；用参数化内容模板。
6. 不填默认套话。证据不足时减少 Skill 数量或写入 limitations。

只输出严格 JSON，不要 Markdown。`;

function promptForGroundedSkills(input: {
  subject: string;
  mode: DistillMode;
  bundle: BoardEvidenceBundle;
  priorErrors: string[];
}): string {
  const acceptedTransitions = input.bundle.transitions.filter((transition) => transition.status === "accepted");
  const transitionIds = new Set(acceptedTransitions.map((transition) => transition.transition_id));
  const deltaIds = new Set(acceptedTransitions.flatMap((transition) => transition.delta_ids));
  const speechIds = new Set(acceptedTransitions.flatMap((transition) => transition.speech_ids));
  const evidenceIds = new Set(acceptedTransitions.flatMap((transition) => transition.evidence_refs));
  const evidence = {
    bundle_id: input.bundle.bundle_id,
    teacher_only_recording: input.bundle.teacher_only_recording,
    transitions: acceptedTransitions,
    deltas: input.bundle.deltas.filter((delta) => deltaIds.has(delta.delta_id)),
    speech: input.bundle.speech.filter((span) => speechIds.has(span.speech_id)),
    evidence: input.bundle.evidence.filter((item) => evidenceIds.has(item.evidence_id)
      || (item.kind === "board_delta" && deltaIds.has(item.target_id))),
  };
  const countRule = input.mode === "single" ? "输出 1–3 个候选 Skill" : "输出 3–5 个至少由两个 transition 支持的候选 Skill";
  const repair = input.priorErrors.length
    ? `\n\n上一次输出未通过校验，请只修复这些问题：\n${input.priorErrors.map((item) => `- ${item}`).join("\n")}`
    : "";
  return `${countRule}。学科：${input.subject}。

严格输出以下结构，不能增加字段：
{
  "schema_version":"grounded-skill-distillation-v2",
  "suite_name":"...",
  "subject":"${input.subject}",
  "source_bundle_id":"${input.bundle.bundle_id}",
  "renderer_neutral":true,
  "teacher_only_recording":${input.bundle.teacher_only_recording},
  "capabilities":[{
    "key":"english-kebab-case",
    "name":"...",
    "summary":"...",
    "teaching_goal":"...",
    "mechanism":"...",
    "use_when":["未来使用时可观察的条件"],
    "prerequisites":["..."],
    "variants":[{
      "variant_id":"main",
      "use_when":["..."],
      "board_actions":[{
        "action_id":"action-1",
        "step":1,
        "origin":"teacher_replay|counterfactual|repair|merged",
        "operation":"introduce|annotate|connect|contrast|revise|clear",
        "pedagogical_target":"...",
        "content_template":"参数化的语义内容，不含任何 HTML/SVG/脚本",
        "artifact_kind":"explanation|formula|comparison|table|diagram|simulation|annotation",
        "spatial_constraints":["..."],
        "progressive_reveal":true,
        "source_transition_ids":["..."],
        "source_delta_ids":["..."],
        "evidence_refs":["..."]
      }],
      "render_plans":[{
        "plan_id":"plan-1",
        "board_action_ids":["action-1"],
        "preferred_target":"auto|html|svg|ink",
        "allowed_targets":["html","svg"],
        "fallback_targets":["html"],
        "layout_mode":"document|split|grid|freeform",
        "interaction_mode":"static|stepwise|interactive",
        "rationale":"为什么这些渲染器适合这一教学表示"
      }],
      "learning_checks":[{
        "check_id":"check-1",
        "prompt_template":"未来执行时向学生提出的检查任务",
        "success_criteria":["可观察的正确标准"],
        "failure_codes":["..." ]
      }],
      "remediation_actions":[]
    }],
    "abstain_when":["..."],
    "source_transition_ids":["..."],
    "evidence_refs":["..."],
    "limitations":["..." ]
  }],
  "limitations":["..." ]
}

每个 Board Action 必须且只能被一个 Render Plan 覆盖；Render Plan 可以允许多个渲染器，但 action 本身不能出现 render_target/html/svg/ink 字段。

已仲裁证据：
${JSON.stringify(evidence)}${repair}`;
}

export function buildGroundedSkillSourceCatalog(bundle: BoardEvidenceBundle): GroundedSkillSourceCatalog {
  const report = validateBoardEvidenceBundle(bundle);
  if (!report.valid) throw new Error(`不能从无效 BoardEvidenceBundle 构建 source catalog：${report.issues.slice(0, 4).map((issue) => `${issue.path} ${issue.message}`).join("；")}`);
  const acceptedTransitions = bundle.transitions.filter((transition) => transition.status === "accepted");
  return {
    source_bundle_id: bundle.bundle_id,
    teacher_only_recording: bundle.teacher_only_recording,
    accepted_transitions: acceptedTransitions
      .map((transition) => ({
        transition_id: transition.transition_id,
        delta_ids: [...transition.delta_ids],
        evidence_refs: [...transition.evidence_refs],
      })),
    evidence_ids: [...new Set(acceptedTransitions.flatMap((transition) => transition.evidence_refs))],
  };
}

export async function distillGroundedSkills(
  client: Pick<LlmClient, "chatJson">,
  input: {
    subject: string;
    bundle: BoardEvidenceBundle;
    mode: DistillMode;
    validationAttempts?: number;
  },
): Promise<GroundedSkillDistillationSuite> {
  if (input.mode === "common") {
    throw new Error("时序板书 v2 的跨课共性蒸馏需要多个独立 BoardEvidenceBundle；当前单 bundle 入口仅支持 single 模式。");
  }
  const bundleReport = validateBoardEvidenceBundle(input.bundle);
  if (!bundleReport.valid) {
    throw new Error(`BoardEvidenceBundle 未通过校验：${bundleReport.issues.slice(0, 6).map((issue) => `${issue.path} ${issue.message}`).join("；")}`);
  }
  const catalog = buildGroundedSkillSourceCatalog(input.bundle);
  if (!catalog.accepted_transitions.length) throw new Error("没有 accepted transition，不能进入 Skill 蒸馏。");
  const attempts = Math.min(3, Math.max(1, input.validationAttempts ?? 2));
  let priorErrors: string[] = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const raw = await client.chatJson(
      GROUNDED_DISTILL_SYSTEM,
      promptForGroundedSkills({ ...input, priorErrors }),
      [],
      0,
    );
    const report = validateGroundedSkillDistillationSuite(raw, catalog);
    if (raw.subject !== input.subject) report.issues.push({ code: "suite.subject", path: "$.subject", message: "subject 必须与蒸馏请求一致。" });
    if (Array.isArray(raw.capabilities)) {
      const expected = [1, 3];
      if (raw.capabilities.length < expected[0] || raw.capabilities.length > expected[1]) {
        report.issues.push({ code: "suite.capability_count", path: "$.capabilities", message: `${input.mode} 模式要求 ${expected[0]}–${expected[1]} 个 Skill。` });
      }
    }
    if (report.issues.length === 0) return raw as unknown as GroundedSkillDistillationSuite;
    priorErrors = report.issues.slice(0, 12).map((issue) => `${issue.path}: ${issue.message}`);
  }
  throw new Error(`grounded-skill-distillation-v2 连续校验失败：${priorErrors.join("；")}`);
}
