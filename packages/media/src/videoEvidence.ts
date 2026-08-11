import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { promisify } from "node:util";
import { resolveTool } from "./tools.js";

const execFileAsync = promisify(execFile);

export interface OracleGateVideoMetadata {
  mime_type: "video/mp4";
  duration_us: number;
  width: number;
  height: number;
  video_stream_index: number;
}

export interface OracleGateVideoToolchain {
  ffmpeg_binary_sha256: string;
  ffprobe_binary_sha256: string;
  ffmpeg_version_sha256: string;
  ffprobe_version_sha256: string;
}

export interface OracleGateVideoProbe {
  toolchain: OracleGateVideoToolchain;
  probe(path: string): Promise<OracleGateVideoMetadata>;
  verify_decodable(path: string, video_stream_index: number): Promise<void>;
}

async function executablePath(command: string): Promise<string> {
  const candidate = command.includes("/")
    ? command
    : (await execFileAsync("/usr/bin/env", ["which", command], { timeout: 10_000 })).stdout.trim();
  if (!candidate) throw new Error(`无法解析媒体工具路径：${command}`);
  const path = await realpath(candidate);
  const info = await lstat(path);
  if (!info.isFile()) throw new Error(`媒体工具不是普通文件：${command}`);
  return path;
}

async function streamSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function executableIdentity(path: string): Promise<{ dev: number; ino: number; size: number; mtime_ms: number }> {
  const info = await lstat(path);
  if (!info.isFile()) throw new Error(`媒体工具不是普通文件：${path}`);
  return { dev: info.dev, ino: info.ino, size: info.size, mtime_ms: info.mtimeMs };
}

async function assertExecutableUnchanged(path: string, identity: Awaited<ReturnType<typeof executableIdentity>>, sha256: string): Promise<void> {
  const current = await executableIdentity(path);
  if (current.dev !== identity.dev || current.ino !== identity.ino || current.size !== identity.size || current.mtime_ms !== identity.mtime_ms
    || await streamSha256(path) !== sha256) {
    throw new Error(`媒体工具在冻结后发生变化：${path}`);
  }
}

function outputSha256(value: string): string {
  return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
}

function safePositiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`ffprobe ${label} 无效`);
  return number;
}

export async function createSystemOracleGateVideoProbe(
  workspaceRoot: string,
  overrides: { ffmpeg?: string; ffprobe?: string } = {},
): Promise<OracleGateVideoProbe> {
  const ffmpegCommand = await resolveTool(workspaceRoot, "ffmpeg", overrides.ffmpeg);
  const ffprobeCommand = await resolveTool(workspaceRoot, "ffprobe", overrides.ffprobe);
  const [ffmpegPath, ffprobePath] = await Promise.all([
    executablePath(ffmpegCommand),
    executablePath(ffprobeCommand),
  ]);
  const [ffmpegIdentity, ffprobeIdentity] = await Promise.all([executableIdentity(ffmpegPath), executableIdentity(ffprobePath)]);
  const [ffmpegVersion, ffprobeVersion, ffmpegBinarySha, ffprobeBinarySha] = await Promise.all([
    execFileAsync(ffmpegPath, ["-version"], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }).then((item) => item.stdout),
    execFileAsync(ffprobePath, ["-version"], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }).then((item) => item.stdout),
    streamSha256(ffmpegPath),
    streamSha256(ffprobePath),
  ]);
  await Promise.all([
    assertExecutableUnchanged(ffmpegPath, ffmpegIdentity, ffmpegBinarySha),
    assertExecutableUnchanged(ffprobePath, ffprobeIdentity, ffprobeBinarySha),
  ]);
  const toolchain: OracleGateVideoToolchain = {
    ffmpeg_binary_sha256: ffmpegBinarySha,
    ffprobe_binary_sha256: ffprobeBinarySha,
    ffmpeg_version_sha256: outputSha256(ffmpegVersion),
    ffprobe_version_sha256: outputSha256(ffprobeVersion),
  };
  return {
    toolchain,
    async probe(path): Promise<OracleGateVideoMetadata> {
      await assertExecutableUnchanged(ffprobePath, ffprobeIdentity, ffprobeBinarySha);
      const { stdout } = await execFileAsync(ffprobePath, [
        "-v", "error",
        "-show_entries", "format=format_name,duration:stream=index,codec_type,width,height",
        "-of", "json",
        path,
      ], { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
      await assertExecutableUnchanged(ffprobePath, ffprobeIdentity, ffprobeBinarySha);
      const payload = JSON.parse(stdout) as Record<string, unknown>;
      const format = payload.format && typeof payload.format === "object" && !Array.isArray(payload.format)
        ? payload.format as Record<string, unknown> : null;
      const streams = Array.isArray(payload.streams) ? payload.streams : [];
      const video = streams.find((entry) => entry && typeof entry === "object"
        && !Array.isArray(entry) && (entry as Record<string, unknown>).codec_type === "video") as Record<string, unknown> | undefined;
      if (!format || typeof format.format_name !== "string" || !format.format_name.split(",").includes("mp4")) {
        throw new Error("ffprobe 容器不是 MP4");
      }
      if (!video) throw new Error("ffprobe 未找到视频流");
      const durationSeconds = Number(format.duration);
      const durationUs = Math.round(durationSeconds * 1_000_000);
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isSafeInteger(durationUs) || durationUs < 1) {
        throw new Error("ffprobe duration 无效");
      }
      const streamIndex = Number(video.index);
      if (!Number.isSafeInteger(streamIndex) || streamIndex < 0) throw new Error("ffprobe 视频流索引无效");
      return {
        mime_type: "video/mp4",
        duration_us: durationUs,
        width: safePositiveInteger(video.width, "width"),
        height: safePositiveInteger(video.height, "height"),
        video_stream_index: streamIndex,
      };
    },
    async verify_decodable(path, videoStreamIndex): Promise<void> {
      if (!Number.isSafeInteger(videoStreamIndex) || videoStreamIndex < 0) throw new Error("视频流索引无效");
      await assertExecutableUnchanged(ffmpegPath, ffmpegIdentity, ffmpegBinarySha);
      await execFileAsync(ffmpegPath, [
        "-v", "error",
        "-xerror",
        "-i", path,
        "-map", `0:${videoStreamIndex}`,
        "-an", "-sn", "-dn",
        "-f", "null",
        "-",
      ], { timeout: 4 * 60 * 60_000, maxBuffer: 16 * 1024 * 1024 });
      await assertExecutableUnchanged(ffmpegPath, ffmpegIdentity, ffmpegBinarySha);
    },
  };
}
