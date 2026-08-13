import {
  canonicalOracleGateFormalSpecPayload,
  validateOracleGateFormalSpec,
  type OracleGateFormalSpec,
} from "./oracle-gate-formal.js";
import {
  hashOracleGatePublicEvidenceDerivationPolicyV2,
  validateOracleGatePublicEvidenceDerivationPolicyV2,
  type OracleGatePublicEvidenceDerivationPolicyV2,
} from "./oracle-gate-public-evidence-v2.js";
import { sha256Hex } from "./sha256.js";
import type { FormalRunContractV1 } from "./oracle-gate-run.js";

export const ORACLE_GATE_STATISTICS_PLAN_V2_DOMAIN = "skyclass/formal-oracle/statistics-plan/v2\0";
export const ORACLE_GATE_FORMAL_SPEC_V2_DOMAIN = "skyclass/formal-oracle/formal-spec/v2\0";
export const ORACLE_GATE_RATING_PLAN_V2_DOMAIN = "skyclass/formal-oracle/rating-plan/v2\0";
export const FORMAL_ORACLE_PREREGISTRATION_BUNDLE_V2_DOMAIN = "skyclass/formal-oracle/preregistration-bundle/v2\0";
export const FORMAL_ORACLE_RUN_CONTRACT_V2_DOMAIN = "skyclass/formal-oracle/run-contract/v2\0";

export type OracleGatePreregisteredMetricV2 =
  | "evidence_f1"
  | "temporal_fidelity"
  | "edit_coverage"
  | "unsupported_claim_rate";

export interface OracleGateStatisticsPlanV2 {
  schema_version: "oracle-gate-statistics-plan-v2";
  statistics_plan_sha256: string;
  record_trust: "non_authoritative_preregistered_statistics_plan";
  public_evidence_derivation_policy_sha256: string;
  public_evidence_schema_version: "oracle-gate-public-evidence-package-v2";
  private_derivation_schema_version: "oracle-gate-private-evidence-derivation-receipt-v2";
  metric_order: ["evidence_f1", "temporal_fidelity", "edit_coverage", "unsupported_claim_rate"];
  strongest_non_oracle_selection_metric: "evidence_f1";
  strongest_non_oracle_tie_order: ["static_final_board", "uniform_frame", "transcript_only"];
  item_rater_aggregation: "equal_mean_two_raters";
  point_aggregation: "case_seed_mean_then_case_macro_then_video_macro_then_teacher_macro";
  bootstrap_method: "hierarchical_teacher_video_case_seed_paired_v2";
  bootstrap_seed: number;
  bootstrap_replicates: number;
  primary_ci: 0.8;
  descriptive_ci: 0.95;
  quantile_method: "sorted_linear_interpolation_r7";
  missing_policy: "blocked_no_partial_statistics";
  zero_eligible_policy: "metric_null_and_gate_blocked";
  single_event_temporal_policy: "exclude_temporal_item_symmetrically_within_case_seed_keep_other_metrics-v1";
  empty_temporal_population_policy: "blocked_no_temporal_population";
  minimum_teachers: 2;
  minimum_seeds_per_case: 3;
  created_at: string;
  api_execution_allowed: false;
}

export interface OracleGateFormalSpecV2 extends Omit<OracleGateFormalSpec, "schema_version" | "evaluation"> {
  schema_version: "oracle-gate-formal-spec-v2";
  created_at: string;
  evaluation: Omit<OracleGateFormalSpec["evaluation"], "rating_schema_version"> & {
    rating_schema_version: "oracle-gate-rating-ledger-v2";
    public_evidence_derivation_policy_schema_version: "oracle-gate-public-evidence-derivation-policy-v2";
    public_evidence_derivation_policy_sha256: string;
    statistics_plan_schema_version: "oracle-gate-statistics-plan-v2";
    statistics_plan_sha256: string;
    public_evidence_schema_version: "oracle-gate-public-evidence-package-v2";
    private_derivation_schema_version: "oracle-gate-private-evidence-derivation-receipt-v2";
  };
}

export interface OracleGateRatingPlanV2 {
  schema_version: "oracle-gate-rating-plan-v2";
  rating_plan_sha256: string;
  record_trust: "non_authoritative_preregistered_rating_plan";
  formal_spec_sha256: string;
  public_evidence_derivation_policy_sha256: string;
  rubric_version: string;
  rubric_sha256: string;
  required_independent_raters: 2;
  rating_schema_version: "oracle-gate-rating-ledger-v2";
  public_evidence_schema_version: "oracle-gate-public-evidence-package-v2";
  private_derivation_schema_version: "oracle-gate-private-evidence-derivation-receipt-v2";
  metrics: ["evidence_f1", "temporal_fidelity", "edit_coverage", "unsupported_claim_rate"];
  statistics_plan: OracleGateStatisticsPlanV2;
  statistics_plan_sha256: string;
  created_at: string;
  api_execution_allowed: false;
}

export interface FormalOraclePreregistrationBundleV2 {
  schema_version: "formal-oracle-preregistration-bundle-v2";
  preregistration_bundle_sha256: string;
  record_trust: "non_authoritative_preregistration_bundle_external_worm_pending";
  policy: OracleGatePublicEvidenceDerivationPolicyV2;
  public_evidence_derivation_policy_sha256: string;
  statistics_plan: OracleGateStatisticsPlanV2;
  statistics_plan_sha256: string;
  formal_spec: OracleGateFormalSpecV2;
  formal_spec_sha256: string;
  rating_plan: OracleGateRatingPlanV2;
  rating_plan_sha256: string;
  api_execution_allowed: false;
}

export interface FormalRunContractV2 extends Omit<FormalRunContractV1,
  "schema_version" | "canonicalization" | "run_sha256"> {
  schema_version: "oracle-gate-formal-run-contract-v2";
  run_sha256: string;
  canonicalization: "oracle-gate-run-canonical-json-v2";
  preregistration_bundle_sha256: string;
  public_evidence_derivation_policy_sha256: string;
}

export interface OracleGatePreregistrationValidationIssue { path: string; message: string }
export interface OracleGatePreregistrationValidationReport { valid: boolean; issues: OracleGatePreregistrationValidationIssue[] }

const SHA = /^[a-f0-9]{64}$/;
const METRICS = ["evidence_f1", "temporal_fidelity", "edit_coverage", "unsupported_claim_rate"] as const;
const TIE = ["static_final_board", "uniform_frame", "transcript_only"] as const;

function report(issues: OracleGatePreregistrationValidationIssue[]): OracleGatePreregistrationValidationReport {
  return { valid: issues.length === 0, issues };
}
function issue(issues: OracleGatePreregistrationValidationIssue[], condition: boolean, path: string, message: string): void {
  if (!condition) issues.push({ path, message });
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function dense(value: unknown): value is unknown[] {
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && Object.keys(value).length === value.length
    && Object.keys(value).every((key, index) => key === String(index));
}
function exact(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields].sort());
}
function canonicalTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}
function stable(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || Object.is(value, -0)) throw new Error("non-canonical number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (!dense(value)) throw new Error("non-dense array");
    return `[${value.map(stable).join(",")}]`;
  }
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  throw new Error("non-plain data");
}
function without(value: object, field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}
function domainHash(domain: string, value: object, self: string): string {
  const snapshot = safeSnapshot(value) as object;
  return sha256Hex(`${domain}${stable(without(snapshot, self))}`);
}
export function snapshotFormalOraclePreregistrationV2PlainData<T>(value: T): T {
  const clone = (input: unknown): unknown => {
    if (input === null || typeof input === "string" || typeof input === "boolean") return input;
    if (typeof input === "number") {
      if (!Number.isFinite(input) || Math.abs(input) > Number.MAX_SAFE_INTEGER || Object.is(input, -0)) throw new Error("number");
      return input;
    }
    if (!input || typeof input !== "object" || Object.getOwnPropertySymbols(input).length) throw new Error("plain");
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Array.isArray(input)) {
      if (Object.getPrototypeOf(input) !== Array.prototype) throw new Error("array prototype");
      const keys = Object.keys(descriptors).filter((key) => key !== "length");
      if (keys.length !== input.length || keys.some((key, index) => key !== String(index))) throw new Error("dense");
      return keys.map((key) => {
        const descriptor = descriptors[key];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("accessor");
        return clone(descriptor.value);
      });
    }
    if (Object.getPrototypeOf(input) !== Object.prototype || Object.hasOwn(input, "toJSON")) throw new Error("object prototype");
    const output: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!("value" in descriptor) || !descriptor.enumerable) throw new Error("accessor");
      output[key] = clone(descriptor.value);
    }
    return output;
  };
  return clone(value) as T;
}

const safeSnapshot = snapshotFormalOraclePreregistrationV2PlainData;

export function hashOracleGateStatisticsPlanV2(value: OracleGateStatisticsPlanV2): string {
  return domainHash(ORACLE_GATE_STATISTICS_PLAN_V2_DOMAIN, value, "statistics_plan_sha256");
}
export function canonicalOracleGateFormalSpecV2Payload(value: OracleGateFormalSpecV2): string {
  return stable(without(safeSnapshot(value) as object, "spec_sha256"));
}
export function hashOracleGateFormalSpecV2(value: OracleGateFormalSpecV2): string {
  return sha256Hex(`${ORACLE_GATE_FORMAL_SPEC_V2_DOMAIN}${canonicalOracleGateFormalSpecV2Payload(value)}`);
}
export function hashOracleGateRatingPlanV2(value: OracleGateRatingPlanV2): string {
  return domainHash(ORACLE_GATE_RATING_PLAN_V2_DOMAIN, value, "rating_plan_sha256");
}
export function hashFormalOraclePreregistrationBundleV2(value: FormalOraclePreregistrationBundleV2): string {
  return domainHash(FORMAL_ORACLE_PREREGISTRATION_BUNDLE_V2_DOMAIN, value, "preregistration_bundle_sha256");
}
export function canonicalFormalRunContractV2Payload(value: FormalRunContractV2): string {
  return stable(without(safeSnapshot(value) as object, "run_sha256"));
}
export function hashFormalRunContractV2(value: FormalRunContractV2): string {
  return sha256Hex(`${FORMAL_ORACLE_RUN_CONTRACT_V2_DOMAIN}${canonicalFormalRunContractV2Payload(value)}`);
}

export function validateOracleGateStatisticsPlanV2(input: unknown): OracleGatePreregistrationValidationReport {
  try { input = safeSnapshot(input); }
  catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: OracleGatePreregistrationValidationIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须是 plain object" }]);
  issue(issues, exact(input, ["schema_version","statistics_plan_sha256","record_trust","public_evidence_derivation_policy_sha256","public_evidence_schema_version","private_derivation_schema_version","metric_order","strongest_non_oracle_selection_metric","strongest_non_oracle_tie_order","item_rater_aggregation","point_aggregation","bootstrap_method","bootstrap_seed","bootstrap_replicates","primary_ci","descriptive_ci","quantile_method","missing_policy","zero_eligible_policy","single_event_temporal_policy","empty_temporal_population_policy","minimum_teachers","minimum_seeds_per_case","created_at","api_execution_allowed"]), "$", "字段集合无效");
  issue(issues, input.schema_version === "oracle-gate-statistics-plan-v2" && input.record_trust === "non_authoritative_preregistered_statistics_plan", "schema_version", "版本或信任状态无效");
  issue(issues, SHA.test(String(input.statistics_plan_sha256)) && SHA.test(String(input.public_evidence_derivation_policy_sha256)), "roots", "SHA 无效");
  issue(issues, input.public_evidence_schema_version === "oracle-gate-public-evidence-package-v2" && input.private_derivation_schema_version === "oracle-gate-private-evidence-derivation-receipt-v2", "evidence_schema", "版本无效");
  issue(issues, dense(input.metric_order) && stable(input.metric_order) === stable(METRICS), "metric_order", "四指标顺序无效");
  issue(issues, input.strongest_non_oracle_selection_metric === "evidence_f1" && dense(input.strongest_non_oracle_tie_order) && stable(input.strongest_non_oracle_tie_order) === stable(TIE), "selection", "baseline 选择规则无效");
  issue(issues, input.item_rater_aggregation === "equal_mean_two_raters" && input.point_aggregation === "case_seed_mean_then_case_macro_then_video_macro_then_teacher_macro" && input.bootstrap_method === "hierarchical_teacher_video_case_seed_paired_v2", "aggregation", "聚合规则无效");
  issue(issues, Number.isSafeInteger(input.bootstrap_seed) && Number(input.bootstrap_seed) >= 0 && Number(input.bootstrap_seed) <= 0xffff_ffff && Number.isSafeInteger(input.bootstrap_replicates) && Number(input.bootstrap_replicates) >= 1000, "bootstrap", "seed/replicates 无效");
  issue(issues, input.primary_ci === 0.8 && input.descriptive_ci === 0.95 && input.quantile_method === "sorted_linear_interpolation_r7", "ci", "CI 规则无效");
  issue(issues, input.missing_policy === "blocked_no_partial_statistics" && input.zero_eligible_policy === "metric_null_and_gate_blocked" && input.single_event_temporal_policy === "exclude_temporal_item_symmetrically_within_case_seed_keep_other_metrics-v1" && input.empty_temporal_population_policy === "blocked_no_temporal_population", "missing", "缺失/NA 规则无效");
  issue(issues, input.minimum_teachers === 2 && input.minimum_seeds_per_case === 3 && canonicalTime(input.created_at) && input.api_execution_allowed === false, "gates", "门槛或时间无效");
  if (SHA.test(String(input.statistics_plan_sha256))) try { issue(issues, hashOracleGateStatisticsPlanV2(input as unknown as OracleGateStatisticsPlanV2) === input.statistics_plan_sha256, "statistics_plan_sha256", "正文哈希不匹配"); } catch { issues.push({ path: "statistics_plan_sha256", message: "不可规范化" }); }
  return report(issues);
}

export function validateOracleGateFormalSpecV2(input: unknown): OracleGatePreregistrationValidationReport {
  try { input = safeSnapshot(input); }
  catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: OracleGatePreregistrationValidationIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须是 plain object" }]);
  issue(issues, exact(input, ["schema_version","spec_sha256","input_manifest_sha256","signed_gold_dataset_sha256","code_revision","model","transport","cache_retention","tools_policy","temperature","seeds","prompt","budget","evaluation","created_at"]), "$", "字段集合无效");
  const legacy = {
    ...input,
    schema_version: "oracle-gate-formal-spec-v1",
    evaluation: record(input.evaluation) ? { ...input.evaluation, rating_schema_version: "oracle-gate-rating-v1" } : input.evaluation,
  } as unknown as OracleGateFormalSpec;
  const legacyReport = validateOracleGateFormalSpec(legacy);
  issues.push(...legacyReport.issues.filter((entry) => entry.path !== "schema_version"));
  issue(issues, input.schema_version === "oracle-gate-formal-spec-v2" && canonicalTime(input.created_at), "schema_version", "版本或时间无效");
  issue(issues, dense(input.seeds), "seeds", "必须是稠密数组");
  issue(issues, record(input.prompt) && exact(input.prompt, ["version","system_sha256","user_template_sha256","output_schema_sha256"]), "prompt", "字段集合无效");
  issue(issues, record(input.budget) && exact(input.budget, ["max_input_tokens","max_output_tokens","visual_items_per_visual_arm","canvas","timeout_ms","max_attempts"]), "budget", "字段集合无效");
  if (record(input.budget)) issue(issues, record(input.budget.canvas) && exact(input.budget.canvas, ["mime_type","width","height","quality"]), "budget.canvas", "字段集合无效");
  if (record(input.evaluation)) {
    issue(issues, exact(input.evaluation, ["rubric_version","rubric_sha256","rating_schema_version","independent_raters","primary_ci","descriptive_ci","bootstrap_seed","strongest_non_oracle_rule","missing_request_policy","public_evidence_derivation_policy_schema_version","public_evidence_derivation_policy_sha256","statistics_plan_schema_version","statistics_plan_sha256","public_evidence_schema_version","private_derivation_schema_version"]), "evaluation", "字段集合无效");
    issue(issues, input.evaluation.public_evidence_derivation_policy_schema_version === "oracle-gate-public-evidence-derivation-policy-v2" && SHA.test(String(input.evaluation.public_evidence_derivation_policy_sha256)), "evaluation.policy", "根无效");
    issue(issues, input.evaluation.statistics_plan_schema_version === "oracle-gate-statistics-plan-v2" && SHA.test(String(input.evaluation.statistics_plan_sha256)), "evaluation.statistics", "根无效");
    issue(issues, input.evaluation.public_evidence_schema_version === "oracle-gate-public-evidence-package-v2" && input.evaluation.private_derivation_schema_version === "oracle-gate-private-evidence-derivation-receipt-v2", "evaluation.evidence", "版本无效");
    issue(issues, input.evaluation.rating_schema_version === "oracle-gate-rating-ledger-v2", "evaluation.rating_schema_version", "必须预注册 V2 ledger");
  }
  if (SHA.test(String(input.spec_sha256))) try { issue(issues, hashOracleGateFormalSpecV2(input as unknown as OracleGateFormalSpecV2) === input.spec_sha256, "spec_sha256", "正文哈希不匹配"); } catch { issues.push({ path: "spec_sha256", message: "不可规范化" }); }
  return report(issues);
}

export function validateOracleGateRatingPlanV2(input: unknown): OracleGatePreregistrationValidationReport {
  try { input = safeSnapshot(input); }
  catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: OracleGatePreregistrationValidationIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须是 plain object" }]);
  issue(issues, exact(input, ["schema_version","rating_plan_sha256","record_trust","formal_spec_sha256","public_evidence_derivation_policy_sha256","rubric_version","rubric_sha256","required_independent_raters","rating_schema_version","public_evidence_schema_version","private_derivation_schema_version","metrics","statistics_plan","statistics_plan_sha256","created_at","api_execution_allowed"]), "$", "字段集合无效");
  issue(issues, input.schema_version === "oracle-gate-rating-plan-v2" && input.record_trust === "non_authoritative_preregistered_rating_plan", "schema_version", "版本或信任状态无效");
  for (const field of ["rating_plan_sha256","formal_spec_sha256","public_evidence_derivation_policy_sha256","rubric_sha256","statistics_plan_sha256"] as const) issue(issues, SHA.test(String(input[field])), field, "SHA 无效");
  issue(issues, input.required_independent_raters === 2 && input.rating_schema_version === "oracle-gate-rating-ledger-v2" && input.public_evidence_schema_version === "oracle-gate-public-evidence-package-v2" && input.private_derivation_schema_version === "oracle-gate-private-evidence-derivation-receipt-v2", "versions", "评分/evidence 版本无效");
  issue(issues, dense(input.metrics) && stable(input.metrics) === stable(METRICS), "metrics", "四指标顺序无效");
  const statistics = validateOracleGateStatisticsPlanV2(input.statistics_plan);
  issues.push(...statistics.issues.map((entry) => ({ path: `statistics_plan.${entry.path}`, message: entry.message })));
  if (record(input.statistics_plan)) issue(issues, input.statistics_plan_sha256 === input.statistics_plan.statistics_plan_sha256, "statistics_plan_sha256", "正文根不匹配");
  issue(issues, canonicalTime(input.created_at) && input.api_execution_allowed === false, "created_at", "时间或安全门无效");
  if (SHA.test(String(input.rating_plan_sha256))) try { issue(issues, hashOracleGateRatingPlanV2(input as unknown as OracleGateRatingPlanV2) === input.rating_plan_sha256, "rating_plan_sha256", "正文哈希不匹配"); } catch { issues.push({ path: "rating_plan_sha256", message: "不可规范化" }); }
  return report(issues);
}

export function validateFormalOraclePreregistrationBundleV2(input: unknown): OracleGatePreregistrationValidationReport {
  let value: unknown;
  try { value = safeSnapshot(input); }
  catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: OracleGatePreregistrationValidationIssue[] = [];
  if (!record(value)) return report([{ path: "$", message: "必须是 plain object" }]);
  issue(issues, exact(value, ["schema_version","preregistration_bundle_sha256","record_trust","policy","public_evidence_derivation_policy_sha256","statistics_plan","statistics_plan_sha256","formal_spec","formal_spec_sha256","rating_plan","rating_plan_sha256","api_execution_allowed"]), "$", "字段集合无效");
  issue(issues, value.schema_version === "formal-oracle-preregistration-bundle-v2" && value.record_trust === "non_authoritative_preregistration_bundle_external_worm_pending", "schema_version", "版本或信任状态无效");
  const policy = validateOracleGatePublicEvidenceDerivationPolicyV2(value.policy);
  const statistics = validateOracleGateStatisticsPlanV2(value.statistics_plan);
  const spec = validateOracleGateFormalSpecV2(value.formal_spec);
  const rating = validateOracleGateRatingPlanV2(value.rating_plan);
  issues.push(...policy.issues.map((entry) => ({ path: `policy.${entry.path}`, message: entry.message })), ...statistics.issues.map((entry) => ({ path: `statistics_plan.${entry.path}`, message: entry.message })), ...spec.issues.map((entry) => ({ path: `formal_spec.${entry.path}`, message: entry.message })), ...rating.issues.map((entry) => ({ path: `rating_plan.${entry.path}`, message: entry.message })));
  if (!issues.length && record(value.policy) && record(value.statistics_plan) && record(value.formal_spec) && record(value.rating_plan)) {
    const P = value.policy as unknown as OracleGatePublicEvidenceDerivationPolicyV2;
    const S = value.statistics_plan as unknown as OracleGateStatisticsPlanV2;
    const F = value.formal_spec as unknown as OracleGateFormalSpecV2;
    const R = value.rating_plan as unknown as OracleGateRatingPlanV2;
    issue(issues, value.public_evidence_derivation_policy_sha256 === P.public_evidence_derivation_policy_sha256 && value.statistics_plan_sha256 === S.statistics_plan_sha256 && value.formal_spec_sha256 === F.spec_sha256 && value.rating_plan_sha256 === R.rating_plan_sha256, "roots", "bundle 顶层根不匹配正文");
    issue(issues, hashOracleGatePublicEvidenceDerivationPolicyV2(P) === P.public_evidence_derivation_policy_sha256, "policy", "policy 正文哈希不匹配");
    issue(issues, S.public_evidence_derivation_policy_sha256 === P.public_evidence_derivation_policy_sha256 && F.evaluation.public_evidence_derivation_policy_sha256 === P.public_evidence_derivation_policy_sha256 && R.public_evidence_derivation_policy_sha256 === P.public_evidence_derivation_policy_sha256, "policy", "policy 根未贯穿三份 artifact");
    issue(issues, F.evaluation.statistics_plan_sha256 === S.statistics_plan_sha256 && R.statistics_plan_sha256 === S.statistics_plan_sha256 && stable(R.statistics_plan) === stable(S), "statistics", "statistics plan 未逐字贯穿 spec/rating");
    issue(issues, R.formal_spec_sha256 === F.spec_sha256 && R.rubric_version === F.evaluation.rubric_version && R.rubric_sha256 === F.evaluation.rubric_sha256, "rating", "rating plan 未绑定 spec/rubric");
    issue(issues, S.bootstrap_seed === F.evaluation.bootstrap_seed && S.primary_ci === F.evaluation.primary_ci
      && S.descriptive_ci === F.evaluation.descriptive_ci && R.required_independent_raters === F.evaluation.independent_raters,
    "evaluation", "statistics/rating 与 spec 的 bootstrap/CI/rater 权威不一致");
    issue(issues, Date.parse(P.created_at) <= Date.parse(F.created_at) && Date.parse(S.created_at) <= Date.parse(F.created_at) && Date.parse(F.created_at) <= Date.parse(R.created_at), "time", "必须 policy/statistics ≤ spec ≤ rating plan");
  }
  issue(issues, value.api_execution_allowed === false, "api_execution_allowed", "必须 false");
  if (SHA.test(String(value.preregistration_bundle_sha256))) try { issue(issues, hashFormalOraclePreregistrationBundleV2(value as unknown as FormalOraclePreregistrationBundleV2) === value.preregistration_bundle_sha256, "preregistration_bundle_sha256", "正文哈希不匹配"); } catch { issues.push({ path: "preregistration_bundle_sha256", message: "不可规范化" }); }
  else issues.push({ path: "preregistration_bundle_sha256", message: "SHA 无效" });
  return report(issues);
}

export function validateFormalRunContractV2(input: unknown): OracleGatePreregistrationValidationReport {
  try { input = safeSnapshot(input); }
  catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues: OracleGatePreregistrationValidationIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须是 plain object" }]);
  issue(issues, exact(input, ["schema_version","run_sha256","canonicalization","signed_gold_dataset_sha256","formal_input_manifest_sha256","formal_spec_sha256","schedule_sha256","execution_plan_sha256","ledger_registry_sha256","media_attestation_sha256","speech_attestation_sha256","code_revision","build_artifact_sha256","blinding_secret_commitment_sha256","blinding_scheme","rating_plan_sha256","statistics_plan_sha256","preregistration_bundle_sha256","public_evidence_derivation_policy_sha256","run_store_uri","request_count","directory_mode","file_mode","lock_scheme","checkpoint_scheme","remote_idempotency_mode","api_execution_allowed"]), "$", "字段集合无效");
  issue(issues, input.schema_version === "oracle-gate-formal-run-contract-v2" && input.canonicalization === "oracle-gate-run-canonical-json-v2", "schema_version", "版本或 canonicalization 无效");
  for (const field of ["run_sha256","signed_gold_dataset_sha256","formal_input_manifest_sha256","formal_spec_sha256","schedule_sha256","execution_plan_sha256","ledger_registry_sha256","media_attestation_sha256","speech_attestation_sha256","build_artifact_sha256","blinding_secret_commitment_sha256","rating_plan_sha256","statistics_plan_sha256","preregistration_bundle_sha256","public_evidence_derivation_policy_sha256"] as const) issue(issues, SHA.test(String(input[field])), field, "SHA 无效");
  issue(issues, typeof input.code_revision === "string" && /^[a-f0-9]{40}$/.test(input.code_revision), "code_revision", "必须是完整小写 commit");
  issue(issues, input.blinding_scheme === "hmac-sha256-run-request-v1", "blinding_scheme", "无效");
  issue(issues, typeof input.run_store_uri === "string" && input.run_store_uri.length > 0 && !input.run_store_uri.startsWith("/") && !input.run_store_uri.includes("\\") && !input.run_store_uri.includes("\0") && input.run_store_uri.split("/").every((part) => Boolean(part) && part !== "." && part !== ".."), "run_store_uri", "必须是受控相对路径");
  issue(issues, Number.isSafeInteger(input.request_count) && Number(input.request_count) >= 1, "request_count", "必须为正安全整数");
  issue(issues, input.directory_mode === "0700" && input.file_mode === "0600" && input.lock_scheme === "exclusive-create-owner-nonce-v1" && input.checkpoint_scheme === "immutable-hash-chain-head-v1", "store", "私有 store 策略无效");
  issue(issues, input.remote_idempotency_mode === "provider_enforced" || input.remote_idempotency_mode === "local_only_fail_closed", "remote_idempotency_mode", "无效");
  issue(issues, input.api_execution_allowed === false, "api_execution_allowed", "必须 false");
  if (SHA.test(String(input.run_sha256))) try { issue(issues, hashFormalRunContractV2(input as unknown as FormalRunContractV2) === input.run_sha256, "run_sha256", "正文哈希不匹配"); } catch { issues.push({ path: "run_sha256", message: "不可规范化" }); }
  return report(issues);
}

export function validateFormalRunContractV2AgainstPreregistrationBundle(
  runInput: unknown,
  bundleInput: unknown,
): OracleGatePreregistrationValidationReport {
  let run: unknown, bundle: unknown;
  try { run = safeSnapshot(runInput); bundle = safeSnapshot(bundleInput); }
  catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues = [
    ...validateFormalRunContractV2(run).issues.map((entry) => ({ path: `run.${entry.path}`, message: entry.message })),
    ...validateFormalOraclePreregistrationBundleV2(bundle).issues.map((entry) => ({ path: `bundle.${entry.path}`, message: entry.message })),
  ];
  if (!issues.length) {
    const R = run as FormalRunContractV2, B = bundle as FormalOraclePreregistrationBundleV2;
    issue(issues, R.preregistration_bundle_sha256 === B.preregistration_bundle_sha256 && R.public_evidence_derivation_policy_sha256 === B.public_evidence_derivation_policy_sha256 && R.statistics_plan_sha256 === B.statistics_plan_sha256 && R.rating_plan_sha256 === B.rating_plan_sha256 && R.formal_spec_sha256 === B.formal_spec_sha256, "roots", "run 未绑定同一 preregistration bundle 四根");
    issue(issues, R.signed_gold_dataset_sha256 === B.formal_spec.signed_gold_dataset_sha256 && R.formal_input_manifest_sha256 === B.formal_spec.input_manifest_sha256 && R.code_revision === B.formal_spec.code_revision, "formal", "run 与 spec 的 Gold/input/code 根不闭合");
  }
  return report(issues);
}

export function validateOracleGateRatingPlanV2AgainstFormalSpecV2(plan: unknown, spec: unknown): OracleGatePreregistrationValidationReport {
  let bundleLike: { plan: unknown; spec: unknown };
  try { bundleLike = { plan: safeSnapshot(plan), spec: safeSnapshot(spec) }; }
  catch { return report([{ path: "$", message: "必须是无 accessor/toJSON 的 plain data" }]); }
  const issues = [...validateOracleGateRatingPlanV2(bundleLike.plan).issues, ...validateOracleGateFormalSpecV2(bundleLike.spec).issues];
  if (!issues.length) {
    const P = bundleLike.plan as OracleGateRatingPlanV2, S = bundleLike.spec as OracleGateFormalSpecV2;
    issue(issues, P.formal_spec_sha256 === S.spec_sha256 && P.public_evidence_derivation_policy_sha256 === S.evaluation.public_evidence_derivation_policy_sha256 && P.statistics_plan_sha256 === S.evaluation.statistics_plan_sha256 && P.rubric_version === S.evaluation.rubric_version && P.rubric_sha256 === S.evaluation.rubric_sha256, "roots", "plan/spec 根不闭合");
    issue(issues, P.statistics_plan.bootstrap_seed === S.evaluation.bootstrap_seed
      && P.statistics_plan.primary_ci === S.evaluation.primary_ci
      && P.statistics_plan.descriptive_ci === S.evaluation.descriptive_ci
      && P.required_independent_raters === S.evaluation.independent_raters,
    "evaluation", "plan statistics 与 spec 的 bootstrap/CI/rater 权威不一致");
    issue(issues, Date.parse(S.created_at) <= Date.parse(P.created_at), "created_at", "rating plan 不得早于 spec");
  }
  return report(issues);
}

/** Legacy V1 specs have no policy/statistics roots and can never be upgraded in place. */
export function isLegacyPostHocFormalSpec(value: OracleGateFormalSpec | OracleGateFormalSpecV2): value is OracleGateFormalSpec {
  return value.schema_version === "oracle-gate-formal-spec-v1";
}

export function legacyFormalSpecCanonicalHash(value: OracleGateFormalSpec): string {
  return sha256Hex(canonicalOracleGateFormalSpecPayload(value));
}
