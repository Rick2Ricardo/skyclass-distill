import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type CsvRow = Record<string, string>;

type PlaybackResponse = {
  code: number;
  message: string;
  data?: {
    quality: number;
    format: string;
    durl?: Array<{ url: string; size?: number }>;
  };
};

function parseCsv(input: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).filter((values) => values.some(Boolean)).map((values, rowIndex) => {
    if (values.length !== headers.length) throw new Error(`CSV 第 ${rowIndex + 2} 行字段数不匹配`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function selectedRows(rows: CsvRow[]): CsvRow[] {
  const requested = argument("--record-id", "").split(",").map((value) => value.trim()).filter(Boolean);
  if (requested.length) {
    const found = rows.filter((row) => requested.includes(row.record_id));
    const missing = requested.filter((id) => !found.some((row) => row.record_id === id));
    if (missing.length) throw new Error(`manifest 中找不到：${missing.join(", ")}`);
    return found;
  }
  return rows.filter((row) => row.recommend_observation === "yes");
}

function validateRow(row: CsvRow): void {
  const source = new URL(row.source_url);
  if (source.protocol !== "https:" || source.hostname !== "www.bilibili.com") {
    throw new Error(`${row.record_id} 不是允许的 B 站 HTTPS 官方播放页`);
  }
  if (!/^BV[0-9A-Za-z]+(?:#p\d+)?$/.test(row.video_id) || !/^\d+$/.test(row.cid)) {
    throw new Error(`${row.record_id} 缺少有效 BVID/CID`);
  }
  if (!['green', 'yellow'].includes(row.rights_tier)) throw new Error(`${row.record_id} 权利等级不可采集`);
  if (!['high', 'medium_high'].includes(row.source_confidence)) throw new Error(`${row.record_id} 来源置信度不足`);
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function probe(path: string): Promise<Record<string, unknown>> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration,size,format_name:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels",
    "-of", "json", path,
  ], { maxBuffer: 4 * 1024 * 1024, timeout: 60_000 });
  return JSON.parse(stdout) as Record<string, unknown>;
}

async function playback(row: CsvRow): Promise<PlaybackResponse> {
  const bvid = row.video_id.split("#")[0];
  const endpoint = new URL("https://api.bilibili.com/x/player/playurl");
  endpoint.searchParams.set("bvid", bvid);
  endpoint.searchParams.set("cid", row.cid);
  endpoint.searchParams.set("qn", "64");
  endpoint.searchParams.set("fnval", "0");
  endpoint.searchParams.set("fourk", "0");
  const response = await fetch(endpoint, { headers: { Referer: "https://www.bilibili.com/" } });
  if (!response.ok) throw new Error(`${row.record_id} 播放接口 HTTP ${response.status}`);
  return await response.json() as PlaybackResponse;
}

async function download(row: CsvRow, outputRoot: string, dryRun: boolean): Promise<void> {
  validateRow(row);
  const directory = join(outputRoot, row.record_id);
  const target = join(directory, "source.mp4");
  const metadataPath = join(directory, "source.json");
  await mkdir(directory, { recursive: true });

  if (existsSync(target) && existsSync(metadataPath)) {
    console.log(`[skip] ${row.record_id} 已存在`);
    return;
  }

  const payload = await playback(row);
  if (payload.code !== 0 || !payload.data) throw new Error(`${row.record_id} 播放接口失败：${payload.message}`);
  const streams = payload.data.durl ?? [];
  if (streams.length !== 1 || !streams[0]?.url) throw new Error(`${row.record_id} 公开播放流不是单文件，停止自动处理`);
  if (payload.data.quality < 64) throw new Error(`${row.record_id} 公开画质低于 720p，停止采集`);

  console.log(`[ready] ${row.record_id} ${row.duration} ${payload.data.format} ${streams[0].size ?? "unknown"} bytes`);
  if (dryRun) return;

  const temporary = join(directory, `source.mp4.part-${process.pid}`);
  const response = await fetch(streams[0].url, { headers: { Referer: "https://www.bilibili.com/" } });
  if (!response.ok || !response.body) throw new Error(`${row.record_id} 媒体下载 HTTP ${response.status}`);
  const expected = Number(response.headers.get("content-length") || streams[0].size || 0);
  let received = 0;
  let reported = 0;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      const percent = expected ? Math.floor(received / expected * 10) * 10 : 0;
      if (percent >= reported + 10) {
        reported = percent;
        console.log(`[download] ${row.record_id} ${Math.min(100, percent)}%`);
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(response.body as never), progress, createWriteStream(temporary, { flags: "wx" }));
    const [fileStat, digest, media] = await Promise.all([stat(temporary), sha256(temporary), probe(temporary)]);
    if (expected && fileStat.size !== expected) throw new Error(`${row.record_id} 文件大小不完整：${fileStat.size}/${expected}`);
    await rename(temporary, target);
    await writeFile(metadataPath, `${JSON.stringify({
      schema_version: "public-video-source-v1",
      fetched_at: new Date().toISOString(),
      record: row,
      playback: { quality: payload.data.quality, format: payload.data.format },
      artifact: { path: target, bytes: fileStat.size, sha256: digest, ffprobe: media },
      handling: "private_noncommercial_research_only",
    }, null, 2)}\n`, "utf8");
    console.log(`[done] ${row.record_id} ${(fileStat.size / 1024 / 1024).toFixed(1)} MiB sha256=${digest}`);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

const root = resolve(import.meta.dirname, "..");
const manifest = resolve(root, argument("--manifest", "research/manifests/physics_force_pilot.csv"));
const output = resolve(root, argument("--output", "data/raw/physics/force-pilot"));
const dryRun = process.argv.includes("--dry-run");
const rows = selectedRows(parseCsv(await readFile(manifest, "utf8")));

if (!rows.length) throw new Error("没有符合条件的 manifest 条目");
console.log(`[plan] ${rows.length} 条 · ${dryRun ? "仅检查" : output}`);
for (const row of rows) await download(row, output, dryRun);
