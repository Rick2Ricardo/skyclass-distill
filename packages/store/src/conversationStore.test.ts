import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TutorResult } from "../../contracts/src/index.js";
import { ConversationStore } from "./conversationStore.js";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function result(question: string): TutorResult {
  return {
    project_id: "project-a",
    question,
    mode: "multimodal_skill",
    modality: "multimodal",
    answer: {
      answer: "教学回答",
      assumptions: [],
      learning_check: { prompts: [], success_criteria: [] },
      student_response: "",
      assessment: { status: "open", feedback: "", evidence: [] },
      next_action: { type: "check", instruction: "", reason: "" },
      delivery: { requested: "multimodal", actual: "multimodal", actual_visual_count: 1, attempted_visual_count: 1, tool_call_count: 1, fallback_occurred: false, fallback_reason: "" },
    },
    selected_skills: [],
    execution_audit: { requested: "multimodal", actual: "multimodal", actual_visual_count: 1, attempted_visual_count: 1, tool_call_count: 1, fallback_occurred: false, fallback_reason: "" },
    tool_trace: [],
    artifacts: [{ id: "diagram-a", type: "diagram", kind: "force", title: "受力图", summary: "测试", svg: "<svg />", created_at: "2026-08-09T00:00:00.000Z" }],
  };
}

describe("ConversationStore", () => {
  it("persists turns, derives a title, and returns project-scoped summaries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "skyclass-conversations-"));
    created.push(directory);
    const store = new ConversationStore(directory);
    const conversation = await store.create("project-a");
    const updated = await store.append("project-a", conversation.id, "请画一张斜面受力分析图，并解释每个力", "multimodal_skill", result("请画一张斜面受力分析图，并解释每个力"));

    expect(updated.title).toBe("请画一张斜面受力分析图，并解释每个力");
    expect((await store.list("project-a"))[0]).toMatchObject({ turn_count: 1, artifact_count: 1 });
    await expect(store.get("project-b", conversation.id)).rejects.toThrow("会话不存在");
  });

  it("renames and deletes a conversation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "skyclass-conversations-"));
    created.push(directory);
    const store = new ConversationStore(directory);
    const conversation = await store.create("project-a");

    expect((await store.rename("project-a", conversation.id, "  牛顿定律复习  ")).title).toBe("牛顿定律复习");
    await store.delete("project-a", conversation.id);
    expect(await store.list("project-a")).toEqual([]);
  });
});
