import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown.js";

describe("Markdown", () => {
  it("renders inline TeX inside a learning-check card", () => {
    const html = renderToStaticMarkup(createElement(
      "div",
      { className: "learning-check" },
      createElement("span", null, "LEARNING CHECK"),
      createElement(Markdown, null, String.raw`你判断一下：\(mg\sin\theta\) 是实际外力吗？`),
    ));

    expect(html).toContain('class="math-inline"');
    expect(html).toContain('class="katex"');
    expect(html).toContain("mg");
    expect(html).not.toContain(String.raw`\(mg\sin\theta\)`);
  });

  it("keeps rendering TeX nested inside bold teaching text", () => {
    const html = renderToStaticMarkup(createElement(
      Markdown,
      null,
      String.raw`1. **重力 \(mg\)**`,
    ));

    expect(html).toContain("<strong>");
    expect(html).toContain('class="math-inline"');
    expect(html).not.toContain(String.raw`\(mg\)`);
  });
});
