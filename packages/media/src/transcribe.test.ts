import { describe, expect, it } from "vitest";
import { parseWhisperCppTranscript } from "./transcribe.js";

describe("parseWhisperCppTranscript", () => {
  it("normalizes whisper.cpp JSON into the shared transcript contract", () => {
    const transcript = parseWhisperCppTranscript({
      result: { language: "zh" },
      transcription: [
        { timestamps: { from: "00:00:00,500", to: "00:00:02,250" }, text: " 速度表示运动快慢。 " },
        { timestamps: { from: "00:00:02,250", to: "00:00:04,000" }, text: "方向也很重要。" },
      ],
    }, "small");

    expect(transcript.engine).toBe("whisper.cpp");
    expect(transcript.language).toBe("zh");
    expect(transcript.model).toBe("small");
    expect(transcript.duration).toBe(4);
    expect(transcript.segments).toEqual([
      { start: 0.5, end: 2.25, text: "速度表示运动快慢。" },
      { start: 2.25, end: 4, text: "方向也很重要。" },
    ]);
  });
});
