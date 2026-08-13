import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
  FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
  FORMAL_ORACLE_PROVIDER_TOKEN_FIELD,
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
  FORMAL_ORACLE_USER_PROMPT_VERSION,
  ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  hashFormalOraclePreregistrationBundleV2,
  hashFormalRunContractV2,
  hashOracleGateFormalSpecV2,
  hashOracleGatePublicEvidenceDerivationPolicyV2,
  hashOracleGateRatingPlanV2,
  hashOracleGateStatisticsPlanV2,
  hashRunCheckpoint,
  type FormalOraclePreregistrationBundleV2,
  type FormalRunContractV2,
  type OracleGateFormalSpecV2,
  type OracleGatePublicEvidenceDerivationPolicyV2,
  type OracleGateRatingPlanV2,
  type OracleGateStatisticsPlanV2,
  type RunCheckpointV1,
} from "../../contracts/src/index.js";
import {
  hashFormalOracleExecutionPlan,
  hashFormalOracleStructuralSchedule,
  type FormalOracleExecutionPlanV1,
  type FormalOracleStructuralScheduleV1,
} from "./formalOracleRunStore.js";
import { FormalOraclePreregistrationStoreV2, type CreateFormalOraclePreregisteredRunV2Input } from "./formalOraclePreregistrationStoreV2.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const sha = (value: string): string => createHash("sha256").update(value).digest("hex");
const uri = "board2skill/formal-oracle/preregistered-run-store-v2";

function makePolicy(): OracleGatePublicEvidenceDerivationPolicyV2 {
  const value: OracleGatePublicEvidenceDerivationPolicyV2 = {
    schema_version: "oracle-gate-public-evidence-derivation-policy-v2", public_evidence_derivation_policy_sha256: "0".repeat(64),
    claim_projection_version: "response-v1-fixed-json-pointer-assertion-slots-v1",
    claim_source_paths: ["/observed_board_actions/*/operation","/observed_board_actions/*/content","/observed_board_actions/*/region","/generalized_teaching_capability/name","/generalized_teaching_capability/mechanism","/generalized_teaching_capability/action_program/*","/evidence_claims/*/claim"],
    uncertainty_policy: "not_a_scored_claim", speech_segmentation_version: "one_verified_selected_transcript_unit_per_case-v1", speech_gold_status: "context_not_gold",
    board_event_renderer_version: "signed-gold-final-event-semantic-projection-v1", board_event_projection: ["operation","semantic_label","region","relation","modification"],
    eligible_evidence_policy: "verified_transcript_plus_all_signed_gold_final_events-v1", board_edit_denominator_policy: "all_signed_gold_final_events-v1",
    temporal_pair_policy: "all_ordered_signed_gold_final_event_pairs-v1", single_event_temporal_policy: "metric_not_applicable_not_global_block-v1",
    public_reblinding_scheme: "opaque-item-local-id-uniqueness-only-v1", created_at: "2026-08-13T00:00:00.000Z", api_execution_allowed: false,
  };
  value.public_evidence_derivation_policy_sha256 = hashOracleGatePublicEvidenceDerivationPolicyV2(value); return value;
}

function makeInput(): CreateFormalOraclePreregisteredRunV2Input {
  const policy = makePolicy();
  const statistics: OracleGateStatisticsPlanV2 = {
    schema_version:"oracle-gate-statistics-plan-v2",statistics_plan_sha256:"0".repeat(64),record_trust:"non_authoritative_preregistered_statistics_plan",public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,public_evidence_schema_version:"oracle-gate-public-evidence-package-v2",private_derivation_schema_version:"oracle-gate-private-evidence-derivation-receipt-v2",metric_order:["evidence_f1","temporal_fidelity","edit_coverage","unsupported_claim_rate"],strongest_non_oracle_selection_metric:"evidence_f1",strongest_non_oracle_tie_order:["static_final_board","uniform_frame","transcript_only"],item_rater_aggregation:"equal_mean_two_raters",point_aggregation:"case_seed_mean_then_case_macro_then_video_macro_then_teacher_macro",bootstrap_method:"hierarchical_teacher_video_case_seed_paired_v2",bootstrap_seed:71,bootstrap_replicates:1000,primary_ci:.8,descriptive_ci:.95,quantile_method:"sorted_linear_interpolation_r7",missing_policy:"blocked_no_partial_statistics",zero_eligible_policy:"metric_null_and_gate_blocked",single_event_temporal_policy:"exclude_temporal_item_symmetrically_within_case_seed_keep_other_metrics-v1",empty_temporal_population_policy:"blocked_no_temporal_population",minimum_teachers:2,minimum_seeds_per_case:3,created_at:"2026-08-13T00:00:00.000Z",api_execution_allowed:false,
  }; statistics.statistics_plan_sha256 = hashOracleGateStatisticsPlanV2(statistics);
  const spec: OracleGateFormalSpecV2 = {
    schema_version:"oracle-gate-formal-spec-v2",spec_sha256:"0".repeat(64),input_manifest_sha256:sha("manifest"),signed_gold_dataset_sha256:sha("gold"),code_revision:"3".repeat(40),model:"fixture-model",transport:"pi",cache_retention:"none",tools_policy:"none",temperature:0,seeds:[11,23,47],
    prompt:{version:FORMAL_ORACLE_USER_PROMPT_VERSION,system_sha256:sha("system"),user_template_sha256:FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,output_schema_sha256:ORACLE_GATE_RESPONSE_SCHEMA_SHA256},
    budget:{max_input_tokens:8192,max_output_tokens:2048,visual_items_per_visual_arm:1,canvas:{mime_type:"image/jpeg",width:1920,height:360,quality:88},timeout_ms:120000,max_attempts:2},
    evaluation:{rubric_version:"rubric-v2",rubric_sha256:sha("rubric"),rating_schema_version:"oracle-gate-rating-ledger-v2",independent_raters:2,primary_ci:.8,descriptive_ci:.95,bootstrap_seed:71,strongest_non_oracle_rule:"best_pre_registered_non_oracle_on_development",missing_request_policy:"fail_closed_no_partial_decision",public_evidence_derivation_policy_schema_version:"oracle-gate-public-evidence-derivation-policy-v2",public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,statistics_plan_schema_version:"oracle-gate-statistics-plan-v2",statistics_plan_sha256:statistics.statistics_plan_sha256,public_evidence_schema_version:"oracle-gate-public-evidence-package-v2",private_derivation_schema_version:"oracle-gate-private-evidence-derivation-receipt-v2"},created_at:"2026-08-13T00:01:00.000Z",
  }; spec.spec_sha256 = hashOracleGateFormalSpecV2(spec);
  const rating: OracleGateRatingPlanV2 = { schema_version:"oracle-gate-rating-plan-v2",rating_plan_sha256:"0".repeat(64),record_trust:"non_authoritative_preregistered_rating_plan",formal_spec_sha256:spec.spec_sha256,public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,rubric_version:spec.evaluation.rubric_version,rubric_sha256:spec.evaluation.rubric_sha256,required_independent_raters:2,rating_schema_version:"oracle-gate-rating-ledger-v2",public_evidence_schema_version:"oracle-gate-public-evidence-package-v2",private_derivation_schema_version:"oracle-gate-private-evidence-derivation-receipt-v2",metrics:["evidence_f1","temporal_fidelity","edit_coverage","unsupported_claim_rate"],statistics_plan:structuredClone(statistics),statistics_plan_sha256:statistics.statistics_plan_sha256,created_at:"2026-08-13T00:02:00.000Z",api_execution_allowed:false }; rating.rating_plan_sha256=hashOracleGateRatingPlanV2(rating);
  const bundle: FormalOraclePreregistrationBundleV2 = { schema_version:"formal-oracle-preregistration-bundle-v2",preregistration_bundle_sha256:"0".repeat(64),record_trust:"non_authoritative_preregistration_bundle_external_worm_pending",policy,public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,statistics_plan:statistics,statistics_plan_sha256:statistics.statistics_plan_sha256,formal_spec:spec,formal_spec_sha256:spec.spec_sha256,rating_plan:rating,rating_plan_sha256:rating.rating_plan_sha256,api_execution_allowed:false }; bundle.preregistration_bundle_sha256=hashFormalOraclePreregistrationBundleV2(bundle);
  const arms = ["transcript_only","static_final_board","uniform_frame","oracle_delta"] as const;
  const structural_schedule: FormalOracleStructuralScheduleV1 = spec.seeds.flatMap((seed) => arms.map((arm,index) => ({request_id:`REQ-${seed}-${index}`,idempotency_key:sha(`idem-${seed}-${index}`),case_id:"CASE-1",package_id:"PACKAGE-1",group_id:"GROUP-1",source_video_id:"VIDEO-1",arm,seed})));
  const execution_plan: FormalOracleExecutionPlanV1 = { schema_version:"formal-oracle-execution-plan-v2",execution_plan_sha256:"0".repeat(64),items:structural_schedule.map((item,index)=>({request_id:item.request_id,idempotency_key:item.idempotency_key,schedule_index:index,case_id:item.case_id,arm:item.arm,seed:item.seed,model:spec.model,request_envelope_sha256:sha(`envelope-${index}`),provider_body_sha256:sha(`body-${index}`),provider_body_profile:FORMAL_ORACLE_PROVIDER_BODY_PROFILE,provider_body_dispatch_status:"pending_local_pi_fetch_boundary_proof_non_executable",prepared_adapter_version:FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,provider_token_field:FORMAL_ORACLE_PROVIDER_TOKEN_FIELD,system_prompt_sha256:spec.prompt.system_sha256,user_prompt_sha256:sha(`user-${index}`),output_schema_sha256:spec.prompt.output_schema_sha256,visuals:item.arm==="transcript_only"?[]:[{label:"visual-1",object_uri:`assets/${index}.jpg`,sha256:sha(`visual-${index}`),mime_type:"image/jpeg",width:1920,height:360,byte_length:10}],transport:"pi",temperature:0,max_input_tokens:8192,max_output_tokens:2048,timeout_ms:120000,max_attempts:2,cache_retention:"none",tools_policy:"none"})) }; execution_plan.execution_plan_sha256=hashFormalOracleExecutionPlan(execution_plan);
  const run: FormalRunContractV2 = { schema_version:"oracle-gate-formal-run-contract-v2",run_sha256:"0".repeat(64),canonicalization:"oracle-gate-run-canonical-json-v2",signed_gold_dataset_sha256:spec.signed_gold_dataset_sha256,formal_input_manifest_sha256:spec.input_manifest_sha256,formal_spec_sha256:spec.spec_sha256,schedule_sha256:hashFormalOracleStructuralSchedule(structural_schedule),execution_plan_sha256:execution_plan.execution_plan_sha256,ledger_registry_sha256:sha("registry"),media_attestation_sha256:sha("media"),speech_attestation_sha256:sha("speech"),code_revision:spec.code_revision,build_artifact_sha256:sha("build"),blinding_secret_commitment_sha256:sha("secret"),blinding_scheme:"hmac-sha256-run-request-v1",rating_plan_sha256:rating.rating_plan_sha256,statistics_plan_sha256:statistics.statistics_plan_sha256,preregistration_bundle_sha256:bundle.preregistration_bundle_sha256,public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,run_store_uri:uri,request_count:structural_schedule.length,directory_mode:"0700",file_mode:"0600",lock_scheme:"exclusive-create-owner-nonce-v1",checkpoint_scheme:"immutable-hash-chain-head-v1",remote_idempotency_mode:"local_only_fail_closed",api_execution_allowed:false }; run.run_sha256=hashFormalRunContractV2(run);
  const initial_checkpoint: RunCheckpointV1 = {schema_version:"oracle-gate-run-checkpoint-v1",checkpoint_sha256:"0".repeat(64),run_sha256:run.run_sha256,schedule_sha256:run.schedule_sha256,generation:0,previous_checkpoint_sha256:null,created_at:"2026-08-13T00:03:00.000Z",run_state:"SEALED_READY",terminal_reason_sha256:null,request_count:run.request_count,counts:{pending:run.request_count,retry_ready:0,dispatch_intent_committed:0,receipt_committed:0,schema_validated_committed:0,blocked_ambiguous:0,failed_closed:0},entries:execution_plan.items.map((item)=>({request_id:item.request_id,idempotency_key:item.idempotency_key,state:"PENDING",resume_action:"dispatch_new_attempt",max_attempts:item.max_attempts,attempts_used:0,active_intent_sha256:null,latest_attempt_audit_sha256:null,committed_request_sha256:null}))}; initial_checkpoint.checkpoint_sha256=hashRunCheckpoint(initial_checkpoint);
  return {run,preregistration_bundle:bundle,structural_schedule,execution_plan,initial_checkpoint};
}

describe("FormalOraclePreregistrationStoreV2", () => {
  it("persists every preregistration body before create-once genesis and reloads under an external pin", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();
    const snapshot=await store.createPreregisteredGenesis(input);expect(snapshot.api_execution_allowed).toBe(false);expect(snapshot.execution_migration_status).toMatch(/^pending_/);
    expect((await new FormalOraclePreregistrationStoreV2(root).inspectPreregisteredGenesis(input.run.run_sha256,snapshot.head_pin)).preregistration_bundle).toEqual(input.preregistration_bundle);
    await expect(store.createPreregisteredGenesis(input)).rejects.toThrow(/create-once/);
    await expect(store.inspectPreregisteredGenesis(input.run.run_sha256,{...snapshot.head_pin,checkpoint_sha256:sha("old")})).rejects.toThrow(/pin/);
  });

  it("rejects a durable policy body replacement even when HEAD and bundle remain unchanged", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();const snapshot=await store.createPreregisteredGenesis(input);
    const path=join(root,uri,"runs",input.run.run_sha256,"objects","evidence-policies",input.preregistration_bundle.public_evidence_derivation_policy_sha256,"policy.json");
    const original=await readFile(path);const changed=Buffer.from(original);changed[changed.length-2]=changed[changed.length-2]===48?49:48;await writeFile(path,changed);
    await expect(new FormalOraclePreregistrationStoreV2(root).inspectPreregisteredGenesis(input.run.run_sha256,snapshot.head_pin)).rejects.toThrow(/内容地址|正文|JSON/);
  });

  it("snapshots caller data before I/O and never executes accessors or inherited toJSON", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();let hits=0;
    const hostile=Object.create(Object.prototype,Object.getOwnPropertyDescriptors(input));
    Object.defineProperty(hostile,"run",{enumerable:true,get(){hits++;return input.run;}});
    await expect(store.createPreregisteredGenesis(hostile)).rejects.toThrow(/accessor|plain/);expect(hits).toBe(0);
    const inherited=Object.assign(Object.create({toJSON(){hits++;return {};}}),input);
    await expect(store.createPreregisteredGenesis(inherited)).rejects.toThrow(/prototype|plain/);expect(hits).toBe(0);
  });
});
