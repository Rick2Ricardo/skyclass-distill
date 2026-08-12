import { describe, expect, it } from "vitest";
import {
  ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  ORACLE_GATE_RESPONSE_SEMANTIC_POLICY,
  ORACLE_GATE_RESPONSE_VALIDATOR_VERSION,
  canonicalOracleGateJson,
  canonicalOracleGateResponseBytes,
  lintOracleGateResponseSemantics,
  parseOracleGateResponseBytes,
  validateOracleGateResponse,
} from "./oracle-gate-response.js";

function response(): Record<string, unknown> {
  return {
    schema_version: "oracle-gate-response-v1",
    observed_board_actions: [],
    generalized_teaching_capability: { name: "证据约束讲解", mechanism: "先观察再抽象", action_program: ["确认可见变化"] },
    evidence_claims: [],
    uncertainties: [],
  };
}

describe("shared Oracle Gate response contract", () => {
  it("strictly parses UTF-8 and produces deterministic canonical bytes", () => {
    const raw = new TextEncoder().encode(JSON.stringify(response(), null, 2));
    const parsed = parseOracleGateResponseBytes(raw);
    validateOracleGateResponse(parsed, "transcript_only");
    expect(new TextDecoder().decode(canonicalOracleGateResponseBytes(parsed))).toBe(canonicalOracleGateJson(response()));
    expect(ORACLE_GATE_RESPONSE_SCHEMA_SHA256).toMatch(/^[a-f0-9]{64}$/);
    expect(ORACLE_GATE_RESPONSE_VALIDATOR_VERSION).toBe("oracle-gate-response-structural-validator-v1");
    expect(ORACLE_GATE_RESPONSE_SEMANTIC_POLICY.prompt_population_policy).toBe("teacher_only");
    expect(ORACLE_GATE_RESPONSE_SEMANTIC_POLICY.runtime_semantic_enforcement).toBe("none_external_blind_review_only");

    const integer = response();
    integer.observed_board_actions = [{ sequence_index: 1, operation: "add", content: "x", region: null }];
    expect(() => parseOracleGateResponseBytes(new TextEncoder().encode(JSON.stringify(integer)))).not.toThrow();
    for (const numeric of ["1.0", "1e0", "9007199254740990.5"]) {
      const raw = JSON.stringify(integer).replace('"sequence_index":1', `"sequence_index":${numeric}`);
      expect(() => parseOracleGateResponseBytes(new TextEncoder().encode(raw))).toThrow("只允许整数词法");
    }
  });

  it("rejects top-level and nested duplicate keys plus invalid UTF-8", () => {
    expect(() => parseOracleGateResponseBytes(new TextEncoder().encode('{"schema_version":"a","schema_version":"b"}'))).toThrow("duplicate key");
    expect(() => parseOracleGateResponseBytes(new TextEncoder().encode('{"outer":{"claim":1,"cl\\u0061im":2}}'))).toThrow("duplicate key");
    expect(() => parseOracleGateResponseBytes(Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d]))).toThrow("有效 UTF-8");
  });

  it("enforces structural arm evidence without filtering semantic failure samples", () => {
    const visual = response();
    visual.evidence_claims = [{ claim: "看到了图", evidence_slot: "visual-1" }];
    expect(() => validateOracleGateResponse(visual, "transcript_only")).toThrow("evidence_slot 无效");
    for (const claim of [
      "学生已经掌握此能力",
      "孩子已经掌握此能力",
      "班级正确率提高",
      "全班错误率下降",
      "小明作答正确",
      "students improved scores",
      "learners answered correctly",
      "学生均能独立解出题目",
      "全班都会了",
      "learners solved every problem",
      "the class can now solve the problem",
      "学生应该先尝试，最后正确完成了题目",
      "students might initially struggle but solved every problem",
      "students should practice; they later answered correctly",
      "学生题目全解对了",
      "全班拿到了满分",
      "学员人人过关",
      "同学们没有再出错",
      "learners aced the test",
      "students got full marks",
      "pupils made no mistakes",
      "the class passed the exam",
      "要求学生先尝试；后来拿到了满分",
      "students may practice; aced the test",
    ]) {
      const fabricated = response();
      fabricated.uncertainties = [claim];
      expect(() => validateOracleGateResponse(fabricated, "oracle_delta")).not.toThrow();
    }

    for (const anticipated of [
      "引导学生能独立解出题目",
      "如果全班能解题则进入下一步",
      "help learners solve the problem",
      "if the class can solve the problem, continue",
      "学生应该掌握这个方法",
      "students should be able to solve the problem",
      "请学生完成一次独立作答",
      "students will attempt the problem after a prompt",
      "引导学生观察；继续提示比较差异",
    ]) {
      const hypothetical = response();
      hypothetical.generalized_teaching_capability = {
        name: "条件化支架",
        mechanism: "只描述教师计划",
        action_program: [anticipated],
      };
      expect(() => validateOracleGateResponse(hypothetical, "oracle_delta")).not.toThrow();
    }

    for (const uncertainty of [
      "无法判断学生是否掌握此能力",
      "全班表现待验证",
      "learners' outcome was not observed",
      "cannot determine whether the class understood",
    ]) {
      const unknown = response();
      unknown.uncertainties = [uncertainty];
      expect(() => validateOracleGateResponse(unknown, "oracle_delta")).not.toThrow();
    }

    const observedLeak = response();
    observedLeak.observed_board_actions = [{ sequence_index: 1, operation: "add", content: "学生在作答", region: null }];
    expect(() => validateOracleGateResponse(observedLeak, "oracle_delta")).not.toThrow();
    expect(lintOracleGateResponseSemantics(observedLeak as never)).not.toHaveLength(0);
    const evidenceLeak = response();
    evidenceLeak.evidence_claims = [{ claim: "全班完成练习", evidence_slot: "transcript" }];
    expect(() => validateOracleGateResponse(evidenceLeak, "oracle_delta")).not.toThrow();
    expect(lintOracleGateResponseSemantics(evidenceLeak as never)).not.toHaveLength(0);
    const crossClauseUncertainty = response();
    crossClauseUncertainty.uncertainties = ["无法判断学生是否掌握；但学生拿到了满分"];
    expect(() => validateOracleGateResponse(crossClauseUncertainty, "oracle_delta")).not.toThrow();
    expect(lintOracleGateResponseSemantics(crossClauseUncertainty as never)).not.toHaveLength(0);
  });
});
