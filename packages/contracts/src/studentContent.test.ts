import { describe, expect, it } from "vitest";
import { splitLearningCheck, studentVisibleAnswer } from "./studentContent.js";

describe("student-visible tutor content", () => {
  it("separates a legacy answer key from the question", () => {
    expect(splitLearningCheck("你判断一下：\\(mg\\sin\\theta\\) 是实际外力吗？正确回答：不是，它是重力的分量。")).toEqual({
      prompt: "你判断一下：\\(mg\\sin\\theta\\) 是实际外力吗？",
      successCriterion: "不是，它是重力的分量。",
    });
  });

  it("removes internal classroom-frame narration from student prose", () => {
    expect(studentVisibleAnswer("先确定研究对象。课堂关键帧里也强调了“关键看系统是谁”，这里先把边界圈在物块上。")).toBe(
      "先确定研究对象。这里先把边界圈在物块上。",
    );
  });
});
