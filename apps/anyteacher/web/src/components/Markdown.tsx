import * as katex from "katex";
import type { ReactNode } from "react";
import "katex/dist/katex.min.css";

type Block = { type: "line" | "math"; value: string };

export function normalizeMarkdownSource(source: string): string {
  let value = source.trim();
  for (let depth = 0; depth < 3; depth += 1) {
    const cleaned = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    if (!cleaned.startsWith("{") || !cleaned.endsWith("}")) break;
    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      if (typeof parsed.answer !== "string" || parsed.answer.trim() === value) break;
      value = parsed.answer.trim();
    } catch {
      break;
    }
  }
  return value.replace(/\r\n?/g, "\n");
}

function MathFormula({ value, display = false }: { value: string; display?: boolean }) {
  const html = katex.renderToString(value.trim(), {
    displayMode: display,
    throwOnError: false,
    strict: "ignore",
    output: "htmlAndMathml",
  });
  const Tag = display ? "div" : "span";
  return <Tag className={display ? "math-block" : "math-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
}

function inline(value: string): ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`|\\\(.+?\\\)|\$[^$\n]+\$)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("\\(") && part.endsWith("\\)")) return <MathFormula key={index} value={part.slice(2, -2)} />;
    if (part.startsWith("$") && part.endsWith("$")) return <MathFormula key={index} value={part.slice(1, -1)} />;
    return part;
  });
}

function blocks(source: string): Block[] {
  const result: Block[] = [];
  const pattern = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    source.slice(cursor, index).split("\n").forEach((line) => result.push({ type: "line", value: line }));
    result.push({ type: "math", value: match[1] ?? match[2] ?? "" });
    cursor = index + match[0].length;
  }
  source.slice(cursor).split("\n").forEach((line) => result.push({ type: "line", value: line }));
  return result;
}

export function Markdown({ children }: { children: string }) {
  const content = normalizeMarkdownSource(children);
  return <div className="markdown">{blocks(content).map((block, index) => {
    const line = block.value;
    if (block.type === "math") return <MathFormula display key={index} value={line} />;
    if (/^###\s/.test(line)) return <h4 key={index}>{inline(line.replace(/^###\s/, ""))}</h4>;
    if (/^##\s/.test(line)) return <h3 key={index}>{inline(line.replace(/^##\s/, ""))}</h3>;
    if (/^#\s/.test(line)) return <h2 key={index}>{inline(line.replace(/^#\s/, ""))}</h2>;
    if (/^[-*_]{3,}\s*$/.test(line)) return <hr key={index} />;
    if (/^[-*]\s/.test(line)) return <div className="markdown-list" key={index}><span>•</span><p>{inline(line.replace(/^[-*]\s/, ""))}</p></div>;
    if (/^\d+[.)]\s/.test(line)) return <div className="markdown-list ordered" key={index}><span>{line.match(/^\d+/)?.[0]}.</span><p>{inline(line.replace(/^\d+[.)]\s/, ""))}</p></div>;
    if (/^>\s?/.test(line)) return <blockquote key={index}>{inline(line.replace(/^>\s?/, ""))}</blockquote>;
    if (!line.trim()) return <div className="markdown-space" key={index} />;
    return <p key={index}>{inline(line)}</p>;
  })}</div>;
}
