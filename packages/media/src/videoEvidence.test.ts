import { createHash } from "node:crypto";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSystemOracleGateVideoProbe } from "./videoEvidence.js";

async function executable(path: string, body: string): Promise<void> {
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o700);
}

describe("Formal Oracle video probe", () => {
  it("pins tool bytes/version and requires an explicit full-decode pass", async () => {
    const root = await mkdtemp(join(tmpdir(), "oracle-video-probe-"));
    const ffmpeg = join(root, "ffmpeg-fixture");
    const ffprobe = join(root, "ffprobe-fixture");
    await executable(ffmpeg, 'if [ "$1" = "-version" ]; then echo "ffmpeg fixture v1"; exit 0; fi\nexit 0');
    await executable(ffprobe, 'if [ "$1" = "-version" ]; then echo "ffprobe fixture v1"; exit 0; fi\nprintf \'%s\\n\' \'{"format":{"format_name":"mov,mp4,m4a,3gp,3g2,mj2","duration":"1.250000"},"streams":[{"index":2,"codec_type":"video","width":1280,"height":720}]}\'');
    const probe = await createSystemOracleGateVideoProbe(root, { ffmpeg, ffprobe });
    await expect(probe.probe(join(root, "source.mp4"))).resolves.toEqual({
      mime_type: "video/mp4",
      duration_us: 1_250_000,
      width: 1280,
      height: 720,
      video_stream_index: 2,
    });
    await expect(probe.verify_decodable(join(root, "source.mp4"), 2)).resolves.toBeUndefined();
    await executable(ffprobe, 'echo "replaced"');
    await expect(probe.probe(join(root, "source.mp4"))).rejects.toThrow("冻结后发生变化");
  });

  it("derives the first normalized presentation frame at or after the target from a private staged source", async () => {
    const root = await mkdtemp(join(tmpdir(), "oracle-frame-derive-"));
    const ffmpeg = join(root, "ffmpeg-fixture");
    const ffprobe = join(root, "ffprobe-fixture");
    const source = join(root, "source.mp4");
    const sourceBytes = Buffer.from("source-video-bytes");
    await writeFile(source, sourceBytes);
    await executable(ffmpeg, [
      'if [ "$1" = "-version" ]; then echo "ffmpeg fixture v1"; exit 0; fi',
      'printf "[showinfo@timeline @ x] n: 0 pts: 0 pts_time:0\\n" >&2',
      'printf "[showinfo@timeline @ x] n: 1 pts: 750000 pts_time:0.75\\n" >&2',
      'printf "[showinfo@selected @ x] n: 0 pts: 750000 pts_time:0.75\\n" >&2',
      "printf '\\001\\002\\003\\377'",
    ].join("\n"));
    await executable(ffprobe, 'if [ "$1" = "-version" ]; then echo "ffprobe fixture v1"; exit 0; fi\nprintf \'%s\\n\' \'{"format":{"format_name":"mp4","duration":"1.000000"},"streams":[{"index":0,"codec_type":"video","width":1,"height":1}]}\'');
    const deriver = await createSystemOracleGateVideoProbe(root, { ffmpeg, ffprobe });
    const [frame] = await deriver.derive_frames({
      path: source,
      source_sha256: createHash("sha256").update(sourceBytes).digest("hex"),
      source_byte_length: sourceBytes.byteLength,
      source_width: 1,
      source_height: 1,
      video_stream_index: 0,
      requests: [{ request_id: "case-1:uniform_frame", timestamp_us: 500_000, output_width: 1, output_height: 1 }],
    });
    expect(frame).toMatchObject({
      previous_normalized_pts_us: 0,
      selected_normalized_pts_us: 750_000,
      selected_frame_ordinal: 1,
      width: 1,
      height: 1,
    });
    expect([...frame.rgba]).toEqual([1, 2, 3, 255]);
  });
});
