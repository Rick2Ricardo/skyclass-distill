import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LibraryStore } from "./libraryStore.js";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("LibraryStore", () => {
  it("keeps projects isolated when deleting videos", async () => {
    const directory = await mkdtemp(join(tmpdir(), "anyteacher-library-"));
    created.push(directory);
    const store = new LibraryStore(directory);
    const first = await store.createProject({ name: "项目 A", subject: "物理", grade: "高中" });
    const second = await store.createProject({ name: "项目 B", subject: "物理", grade: "高中" });
    const video = await store.addVideo({
      project_id: first.id,
      title: "位移",
      source_url: "local://video",
      status: "ready",
      job_id: "job-a",
      course_item_id: "course-a",
    });

    await expect(store.deleteVideos(second.id, [video.id])).rejects.toThrow("视频不属于当前项目");
    expect((await store.listVideos(first.id)).map((item) => item.id)).toEqual([video.id]);
  });
});
