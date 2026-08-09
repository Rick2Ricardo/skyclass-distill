import { execFile } from "node:child_process";
import { access, copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { CourseItem } from "../../contracts/src/index.js";

const execFileAsync = promisify(execFile);

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export type MediaTool = "ffmpeg" | "ffprobe" | "yt-dlp" | "whisper-cli";

const TOOL_ENV: Record<MediaTool, string> = {
  ffmpeg: "FFMPEG_COMMAND",
  ffprobe: "FFPROBE_COMMAND",
  "yt-dlp": "YTDLP_COMMAND",
  "whisper-cli": "WHISPER_COMMAND",
};

export async function resolveTool(root: string, name: MediaTool, override?: string): Promise<string> {
  const configured = override?.trim() || process.env[TOOL_ENV[name]]?.trim();
  const aliases = name === "whisper-cli" ? ["whisper-cli", "whisper"] : [name];
  const candidates = [
    configured,
    ...(name === "yt-dlp" ? [join(root, ".venv", "bin", "yt-dlp")] : []),
    ...aliases.flatMap((alias) => [`/opt/homebrew/bin/${alias}`, `/usr/local/bin/${alias}`, `/usr/bin/${alias}`, alias]),
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (candidate.includes("/") && await exists(candidate)) return candidate;
    if (!candidate.includes("/")) {
      try { await execFileAsync("/usr/bin/env", ["which", candidate]); return candidate; } catch { /* next */ }
    }
  }
  throw new Error(`缺少运行工具：${name}`);
}

export async function runtimeStatus(root: string): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  for (const name of ["ffmpeg", "ffprobe", "yt-dlp", "whisper-cli"] as const) {
    result[name.replaceAll("-", "_")] = await resolveTool(root, name).then(() => true).catch(() => false);
  }
  return result;
}

function sourceUrl(entry: Record<string, any>, fallback: string): string {
  if (typeof entry.webpage_url === "string" && /^https?:/.test(entry.webpage_url)) return entry.webpage_url;
  if (typeof entry.url === "string" && /^https?:/.test(entry.url)) return entry.url;
  if (entry.ie_key === "Youtube" && entry.id) return `https://www.youtube.com/watch?v=${entry.id}`;
  if (entry.bvid) return `https://www.bilibili.com/video/${entry.bvid}`;
  return fallback;
}

export async function discoverSource(root: string, url: string, limit = 5): Promise<CourseItem[]> {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("只支持公开 HTTP/HTTPS 视频地址");
  const ytdlp = await resolveTool(root, "yt-dlp");
  const { stdout } = await execFileAsync(ytdlp, [
    "--dump-single-json", "--flat-playlist", "--playlist-end", String(Math.max(1, Math.min(50, limit))),
    "--no-warnings", url,
  ], { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 });
  const payload = JSON.parse(stdout) as Record<string, any>;
  const entries = Array.isArray(payload.entries) ? payload.entries.slice(0, limit) : [payload];
  return entries.map((entry: Record<string, any>, index: number) => ({
    id: String(entry.id ?? entry.bvid ?? `source-${index + 1}`),
    source_url: sourceUrl(entry, url),
    title: String(entry.title ?? payload.title ?? `课堂视频 ${index + 1}`),
    index: index + 1,
    duration: Number.isFinite(Number(entry.duration)) ? Number(entry.duration) : null,
    cover_url: String(entry.thumbnail ?? payload.thumbnail ?? "") || null,
    source: String(entry.extractor_key ?? payload.extractor_key ?? parsed.hostname),
    metadata: {
      uploader: entry.uploader ?? payload.uploader ?? "",
      channel: entry.channel ?? payload.channel ?? "",
      playlist: payload.title ?? "",
    },
  }));
}

export async function downloadVideo(root: string, item: CourseItem, directory: string, stem: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const localPath = typeof item.metadata.local_path === "string" ? resolve(item.metadata.local_path) : "";
  if (item.source_url.startsWith("local://") && localPath) {
    const target = join(directory, `${stem}${extname(localPath).toLowerCase() || ".mp4"}`);
    await copyFile(localPath, target);
    return target;
  }
  const ytdlp = await resolveTool(root, "yt-dlp");
  const template = join(directory, `${stem}.%(ext)s`);
  const { stdout } = await execFileAsync(ytdlp, [
    "--no-playlist", "--no-warnings", "--merge-output-format", "mp4",
    "-f", "bv*+ba/b", "-o", template, "--print", "after_move:filepath", item.source_url,
  ], { maxBuffer: 32 * 1024 * 1024, timeout: 30 * 60_000 });
  const reported = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (reported && await exists(reported)) return resolve(reported);
  const files = (await readdir(directory)).filter((name) => name.startsWith(`${stem}.`) && !name.endsWith(".part"));
  if (!files.length) throw new Error("yt-dlp 没有生成视频文件");
  return join(directory, files[0]);
}

export async function mediaDuration(root: string, path: string): Promise<number | null> {
  const ffprobe = await resolveTool(root, "ffprobe");
  try {
    const { stdout } = await execFileAsync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path], { timeout: 30_000 });
    const value = Number(stdout.trim());
    return Number.isFinite(value) ? value : null;
  } catch { return null; }
}

export async function extractAudio(root: string, video: string, audio: string): Promise<string> {
  const ffmpeg = await resolveTool(root, "ffmpeg");
  await mkdir(resolve(audio, ".."), { recursive: true }).catch(() => undefined);
  await execFileAsync(ffmpeg, ["-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audio], {
    maxBuffer: 16 * 1024 * 1024,
    timeout: 20 * 60_000,
  });
  return audio;
}

export async function extractFrames(root: string, video: string, directory: string, duration: number | null, limit = 6): Promise<Array<{ frame_id: string; timestamp: number; path: string }>> {
  const ffmpeg = await resolveTool(root, "ffmpeg");
  await mkdir(directory, { recursive: true });
  const total = duration && duration > 0 ? duration : await mediaDuration(root, video) ?? 300;
  const timestamps = Array.from({ length: limit }, (_, index) => Math.max(1, Math.min(total - 1, total * (index + 1) / (limit + 1))));
  const frames: Array<{ frame_id: string; timestamp: number; path: string }> = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const path = join(directory, `F${String(index + 1).padStart(3, "0")}-${Math.round(timestamps[index])}.jpg`);
    await execFileAsync(ffmpeg, ["-y", "-ss", String(timestamps[index]), "-i", video, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", path], { timeout: 90_000 });
    frames.push({ frame_id: `F${String(index + 1).padStart(3, "0")}`, timestamp: timestamps[index], path });
  }
  return frames;
}

export function safeUploadName(name: string): string {
  const normalized = basename(name).replace(/[^\p{L}\p{N}._ -]+/gu, "-").replace(/\s+/g, " ").trim();
  return normalized.slice(0, 180) || "upload.mp4";
}

export async function validateUploadSize(path: string, maxMb: number): Promise<void> {
  const info = await stat(path);
  if (info.size > maxMb * 1024 * 1024) throw new Error(`文件超过 ${maxMb} MB 限制`);
}
