import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createModels,
  createProvider,
  type ImageContent,
  type Model,
  type TextContent,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { inspectImageBytes, type SupportedImageMime } from "../../media/src/imageEvidence.js";

export interface LlmOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutSeconds?: number;
  maxAttempts?: number;
}

export interface LlmCallControl {
  transport?: "auto" | "pi";
  maxOutputTokens?: number;
  seed?: number;
  cacheRetention?: "none" | "short" | "long";
}

export interface ImageInput {
  label: string;
  path?: string;
  bytes?: Uint8Array;
  mime_type?: SupportedImageMime;
  sha256?: string;
}

export interface LlmSubmittedVisual {
  label: string;
  sha256: string;
  mime_type: SupportedImageMime;
  byte_length: number;
}

export interface LlmRequestAudit {
  request_sha256: string;
  model: string;
  attempt_count: number;
  submitted_visuals: LlmSubmittedVisual[];
  provider_response_received: true;
  stop_reason: string | null;
  usage: Record<string, unknown> | null;
  transport: "fetch" | "pi";
  temperature: number;
  max_output_tokens: number | null;
  seed: number | null;
  cache_retention: "none" | "short" | "long" | null;
  tools_policy: "none";
}

export interface AuditedJsonResponse {
  value: Record<string, unknown>;
  audit: LlmRequestAudit;
}

function endpoint(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  return /\/chat\/completions$/i.test(normalized) ? normalized : `${normalized}/chat/completions`;
}

function piBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/chat\/completions\/?$/i, "").replace(/\/+$/, "");
}

async function materializeImage(image: ImageInput): Promise<{ bytes: Buffer; visual: LlmSubmittedVisual }> {
  if (!image.label.trim()) throw new Error("ImageInput.label 不能为空");
  if (!image.bytes && !image.path) throw new Error(`图像 ${image.label} 缺少 bytes 或 path`);
  const bytes = image.bytes ? Buffer.from(image.bytes) : await readFile(String(image.path));
  const inspected = inspectImageBytes(bytes);
  if (image.mime_type && image.mime_type !== inspected.mime_type) throw new Error(`图像 ${image.label} MIME 与真实内容不匹配`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (image.sha256 && image.sha256 !== sha256) throw new Error(`图像 ${image.label} SHA-256 不匹配`);
  return {
    bytes,
    visual: { label: image.label, sha256, mime_type: inspected.mime_type, byte_length: bytes.byteLength },
  };
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
    return (await this.chatJsonAudited(system, user, images, temperature)).value;
  }

  async chatJsonAudited(
    system: string,
    user: string,
    images: ImageInput[] = [],
    temperature = 0,
    control: LlmCallControl = {},
  ): Promise<AuditedJsonResponse> {
    if (!this.configured) throw new Error("LLM API 尚未配置");
    if (images.length > 4) throw new Error("单次模型请求最多允许 4 张图；调用方必须显式分批，不能静默截断");
    const materialized = await Promise.all(images.map(materializeImage));
    const content: Array<Record<string, unknown>> = [{ type: "text", text: user }];
    for (const image of materialized) {
      content.push({ type: "text", text: `[VISUAL ${image.visual.label} sha256=${image.visual.sha256}]` });
      content.push({ type: "image_url", image_url: { url: `data:${image.visual.mime_type};base64,${image.bytes.toString("base64")}` } });
    }
    const messages = [
      { role: "system", content: system },
      { role: "user", content: materialized.length ? content : user },
    ];
    const requestSha256 = createHash("sha256").update(JSON.stringify({
      model: this.options.model,
      system,
      user,
      temperature,
      control: {
        transport: control.transport ?? "auto",
        max_output_tokens: control.maxOutputTokens ?? null,
        seed: control.seed ?? null,
        cache_retention: control.cacheRetention ?? null,
        tools_policy: "none",
      },
      visuals: materialized.map((item) => item.visual),
    })).digest("hex");
    if (materialized.length || control.transport === "pi") {
      return this.chatJsonAuditedWithPi(system, user, materialized, temperature, requestSha256, control);
    }
    const attempts = Math.max(1, this.options.maxAttempts ?? 3);
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(endpoint(this.options.baseUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.apiKey}` },
          body: JSON.stringify({
            model: this.options.model,
            messages,
            temperature,
            ...(control.maxOutputTokens ? { max_tokens: control.maxOutputTokens } : {}),
            ...(control.seed !== undefined ? { seed: control.seed } : {}),
          }),
          signal: AbortSignal.timeout((this.options.timeoutSeconds ?? 240) * 1000),
        });
        const raw = await response.json().catch(() => ({})) as Record<string, any>;
        if (!response.ok) throw new Error(String(raw.error?.message ?? raw.detail ?? `HTTP ${response.status}`));
        const finishReason = typeof raw.choices?.[0]?.finish_reason === "string" ? raw.choices[0].finish_reason : null;
        if (finishReason !== "stop") throw new Error(`模型请求未完整结束：${finishReason ?? "missing_finish_reason"}`);
        const text = raw.choices?.[0]?.message?.content;
        return {
          value: parseJsonObject(text),
          audit: {
            request_sha256: requestSha256,
            model: this.options.model,
            attempt_count: attempt,
            submitted_visuals: materialized.map((item) => item.visual),
            provider_response_received: true,
            stop_reason: finishReason,
            usage: raw.usage && typeof raw.usage === "object" && !Array.isArray(raw.usage) ? raw.usage : null,
            transport: "fetch",
            temperature,
            max_output_tokens: control.maxOutputTokens ?? null,
            seed: control.seed ?? null,
            cache_retention: control.cacheRetention ?? null,
            tools_policy: "none",
          },
        };
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async chatJsonAuditedWithPi(
    system: string,
    user: string,
    materialized: Array<{ bytes: Buffer; visual: LlmSubmittedVisual }>,
    temperature: number,
    requestSha256: string,
    control: LlmCallControl,
  ): Promise<AuditedJsonResponse> {
    const providerId = "anyteacher-llm-relay";
    const model: Model<"openai-completions"> = {
      id: this.options.model,
      name: this.options.model,
      api: "openai-completions",
      provider: providerId,
      baseUrl: piBaseUrl(this.options.baseUrl),
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200_000,
      maxTokens: 8_192,
      compat: { supportsDeveloperRole: false },
    };
    const models = createModels();
    models.setProvider(createProvider({
      id: providerId,
      name: "AnyTeacher LLM relay",
      baseUrl: model.baseUrl,
      auth: {
        apiKey: {
          name: "AnyTeacher LLM relay API key",
          resolve: async () => ({ auth: { apiKey: this.options.apiKey }, source: "AnyTeacher runtime settings" }),
        },
      },
      models: [model],
      api: openAICompletionsApi(),
    }));

    const content: Array<TextContent | ImageContent> = [{ type: "text", text: user }];
    for (const image of materialized) {
      content.push({ type: "text", text: `[VISUAL ${image.visual.label} sha256=${image.visual.sha256}]` });
      content.push({ type: "image", data: image.bytes.toString("base64"), mimeType: image.visual.mime_type });
    }
    const attempts = Math.max(1, this.options.maxAttempts ?? 3);
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await models.completeSimple(model, {
          systemPrompt: system,
          messages: [{ role: "user", content, timestamp: Date.now() }],
          tools: [],
        }, {
          apiKey: this.options.apiKey,
          temperature,
          maxTokens: control.maxOutputTokens,
          samplingParams: control.seed === undefined ? undefined : { seed: control.seed },
          cacheRetention: control.cacheRetention,
          timeoutMs: (this.options.timeoutSeconds ?? 240) * 1_000,
          maxRetries: 0,
        });
        if (response.stopReason !== "stop") {
          throw new Error(response.errorMessage ?? `模型请求未完整结束：${response.stopReason}`);
        }
        const text = response.content
          .filter((item): item is TextContent => item.type === "text")
          .map((item) => item.text)
          .join("");
        return {
          value: parseJsonObject(text),
          audit: {
            request_sha256: requestSha256,
            model: this.options.model,
            attempt_count: attempt,
            submitted_visuals: materialized.map((item) => item.visual),
            provider_response_received: true,
            stop_reason: response.stopReason,
            usage: response.usage as unknown as Record<string, unknown>,
            transport: "pi",
            temperature,
            max_output_tokens: control.maxOutputTokens ?? null,
            seed: control.seed ?? null,
            cache_retention: control.cacheRetention ?? null,
            tools_policy: "none",
          },
        };
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
