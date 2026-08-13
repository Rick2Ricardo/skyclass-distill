import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,
  FORMAL_ORACLE_PROVIDER_BODY_PROFILE,
  FORMAL_ORACLE_PROVIDER_TOKEN_FIELD,
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
  FORMAL_ORACLE_USER_PROMPT_VERSION,
  ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  ORACLE_GATE_RESPONSE_VALIDATOR_VERSION,
  buildFormalOraclePiRequestEnvelope,
  buildFormalOraclePreparedProviderRequest,
  buildFormalOraclePiResponseStreamFixtureV1,
  canonicalOracleGateResponseBytes,
  renderFormalOracleUserPrompt,
  FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES,
  hashFormalOraclePreregistrationBundleV2,
  hashFormalOracleExecutionLineageV2,
  hashFormalOracleRunHeadV2,
  hashRequestIntentV3,
  hashRequestAttemptAuditV5,
  hashCommittedRequestV4,
  hashPublicBlindResponse,
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
  type RequestIntentV3,
  type RequestAttemptAuditV5,
  type CommittedRequestV4,
} from "../../contracts/src/index.js";
import { privateCanonicalJsonBytes } from "./privateContentAddressedFs.js";
import {
  hashFormalOracleExecutionPlan,
  hashFormalOracleStructuralSchedule,
  type FormalOracleExecutionPlanV1,
  type FormalOracleStructuralScheduleV1,
} from "./formalOracleRunStore.js";
import {
  FormalOraclePreregistrationStoreV2,
  assertActiveFormalOracleCompletedRunCapabilityV2,
  type CreateFormalOraclePreregisteredRunV2Input,
} from "./formalOraclePreregistrationStoreV2.js";
import { FormalOracleTransportAuthorityStore } from "./formalOracleTransportAuthorityStore.js";
import { withPinnedFormalOracleTransportAuthority } from "../../distillation/src/oracleTransportAuthorityGate.js";
import {
  sendFormalOracleSingleConsumeRequestV2,
  type FormalOracleCredentialProvider,
  type FormalOraclePinnedHttpsRequestV1,
  type FormalOraclePinnedHttpsResponseV1,
} from "../../llm/src/formalOracleSingleConsumeSender.js";

type SenderTestRuntime = {
  resolveAll(hostname: string): Promise<Array<{ address: string; family: 4 | 6 }>>;
  sendPinned(input: FormalOraclePinnedHttpsRequestV1): Promise<FormalOraclePinnedHttpsResponseV1>;
};
const senderBoundary = vi.hoisted(() => ({ runtime: null as SenderTestRuntime | null }));

vi.mock("node:dns/promises", () => ({
  lookup: (hostname: string) => {
    if (!senderBoundary.runtime) throw new Error("V2 sender test DNS runtime 未安装");
    return senderBoundary.runtime.resolveAll(hostname);
  },
}));

vi.mock("node:https", async () => {
  const { EventEmitter } = await import("node:events");
  return ({ request: (url: URL, options: Record<string, unknown>, onResponse: (response: InstanceType<typeof EventEmitter> & Record<string, unknown>) => void) => {
    const request = new EventEmitter() as InstanceType<typeof EventEmitter> & { end(body: Uint8Array): void; destroy(error: Error): void };
    request.destroy = (error: Error) => queueMicrotask(() => request.emit("error", error));
    request.end = (body: Uint8Array) => queueMicrotask(async () => {
      try {
        if (!senderBoundary.runtime) throw new Error("V2 sender HTTPS runtime 未安装");
        let selectedAddress = "", selectedFamily: 4 | 6 = 4;
        const lookup = options.lookup as (hostname: string, options: unknown, callback: (error: Error | null, address: string, family: 4 | 6) => void) => void;
        lookup(url.hostname, {}, (error, address, family) => { if (error) throw error; selectedAddress = address; selectedFamily = family; });
        const result = await senderBoundary.runtime.sendPinned({ url:url.toString(),method:"POST",headers:new Headers(options.headers as HeadersInit),body:Uint8Array.from(body),selected_address:selectedAddress,selected_family:selectedFamily,timeout_ms:Number(options.timeout),max_response_bytes:Number.MAX_SAFE_INTEGER,signal:options.signal as AbortSignal|undefined });
        const response = new EventEmitter() as InstanceType<typeof EventEmitter> & Record<string, unknown>;
        response.statusCode=result.status;response.headers=Object.fromEntries(result.headers.map(({name,value})=>[name,value]));
        response.socket={remoteAddress:selectedAddress,remoteFamily:selectedFamily===4?"IPv4":"IPv6"};onResponse(response);
        if(result.body.byteLength)response.emit("data",Buffer.from(result.body));result.complete?response.emit("end"):response.emit("aborted");
      } catch(error){request.emit("error",error);}
    });
    return request;
  }});
});

const roots: string[] = [];
afterEach(async () => { senderBoundary.runtime=null;vi.useRealTimers();await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const sha = (value: string): string => createHash("sha256").update(value).digest("hex");
const uri = "board2skill/formal-oracle/preregistered-run-store-v2";
const systemPromptBytes = Buffer.from("frozen formal v2 system prompt\n", "utf8");
const transcriptBytes = Buffer.from("[00:00:00.000 --> 00:00:00.750] 观察板书变化\n", "utf8");
const visualBytes = (arm: string, seed: number): Buffer => Buffer.from(`canonical-v2-visual-${arm}-${seed}`, "utf8");

function requestArtifacts(
  spec: OracleGateFormalSpecV2,
  schedule: FormalOracleStructuralScheduleV1,
  index: number,
) {
  const item = schedule[index];
  const prompt = renderFormalOracleUserPrompt({
    prompt_version: FORMAL_ORACLE_USER_PROMPT_VERSION,
    user_template_bytes: Buffer.from(FORMAL_ORACLE_USER_PROMPT_TEMPLATE_BYTES),
    expected_user_template_sha256: FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,
    selected_transcript_bytes: transcriptBytes,
    expected_selected_transcript_sha256: createHash("sha256").update(transcriptBytes).digest("hex"),
    expected_selected_transcript_byte_length: transcriptBytes.byteLength,
    visual_input_available: item.arm !== "transcript_only",
    output_schema_sha256: ORACLE_GATE_RESPONSE_SCHEMA_SHA256,
  });
  const visual = item.arm === "transcript_only" ? null : visualBytes(item.arm, item.seed);
  const envelope = buildFormalOraclePiRequestEnvelope({
    request_id: item.request_id,
    schedule_index: index,
    case_id: item.case_id,
    arm: item.arm,
    model: spec.model,
    system_prompt_bytes: systemPromptBytes,
    expected_system_prompt_sha256: spec.prompt.system_sha256,
    user_prompt: prompt,
    expected_rendered_user_prompt_sha256: createHash("sha256").update(prompt.bytes).digest("hex"),
    expected_user_template_sha256: spec.prompt.user_template_sha256,
    output_schema_sha256: spec.prompt.output_schema_sha256,
    visuals: visual ? [{ label: "visual-1", mime_type: "image/jpeg", bytes: visual,
      expected_sha256: createHash("sha256").update(visual).digest("hex"), expected_byte_length: visual.byteLength }] : [],
    seed: item.seed,
    temperature: spec.temperature,
    max_input_tokens: spec.budget.max_input_tokens,
    max_output_tokens: spec.budget.max_output_tokens,
    timeout_ms: spec.budget.timeout_ms,
    max_attempts: spec.budget.max_attempts,
    transport: spec.transport,
    cache_retention: spec.cache_retention,
    tools_policy: spec.tools_policy,
  });
  return { envelope, prepared: buildFormalOraclePreparedProviderRequest(envelope), prompt };
}

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
    prompt:{version:FORMAL_ORACLE_USER_PROMPT_VERSION,system_sha256:createHash("sha256").update(systemPromptBytes).digest("hex"),user_template_sha256:FORMAL_ORACLE_USER_PROMPT_TEMPLATE_SHA256,output_schema_sha256:ORACLE_GATE_RESPONSE_SCHEMA_SHA256},
    budget:{max_input_tokens:8192,max_output_tokens:2048,visual_items_per_visual_arm:1,canvas:{mime_type:"image/jpeg",width:1920,height:360,quality:88},timeout_ms:120000,max_attempts:2},
    evaluation:{rubric_version:"rubric-v2",rubric_sha256:sha("rubric"),rating_schema_version:"oracle-gate-rating-ledger-v2",independent_raters:2,primary_ci:.8,descriptive_ci:.95,bootstrap_seed:71,strongest_non_oracle_rule:"best_pre_registered_non_oracle_on_development",missing_request_policy:"fail_closed_no_partial_decision",public_evidence_derivation_policy_schema_version:"oracle-gate-public-evidence-derivation-policy-v2",public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,statistics_plan_schema_version:"oracle-gate-statistics-plan-v2",statistics_plan_sha256:statistics.statistics_plan_sha256,public_evidence_schema_version:"oracle-gate-public-evidence-package-v2",private_derivation_schema_version:"oracle-gate-private-evidence-derivation-receipt-v2"},created_at:"2026-08-13T00:01:00.000Z",
  }; spec.spec_sha256 = hashOracleGateFormalSpecV2(spec);
  const rating: OracleGateRatingPlanV2 = { schema_version:"oracle-gate-rating-plan-v2",rating_plan_sha256:"0".repeat(64),record_trust:"non_authoritative_preregistered_rating_plan",formal_spec_sha256:spec.spec_sha256,public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,rubric_version:spec.evaluation.rubric_version,rubric_sha256:spec.evaluation.rubric_sha256,required_independent_raters:2,rating_schema_version:"oracle-gate-rating-ledger-v2",public_evidence_schema_version:"oracle-gate-public-evidence-package-v2",private_derivation_schema_version:"oracle-gate-private-evidence-derivation-receipt-v2",metrics:["evidence_f1","temporal_fidelity","edit_coverage","unsupported_claim_rate"],statistics_plan:structuredClone(statistics),statistics_plan_sha256:statistics.statistics_plan_sha256,created_at:"2026-08-13T00:02:00.000Z",api_execution_allowed:false }; rating.rating_plan_sha256=hashOracleGateRatingPlanV2(rating);
  const bundle: FormalOraclePreregistrationBundleV2 = { schema_version:"formal-oracle-preregistration-bundle-v2",preregistration_bundle_sha256:"0".repeat(64),record_trust:"non_authoritative_preregistration_bundle_external_worm_pending",policy,public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,statistics_plan:statistics,statistics_plan_sha256:statistics.statistics_plan_sha256,formal_spec:spec,formal_spec_sha256:spec.spec_sha256,rating_plan:rating,rating_plan_sha256:rating.rating_plan_sha256,api_execution_allowed:false }; bundle.preregistration_bundle_sha256=hashFormalOraclePreregistrationBundleV2(bundle);
  const arms = ["transcript_only","static_final_board","uniform_frame","oracle_delta"] as const;
  const structural_schedule: FormalOracleStructuralScheduleV1 = spec.seeds.flatMap((seed) => arms.map((arm,index) => ({request_id:`REQ-${seed}-${index}`,idempotency_key:sha(`idem-${seed}-${index}`),case_id:"CASE-1",package_id:"PACKAGE-1",group_id:"GROUP-1",source_video_id:"VIDEO-1",arm,seed})));
  const execution_plan: FormalOracleExecutionPlanV1 = { schema_version:"formal-oracle-execution-plan-v2",execution_plan_sha256:"0".repeat(64),items:structural_schedule.map((item,index)=>{const artifacts=requestArtifacts(spec,structural_schedule,index);const visual=item.arm==="transcript_only"?null:visualBytes(item.arm,item.seed);return {request_id:item.request_id,idempotency_key:item.idempotency_key,schedule_index:index,case_id:item.case_id,arm:item.arm,seed:item.seed,model:spec.model,request_envelope_sha256:artifacts.envelope.payload_sha256,provider_body_sha256:artifacts.prepared.provider_body_sha256,provider_body_profile:FORMAL_ORACLE_PROVIDER_BODY_PROFILE,provider_body_dispatch_status:"pending_local_pi_fetch_boundary_proof_non_executable",prepared_adapter_version:FORMAL_ORACLE_PREPARED_ADAPTER_VERSION,provider_token_field:FORMAL_ORACLE_PROVIDER_TOKEN_FIELD,system_prompt_sha256:spec.prompt.system_sha256,user_prompt_sha256:createHash("sha256").update(artifacts.prompt.bytes).digest("hex"),output_schema_sha256:spec.prompt.output_schema_sha256,visuals:visual?[{label:"visual-1",object_uri:`assets/${index}.jpg`,sha256:createHash("sha256").update(visual).digest("hex"),mime_type:"image/jpeg",width:1920,height:360,byte_length:visual.byteLength}]:[],transport:"pi",temperature:0,max_input_tokens:8192,max_output_tokens:2048,timeout_ms:120000,max_attempts:2,cache_retention:"none",tools_policy:"none"};}) }; execution_plan.execution_plan_sha256=hashFormalOracleExecutionPlan(execution_plan);
  const run: FormalRunContractV2 = { schema_version:"oracle-gate-formal-run-contract-v2",run_sha256:"0".repeat(64),canonicalization:"oracle-gate-run-canonical-json-v2",signed_gold_dataset_sha256:spec.signed_gold_dataset_sha256,formal_input_manifest_sha256:spec.input_manifest_sha256,formal_spec_sha256:spec.spec_sha256,schedule_sha256:hashFormalOracleStructuralSchedule(structural_schedule),execution_plan_sha256:execution_plan.execution_plan_sha256,ledger_registry_sha256:sha("registry"),media_attestation_sha256:sha("media"),speech_attestation_sha256:sha("speech"),code_revision:spec.code_revision,build_artifact_sha256:sha("build"),blinding_secret_commitment_sha256:sha("secret"),blinding_scheme:"hmac-sha256-run-request-v1",rating_plan_sha256:rating.rating_plan_sha256,statistics_plan_sha256:statistics.statistics_plan_sha256,preregistration_bundle_sha256:bundle.preregistration_bundle_sha256,public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,run_store_uri:uri,request_count:structural_schedule.length,directory_mode:"0700",file_mode:"0600",lock_scheme:"exclusive-create-owner-nonce-v1",checkpoint_scheme:"immutable-hash-chain-head-v1",remote_idempotency_mode:"local_only_fail_closed",api_execution_allowed:false }; run.run_sha256=hashFormalRunContractV2(run);
  const initial_checkpoint: RunCheckpointV1 = {schema_version:"oracle-gate-run-checkpoint-v1",checkpoint_sha256:"0".repeat(64),run_sha256:run.run_sha256,schedule_sha256:run.schedule_sha256,generation:0,previous_checkpoint_sha256:null,created_at:"2026-08-13T00:03:00.000Z",run_state:"SEALED_READY",terminal_reason_sha256:null,request_count:run.request_count,counts:{pending:run.request_count,retry_ready:0,dispatch_intent_committed:0,receipt_committed:0,schema_validated_committed:0,blocked_ambiguous:0,failed_closed:0},entries:execution_plan.items.map((item)=>({request_id:item.request_id,idempotency_key:item.idempotency_key,state:"PENDING",resume_action:"dispatch_new_attempt",max_attempts:item.max_attempts,attempts_used:0,active_intent_sha256:null,latest_attempt_audit_sha256:null,committed_request_sha256:null}))}; initial_checkpoint.checkpoint_sha256=hashRunCheckpoint(initial_checkpoint);
  return {run,preregistration_bundle:bundle,structural_schedule,execution_plan,initial_checkpoint};
}

function intentV3(
  input: CreateFormalOraclePreregisteredRunV2Input,
  store: FormalOraclePreregistrationStoreV2,
  execution: Awaited<ReturnType<FormalOraclePreregistrationStoreV2["migratePreregisteredGenesisToExecutionV2"]>>,
  index = 0,
  attemptOrdinal = 1,
  preparedAt = "2026-08-13T00:05:00.000Z",
): { intent: RequestIntentV3; envelope: ReturnType<typeof requestArtifacts>["envelope"]; prepared: ReturnType<typeof requestArtifacts>["prepared"] } {
  const planned = input.execution_plan.items[index];
  const artifacts = requestArtifacts(input.preregistration_bundle.formal_spec, input.structural_schedule, index);
  const intent: RequestIntentV3 = {
    schema_version:"oracle-gate-request-intent-v3",intent_sha256:"0".repeat(64),run_sha256:input.run.run_sha256,
    preregistration_bundle_sha256:input.run.preregistration_bundle_sha256,schedule_sha256:input.run.schedule_sha256,
    execution_plan_sha256:input.run.execution_plan_sha256,genesis_checkpoint_sha256:input.initial_checkpoint.checkpoint_sha256,
    execution_lineage_sha256:hashFormalOracleExecutionLineageV2({run_sha256:input.run.run_sha256,preregistration_bundle_sha256:input.run.preregistration_bundle_sha256,schedule_sha256:input.run.schedule_sha256,execution_plan_sha256:input.run.execution_plan_sha256,genesis_checkpoint_sha256:input.initial_checkpoint.checkpoint_sha256}),
    run_contract_schema_version:"oracle-gate-formal-run-contract-v2",execution_record_version:"formal-oracle-execution-records-v2",api_execution_allowed:false,
    request_id:planned.request_id,idempotency_key:planned.idempotency_key,schedule_index:index,attempt_ordinal:attemptOrdinal,prepared_at:preparedAt,
    case_id:planned.case_id,arm:planned.arm,seed:planned.seed,model:planned.model,request_envelope_sha256:planned.request_envelope_sha256,
    request_envelope_object_uri:store.requestEnvelopeObjectUriV2(input.run.run_sha256,planned.request_envelope_sha256),provider_body_sha256:planned.provider_body_sha256,
    provider_body_object_uri:store.providerBodyObjectUriV2(input.run.run_sha256,planned.provider_body_sha256),provider_body_profile:planned.provider_body_profile,
    provider_body_dispatch_status:planned.provider_body_dispatch_status,prepared_adapter_version:planned.prepared_adapter_version,provider_token_field:planned.provider_token_field,
    system_prompt_sha256:planned.system_prompt_sha256,user_prompt_sha256:planned.user_prompt_sha256,output_schema_sha256:planned.output_schema_sha256,
    visuals:structuredClone(planned.visuals),transport:planned.transport,temperature:planned.temperature,max_input_tokens:planned.max_input_tokens,
    max_output_tokens:planned.max_output_tokens,timeout_ms:planned.timeout_ms,max_attempts:planned.max_attempts,cache_retention:planned.cache_retention,tools_policy:planned.tools_policy,
  };
  if (intent.execution_lineage_sha256 !== execution.migration.execution_lineage_sha256) throw new Error("fixture lineage drift");
  intent.intent_sha256=hashRequestIntentV3(intent);
  return { intent, ...artifacts };
}

function noResultAuditV5(intent: RequestIntentV3, automaticRetryAllowed: boolean): RequestAttemptAuditV5 {
  const audit: RequestAttemptAuditV5 = {
    schema_version:"oracle-gate-request-attempt-audit-v5",attempt_sha256:"0".repeat(64),intent_schema_version:"oracle-gate-request-intent-v3",intent_sha256:intent.intent_sha256,
    run_sha256:intent.run_sha256,preregistration_bundle_sha256:intent.preregistration_bundle_sha256,schedule_sha256:intent.schedule_sha256,
    execution_plan_sha256:intent.execution_plan_sha256,genesis_checkpoint_sha256:intent.genesis_checkpoint_sha256,execution_lineage_sha256:intent.execution_lineage_sha256,
    run_contract_schema_version:"oracle-gate-formal-run-contract-v2",execution_record_version:"formal-oracle-execution-records-v2",api_execution_allowed:false,
    request_id:intent.request_id,idempotency_key:intent.idempotency_key,attempt_ordinal:intent.attempt_ordinal,started_at:"2026-08-13T00:07:00.000Z",finished_at:"2026-08-13T00:08:00.000Z",latency_ms:60000,
    provider_id:"fixture-provider",provider_http_request_id:null,transport_capture_record_object_uri:null,transport_capture_record_sha256:null,response_http_status:null,response_content_type:null,response_headers_commitment_sha256:null,response_capture_status:"no_response_headers",completion_id:null,
    request_envelope_sha256:intent.request_envelope_sha256,request_envelope_object_uri:intent.request_envelope_object_uri,provider_body_sha256:intent.provider_body_sha256,provider_body_object_uri:intent.provider_body_object_uri,
    fetch_observed_sse_object_uri:null,fetch_observed_sse_bytes_sha256:null,fetch_observed_sse_byte_length:null,sse_derivation_object_uri:null,sse_derivation_record_sha256:null,sse_parser_version:null,assistant_content_object_uri:null,assistant_content_bytes_sha256:null,assistant_content_byte_length:null,canonical_response_object_uri:null,canonical_response_bytes_sha256:null,canonical_response_commitment_sha256:null,invalid_response_record_object_uri:null,invalid_response_record_sha256:null,invalid_response_record_version:null,
    submitted_visuals:structuredClone(intent.visuals),model:intent.model,transport:"pi",temperature:0,max_input_tokens:intent.max_input_tokens,max_output_tokens:intent.max_output_tokens,timeout_ms:intent.timeout_ms,seed:intent.seed,cache_retention:"none",tools_policy:"none",outcome:"no_result_confirmed",provider_response_received:false,stop_reason:null,error_code:"no_result_confirmed",error_message:"provider confirmed no result",usage:null,pricing_table_sha256:null,cost_microunits:null,automatic_retry_allowed:automaticRetryAllowed,
  };
  audit.attempt_sha256=hashRequestAttemptAuditV5(audit);return audit;
}

function oracleResponse(): Record<string, unknown> {
  return { schema_version:"teacher-evidence-response-v1",observed_board_actions:[],generalized_teaching_capability:{name:"证据约束讲解",mechanism:"先观察再抽象",action_program:["确认可见变化"]},evidence_claims:[],uncertainties:[] };
}

async function sendV2Success(
  root: string,
  store: FormalOraclePreregistrationStoreV2,
  input: CreateFormalOraclePreregisteredRunV2Input,
  snapshot: Awaited<ReturnType<FormalOraclePreregistrationStoreV2["migratePreregisteredGenesisToExecutionV2"]>>,
  request: ReturnType<typeof intentV3>,
  sequence = 1,
  dispatchAt = "2026-08-13T00:06:00.000Z",
  instant = "2026-08-13T00:06:30.000Z",
  rawOverride?: Uint8Array,
) {
  const response=oracleResponse();const canonical=Buffer.from(canonicalOracleGateResponseBytes(response));
  const raw=rawOverride ? Buffer.from(rawOverride) : Buffer.from(buildFormalOraclePiResponseStreamFixtureV1({response_id:`chatcmpl-v2-${sequence}`,model:request.intent.model,created:sequence,content_chunks:[canonical.toString("utf8")],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120,prompt_tokens_details:{cached_tokens:0},completion_tokens_details:{reasoning_tokens:0}}}));
  senderBoundary.runtime={resolveAll:async()=>[{address:"8.8.8.8",family:4}],sendPinned:async()=>({status:200,headers:[{name:"content-type",value:"text/event-stream"},{name:"x-request-id",value:`provider-http-v2-${sequence}`}],body:raw,complete:true})};
  const keys=generateKeyPairSync("ed25519"),authorityStore=new FormalOracleTransportAuthorityStore(root);
  const expected={ledger_registry_sha256:input.run.ledger_registry_sha256,composition_sha256:sha("v2-composition"),run_sha256:input.run.run_sha256,execution_plan_sha256:input.execution_plan.execution_plan_sha256,model:request.intent.model};
  const current=Date.parse(instant);vi.useFakeTimers();vi.setSystemTime(new Date(current));
  const registry=await authorityStore.freezeRegistry({sequence,issued_at:new Date(current-60000).toISOString(),expires_at:new Date(current+3600000).toISOString(),created_by:"formal-owner",...expected,endpoint_base_url:"https://api.example.com/v1",provider_id:"fixture-provider",account_key_id:"account-1",credential_key_id:"credential-1"},{key_id:"transport-key",private_key:keys.privateKey});
  const credential:FormalOracleCredentialProvider={withCredential:async(_binding,callback)=>callback("runtime-secret-never-persist")};
  try {
    const output=await withPinnedFormalOracleTransportAuthority({transport_store:authorityStore,pinned_transport_registry_sha256:registry.registry_sha256,trusted_transport_public_keys:new Map([["transport-key",keys.publicKey]]),expected,callback:(authority)=>store.withSingleConsumeDispatchLeaseV2({run_sha256:input.run.run_sha256,expected_head:snapshot.head_pin,expected_checkpoint_sha256:snapshot.head_pin.checkpoint_sha256,intent:request.intent,request_envelope:request.envelope,prepared_provider_request:request.prepared,created_at:dispatchAt},async(lease,dispatchSnapshot)=>({sent:await sendFormalOracleSingleConsumeRequestV2({authority,dispatch_lease:lease,prepared:request.prepared,credential_provider:credential,expected_arm:request.intent.arm}),dispatchSnapshot}))});
    return {...output,response,canonical};
  } finally {senderBoundary.runtime=null;vi.useRealTimers();}
}

function successAuditV5(
  store: FormalOraclePreregistrationStoreV2,
  intent: RequestIntentV3,
  sent: Awaited<ReturnType<typeof sendV2Success>>["sent"],
  canonical: Buffer,
): RequestAttemptAuditV5 {
  const artifact=sent.response_artifact!,proof=artifact.proof,capture=sent.capture_artifact!;
  const started=capture.record.request_started_at,finished=capture.record.capture_finished_at;
  const audit:RequestAttemptAuditV5={schema_version:"oracle-gate-request-attempt-audit-v5",attempt_sha256:"0".repeat(64),intent_schema_version:"oracle-gate-request-intent-v3",intent_sha256:intent.intent_sha256,run_sha256:intent.run_sha256,preregistration_bundle_sha256:intent.preregistration_bundle_sha256,schedule_sha256:intent.schedule_sha256,execution_plan_sha256:intent.execution_plan_sha256,genesis_checkpoint_sha256:intent.genesis_checkpoint_sha256,execution_lineage_sha256:intent.execution_lineage_sha256,run_contract_schema_version:"oracle-gate-formal-run-contract-v2",execution_record_version:"formal-oracle-execution-records-v2",api_execution_allowed:false,request_id:intent.request_id,idempotency_key:intent.idempotency_key,attempt_ordinal:intent.attempt_ordinal,started_at:started,finished_at:finished,latency_ms:Date.parse(finished)-Date.parse(started),provider_id:"fixture-provider",provider_http_request_id:capture.record.provider_http_request_id,transport_capture_record_object_uri:store.transportCaptureRecordObjectUriV2(intent.run_sha256,capture.record.capture_record_sha256),transport_capture_record_sha256:capture.record.capture_record_sha256,response_http_status:200,response_content_type:"text/event-stream",response_headers_commitment_sha256:capture.record.response_headers_commitment_sha256,response_capture_status:"fetch_observed_complete_entity",completion_id:proof.response_id,request_envelope_sha256:intent.request_envelope_sha256,request_envelope_object_uri:intent.request_envelope_object_uri,provider_body_sha256:intent.provider_body_sha256,provider_body_object_uri:intent.provider_body_object_uri,fetch_observed_sse_object_uri:store.fetchObservedSseObjectUriV2(intent.run_sha256,proof.raw_sse_sha256),fetch_observed_sse_bytes_sha256:proof.raw_sse_sha256,fetch_observed_sse_byte_length:proof.raw_sse_byte_length,sse_derivation_object_uri:store.sseDerivationObjectUriV2(intent.run_sha256,proof.proof_sha256),sse_derivation_record_sha256:proof.proof_sha256,sse_parser_version:proof.schema_version,assistant_content_object_uri:store.assistantContentObjectUriV2(intent.run_sha256,proof.assistant_content_sha256),assistant_content_bytes_sha256:proof.assistant_content_sha256,assistant_content_byte_length:proof.assistant_content_byte_length,canonical_response_object_uri:store.canonicalResponseObjectUriV2(intent.run_sha256,createHash("sha256").update(canonical).digest("hex")),canonical_response_bytes_sha256:createHash("sha256").update(canonical).digest("hex"),canonical_response_commitment_sha256:hashPublicBlindResponse(oracleResponse()),invalid_response_record_object_uri:null,invalid_response_record_sha256:null,invalid_response_record_version:null,submitted_visuals:structuredClone(intent.visuals),model:intent.model,transport:"pi",temperature:0,max_input_tokens:intent.max_input_tokens,max_output_tokens:intent.max_output_tokens,timeout_ms:intent.timeout_ms,seed:intent.seed,cache_retention:"none",tools_policy:"none",outcome:"result_received",provider_response_received:true,stop_reason:"stop",error_code:null,error_message:null,usage:{input_tokens:100,output_tokens:20,total_tokens:120,cache_read_tokens:0,cache_write_tokens:0,reasoning_tokens:0},pricing_table_sha256:"4".repeat(64),cost_microunits:123,automatic_retry_allowed:false};
  audit.attempt_sha256=hashRequestAttemptAuditV5(audit);return audit;
}

function invalidAuditV5(
  store: FormalOraclePreregistrationStoreV2,
  intent: RequestIntentV3,
  sent: Awaited<ReturnType<typeof sendV2Success>>["sent"],
): RequestAttemptAuditV5 {
  const artifact=sent.invalid_response_artifact!,record=artifact.record,capture=sent.capture_artifact!;
  const started=capture.record.request_started_at,finished=capture.record.capture_finished_at;
  const audit:RequestAttemptAuditV5={schema_version:"oracle-gate-request-attempt-audit-v5",attempt_sha256:"0".repeat(64),intent_schema_version:"oracle-gate-request-intent-v3",intent_sha256:intent.intent_sha256,run_sha256:intent.run_sha256,preregistration_bundle_sha256:intent.preregistration_bundle_sha256,schedule_sha256:intent.schedule_sha256,execution_plan_sha256:intent.execution_plan_sha256,genesis_checkpoint_sha256:intent.genesis_checkpoint_sha256,execution_lineage_sha256:intent.execution_lineage_sha256,run_contract_schema_version:"oracle-gate-formal-run-contract-v2",execution_record_version:"formal-oracle-execution-records-v2",api_execution_allowed:false,request_id:intent.request_id,idempotency_key:intent.idempotency_key,attempt_ordinal:intent.attempt_ordinal,started_at:started,finished_at:finished,latency_ms:Date.parse(finished)-Date.parse(started),provider_id:"fixture-provider",provider_http_request_id:capture.record.provider_http_request_id,transport_capture_record_object_uri:store.transportCaptureRecordObjectUriV2(intent.run_sha256,capture.record.capture_record_sha256),transport_capture_record_sha256:capture.record.capture_record_sha256,response_http_status:capture.record.response_http_status,response_content_type:capture.record.response_content_type,response_headers_commitment_sha256:capture.record.response_headers_commitment_sha256,response_capture_status:"fetch_observed_complete_entity",completion_id:null,request_envelope_sha256:intent.request_envelope_sha256,request_envelope_object_uri:intent.request_envelope_object_uri,provider_body_sha256:intent.provider_body_sha256,provider_body_object_uri:intent.provider_body_object_uri,fetch_observed_sse_object_uri:store.fetchObservedSseObjectUriV2(intent.run_sha256,record.fetch_observed_sse_bytes_sha256),fetch_observed_sse_bytes_sha256:record.fetch_observed_sse_bytes_sha256,fetch_observed_sse_byte_length:record.fetch_observed_sse_byte_length,sse_derivation_object_uri:record.sse_derivation_record_sha256?store.sseDerivationObjectUriV2(intent.run_sha256,record.sse_derivation_record_sha256):null,sse_derivation_record_sha256:record.sse_derivation_record_sha256,sse_parser_version:record.sse_derivation_record_sha256?"formal-oracle-pi-response-stream-v1":null,assistant_content_object_uri:record.assistant_content_bytes_sha256?store.assistantContentObjectUriV2(intent.run_sha256,record.assistant_content_bytes_sha256):null,assistant_content_bytes_sha256:record.assistant_content_bytes_sha256,assistant_content_byte_length:record.assistant_content_byte_length,canonical_response_object_uri:null,canonical_response_bytes_sha256:null,canonical_response_commitment_sha256:null,invalid_response_record_object_uri:store.invalidResponseRecordObjectUriV2(intent.run_sha256,record.invalid_response_record_sha256),invalid_response_record_sha256:record.invalid_response_record_sha256,invalid_response_record_version:record.schema_version,submitted_visuals:structuredClone(intent.visuals),model:intent.model,transport:"pi",temperature:0,max_input_tokens:intent.max_input_tokens,max_output_tokens:intent.max_output_tokens,timeout_ms:intent.timeout_ms,seed:intent.seed,cache_retention:"none",tools_policy:"none",outcome:"invalid_response_received",provider_response_received:true,stop_reason:null,error_code:"invalid_response_received",error_message:null,usage:null,pricing_table_sha256:null,cost_microunits:null,automatic_retry_allowed:false};
  audit.attempt_sha256=hashRequestAttemptAuditV5(audit);return audit;
}

function committedV4(intent:RequestIntentV3,audit:RequestAttemptAuditV5,at:string):CommittedRequestV4{
  const value:CommittedRequestV4={schema_version:"oracle-gate-committed-request-v4",committed_request_sha256:"0".repeat(64),intent_schema_version:"oracle-gate-request-intent-v3",intent_sha256:intent.intent_sha256,attempt_schema_version:"oracle-gate-request-attempt-audit-v5",attempt_sha256:audit.attempt_sha256,run_sha256:intent.run_sha256,preregistration_bundle_sha256:intent.preregistration_bundle_sha256,schedule_sha256:intent.schedule_sha256,execution_plan_sha256:intent.execution_plan_sha256,genesis_checkpoint_sha256:intent.genesis_checkpoint_sha256,execution_lineage_sha256:intent.execution_lineage_sha256,run_contract_schema_version:"oracle-gate-formal-run-contract-v2",execution_record_version:"formal-oracle-execution-records-v2",api_execution_allowed:false,request_id:intent.request_id,idempotency_key:intent.idempotency_key,attempt_ordinal:intent.attempt_ordinal,canonical_response_object_uri:String(audit.canonical_response_object_uri),canonical_response_bytes_sha256:String(audit.canonical_response_bytes_sha256),canonical_response_commitment_sha256:String(audit.canonical_response_commitment_sha256),validator_version:ORACLE_GATE_RESPONSE_VALIDATOR_VERSION,transport_and_schema_verified_at:at,transport_and_schema_verified:true,semantic_review_status:"pending_external_blind_review",provider_stop_confirmed:true};value.committed_request_sha256=hashCommittedRequestV4(value);return value;
}

describe("FormalOraclePreregistrationStoreV2", () => {
  it("persists every preregistration body before create-once genesis and reloads under an external pin", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();
    const snapshot=await store.createPreregisteredGenesis(input);expect(snapshot.api_execution_allowed).toBe(false);expect(snapshot.execution_migration_status).toMatch(/^pending_/);
    expect((await new FormalOraclePreregistrationStoreV2(root).inspectPreregisteredGenesis(input.run.run_sha256,snapshot.head_pin)).preregistration_bundle).toEqual(input.preregistration_bundle);
    await expect(store.createPreregisteredGenesis(input)).rejects.toThrow(/create-once/);
    await expect(store.inspectPreregisteredGenesis(input.run.run_sha256,{...snapshot.head_pin,checkpoint_sha256:sha("old")})).rejects.toThrow(/pin/);
  });

  it("keeps create, reload, expected pin, and callback inside one owner-nonce lock", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();
    const pin={schema_version:"formal-oracle-head-pin-v1" as const,run_sha256:input.run.run_sha256,generation:0 as const,checkpoint_sha256:input.initial_checkpoint.checkpoint_sha256};
    let release!:()=>void;const held=new Promise<void>((resolve)=>{release=resolve;});let entered=false;
    const creating=store.createPreregisteredGenesisWithPinnedSnapshot(input,pin,async(snapshot)=>{entered=true;expect(snapshot.head_pin).toEqual(pin);expect(Object.isFrozen(snapshot)).toBe(true);await held;return snapshot.head_pin;});
    while(!entered) await new Promise((resolve)=>setTimeout(resolve,5));
    let inspected=false;const competing=new FormalOraclePreregistrationStoreV2(root).inspectPreregisteredGenesis(input.run.run_sha256,pin).then(()=>{inspected=true;});
    await new Promise((resolve)=>setTimeout(resolve,40));expect(inspected).toBe(false);release();expect(await creating).toEqual(pin);await competing;expect(inspected).toBe(true);
    const secondRoot=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(secondRoot);const secondStore=new FormalOraclePreregistrationStoreV2(secondRoot);
    await expect(secondStore.createPreregisteredGenesisWithPinnedSnapshot(input,{...pin,checkpoint_sha256:sha("stale")},async()=>null)).rejects.toThrow(/pin/);
    await expect(secondStore.inspectPreregisteredGenesis(input.run.run_sha256,pin)).rejects.toThrow();
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

  it("atomically migrates the sole genesis HEAD into the breaking V2 execution lineage and reloads it", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();
    const genesis=await store.createPreregisteredGenesis(input);
    const execution=await store.migratePreregisteredGenesisToExecutionV2({run_sha256:input.run.run_sha256,expected_genesis_head:genesis.head_pin,migrated_at:"2026-08-13T00:04:00.000Z"});
    expect(execution).toMatchObject({schema_version:"formal-oracle-execution-snapshot-v2",execution_status:"execution_v2_initialized_non_executable",api_execution_allowed:false});
    expect(execution.checkpoint).toMatchObject({schema_version:"oracle-gate-run-checkpoint-v2",generation:1,previous_checkpoint_sha256:input.initial_checkpoint.checkpoint_sha256,run_state:"SEALED_READY"});
    expect(execution.head_pin).toMatchObject({schema_version:"formal-oracle-head-pin-v2",generation:1,checkpoint_sha256:execution.checkpoint.checkpoint_sha256,head_record_sha256:execution.head.head_record_sha256});
    expect((await new FormalOraclePreregistrationStoreV2(root).inspectExecutionV2(input.run.run_sha256,execution.head_pin)).migration).toEqual(execution.migration);
    await expect(store.inspectPreregisteredGenesis(input.run.run_sha256,genesis.head_pin)).rejects.toThrow(/HEAD|schema|status|pin/);
    await expect(store.migratePreregisteredGenesisToExecutionV2({run_sha256:input.run.run_sha256,expected_genesis_head:genesis.head_pin,migrated_at:"2026-08-13T00:05:00.000Z"})).rejects.toThrow(/HEAD|schema|status|pin/);
  });

  it("allows only one competing migration and rejects stale or replaced execution objects on reboot", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const first=new FormalOraclePreregistrationStoreV2(root),second=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();
    const genesis=await first.createPreregisteredGenesis(input);const request={run_sha256:input.run.run_sha256,expected_genesis_head:genesis.head_pin,migrated_at:"2026-08-13T00:04:00.000Z"};
    const results=await Promise.allSettled([first.migratePreregisteredGenesisToExecutionV2(request),second.migratePreregisteredGenesisToExecutionV2(request)]);
    expect(results.filter((item)=>item.status==="fulfilled")).toHaveLength(1);expect(results.filter((item)=>item.status==="rejected")).toHaveLength(1);
    const fulfilled=results.find((item)=>item.status==="fulfilled");if(!fulfilled||fulfilled.status!=="fulfilled")throw new Error("migration winner missing");const execution=fulfilled.value;
    await expect(first.inspectExecutionV2(input.run.run_sha256,{...execution.head_pin,head_record_sha256:sha("stale-head")})).rejects.toThrow(/pin|HEAD/);
    const migrationPath=join(root,uri,"runs",input.run.run_sha256,"objects","execution-migrations",execution.migration.migration_sha256,"migration.json");
    const bytes=await readFile(migrationPath);const changed=Buffer.from(bytes);changed[changed.length-2]=changed[changed.length-2]===48?49:48;await writeFile(migrationPath,changed);
    await expect(new FormalOraclePreregistrationStoreV2(root).inspectExecutionV2(input.run.run_sha256,execution.head_pin)).rejects.toThrow(/migration|JSON|内容地址/);
  });

  it("rejects a fully rehashed HEAD whose execution status contradicts its durable checkpoint", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();
    const genesis=await store.createPreregisteredGenesis(input);const execution=await store.migratePreregisteredGenesisToExecutionV2({run_sha256:input.run.run_sha256,expected_genesis_head:genesis.head_pin,migrated_at:"2026-08-13T00:04:00.000Z"});
    const headPath=join(root,uri,"runs",input.run.run_sha256,"HEAD"),head={...structuredClone(execution.head),execution_status:"execution_v2_terminal_non_executable" as const,head_record_sha256:"0".repeat(64)};
    head.head_record_sha256=hashFormalOracleRunHeadV2(head);
    await writeFile(headPath,privateCanonicalJsonBytes(head));
    await expect(new FormalOraclePreregistrationStoreV2(root).inspectExecutionV2(input.run.run_sha256,{...execution.head_pin,head_record_sha256:head.head_record_sha256})).rejects.toThrow(/status.*checkpoint|checkpoint.*status/);
  });

  it("snapshots migration pins and timestamps before locking without executing getters", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();const genesis=await store.createPreregisteredGenesis(input);let hits=0;
    const valid={run_sha256:input.run.run_sha256,expected_genesis_head:genesis.head_pin,migrated_at:"2026-08-13T00:04:00.000Z"};
    const hostile=Object.create(Object.prototype,Object.getOwnPropertyDescriptors(valid));Object.defineProperty(hostile,"expected_genesis_head",{enumerable:true,get(){hits++;return genesis.head_pin;}});
    await expect(store.migratePreregisteredGenesisToExecutionV2(hostile)).rejects.toThrow(/accessor|plain/);expect(hits).toBe(0);
  });

  it("commits V3 intent, a durable no-result V5 receipt, and a new-ordinal retry across reboot", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();
    const genesis=await store.createPreregisteredGenesis(input);
    let snapshot=await store.migratePreregisteredGenesisToExecutionV2({run_sha256:input.run.run_sha256,expected_genesis_head:genesis.head_pin,migrated_at:"2026-08-13T00:04:00.000Z"});
    const first=intentV3(input,store,snapshot);
    snapshot=await store.commitDispatchIntentV2({run_sha256:input.run.run_sha256,expected_head:snapshot.head_pin,expected_checkpoint_sha256:snapshot.head_pin.checkpoint_sha256,intent:first.intent,request_envelope:first.envelope,prepared_provider_request:first.prepared,created_at:"2026-08-13T00:06:00.000Z"});
    expect(snapshot.checkpoint.entries[0]).toMatchObject({state:"DISPATCH_INTENT_COMMITTED",attempts_used:0,active_intent_sha256:first.intent.intent_sha256});
    const audit=noResultAuditV5(first.intent,true);
    snapshot=await store.commitAttemptAuditV2({run_sha256:input.run.run_sha256,expected_head:snapshot.head_pin,expected_checkpoint_sha256:snapshot.head_pin.checkpoint_sha256,audit,created_at:"2026-08-13T00:09:00.000Z"});
    expect(snapshot.checkpoint.entries[0]).toMatchObject({state:"RECEIPT_COMMITTED",attempts_used:1,latest_attempt_audit_sha256:audit.attempt_sha256});
    snapshot=await store.markRetryReadyV2({run_sha256:input.run.run_sha256,expected_head:snapshot.head_pin,expected_checkpoint_sha256:snapshot.head_pin.checkpoint_sha256,request_id:first.intent.request_id,created_at:"2026-08-13T00:10:00.000Z"});
    expect(snapshot.checkpoint.entries[0]).toMatchObject({state:"RETRY_READY",attempts_used:1});
    const rebooted=new FormalOraclePreregistrationStoreV2(root);
    expect((await rebooted.inspectExecutionV2(input.run.run_sha256,snapshot.head_pin)).checkpoint.entries[0].state).toBe("RETRY_READY");
    const second=intentV3(input,rebooted,snapshot,0,2,"2026-08-13T00:11:00.000Z");
    const dispatched=await rebooted.commitDispatchIntentV2({run_sha256:input.run.run_sha256,expected_head:snapshot.head_pin,expected_checkpoint_sha256:snapshot.head_pin.checkpoint_sha256,intent:second.intent,request_envelope:second.envelope,prepared_provider_request:second.prepared,created_at:"2026-08-13T00:12:00.000Z"});
    expect(dispatched.checkpoint.entries[0]).toMatchObject({state:"DISPATCH_INTENT_COMMITTED",attempts_used:1,active_intent_sha256:second.intent.intent_sha256,latest_attempt_audit_sha256:audit.attempt_sha256});
    await expect(store.commitDispatchIntentV2({run_sha256:input.run.run_sha256,expected_head:snapshot.head_pin,expected_checkpoint_sha256:snapshot.head_pin.checkpoint_sha256,intent:second.intent,request_envelope:second.envelope,prepared_provider_request:second.prepared,created_at:"2026-08-13T00:13:00.000Z"})).rejects.toThrow(/HEAD|pin|CAS/);
  }, 20_000);

  it("mints a callback-only V2 lease only after the durable intent HEAD CAS and consumes it once", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();
    const genesis=await store.createPreregisteredGenesis(input);const migrated=await store.migratePreregisteredGenesisToExecutionV2({run_sha256:input.run.run_sha256,expected_genesis_head:genesis.head_pin,migrated_at:"2026-08-13T00:04:00.000Z"});
    const request=intentV3(input,store,migrated);let captured: unknown;
    const value=await store.withSingleConsumeDispatchLeaseV2({run_sha256:input.run.run_sha256,expected_head:migrated.head_pin,expected_checkpoint_sha256:migrated.head_pin.checkpoint_sha256,intent:request.intent,request_envelope:request.envelope,prepared_provider_request:request.prepared,created_at:"2026-08-13T00:06:00.000Z"},async(lease,snapshot)=>{captured=lease;const {consumeFormalOracleSingleConsumeDispatchLeaseV2}=await import("./formalOraclePreregistrationStoreV2.js");const receipt=consumeFormalOracleSingleConsumeDispatchLeaseV2(lease);expect(receipt).toMatchObject({stage:"durable_dispatch_intent_v2_lease_consumed",intent_sha256:request.intent.intent_sha256});await expect(Promise.resolve().then(()=>consumeFormalOracleSingleConsumeDispatchLeaseV2(lease))).rejects.toThrow(/消费|无效/);return snapshot.head_pin;});
    expect(value.generation).toBe(2);
    const {consumeFormalOracleSingleConsumeDispatchLeaseV2}=await import("./formalOraclePreregistrationStoreV2.js");
    await expect(Promise.resolve().then(()=>consumeFormalOracleSingleConsumeDispatchLeaseV2(captured as never))).rejects.toThrow(/无效|消费/);
  });

  it("snapshots completed-gate and dispatch-lease inputs before I/O without getter or async mutation drift", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();
    const genesis=await store.createPreregisteredGenesis(input);const migrated=await store.migratePreregisteredGenesisToExecutionV2({run_sha256:input.run.run_sha256,expected_genesis_head:genesis.head_pin,migrated_at:"2026-08-13T00:04:00.000Z"});let hits=0;
    const hostile=Object.create(Object.prototype,Object.getOwnPropertyDescriptors({run_sha256:input.run.run_sha256,expected_head:migrated.head_pin,callback:async()=>null}));
    Object.defineProperty(hostile,"run_sha256",{enumerable:true,get(){hits++;return input.run.run_sha256;}});
    await expect(store.withPinnedCompletedRunV2(hostile)).rejects.toThrow(/accessor|plain/);expect(hits).toBe(0);
    const request=intentV3(input,store,migrated),dispatch={run_sha256:input.run.run_sha256,expected_head:migrated.head_pin,expected_checkpoint_sha256:migrated.head_pin.checkpoint_sha256,intent:request.intent,request_envelope:request.envelope,prepared_provider_request:request.prepared,created_at:"2026-08-13T00:06:00.000Z"};
    const original={request_id:request.intent.request_id,intent_sha256:request.intent.intent_sha256,provider_body_sha256:request.intent.provider_body_sha256};
    const pending=store.withSingleConsumeDispatchLeaseV2(dispatch,async(lease)=>({request_id:lease.request_id,intent_sha256:lease.intent_sha256,provider_body_sha256:lease.provider_body_sha256}));
    (dispatch.intent as unknown as Record<string,unknown>).request_id="REQ-MUTATED";
    (dispatch.intent as unknown as Record<string,unknown>).intent_sha256=sha("mutated-intent");
    (dispatch.intent as unknown as Record<string,unknown>).provider_body_sha256=sha("mutated-body");
    expect(await pending).toEqual(original);
  });

  it("rejects V2 sender input accessors before reading any callback capability", async () => {
    let hits=0;const hostile=Object.create(Object.prototype,Object.getOwnPropertyDescriptors({authority:{},dispatch_lease:{},prepared:{},credential_provider:{withCredential:async()=>null},expected_arm:"transcript_only"}));
    Object.defineProperty(hostile,"authority",{enumerable:true,get(){hits++;return {};}});
    expect(()=>sendFormalOracleSingleConsumeRequestV2(hostile)).toThrow(/accessor|plain/);expect(hits).toBe(0);
  });

  it("persists an authoritative V2 sender capture, re-derives A/B/C/D, and commits schema validation after reboot", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();
    const genesis=await store.createPreregisteredGenesis(input);let snapshot=await store.migratePreregisteredGenesisToExecutionV2({run_sha256:input.run.run_sha256,expected_genesis_head:genesis.head_pin,migrated_at:"2026-08-13T00:04:00.000Z"});
    const request=intentV3(input,store,snapshot);const result=await sendV2Success(root,store,input,snapshot,request);
    expect(result.sent).toMatchObject({request_started:true,provider_result_cross_check_status:"strict_complete_stop_cross_checked",api_execution_allowed:false});
    const audit=successAuditV5(store,request.intent,result.sent,result.canonical);
    snapshot=await store.commitAttemptAuditV2({run_sha256:input.run.run_sha256,expected_head:result.dispatchSnapshot.head_pin,expected_checkpoint_sha256:result.dispatchSnapshot.head_pin.checkpoint_sha256,audit,response_artifact:result.sent.response_artifact!,transport_capture_artifact:result.sent.capture_artifact!,parsed_response:result.response,created_at:"2026-08-13T00:08:00.000Z"});
    expect(snapshot.checkpoint.entries[0]).toMatchObject({state:"RECEIPT_COMMITTED",attempts_used:1,latest_attempt_audit_sha256:audit.attempt_sha256});
    const commit=committedV4(request.intent,audit,"2026-08-13T00:09:00.000Z");
    snapshot=await new FormalOraclePreregistrationStoreV2(root).commitSchemaValidatedRequestV2({run_sha256:input.run.run_sha256,expected_head:snapshot.head_pin,expected_checkpoint_sha256:snapshot.head_pin.checkpoint_sha256,request_id:request.intent.request_id,committed_request:commit,created_at:"2026-08-13T00:10:00.000Z"});
    expect(snapshot.checkpoint.entries[0]).toMatchObject({state:"SCHEMA_VALIDATED_COMMITTED",committed_request_sha256:commit.committed_request_sha256});
    expect((await new FormalOraclePreregistrationStoreV2(root).inspectExecutionV2(input.run.run_sha256,snapshot.head_pin)).checkpoint.entries[0].state).toBe("SCHEMA_VALIDATED_COMMITTED");
  },20_000);

  it("fails closed on a complete invalid V2 response, re-derives it after reboot, and never exposes retry", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();
    const genesis=await store.createPreregisteredGenesis(input);let snapshot=await store.migratePreregisteredGenesisToExecutionV2({run_sha256:input.run.run_sha256,expected_genesis_head:genesis.head_pin,migrated_at:"2026-08-13T00:04:00.000Z"});
    const request=intentV3(input,store,snapshot);const result=await sendV2Success(root,store,input,snapshot,request,77,"2026-08-13T00:06:00.000Z","2026-08-13T00:06:30.000Z",new TextEncoder().encode("data: {}\n\n"));
    expect(result.sent).toMatchObject({request_started:true,response_artifact:null,error_code:"transport_complete_entity_invalid",api_execution_allowed:false});
    expect(result.sent.invalid_response_artifact?.record.failure_stage).toBe("sse_protocol_invalid");
    const audit=invalidAuditV5(store,request.intent,result.sent);
    snapshot=await store.commitAttemptAuditV2({run_sha256:input.run.run_sha256,expected_head:result.dispatchSnapshot.head_pin,expected_checkpoint_sha256:result.dispatchSnapshot.head_pin.checkpoint_sha256,audit,invalid_response_artifact:result.sent.invalid_response_artifact!,transport_capture_artifact:result.sent.capture_artifact!,created_at:"2026-08-13T00:08:00.000Z"});
    expect(snapshot).toMatchObject({execution_status:"execution_v2_terminal_non_executable",checkpoint:{run_state:"FAILED_CLOSED",terminal_reason_sha256:expect.any(String)}});
    expect(snapshot.checkpoint.entries[0]).toMatchObject({state:"FAILED_CLOSED",resume_action:"block_failed",attempts_used:1});
    const rebooted=new FormalOraclePreregistrationStoreV2(root);expect((await rebooted.inspectExecutionV2(input.run.run_sha256,snapshot.head_pin)).head_pin).toEqual(snapshot.head_pin);
    await expect(rebooted.markRetryReadyV2({run_sha256:input.run.run_sha256,expected_head:snapshot.head_pin,expected_checkpoint_sha256:snapshot.head_pin.checkpoint_sha256,request_id:request.intent.request_id,created_at:"2026-08-13T00:09:00.000Z"})).rejects.toThrow(/RECEIPT_COMMITTED/);
  },20_000);

  it("completes all 12 V2 requests and lends only a callback-scoped revalidated completed chain", async () => {
    const root=await mkdtemp(join(tmpdir(),"oracle-prereg-v2-"));roots.push(root);const store=new FormalOraclePreregistrationStoreV2(root);const input=makeInput();
    const genesis=await store.createPreregisteredGenesis(input);let snapshot=await store.migratePreregisteredGenesisToExecutionV2({run_sha256:input.run.run_sha256,expected_genesis_head:genesis.head_pin,migrated_at:"2026-08-13T00:04:00.000Z"});
    const epoch=Date.parse("2026-08-13T00:00:00.000Z"),at=(minute:number)=>new Date(epoch+minute*60000).toISOString();
    for(let index=0;index<input.execution_plan.items.length;index+=1){
      const minute=5+index*5,request=intentV3(input,store,snapshot,index,1,at(minute));
      const result=await sendV2Success(root,store,input,snapshot,request,index+100,at(minute+1),new Date(epoch+(minute+1)*60000+30000).toISOString());
      const audit=successAuditV5(store,request.intent,result.sent,result.canonical);
      snapshot=await store.commitAttemptAuditV2({run_sha256:input.run.run_sha256,expected_head:result.dispatchSnapshot.head_pin,expected_checkpoint_sha256:result.dispatchSnapshot.head_pin.checkpoint_sha256,audit,response_artifact:result.sent.response_artifact!,transport_capture_artifact:result.sent.capture_artifact!,parsed_response:result.response,created_at:at(minute+2)});
      const commit=committedV4(request.intent,audit,at(minute+3));
      snapshot=await store.commitSchemaValidatedRequestV2({run_sha256:input.run.run_sha256,expected_head:snapshot.head_pin,expected_checkpoint_sha256:snapshot.head_pin.checkpoint_sha256,request_id:request.intent.request_id,committed_request:commit,created_at:at(minute+4)});
      expect(snapshot.checkpoint.entries[index]).toMatchObject({state:"SCHEMA_VALIDATED_COMMITTED",attempts_used:1,committed_request_sha256:commit.committed_request_sha256});
    }
    snapshot=await store.completeRunV2({run_sha256:input.run.run_sha256,expected_head:snapshot.head_pin,expected_checkpoint_sha256:snapshot.head_pin.checkpoint_sha256,created_at:at(66)});
    expect(snapshot).toMatchObject({execution_status:"execution_v2_terminal_non_executable",checkpoint:{run_state:"EXECUTION_COMPLETE",terminal_reason_sha256:null}});
    let captured: unknown;
    const counts=await new FormalOraclePreregistrationStoreV2(root).withPinnedCompletedRunV2({run_sha256:input.run.run_sha256,expected_head:snapshot.head_pin,callback:async(capability)=>{
      captured=capability;assertActiveFormalOracleCompletedRunCapabilityV2(capability);
      expect(Object.isFrozen(capability.completed_run)).toBe(true);
      expect(capability.completed_run.checkpoints).toHaveLength(38);
      expect(capability.completed_run.intents).toHaveLength(12);
      expect(capability.completed_run.attempts).toHaveLength(12);
      expect(capability.completed_run.committed_requests).toHaveLength(12);
      expect(capability.completed_run.canonical_responses).toHaveLength(12);
      expect(capability.completed_run.canonical_responses.map((item)=>item.schedule_index)).toEqual([...Array(12).keys()]);
      expect(capability.completed_run.api_execution_allowed).toBe(false);
      return [capability.completed_run.intents.length,capability.completed_run.committed_requests.length] as const;
    }});
    expect(counts).toEqual([12,12]);
    expect(()=>assertActiveFormalOracleCompletedRunCapabilityV2(captured as never)).toThrow(/无效|过期|伪造/);
  },120_000);
});
