import { describe, expect, it } from "vitest";
import { parseJsonObject } from "./client.js";

describe("parseJsonObject", () => {
  it("accepts fenced and embedded model JSON", () => {
    expect(parseJsonObject("```json\n{\"ok\":true}\n```")).toEqual({ ok: true });
    expect(parseJsonObject("分析如下：{\"value\":2} 完成")).toEqual({ value: 2 });
  });

  it("rejects output without a complete object", () => {
    expect(() => parseJsonObject("not json")).toThrow("模型没有返回有效 JSON");
  });
});
