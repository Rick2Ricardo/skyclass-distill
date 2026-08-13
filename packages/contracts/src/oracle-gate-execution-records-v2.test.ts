import { describe, expect, it } from "vitest";
import {
  hashCommittedRequestV4,
  hashFormalOracleExecutionLineageV2,
  hashFormalOracleTerminalReasonV2,
  hashPublicBlindResponse,
  hashRequestAttemptAuditV5,
  hashRequestIntentV3,
  validateCommittedRequestV4AgainstAttemptV5,
  validateFormalOracleTerminalReasonV2,
  validateRequestAttemptAuditV5,
  validateRequestAttemptAuditV5AgainstIntentV3,
  validateRequestIntentV3,
  type CommittedRequestV4,
  type FormalOracleExecutionRecordRootsV2,
  type FormalOracleTerminalReasonV2,
  type RequestAttemptAuditV5,
  type RequestIntentV3,
} from "./index.js";

const sha = (character: string): string => character.repeat(64).slice(0, 64);
const roots = (): FormalOracleExecutionRecordRootsV2 => {
  const input = { run_sha256: sha("1"), preregistration_bundle_sha256: sha("2"), schedule_sha256: sha("3"),
    execution_plan_sha256: sha("4"), genesis_checkpoint_sha256: sha("5") };
  return { ...input, execution_lineage_sha256: hashFormalOracleExecutionLineageV2(input),
    run_contract_schema_version: "oracle-gate-formal-run-contract-v2", execution_record_version: "formal-oracle-execution-records-v2",
    api_execution_allowed: false };
};

function intent(): RequestIntentV3 {
  const value: RequestIntentV3 = {
    schema_version:"oracle-gate-request-intent-v3",intent_sha256:sha("0"),...roots(),request_id:"REQ-1",idempotency_key:sha("a"),schedule_index:0,
    attempt_ordinal:1,prepared_at:"2026-08-13T00:00:00.000Z",case_id:"CASE-1",arm:"transcript_only",seed:17,model:"fixture-model",
    request_envelope_sha256:sha("6"),request_envelope_object_uri:"objects/request-envelope.json",provider_body_sha256:sha("7"),provider_body_object_uri:"objects/provider-body.json",
    provider_body_profile:"pi-openai-completions-fetch-boundary-v1",provider_body_dispatch_status:"pending_local_pi_fetch_boundary_proof_non_executable",
    prepared_adapter_version:"formal-oracle-pi-fetch-boundary-adapter-v1",provider_token_field:"max_completion_tokens",system_prompt_sha256:sha("8"),
    user_prompt_sha256:sha("9"),output_schema_sha256:sha("b"),visuals:[],transport:"pi",temperature:0,max_input_tokens:8192,
    max_output_tokens:2048,timeout_ms:120000,max_attempts:2,cache_retention:"none",tools_policy:"none",
  };
  value.intent_sha256=hashRequestIntentV3(value);return value;
}

function audit(request=intent()):RequestAttemptAuditV5 {
  const value:RequestAttemptAuditV5={
    schema_version:"oracle-gate-request-attempt-audit-v5",attempt_sha256:sha("0"),...roots(),intent_schema_version:"oracle-gate-request-intent-v3",intent_sha256:request.intent_sha256,
    request_id:request.request_id,idempotency_key:request.idempotency_key,attempt_ordinal:request.attempt_ordinal,started_at:"2026-08-13T00:00:01.000Z",finished_at:"2026-08-13T00:00:02.000Z",latency_ms:1000,
    provider_id:"provider",provider_http_request_id:"provider-http",transport_capture_record_object_uri:`objects/${sha("c")}/capture.json`,transport_capture_record_sha256:sha("c"),
    response_http_status:200,response_content_type:"text/event-stream",response_headers_commitment_sha256:sha("d"),response_capture_status:"fetch_observed_complete_entity",completion_id:"completion-1",
    request_envelope_sha256:request.request_envelope_sha256,request_envelope_object_uri:request.request_envelope_object_uri,provider_body_sha256:request.provider_body_sha256,provider_body_object_uri:request.provider_body_object_uri,
    fetch_observed_sse_object_uri:`objects/${sha("e")}/response.sse`,fetch_observed_sse_bytes_sha256:sha("e"),fetch_observed_sse_byte_length:100,
    sse_derivation_object_uri:`objects/${sha("f")}/derivation.json`,sse_derivation_record_sha256:sha("f"),sse_parser_version:"formal-oracle-pi-response-stream-v1",
    assistant_content_object_uri:`objects/${sha("a")}/assistant-content.utf8`,assistant_content_bytes_sha256:sha("a"),assistant_content_byte_length:50,
    canonical_response_object_uri:`objects/${sha("b")}/canonical-response.json`,canonical_response_bytes_sha256:sha("b"),canonical_response_commitment_sha256:hashPublicBlindResponse({schema_version:"fixture-v1"}),
    invalid_response_record_object_uri:null,invalid_response_record_sha256:null,invalid_response_record_version:null,submitted_visuals:request.visuals,model:request.model,transport:"pi",temperature:0,
    max_input_tokens:request.max_input_tokens,max_output_tokens:request.max_output_tokens,timeout_ms:request.timeout_ms,seed:request.seed,cache_retention:"none",tools_policy:"none",
    outcome:"result_received",provider_response_received:true,stop_reason:"stop",error_code:null,error_message:null,usage:{input_tokens:100,output_tokens:20,total_tokens:120,cache_read_tokens:0,cache_write_tokens:0,reasoning_tokens:0},
    pricing_table_sha256:sha("c"),cost_microunits:10,automatic_retry_allowed:false,
  };value.attempt_sha256=hashRequestAttemptAuditV5(value);return value;
}

function committed(request=intent(),attempt=audit(request)):CommittedRequestV4 {
  const value:CommittedRequestV4={schema_version:"oracle-gate-committed-request-v4",committed_request_sha256:sha("0"),...roots(),intent_schema_version:"oracle-gate-request-intent-v3",intent_sha256:request.intent_sha256,
    attempt_schema_version:"oracle-gate-request-attempt-audit-v5",attempt_sha256:attempt.attempt_sha256,request_id:request.request_id,idempotency_key:request.idempotency_key,attempt_ordinal:1,
    canonical_response_object_uri:String(attempt.canonical_response_object_uri),canonical_response_bytes_sha256:String(attempt.canonical_response_bytes_sha256),canonical_response_commitment_sha256:String(attempt.canonical_response_commitment_sha256),
    validator_version:"oracle-gate-response-structural-validator-v1",transport_and_schema_verified_at:"2026-08-13T00:00:03.000Z",transport_and_schema_verified:true,semantic_review_status:"pending_external_blind_review",provider_stop_confirmed:true};
  value.committed_request_sha256=hashCommittedRequestV4(value);return value;
}

describe("Formal Oracle execution v2 lineage records",()=>{
  it("validates V3 intent, V5 audit and V4 commit under one breaking execution lineage",()=>{const i=intent(),a=audit(i),c=committed(i,a);expect(validateRequestIntentV3(i)).toEqual({valid:true,issues:[]});expect(validateRequestAttemptAuditV5(a)).toEqual({valid:true,issues:[]});expect(validateRequestAttemptAuditV5AgainstIntentV3(i,a)).toEqual({valid:true,issues:[]});expect(validateCommittedRequestV4AgainstAttemptV5(i,a,c)).toEqual({valid:true,issues:[]});});
  it("rejects legacy records, lineage drift and response/provenance mixing after full rehash",()=>{const i=intent(),a=audit(i),c=committed(i,a);expect(validateRequestIntentV3({...i,schema_version:"oracle-gate-request-intent-v2"}).valid).toBe(false);a.preregistration_bundle_sha256=sha("f");a.attempt_sha256=hashRequestAttemptAuditV5(a);expect(validateRequestAttemptAuditV5AgainstIntentV3(i,a).valid).toBe(false);const fresh=audit(i);c.attempt_sha256=sha("f");c.committed_request_sha256=hashCommittedRequestV4(c);expect(validateCommittedRequestV4AgainstAttemptV5(i,fresh,c).valid).toBe(false);});
  it("binds terminal reasons to V5 attempts with a separate domain",()=>{const a=audit(),reason:FormalOracleTerminalReasonV2={schema_version:"formal-oracle-terminal-reason-v2",terminal_reason_sha256:sha("0"),...roots(),request_id:a.request_id,reason_code:"ambiguous_unknown_attempt",source_attempt_schema_version:"oracle-gate-request-attempt-audit-v5",source_attempt_sha256:a.attempt_sha256,detail_sha256:sha("f"),created_at:"2026-08-13T00:00:03.000Z"};reason.terminal_reason_sha256=hashFormalOracleTerminalReasonV2(reason);expect(validateFormalOracleTerminalReasonV2(reason)).toEqual({valid:true,issues:[]});expect(validateFormalOracleTerminalReasonV2({...reason,source_attempt_schema_version:"oracle-gate-request-attempt-audit-v4"}).valid).toBe(false);});
  it("rejects accessors before execution",()=>{const i=intent();let hits=0;const hostile=Object.create(Object.prototype,Object.getOwnPropertyDescriptors(i));Object.defineProperty(hostile,"request_id",{enumerable:true,get(){hits++;return i.request_id;}});expect(validateRequestIntentV3(hostile).valid).toBe(false);expect(hits).toBe(0);});
});
