import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { writeJson } from "../../store/src/fileStore.js";
import { resolveTool } from "./tools.js";

const execFileAsync = promisify(execFile);

export interface TranscriptSegment { start: number; end: number; text: string }
export interface Transcript {
  text: string;
  segments: TranscriptSegment[];
  language?: string;
  duration?: number;
  engine?: string;
  model?: string;
}

function timestamp(seconds: number, srt = false): string {
  const millis = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor((millis % 3_600_000) / 60_000);
  const secs = Math.floor((millis % 60_000) / 1000);
  const ms = millis % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${srt ? "," : "."}${String(ms).padStart(3, "0")}`;
}

async function remoteTranscribe(audioPath: string, baseUrl: string, apiKey: string, model: string): Promise<Transcript> {
  const endpoint = `${baseUrl.replace(/\/+$/, "").replace(/\/chat\/completions$/i, "")}/audio/transcriptions`;
  const data = await readFile(audioPath);
  const form = new FormData();
  form.append("file", new Blob([data]), basename(audioPath));
  form.append("model", model || "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(30 * 60_000) });
  const raw = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) throw new Error(String(raw.error?.message ?? raw.detail ?? `Transcription HTTP ${response.status}`));
  const segments = Array.isArray(raw.segments) ? raw.segments.map((item: any) => ({ start: Number(item.start), end: Number(item.end), text: String(item.text ?? "").trim() })) : [];
  return { text: String(raw.text ?? ""), segments, language: raw.language, duration: Number(raw.duration ?? 0), engine: "openai-compatible", model };
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function timeSeconds(value: unknown): number {
  const match = String(value ?? "").match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!match) return 0;
  const fraction = Number(match[4].padEnd(3, "0").slice(0, 3)) / 1000;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + fraction;
}

export function parseWhisperCppTranscript(raw: Record<string, any>, model: string): Transcript {
  const entries = Array.isArray(raw.transcription) ? raw.transcription : Array.isArray(raw.segments) ? raw.segments : [];
  const segments = entries.map((entry: Record<string, any>) => {
    const start = timeSeconds(entry.timestamps?.from ?? entry.start_timestamp)
      || Number(entry.start ?? 0);
    const end = timeSeconds(entry.timestamps?.to ?? entry.end_timestamp)
      || Number(entry.end ?? start);
    return { start, end, text: String(entry.text ?? "").trim() };
  }).filter((entry: TranscriptSegment) => entry.text);
  const text = String(raw.text ?? "").trim() || segments.map((entry: TranscriptSegment) => entry.text).join(" ");
  const language = String(raw.result?.language ?? raw.language ?? "") || undefined;
  return {
    text,
    segments,
    language,
    duration: segments.at(-1)?.end ?? 0,
    engine: "whisper.cpp",
    model,
  };
}

async function resolveModel(root: string, model: string, configuredPath?: string): Promise<string> {
  const name = model || "small";
  const candidates = [
    configuredPath,
    isAbsolute(name) ? name : undefined,
    join(root, "models", `ggml-${name}.bin`),
    join(root, ".runtime", "models", `ggml-${name}.bin`),
    join(homedir(), ".cache", "whisper", `ggml-${name}.bin`),
    `/opt/homebrew/share/whisper-cpp/models/ggml-${name}.bin`,
    `/usr/local/share/whisper-cpp/models/ggml-${name}.bin`,
  ].filter((value): value is string => Boolean(value)).map((value) => resolve(value));
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  throw new Error(`找不到 whisper.cpp 模型 ${name}；请设置 WHISPER_MODEL_PATH`);
}

async function localTranscribe(input: {
  root: string;
  audioPath: string;
  outputDir: string;
  stem: string;
  model: string;
  language: string;
  command?: string;
  modelPath?: string;
}): Promise<Transcript> {
  const command = await resolveTool(input.root, "whisper-cli", input.command);
  const modelPath = await resolveModel(input.root, input.model, input.modelPath);
  const outputPrefix = join(input.outputDir, `${input.stem}.whisper-cpp`);
  await execFileAsync(command, [
    "-m", modelPath,
    "-f", input.audioPath,
    "-l", input.language || "zh",
    "-oj",
    "-of", outputPrefix,
    "-np",
  ], { maxBuffer: 64 * 1024 * 1024, timeout: 3 * 60 * 60_000 });
  const raw = JSON.parse(await readFile(`${outputPrefix}.json`, "utf8")) as Record<string, any>;
  return parseWhisperCppTranscript(raw, input.model);
}

export async function transcribeAudio(input: {
  root: string;
  audioPath: string;
  outputDir: string;
  stem: string;
  model: string;
  language: string;
  local?: { command?: string; modelPath?: string };
  remote?: { baseUrl: string; apiKey: string; model?: string };
}): Promise<{ transcript: Transcript; json: string; text: string; srt: string }> {
  let transcript: Transcript;
  const local = () => localTranscribe({
    root: input.root,
    audioPath: input.audioPath,
    outputDir: input.outputDir,
    stem: input.stem,
    model: input.model,
    language: input.language,
    command: input.local?.command,
    modelPath: input.local?.modelPath,
  });
  if (input.remote?.baseUrl && input.remote.apiKey) {
    try {
      transcript = await remoteTranscribe(input.audioPath, input.remote.baseUrl, input.remote.apiKey, input.remote.model || "whisper-1");
    } catch (remoteError) {
      try { transcript = await local(); }
      catch (localError) {
        const remoteMessage = remoteError instanceof Error ? remoteError.message : String(remoteError);
        const localMessage = localError instanceof Error ? localError.message : String(localError);
        throw new Error(`远端转写失败：${remoteMessage}；本地 whisper.cpp 失败：${localMessage}`);
      }
    }
  } else transcript = await local();
  const jsonPath = join(input.outputDir, `${input.stem}.json`);
  const textPath = join(input.outputDir, `${input.stem}.txt`);
  const srtPath = join(input.outputDir, `${input.stem}.srt`);
  await writeJson(jsonPath, transcript);
  await writeFile(textPath, transcript.segments.map((item) => `[${timestamp(item.start)}] ${item.text}`).join("\n") + "\n", "utf8");
  await writeFile(srtPath, transcript.segments.map((item, index) => `${index + 1}\n${timestamp(item.start, true)} --> ${timestamp(item.end, true)}\n${item.text}\n`).join("\n"), "utf8");
  return { transcript, json: jsonPath, text: textPath, srt: srtPath };
}
