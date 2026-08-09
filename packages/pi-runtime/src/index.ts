import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  defineTool,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { extname, join, resolve } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type {
  JsonObject,
  TeachingArtifact,
  TeachingArtifactKind,
  TutorToolTrace,
} from "../../contracts/src/index.js";

export interface PiSkill {
  key: string;
  name: string;
  summary?: string;
  teaching_goal?: string;
  modalities?: string[];
  lesson_flow?: unknown[];
  assessment_checkpoints?: unknown[];
  evidence?: unknown[];
}

export interface PiImage {
  label: string;
  path: string;
}

export interface PiRunInput {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  question: string;
  subject: string;
  skills: PiSkill[];
  images: PiImage[];
  temperature?: number;
  runDir?: string;
}

export interface PiRunOutput {
  answer: JsonObject;
  toolCalls: TutorToolTrace[];
  toolCallCount: number;
  visualCount: number;
  stopReason: string;
  artifacts: TeachingArtifact[];
}

const MAX_TOOL_CALLS = 8;

interface DiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
  accent?: boolean;
}

interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

type ForceDirection = "down" | "normal_out" | "normal_in" | "up_slope" | "down_slope" | "left" | "right";

interface ForceVectorInput {
  label: string;
  symbol?: string;
  direction: ForceDirection;
  role?: "actual" | "component";
}

interface DiagramInput {
  title: string;
  summary: string;
  kind: TeachingArtifactKind;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  surface?: "incline" | "horizontal" | "free";
  incline_angle?: number;
  forces?: ForceVectorInput[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function short(value: string, maximum: number): string {
  const text = String(value).trim();
  return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
}

function labelLines(value: string): string[] {
  const text = short(value, 24);
  if (text.length <= 10) return [text];
  return [text.slice(0, 10), text.slice(10, 20)];
}

function inferForceVectors(input: DiagramInput): ForceVectorInput[] {
  if (input.forces?.length) return input.forces.slice(0, 8).map((force) => ({
    ...force,
    role: force.role ?? (/sin|cos|分量/i.test(`${force.symbol || ""} ${force.label}`) ? "component" : "actual"),
  }));
  const labels = input.nodes.map((node) => node.label);
  const result: ForceVectorInput[] = [];
  const add = (label: string, symbol: string, direction: ForceDirection, role: ForceVectorInput["role"] = "actual") => {
    if (!result.some((item) => item.direction === direction && item.role === role)) result.push({ label, symbol, direction, role });
  };
  for (const label of labels) {
    if (/sin|沿斜面分量/i.test(label)) add(label, "mg sin θ", "down_slope", "component");
    else if (/cos|垂直斜面分量/i.test(label)) add(label, "mg cos θ", "normal_in", "component");
    else if (/支持力|法向力|\bN\b/i.test(label)) add(label, "N", "normal_out");
    else if (/摩擦力|\bf\b/i.test(label)) add(label, "f", /向下/.test(label) ? "down_slope" : "up_slope");
    else if (/重力|\bmg\b/i.test(label)) add(label, "mg", "down");
    else if (/拉力|牵引力|外力|\bF\b/i.test(label)) add(label, "F", /向下/.test(label) ? "down_slope" : "up_slope");
  }
  if (!result.some((item) => item.direction === "down" && item.role !== "component")) add("重力", "mg", "down");
  if (!result.some((item) => item.direction === "normal_out")) add("支持力", "N", "normal_out");
  return result;
}

function renderForceDiagram(input: DiagramInput, title: string, summary: string): TeachingArtifact {
  const forces = inferForceVectors(input);
  const labelText = `${title} ${summary} ${input.nodes.map((node) => node.label).join(" ")}`;
  const incline = input.surface === "incline" || (input.surface !== "horizontal" && input.surface !== "free" && /斜面|sin|cos/i.test(labelText));
  const angle = incline ? clamp(Number(input.incline_angle ?? 28), 15, 45) : 0;
  const radians = angle * Math.PI / 180;
  const tangent = { x: Math.cos(radians), y: -Math.sin(radians) };
  const downSlope = { x: -tangent.x, y: -tangent.y };
  const normalOut = { x: -Math.sin(radians), y: -Math.cos(radians) };
  const normalIn = { x: -normalOut.x, y: -normalOut.y };
  const actual = forces.filter((force) => force.role !== "component");
  const origin = { x: 235, y: incline ? 247 : 285 };
  const vectors: Record<ForceDirection, { x: number; y: number; color: string }> = {
    down: { x: 0, y: 132, color: "#e8693d" },
    normal_out: { x: normalOut.x * 130, y: normalOut.y * 130, color: "#357c96" },
    normal_in: { x: normalIn.x * 110, y: normalIn.y * 110, color: "#d08a32" },
    up_slope: { x: tangent.x * 125, y: tangent.y * 125, color: "#78659b" },
    down_slope: { x: downSlope.x * 125, y: downSlope.y * 125, color: "#78659b" },
    left: { x: -125, y: 0, color: "#78659b" },
    right: { x: 125, y: 0, color: "#78659b" },
  };
  const forceArrows = actual.map((force) => {
    const vector = vectors[force.direction];
    const endX = origin.x + vector.x;
    const endY = origin.y + vector.y;
    const labelX = endX + (vector.x < -20 ? -8 : vector.x > 20 ? 8 : 15);
    const labelY = endY + (vector.y < -20 ? -9 : 22);
    const anchor = vector.x < -20 ? "end" : "start";
    return `<g class="force actual"><line x1="${origin.x}" y1="${origin.y}" x2="${endX}" y2="${endY}" style="stroke:${vector.color}"/><text x="${labelX}" y="${labelY}" text-anchor="${anchor}">${escapeXml(force.symbol || force.label)}</text></g>`;
  }).join("");
  const slope = incline
    ? `<path class="surface" d="M58 388L410 200L410 388Z"/><path class="surface-top" d="M58 388L410 200"/><path class="angle" d="M91 388A33 33 0 0 0 87 372"/><text class="theta" x="105" y="374">θ = ${Math.round(angle)}°</text>`
    : input.surface === "free" ? "" : `<path class="surface-top" d="M62 330H408"/>`;
  const blockRotation = incline ? -angle : 0;
  const showComponents = incline && (forces.some((force) => force.role === "component") || /分解|sin|cos/i.test(labelText));
  const componentLength = 150;
  const tangentLength = componentLength * Math.sin(radians);
  const normalLength = componentLength * Math.cos(radians);
  const decomposition = showComponents ? (() => {
    const point = { x: 590, y: 205 };
    const tangentEnd = { x: point.x + downSlope.x * tangentLength, y: point.y + downSlope.y * tangentLength };
    const normalEnd = { x: point.x + normalIn.x * normalLength, y: point.y + normalIn.y * normalLength };
    const weightEnd = { x: point.x, y: point.y + componentLength };
    return `<g class="decomposition"><text class="panel-label" x="450" y="104">② 重力分解（不是新增外力）</text><line class="axis" x1="475" y1="${point.y + 61}" x2="704" y2="${point.y - 61}"/><line class="axis" x1="${point.x - 61}" y1="118" x2="${point.x + 61}" y2="348"/><circle cx="${point.x}" cy="${point.y}" r="14"/><line class="weight" x1="${point.x}" y1="${point.y}" x2="${weightEnd.x}" y2="${weightEnd.y}"/><text class="weight-label" x="${weightEnd.x + 14}" y="${weightEnd.y - 3}">mg</text><line class="component" x1="${point.x}" y1="${point.y}" x2="${tangentEnd.x}" y2="${tangentEnd.y}"/><text class="component-label" x="${tangentEnd.x - 8}" y="${tangentEnd.y - 10}" text-anchor="end">mg sin θ</text><line class="component" x1="${point.x}" y1="${point.y}" x2="${normalEnd.x}" y2="${normalEnd.y}"/><text class="component-label" x="${normalEnd.x + 7}" y="${normalEnd.y - 4}">mg cos θ</text><path class="projection" d="M${tangentEnd.x} ${tangentEnd.y}L${weightEnd.x} ${weightEnd.y}M${normalEnd.x} ${normalEnd.y}L${weightEnd.x} ${weightEnd.y}"/></g>`;
  })() : `<g><text class="panel-label" x="450" y="104">② 矢量自检</text><text class="guide" x="450" y="150">• 每个箭头从物块出发</text><text class="guide" x="450" y="185">• 只画外界对物块的力</text><text class="guide" x="450" y="220">• 箭头方向就是力的方向</text></g>`;

  return {
    id: randomUUID(),
    type: "diagram",
    kind: "force",
    title,
    summary,
    created_at: new Date().toISOString(),
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" role="img" aria-label="${escapeXml(title)}"><defs><marker id="force-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker><pattern id="force-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#dde0d7" stroke-width="1"/></pattern></defs><style>.bg{fill:#f8f7f1}.grid{fill:url(#force-grid);opacity:.34}.divider{stroke:#d8dbd2;stroke-width:1}.title{font:600 24px system-ui;fill:#20241d}.kind{font:12px ui-monospace,monospace;fill:#74786e}.panel-label{font:600 14px system-ui;fill:#4a5148}.surface{fill:#e2e1d9;stroke:none}.surface-top{fill:none;stroke:#59635d;stroke-width:5;stroke-linecap:round}.angle{fill:none;stroke:#899087;stroke-width:1.5}.theta,.guide{font:12px system-ui;fill:#747c73}.block{fill:#d7ff5e;stroke:#8ead20;stroke-width:2}.block-label{font:700 14px system-ui;fill:#26301f;text-anchor:middle}.force line,.weight,.component{fill:none;stroke-width:4;stroke-linecap:round;marker-end:url(#force-arrow)}.force text,.weight-label,.component-label{font:700 14px system-ui;fill:#273029;paint-order:stroke;stroke:#f8f7f1;stroke-width:5px;stroke-linejoin:round}.axis{stroke:#aeb5ad;stroke-width:1.5;stroke-dasharray:5 5}.decomposition circle{fill:#d7ff5e;stroke:#8ead20;stroke-width:2}.weight{stroke:#e8693d}.component{stroke:#d08a32;stroke-width:3;stroke-dasharray:7 5}.projection{fill:none;stroke:#b6bbb4;stroke-width:1.5;stroke-dasharray:4 5}</style><rect class="bg" width="800" height="480"/><rect class="grid" x="32" y="62" width="736" height="386" rx="18"/><text class="title" x="42" y="38">${escapeXml(title)}</text><text class="kind" x="758" y="36" text-anchor="end">FREE-BODY DIAGRAM</text><line class="divider" x1="430" y1="88" x2="430" y2="420"/><text class="panel-label" x="62" y="104">① 隔离物块，只画外力</text>${slope}<g transform="rotate(${blockRotation} ${origin.x} ${origin.y})"><rect class="block" x="${origin.x - 40}" y="${origin.y - 28}" width="80" height="56" rx="8"/><text class="block-label" x="${origin.x}" y="${origin.y + 5}">物块</text></g>${forceArrows}${decomposition}</svg>`,
  };
}

export function renderTeachingDiagram(input: DiagramInput): TeachingArtifact {
  const title = short(input.title || "教学图示", 60);
  const summary = short(input.summary || "由教学工具生成", 140);
  if (input.kind === "force") return renderForceDiagram(input, title, summary);
  const nodes = input.nodes.slice(0, 10).map((node, index) => ({
    id: short(node.id || `node-${index + 1}`, 32),
    label: short(node.label || `节点 ${index + 1}`, 24),
    x: 70 + clamp(Number(node.x), 0, 100) * 6.6,
    y: 72 + clamp(Number(node.y), 0, 100) * 3.2,
    accent: Boolean(node.accent),
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = input.edges.slice(0, 14).flatMap((edge) => {
    const from = byId.get(short(edge.from, 32));
    const to = byId.get(short(edge.to, 32));
    return from && to ? [{ from, to, label: short(edge.label ?? "", 18) }] : [];
  });
  const axes = input.kind === "coordinate"
    ? `<g class="axes"><path d="M72 392H740"/><path d="M92 416V70"/><text x="724" y="382">x</text><text x="104" y="84">y</text></g>`
    : "";
  const edgeSvg = edges.map(({ from, to, label }) => {
    const middleX = (from.x + to.x) / 2;
    const middleY = (from.y + to.y) / 2;
    return `<g class="edge"><path d="M${from.x} ${from.y} L${to.x} ${to.y}" marker-end="url(#arrow)"/>${label ? `<text x="${middleX}" y="${middleY - 8}">${escapeXml(label)}</text>` : ""}</g>`;
  }).join("");
  const nodeSvg = nodes.map((node) => {
    const lines = labelLines(node.label);
    const text = lines.map((line, index) => `<tspan x="${node.x}" dy="${index ? 16 : 0}">${escapeXml(line)}</tspan>`).join("");
    if (input.kind === "coordinate") {
      return `<g class="point${node.accent ? " accent" : ""}"><circle cx="${node.x}" cy="${node.y}" r="8"/><text x="${node.x + 12}" y="${node.y - 12}">${escapeXml(node.label)}</text></g>`;
    }
    return `<g class="node${node.accent ? " accent" : ""}"><rect x="${node.x - 76}" y="${node.y - 30}" width="152" height="60" rx="16"/><text x="${node.x}" y="${node.y - (lines.length > 1 ? 7 : -5)}">${text}</text></g>`;
  }).join("");

  return {
    id: randomUUID(),
    type: "diagram",
    kind: input.kind,
    title,
    summary,
    created_at: new Date().toISOString(),
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" role="img" aria-label="${escapeXml(title)}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none"/></pattern></defs><style>.bg{fill:#f8f7f1}.grid{fill:url(#grid);opacity:.42}.grid+rect{fill:none}.grid,path{stroke:#d7d5ca}.title{font:600 24px system-ui;fill:#20241d}.subtitle{font:13px system-ui;fill:#74786e}.edge path,.axes path{fill:none;stroke:#6d7367;stroke-width:2.2}.edge text,.axes text,.point text{font:12px system-ui;fill:#666b61;text-anchor:middle}.node rect{fill:#fffefa;stroke:#bfc2b8;stroke-width:1.5}.node.accent rect{fill:#d7ff5e;stroke:#a9d51f}.node text{font:600 13px system-ui;fill:#242820;text-anchor:middle}.point circle{fill:#fffefa;stroke:#20241d;stroke-width:3}.point.accent circle{fill:#d7ff5e}.point text{text-anchor:start}.axes path{stroke:#343831;marker-end:url(#arrow)}marker path{fill:#343831;stroke:none}</style><rect class="bg" width="800" height="480"/><rect class="grid" x="56" y="58" width="688" height="366" rx="18"/><text class="title" x="56" y="34">${escapeXml(title)}</text><text class="subtitle" x="744" y="34" text-anchor="end">${escapeXml(input.kind.replaceAll("_", " "))}</text>${axes}${edgeSvg}${nodeSvg}</svg>`,
  };
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/chat\/completions\/?$/i, "").replace(/\/+$/, "");
}

function mimeTypeFor(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/jpeg";
}

async function loadImages(images: PiImage[]): Promise<Array<{ type: "image"; data: string; mimeType: string }>> {
  return Promise.all(images.slice(0, 4).map(async (item) => ({
    type: "image" as const,
    data: (await readFile(resolve(item.path))).toString("base64"),
    mimeType: mimeTypeFor(item.path),
  })));
}

function catalog(skills: PiSkill[]): string {
  return JSON.stringify(skills.map(({ key, name, summary, teaching_goal, modalities }) => ({
    key,
    name,
    summary: summary ?? "",
    teaching_goal: teaching_goal ?? "",
    modalities: modalities ?? ["text"],
  })));
}

function makeExtension(input: PiRunInput, toolEvents: PiRunOutput["toolCalls"], artifacts: TeachingArtifact[]): (pi: any) => void | Promise<void> {
  const skills = new Map(input.skills.map((skill) => [skill.key, skill]));
  const visualEvidence = input.images.map((image) => ({
    label: image.label,
    file: image.path.split(/[\\/]/).pop(),
  }));

  return async (pi: any) => {
    pi.registerTool(defineTool({
      name: "draw_teaching_diagram",
      label: "Draw Teaching Diagram",
      description: "把空间关系、受力关系、概念联系或过程步骤绘制成学生可见图示。只在图比纯文字更清楚时调用。坐标使用 0 到 100。",
      parameters: Type.Object({
        title: Type.String({ description: "简短图名" }),
        summary: Type.String({ description: "这张图帮助学生看清什么" }),
        kind: Type.Union([
          Type.Literal("concept_map"),
          Type.Literal("process"),
          Type.Literal("force"),
          Type.Literal("coordinate"),
        ]),
        surface: Type.Optional(Type.Union([
          Type.Literal("incline"),
          Type.Literal("horizontal"),
          Type.Literal("free"),
        ], { description: "受力图中的接触面；斜面问题必须选 incline" })),
        incline_angle: Type.Optional(Type.Number({ minimum: 0, maximum: 60, description: "斜面倾角（度）" })),
        forces: Type.Optional(Type.Array(Type.Object({
          label: Type.String({ description: "力的中文名称" }),
          symbol: Type.Optional(Type.String({ description: "图上短符号，如 N、mg、f、mg sin θ" })),
          direction: Type.Union([
            Type.Literal("down"),
            Type.Literal("normal_out"),
            Type.Literal("normal_in"),
            Type.Literal("up_slope"),
            Type.Literal("down_slope"),
            Type.Literal("left"),
            Type.Literal("right"),
          ]),
          role: Type.Optional(Type.Union([Type.Literal("actual"), Type.Literal("component")], { description: "mg sinθ、mg cosθ 必须标为 component，不是新增外力" })),
        }), { maxItems: 8, description: "受力图专用矢量；所有实际力必须从物块出发" })),
        nodes: Type.Array(Type.Object({
          id: Type.String(),
          label: Type.String(),
          x: Type.Number({ minimum: 0, maximum: 100 }),
          y: Type.Number({ minimum: 0, maximum: 100 }),
          accent: Type.Optional(Type.Boolean()),
        }), { minItems: 1, maxItems: 10 }),
        edges: Type.Array(Type.Object({
          from: Type.String(),
          to: Type.String(),
          label: Type.Optional(Type.String()),
        }), { maxItems: 14 }),
      }),
      async execute(_id: string, params: DiagramInput) {
        const artifact = renderTeachingDiagram(params);
        artifacts.push(artifact);
        return {
          content: [{ type: "text", text: `已在学生黑板生成「${artifact.title}」，产物编号 ${artifact.id}。请结合图示继续解释。` }],
          details: { artifact_id: artifact.id, artifact_title: artifact.title, artifact_kind: artifact.kind },
        };
      },
    }));

    if (skills.size) {
      pi.registerTool(defineTool({
        name: "load_teaching_skill",
        label: "Load Teaching Skill",
        description: "读取蒸馏系统选中的教学 Skill。回答前必须调用，只采用与当前学生状态有关的步骤。",
        parameters: Type.Object({ skill_key: Type.String({ description: "候选 Skill 的 key" }) }),
        async execute(_id: string, params: { skill_key: string }) {
          const skill = skills.get(String(params.skill_key));
          return skill
            ? { content: [{ type: "text", text: JSON.stringify(skill) }], details: { found: true } }
            : { content: [{ type: "text", text: `未知 Skill：${params.skill_key}` }], details: { found: false } };
        },
      }));
    }

    if (visualEvidence.length) {
      pi.registerTool(defineTool({
        name: "inspect_visual_evidence",
        label: "Inspect Visual Evidence",
        description: "确认本轮携带的课堂视觉证据标签。",
        parameters: Type.Object({}),
        async execute() {
          return {
            content: [{ type: "text", text: JSON.stringify(visualEvidence) }],
            details: { count: visualEvidence.length },
          };
        },
      }));
    }

    pi.on("tool_call", async (event: any) => {
      if (["load_teaching_skill", "inspect_visual_evidence", "draw_teaching_diagram"].includes(event.toolName)) return undefined;
      return { block: true, reason: "SkyClass 教学运行时只允许教学专用的受控工具。" };
    });

    pi.on("tool_result", async (event: any) => {
      const artifactId = typeof event.details?.artifact_id === "string" ? event.details.artifact_id : undefined;
      const summaries: Record<string, string> = {
        load_teaching_skill: event.details?.found ? "已读取教学 Skill" : "未找到教学 Skill",
        inspect_visual_evidence: `已检查 ${Number(event.details?.count ?? 0)} 条视觉证据`,
        draw_teaching_diagram: artifactId ? `已生成「${String(event.details?.artifact_title ?? "教学图示")}」` : "图示生成失败",
      };
      toolEvents.push({
        id: String(event.toolCallId ?? randomUUID()),
        tool: String(event.toolName),
        label: ({
          load_teaching_skill: "读取教学 Skill",
          inspect_visual_evidence: "检查课堂证据",
          draw_teaching_diagram: "绘制教学图示",
        } as Record<string, string>)[event.toolName] ?? String(event.toolName),
        ok: !event.isError,
        summary: summaries[event.toolName] ?? (event.isError ? "工具执行失败" : "工具执行完成"),
        ...(artifactId ? { artifact_id: artifactId } : {}),
      });
    });

    pi.on("before_agent_start", async (event: any) => ({
      systemPrompt: [
        event.systemPrompt,
        "# SkyClass 教学运行时",
        "你是直接面向学生授课的老师，不是教案生成器。先诊断卡点，再给直观解释、精确定义、例子和一个小检查。",
        "全程使用第二人称‘你’，禁止输出‘教师可以’或‘让学生’。",
        "Skill 是教学策略而不是事实来源。只能引用本轮真实提供的课堂证据。",
        "answer 只能包含自然、直接的学生讲解。不得向学生提及 Skill、课堂关键帧、视觉证据、工具调用、模型或运行时；这些信息只用于内部决定怎样教。",
        skills.size
          ? `候选 Skill 目录：${catalog(input.skills)}\n回答前必须调用 load_teaching_skill 读取真正需要的 Skill。`
          : "这是无 Skill 基线，不得声称使用课堂 Skill。",
        visualEvidence.length
          ? "本轮附带课堂关键帧；需要引用画面时先调用 inspect_visual_evidence。"
          : "本轮没有课堂关键帧，不得虚构视觉证据。",
        "当问题涉及空间关系、受力、坐标变化、步骤流程或概念关系时，优先调用 draw_teaching_diagram；图示会直接出现在学生黑板中。不要为普通事实问答强行画图。",
        "受力问题必须使用 kind=force，并填写 surface、incline_angle 与 forces：实际力 role=actual；mg sinθ、mg cosθ 只能作为 role=component。禁止用概念节点框代替力箭头，禁止把重力及其分量同时当作三个外力。",
        "最多执行 8 次工具调用，完成后立即作答。",
        "learning_checks 中每项只写一个等待学生回答的问题，严禁附带正确回答、参考答案、答案提示或判分结论。success_criteria 与问题对应，只写给系统使用的内部判断标准，不得复述进 answer。",
        "最终只输出 JSON：{\"answer\":\"面向学生的 Markdown\",\"assumptions\":[],\"learning_checks\":[\"只含问题\"],\"success_criteria\":[\"内部判断标准\"]}",
      ].join("\n\n"),
    }));
  };
}

function finalAssistantMessage(messages: any[]): any {
  return [...messages].reverse().find((item) => item?.role === "assistant");
}

function assistantText(message: any): string {
  return Array.isArray(message?.content)
    ? message.content.filter((item: any) => item?.type === "text").map((item: any) => String(item.text ?? "")).join("")
    : "";
}

export function normalizePiAnswer(value: JsonObject): JsonObject {
  let current = value;
  for (let depth = 0; depth < 3; depth += 1) {
    const answer = current.answer;
    if (typeof answer !== "string") break;
    const cleaned = answer.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    if (!cleaned.startsWith("{") || !cleaned.endsWith("}")) break;
    try {
      const nested = JSON.parse(cleaned) as JsonObject;
      if (typeof nested.answer !== "string") break;
      current = { ...current, ...nested };
    } catch {
      break;
    }
  }
  return current;
}

function parseJson(text: string): JsonObject {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return normalizePiAnswer(JSON.parse(cleaned) as JsonObject);
  } catch {
    for (let start = cleaned.indexOf("{"); start >= 0; start = cleaned.indexOf("{", start + 1)) {
      for (let end = cleaned.lastIndexOf("}"); end > start; end = cleaned.lastIndexOf("}", end - 1)) {
        try {
          return normalizePiAnswer(JSON.parse(cleaned.slice(start, end + 1)) as JsonObject);
        } catch {
          // Continue looking for a complete JSON object.
        }
      }
    }
  }
  return { answer: cleaned || "Pi Agent 没有返回可显示的回答。", assumptions: [], learning_checks: [] };
}

export async function runPiAgent(input: PiRunInput): Promise<PiRunOutput> {
  const toolCalls: PiRunOutput["toolCalls"] = [];
  const artifacts: TeachingArtifact[] = [];
  const imageContent = await loadImages(input.images);
  const workDir = resolve(input.runDir ?? join(process.cwd(), ".runtime", "pi-agent"));
  await mkdir(workDir, { recursive: true });

  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
  const sessionManager = SessionManager.inMemory(workDir);
  const extension = makeExtension(input, toolCalls, artifacts);
  const createRuntime = async ({ cwd, sessionManager: manager, sessionStartEvent }: any) => {
    const services = await createAgentSessionServices({
      cwd,
      settingsManager,
      resourceLoaderOptions: {
        extensionFactories: [extension],
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
      },
    });
    services.modelRuntime.registerProvider("anyteacher-relay", {
      baseUrl: normalizeBaseUrl(input.baseUrl),
      apiKey: input.apiKey,
      api: "openai-completions",
      models: [{
        id: input.modelId,
        name: input.modelId,
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
        compat: { supportsDeveloperRole: false },
      }],
    });
    const model = services.modelRuntime.getModel("anyteacher-relay", input.modelId);
    if (!model) throw new Error(`Pi Agent 无法加载模型：${input.modelId}`);
    const created = await createAgentSessionFromServices({
      services,
      sessionManager: manager,
      sessionStartEvent,
      model,
      noTools: "builtin",
    });
    return { ...created, services, diagnostics: [...services.diagnostics] };
  };

  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd: workDir,
    agentDir: join(workDir, "agent"),
    sessionManager,
  });

  try {
    const prompt = [
      `学科：${input.subject}`,
      `学生的问题或学习任务：${input.question}`,
      input.images.length ? `随请求提供了 ${input.images.length} 张课堂关键帧。` : "",
    ].filter(Boolean).join("\n\n");
    let output = "";
    const unsubscribe = runtime.session.subscribe((event: any) => {
      if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
        output += event.assistantMessageEvent.delta;
      }
      if (event.type === "tool_execution_start" && toolCalls.length >= MAX_TOOL_CALLS) {
        void runtime.session.abort();
      }
    });
    try {
      await runtime.session.prompt(prompt, imageContent.length ? { images: imageContent } : undefined);
    } finally {
      unsubscribe();
    }
    const finalMessage = finalAssistantMessage(runtime.session.messages);
    output = assistantText(finalMessage) || output;
    return {
      answer: parseJson(output),
      toolCalls,
      toolCallCount: toolCalls.length,
      visualCount: input.images.length,
      stopReason: String(finalMessage?.stopReason ?? ""),
      artifacts,
    };
  } finally {
    runtime.session.dispose();
  }
}
