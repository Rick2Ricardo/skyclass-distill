import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeSettings } from "../../contracts/src/index.js";
import { readJson, writeJson } from "../../store/src/fileStore.js";

export interface PrivateSettings extends RuntimeSettings {
  llm_api_key: string;
  llm_base_url: string;
  llm_model: string;
  llm_timeout_seconds: number;
  llm_max_attempts: number;
  whisper_model: string;
  whisper_command: string;
  whisper_model_path: string;
  max_upload_size_mb: number;
}

function dotenv(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const path = join(root, ".env");
  if (!existsSync(path)) return result;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?([^"']*)["']?\s*$/);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}

export class SettingsStore {
  readonly path: string;
  private readonly env: Record<string, string>;

  constructor(readonly root: string, readonly dataDir: string) {
    this.path = join(dataDir, "runtime_settings.json");
    this.env = { ...dotenv(root), ...process.env } as Record<string, string>;
  }

  async private(): Promise<PrivateSettings> {
    const saved = await readJson<Record<string, unknown>>(this.path, {});
    const string = (key: string, envKey: string, fallback = "") => String(saved[key] ?? this.env[envKey] ?? fallback);
    const number = (key: string, envKey: string, fallback: number) => Number(saved[key] ?? this.env[envKey] ?? fallback);
    return {
      llm_base_url: string("llm_base_url", "LLM_BASE_URL"),
      llm_api_key: string("llm_api_key", "LLM_API_KEY"),
      llm_model: string("llm_model", "LLM_MODEL"),
      llm_timeout_seconds: number("llm_timeout_seconds", "LLM_TIMEOUT_SECONDS", 240),
      llm_max_attempts: number("llm_max_attempts", "LLM_MAX_ATTEMPTS", 3),
      whisper_model: string("whisper_model", "WHISPER_MODEL", "small"),
      whisper_command: string("whisper_command", "WHISPER_COMMAND"),
      whisper_model_path: string("whisper_model_path", "WHISPER_MODEL_PATH"),
      max_upload_size_mb: number("max_upload_size_mb", "MAX_UPLOAD_SIZE_MB", 4096),
    };
  }

  async public(): Promise<RuntimeSettings> {
    const settings = await this.private();
    return {
      llm_base_url: settings.llm_base_url,
      llm_api_key_hint: settings.llm_api_key ? `${settings.llm_api_key.slice(0, 3)}…${settings.llm_api_key.slice(-3)}` : "",
      llm_model: settings.llm_model,
      llm_timeout_seconds: settings.llm_timeout_seconds,
      llm_max_attempts: settings.llm_max_attempts,
      whisper_model: settings.whisper_model,
      whisper_command: settings.whisper_command,
      whisper_model_path: settings.whisper_model_path,
      max_upload_size_mb: settings.max_upload_size_mb,
    };
  }

  async save(values: Record<string, unknown>): Promise<RuntimeSettings> {
    const current = await readJson<Record<string, unknown>>(this.path, {});
    const allowed = new Set([
      "llm_base_url", "llm_api_key", "llm_model", "llm_timeout_seconds", "llm_max_attempts",
      "whisper_model", "whisper_command", "whisper_model_path", "max_upload_size_mb",
    ]);
    for (const [key, value] of Object.entries(values)) {
      if (!allowed.has(key) || value === undefined || value === null) continue;
      if (key === "llm_api_key" && value === "") continue;
      current[key] = value;
    }
    await writeJson(this.path, current);
    return this.public();
  }
}
