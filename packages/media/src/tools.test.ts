import { describe, expect, it } from "vitest";
import { safeUploadName } from "./tools.js";

describe("safeUploadName", () => {
  it("drops path traversal and unsafe filename characters", () => {
    expect(safeUploadName("../../课堂<>:01.mp4")).toBe("课堂-01.mp4");
  });
});
