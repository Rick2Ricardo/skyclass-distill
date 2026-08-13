import {describe,expect,it} from "vitest";
import {assertOraclePromptPairedRatingCounts,classifyOraclePromptPairedDiagnostic,decideOraclePromptPairedDiagnostic} from "./oraclePromptPairedDiagnostic.js";
const base={any_hard_failure:false,all_v2_oracle_unsupported_counts_zero:true,overall_oracle_f1_delta:0,known_condition_oracle_f1_delta:0,question_pair_oracle_f1_delta:0,friction_question_recovery_drop:0,acceleration_question_recovery_drop:0};
describe("paired prompt diagnostic decision",()=>{
  it("retains at the frozen inclusive boundaries",()=>expect(decideOraclePromptPairedDiagnostic({...base,overall_oracle_f1_delta:-0.02,known_condition_oracle_f1_delta:-0.05,question_pair_oracle_f1_delta:-0.05})).toBe("REGION_FIX_RETAINED"));
  it("selects the localized atomic-question branch",()=>expect(decideOraclePromptPairedDiagnostic({...base,question_pair_oracle_f1_delta:-0.051,friction_question_recovery_drop:0.25})).toBe("ATOMIC_QUESTION_CONTRACT_NEEDED"));
  it("uses redesign for broad or hard failures",()=>{expect(decideOraclePromptPairedDiagnostic({...base,known_condition_oracle_f1_delta:-0.06,question_pair_oracle_f1_delta:-0.06})).toBe("REPRESENTATION_REDESIGN");expect(decideOraclePromptPairedDiagnostic({...base,any_hard_failure:true})).toBe("REPRESENTATION_REDESIGN");});
  it("blocks before selecting a scientific branch when validation fails",()=>expect(classifyOraclePromptPairedDiagnostic({...base,validation_ok:false})).toBe("BLOCKED"));
  it("rejects phantom false positives and inconsistent frozen denominators",()=>{
    expect(()=>assertOraclePromptPairedRatingCounts({true_positive:1,false_positive:2,false_negative:0,evidence_unit_count:1,evidence_claim_count:1,factual_claim_count:3,unsupported_claim_count:2})).toThrow(/FP/);
    expect(()=>assertOraclePromptPairedRatingCounts({true_positive:0,false_positive:0,false_negative:0,evidence_unit_count:1,evidence_claim_count:0,factual_claim_count:0,unsupported_claim_count:0})).toThrow(/TP\+FN/);
    expect(()=>assertOraclePromptPairedRatingCounts({true_positive:1,false_positive:0,false_negative:0,evidence_unit_count:1,evidence_claim_count:1,factual_claim_count:1,unsupported_claim_count:0})).not.toThrow();
  });
});
