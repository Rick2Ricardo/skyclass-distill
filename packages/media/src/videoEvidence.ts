import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
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

export interface OracleGateFrameRequest {
  request_id: string;
  timestamp_us: number;
  output_width: number;
  output_height: number;
}

export interface OracleGateDerivedFrame {
  request_id: string;
  previous_normalized_pts_us: number | null;
  selected_normalized_pts_us: number;
  selected_frame_ordinal: number;
  width: number;
  height: number;
  rgba: Buffer;
  argv_sha256: string;
}

export interface OracleGateFrameDeriver extends OracleGateVideoProbe {
  derive_frames(input: {
    path: string;
    source_sha256: string;
    source_byte_length: number;
    source_width: number;
    source_height: number;
    video_stream_index: number;
    requests: OracleGateFrameRequest[];
  }): Promise<OracleGateDerivedFrame[]>;
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

function safeNonNegativeInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} 必须是非负安全整数`);
  return number;
}

async function deriveOneFrame(input: {
  ffmpegPath: string;
  stagedPath: string;
  videoStreamIndex: number;
  sourceWidth: number;
  sourceHeight: number;
  request: OracleGateFrameRequest;
}): Promise<OracleGateDerivedFrame> {
  const target = safeNonNegativeInteger(input.request.timestamp_us, "抽帧 timestamp_us");
  const width = safePositiveInteger(input.request.output_width, "抽帧 width");
  const height = safePositiveInteger(input.request.output_height, "抽帧 height");
  if (BigInt(input.sourceWidth) * BigInt(height) !== BigInt(input.sourceHeight) * BigInt(width)) {
    throw new Error("抽帧输出尺寸必须保持来源视频宽高比");
  }
  const filter = [
    "settb=expr=1/1000000",
    "setpts=PTS-STARTPTS",
    "showinfo@timeline",
    `select=gte(pts\\,${target})`,
    `scale=${width}:${height}:flags=neighbor+bitexact:in_range=auto:out_range=full`,
    "format=pix_fmts=rgba",
    "showinfo@selected",
  ].join(",");
  const argv = [
    "-nostdin", "-hide_banner", "-loglevel", "info", "-xerror", "-cpuflags", "0",
    "-filter_threads", "1", "-hwaccel", "none", "-threads", "1", "-fflags", "+bitexact", "-flags", "+bitexact",
    "-ignore_editlist", "0", "-advanced_editlist", "1", "-use_tfdt", "1", "-noautorotate",
    "-i", input.stagedPath,
    "-map", `0:${input.videoStreamIndex}`, "-an", "-sn", "-dn",
    "-vf", filter, "-frames:v", "1", "-fps_mode", "passthrough", "-pix_fmt", "rgba", "-f", "rawvideo", "pipe:1",
  ];
  const normalizedArgv = argv.map((value) => value === input.stagedPath ? "<STAGED_SOURCE>" : value);
  const argvSha = outputSha256(JSON.stringify(normalizedArgv));
  const frameBytes = width * height * 4;
  if (!Number.isSafeInteger(frameBytes) || frameBytes < 4 || frameBytes > 64 * 1024 * 1024) throw new Error("抽帧输出像素超过限制");

  return new Promise<OracleGateDerivedFrame>((resolve, reject) => {
    const child = spawn(input.ffmpegPath, argv, {
      env: { ...process.env, LC_ALL: "C", TZ: "UTC", AV_LOG_FORCE_NOCOLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = Buffer.allocUnsafe(frameBytes);
    let outputOffset = 0;
    let failed: Error | null = null;
    let stderrBytes = 0;
    let stderrLine = "";
    const decoder = new StringDecoder("utf8");
    let timelineCount = 0;
    let timelinePrevious: number | null = null;
    let timelineLatest: number | null = null;
    let timelineLatestOrdinal = -1;
    let selectedPts: number | null = null;
    let selectedPrevious: number | null = null;
    let selectedOrdinal = -1;

    const fail = (error: Error) => {
      if (!failed) {
        failed = error;
        child.kill("SIGKILL");
      }
    };
    const processLine = (line: string) => {
      const timeline = line.match(/showinfo@timeline[^\n]*?n:\s*(\d+)[^\n]*?pts:\s*(-?\d+)/);
      if (timeline) {
        const ordinal = Number(timeline[1]);
        const pts = Number(timeline[2]);
        if (!Number.isSafeInteger(ordinal) || !Number.isSafeInteger(pts) || pts < 0) return fail(new Error("ffmpeg timeline PTS 无效"));
        if (timelineCount === 0 && (ordinal !== 0 || pts !== 0)) return fail(new Error("ffmpeg normalized timeline 必须从 PTS 0 开始"));
        if (timelineLatest !== null && (ordinal !== timelineLatestOrdinal + 1 || pts <= timelineLatest)) return fail(new Error("ffmpeg normalized timeline PTS 必须严格递增"));
        timelinePrevious = timelineLatest;
        timelineLatest = pts;
        timelineLatestOrdinal = ordinal;
        timelineCount += 1;
      }
      const selected = line.match(/showinfo@selected[^\n]*?pts:\s*(-?\d+)/);
      if (selected) {
        const pts = Number(selected[1]);
        if (selectedPts !== null) return fail(new Error("ffmpeg 抽帧返回了多个 selected frame"));
        if (!Number.isSafeInteger(pts) || timelineLatest !== pts || timelineLatestOrdinal < 0) return fail(new Error("selected frame 未绑定 timeline PTS"));
        selectedPts = pts;
        selectedPrevious = timelinePrevious;
        selectedOrdinal = timelineLatestOrdinal;
      }
    };
    const timer = setTimeout(() => fail(new Error("ffmpeg 抽帧超时")), 4 * 60 * 60_000);
    child.stdout.on("data", (chunk: Buffer) => {
      if (failed) return;
      if (outputOffset + chunk.byteLength > frameBytes) return fail(new Error("ffmpeg 抽帧输出超过一帧"));
      chunk.copy(output, outputOffset);
      outputOffset += chunk.byteLength;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > 256 * 1024 * 1024) return fail(new Error("ffmpeg 抽帧日志超过限制"));
      stderrLine += decoder.write(chunk);
      let newline = stderrLine.indexOf("\n");
      while (newline >= 0) {
        processLine(stderrLine.slice(0, newline));
        stderrLine = stderrLine.slice(newline + 1);
        newline = stderrLine.indexOf("\n");
      }
    });
    child.on("error", (error) => fail(error));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      stderrLine += decoder.end();
      if (stderrLine) processLine(stderrLine);
      if (failed) return reject(failed);
      if (code !== 0 || signal) return reject(new Error(`ffmpeg 抽帧失败：code=${code ?? "null"} signal=${signal ?? "none"}`));
      if (outputOffset !== frameBytes || selectedPts === null || selectedOrdinal < 0) return reject(new Error("ffmpeg 未返回完整且可审计的 selected frame"));
      if (selectedPts < target || (selectedPrevious !== null && selectedPrevious >= target)) return reject(new Error("ffmpeg 未选择 first normalized PTS >= target"));
      for (let index = 3; index < output.length; index += 4) if (output[index] !== 255) return reject(new Error("ffmpeg RGBA8 输出包含非不透明 alpha"));
      resolve({
        request_id: input.request.request_id,
        previous_normalized_pts_us: selectedPrevious,
        selected_normalized_pts_us: selectedPts,
        selected_frame_ordinal: selectedOrdinal,
        width,
        height,
        rgba: output,
        argv_sha256: argvSha,
      });
    });
  });
}

function safePositiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`ffprobe ${label} 无效`);
  return number;
}

export async function createSystemOracleGateVideoProbe(
  workspaceRoot: string,
  overrides: { ffmpeg?: string; ffprobe?: string } = {},
): Promise<OracleGateFrameDeriver> {
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
    async derive_frames(input): Promise<OracleGateDerivedFrame[]> {
      if (!/^[a-f0-9]{64}$/.test(input.source_sha256)) throw new Error("来源视频 SHA-256 无效");
      safePositiveInteger(input.source_byte_length, "来源视频 byte_length");
      safePositiveInteger(input.source_width, "来源视频 width");
      safePositiveInteger(input.source_height, "来源视频 height");
      safeNonNegativeInteger(input.video_stream_index, "来源视频 stream index");
      if (!Array.isArray(input.requests) || !input.requests.length) throw new Error("至少需要一个抽帧请求");
      const requestIds = input.requests.map((item) => item.request_id);
      if (requestIds.some((item) => !item || item.trim() !== item) || new Set(requestIds).size !== requestIds.length) throw new Error("抽帧 request_id 不能为空或重复");
      await assertExecutableUnchanged(ffmpegPath, ffmpegIdentity, ffmpegBinarySha);
      const stagingRoot = await mkdtemp(join(tmpdir(), "oracle-frame-source-"));
      await chmod(stagingRoot, 0o700);
      const stagedPath = join(stagingRoot, "source.mp4");
      try {
        await copyFile(input.path, stagedPath);
        await chmod(stagedPath, 0o400);
        const stagedInfo = await lstat(stagedPath);
        if (!stagedInfo.isFile() || stagedInfo.nlink !== 1 || stagedInfo.size !== input.source_byte_length
          || await streamSha256(stagedPath) !== input.source_sha256) {
          throw new Error("私有 staged source 未与已验证来源视频字节闭合");
        }
        const results: OracleGateDerivedFrame[] = [];
        for (const request of input.requests) {
          results.push(await deriveOneFrame({
            ffmpegPath,
            stagedPath,
            videoStreamIndex: input.video_stream_index,
            sourceWidth: input.source_width,
            sourceHeight: input.source_height,
            request,
          }));
        }
        const after = await lstat(stagedPath);
        if (!after.isFile() || after.nlink !== 1 || after.size !== input.source_byte_length
          || await streamSha256(stagedPath) !== input.source_sha256) {
          throw new Error("私有 staged source 在抽帧期间发生变化");
        }
        await assertExecutableUnchanged(ffmpegPath, ffmpegIdentity, ffmpegBinarySha);
        return results;
      } finally {
        await rm(stagingRoot, { recursive: true, force: true });
      }
    },
  };
}
