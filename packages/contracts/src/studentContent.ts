export interface LearningCheckParts {
  prompt: string;
  successCriterion: string;
}

const ANSWER_MARKER = /(?:正确回答|正确答案|参考答案|标准答案)\s*[：:]/i;

export function splitLearningCheck(value: string): LearningCheckParts {
  const source = value.trim();
  const match = ANSWER_MARKER.exec(source);
  if (!match || match.index === undefined) return { prompt: source, successCriterion: "" };

  const prompt = source.slice(0, match.index).trim().replace(/[（(【\[\s—-]+$/u, "").trim();
  const successCriterion = source.slice(match.index + match[0].length).trim();
  return { prompt, successCriterion };
}

export function studentVisibleAnswer(value: string): string {
  return value
    .replace(/课堂关键帧(?:里|中)?(?:也)?强调了[^，,。\n]+[，,]\s*/gu, "")
    .trim();
}
