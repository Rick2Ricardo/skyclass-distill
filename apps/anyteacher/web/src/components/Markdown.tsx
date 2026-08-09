import type { ReactNode } from "react";

function inline(value: string): ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export function Markdown({ children }: { children: string }) {
  const lines = children.split(/\r?\n/);
  return <div className="markdown">{lines.map((line, index) => {
    if (/^###\s/.test(line)) return <h4 key={index}>{inline(line.replace(/^###\s/, ""))}</h4>;
    if (/^##\s/.test(line)) return <h3 key={index}>{inline(line.replace(/^##\s/, ""))}</h3>;
    if (/^#\s/.test(line)) return <h2 key={index}>{inline(line.replace(/^#\s/, ""))}</h2>;
    if (/^[-*]\s/.test(line)) return <div className="markdown-list" key={index}><span>•</span><p>{inline(line.replace(/^[-*]\s/, ""))}</p></div>;
    if (!line.trim()) return <div className="markdown-space" key={index} />;
    return <p key={index}>{inline(line)}</p>;
  })}</div>;
}
