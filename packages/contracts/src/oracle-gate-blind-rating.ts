import { sha256Hex } from "./sha256.js";
import {
  canonicalOracleGateFormalSpecPayload,
  validateOracleGateFormalSpec,
  type OracleGateFormalSpec,
} from "./oracle-gate-formal.js";
import {
  validatePrivateAnswerKeyAgainstPublicPackage,
  validatePublicBlindPackage,
  type PrivateAnswerKeyV1,
  type PublicBlindPackageV1,
} from "./oracle-gate-run.js";

export const ORACLE_GATE_PUBLIC_EVIDENCE_DOMAIN =
  "skyclass/formal-oracle/public-evidence-package/v1\0";
export const ORACLE_GATE_RATING_PLAN_DOMAIN =
  "skyclass/formal-oracle/rating-plan/v1\0";
export const ORACLE_GATE_RATING_ASSIGNMENT_DOMAIN =
  "skyclass/formal-oracle/rating-assignment/v1\0";
export const ORACLE_GATE_STATISTICS_PLAN_DOMAIN =
  "skyclass/formal-oracle/statistics-plan/v1\0";
export const ORACLE_GATE_RATING_LEDGER_DOMAIN =
  "skyclass/formal-oracle/rating-ledger/v1\0";
export const ORACLE_GATE_COMPLETED_RATING_SET_DOMAIN =
  "skyclass/formal-oracle/completed-rating-set/v1\0";
export const ORACLE_VALUE_GATE_REPORT_DOMAIN =
  "skyclass/formal-oracle/value-gate-report/v1\0";

export type OracleGateArm =
  "transcript_only" | "static_final_board" | "uniform_frame" | "oracle_delta";
export type OracleGateMetric =
  | "evidence_f1"
  | "temporal_fidelity"
  | "edit_coverage"
  | "unsupported_claim_rate";

export interface OracleGatePublicEvidenceUnitV1 {
  unit_id: string;
  kind: "speech" | "board_delta";
  sequence_index: number;
  content: string;
}
export interface OracleGatePublicClaimUnitV1 {
  claim_id: string;
  claim_index: number;
  content: string;
}
export interface OracleGatePublicTemporalPairV1 {
  pair_id: string;
  before_unit_id: string;
  after_unit_id: string;
}
export interface OracleGatePublicEvidenceItemV1 {
  blind_id: string;
  response_sha256: string;
  claim_units: OracleGatePublicClaimUnitV1[];
  evidence_units: OracleGatePublicEvidenceUnitV1[];
  eligible_evidence_unit_ids: string[];
  board_edit_unit_ids: string[];
  temporal_pairs: OracleGatePublicTemporalPairV1[];
}
export interface OracleGatePublicEvidencePackageV1 {
  schema_version: "oracle-gate-public-evidence-package-v1";
  evidence_package_sha256: string;
  record_trust: "non_authoritative_public_blind_evidence_record";
  public_response_package_sha256: string;
  rubric_version: string;
  rubric_sha256: string;
  blinding_statement: "no_explicit_arm_seed_private_id_or_pairing_metadata";
  distribution_independence_status: "pending_external_randomized_independent_sessions";
  item_count: number;
  items: OracleGatePublicEvidenceItemV1[];
  api_execution_allowed: false;
}
export interface OracleGateStatisticsPlanV1 {
  schema_version: "oracle-gate-statistics-plan-v1";
  statistics_plan_sha256: string;
  metric_order: [
    "evidence_f1",
    "temporal_fidelity",
    "edit_coverage",
    "unsupported_claim_rate",
  ];
  strongest_non_oracle_selection_metric: "evidence_f1";
  strongest_non_oracle_tie_order: [
    "static_final_board",
    "uniform_frame",
    "transcript_only",
  ];
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
  minimum_teachers: 2;
  minimum_seeds_per_case: 3;
}
/** Preregistered before the run; the run hashes this record, so it intentionally cannot hash the run back. */
export interface OracleGateRatingPlanV1 {
  schema_version: "oracle-gate-rating-plan-v1";
  rating_plan_sha256: string;
  record_trust: "non_authoritative_preregistered_rating_plan";
  rubric_version: string;
  rubric_sha256: string;
  formal_spec_sha256: string;
  required_independent_raters: 2;
  rating_schema_version: "oracle-gate-rating-ledger-v1";
  metrics: [
    "evidence_f1",
    "temporal_fidelity",
    "edit_coverage",
    "unsupported_claim_rate",
  ];
  statistics_plan: OracleGateStatisticsPlanV1;
  statistics_plan_sha256: string;
  created_at: string;
  api_execution_allowed: false;
}
/** Post-run binding. Its separation from RatingPlan prevents a run↔rating-plan content-hash cycle. */
export interface OracleGateRatingAssignmentV1 {
  schema_version: "oracle-gate-rating-assignment-v1";
  assignment_sha256: string;
  record_trust: "non_authoritative_blind_assignment_record";
  run_sha256: string;
  rating_plan_sha256: string;
  public_response_package_sha256: string;
  public_evidence_package_sha256: string;
  rubric_sha256: string;
  formal_spec_sha256: string;
  terminal_checkpoint_sha256: string;
  run_completed_at: string;
  assignment_mode: "full_package_two_raters_independent_order";
  assignments: [OracleGateRaterAssignmentV1, OracleGateRaterAssignmentV1];
  created_at: string;
  api_execution_allowed: false;
}
export interface OracleGateRaterAssignmentV1 {
  rater_id: string;
  signer_key_id: string;
  assigned_at: string;
  presentation_order_blind_ids: string[];
}
export interface OracleGateClaimJudgmentV1 {
  claim_id: string;
  claim_index: number;
  supported: boolean;
  evidence_unit_ids: string[];
}
export interface OracleGateTemporalJudgmentV1 {
  pair_id: string;
  correct_order: boolean;
}
export interface OracleGateRatingItemV1 {
  blind_id: string;
  response_sha256: string;
  evidence_item_sha256: string;
  claim_judgments: OracleGateClaimJudgmentV1[];
  covered_edit_unit_ids: string[];
  temporal_judgments: OracleGateTemporalJudgmentV1[];
}
export interface OracleGateSignedRatingLedgerV1 {
  schema_version: "oracle-gate-rating-ledger-v1";
  ledger_sha256: string;
  rating_plan_sha256: string;
  rating_assignment_sha256: string;
  public_response_package_sha256: string;
  public_evidence_package_sha256: string;
  rubric_sha256: string;
  rater_id: string;
  signer_key_id: string;
  independent_session_attestation: "rated_without_other_rater_ledger_or_private_answer_key";
  rated_at: string;
  item_count: number;
  items: OracleGateRatingItemV1[];
  signature_algorithm: "ed25519";
  signature_base64: string;
  api_execution_allowed: false;
}
export interface OracleGateCompletedRatingSetV1 {
  schema_version: "oracle-gate-completed-rating-set-v1";
  rating_set_sha256: string;
  record_trust: "non_authoritative_until_trusted_signatures_verified";
  rating_plan_sha256: string;
  rating_assignment_sha256: string;
  public_response_package_sha256: string;
  public_evidence_package_sha256: string;
  ledger_count: 2;
  ledgers: [OracleGateSignedRatingLedgerV1, OracleGateSignedRatingLedgerV1];
  completion_status: "complete_two_independent_raters";
  completed_at: string;
  api_execution_allowed: false;
}
export interface OracleValueMetricSummaryV1 {
  metric: OracleGateMetric;
  oracle_point: number;
  baseline_point: number;
  difference: number;
  primary_80_ci: [number, number];
  descriptive_95_ci: [number, number];
}
export interface OracleValueGateReportV1 {
  schema_version: "oracle-value-gate-report-v1";
  report_sha256: string;
  record_trust: "non_authoritative_statistics_record";
  evidence_scope:
    "synthetic_test_fixture_not_result" | "formal_development_oracle_value_gate";
  paper_claim_status: "prohibited_no_automatic_paper_claim";
  run_sha256: string;
  rating_plan_sha256: string;
  rating_assignment_sha256: string;
  statistics_plan_sha256: string;
  rating_set_sha256: string;
  private_answer_key_sha256: string;
  selected_strongest_non_oracle: Exclude<OracleGateArm, "oracle_delta">;
  selection_metric: "evidence_f1";
  teacher_count: number;
  video_count: number;
  case_count: number;
  seed_count: number;
  paired_observation_count: number;
  metric_summaries: OracleValueMetricSummaryV1[];
  decision: "GO" | "STOP" | "BLOCKED";
  blocked_reasons: string[];
  bootstrap_seed: number;
  bootstrap_replicates: number;
  compiled_at: string;
  signature_status: "pending_external_trusted_signature_or_worm";
  api_execution_allowed: false;
}

export interface OracleGateBlindRatingIssue {
  path: string;
  message: string;
}
export interface OracleGateBlindRatingReport {
  valid: boolean;
  issues: OracleGateBlindRatingIssue[];
}

const FORBIDDEN =
  /(?:transcript[_ -]?only|static[_ -]?final[_ -]?board|uniform[_ -]?frame|oracle[_ -]?delta|\bpairing\b|\bpaired\s+with\b|配对|(?:arm|seed|case|request|idempotency|teacher|video|window|source|event|pair)[_ -]?(?:id|key)?\s*[:=]|(?:种子|条件)\s*[:=])/i;
function privacyNormalized(value: string): string {
  return value.normalize("NFKC").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "").toLocaleLowerCase("en-US");
}
function privacySafe(value: string): boolean {
  const normalized = privacyNormalized(value);
  // Also inspect an explicit-metadata view with whitespace removed so labels
  // such as `s e e d: 7` cannot bypass the public blinding boundary.
  const compact = normalized.replace(/\s+/gu, "");
  return !FORBIDDEN.test(normalized)
    && !/(?:seed|种子|condition|条件)(?:id|key)?[:=]/u.test(compact)
    && !/(?:pairedwith|pairing|配对)/u.test(compact);
}
function record(v: unknown): v is Record<string, unknown> {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.getPrototypeOf(v) !== Object.prototype ||
    Object.getOwnPropertySymbols(v).length
  )
    return false;
  return Object.entries(Object.getOwnPropertyDescriptors(v)).every(
    ([k, d]) => k !== "toJSON" && "value" in d && d.enumerable,
  );
}
function dense(v: unknown): v is unknown[] {
  if (
    !Array.isArray(v) ||
    Object.getPrototypeOf(v) !== Array.prototype ||
    Object.getOwnPropertySymbols(v).length
  )
    return false;
  const d = Object.getOwnPropertyDescriptors(v),
    names = Object.keys(d).filter((k) => k !== "length");
  return (
    names.length === v.length &&
    names.every((k, i) => k === String(i) && "value" in d[k] && d[k].enumerable)
  );
}
function snapshotStrictPlain<T>(value: T): T {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (!value || typeof value !== "object") throw Error("必须是plain data");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      Object.getOwnPropertySymbols(value).length
    )
      throw Error("数组原型/symbol无效");
    const names = Object.keys(descriptors).filter((key) => key !== "length");
    if (
      names.length !== value.length ||
      names.some(
        (key, index) =>
          key !== String(index) ||
          !("value" in descriptors[key]) ||
          !descriptors[key].enumerable,
      )
    )
      throw Error("数组必须稠密且不得含accessor");
    return names.map((key) =>
      snapshotStrictPlain(
        (descriptors[key] as PropertyDescriptor & { value: unknown }).value,
      ),
    ) as T;
  }
  if (
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length ||
    Object.hasOwn(value, "toJSON") ||
    Object.values(descriptors).some(
      (descriptor) => !("value" in descriptor) || !descriptor.enumerable,
    )
  )
    throw Error("对象原型/toJSON/accessor无效");
  const output: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors))
    output[key] = snapshotStrictPlain(
      (descriptor as PropertyDescriptor & { value: unknown }).value,
    );
  return output as T;
}
function exact(v: Record<string, unknown>, names: readonly string[]): boolean {
  return (
    JSON.stringify(Object.keys(v).sort()) === JSON.stringify([...names].sort())
  );
}
function sha(v: unknown): v is string {
  return typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
}
function id(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(v) && privacySafe(v);
}
function blind(v: unknown): v is string {
  return typeof v === "string" && /^B-[a-f0-9]{64}$/.test(v);
}
function timestamp(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const n = Date.parse(v);
  return Number.isFinite(n) && new Date(n).toISOString() === v;
}
function text(v: unknown, max = 8192): v is string {
  return (
    typeof v === "string" &&
    v.length > 0 &&
    v.length <= max &&
    v.trim() === v &&
    !/[\u0000-\u001f\u007f]|[\ud800-\udfff]/.test(v) &&
    privacySafe(v)
  );
}
function reason(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 512 && v.trim() === v && !/[\u0000-\u001f\u007f]|[\ud800-\udfff]/.test(v);
}
function safe(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    Number.isSafeInteger(v) &&
    !Object.is(v, -0)
  );
}
function u32(v: unknown): boolean {
  return safe(v) && v >= 0 && v <= 0xffffffff;
}
function positive(v: unknown): boolean {
  return safe(v) && v > 0;
}
function finite(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    Math.abs(v) <= Number.MAX_SAFE_INTEGER &&
    !Object.is(v, -0)
  );
}
function stable(v: unknown): string {
  if (v === null || typeof v === "boolean" || typeof v === "string")
    return JSON.stringify(v);
  if (finite(v)) return JSON.stringify(v);
  if (dense(v)) return `[${v.map(stable).join(",")}]`;
  if (record(v))
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(",")}}`;
  throw Error("non-canonical plain JSON");
}
function domain(
  name: string,
  v: Record<string, unknown>,
  self: string,
): string {
  const p = { ...v };
  delete p[self];
  return sha256Hex(name + stable(p));
}
function add(
  z: OracleGateBlindRatingIssue[],
  ok: boolean,
  path: string,
  message: string,
): void {
  if (!ok) z.push({ path, message });
}
function report(z: OracleGateBlindRatingIssue[]): OracleGateBlindRatingReport {
  return { valid: z.length === 0, issues: z };
}

export function hashOracleGatePublicEvidencePackage(
  v: OracleGatePublicEvidencePackageV1,
): string {
  return domain(
    ORACLE_GATE_PUBLIC_EVIDENCE_DOMAIN,
    v as unknown as Record<string, unknown>,
    "evidence_package_sha256",
  );
}
export function hashOracleGatePublicEvidenceItem(
  v: OracleGatePublicEvidenceItemV1,
): string {
  return sha256Hex(`${ORACLE_GATE_PUBLIC_EVIDENCE_DOMAIN}item\0${stable(v)}`);
}
export function hashOracleGateStatisticsPlan(
  v: OracleGateStatisticsPlanV1,
): string {
  return domain(
    ORACLE_GATE_STATISTICS_PLAN_DOMAIN,
    v as unknown as Record<string, unknown>,
    "statistics_plan_sha256",
  );
}
export function hashOracleGateRatingPlan(v: OracleGateRatingPlanV1): string {
  return domain(
    ORACLE_GATE_RATING_PLAN_DOMAIN,
    v as unknown as Record<string, unknown>,
    "rating_plan_sha256",
  );
}
export function hashOracleGateRatingAssignment(
  v: OracleGateRatingAssignmentV1,
): string {
  return domain(
    ORACLE_GATE_RATING_ASSIGNMENT_DOMAIN,
    v as unknown as Record<string, unknown>,
    "assignment_sha256",
  );
}
export function hashOracleGateRatingLedger(
  v: OracleGateSignedRatingLedgerV1,
): string {
  const p = { ...v, signature_base64: "" };
  delete (p as Partial<OracleGateSignedRatingLedgerV1>).ledger_sha256;
  return sha256Hex(ORACLE_GATE_RATING_LEDGER_DOMAIN + stable(p));
}
export function oracleGateRatingLedgerSignaturePreimage(
  v: OracleGateSignedRatingLedgerV1,
): Uint8Array {
  if (!sha(v.ledger_sha256)) throw Error("ledger SHA无效");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++)
    out[i] = Number.parseInt(v.ledger_sha256.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function hashOracleGateCompletedRatingSet(
  v: OracleGateCompletedRatingSetV1,
): string {
  return domain(
    ORACLE_GATE_COMPLETED_RATING_SET_DOMAIN,
    v as unknown as Record<string, unknown>,
    "rating_set_sha256",
  );
}
export function hashOracleValueGateReport(v: OracleValueGateReportV1): string {
  return domain(
    ORACLE_VALUE_GATE_REPORT_DOMAIN,
    v as unknown as Record<string, unknown>,
    "report_sha256",
  );
}

export function validateOracleGatePublicEvidencePackage(
  input: unknown,
): OracleGateBlindRatingReport {
  const z: OracleGateBlindRatingIssue[] = [];
  if (!record(input))
    return report([{ path: "$", message: "必须是plain object" }]);
  add(
    z,
    exact(input, [
      "schema_version",
      "evidence_package_sha256",
      "record_trust",
      "public_response_package_sha256",
      "rubric_version",
      "rubric_sha256",
      "blinding_statement",
      "distribution_independence_status",
      "item_count",
      "items",
      "api_execution_allowed",
    ]),
    "$",
    "字段无效",
  );
  add(
    z,
    input.schema_version === "oracle-gate-public-evidence-package-v1" &&
      input.record_trust === "non_authoritative_public_blind_evidence_record",
    "schema",
    "无效",
  );
  [
    "evidence_package_sha256",
    "public_response_package_sha256",
    "rubric_sha256",
  ].forEach((f) => add(z, sha(input[f]), f, "SHA无效"));
  add(z, text(input.rubric_version, 128), "rubric_version", "无效");
  add(
    z,
    input.blinding_statement ===
      "no_explicit_arm_seed_private_id_or_pairing_metadata",
    "blinding_statement",
    "无效",
  );
  add(
    z,
    input.distribution_independence_status ===
      "pending_external_randomized_independent_sessions",
    "distribution_independence_status",
    "必须pending",
  );
  add(
    z,
    positive(input.item_count) &&
      dense(input.items) &&
      input.items.length === input.item_count,
    "items",
    "必须非空稠密且数量闭合",
  );
  const bids = new Set<string>();
  for (const [i, x] of (dense(input.items) ? input.items : []).entries()) {
    const p = `items[${i}]`;
    if (!record(x)) {
      z.push({ path: p, message: "必须plain" });
      continue;
    }
    add(
      z,
      exact(x, [
        "blind_id",
        "response_sha256",
        "claim_units",
        "evidence_units",
        "eligible_evidence_unit_ids",
        "board_edit_unit_ids",
        "temporal_pairs",
      ]),
      p,
      "字段无效",
    );
    add(
      z,
      blind(x.blind_id) && !bids.has(String(x.blind_id)),
      `${p}.blind_id`,
      "无效/重复",
    );
    bids.add(String(x.blind_id));
    add(z, sha(x.response_sha256), `${p}.response_sha256`, "无效");
    const claims = new Set<string>();
    add(z, dense(x.claim_units), `${p}.claim_units`, "必须稠密");
    for (const [j, c] of (dense(x.claim_units)
      ? x.claim_units
      : []
    ).entries()) {
      if (!record(c) || !exact(c, ["claim_id", "claim_index", "content"])) {
        z.push({ path: `${p}.claim_units[${j}]`, message: "字段无效" });
        continue;
      }
      add(
        z,
        id(c.claim_id) && !claims.has(String(c.claim_id)),
        `${p}.claim_units[${j}].claim_id`,
        "无效/重复",
      );
      claims.add(String(c.claim_id));
      add(
        z,
        c.claim_index === j,
        `${p}.claim_units[${j}].claim_index`,
        "必须连续",
      );
      add(
        z,
        text(c.content),
        `${p}.claim_units[${j}].content`,
        "内容无效或显式泄漏",
      );
    }
    const units = new Map<string, string>(), sequenceByUnit = new Map<string,number>();
    add(z, dense(x.evidence_units), `${p}.evidence_units`, "必须稠密");
    for (const [j, u] of (dense(x.evidence_units)
      ? x.evidence_units
      : []
    ).entries()) {
      if (
        !record(u) ||
        !exact(u, ["unit_id", "kind", "sequence_index", "content"])
      ) {
        z.push({ path: `${p}.evidence_units[${j}]`, message: "字段无效" });
        continue;
      }
      add(
        z,
        id(u.unit_id) && !units.has(String(u.unit_id)),
        `${p}.evidence_units[${j}].unit_id`,
        "无效/重复",
      );
      add(
        z,
        u.kind === "speech" || u.kind === "board_delta",
        `${p}.evidence_units[${j}].kind`,
        "无效",
      );
      add(
        z,
        u.sequence_index === j,
        `${p}.evidence_units[${j}].sequence_index`,
        "必须连续",
      );
      add(
        z,
        text(u.content),
        `${p}.evidence_units[${j}].content`,
        "内容无效或含显式泄漏字段",
      );
      units.set(String(u.unit_id), String(u.kind));
      sequenceByUnit.set(String(u.unit_id), Number(u.sequence_index));
    }
    for (const [f, kind] of [
      ["eligible_evidence_unit_ids", null],
      ["board_edit_unit_ids", "board_delta"],
    ] as const) {
      const a = x[f];
      add(
        z,
        dense(a) &&
          new Set(a).size === a.length &&
          a.every(
            (q) =>
              id(q) && units.has(q) && (kind === null || units.get(q) === kind),
          ),
        `${p}.${f}`,
        "必须唯一引用公开unit",
      );
    }
    const pairs = new Set<string>(), pairEdges=new Set<string>();let previousPairOrder="";
    add(z, dense(x.temporal_pairs), `${p}.temporal_pairs`, "必须稠密");
    for (const q of dense(x.temporal_pairs) ? x.temporal_pairs : []) {
      if (
        !record(q) ||
        !exact(q, ["pair_id", "before_unit_id", "after_unit_id"])
      ) {
        z.push({ path: `${p}.temporal_pairs`, message: "pair字段无效" });
        continue;
      }
      add(
        z,
        id(q.pair_id) && !pairs.has(String(q.pair_id)),
        `${p}.temporal_pairs`,
        "pair重复",
      );
      pairs.add(String(q.pair_id));
      const edge=`${String(q.before_unit_id)}\0${String(q.after_unit_id)}`;
      add(
        z,
        q.before_unit_id !== q.after_unit_id &&
          units.get(String(q.before_unit_id)) === "board_delta" &&
          units.get(String(q.after_unit_id)) === "board_delta" &&
          Number(sequenceByUnit.get(String(q.before_unit_id)))<Number(sequenceByUnit.get(String(q.after_unit_id))) && !pairEdges.has(edge),
        `${p}.temporal_pairs`,
        "必须引用不同board units",
      );
      pairEdges.add(edge);const derived=`${String(sequenceByUnit.get(String(q.before_unit_id))).padStart(12,"0")}:${String(sequenceByUnit.get(String(q.after_unit_id))).padStart(12,"0")}:${String(q.pair_id)}`;add(z,previousPairOrder===""||previousPairOrder<derived,`${p}.temporal_pairs`,"必须按before/after sequence与pair_id派生顺序排列");previousPairOrder=derived;
    }
  }
  add(
    z,
    input.api_execution_allowed === false,
    "api_execution_allowed",
    "必须false",
  );
  if (sha(input.evidence_package_sha256))
    try {
      add(
        z,
        hashOracleGatePublicEvidencePackage(
          input as unknown as OracleGatePublicEvidencePackageV1,
        ) === input.evidence_package_sha256,
        "evidence_package_sha256",
        "不匹配",
      );
    } catch {
      z.push({ path: "evidence_package_sha256", message: "不可规范化" });
    }
  return report(z);
}
export function validateOracleGatePublicEvidenceAgainstBlindArtifacts(
  e: unknown,
  p: unknown,
  k: unknown,
): OracleGateBlindRatingReport {
  let E0: unknown, P0: unknown, K0: unknown;
  try {
    E0 = snapshotStrictPlain(e);
    P0 = snapshotStrictPlain(p);
    K0 = snapshotStrictPlain(k);
  } catch {
    return report([{ path: "$", message: "输入必须是无accessor的plain data快照" }]);
  }
  const z = [
    ...validateOracleGatePublicEvidencePackage(E0).issues,
    ...validatePublicBlindPackage(P0).issues.map((x) => ({
      path: `public.${x.path}`,
      message: x.message,
    })),
    ...validatePrivateAnswerKeyAgainstPublicPackage(K0, P0).issues.map((x) => ({
      path: `private.${x.path}`,
      message: x.message,
    })),
  ];
  if (z.length || !record(E0) || !record(P0) || !record(K0)) return report(z);
  const E = E0 as unknown as OracleGatePublicEvidencePackageV1,
    P = P0 as unknown as PublicBlindPackageV1,
    K = K0 as unknown as PrivateAnswerKeyV1;
  add(
    z,
    E.public_response_package_sha256 === P.package_sha256,
    "public_response_package_sha256",
    "不匹配",
  );
  const pm = new Map(P.items.map((x) => [x.blind_id, x.response_sha256])),
    km = new Map(K.entries.map((x) => [x.blind_id, x.response_sha256]));
  add(
    z,
    E.items.length === P.items.length && E.items.length === K.entries.length,
    "items",
    "必须逐项一一覆盖",
  );
  for (const x of E.items)
    add(
      z,
      pm.get(x.blind_id) === x.response_sha256 &&
        km.get(x.blind_id) === x.response_sha256,
      `items.${x.blind_id}`,
      "public/private映射不闭合",
    );
  add(z,stable(E.items.map(x=>x.blind_id))===stable(P.items.map(x=>x.blind_id))&&stable(E.items.map(x=>x.blind_id))===stable(K.entries.map(x=>x.blind_id)),"items","public/evidence/private必须同序覆盖");
  add(z,E.rubric_version===P.rubric_version&&E.rubric_sha256===P.rubric_sha256,"rubric","public evidence rubric不闭合");
  const normalize = (value: string): string =>
    value
      .normalize("NFKC")
      .replace(/[\u200b-\u200f\u2060\ufeff\s_.:/-]+/g, "")
      .toLocaleLowerCase("en-US");
  const publicStrings: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === "string") publicStrings.push(normalize(value));
    else if (Array.isArray(value)) value.forEach(collect);
    else if (record(value)) Object.values(value).forEach(collect);
  };
  collect(E);
  for (const entry of K.entries) {
    for (const secret of [
      entry.request_id,
      entry.idempotency_key,
      entry.case_id,
      entry.arm,
      entry.teacher_id,
      entry.source_video_id,
      entry.window_id,
    ]) {
      const needle = normalize(secret);
      if (
        needle.length >= 4 &&
        publicStrings.some((candidate) => candidate.includes(needle))
      )
        z.push({
          path: "items",
          message: "公开证据含私有映射值或其大小写/零宽变体",
        });
    }
  }
  return report(z);
}
function validateStatisticsPlan(
  s: unknown,
  z: OracleGateBlindRatingIssue[],
): void {
  if (
    !record(s) ||
    !exact(s, [
      "schema_version",
      "statistics_plan_sha256",
      "metric_order",
      "strongest_non_oracle_selection_metric",
      "strongest_non_oracle_tie_order",
      "item_rater_aggregation",
      "point_aggregation",
      "bootstrap_method",
      "bootstrap_seed",
      "bootstrap_replicates",
      "primary_ci",
      "descriptive_ci",
      "quantile_method",
      "missing_policy",
      "zero_eligible_policy",
      "minimum_teachers",
      "minimum_seeds_per_case",
    ])
  ) {
    z.push({ path: "statistics_plan", message: "字段无效" });
    return;
  }
  add(
    z,
    s.schema_version === "oracle-gate-statistics-plan-v1" &&
      stable(s.metric_order) ===
        stable([
          "evidence_f1",
          "temporal_fidelity",
          "edit_coverage",
          "unsupported_claim_rate",
        ]),
    "statistics_plan.metric_order",
    "无效",
  );
  add(
    z,
    s.strongest_non_oracle_selection_metric === "evidence_f1" &&
      stable(s.strongest_non_oracle_tie_order) ===
        stable(["static_final_board", "uniform_frame", "transcript_only"]),
    "statistics_plan.selection",
    "必须一次性F1选择和固定tie",
  );
  add(
    z,
    s.item_rater_aggregation === "equal_mean_two_raters" &&
      s.point_aggregation ===
        "case_seed_mean_then_case_macro_then_video_macro_then_teacher_macro" &&
      s.bootstrap_method === "hierarchical_teacher_video_case_seed_paired_v2",
    "statistics_plan.aggregation",
    "无效",
  );
  add(
    z,
    u32(s.bootstrap_seed) &&
      positive(s.bootstrap_replicates) &&
      Number(s.bootstrap_replicates) >= 1000,
    "statistics_plan.bootstrap",
    "无效",
  );
  add(
    z,
    s.primary_ci === 0.8 &&
      s.descriptive_ci === 0.95 &&
      s.quantile_method === "sorted_linear_interpolation_r7",
    "statistics_plan.ci",
    "无效",
  );
  add(
    z,
    s.missing_policy === "blocked_no_partial_statistics" &&
      s.zero_eligible_policy === "metric_null_and_gate_blocked" &&
      s.minimum_teachers === 2 &&
      s.minimum_seeds_per_case === 3,
    "statistics_plan.gates",
    "无效",
  );
  if (sha(s.statistics_plan_sha256))
    add(
      z,
      hashOracleGateStatisticsPlan(
        s as unknown as OracleGateStatisticsPlanV1,
      ) === s.statistics_plan_sha256,
      "statistics_plan.statistics_plan_sha256",
      "不匹配",
    );
}
export function validateOracleGateRatingPlan(
  input: unknown,
): OracleGateBlindRatingReport {
  const z: OracleGateBlindRatingIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须plain" }]);
  add(
    z,
    exact(input, [
      "schema_version",
      "rating_plan_sha256",
      "record_trust",
      "rubric_version",
      "rubric_sha256",
      "formal_spec_sha256",
      "required_independent_raters",
      "rating_schema_version",
      "metrics",
      "statistics_plan",
      "statistics_plan_sha256",
      "created_at",
      "api_execution_allowed",
    ]),
    "$",
    "字段无效",
  );
  add(
    z,
    input.schema_version === "oracle-gate-rating-plan-v1" &&
      input.record_trust === "non_authoritative_preregistered_rating_plan",
    "schema",
    "无效",
  );
  [
    "rating_plan_sha256",
    "rubric_sha256",
    "formal_spec_sha256",
    "statistics_plan_sha256",
  ].forEach((f) => add(z, sha(input[f]), f, "SHA无效"));
  add(z, text(input.rubric_version, 128), "rubric_version", "无效");
  add(
    z,
    input.required_independent_raters === 2 &&
      input.rating_schema_version === "oracle-gate-rating-ledger-v1",
    "rating",
    "必须两名独立评分者",
  );
  add(
    z,
    dense(input.metrics) &&
      stable(input.metrics) ===
        stable([
          "evidence_f1",
          "temporal_fidelity",
          "edit_coverage",
          "unsupported_claim_rate",
        ]),
    "metrics",
    "固定四指标",
  );
  validateStatisticsPlan(input.statistics_plan, z);
  if (record(input.statistics_plan))
    add(
      z,
      input.statistics_plan_sha256 ===
        input.statistics_plan.statistics_plan_sha256,
      "statistics_plan_sha256",
      "不匹配",
    );
  add(z, timestamp(input.created_at), "created_at", "无效");
  add(
    z,
    input.api_execution_allowed === false,
    "api_execution_allowed",
    "必须false",
  );
  if (sha(input.rating_plan_sha256))
    try {
      add(
        z,
        hashOracleGateRatingPlan(input as unknown as OracleGateRatingPlanV1) ===
          input.rating_plan_sha256,
        "rating_plan_sha256",
        "不匹配",
      );
    } catch {
      z.push({ path: "rating_plan_sha256", message: "不可规范化" });
    }
  return report(z);
}
export function validateOracleGateRatingPlanAgainstFormalSpec(
  plan: unknown,
  spec: unknown,
): OracleGateBlindRatingReport {
  let planSnapshot: unknown, specSnapshot: unknown;
  try {
    planSnapshot = snapshotStrictPlain(plan);
    specSnapshot = snapshotStrictPlain(spec);
  } catch {
    return report([{ path: "$", message: "输入必须是无accessor的plain data快照" }]);
  }
  const z = [
    ...validateOracleGateRatingPlan(planSnapshot).issues,
    ...validateOracleGateFormalSpec(specSnapshot).issues.map((x) => ({
      path: `formal_spec.${x.path}`,
      message: x.message,
    })),
  ];
  if (z.length || !record(planSnapshot) || !record(specSnapshot)) return report(z);
  const P = planSnapshot as unknown as OracleGateRatingPlanV1,
    S = specSnapshot as unknown as OracleGateFormalSpec;
  add(
    z,
    sha256Hex(canonicalOracleGateFormalSpecPayload(S)) === S.spec_sha256,
    "formal_spec.spec_sha256",
    "正文与spec_sha256不匹配",
  );
  add(
    z,
    P.formal_spec_sha256 === S.spec_sha256 &&
      P.rubric_version === S.evaluation.rubric_version &&
      P.rubric_sha256 === S.evaluation.rubric_sha256,
    "roots",
    "spec/rubric根不闭合",
  );
  add(
    z,
    P.rating_schema_version === "oracle-gate-rating-ledger-v1" &&
      S.evaluation.rating_schema_version === "oracle-gate-rating-v1" &&
      P.required_independent_raters === S.evaluation.independent_raters,
    "rating",
    "评分政策漂移",
  );
  add(
    z,
    P.statistics_plan.primary_ci === S.evaluation.primary_ci &&
      P.statistics_plan.descriptive_ci === S.evaluation.descriptive_ci &&
      P.statistics_plan.bootstrap_seed === S.evaluation.bootstrap_seed,
    "statistics",
    "CI/seed漂移",
  );
  add(
    z,
    S.evaluation.strongest_non_oracle_rule ===
      "best_pre_registered_non_oracle_on_development" &&
      P.statistics_plan.strongest_non_oracle_selection_metric ===
        "evidence_f1" &&
      S.evaluation.missing_request_policy === "fail_closed_no_partial_decision",
    "formal_spec.evaluation",
    "selection/missing政策漂移",
  );
  return report(z);
}
export function validateOracleGateRatingAssignment(
  input: unknown,
  plan?: unknown,
  evidence?: unknown,
  publicPackage?: unknown,
): OracleGateBlindRatingReport {
  const z: OracleGateBlindRatingIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须plain" }]);
  add(
    z,
    exact(input, [
      "schema_version",
      "assignment_sha256",
      "record_trust",
      "run_sha256",
      "rating_plan_sha256",
      "public_response_package_sha256",
      "public_evidence_package_sha256",
      "rubric_sha256",
      "formal_spec_sha256",
      "terminal_checkpoint_sha256",
      "run_completed_at",
      "assignment_mode",
      "assignments",
      "created_at",
      "api_execution_allowed",
    ]),
    "$",
    "字段无效",
  );
  add(
    z,
    input.schema_version === "oracle-gate-rating-assignment-v1" &&
      input.record_trust === "non_authoritative_blind_assignment_record",
    "schema",
    "无效",
  );
  [
    "assignment_sha256",
    "run_sha256",
    "rating_plan_sha256",
    "public_response_package_sha256",
    "public_evidence_package_sha256",
    "rubric_sha256",
    "formal_spec_sha256",
    "terminal_checkpoint_sha256",
  ].forEach((f) => add(z, sha(input[f]), f, "SHA无效"));
  add(z, timestamp(input.created_at)&&timestamp(input.run_completed_at), "created_at", "无效");
  if(timestamp(input.created_at)&&timestamp(input.run_completed_at))add(z,Date.parse(String(input.created_at))>=Date.parse(String(input.run_completed_at)),"created_at","assignment必须在run完成后");
  add(z,input.assignment_mode==="full_package_two_raters_independent_order","assignment_mode","无效");
  add(z,dense(input.assignments)&&input.assignments.length===2,"assignments","必须恰两份私有评分者assignment");
  const assignmentRows=(dense(input.assignments)?input.assignments:[]) as unknown as OracleGateRaterAssignmentV1[];
  for(const [i,row]of assignmentRows.entries()){
    if(!record(row)||!exact(row,["rater_id","signer_key_id","assigned_at","presentation_order_blind_ids"])){z.push({path:`assignments[${i}]`,message:"字段无效"});continue;}
    add(z,id(row.rater_id)&&id(row.signer_key_id),`assignments[${i}].identity`,"无效");add(z,timestamp(row.assigned_at),`assignments[${i}].assigned_at`,"无效");add(z,dense(row.presentation_order_blind_ids)&&new Set(row.presentation_order_blind_ids).size===row.presentation_order_blind_ids.length&&row.presentation_order_blind_ids.every(blind),`assignments[${i}].presentation_order_blind_ids`,"必须是唯一blind ID排列");
  }
  if(assignmentRows.length===2)add(z,assignmentRows[0].rater_id!==assignmentRows[1].rater_id&&assignmentRows[0].signer_key_id!==assignmentRows[1].signer_key_id,"assignments","rater/key必须不同");
  add(
    z,
    input.api_execution_allowed === false,
    "api_execution_allowed",
    "必须false",
  );
  if (record(plan)) {
    const P = plan as unknown as OracleGateRatingPlanV1;
    add(
      z,
      validateOracleGateRatingPlan(P).valid &&
        input.rating_plan_sha256 === P.rating_plan_sha256 &&
        input.rubric_sha256 === P.rubric_sha256 &&
        input.formal_spec_sha256 === P.formal_spec_sha256,
      "plan",
      "根不闭合",
    );
    if (timestamp(input.created_at) && timestamp(P.created_at))
      add(z, Date.parse(String(input.created_at)) >= Date.parse(P.created_at), "created_at", "assignment不得早于plan");
  }
  if (record(evidence))
    add(
      z,
      input.public_evidence_package_sha256 ===
        (evidence as unknown as OracleGatePublicEvidencePackageV1)
          .evidence_package_sha256,
      "evidence",
      "根不闭合",
    );
  if (record(publicPackage))
    {
    const B=publicPackage as unknown as PublicBlindPackageV1,expected=[...B.items.map(x=>x.blind_id)].sort();add(
      z,
      input.public_response_package_sha256 ===
        B.package_sha256,
      "public",
      "根不闭合",
    );
    for(const [i,row]of assignmentRows.entries())add(z,stable([...row.presentation_order_blind_ids].sort())===stable(expected),`assignments[${i}].presentation_order_blind_ids`,"必须恰为完整public blind IDs排列");
    if(B.items.length>1&&assignmentRows.length===2)add(z,stable(assignmentRows[0].presentation_order_blind_ids)!==stable(assignmentRows[1].presentation_order_blind_ids),"assignments.presentation_order","多item时两评分者呈现顺序必须不同");
    }
  for(const [i,row]of assignmentRows.entries()){if(timestamp(row.assigned_at)&&timestamp(input.created_at))add(z,Date.parse(row.assigned_at)>=Date.parse(String(input.created_at)),`assignments[${i}].assigned_at`,"不得早于assignment创建");}
  if (sha(input.assignment_sha256))
    try {
      add(
        z,
        hashOracleGateRatingAssignment(
          input as unknown as OracleGateRatingAssignmentV1,
        ) === input.assignment_sha256,
        "assignment_sha256",
        "不匹配",
      );
    } catch {
      z.push({ path: "assignment_sha256", message: "不可规范化" });
    }
  return report(z);
}
function signature(v: unknown): boolean {
  if (typeof v !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(v)) return false;
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  return alphabet.indexOf(v[85]) % 16 === 0;
}
export function validateOracleGateSignedRatingLedger(
  input: unknown,
): OracleGateBlindRatingReport {
  const z: OracleGateBlindRatingIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须plain" }]);
  add(
    z,
    exact(input, [
      "schema_version",
      "ledger_sha256",
      "rating_plan_sha256",
      "rating_assignment_sha256",
      "public_response_package_sha256",
      "public_evidence_package_sha256",
      "rubric_sha256",
      "rater_id",
      "signer_key_id",
      "independent_session_attestation",
      "rated_at",
      "item_count",
      "items",
      "signature_algorithm",
      "signature_base64",
      "api_execution_allowed",
    ]),
    "$",
    "字段无效",
  );
  add(
    z,
    input.schema_version === "oracle-gate-rating-ledger-v1",
    "schema_version",
    "无效",
  );
  [
    "ledger_sha256",
    "rating_plan_sha256",
    "rating_assignment_sha256",
    "public_response_package_sha256",
    "public_evidence_package_sha256",
    "rubric_sha256",
  ].forEach((f) => add(z, sha(input[f]), f, "SHA无效"));
  add(z, id(input.rater_id) && id(input.signer_key_id), "identity", "无效");
  add(
    z,
    input.independent_session_attestation ===
      "rated_without_other_rater_ledger_or_private_answer_key",
    "independent",
    "无效",
  );
  add(z, timestamp(input.rated_at), "rated_at", "无效");
  add(
    z,
    positive(input.item_count) &&
      dense(input.items) &&
      input.items.length === input.item_count,
    "items",
    "不完整",
  );
  const bids = new Set<string>();
  for (const [i, x] of (dense(input.items) ? input.items : []).entries()) {
    if (
      !record(x) ||
      !exact(x, [
        "blind_id",
        "response_sha256",
        "evidence_item_sha256",
        "claim_judgments",
        "covered_edit_unit_ids",
        "temporal_judgments",
      ])
    ) {
      z.push({ path: `items[${i}]`, message: "字段无效" });
      continue;
    }
    add(
      z,
      blind(x.blind_id) && !bids.has(String(x.blind_id)),
      `items[${i}].blind_id`,
      "无效/重复",
    );
    bids.add(String(x.blind_id));
    add(
      z,
      sha(x.response_sha256) && sha(x.evidence_item_sha256),
      `items[${i}].roots`,
      "无效",
    );
    add(z, dense(x.claim_judgments), `items[${i}].claim_judgments`, "必须稠密");
    for (const [j, c] of (dense(x.claim_judgments)
      ? x.claim_judgments
      : []
    ).entries())
      add(
        z,
        record(c) &&
          exact(c, [
            "claim_id",
            "claim_index",
            "supported",
            "evidence_unit_ids",
          ]) &&
          id(c.claim_id) &&
          c.claim_index === j &&
          typeof c.supported === "boolean" &&
          dense(c.evidence_unit_ids) &&
          new Set(c.evidence_unit_ids).size === c.evidence_unit_ids.length &&
          c.evidence_unit_ids.every(id),
        `items[${i}].claim_judgments[${j}]`,
        "无效",
      );
    add(
      z,
      dense(x.covered_edit_unit_ids) &&
        new Set(x.covered_edit_unit_ids).size ===
          x.covered_edit_unit_ids.length &&
        x.covered_edit_unit_ids.every(id),
      `items[${i}].covered_edit_unit_ids`,
      "无效",
    );
    add(
      z,
      dense(x.temporal_judgments) &&
        x.temporal_judgments.every(
          (q) =>
            record(q) &&
            exact(q, ["pair_id", "correct_order"]) &&
            id(q.pair_id) &&
            typeof q.correct_order === "boolean",
        ),
      `items[${i}].temporal_judgments`,
      "无效",
    );
  }
  add(
    z,
    input.signature_algorithm === "ed25519" &&
      signature(input.signature_base64),
    "signature",
    "格式无效",
  );
  add(
    z,
    input.api_execution_allowed === false,
    "api_execution_allowed",
    "必须false",
  );
  if (sha(input.ledger_sha256))
    try {
      add(
        z,
        hashOracleGateRatingLedger(
          input as unknown as OracleGateSignedRatingLedgerV1,
        ) === input.ledger_sha256,
        "ledger_sha256",
        "不匹配",
      );
    } catch {
      z.push({ path: "ledger_sha256", message: "不可规范化" });
    }
  return report(z);
}
export function validateOracleGateCompletedRatingSet(
  input: unknown,
  plan: unknown,
  assignment: unknown,
  evidence: unknown,
  publicPackage: unknown,
): OracleGateBlindRatingReport {
  let inputSnapshot: unknown,
    planSnapshot: unknown,
    assignmentSnapshot: unknown,
    evidenceSnapshot: unknown,
    publicSnapshot: unknown;
  try {
    inputSnapshot = snapshotStrictPlain(input);
    planSnapshot = snapshotStrictPlain(plan);
    assignmentSnapshot = snapshotStrictPlain(assignment);
    evidenceSnapshot = snapshotStrictPlain(evidence);
    publicSnapshot = snapshotStrictPlain(publicPackage);
  } catch {
    return report([{ path: "$", message: "输入必须是无accessor的plain data快照" }]);
  }
  input = inputSnapshot;
  plan = planSnapshot;
  assignment = assignmentSnapshot;
  evidence = evidenceSnapshot;
  publicPackage = publicSnapshot;
  const z = [
    ...validateOracleGateRatingPlan(plan).issues,
    ...validateOracleGateRatingAssignment(
      assignment,
      plan,
      evidence,
      publicPackage,
    ).issues,
    ...validateOracleGatePublicEvidencePackage(evidence).issues,
    ...validatePublicBlindPackage(publicPackage).issues.map((x) => ({
      path: `public.${x.path}`,
      message: x.message,
    })),
  ];
  if (!record(input))
    return report([...z, { path: "$", message: "必须plain" }]);
  add(
    z,
    exact(input, [
      "schema_version",
      "rating_set_sha256",
      "record_trust",
      "rating_plan_sha256",
      "rating_assignment_sha256",
      "public_response_package_sha256",
      "public_evidence_package_sha256",
      "ledger_count",
      "ledgers",
      "completion_status",
      "completed_at",
      "api_execution_allowed",
    ]),
    "$",
    "字段无效",
  );
  add(
    z,
    input.schema_version === "oracle-gate-completed-rating-set-v1" &&
      input.record_trust ===
        "non_authoritative_until_trusted_signatures_verified",
    "schema",
    "无效",
  );
  ["rating_set_sha256","rating_plan_sha256","rating_assignment_sha256","public_response_package_sha256","public_evidence_package_sha256"].forEach((field)=>add(z,sha(input[field]),field,"SHA无效"));
  add(
    z,
    input.ledger_count === 2 &&
      dense(input.ledgers) &&
      input.ledgers.length === 2,
    "ledgers",
    "必须两份",
  );
  const ls = (dense(input.ledgers)
    ? input.ledgers
    : []) as unknown as OracleGateSignedRatingLedgerV1[];
  ls.forEach((l, i) =>
    validateOracleGateSignedRatingLedger(l).issues.forEach((x) =>
      z.push({ path: `ledgers[${i}].${x.path}`, message: x.message }),
    ),
  );
  if (
    record(plan) &&
    record(assignment) &&
    record(evidence) &&
    record(publicPackage)
  ) {
    const P = plan as unknown as OracleGateRatingPlanV1,
      A = assignment as unknown as OracleGateRatingAssignmentV1,
      E = evidence as unknown as OracleGatePublicEvidencePackageV1,
      B = publicPackage as unknown as PublicBlindPackageV1;
    add(
      z,
      input.rating_plan_sha256 === P.rating_plan_sha256 &&
        input.rating_assignment_sha256 === A.assignment_sha256 &&
        input.public_response_package_sha256 === B.package_sha256 &&
        input.public_evidence_package_sha256 === E.evidence_package_sha256,
      "roots",
      "不匹配",
    );
    const em = new Map(E.items.map((x) => [x.blind_id, x])),
      bm = new Map(B.items.map((x) => [x.blind_id, x]));
    const assignmentsByRater=new Map(A.assignments.map(x=>[x.rater_id,x]));
    for (const [li, l] of ls.entries()) {
      add(
        z,
        l.rating_plan_sha256 === P.rating_plan_sha256 &&
          l.rating_assignment_sha256 === A.assignment_sha256 &&
          l.public_response_package_sha256 === B.package_sha256 &&
          l.public_evidence_package_sha256 === E.evidence_package_sha256 &&
          l.rubric_sha256 === P.rubric_sha256,
        `ledgers[${li}].roots`,
        "不匹配",
      );
      add(
        z,
        l.items.length === E.items.length,
        `ledgers[${li}].items`,
        "覆盖不全",
      );
      const assigned=assignmentsByRater.get(l.rater_id);add(z,Boolean(assigned)&&assigned!.signer_key_id===l.signer_key_id,`ledgers[${li}].assignment`,"ledger rater/key必须匹配私有assignment");
      add(z,Boolean(assigned)&&stable(l.items.map(x=>x.blind_id))===stable(assigned!.presentation_order_blind_ids),`ledgers[${li}].items`,"必须匹配该评分者presentation order");
      if(assigned&&timestamp(l.rated_at)&&timestamp(assigned.assigned_at))add(z,Date.parse(l.rated_at)>=Date.parse(assigned.assigned_at),`ledgers[${li}].rated_at`,"不得早于assigned_at");
      for (const x of l.items) {
        const ei = em.get(x.blind_id),
          bi = bm.get(x.blind_id);
        if (!ei || !bi) {
          z.push({
            path: `ledgers[${li}].${x.blind_id}`,
            message: "blind缺失",
          });
          continue;
        }
        add(
          z,
          x.response_sha256 === bi.response_sha256 &&
            x.evidence_item_sha256 === hashOracleGatePublicEvidenceItem(ei),
          `ledgers[${li}].${x.blind_id}`,
          "roots不匹配",
        );
        const eligible = new Set(ei.eligible_evidence_unit_ids),
          edits = new Set(ei.board_edit_unit_ids);
        add(
          z,
          stable(
            x.claim_judgments.map((c) => ({
              claim_id: c.claim_id,
              claim_index: c.claim_index,
            })),
          ) ===
            stable(
              ei.claim_units.map((c) => ({
                claim_id: c.claim_id,
                claim_index: c.claim_index,
              })),
            ),
          `ledgers[${li}].${x.blind_id}.claims`,
          "必须完整同序覆盖fixed claims",
        );
        for (const c of x.claim_judgments)
          add(
            z,
            c.evidence_unit_ids.every((q) => eligible.has(q)) &&
              (c.supported
                ? c.evidence_unit_ids.length > 0
                : c.evidence_unit_ids.length === 0),
            `ledgers[${li}].${x.blind_id}.claims`,
            "supported必须有eligible证据；unsupported不得挂证据",
          );
        add(
          z,
          x.covered_edit_unit_ids.every((q) => edits.has(q)),
          `ledgers[${li}].${x.blind_id}.edits`,
          "必须为fixed edit子集",
        );
        add(
          z,
          stable(x.temporal_judgments.map((q) => q.pair_id)) ===
            stable(ei.temporal_pairs.map((q) => q.pair_id)),
          `ledgers[${li}].${x.blind_id}.temporal`,
          "必须完整同序覆盖fixed pairs",
        );
      }
    }
    if (ls.length === 2) {
      add(
        z,
        ls[0].rater_id !== ls[1].rater_id &&
          ls[0].signer_key_id !== ls[1].signer_key_id,
        "ledgers",
        "rater/key必须不同",
      );
      add(z,new Set(ls.flatMap(l=>l.items.map(x=>x.blind_id))).size===E.items.length,"ledgers","两ledger必须覆盖同一blind集合");
    }
    add(
      z,
      A.run_sha256 === B.run_commitment_sha256 &&
        P.rubric_sha256 === E.rubric_sha256 &&
        P.rubric_sha256 === B.rubric_sha256 &&
        P.rubric_version === E.rubric_version &&
        P.rubric_version === B.rubric_version,
      "assignment",
      "run/package/evidence/rubric不闭合",
    );
  }
  add(
    z,
    input.completion_status === "complete_two_independent_raters" &&
      timestamp(input.completed_at) &&
      input.api_execution_allowed === false,
    "completion",
    "无效",
  );
  if (
    timestamp(input.completed_at) &&
    ls.some(
      (l) =>
        timestamp(l.rated_at) &&
        Date.parse(l.rated_at) > Date.parse(String(input.completed_at)),
    )
  )
    z.push({ path: "completed_at", message: "不得早于ledger" });
  if (
    record(plan) &&
    timestamp(plan.created_at) &&
    ls.some(
      (l) =>
        timestamp(l.rated_at) &&
        Date.parse(l.rated_at) < Date.parse(String(plan.created_at)),
    )
  )
    z.push({ path: "ledgers.rated_at", message: "不得早于预注册rating plan" });
  if(record(assignment)&&timestamp(assignment.created_at)&&ls.some(l=>timestamp(l.rated_at)&&Date.parse(l.rated_at)<Date.parse(String(assignment.created_at))))z.push({path:"ledgers.rated_at",message:"不得早于rating assignment"});
  if (sha(input.rating_set_sha256))
    try {
      add(
        z,
        hashOracleGateCompletedRatingSet(
          input as unknown as OracleGateCompletedRatingSetV1,
        ) === input.rating_set_sha256,
        "rating_set_sha256",
        "不匹配",
      );
    } catch {
      z.push({ path: "rating_set_sha256", message: "不可规范化" });
    }
  return report(z);
}
export function validateOracleValueGateReport(
  input: unknown,
): OracleGateBlindRatingReport {
  const z: OracleGateBlindRatingIssue[] = [];
  if (!record(input)) return report([{ path: "$", message: "必须plain" }]);
  add(
    z,
    exact(input, [
      "schema_version",
      "report_sha256",
      "record_trust",
      "evidence_scope",
      "paper_claim_status",
      "run_sha256",
      "rating_plan_sha256",
      "rating_assignment_sha256",
      "statistics_plan_sha256",
      "rating_set_sha256",
      "private_answer_key_sha256",
      "selected_strongest_non_oracle",
      "selection_metric",
      "teacher_count",
      "video_count",
      "case_count",
      "seed_count",
      "paired_observation_count",
      "metric_summaries",
      "decision",
      "blocked_reasons",
      "bootstrap_seed",
      "bootstrap_replicates",
      "compiled_at",
      "signature_status",
      "api_execution_allowed",
    ]),
    "$",
    "字段无效",
  );
  add(
    z,
    input.schema_version === "oracle-value-gate-report-v1" &&
      input.record_trust === "non_authoritative_statistics_record",
    "schema",
    "无效",
  );
  add(
    z,
    input.evidence_scope === "synthetic_test_fixture_not_result" ||
      input.evidence_scope === "formal_development_oracle_value_gate",
    "evidence_scope",
    "无效",
  );
  add(
    z,
    input.paper_claim_status === "prohibited_no_automatic_paper_claim",
    "paper_claim_status",
    "无效",
  );
  [
    "report_sha256",
    "run_sha256",
    "rating_plan_sha256",
    "rating_assignment_sha256",
    "rating_set_sha256",
    "private_answer_key_sha256",
  ].forEach((f) => add(z, sha(input[f]), f, "SHA无效"));
  add(
    z,
    ["static_final_board", "uniform_frame", "transcript_only"].includes(
      String(input.selected_strongest_non_oracle),
    ) && input.selection_metric === "evidence_f1",
    "selection",
    "无效",
  );
  for (const f of [
    "teacher_count",
    "video_count",
    "case_count",
    "seed_count",
    "paired_observation_count",
    "bootstrap_replicates",
  ] as const)
    add(z, safe(input[f]) && input[f] >= 0, f, "无效");
  add(z, u32(input.bootstrap_seed), "bootstrap_seed", "无效");
  add(z, dense(input.metric_summaries), "metric_summaries", "必须稠密");
  for (const [i, m] of (dense(input.metric_summaries)
    ? input.metric_summaries
    : []
  ).entries()) {
    if (
      !record(m) ||
      !exact(m, [
        "metric",
        "oracle_point",
        "baseline_point",
        "difference",
        "primary_80_ci",
        "descriptive_95_ci",
      ])
    ) {
      z.push({ path: `metric_summaries[${i}]`, message: "字段无效" });
      continue;
    }
    add(
      z,
      [
        "evidence_f1",
        "temporal_fidelity",
        "edit_coverage",
        "unsupported_claim_rate",
      ].includes(String(m.metric)),
      `metric_summaries[${i}].metric`,
      "无效",
    );
    add(
      z,
      finite(m.oracle_point) &&
        finite(m.baseline_point) &&
        finite(m.difference) && Number(m.oracle_point)>=0 && Number(m.oracle_point)<=1 && Number(m.baseline_point)>=0 && Number(m.baseline_point)<=1 && Number(m.difference)>=-1 && Number(m.difference)<=1 && Math.abs(Number(m.difference)-(Number(m.oracle_point)-Number(m.baseline_point)))<=1e-12,
      `metric_summaries[${i}].points`,
      "非有限/负零",
    );
    for (const f of ["primary_80_ci", "descriptive_95_ci"] as const) {
      const a = m[f];
      add(
        z,
        dense(a) &&
          a.length === 2 &&
          a.every(finite) &&
          Number(a[0]) <= Number(a[1]) && Number(a[0])>=-1 && Number(a[1])<=1,
        `metric_summaries[${i}].${f}`,
        "区间无效",
      );
    }
  }
  add(
    z,
    ["GO", "STOP", "BLOCKED"].includes(String(input.decision)),
    "decision",
    "无效",
  );
  add(
    z,
    dense(input.blocked_reasons) &&
      new Set(input.blocked_reasons).size === input.blocked_reasons.length &&
      input.blocked_reasons.every(reason),
    "blocked_reasons",
    "无效",
  );
  add(
    z,
    input.decision === "BLOCKED"
      ? (input.metric_summaries as unknown[]).length === 0 &&
          (input.blocked_reasons as unknown[]).length > 0
      : (input.metric_summaries as unknown[]).length === 4 &&
          (input.blocked_reasons as unknown[]).length === 0,
    "decision",
    "BLOCKED必须无统计且有理由，GO/STOP必须四指标",
  );
  if(input.decision!=="BLOCKED"&&dense(input.metric_summaries)){
    add(z,stable(input.metric_summaries.map(m=>record(m)?m.metric:null))===stable(["evidence_f1","temporal_fidelity","edit_coverage","unsupported_claim_rate"]),"metric_summaries","必须固定四指标同序唯一");
    const summaries=input.metric_summaries as unknown as OracleValueMetricSummaryV1[];
    const goEligible=["evidence_f1","temporal_fidelity","edit_coverage"].every(metric=>{const m=summaries.find(x=>x.metric===metric);return Boolean(m&&m.difference>=.05&&m.primary_80_ci[0]>0);})&&Number(summaries.find(x=>x.metric==="unsupported_claim_rate")?.difference)<=0;
    add(z,input.decision===(goEligible?"GO":"STOP"),"decision","GO/STOP逻辑与冻结门槛不一致");
    for(const [i,m]of summaries.entries())add(z,m.descriptive_95_ci[0]<=m.primary_80_ci[0]&&m.descriptive_95_ci[1]>=m.primary_80_ci[1],`metric_summaries[${i}]`,"95%描述区间必须包住80%区间");
    add(z,Number(input.teacher_count)>=2&&Number(input.video_count)>0&&Number(input.case_count)>0&&Number(input.paired_observation_count)>0&&Number(input.seed_count)>=3&&Number(input.bootstrap_replicates)>=1000,"counts","GO/STOP计数门无效");
  }
  add(z, timestamp(input.compiled_at), "compiled_at", "无效");
  add(
    z,
    input.signature_status === "pending_external_trusted_signature_or_worm" &&
      input.api_execution_allowed === false,
    "boundary",
    "必须pending/false",
  );
  if (sha(input.report_sha256))
    try {
      add(
        z,
        hashOracleValueGateReport(
          input as unknown as OracleValueGateReportV1,
        ) === input.report_sha256,
        "report_sha256",
        "不匹配",
      );
    } catch {
      z.push({ path: "report_sha256", message: "不可规范化" });
    }
  return report(z);
}
export function validateOracleValueGateReportAgainstStatisticsPlan(
  input: unknown,
  plan: unknown,
): OracleGateBlindRatingReport {
  let reportSnapshot: unknown, planSnapshot: unknown;
  try {
    reportSnapshot = snapshotStrictPlain(input);
    planSnapshot = snapshotStrictPlain(plan);
  } catch {
    return report([{ path: "$", message: "输入必须是无accessor的plain data快照" }]);
  }
  const z = [
    ...validateOracleValueGateReport(reportSnapshot).issues,
    ...validateOracleGateRatingPlan(planSnapshot).issues.map((x) => ({
      path: `plan.${x.path}`,
      message: x.message,
    })),
  ];
  if (z.length || !record(reportSnapshot) || !record(planSnapshot)) return report(z);
  const R = reportSnapshot as unknown as OracleValueGateReportV1,
    P = planSnapshot as unknown as OracleGateRatingPlanV1;
  add(
    z,
    R.rating_plan_sha256 === P.rating_plan_sha256 &&
      R.statistics_plan_sha256 === P.statistics_plan_sha256,
    "roots",
    "report未绑定rating/statistics plan",
  );
  add(
    z,
    R.bootstrap_seed === P.statistics_plan.bootstrap_seed &&
      R.bootstrap_replicates === P.statistics_plan.bootstrap_replicates,
    "bootstrap",
    "seed/replicates漂移",
  );
  return report(z);
}
