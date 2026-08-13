import {
  hashOracleValueGateReport,
  validateCompletedFormalRunArtifactChain,
  validateOracleGatePublicEvidenceAgainstBlindArtifacts,
  validateOracleGateRatingPlanAgainstFormalSpec,
  validateOracleValueGateReport,
  validateOracleValueGateReportAgainstStatisticsPlan,
  type OracleGateFormalSpec,
  type OracleGateMetric,
  type OracleValueGateReportV1,
  type OracleValueMetricSummaryV1,
  type PrivateAnswerKeyV1,
  type PublicBlindPackageV1,
} from "../../contracts/src/index.js";
import {
  assertActiveTrustedOracleGateRatingSetCapability,
  type TrustedOracleGateRatingSetCapabilityV1,
} from "./oracleBlindRatingGate.js";

type Arm =
  "transcript_only" | "static_final_board" | "uniform_frame" | "oracle_delta";
interface Observation {
  teacher: string;
  video: string;
  caseId: string;
  seed: number;
  arm: Arm;
  scores: Record<OracleGateMetric, number>;
}
function time(value: string): boolean {
  const n = Date.parse(value);
  return Number.isFinite(n) && new Date(n).toISOString() === value;
}
function mean(values: number[]): number {
  if (!values.length) throw Error("空均值");
  const result = values.reduce((a, b) => a + b, 0) / values.length;
  if (!Number.isFinite(result) || Object.is(result, -0))
    throw Error("非有限统计");
  return result;
}
function itemMetrics(
  item: TrustedOracleGateRatingSetCapabilityV1["rating_set"]["ledgers"][number]["items"][number],
  evidence: TrustedOracleGateRatingSetCapabilityV1["public_evidence_package"]["items"][number],
): Record<OracleGateMetric, number | null> {
  const claims = item.claim_judgments,
    supported = claims.filter((x) => x.supported),
    unique = new Set(supported.flatMap((x) => x.evidence_unit_ids));
  const precision = claims.length ? supported.length / claims.length : null,
    recall = evidence.eligible_evidence_unit_ids.length
      ? unique.size / evidence.eligible_evidence_unit_ids.length
      : null;
  return {
    evidence_f1:
      precision === null || recall === null
        ? null
        : precision + recall === 0
          ? 0
          : (2 * precision * recall) / (precision + recall),
    edit_coverage: evidence.board_edit_unit_ids.length
      ? item.covered_edit_unit_ids.length / evidence.board_edit_unit_ids.length
      : null,
    temporal_fidelity: evidence.temporal_pairs.length
      ? item.temporal_judgments.filter((x) => x.correct_order).length /
        evidence.temporal_pairs.length
      : null,
    unsupported_claim_rate: claims.length
      ? (claims.length - supported.length) / claims.length
      : null,
  };
}
function macro(values: Observation[], metric: OracleGateMetric): number {
  const teachers = [...new Set(values.map((x) => x.teacher))].sort();
  return mean(
    teachers.map((t) => {
      const tv = values.filter((x) => x.teacher === t),
        videos = [...new Set(tv.map((x) => x.video))].sort();
      return mean(
        videos.map((v) => {
          const vv=tv.filter(x=>x.video===v),cases=[...new Set(vv.map(x=>x.caseId))].sort();
          return mean(cases.map(caseId=>{const cv=vv.filter(x=>x.caseId===caseId),seeds=[...new Set(cv.map(x=>x.seed))].sort((a,b)=>a-b);return mean(seeds.map(seed=>mean(cv.filter(x=>x.seed===seed).map(x=>x.scores[metric]))));}));
        }),
      );
    }),
  );
}
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function quantile(values: number[], q: number): number {
  if (!values.length) throw Error("空bootstrap");
  const a = [...values].sort((x, y) => x - y),
    h = (a.length - 1) * q,
    lo = Math.floor(h),
    hi = Math.ceil(h),
    result = a[lo] + (a[hi] - a[lo]) * (h - lo);
  if (!Number.isFinite(result)) throw Error("非有限CI");
  return result;
}
function bootstrapDiff(
  obs: Observation[],
  baseline: Exclude<Arm, "oracle_delta">,
  metric: OracleGateMetric,
  seed: number,
  reps: number,
): number[] {
  const random = rng(seed),
    teachers = [...new Set(obs.map((x) => x.teacher))].sort(),
    out: number[] = [];
  for (let r = 0; r < reps; r++) {
    const sample: Observation[] = [];
    for (let ti = 0; ti < teachers.length; ti++) {
      const t = teachers[Math.floor(random() * teachers.length)],
        tv = obs.filter((x) => x.teacher === t),
        videos = [...new Set(tv.map((x) => x.video))].sort();
      if (!videos.length) throw Error("空video cluster");
      for (let vi = 0; vi < videos.length; vi++) {
        const v = videos[Math.floor(random() * videos.length)],
          vv = tv.filter((x) => x.video === v),cases=[...new Set(vv.map(x=>x.caseId))].sort();
        if(!cases.length)throw Error("空case cluster");
        for(let ci=0;ci<cases.length;ci++){
          const selectedCase=cases[Math.floor(random()*cases.length)],cv=vv.filter(x=>x.caseId===selectedCase),seeds=[...new Set(cv.map(x=>x.seed))].sort((a,b)=>a-b);if(!seeds.length)throw Error("空seed cluster");
          for(let si=0;si<seeds.length;si++){const selectedSeed=seeds[Math.floor(random()*seeds.length)];sample.push(...cv.filter(x=>x.seed===selectedSeed).map(x=>({...x,teacher:`t-${ti}`,video:`v-${ti}-${vi}`,caseId:`c-${ti}-${vi}-${ci}`,seed:si})));}
        }
      }
    }
    out.push(
      macro(
        sample.filter((x) => x.arm === "oracle_delta"),
        metric,
      ) -
        macro(
          sample.filter((x) => x.arm === baseline),
          metric,
        ),
    );
  }
  return out;
}
function denominatorShape(
  value: TrustedOracleGateRatingSetCapabilityV1["public_evidence_package"]["items"][number],
): string {
  return JSON.stringify({
    claim_units: value.claim_units,
    evidence_units: value.evidence_units,
    eligible_evidence_unit_ids: value.eligible_evidence_unit_ids,
    board_edit_unit_ids: value.board_edit_unit_ids,
    temporal_pairs: value.temporal_pairs,
  });
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
function safePlain<T>(value:T):T{if(value===null||["string","number","boolean"].includes(typeof value))return value;if(!value||typeof value!=="object")throw Error("只允许plain data");const descriptors=Object.getOwnPropertyDescriptors(value);if(Array.isArray(value)){if(Object.getPrototypeOf(value)!==Array.prototype||Object.getOwnPropertySymbols(value).length||Object.entries(descriptors).some(([key,d])=>key!=="length"&&(!("value" in d)||!d.enumerable)))throw Error("数组含accessor/非plain字段");const names=Object.keys(descriptors).filter(k=>k!=="length");if(names.length!==value.length||names.some((k,i)=>k!==String(i)))throw Error("数组不稠密");return value.map(safePlain) as T;}if(Object.getPrototypeOf(value)!==Object.prototype||Object.getOwnPropertySymbols(value).length||Object.hasOwn(value,"toJSON")||Object.values(descriptors).some(d=>!("value" in d)||!d.enumerable))throw Error("对象含accessor/非plain字段");const out:Record<string,unknown>={};for(const [key,d]of Object.entries(descriptors))out[key]=safePlain(d.value);return out as T;}

function snapshotCompilerInput<T extends {
  completed_run_artifact_chain: unknown;
  trusted_ratings: TrustedOracleGateRatingSetCapabilityV1;
  private_answer_key: unknown;
  public_blind_package: unknown;
  formal_spec: unknown;
  compiled_at: string;
  evidence_scope: string;
}>(input:T):T {
  if (!input || typeof input !== "object" || Object.getPrototypeOf(input) !== Object.prototype || Object.getOwnPropertySymbols(input).length)
    throw Error("统计编译输入必须是plain data容器");
  const descriptors=Object.getOwnPropertyDescriptors(input),expected=["completed_run_artifact_chain","trusted_ratings","private_answer_key","public_blind_package","formal_spec","compiled_at","evidence_scope"];
  if (Object.keys(descriptors).sort().join("\0")!==[...expected].sort().join("\0") || Object.values(descriptors).some(d=>!("value" in d)||!d.enumerable))
    throw Error("统计编译输入字段/accessor无效");
  const value=(key:string)=>(descriptors[key] as PropertyDescriptor & {value:unknown}).value;
  return {
    completed_run_artifact_chain:deepFreeze(safePlain(value("completed_run_artifact_chain"))),
    trusted_ratings:value("trusted_ratings") as TrustedOracleGateRatingSetCapabilityV1,
    private_answer_key:deepFreeze(safePlain(value("private_answer_key"))),
    public_blind_package:deepFreeze(safePlain(value("public_blind_package"))),
    formal_spec:deepFreeze(safePlain(value("formal_spec"))),
    compiled_at:safePlain(value("compiled_at")),
    evidence_scope:safePlain(value("evidence_scope")),
  } as T;
}

export function compileOracleValueGateStatistics(input: {
  completed_run_artifact_chain: Parameters<
    typeof validateCompletedFormalRunArtifactChain
  >[0];
  trusted_ratings: TrustedOracleGateRatingSetCapabilityV1;
  private_answer_key: PrivateAnswerKeyV1;
  public_blind_package: PublicBlindPackageV1;
  formal_spec: OracleGateFormalSpec;
  compiled_at: string;
  evidence_scope:
    "synthetic_test_fixture_not_result" | "formal_development_oracle_value_gate";
}): OracleValueGateReportV1 {
  input=snapshotCompilerInput(input);
  assertActiveTrustedOracleGateRatingSetCapability(input.trusted_ratings);
  const chain = validateCompletedFormalRunArtifactChain(
    input.completed_run_artifact_chain,
  );
  if (!chain.valid)
    throw Error(`completed run chain 无效：${chain.issues[0]?.path}`);
  const cap = input.trusted_ratings,
    plan = cap.rating_plan,
    assignment = cap.rating_assignment,
    stats = plan.statistics_plan;
  const formal = validateOracleGateRatingPlanAgainstFormalSpec(
    plan,
    input.formal_spec,
  );
  if (!formal.valid)
    throw Error(`formal spec/rating plan无效：${formal.issues[0]?.path}`);
  if (!time(input.compiled_at)) throw Error("compiled_at无效");
  const blind = validateOracleGatePublicEvidenceAgainstBlindArtifacts(
    cap.public_evidence_package,
    input.public_blind_package,
    input.private_answer_key,
  );
  if (!blind.valid)
    throw Error(`private/public/evidence不闭合：${blind.issues[0]?.path}`);
  const run = input.completed_run_artifact_chain.run as {
    run_sha256: string;
    rating_plan_sha256: string;
    statistics_plan_sha256: string;
    formal_spec_sha256: string;
  };
  const chainKey = input.completed_run_artifact_chain
      .private_answer_key as PrivateAnswerKeyV1,
    chainPub = input.completed_run_artifact_chain
      .public_blind_package as PublicBlindPackageV1;
  const checkpoints=input.completed_run_artifact_chain.checkpoints as unknown as Array<{checkpoint_sha256:string;created_at:string}>,genesis=checkpoints[0],terminal=checkpoints.at(-1);
  if(!genesis||Date.parse(plan.created_at)>Date.parse(genesis.created_at))throw Error("rating plan必须在generation-0 SEALED_READY之前预注册");
  if(!terminal||terminal.checkpoint_sha256!==assignment.terminal_checkpoint_sha256||terminal.created_at!==assignment.run_completed_at||Date.parse(input.compiled_at)<Date.parse(cap.rating_set.completed_at)||Date.parse(input.compiled_at)<Date.parse(assignment.run_completed_at))throw Error("assignment/compiled_at未绑定post-run terminal时间链");
  if (
    run.run_sha256 !== assignment.run_sha256 ||
    run.rating_plan_sha256 !== plan.rating_plan_sha256 ||
    run.statistics_plan_sha256 !== stats.statistics_plan_sha256 ||
    run.formal_spec_sha256 !== input.formal_spec.spec_sha256 ||
    assignment.formal_spec_sha256 !== input.formal_spec.spec_sha256 ||
    chainKey.answer_key_sha256 !== input.private_answer_key.answer_key_sha256 ||
    chainPub.package_sha256 !== input.public_blind_package.package_sha256 ||
    JSON.stringify(chainKey) !== JSON.stringify(input.private_answer_key) ||
    JSON.stringify(chainPub) !== JSON.stringify(input.public_blind_package)
  )
    throw Error("统计根/run链对象未逐字闭合");
  const evidence = new Map(
      cap.public_evidence_package.items.map((x) => [x.blind_id, x]),
    ),
    ratings = cap.rating_set.ledgers.map(
      (l) => new Map(l.items.map((x) => [x.blind_id, x])),
    ),
    observations: Observation[] = [];
  const blocked: string[] = [];
  const groupedDenominators = new Map<string, string>();
  for (const key of input.private_answer_key.entries) {
    const e = evidence.get(key.blind_id),
      a = ratings[0].get(key.blind_id),
      b = ratings[1].get(key.blind_id);
    if (!e || !a || !b) {
      blocked.push(`missing:${key.blind_id}`);
      continue;
    }
    const groupKey = `${key.case_id}\0${key.seed}`,
      shape = denominatorShape(e),
      previous = groupedDenominators.get(groupKey);
    if (previous !== undefined && previous !== shape)
      blocked.push(`arm_denominator_drift:${key.case_id}:${key.seed}`);
    else groupedDenominators.set(groupKey, shape);
    const sa = itemMetrics(a, e),
      sb = itemMetrics(b, e),
      scores = {} as Record<OracleGateMetric, number>;
    for (const metric of stats.metric_order) {
      if (sa[metric] === null || sb[metric] === null) {
        blocked.push(`zero_eligible:${key.blind_id}:${metric}`);
        continue;
      }
      scores[metric] = (sa[metric] + sb[metric]) / 2;
    }
    if (Object.keys(scores).length === 4)
      observations.push({
        teacher: key.teacher_id,
        video: key.source_video_id,
        caseId: key.case_id,
        seed: key.seed,
        arm: key.arm,
        scores,
      });
  }
  const teachers = new Set(observations.map((x) => x.teacher)),
    videos = new Set(observations.map((x) => x.video)),
    cases = new Set(observations.map((x) => x.caseId)),
    seeds = new Set(observations.map((x) => x.seed));
  if (teachers.size < 2) blocked.push("minimum_teachers");
  const groups = new Map<string, Observation[]>();
  for (const x of observations) {
    const key = `${x.caseId}\0${x.seed}`,
      group = groups.get(key) ?? [];
    group.push(x);
    groups.set(key, group);
  }
  for (const [key, group] of groups)
    if (
      group.length !== 4 ||
      new Set(group.map((x) => x.arm)).size !== 4 ||
      new Set(group.map((x) => x.teacher)).size !== 1 ||
      new Set(group.map((x) => x.video)).size !== 1
    )
      blocked.push(`incomplete_or_mixed_pair:${key.replace("\0", ":")}`);
  const expectedSeeds=[...input.formal_spec.seeds].sort((a,b)=>a-b),caseSeeds=new Map<string,Set<number>>();
  for(const entry of input.private_answer_key.entries){const values=caseSeeds.get(entry.case_id)??new Set<number>();values.add(entry.seed);caseSeeds.set(entry.case_id,values);}
  for(const [caseId,values] of caseSeeds){const actual=[...values].sort((a,b)=>a-b);if(JSON.stringify(actual)!==JSON.stringify(expectedSeeds))blocked.push(`formal_seed_set_drift:${caseId}`);}
  const tie = stats.strongest_non_oracle_tie_order;
  let baseline: Exclude<Arm, "oracle_delta"> = tie[0];
  if (!blocked.length)
    baseline = [...tie].sort((a, b) => {
      const d =
        macro(
          observations.filter((x) => x.arm === b),
          "evidence_f1",
        ) -
        macro(
          observations.filter((x) => x.arm === a),
          "evidence_f1",
        );
      return Math.abs(d) > 1e-15 ? d : tie.indexOf(a) - tie.indexOf(b);
    })[0];
  const summaries: OracleValueMetricSummaryV1[] = [];
  if (!blocked.length)
    for (const metric of stats.metric_order) {
      const op = macro(
          observations.filter((x) => x.arm === "oracle_delta"),
          metric,
        ),
        bp = macro(
          observations.filter((x) => x.arm === baseline),
          metric,
        ),
        boot = bootstrapDiff(
          observations,
          baseline,
          metric,
          stats.bootstrap_seed,
          stats.bootstrap_replicates,
        );
      summaries.push({
        metric,
        oracle_point: op,
        baseline_point: bp,
        difference: op - bp,
        primary_80_ci: [quantile(boot, 0.1), quantile(boot, 0.9)],
        descriptive_95_ci: [quantile(boot, 0.025), quantile(boot, 0.975)],
      });
    }
  let decision: "GO" | "STOP" | "BLOCKED" = blocked.length ? "BLOCKED" : "GO";
  if (decision === "GO") {
    for (const metric of [
      "evidence_f1",
      "temporal_fidelity",
      "edit_coverage",
    ] as const) {
      const value = summaries.find((x) => x.metric === metric)!;
      if (value.difference < 0.05 || value.primary_80_ci[0] <= 0)
        decision = "STOP";
    }
    if (
      summaries.find((x) => x.metric === "unsupported_claim_rate")!.difference >
      0
    )
      decision = "STOP";
  }
  const report: OracleValueGateReportV1 = {
    schema_version: "oracle-value-gate-report-v1",
    report_sha256: "0".repeat(64),
    record_trust: "non_authoritative_statistics_record",
    evidence_scope: input.evidence_scope,
    paper_claim_status: "prohibited_no_automatic_paper_claim",
    run_sha256: assignment.run_sha256,
    rating_plan_sha256: plan.rating_plan_sha256,
    rating_assignment_sha256: assignment.assignment_sha256,
    statistics_plan_sha256: stats.statistics_plan_sha256,
    rating_set_sha256: cap.rating_set.rating_set_sha256,
    private_answer_key_sha256: input.private_answer_key.answer_key_sha256,
    selected_strongest_non_oracle: baseline,
    selection_metric: "evidence_f1",
    teacher_count: teachers.size,
    video_count: videos.size,
    case_count: cases.size,
    seed_count: seeds.size,
    paired_observation_count: groups.size,
    metric_summaries: summaries,
    decision,
    blocked_reasons: [...new Set(blocked)].sort(),
    bootstrap_seed: stats.bootstrap_seed,
    bootstrap_replicates: stats.bootstrap_replicates,
    compiled_at: input.compiled_at,
    signature_status: "pending_external_trusted_signature_or_worm",
    api_execution_allowed: false,
  };
  report.report_sha256 = hashOracleValueGateReport(report);
  const valid = validateOracleValueGateReport(report);
  if (!valid.valid) throw Error(`统计报告内部无效：${valid.issues[0]?.path}`);
  const bound = validateOracleValueGateReportAgainstStatisticsPlan(report, plan);
  if (!bound.valid)
    throw Error(`统计报告未闭合预注册计划：${bound.issues[0]?.path}`);
  return deepFreeze(report);
}
