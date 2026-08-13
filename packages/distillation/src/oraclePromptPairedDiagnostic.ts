export type OraclePromptPairedDiagnosticDecision = "REGION_FIX_RETAINED" | "ATOMIC_QUESTION_CONTRACT_NEEDED" | "REPRESENTATION_REDESIGN";
export type OraclePromptPairedDiagnosticCompilationDecision = OraclePromptPairedDiagnosticDecision | "BLOCKED";
export interface OraclePromptPairedDiagnosticDecisionInput { any_hard_failure:boolean;all_v2_oracle_unsupported_counts_zero:boolean;overall_oracle_f1_delta:number;known_condition_oracle_f1_delta:number;question_pair_oracle_f1_delta:number;friction_question_recovery_drop:number;acceleration_question_recovery_drop:number }
export function decideOraclePromptPairedDiagnostic(input:OraclePromptPairedDiagnosticDecisionInput):OraclePromptPairedDiagnosticDecision {
  if(!input.any_hard_failure&&input.all_v2_oracle_unsupported_counts_zero&&input.overall_oracle_f1_delta>=-0.02&&input.known_condition_oracle_f1_delta>=-0.05&&input.question_pair_oracle_f1_delta>=-0.05)return "REGION_FIX_RETAINED";
  if(!input.any_hard_failure&&input.question_pair_oracle_f1_delta< -0.05&&(input.friction_question_recovery_drop>=0.25||input.acceleration_question_recovery_drop>=0.25)&&input.known_condition_oracle_f1_delta>=-0.05)return "ATOMIC_QUESTION_CONTRACT_NEEDED";
  return "REPRESENTATION_REDESIGN";
}

export function classifyOraclePromptPairedDiagnostic(
  input: OraclePromptPairedDiagnosticDecisionInput & { validation_ok: boolean },
): OraclePromptPairedDiagnosticCompilationDecision {
  return input.validation_ok ? decideOraclePromptPairedDiagnostic(input) : "BLOCKED";
}

export interface OraclePromptPairedRatingCounts {
  true_positive: number;
  false_positive: number;
  false_negative: number;
  evidence_unit_count: number;
  evidence_claim_count: number;
  factual_claim_count: number;
  unsupported_claim_count: number;
}

export function assertOraclePromptPairedRatingCounts(input: OraclePromptPairedRatingCounts): void {
  const values = Object.values(input);
  if (!values.every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("paired diagnostic rating counts 必须是非负安全整数");
  }
  if (input.true_positive + input.false_negative !== input.evidence_unit_count) {
    throw new Error("paired diagnostic TP+FN 必须等于冻结 evidence unit 分母");
  }
  if (input.evidence_claim_count > input.factual_claim_count) {
    throw new Error("paired diagnostic evidence claim 数不得超过事实性 claim 数");
  }
  if (input.false_positive > input.evidence_claim_count) {
    throw new Error("paired diagnostic FP 不得超过响应中的事实性 claim 数");
  }
  if (input.unsupported_claim_count < input.false_positive || input.unsupported_claim_count > input.factual_claim_count) {
    throw new Error("paired diagnostic unsupported count 不闭合");
  }
}
