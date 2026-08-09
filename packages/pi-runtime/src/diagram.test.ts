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
