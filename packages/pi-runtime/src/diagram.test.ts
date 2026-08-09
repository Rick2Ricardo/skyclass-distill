import { describe, expect, it } from "vitest";
import { normalizePiAnswer, renderTeachingDiagram } from "./index.js";

describe("renderTeachingDiagram", () => {
  it("renders a bounded diagram and escapes model-provided labels", () => {
    const artifact = renderTeachingDiagram({
      title: "位移 < 路程",
      summary: "区分两个概念",
      kind: "concept_map",
      nodes: [
        { id: "start", label: "起点 & A", x: -20, y: 20 },
        { id: "end", label: "终点 B", x: 120, y: 80, accent: true },
      ],
      edges: [{ from: "start", to: "end", label: "方向 >" }],
    });

    expect(artifact.type).toBe("diagram");
    expect(artifact.svg).toContain("位移 &lt; 路程");
    expect(artifact.svg).toContain("起点 &amp; A");
    expect(artifact.svg).toContain("方向 &gt;");
    expect(artifact.svg).not.toContain("x=\"-62\"");
  });

  it("adds axes for coordinate diagrams", () => {
    const artifact = renderTeachingDiagram({
      title: "速度图像",
      summary: "读取斜率",
      kind: "coordinate",
      nodes: [{ id: "a", label: "A", x: 50, y: 50 }],
      edges: [],
    });

    expect(artifact.svg).toContain('class="axes"');
    expect(artifact.kind).toBe("coordinate");
  });

  it("automatically lays out a concept hierarchy without overlapping nodes", () => {
    const artifact = renderTeachingDiagram({
      title: "内力外力取决于系统边界",
      summary: "先确定系统，再判断内力和外力",
      kind: "concept_map",
      nodes: [
        { id: "object", label: "研究对象是谁？", x: 20, y: 20, accent: true },
        { id: "boundary", label: "画系统边界", x: 22, y: 20, accent: true },
        { id: "internal", label: "内力", x: 30, y: 50 },
        { id: "change", label: "换研究对象", x: 32, y: 50 },
        { id: "external", label: "外力", x: 34, y: 50 },
        { id: "omit", label: "可暂不列入整体受力", x: 40, y: 75 },
        { id: "include", label: "必须列入整体受力", x: 42, y: 75, accent: true },
      ],
      edges: [
        { from: "object", to: "boundary", label: "先确定" },
        { from: "boundary", to: "internal", label: "边界内作用" },
        { from: "boundary", to: "change", label: "改变系统" },
        { from: "boundary", to: "external", label: "边界外作用" },
        { from: "internal", to: "omit", label: "整体分析" },
        { from: "external", to: "include", label: "必须计入" },
      ],
    });

    expect(artifact.svg).toContain('data-layout="auto-hierarchy"');
    expect(artifact.svg).toContain('class="edge"><path d="M');
    expect(artifact.svg).toContain(" C");

    const boxes = [...artifact.svg.matchAll(/<g class="node[^"]*" data-node-id="[^"]+"><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)]
      .map((match) => ({ x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) }));
    expect(boxes).toHaveLength(7);
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left];
        const b = boxes[right];
        expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
      }
    }
  });

  it("renders force diagrams as a physical free-body diagram instead of a node graph", () => {
    const artifact = renderTeachingDiagram({
      title: "斜面上物块的受力图",
      summary: "区分实际外力和重力分量",
      kind: "force",
      surface: "incline",
      incline_angle: 30,
      nodes: [{ id: "block", label: "物块", x: 50, y: 50 }],
      edges: [],
      forces: [
        { label: "重力", symbol: "mg", direction: "down", role: "actual" },
        { label: "支持力", symbol: "N", direction: "normal_out", role: "actual" },
        { label: "摩擦力", symbol: "f", direction: "up_slope", role: "actual" },
        { label: "沿斜面分量", symbol: "mg sin θ", direction: "down_slope", role: "component" },
        { label: "垂直斜面分量", symbol: "mg cos θ", direction: "normal_in", role: "component" },
      ],
    });

    expect(artifact.svg).toContain("FREE-BODY DIAGRAM");
    expect(artifact.svg).toContain("只画外力");
    expect(artifact.svg).toContain("重力分解（不是新增外力）");
    expect(artifact.svg).toContain("mg sin θ");
    expect(artifact.svg).not.toContain('class="node');
  });
});

describe("normalizePiAnswer", () => {
  it("unwraps a model response that encoded the answer JSON twice", () => {
    const nested = JSON.stringify({
      answer: "位移公式：\\[\\Delta x=x_B-x_A\\]",
      assumptions: ["沿直线运动"],
      learning_checks: ["位移有方向吗？"],
    });

    expect(normalizePiAnswer({ answer: nested })).toEqual({
      answer: "位移公式：\\[\\Delta x=x_B-x_A\\]",
      assumptions: ["沿直线运动"],
      learning_checks: ["位移有方向吗？"],
    });
  });
});
