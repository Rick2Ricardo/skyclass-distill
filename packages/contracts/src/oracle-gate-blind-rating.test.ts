import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTrustedOracleGateRatingSet } from "../../distillation/src/oracleBlindRatingGate.js";
import {
  canonicalOracleGateFormalSpecPayload,
  type OracleGateFormalSpec,
} from "./oracle-gate-formal.js";
import {
  ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
} from "./oracle-gate-response.js";
import {
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
  FORMAL_ORACLE_USER_PROMPT_VERSION,
} from "./oracle-gate-user-prompt.js";
import {
  hashPrivateAnswerKey,
  hashPublicBlindPackage,
  hashPublicBlindResponse,
  type PrivateAnswerKeyV1,
  type PublicBlindPackageV1,
} from "./oracle-gate-run.js";
import {
  hashOracleGateCompletedRatingSet,
  hashOracleGateRatingAssignment,
  hashOracleGatePublicEvidenceItem,
  hashOracleGatePublicEvidencePackage,
  hashOracleGateRatingLedger,
  hashOracleGateRatingPlan,
  hashOracleGateStatisticsPlan,
  oracleGateRatingLedgerSignaturePreimage,
  validateOracleGateCompletedRatingSet,
  validateOracleGateRatingAssignment,
  validateOracleGatePublicEvidenceAgainstBlindArtifacts,
  validateOracleGatePublicEvidencePackage,
  validateOracleGateRatingPlan,
  validateOracleGateRatingPlanAgainstFormalSpec,
  validateOracleGateSignedRatingLedger,
  type OracleGateCompletedRatingSetV1,
  type OracleGateRatingAssignmentV1,
  type OracleGatePublicEvidencePackageV1,
  type OracleGateRatingPlanV1,
  type OracleGateSignedRatingLedgerV1,
} from "./oracle-gate-blind-rating.js";
import { sha256Hex } from "./sha256.js";

const blindId = `B-${"a".repeat(64)}`,
  response = { value: "anonymous response" },
  responseSha = hashPublicBlindResponse(response);
function blindArtifacts() {
  const pub: PublicBlindPackageV1 = {
    schema_version: "oracle-gate-public-blind-package-v1",
    package_sha256: "0".repeat(64),
    run_commitment_sha256: "1".repeat(64),
    rubric_version: "rubric-v1",
    rubric_sha256: "2".repeat(64),
    blinding_statement: "metadata_blinded_no_pairing_exposed",
    item_count: 1,
    items: [{ blind_id: blindId, response, response_sha256: responseSha }],
  };
  pub.package_sha256 = hashPublicBlindPackage(pub);
  const key: PrivateAnswerKeyV1 = {
    schema_version: "oracle-gate-private-answer-key-v1",
    answer_key_sha256: "0".repeat(64),
    run_sha256: pub.run_commitment_sha256,
    public_package_sha256: pub.package_sha256,
    blind_secret_commitment_sha256: "3".repeat(64),
    blinding_scheme: "hmac-sha256-run-request-v1",
    created_at: "2026-08-13T00:00:00.000Z",
    entries: [
      {
        blind_id: blindId,
        request_id: "req-1",
        idempotency_key: "4".repeat(64),
        case_id: "case-1",
        arm: "oracle_delta",
        seed: 7,
        teacher_id: "teacher-1",
        source_video_id: "video-1",
        window_id: "window-1",
        response_sha256: responseSha,
      },
    ],
  };
  key.answer_key_sha256 = hashPrivateAnswerKey(key);
  return { pub, key };
}
function evidence(
  pub: PublicBlindPackageV1,
): OracleGatePublicEvidencePackageV1 {
  const v: OracleGatePublicEvidencePackageV1 = {
    schema_version: "oracle-gate-public-evidence-package-v1",
    evidence_package_sha256: "0".repeat(64),
    record_trust: "non_authoritative_public_blind_evidence_record",
    public_response_package_sha256: pub.package_sha256,
    rubric_version: pub.rubric_version,
    rubric_sha256: pub.rubric_sha256,
    blinding_statement: "no_explicit_arm_seed_private_id_or_pairing_metadata",
    distribution_independence_status:
      "pending_external_randomized_independent_sessions",
    item_count: 1,
    items: [
      {
        blind_id: blindId,
        response_sha256: responseSha,
        claim_units: [
          {
            claim_id: "local-c1",
            claim_index: 0,
            content: "The response states an equation was added",
          },
          {
            claim_id: "local-c2",
            claim_index: 1,
            content: "The response states a diagram was completed",
          },
        ],
        evidence_units: [
          {
            unit_id: "local-s1",
            kind: "speech",
            sequence_index: 0,
            content: "A spoken explanation",
          },
          {
            unit_id: "local-b1",
            kind: "board_delta",
            sequence_index: 1,
            content: "An equation is added",
          },
          {
            unit_id: "local-b2",
            kind: "board_delta",
            sequence_index: 2,
            content: "A diagram is completed",
          },
        ],
        eligible_evidence_unit_ids: ["local-s1", "local-b1", "local-b2"],
        board_edit_unit_ids: ["local-b1", "local-b2"],
        temporal_pairs: [
          {
            pair_id: "local-p1",
            before_unit_id: "local-b1",
            after_unit_id: "local-b2",
          },
        ],
      },
    ],
    api_execution_allowed: false,
  };
  v.evidence_package_sha256 = hashOracleGatePublicEvidencePackage(v);
  return v;
}
function plan(
  pub: PublicBlindPackageV1,
  e: OracleGatePublicEvidencePackageV1,
): OracleGateRatingPlanV1 {
  const s: import("./oracle-gate-blind-rating.js").OracleGateStatisticsPlanV1 =
    {
      schema_version: "oracle-gate-statistics-plan-v1",
      statistics_plan_sha256: "0".repeat(64),
      metric_order: [
        "evidence_f1",
        "temporal_fidelity",
        "edit_coverage",
        "unsupported_claim_rate",
      ],
      strongest_non_oracle_selection_metric: "evidence_f1",
      strongest_non_oracle_tie_order: [
        "static_final_board",
        "uniform_frame",
        "transcript_only",
      ],
      item_rater_aggregation: "equal_mean_two_raters",
    point_aggregation:
      "case_seed_mean_then_case_macro_then_video_macro_then_teacher_macro",
    bootstrap_method: "hierarchical_teacher_video_case_seed_paired_v2",
      bootstrap_seed: 42,
      bootstrap_replicates: 1000,
      primary_ci: 0.8,
      descriptive_ci: 0.95,
      quantile_method: "sorted_linear_interpolation_r7",
      missing_policy: "blocked_no_partial_statistics",
      zero_eligible_policy: "metric_null_and_gate_blocked",
      minimum_teachers: 2,
      minimum_seeds_per_case: 3,
    };
  s.statistics_plan_sha256 = hashOracleGateStatisticsPlan(s);
  const p: OracleGateRatingPlanV1 = {
    schema_version: "oracle-gate-rating-plan-v1",
    rating_plan_sha256: "0".repeat(64),
    record_trust: "non_authoritative_preregistered_rating_plan",
    rubric_version: pub.rubric_version,
    rubric_sha256: pub.rubric_sha256,
    formal_spec_sha256: "5".repeat(64),
    required_independent_raters: 2,
    rating_schema_version: "oracle-gate-rating-ledger-v1",
    metrics: [
      "evidence_f1",
      "temporal_fidelity",
      "edit_coverage",
      "unsupported_claim_rate",
    ],
    statistics_plan: s,
    statistics_plan_sha256: s.statistics_plan_sha256,
    created_at: "2026-08-13T00:01:00.000Z",
    api_execution_allowed: false,
  };
  p.rating_plan_sha256 = hashOracleGateRatingPlan(p);
  return p;
}
function ledger(
  p: OracleGateRatingPlanV1,
  assignment: OracleGateRatingAssignmentV1,
  e: OracleGatePublicEvidencePackageV1,
  rater: string,
  keyId: string,
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
): OracleGateSignedRatingLedgerV1 {
  const item = e.items[0];
  const l: OracleGateSignedRatingLedgerV1 = {
    schema_version: "oracle-gate-rating-ledger-v1",
    ledger_sha256: "0".repeat(64),
    rating_plan_sha256: p.rating_plan_sha256,
    rating_assignment_sha256: assignment.assignment_sha256,
    public_response_package_sha256: assignment.public_response_package_sha256,
    public_evidence_package_sha256: e.evidence_package_sha256,
    rubric_sha256: p.rubric_sha256,
    rater_id: rater,
    signer_key_id: keyId,
    independent_session_attestation:
      "rated_without_other_rater_ledger_or_private_answer_key",
    rated_at: "2026-08-13T00:02:00.000Z",
    item_count: 1,
    items: [
      {
        blind_id: blindId,
        response_sha256: responseSha,
        evidence_item_sha256: hashOracleGatePublicEvidenceItem(item),
        claim_judgments: [
          {
            claim_id: "local-c1",
            claim_index: 0,
            supported: true,
            evidence_unit_ids: ["local-s1", "local-b1"],
          },
          {
            claim_id: "local-c2",
            claim_index: 1,
            supported: false,
            evidence_unit_ids: [],
          },
        ],
        covered_edit_unit_ids: ["local-b1"],
        temporal_judgments: [{ pair_id: "local-p1", correct_order: true }],
      },
    ],
    signature_algorithm: "ed25519",
    signature_base64: "A".repeat(86) + "==",
    api_execution_allowed: false,
  };
  l.ledger_sha256 = hashOracleGateRatingLedger(l);
  l.signature_base64 = sign(
    null,
    oracleGateRatingLedgerSignaturePreimage(l),
    privateKey,
  ).toString("base64");
  return l;
}
function completed() {
  const { pub, key } = blindArtifacts(),
    e = evidence(pub),
    p = plan(pub, e);
  const assignment: OracleGateRatingAssignmentV1 = {
    schema_version: "oracle-gate-rating-assignment-v1",
    assignment_sha256: "0".repeat(64),
    record_trust: "non_authoritative_blind_assignment_record",
    run_sha256: pub.run_commitment_sha256,
    rating_plan_sha256: p.rating_plan_sha256,
    public_response_package_sha256: pub.package_sha256,
    public_evidence_package_sha256: e.evidence_package_sha256,
    rubric_sha256: p.rubric_sha256,
    formal_spec_sha256: p.formal_spec_sha256,
    terminal_checkpoint_sha256: "c".repeat(64),
    run_completed_at: "2026-08-13T00:01:10.000Z",
    assignment_mode: "full_package_two_raters_independent_order",
    assignments: [
      { rater_id: "rater-a", signer_key_id: "key-a", assigned_at: "2026-08-13T00:01:40.000Z", presentation_order_blind_ids: [blindId] },
      { rater_id: "rater-b", signer_key_id: "key-b", assigned_at: "2026-08-13T00:01:40.000Z", presentation_order_blind_ids: [blindId] },
    ],
    created_at: "2026-08-13T00:01:30.000Z",
    api_execution_allowed: false,
  };
  assignment.assignment_sha256 = hashOracleGateRatingAssignment(assignment);
  const ka = generateKeyPairSync("ed25519"),
    kb = generateKeyPairSync("ed25519"),
    a = ledger(p, assignment, e, "rater-a", "key-a", ka.privateKey),
    b = ledger(p, assignment, e, "rater-b", "key-b", kb.privateKey);
  const set: OracleGateCompletedRatingSetV1 = {
    schema_version: "oracle-gate-completed-rating-set-v1",
    rating_set_sha256: "0".repeat(64),
    record_trust: "non_authoritative_until_trusted_signatures_verified",
    rating_plan_sha256: p.rating_plan_sha256,
    rating_assignment_sha256: assignment.assignment_sha256,
    public_response_package_sha256: pub.package_sha256,
    public_evidence_package_sha256: e.evidence_package_sha256,
    ledger_count: 2,
    ledgers: [a, b],
    completion_status: "complete_two_independent_raters",
    completed_at: "2026-08-13T00:03:00.000Z",
    api_execution_allowed: false,
  };
  set.rating_set_sha256 = hashOracleGateCompletedRatingSet(set);
  return { pub, key, e, p, assignment, set, ka, kb };
}
function formalSpecForPlan(p: OracleGateRatingPlanV1): OracleGateFormalSpec {
  const spec: OracleGateFormalSpec = {
    schema_version: "oracle-gate-formal-spec-v1",
    spec_sha256: "0".repeat(64),
    input_manifest_sha256: "6".repeat(64),
    signed_gold_dataset_sha256: "7".repeat(64),
    code_revision: "8".repeat(40),
    model: "fixture-model",
    transport: "pi",
    cache_retention: "none",
    tools_policy: "none",
    temperature: 0,
    seeds: [11, 23, 47],
    prompt: {
      version: FORMAL_ORACLE_USER_PROMPT_VERSION,
      system_sha256: "9".repeat(64),
      user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
      output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
    },
    budget: {
      max_input_tokens: 8192,
      max_output_tokens: 2048,
      visual_items_per_visual_arm: 1,
      canvas: { mime_type: "image/jpeg", width: 1920, height: 360, quality: 88 },
      timeout_ms: 120_000,
      max_attempts: 2,
    },
    evaluation: {
      rubric_version: p.rubric_version,
      rubric_sha256: p.rubric_sha256,
      rating_schema_version: "oracle-gate-rating-v1",
      independent_raters: 2,
      primary_ci: 0.8,
      descriptive_ci: 0.95,
      bootstrap_seed: p.statistics_plan.bootstrap_seed,
      strongest_non_oracle_rule: "best_pre_registered_non_oracle_on_development",
      missing_request_policy: "fail_closed_no_partial_decision",
    },
  };
  spec.spec_sha256 = sha256Hex(canonicalOracleGateFormalSpecPayload(spec));
  return spec;
}

describe("Formal Oracle public blind rating contracts", () => {
  it("accepts public evidence, a frozen single-baseline plan and complete two-rater atomic judgments", () => {
    const x = completed();
    expect(validateOracleGatePublicEvidencePackage(x.e)).toEqual({
      valid: true,
      issues: [],
    });
    expect(
      validateOracleGatePublicEvidenceAgainstBlindArtifacts(x.e, x.pub, x.key),
    ).toEqual({ valid: true, issues: [] });
    expect(validateOracleGateRatingPlan(x.p)).toEqual({
      valid: true,
      issues: [],
    });
    expect(validateOracleGateSignedRatingLedger(x.set.ledgers[0])).toEqual({
      valid: true,
      issues: [],
    });
    expect(
      validateOracleGateCompletedRatingSet(
        x.set,
        x.p,
        x.assignment,
        x.e,
        x.pub,
      ),
    ).toEqual({ valid: true, issues: [] });
  });
  it("recomputes the formal spec commitment before accepting the preregistered rating plan", () => {
    const x = completed(), spec = formalSpecForPlan(x.p), plan = structuredClone(x.p);
    plan.formal_spec_sha256 = spec.spec_sha256;
    plan.rating_plan_sha256 = hashOracleGateRatingPlan(plan);
    expect(validateOracleGateRatingPlanAgainstFormalSpec(plan, spec).valid).toBe(true);
    const drifted = structuredClone(spec);
    drifted.seeds = [101, 102, 103];
    expect(validateOracleGateRatingPlanAgainstFormalSpec(plan, drifted).valid).toBe(false);
  });
  it("rejects hostile accessors before invoking legacy formal/blind validators", () => {
    const x = completed();
    let hits = 0;
    const hostileSpec = Object.defineProperty({}, "schema_version", {
      enumerable: true,
      get() { hits += 1; return "oracle-gate-formal-spec-v1"; },
    });
    expect(validateOracleGateRatingPlanAgainstFormalSpec({}, hostileSpec).valid).toBe(false);
    const hostilePublic = Object.defineProperty({}, "schema_version", {
      enumerable: true,
      get() { hits += 1; return "oracle-gate-public-blind-package-v1"; },
    });
    expect(validateOracleGatePublicEvidenceAgainstBlindArtifacts(x.e, hostilePublic, x.key).valid).toBe(false);
    expect(validateOracleGateCompletedRatingSet({}, {}, {}, {}, hostilePublic).valid).toBe(false);
    expect(hits).toBe(0);
  });
  it("rejects explicit private/pairing leakage and public/private coverage drift", () => {
    const x = completed(),
      leak = structuredClone(x.e);
    leak.items[0].evidence_units[0].content = "arm: oracle_delta";
    leak.evidence_package_sha256 = hashOracleGatePublicEvidencePackage(leak);
    expect(validateOracleGatePublicEvidencePackage(leak).valid).toBe(false);
    const missing = structuredClone(x.e);
    missing.items = [];
    missing.item_count = 0;
    missing.evidence_package_sha256 =
      hashOracleGatePublicEvidencePackage(missing);
    expect(
      validateOracleGatePublicEvidenceAgainstBlindArtifacts(
        missing,
        x.pub,
        x.key,
      ).valid,
    ).toBe(false);
    for(const mutate of [
      (v:OracleGatePublicEvidencePackageV1)=>{v.items[0].claim_units[0].content="s\u200beed: 7";},
      (v:OracleGatePublicEvidencePackageV1)=>{v.items[0].claim_units[0].content="PAIRING: same case-seed group";},
      (v:OracleGatePublicEvidencePackageV1)=>{v.items[0].claim_units[0].claim_id="seed:7";},
      (v:OracleGatePublicEvidencePackageV1)=>{v.items[0].temporal_pairs[0]={pair_id:"local-p1",before_unit_id:"local-b2",after_unit_id:"local-b1"};},
    ]){const bad=structuredClone(x.e);mutate(bad);bad.evidence_package_sha256=hashOracleGatePublicEvidencePackage(bad);expect(validateOracleGatePublicEvidencePackage(bad).valid).toBe(false);}
    for (const content of ["种子: 7", "种子：7", "s e e d: 7", "paired with prior response", "与另一个响应配对", "condition: oracle"]) {
      const bad = structuredClone(x.e);
      bad.items[0].claim_units[0].content = content;
      bad.evidence_package_sha256 = hashOracleGatePublicEvidencePackage(bad);
      expect(validateOracleGatePublicEvidencePackage(bad).valid).toBe(false);
    }
  });
  it("rejects denominator fraud, ordering/deletion, duplicate raters/keys, self-resign and domain/plain-hash confusion", () => {
    const x = completed();
    for (const mutate of [
      (s: OracleGateCompletedRatingSetV1) => {
        s.ledgers[0].items[0].claim_judgments[0].evidence_unit_ids = [
          "not-public",
        ];
      },
      (s: OracleGateCompletedRatingSetV1) => {
        s.ledgers[0].items[0].temporal_judgments = [];
      },
      (s: OracleGateCompletedRatingSetV1) => {
        s.ledgers[1].rater_id = s.ledgers[0].rater_id;
      },
      (s: OracleGateCompletedRatingSetV1) => {
        s.ledgers[1].signer_key_id = s.ledgers[0].signer_key_id;
      },
    ]) {
      const bad = structuredClone(x.set);
      mutate(bad);
      bad.rating_set_sha256 = hashOracleGateCompletedRatingSet(bad);
      expect(
        validateOracleGateCompletedRatingSet(bad, x.p, x.assignment, x.e, x.pub)
          .valid,
      ).toBe(false);
    }
    const plain = structuredClone(x.set.ledgers[0]);
    plain.ledger_sha256 = "f".repeat(64);
    expect(validateOracleGateSignedRatingLedger(plain).valid).toBe(false);
  });
  it("rejects private assignment deletion, duplicate identities, order mismatch and impossible times", () => {
    const x=completed();
    for(const mutate of [
      (a:OracleGateRatingAssignmentV1)=>{a.assignments[0].presentation_order_blind_ids=[];},
      (a:OracleGateRatingAssignmentV1)=>{a.assignments[1].rater_id=a.assignments[0].rater_id;},
      (a:OracleGateRatingAssignmentV1)=>{a.assignments[1].signer_key_id=a.assignments[0].signer_key_id;},
      (a:OracleGateRatingAssignmentV1)=>{a.assignments[0].assigned_at="2026-08-13T00:00:00.000Z";},
    ]){const bad=structuredClone(x.assignment);mutate(bad);bad.assignment_sha256=hashOracleGateRatingAssignment(bad);expect(validateOracleGateRatingAssignment(bad,x.p,x.e,x.pub).valid).toBe(false);}
    const wrongOrder=structuredClone(x.set);wrongOrder.ledgers[0].items=[];wrongOrder.rating_set_sha256=hashOracleGateCompletedRatingSet(wrongOrder);expect(validateOracleGateCompletedRatingSet(wrongOrder,x.p,x.assignment,x.e,x.pub).valid).toBe(false);
    const pub2=structuredClone(x.pub),evidence2=structuredClone(x.e),secondBlind=`B-${"b".repeat(64)}`;
    pub2.items.push({...structuredClone(pub2.items[0]),blind_id:secondBlind});pub2.item_count=2;pub2.package_sha256=hashPublicBlindPackage(pub2);
    evidence2.items.push({...structuredClone(evidence2.items[0]),blind_id:secondBlind});evidence2.item_count=2;evidence2.public_response_package_sha256=pub2.package_sha256;evidence2.evidence_package_sha256=hashOracleGatePublicEvidencePackage(evidence2);
    const sameOrder=structuredClone(x.assignment);sameOrder.public_response_package_sha256=pub2.package_sha256;sameOrder.public_evidence_package_sha256=evidence2.evidence_package_sha256;sameOrder.assignments[0].presentation_order_blind_ids=[blindId,secondBlind];sameOrder.assignments[1].presentation_order_blind_ids=[blindId,secondBlind];sameOrder.assignment_sha256=hashOracleGateRatingAssignment(sameOrder);
    expect(validateOracleGateRatingAssignment(sameOrder,x.p,evidence2,pub2).valid).toBe(false);
  });
  it("rejects alternate-per-metric baseline, CI/bootstrap policy drift, unsafe values and unknown keys", () => {
    const x = completed();
    for (const mutate of [
      (p: OracleGateRatingPlanV1) => {
        (p.statistics_plan.strongest_non_oracle_selection_metric as string) =
          "temporal_fidelity";
      },
      (p: OracleGateRatingPlanV1) => {
        p.statistics_plan.bootstrap_replicates = 999;
      },
      (p: OracleGateRatingPlanV1) => {
        (p.statistics_plan.primary_ci as number) = 0.95;
      },
    ]) {
      const bad = structuredClone(x.p);
      mutate(bad);
      bad.statistics_plan.statistics_plan_sha256 = hashOracleGateStatisticsPlan(
        bad.statistics_plan,
      );
      bad.statistics_plan_sha256 = bad.statistics_plan.statistics_plan_sha256;
      bad.rating_plan_sha256 = hashOracleGateRatingPlan(bad);
      expect(validateOracleGateRatingPlan(bad).valid).toBe(false);
    }
    expect(validateOracleGateRatingPlan({ ...x.p, extra: true }).valid).toBe(
      false,
    );
  });
  it("verifies two external Ed25519 signatures only inside a frozen callback capability", async () => {
    const x = completed();
    let retained: unknown;
    await expect(
      withTrustedOracleGateRatingSet({
        rating_set: x.set,
        rating_plan: x.p,
        rating_assignment: x.assignment,
        public_evidence_package: x.e,
        public_blind_package: x.pub,
        private_answer_key: x.key,
        trusted_rater_keys: new Map([
          ["key-a", x.ka.publicKey],
          ["key-b", x.kb.publicKey],
        ]),
        callback: async (capability) => {
          retained = capability;
          expect(
            Object.isFrozen(
              capability.rating_set.ledgers[0].items[0].claim_judgments,
            ),
          ).toBe(true);
          expect(() => {
            capability.rating_set.ledgers[0].items[0].claim_judgments[0].supported = false;
          }).toThrow(TypeError);
          return capability.rating_assignment.assignment_sha256;
        },
      }),
    ).resolves.toBe(x.assignment.assignment_sha256);
    expect(() => JSON.stringify(retained)).toThrow(/不得序列化/);

    const bad = structuredClone(x.set);
    bad.ledgers[0].items[0].covered_edit_unit_ids = [];
    bad.ledgers[0].ledger_sha256 = hashOracleGateRatingLedger(bad.ledgers[0]);
    bad.rating_set_sha256 = hashOracleGateCompletedRatingSet(bad);
    await expect(
      withTrustedOracleGateRatingSet({
        rating_set: bad,
        rating_plan: x.p,
        rating_assignment: x.assignment,
        public_evidence_package: x.e,
        public_blind_package: x.pub,
        private_answer_key: x.key,
        trusted_rater_keys: new Map([
          ["key-a", x.ka.publicKey],
          ["key-b", x.kb.publicKey],
        ]),
        callback: async () => undefined,
      }),
    ).rejects.toThrow(/签名无效/);
    await expect(
      withTrustedOracleGateRatingSet({
        rating_set: x.set,
        rating_plan: x.p,
        rating_assignment: x.assignment,
        public_evidence_package: x.e,
        public_blind_package: x.pub,
        private_answer_key: x.key,
        trusted_rater_keys: new Map([
          ["key-a", x.ka.publicKey],
          ["key-b", x.ka.publicKey],
        ]),
        callback: async () => undefined,
      }),
    ).rejects.toThrow(/同一Ed25519/);
    const sourceByField={rating_set:x.set,rating_plan:x.p,rating_assignment:x.assignment,public_evidence_package:x.e,public_blind_package:x.pub,private_answer_key:x.key};for(const field of Object.keys(sourceByField) as Array<keyof typeof sourceByField>){let getterHits=0;const original=sourceByField[field] as object,bad=Object.create(Object.getPrototypeOf(original),Object.getOwnPropertyDescriptors(original));Object.defineProperty(bad,Object.keys(original)[0],{enumerable:true,get(){getterHits++;throw Error("getter executed");}});const input={rating_set:x.set,rating_plan:x.p,rating_assignment:x.assignment,public_evidence_package:x.e,public_blind_package:x.pub,private_answer_key:x.key,trusted_rater_keys:new Map([["key-a",x.ka.publicKey],["key-b",x.kb.publicKey]]),callback:async()=>undefined};(input as Record<string,unknown>)[field]=bad;await expect(withTrustedOracleGateRatingSet(input)).rejects.toThrow(/plain|accessor/i);expect(getterHits).toBe(0);}
  });
});
