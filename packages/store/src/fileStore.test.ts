import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJson, writeJson } from "./fileStore.js";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("file store", () => {
  it("writes valid JSON atomically and reads it back", async () => {
    const directory = await mkdtemp(join(tmpdir(), "anyteacher-store-"));
    created.push(directory);
    const path = join(directory, "nested", "value.json");

    await writeJson(path, { ok: true, name: "课堂" });

    expect(await readJson(path)).toEqual({ ok: true, name: "课堂" });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ ok: true, name: "课堂" });
  });
});
