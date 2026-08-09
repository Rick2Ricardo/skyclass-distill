import { readFile } from "node:fs/promises";
import { extname } from "node:path";

export interface LlmOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutSeconds?: number;
  maxAttempts?: number;
}

export interface ImageInput { label: string; path: string }

function endpoint(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  return /\/chat\/completions$/i.test(normalized) ? normalized : `${normalized}/chat/completions`;
}

function mime(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/jpeg";
}

export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  const cleaned = String(value ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(cleaned) as Record<string, unknown>; } catch { /* search below */ }
  for (let start = cleaned.indexOf("{"); start >= 0; start = cleaned.indexOf("{", start + 1)) {
    for (let end = cleaned.lastIndexOf("}"); end > start; end = cleaned.lastIndexOf("}", end - 1)) {
      try { return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>; } catch { /* continue */ }
    }
  }
  throw new Error("模型没有返回有效 JSON");
}

export class LlmClient {
  constructor(readonly options: LlmOptions) {}

  get configured(): boolean {
    return Boolean(this.options.baseUrl && this.options.apiKey && this.options.model);
  }

  async chatJson(system: string, user: string, images: ImageInput[] = [], temperature = 0): Promise<Record<string, unknown>> {
    if (!this.configured) throw new Error("LLM API 尚未配置");
    const content: Array<Record<string, unknown>> = [{ type: "text", text: user }];
    for (const image of images.slice(0, 4)) {
      const data = (await readFile(image.path)).toString("base64");
      content.push({ type: "image_url", image_url: { url: `data:${mime(image.path)};base64,${data}` } });
    }
    const messages = [
      { role: "system", content: system },
      { role: "user", content: images.length ? content : user },
    ];
    const attempts = Math.max(1, this.options.maxAttempts ?? 3);
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(endpoint(this.options.baseUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.apiKey}` },
          body: JSON.stringify({ model: this.options.model, messages, temperature }),
          signal: AbortSignal.timeout((this.options.timeoutSeconds ?? 240) * 1000),
        });
        const raw = await response.json().catch(() => ({})) as Record<string, any>;
        if (!response.ok) throw new Error(String(raw.error?.message ?? raw.detail ?? `HTTP ${response.status}`));
        const text = raw.choices?.[0]?.message?.content;
        return parseJsonObject(text);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async test(): Promise<{ ok: true; message: string; model: string }> {
    await this.chatJson("只输出 JSON。", "返回 {\"ok\":true}");
    return { ok: true, message: `模型连接成功：${this.options.model}`, model: this.options.model };
  }
}
