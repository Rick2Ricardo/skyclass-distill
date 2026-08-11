import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmClient } from "./client.js";

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function client(): LlmClient {
  return new LlmClient({ baseUrl: "https://example.invalid/v1", apiKey: "test-only", model: "vision-test", maxAttempts: 1 });
}

function textStream(text: string): string {
  const chunk = {
    id: "chatcmpl-visual-test",
    object: "chat.completion.chunk",
    created: 1,
    model: "vision-test",
    choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }],
  };
  const done = {
    ...chunk,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
  };
  return `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`;
}

afterEach(() => vi.unstubAllGlobals());

describe("LlmClient audited images", () => {
  it("places an evidence label directly before each image and returns a submitted-visual audit", async () => {
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: unknown }> };
      const user = body.messages.find((message) => message.role === "user")?.content as Array<Record<string, any>>;
      expect(user[1]).toMatchObject({ type: "text" });
      expect(String(user[1].text)).toContain("delta_id=delta-1");
      expect(user[2].type).toBe("image_url");
      expect(String(user[2].image_url.url)).toMatch(/^data:image\/png;base64,/);
      return new Response(textStream("{\"ok\":true}"), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    });
    vi.stubGlobal("fetch", fetch);
    const sha256 = createHash("sha256").update(PNG_1X1).digest("hex");
    const result = await client().chatJsonAudited("system", "user", [{
      label: "transition_id=t-1 delta_id=delta-1 evidence_ids=ev-delta",
      bytes: PNG_1X1,
      mime_type: "image/png",
      sha256,
    }]);
    expect(result.value).toEqual({ ok: true });
    expect(result.audit).toMatchObject({
      model: "vision-test",
      attempt_count: 1,
      provider_response_received: true,
      stop_reason: "stop",
      submitted_visuals: [{ sha256, mime_type: "image/png", byte_length: PNG_1X1.byteLength }],
      usage: { input: 12, output: 3, totalTokens: 15 },
    });
  });

  it("rejects a fifth image instead of silently truncating", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const images = Array.from({ length: 5 }, (_, index) => ({ label: `image-${index}`, bytes: PNG_1X1 }));
    await expect(client().chatJsonAudited("system", "user", images)).rejects.toThrow("最多允许 4 张图");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects caller-declared MIME or hash that does not match the bytes", async () => {
    await expect(client().chatJsonAudited("system", "user", [{
      label: "bad-mime",
      bytes: PNG_1X1,
      mime_type: "image/jpeg",
    }])).rejects.toThrow("MIME 与真实内容不匹配");
    await expect(client().chatJsonAudited("system", "user", [{
      label: "bad-hash",
      bytes: PNG_1X1,
      sha256: "0".repeat(64),
    }])).rejects.toThrow("SHA-256 不匹配");
  });

  it("rejects a toolUse stop even when the preceding text happens to be valid JSON", async () => {
    const fetch = vi.fn(async () => {
      const text = {
        id: "chatcmpl-tool-use",
        object: "chat.completion.chunk",
        created: 1,
        model: "vision-test",
        choices: [{
          index: 0,
          delta: {
            role: "assistant",
            content: "{\"ok\":true}",
            tool_calls: [{ index: 0, id: "call-1", type: "function", function: { name: "unexpected", arguments: "{}" } }],
          },
          finish_reason: null,
        }],
      };
      const done = { ...text, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] };
      return new Response(`data: ${JSON.stringify(text)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetch);
    await expect(client().chatJsonAudited("system", "user", [{ label: "visual", bytes: PNG_1X1 }]))
      .rejects.toThrow("toolUse");
  });

  it.each(["length", "tool_calls"])("rejects non-visual JSON ending with %s", async (finishReason) => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ finish_reason: finishReason, message: { content: "{\"ok\":true}" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(client().chatJsonAudited("system", "user"))
      .rejects.toThrow(finishReason);
  });
});
