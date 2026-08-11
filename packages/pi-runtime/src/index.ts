import { Agent, type AgentEvent, type AgentTool } from "@earendil-works/pi-agent-core";
import {
  createModels,
  createProvider,
  type AssistantMessage,
  type ImageContent,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { Type } from "typebox";
import { extname, relative, resolve } from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type {
  JsonObject,
  TeachingArtifact,
  TeachingArtifactKind,
  TutorRuntimeEvent,
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
  root: string;
}

export interface PiRunInput {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  question: string;
  subject: string;
  skills: PiSkill[];
  images: PiImage[];
  history?: Array<{ question: string; answer: string }>;
  sessionId?: string;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  onEvent?: (event: TutorRuntimeEvent) => void | Promise<void>;
}

export interface PiRunOutput {
  answer: JsonObject;
  toolCalls: TutorToolTrace[];
  toolCallCount: number;
  visualCount: number;
  attemptedVisualCount: number;
  candidateVisualCount: number;
  usedSkillKeys: string[];
  stopReason: string;
  durationMs: number;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
  };
  artifacts: TeachingArtifact[];
}

const MAX_TOOL_CALLS = 8;
const MAX_VISUAL_EVIDENCE = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_IMAGE_DIMENSION = 8_192;
const HISTORY_CHAR_BUDGET = 24_000;
const HISTORY_SUMMARY_CHAR_BUDGET = 4_000;

interface DiagramNode {
  id: string;
  label: string;
  x?: number;
  y?: number;
  accent?: boolean;
}

interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  role?: "relation" | "route" | "displacement";
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

function labelLines(value: string, charactersPerLine = 10): string[] {
  const text = short(value, charactersPerLine * 2);
  if (text.length <= charactersPerLine) return [text];
  return [text.slice(0, charactersPerLine), text.slice(charactersPerLine, charactersPerLine * 2)];
}

interface PositionedDiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
  accent: boolean;
}

interface DiagramEdgeReference {
  from: string;
  to: string;
  label: string;
}

function layoutHierarchy(nodes: Array<Omit<PositionedDiagramNode, "x" | "y">>, edges: DiagramEdgeReference[]): {
  nodes: PositionedDiagramNode[];
  nodeWidth: number;
  nodeHeight: number;
} {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (edge.from === edge.to || !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const ranks = new Map(nodes.map((node) => [node.id, 0]));
  const pending = new Map(incoming);
  const queue = nodes.filter((node) => (pending.get(node.id) ?? 0) === 0).map((node) => node.id);
  if (!queue.length && nodes[0]) queue.push(nodes[0].id);
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const child of outgoing.get(id) ?? []) {
      ranks.set(child, Math.max(ranks.get(child) ?? 0, (ranks.get(id) ?? 0) + 1));
      pending.set(child, (pending.get(child) ?? 1) - 1);
      if ((pending.get(child) ?? 0) <= 0) queue.push(child);
    }
  }
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const parentRanks = edges.filter((edge) => edge.to === node.id && visited.has(edge.from)).map((edge) => ranks.get(edge.from) ?? 0);
    ranks.set(node.id, parentRanks.length ? Math.max(...parentRanks) + 1 : 0);
    visited.add(node.id);
  }

  const maximumLogicalRank = Math.max(0, ...ranks.values());
  const maximumBaseRow = Math.min(maximumLogicalRank, 4);
  const grouped = new Map<number, typeof nodes>();
  for (const node of nodes) {
    const logicalRank = ranks.get(node.id) ?? 0;
    const row = maximumLogicalRank <= 4 ? logicalRank : Math.round(logicalRank * maximumBaseRow / maximumLogicalRank);
    grouped.set(row, [...(grouped.get(row) ?? []), node]);
  }

  const originalOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const rows: Array<typeof nodes> = [];
  for (const [, rowNodes] of [...grouped.entries()].sort(([left], [right]) => left - right)) {
    rowNodes.sort((left, right) => {
      const parentOrder = (id: string) => {
        const parents = edges.filter((edge) => edge.to === id).map((edge) => originalOrder.get(edge.from) ?? 0);
        return parents.length ? parents.reduce((sum, value) => sum + value, 0) / parents.length : originalOrder.get(id) ?? 0;
      };
      return parentOrder(left.id) - parentOrder(right.id);
    });
    for (let index = 0; index < rowNodes.length; index += 5) rows.push(rowNodes.slice(index, index + 5));
  }

  const widestRow = Math.max(1, ...rows.map((row) => row.length));
  const nodeWidth = clamp(Math.floor((660 - (widestRow - 1) * 18) / widestRow), 112, 156);
  const nodeHeight = 54;
  const positioned: PositionedDiagramNode[] = [];
  rows.forEach((row, rowIndex) => {
    const y = rows.length === 1 ? 242 : 102 + rowIndex * (288 / (rows.length - 1));
    const minimumX = 70 + nodeWidth / 2;
    const maximumX = 730 - nodeWidth / 2;
    row.forEach((node, columnIndex) => positioned.push({
      ...node,
      x: row.length === 1 ? 400 : minimumX + columnIndex * ((maximumX - minimumX) / (row.length - 1)),
      y,
    }));
  });
  return { nodes: positioned, nodeWidth, nodeHeight };
}

function edgeGeometry(from: PositionedDiagramNode, to: PositionedDiagramNode, nodeWidth: number, nodeHeight: number, index: number): {
  path: string;
  labelX: number;
  labelY: number;
} {
  if (to.y > from.y + nodeHeight * .6) {
    const startY = from.y + nodeHeight / 2;
    const endY = to.y - nodeHeight / 2 - 4;
    const middleY = (startY + endY) / 2;
    return {
      path: `M${from.x} ${startY} C${from.x} ${middleY},${to.x} ${middleY},${to.x} ${endY}`,
      labelX: (from.x + to.x) / 2,
      labelY: middleY - 7,
    };
  }
  if (Math.abs(to.y - from.y) < nodeHeight) {
    const direction = to.x >= from.x ? 1 : -1;
    const startX = from.x + direction * nodeWidth / 2;
    const endX = to.x - direction * (nodeWidth / 2 + 4);
    const lift = 38 + (index % 2) * 14;
    return {
      path: `M${startX} ${from.y} C${startX + direction * 28} ${from.y - lift},${endX - direction * 28} ${to.y - lift},${endX} ${to.y}`,
      labelX: (startX + endX) / 2,
      labelY: Math.min(from.y, to.y) - lift - 5,
    };
  }
  const direction = to.x >= from.x ? 1 : -1;
  const startX = from.x + direction * nodeWidth / 2;
  const endX = to.x - direction * (nodeWidth / 2 + 4);
  const outsideX = direction > 0 ? 752 - (index % 3) * 12 : 48 + (index % 3) * 12;
  return {
    path: `M${startX} ${from.y} C${outsideX} ${from.y},${outsideX} ${to.y},${endX} ${to.y}`,
    labelX: outsideX + (direction > 0 ? -8 : 8),
    labelY: (from.y + to.y) / 2 - 6,
  };
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

function renderTrajectoryDiagram(input: DiagramInput, title: string, summary: string): TeachingArtifact {
  const nodes = input.nodes.slice(0, 10).map((node, index) => ({
    id: short(node.id || `point-${index + 1}`, 32),
    label: short(node.label || `位置 ${index + 1}`, 30),
    accent: Boolean(node.accent),
    x: 90 + clamp(Number(node.x ?? ((index + 1) * 100 / (input.nodes.length + 1))), 0, 100) * 6.2,
    y: 82 + clamp(Number(node.y ?? 50), 0, 100) * 3.05,
  }));
  if (nodes.length < 2) throw new Error("运动轨迹图至少需要两个位置点");
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const validEdges = input.edges.slice(0, 18).flatMap((edge) => {
    const from = byId.get(short(edge.from, 32));
    const to = byId.get(short(edge.to, 32));
    return from && to ? [{ from, to, label: short(edge.label ?? "", 26), role: edge.role ?? "relation" }] : [];
  });
  const routeEdges = validEdges.filter((edge) => edge.role === "route" && edge.from.id !== edge.to.id);
  const displacementEdges = validEdges.filter((edge) => edge.role === "displacement");
  if (!routeEdges.length) throw new Error("运动轨迹图必须用 role=route 明确实际运动路径");
  if (routeEdges.some((edge) => Math.hypot(edge.to.x - edge.from.x, edge.to.y - edge.from.y) < 8)) {
    throw new Error("role=route 的相邻位置必须在画面上有可见距离，不能用重合点伪装实际路径");
  }
  if (displacementEdges.length !== 1) throw new Error("运动轨迹图必须且只能有一条 role=displacement 位移边");
  for (let index = 1; index < routeEdges.length; index += 1) {
    if (routeEdges[index - 1]!.to.id !== routeEdges[index]!.from.id) {
      throw new Error("role=route 必须按实际运动先后顺序首尾相接，不能出现断开的路径");
    }
  }
  const routeStart = routeEdges[0]!.from.id;
  const routeEnd = routeEdges.at(-1)!.to.id;
  const displacement = displacementEdges[0]!;
  if (displacement.from.id !== routeStart || displacement.to.id !== routeEnd) {
    throw new Error("role=displacement 必须从实际路径起点直接指向实际路径终点");
  }

  const center = nodes.reduce((total, node) => ({ x: total.x + node.x, y: total.y + node.y }), { x: 0, y: 0 });
  center.x /= nodes.length;
  center.y /= nodes.length;
  const insetPoint = (from: { x: number; y: number }, toward: { x: number; y: number }, maximumDistance: number) => {
    const dx = toward.x - from.x;
    const dy = toward.y - from.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    const distance = Math.min(maximumDistance, magnitude * .22);
    return { x: from.x + dx / magnitude * distance, y: from.y + dy / magnitude * distance };
  };
  const routeSvg = routeEdges.map(({ from, to, label }, index) => {
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const outward = { x: middle.x - center.x, y: middle.y - center.y };
    const magnitude = Math.hypot(outward.x, outward.y) || 1;
    const curve = Math.min(24, Math.max(8, Math.hypot(to.x - from.x, to.y - from.y) * .07));
    const control = { x: middle.x + outward.x / magnitude * curve, y: middle.y + outward.y / magnitude * curve };
    const visibleStart = insetPoint(from, control, 10);
    const visibleEnd = insetPoint(to, control, 15);
    const labelText = label || (index === 0 ? "实际路径（路程）" : "");
    return `<g class="route"><path d="M${visibleStart.x} ${visibleStart.y} Q${control.x} ${control.y} ${visibleEnd.x} ${visibleEnd.y}" marker-end="url(#route-arrow)"/>${labelText ? `<text x="${control.x}" y="${control.y - 10}">${escapeXml(labelText)}</text>` : ""}</g>`;
  }).join("");
  const displacementSvg = displacementEdges.map(({ from, to, label }) => {
    const zero = from.id === to.id || Math.hypot(to.x - from.x, to.y - from.y) < 2;
    if (zero) {
      return `<g class="zero-displacement"><circle cx="${from.x}" cy="${from.y}" r="19"/><line x1="${from.x - 12}" y1="${from.y + 12}" x2="${from.x + 12}" y2="${from.y - 12}"/><text x="${from.x + 28}" y="${from.y + 5}">位移 = 0</text></g>`;
    }
    const visibleStart = insetPoint(from, to, 10);
    const visibleEnd = insetPoint(to, from, 16);
    const middleX = (from.x + to.x) / 2;
    const middleY = (from.y + to.y) / 2;
    return `<g class="displacement"><path d="M${visibleStart.x} ${visibleStart.y}L${visibleEnd.x} ${visibleEnd.y}" marker-end="url(#displacement-arrow)"/><text x="${middleX}" y="${middleY - 12}">${escapeXml(label || "位移")}</text></g>`;
  }).join("");
  const pointSvg = nodes.map((node) => {
    const lines = node.label.split(/\n+/).flatMap((line) => labelLines(line, 12)).slice(0, 3);
    const rightAligned = node.x > 620;
    const labelX = node.x + (rightAligned ? -13 : 13);
    const labelY = node.y < 105 ? node.y + 26 : node.y - 11;
    const text = lines.map((line, index) => `<tspan x="${labelX}" dy="${index ? 14 : 0}">${escapeXml(line)}</tspan>`).join("");
    return `<g class="trajectory-point${node.accent ? " accent" : ""}"><circle cx="${node.x}" cy="${node.y}" r="7"/><text x="${labelX}" y="${labelY}"${rightAligned ? ' text-anchor="end"' : ""}>${text}</text></g>`;
  }).join("");

  return {
    id: randomUUID(),
    type: "diagram",
    kind: "trajectory",
    title,
    summary,
    created_at: new Date().toISOString(),
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" role="img" aria-label="${escapeXml(title)}" data-layout="motion-trajectory"><defs><marker id="route-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z"/></marker><marker id="displacement-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z"/></marker><pattern id="trajectory-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none"/></pattern></defs><style>.bg{fill:#f8f7f1}.grid{fill:url(#trajectory-grid);opacity:.28}.grid,path{stroke:#d7d5ca}.title{font:600 24px system-ui;fill:#20241d}.kind{font:12px ui-monospace,monospace;fill:#74786e}#route-arrow path{fill:#426879;stroke:none}#displacement-arrow path{fill:#e8693d;stroke:none}.route path{fill:none;stroke:#426879;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.route text,.displacement text,.zero-displacement text,.trajectory-point text{font:12px system-ui;fill:#30362f;paint-order:stroke;stroke:#f8f7f1;stroke-width:5px;stroke-linejoin:round}.route text,.displacement text{text-anchor:middle}.displacement path{fill:none;stroke:#e8693d;stroke-width:3.5;stroke-dasharray:9 6}.zero-displacement circle,.zero-displacement line{fill:none;stroke:#e8693d;stroke-width:3}.trajectory-point circle{fill:#fffefa;stroke:#20241d;stroke-width:3}.trajectory-point.accent circle{fill:#d7ff5e;stroke:#8ead20}.trajectory-point text{font-weight:600}.legend text{font:12px system-ui;fill:#5f665d}.legend .route-key{stroke:#426879;stroke-width:5}.legend .displacement-key{stroke:#e8693d;stroke-width:3.5;stroke-dasharray:8 5}</style><rect class="bg" width="800" height="480"/><rect class="grid" x="40" y="58" width="720" height="350" rx="18"/><text class="title" x="48" y="36">${escapeXml(title)}</text><text class="kind" x="752" y="36" text-anchor="end">MOTION TRAJECTORY</text>${routeSvg}${displacementSvg}${pointSvg}<g class="legend"><line class="route-key" x1="70" y1="438" x2="112" y2="438"/><text x="122" y="442">实际运动路径 / 路程沿线累加</text><line class="displacement-key" x1="410" y1="438" x2="452" y2="438"/><text x="462" y="442">起点到终点的位移</text></g></svg>`,
  };
}

export function renderTeachingDiagram(input: DiagramInput): TeachingArtifact {
  const title = short(input.title || "教学图示", 60);
  const summary = short(input.summary || "由教学工具生成", 140);
  if (input.kind === "force") return renderForceDiagram(input, title, summary);
  if (input.kind === "trajectory") return renderTrajectoryDiagram(input, title, summary);
  if (input.kind === "coordinate" && /位移|路程|轨迹|路径|操场|小区一圈/.test(`${title} ${summary}`)) {
    throw new Error("位移、路程或运动路径必须使用 kind=trajectory，不能使用普通坐标图");
  }
  const sourceNodes = (input.nodes.length ? input.nodes : [{ id: "node-1", label: "教学要点", accent: true }]).slice(0, 10).map((node, index) => ({
    id: short(node.id || `node-${index + 1}`, 32),
    label: short(node.label || `节点 ${index + 1}`, 24),
    accent: Boolean(node.accent),
  }));
  const sourceIds = new Set(sourceNodes.map((node) => node.id));
  const edgeReferences = input.edges.slice(0, 14).flatMap((edge) => {
    const from = short(edge.from, 32);
    const to = short(edge.to, 32);
    return sourceIds.has(from) && sourceIds.has(to) ? [{ from, to, label: short(edge.label ?? "", 13) }] : [];
  });
  const layout = input.kind === "coordinate"
    ? {
      nodes: sourceNodes.map((node, index) => ({
        ...node,
        x: 70 + clamp(Number(input.nodes[index]?.x ?? ((index + 1) * 100 / (sourceNodes.length + 1))), 0, 100) * 6.6,
        y: 72 + clamp(Number(input.nodes[index]?.y ?? 50), 0, 100) * 3.2,
      })),
      nodeWidth: 152,
      nodeHeight: 60,
    }
    : layoutHierarchy(sourceNodes, edgeReferences);
  const nodes = layout.nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = edgeReferences.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    return from && to ? [{ from, to, label: edge.label }] : [];
  });
  const axes = input.kind === "coordinate"
    ? `<g class="axes"><path d="M72 392H740"/><path d="M92 416V70"/><text x="724" y="382">x</text><text x="104" y="84">y</text></g>`
    : "";
  const edgeSvg = edges.map(({ from, to, label }, index) => {
    if (input.kind === "coordinate") {
      const middleX = (from.x + to.x) / 2;
      const middleY = (from.y + to.y) / 2;
      return `<g class="edge"><path d="M${from.x} ${from.y} L${to.x} ${to.y}" marker-end="url(#arrow)"/>${label ? `<text x="${middleX}" y="${middleY - 8}">${escapeXml(label)}</text>` : ""}</g>`;
    }
    const geometry = edgeGeometry(from, to, layout.nodeWidth, layout.nodeHeight, index);
    return `<g class="edge"><path d="${geometry.path}" marker-end="url(#arrow)"/>${label ? `<text x="${geometry.labelX}" y="${geometry.labelY}">${escapeXml(label)}</text>` : ""}</g>`;
  }).join("");
  const nodeSvg = nodes.map((node) => {
    if (input.kind === "coordinate") {
      return `<g class="point${node.accent ? " accent" : ""}"><circle cx="${node.x}" cy="${node.y}" r="8"/><text x="${node.x + 12}" y="${node.y - 12}">${escapeXml(node.label)}</text></g>`;
    }
    const charactersPerLine = Math.max(6, Math.floor((layout.nodeWidth - 25) / 13));
    const lines = labelLines(node.label, charactersPerLine);
    const text = lines.map((line, index) => `<tspan x="${node.x}" dy="${index ? 15 : 0}">${escapeXml(line)}</tspan>`).join("");
    return `<g class="node${node.accent ? " accent" : ""}" data-node-id="${escapeXml(node.id)}"><rect x="${node.x - layout.nodeWidth / 2}" y="${node.y - layout.nodeHeight / 2}" width="${layout.nodeWidth}" height="${layout.nodeHeight}" rx="15"/><text x="${node.x}" y="${node.y - (lines.length > 1 ? 6 : -4)}">${text}</text></g>`;
  }).join("");

  return {
    id: randomUUID(),
    type: "diagram",
    kind: input.kind,
    title,
    summary,
    created_at: new Date().toISOString(),
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" role="img" aria-label="${escapeXml(title)}"${input.kind === "coordinate" ? "" : ' data-layout="auto-hierarchy"'}><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none"/></pattern></defs><style>.bg{fill:#f8f7f1}.grid{fill:url(#grid);opacity:.42}.grid+rect{fill:none}.grid,path{stroke:#d7d5ca}.title{font:600 24px system-ui;fill:#20241d}.subtitle{font:13px system-ui;fill:#74786e}.edge path,.axes path{fill:none;stroke:#6d7367;stroke-width:2.2}.edge text,.axes text,.point text{font:11px system-ui;fill:#666b61;text-anchor:middle}.edge text{paint-order:stroke;stroke:#f8f7f1;stroke-width:6px;stroke-linejoin:round}.node rect{fill:#fffefa;stroke:#bfc2b8;stroke-width:1.5}.node.accent rect{fill:#d7ff5e;stroke:#a9d51f}.node text{font:600 12px system-ui;fill:#242820;text-anchor:middle}.point circle{fill:#fffefa;stroke:#20241d;stroke-width:3}.point.accent circle{fill:#d7ff5e}.point text{text-anchor:start}.axes path{stroke:#343831;marker-end:url(#arrow)}marker path{fill:#343831;stroke:none}</style><rect class="bg" width="800" height="480"/><rect class="grid" x="56" y="58" width="688" height="366" rx="18"/><text class="title" x="56" y="34">${escapeXml(title)}</text><text class="subtitle" x="744" y="34" text-anchor="end">${escapeXml(input.kind.replaceAll("_", " "))}</text>${axes}${edgeSvg}${nodeSvg}</svg>`,
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
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  throw new Error(`不支持的视觉证据格式：${extension || "未知格式"}`);
}

interface VisualEvidence {
  id: string;
  label: string;
  file: string;
  path: string;
  root: string;
}

function visualCatalog(images: PiImage[]): VisualEvidence[] {
  return images.slice(0, MAX_VISUAL_EVIDENCE).map((image, index) => ({
    id: `evidence-${index + 1}`,
    label: image.label,
    file: image.path.split(/[\\/]/).pop() ?? `frame-${index + 1}`,
    path: image.path,
    root: image.root,
  }));
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate));
  return path === "" || (!path.startsWith("..") && !path.startsWith("/") && !path.startsWith("\\"));
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++]!;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (startOfFrame.has(marker) && length >= 7) {
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return undefined;
}

function webpDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return undefined;
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    return {
      width: 1 + (((bytes[22]! & 0x3f) << 8) | bytes[21]!),
      height: 1 + (((bytes[24]! & 0x0f) << 10) | (bytes[23]! << 2) | ((bytes[22]! & 0xc0) >> 6)),
    };
  }
  return undefined;
}

function inspectImage(bytes: Buffer): { mimeType: string; width: number; height: number } | undefined {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 10 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) {
    return { mimeType: "image/gif", width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  const jpeg = jpegDimensions(bytes);
  if (jpeg) return { mimeType: "image/jpeg", ...jpeg };
  const webp = webpDimensions(bytes);
  if (webp) return { mimeType: "image/webp", ...webp };
  return undefined;
}

async function loadVisualEvidence(item: VisualEvidence): Promise<ImageContent> {
  try {
    const [root, path] = await Promise.all([realpath(resolve(item.root)), realpath(resolve(item.path))]);
    if (!isInside(root, path)) throw new Error("evidence outside root");
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size > MAX_IMAGE_BYTES) throw new Error("invalid evidence file");
    const bytes = await readFile(path);
    const inspected = inspectImage(bytes);
    if (!inspected || inspected.mimeType !== mimeTypeFor(path)) throw new Error("invalid image signature");
    if (
      inspected.width < 1 || inspected.height < 1
      || inspected.width > MAX_IMAGE_DIMENSION || inspected.height > MAX_IMAGE_DIMENSION
      || inspected.width * inspected.height > MAX_IMAGE_PIXELS
    ) {
      throw new Error("invalid image dimensions");
    }
    return { type: "image", data: bytes.toString("base64"), mimeType: inspected.mimeType };
  } catch {
    throw new Error(`视觉证据 ${item.id} 无法安全读取或不符合图片限制`);
  }
}

function normalizeHistoryTurn(turn: { question: string; answer: string }): { question: string; answer: string } | undefined {
  const question = String(turn.question ?? "").trim().slice(0, 3_000);
  const answer = String(turn.answer ?? "").trim().slice(0, 6_000);
  return question && answer ? { question, answer } : undefined;
}

export function compactTutorHistory(history: Array<{ question: string; answer: string }>): {
  turns: Array<{ question: string; answer: string }>;
  summarizedTurnCount: number;
} {
  const normalized = history.flatMap((turn) => {
    const clean = normalizeHistoryTurn(turn);
    return clean ? [clean] : [];
  });
  if (!normalized.length) return { turns: [], summarizedTurnCount: 0 };

  const recentBudget = HISTORY_CHAR_BUDGET - HISTORY_SUMMARY_CHAR_BUDGET;
  let used = 0;
  let firstKeptIndex = normalized.length;
  const recent: Array<{ question: string; answer: string }> = [];
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const turn = normalized[index]!;
    const size = turn.question.length + turn.answer.length + 64;
    if (recent.length >= 2 && used + size > recentBudget) break;
    recent.unshift(turn);
    firstKeptIndex = index;
    used += size;
  }

  const older = normalized.slice(0, firstKeptIndex);
  if (!older.length) return { turns: recent, summarizedTurnCount: 0 };
  const summaryLines: string[] = [];
  let summarySize = 0;
  for (let index = older.length - 1; index >= 0; index -= 1) {
    const turn = older[index]!;
    const line = `- 问：${short(turn.question, 180)}\n  答：${short(turn.answer, 360)}`;
    if (summaryLines.length && summarySize + line.length > HISTORY_SUMMARY_CHAR_BUDGET) break;
    summaryLines.unshift(line);
    summarySize += line.length;
  }
  const omittedTurnCount = Math.max(0, older.length - summaryLines.length);
  return {
    turns: [{
      question: `[系统整理的较早对话摘要，覆盖 ${summaryLines.length}/${older.length} 轮]`,
      answer: [
        omittedTurnCount ? `另有 ${omittedTurnCount} 轮因上下文预算未展开。` : "",
        summaryLines.join("\n"),
      ].filter(Boolean).join("\n"),
    }, ...recent],
    summarizedTurnCount: older.length,
  };
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

const TOOL_LABELS: Record<string, string> = {
  load_teaching_skill: "读取教学 Skill",
  inspect_visual_evidence: "检查课堂证据",
  draw_teaching_diagram: "绘制教学图示",
  submit_tutor_answer: "提交教学回答",
};

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function buildSystemPrompt(input: PiRunInput): string {
  const visualEvidence = visualCatalog(input.images).map(({ id, label, file }) => ({ id, label, file }));
  return [
    "# SkyClass 教学运行时",
    "你是直接面向学生授课的老师，不是教案生成器。先诊断卡点，再给直观解释、精确定义、例子和一个小检查。",
    "全程使用第二人称‘你’，禁止输出‘教师可以’或‘让学生’。",
    "Skill 是教学策略而不是事实来源。只能引用本轮真实提供的课堂证据。",
    "answer 只能包含自然、直接的学生讲解。不得向学生提及 Skill、课堂关键帧、视觉证据、工具调用、模型或运行时；这些信息只用于内部决定怎样教。",
    input.skills.length
      ? `候选 Skill 目录：${catalog(input.skills)}\n候选目录不保证与本题相关。只有 Skill 的教学目标和当前问题直接相关时才调用 load_teaching_skill；若没有直接相关 Skill，必须跳过，严禁生搬硬套。`
      : "这是无 Skill 基线，不得声称使用课堂 Skill。",
    visualEvidence.length
      ? `本轮是多模态教学实验。可用视觉证据目录：${JSON.stringify(visualEvidence)}\n提交答案前必须调用 inspect_visual_evidence，并且只选择真正需要看的 evidence_ids。`
      : "本轮没有课堂关键帧，不得虚构视觉证据。",
    "当问题涉及空间关系、运动轨迹、受力、坐标变化、步骤流程或概念关系时，优先调用 draw_teaching_diagram；图示会直接出现在学生黑板中。不要为普通事实问答强行画图。",
    "受力问题必须使用 kind=force，并填写 surface、incline_angle 与 forces：实际力 role=actual；mg sinθ、mg cosθ 只能作为 role=component。禁止用概念节点框代替力箭头，禁止把重力及其分量同时当作三个外力。",
    "位移、路程、运动路径或闭环运动必须使用 kind=trajectory，严禁使用 coordinate。nodes 按真实空间位置给坐标；edges 按运动先后顺序填写连续的 role=route 路径边，并且只能再加一条从路径起点直接指向路径终点的 role=displacement 位移边。若回到起点，最后一条 route 必须闭合到起点，displacement 使用起点到自身并标注“位移 = 0”。",
    `最多执行 ${MAX_TOOL_CALLS} 次工具调用，完成后立即作答。`,
    "learning_checks 中每项只写一个等待学生回答的问题，严禁附带正确回答、参考答案、答案提示或判分结论。success_criteria 与问题对应，只写给系统使用的内部判断标准，不得复述进 answer。",
    "完成教学工具调用后，必须调用 submit_tutor_answer 提交最终结果；不要在普通文本中输出 JSON。",
  ].join("\n\n");
}

function makeTeachingTools(
  input: PiRunInput,
  artifacts: TeachingArtifact[],
  attemptedEvidenceIds: Set<string>,
  inspectedEvidenceIds: Set<string>,
  usedSkillKeys: Set<string>,
  submitAnswer: (answer: JsonObject) => void,
): AgentTool[] {
  const skills = new Map(input.skills.map((skill) => [skill.key, skill]));
  const visualEvidence = visualCatalog(input.images);
  const tools: AgentTool[] = [{
      name: "draw_teaching_diagram",
      label: "Draw Teaching Diagram",
      description: "把运动轨迹、空间关系、受力关系、概念联系或过程步骤绘制成学生可见图示。只在图比纯文字更清楚时调用。运动轨迹必须用 trajectory，坐标函数/图像才用 coordinate。",
      parameters: Type.Object({
        title: Type.String({ description: "简短图名" }),
        summary: Type.String({ description: "这张图帮助学生看清什么" }),
        kind: Type.Union([
          Type.Literal("concept_map"),
          Type.Literal("process"),
          Type.Literal("force"),
          Type.Literal("coordinate"),
          Type.Literal("trajectory"),
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
          x: Type.Optional(Type.Number({ minimum: 0, maximum: 100, description: "coordinate 或 trajectory 使用的横向位置百分比" })),
          y: Type.Optional(Type.Number({ minimum: 0, maximum: 100, description: "coordinate 或 trajectory 使用的纵向位置百分比" })),
          accent: Type.Optional(Type.Boolean()),
        }), { minItems: 1, maxItems: 10 }),
        edges: Type.Array(Type.Object({
          from: Type.String(),
          to: Type.String(),
          label: Type.Optional(Type.String()),
          role: Type.Optional(Type.Union([
            Type.Literal("relation"),
            Type.Literal("route"),
            Type.Literal("displacement"),
          ], { description: "trajectory 必填：实际路径用 route，起点直达终点的位移用 displacement；其他图可用 relation" })),
        }), { maxItems: 18, description: "trajectory 中先按时间顺序列连续 route 边，最后列唯一 displacement 边" }),
      }),
      executionMode: "sequential",
      async execute(_id, params, signal) {
        signal?.throwIfAborted();
        const artifact = renderTeachingDiagram(params as DiagramInput);
        artifacts.push(artifact);
        return {
          content: [{ type: "text", text: `已在学生黑板生成「${artifact.title}」，产物编号 ${artifact.id}。请结合图示继续解释。` }],
          details: { artifact_id: artifact.id, artifact_title: artifact.title, artifact_kind: artifact.kind },
        };
      },
    }];

  if (skills.size) {
    tools.push({
        name: "load_teaching_skill",
        label: "Load Teaching Skill",
        description: "读取候选教学 Skill。只有其教学目标与当前问题直接相关时调用；没有直接相关 Skill 时不要调用。",
        parameters: Type.Object({ skill_key: Type.String({ description: "候选 Skill 的 key" }) }),
        executionMode: "sequential",
        async execute(_id, params, signal) {
          signal?.throwIfAborted();
          const skillKey = String(recordOf(params).skill_key ?? "");
          const skill = skills.get(skillKey);
          if (!skill) throw new Error(`未知 Skill：${skillKey}`);
          usedSkillKeys.add(skillKey);
          return { content: [{ type: "text", text: JSON.stringify(skill) }], details: { found: true, skill_key: skillKey } };
        },
      });
  }

  if (visualEvidence.length) {
    tools.push({
        name: "inspect_visual_evidence",
        label: "Inspect Visual Evidence",
        description: "按 evidence_ids 读取真正需要检查的课堂关键帧；工具会把选中的图像像素返回给你。",
        parameters: Type.Object({
          evidence_ids: Type.Array(Type.String(), {
            minItems: 1,
            maxItems: MAX_VISUAL_EVIDENCE,
            description: "从系统给出的视觉证据目录中选择，禁止编造 ID",
          }),
        }),
        executionMode: "sequential",
        async execute(_id, params, signal) {
          signal?.throwIfAborted();
          const requestedIds = Array.isArray(recordOf(params).evidence_ids)
            ? [...new Set((recordOf(params).evidence_ids as unknown[]).map(String))]
            : [];
          requestedIds.forEach((id) => attemptedEvidenceIds.add(id));
          const selected = requestedIds.map((id) => {
            const evidence = visualEvidence.find((item) => item.id === id);
            if (!evidence) throw new Error(`未知视觉证据：${id}`);
            return evidence;
          });
          const images = await Promise.all(selected.map(loadVisualEvidence));
          selected.forEach((item) => inspectedEvidenceIds.add(item.id));
          return {
            content: [
              { type: "text", text: JSON.stringify(selected.map(({ id, label, file }) => ({ id, label, file }))) },
              ...images,
            ],
            details: { count: selected.length, evidence_ids: selected.map((item) => item.id) },
          };
        },
      });
  }
  tools.push({
    name: "submit_tutor_answer",
    label: "Submit Tutor Answer",
    description: "提交最终面向学生的讲解与学习检查。所有教学工具调用完成后必须调用一次。",
    parameters: Type.Object({
      answer: Type.String({ minLength: 1, description: "面向学生的自然 Markdown 讲解，不得包含 JSON 外壳或内部运行信息" }),
      assumptions: Type.Array(Type.String(), { maxItems: 8 }),
      learning_checks: Type.Array(Type.String({ description: "只写等待学生回答的问题，不附答案" }), { maxItems: 4 }),
      success_criteria: Type.Array(Type.String({ description: "与学习检查对应的内部判断标准" }), { maxItems: 4 }),
    }),
    executionMode: "sequential",
    async execute(_id, params, signal) {
      signal?.throwIfAborted();
      const value = recordOf(params);
      submitAnswer({
        answer: String(value.answer ?? "").trim(),
        assumptions: Array.isArray(value.assumptions) ? value.assumptions.map(String) : [],
        learning_checks: Array.isArray(value.learning_checks) ? value.learning_checks.map(String) : [],
        success_criteria: Array.isArray(value.success_criteria) ? value.success_criteria.map(String) : [],
      });
      return {
        content: [{ type: "text", text: "教学回答已提交。" }],
        details: { submitted: true },
        terminate: true,
      };
    },
  });
  return tools;
}

function toolTrace(
  event: Extract<AgentEvent, { type: "tool_execution_end" }>,
  started?: { timestamp: number; argsSummary: string },
): TutorToolTrace {
  const result = recordOf(event.result);
  const details = recordOf(result.details);
  const artifactId = typeof details.artifact_id === "string" ? details.artifact_id : undefined;
  const endedAt = Date.now();
  const summaries: Record<string, string> = {
    load_teaching_skill: details.found ? "已读取教学 Skill" : "未找到教学 Skill",
    inspect_visual_evidence: `已检查 ${Number(details.count ?? 0)} 条视觉证据`,
    draw_teaching_diagram: artifactId ? `已生成「${String(details.artifact_title ?? "教学图示")}」` : "图示生成失败",
  };
  return {
    id: event.toolCallId,
    tool: event.toolName,
    label: TOOL_LABELS[event.toolName] ?? event.toolName,
    ok: !event.isError,
    summary: event.isError ? `${TOOL_LABELS[event.toolName] ?? event.toolName}失败` : (summaries[event.toolName] ?? "工具执行完成"),
    ...(artifactId ? { artifact_id: artifactId } : {}),
    ...(typeof details.skill_key === "string" ? { skill_key: details.skill_key } : {}),
    ...(Array.isArray(details.evidence_ids) ? { evidence_ids: details.evidence_ids.map(String) } : {}),
    ...(started ? {
      started_at: new Date(started.timestamp).toISOString(),
      ended_at: new Date(endedAt).toISOString(),
      duration_ms: Math.max(0, endedAt - started.timestamp),
      args_summary: started.argsSummary,
    } : {}),
  };
}

function usageTotals(messages: readonly unknown[]): PiRunOutput["usage"] {
  const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
  for (const message of messages) {
    if (recordOf(message).role !== "assistant") continue;
    const usage = recordOf(recordOf(message).usage);
    total.input += Number(usage.input ?? 0);
    total.output += Number(usage.output ?? 0);
    total.cacheRead += Number(usage.cacheRead ?? 0);
    total.cacheWrite += Number(usage.cacheWrite ?? 0);
    total.totalTokens += Number(usage.totalTokens ?? 0);
  }
  return total;
}

function finalAssistantMessage(messages: readonly unknown[]): AssistantMessage | undefined {
  return [...messages].reverse().find((item): item is AssistantMessage => recordOf(item).role === "assistant");
}

function assistantText(message: AssistantMessage | undefined): string {
  return Array.isArray(message?.content)
    ? message.content.filter((item) => item.type === "text").map((item) => item.text).join("")
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
  const startedAt = Date.now();
  input.signal?.throwIfAborted();
  const toolCalls: PiRunOutput["toolCalls"] = [];
  const artifacts: TeachingArtifact[] = [];
  const attemptedEvidenceIds = new Set<string>();
  const inspectedEvidenceIds = new Set<string>();
  const usedSkillKeys = new Set<string>();
  let submittedAnswer: JsonObject | undefined;
  const providerId = "anyteacher-relay";
  const model: Model<"openai-completions"> = {
    id: input.modelId,
    name: input.modelId,
    api: "openai-completions",
    provider: providerId,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192,
    compat: { supportsDeveloperRole: false },
  };
  const models = createModels();
  models.setProvider(createProvider({
    id: providerId,
    name: "SkyClass model relay",
    baseUrl: model.baseUrl,
    auth: {
      apiKey: {
        name: "SkyClass model relay API key",
        resolve: async () => ({ auth: { apiKey: input.apiKey }, source: "SkyClass runtime settings" }),
      },
    },
    models: [model],
    api: openAICompletionsApi(),
  }));

  const tools = makeTeachingTools(input, artifacts, attemptedEvidenceIds, inspectedEvidenceIds, usedSkillKeys, (answer) => { submittedAnswer = answer; });
  const allowedTools = new Set(tools.map((tool) => tool.name));
  let approvedToolCalls = 0;
  let emittedTextUpdate = false;
  const historyBudget = compactTutorHistory(input.history ?? []);
  const history = historyBudget.turns.flatMap((turn) => ([
    { role: "user" as const, content: turn.question, timestamp: Date.now() },
    {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: turn.answer }],
      api: "openai-completions" as const,
      provider: providerId,
      model: input.modelId,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop" as const,
      timestamp: Date.now(),
    },
  ]));
  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(input),
      model,
      thinkingLevel: "off",
      tools,
      messages: history,
    },
    sessionId: input.sessionId ?? randomUUID(),
    toolExecution: "sequential",
    maxRetryDelayMs: 30_000,
    streamFn: (activeModel, context, options) => models.streamSimple(activeModel, context, {
      ...options,
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      ...(input.maxRetries === undefined ? {} : { maxRetries: input.maxRetries }),
    }),
    beforeToolCall: async ({ toolCall }) => {
      if (!allowedTools.has(toolCall.name)) {
        return { block: true, reason: "SkyClass 教学运行时只允许教学专用的受控工具。" };
      }
      if (toolCall.name === "submit_tutor_answer") return undefined;
      if (approvedToolCalls >= MAX_TOOL_CALLS) {
        return { block: true, reason: `本轮最多执行 ${MAX_TOOL_CALLS} 次教学工具调用，请直接完成讲解。` };
      }
      approvedToolCalls += 1;
      return undefined;
    },
    prepareNextTurnWithContext: ({ context }) => approvedToolCalls >= MAX_TOOL_CALLS
      ? { context: { ...context, tools: context.tools?.filter((tool) => tool.name === "submit_tutor_answer") } }
      : undefined,
    shouldStopAfterTurn: () => submittedAnswer !== undefined,
  });

  const abort = () => agent.abort();
  input.signal?.addEventListener("abort", abort, { once: true });
  try {
    const prompt = [
      `学科：${input.subject}`,
      `学生的问题或学习任务：${input.question}`,
      input.images.length ? `随请求提供了 ${input.images.length} 张课堂关键帧。` : "",
    ].filter(Boolean).join("\n\n");
    let output = "";
    const toolStarts = new Map<string, { timestamp: number; argsSummary: string }>();
    const unsubscribe = agent.subscribe(async (event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        output += event.assistantMessageEvent.delta;
        if (emittedTextUpdate) return;
        emittedTextUpdate = true;
      }
      const runtimeEvent: TutorRuntimeEvent = { type: event.type, timestamp: new Date().toISOString() };
      if (event.type === "message_start" || event.type === "message_end") {
        runtimeEvent.message_role = String(recordOf(event.message).role ?? "");
      }
      if (event.type === "tool_execution_start" || event.type === "tool_execution_update") {
        runtimeEvent.tool_call_id = event.toolCallId;
        runtimeEvent.tool_name = event.toolName;
        if (event.type === "tool_execution_start") {
          toolStarts.set(event.toolCallId, {
            timestamp: Date.now(),
            argsSummary: short(JSON.stringify(event.args ?? {}), 600),
          });
        }
      }
      if (event.type === "tool_execution_end") {
        runtimeEvent.tool_call_id = event.toolCallId;
        runtimeEvent.tool_name = event.toolName;
        runtimeEvent.is_error = event.isError;
        if (event.toolName !== "submit_tutor_answer") {
          const trace = toolTrace(event, toolStarts.get(event.toolCallId));
          toolCalls.push(trace);
          runtimeEvent.trace = trace;
          runtimeEvent.artifact = trace.artifact_id ? artifacts.find((item) => item.id === trace.artifact_id) : undefined;
        }
      }
      try {
        await input.onEvent?.(runtimeEvent);
      } catch {
        // Observability must not be able to terminate an otherwise healthy agent run.
      }
    });
    try {
      await agent.prompt(prompt);
    } finally {
      unsubscribe();
    }
    const finalMessage = finalAssistantMessage(agent.state.messages);
    if (!finalMessage) throw new Error("Pi Agent 没有产生最终回答");
    if (finalMessage.stopReason === "error" || finalMessage.stopReason === "aborted") {
      throw new Error(finalMessage.errorMessage || (finalMessage.stopReason === "aborted" ? "Pi Agent 运行已取消" : "Pi Agent 模型请求失败"));
    }
    if (finalMessage.stopReason === "length") throw new Error("Pi Agent 回答被模型长度上限截断，请缩短上下文后重试");
    if (!submittedAnswer) throw new Error("Pi Agent 未按协议提交结构化教学回答");
    output = assistantText(finalMessage) || output;
    return {
      answer: submittedAnswer,
      toolCalls,
      toolCallCount: toolCalls.length,
      visualCount: inspectedEvidenceIds.size,
      attemptedVisualCount: attemptedEvidenceIds.size,
      candidateVisualCount: visualCatalog(input.images).length,
      usedSkillKeys: [...usedSkillKeys],
      stopReason: String(finalMessage?.stopReason ?? ""),
      durationMs: Math.max(0, Date.now() - startedAt),
      usage: usageTotals(agent.state.messages),
      artifacts,
    };
  } finally {
    input.signal?.removeEventListener("abort", abort);
  }
}
