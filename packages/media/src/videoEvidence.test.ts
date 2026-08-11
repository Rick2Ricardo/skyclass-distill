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
});
