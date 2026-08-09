import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type {
  TutorConversation,
  TutorConversationSummary,
  TutorMode,
  TutorResult,
  TutorTurn,
} from "../../contracts/src/index.js";
import { listJson, readJson, writeJson } from "./fileStore.js";

function now(): string { return new Date().toISOString(); }
function id(bytes = 8): string { return randomBytes(bytes).toString("hex"); }

function safeId(value: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(value)) throw new Error("会话不存在");
  return value;
}

function automaticTitle(question: string): string {
  const compact = question.replace(/\s+/g, " ").trim();
  return compact.length > 28 ? `${compact.slice(0, 28)}…` : compact;
}

function summary(conversation: TutorConversation): TutorConversationSummary {
  const last = conversation.turns.at(-1);
  return {
    id: conversation.id,
    project_id: conversation.project_id,
    title: conversation.title,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    turn_count: conversation.turns.length,
    artifact_count: conversation.turns.reduce((count, turn) => count + turn.result.artifacts.length, 0),
    last_question: last?.question,
  };
}

export class ConversationStore {
  readonly directory: string;

  constructor(dataDir: string) { this.directory = join(dataDir, "conversations"); }

  private path(conversationId: string): string {
    return join(this.directory, `${safeId(conversationId)}.json`);
  }

  async create(projectId: string, title = "新教学会话"): Promise<TutorConversation> {
    const timestamp = now();
    const conversation: TutorConversation = {
      id: id(),
      project_id: projectId,
      title: title.trim() || "新教学会话",
      created_at: timestamp,
      updated_at: timestamp,
      turns: [],
    };
    await writeJson(this.path(conversation.id), conversation);
    return conversation;
  }

  async get(projectId: string, conversationId: string): Promise<TutorConversation> {
    const conversation = await readJson<TutorConversation>(this.path(conversationId));
    if (conversation.project_id !== projectId) throw new Error("会话不存在");
    return conversation;
  }

  async list(projectId: string): Promise<TutorConversationSummary[]> {
    const conversations = await listJson<TutorConversation>(this.directory);
    return conversations
      .filter((item) => item.project_id === projectId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(summary);
  }

  async rename(projectId: string, conversationId: string, title: string): Promise<TutorConversation> {
    const conversation = await this.get(projectId, conversationId);
    const nextTitle = title.replace(/\s+/g, " ").trim();
    if (!nextTitle) throw new Error("会话名称不能为空");
    conversation.title = nextTitle.slice(0, 80);
    conversation.updated_at = now();
    await writeJson(this.path(conversation.id), conversation);
    return conversation;
  }

  async append(projectId: string, conversationId: string, question: string, mode: TutorMode, result: TutorResult): Promise<TutorConversation> {
    const conversation = await this.get(projectId, conversationId);
    const turn: TutorTurn = { id: id(6), created_at: now(), question, mode, result };
    conversation.turns.push(turn);
    if (conversation.turns.length === 1 && conversation.title === "新教学会话") conversation.title = automaticTitle(question);
    conversation.updated_at = turn.created_at;
    await writeJson(this.path(conversation.id), conversation);
    return conversation;
  }

  async delete(projectId: string, conversationId: string): Promise<void> {
    await this.get(projectId, conversationId);
    await rm(this.path(conversationId), { force: true });
  }
}
