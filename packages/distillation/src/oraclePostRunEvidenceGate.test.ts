import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalFormalOracleBlindIdPreimage,
  hashFormalOracleBlindingSecretCommitment,
  hashOracleGatePublicEvidenceDerivationPolicyV2,
  hashPublicBlindResponse,
  validateOracleGateEvidenceV2AgainstBlindArtifacts,
  type OracleGatePublicEvidenceDerivationPolicyV2,
  type OracleGateResponseV1,
  type SignedGoldDataset,
} from "../../contracts/src/index.js";
import type { FormalOracleCompletedTransportSchemaRunV1 } from "../../store/src/formalOracleRunStore.js";
import { deriveNonAuthoritativeFormalOraclePostRunEvidenceRecordsV1 } from "./oraclePostRunEvidenceGate.js";

const sha = (character: string): string => character.repeat(64);
const secret = new TextEncoder().encode("0123456789abcdef0123456789abcdef");
const arms = ["transcript_only", "static_final_board", "uniform_frame", "oracle_delta"] as const;

function policy(): OracleGatePublicEvidenceDerivationPolicyV2 {
  const value: OracleGatePublicEvidenceDerivationPolicyV2 = {
    schema_version: "oracle-gate-public-evidence-derivation-policy-v2", public_evidence_derivation_policy_sha256: sha("0"),
    claim_projection_version: "response-v1-fixed-json-pointer-assertion-slots-v1",
    claim_source_paths: ["/observed_board_actions/*/operation","/observed_board_actions/*/content","/observed_board_actions/*/region","/generalized_teaching_capability/name","/generalized_teaching_capability/mechanism","/generalized_teaching_capability/action_program/*","/evidence_claims/*/claim"],
    uncertainty_policy: "not_a_scored_claim", speech_segmentation_version: "one_verified_selected_transcript_unit_per_case-v1",
    speech_gold_status: "context_not_gold", board_event_renderer_version: "signed-gold-final-event-semantic-projection-v1",
    board_event_projection: ["operation","semantic_label","region","relation","modification"],
    eligible_evidence_policy: "verified_transcript_plus_all_signed_gold_final_events-v1", board_edit_denominator_policy: "all_signed_gold_final_events-v1",
    temporal_pair_policy: "all_ordered_signed_gold_final_event_pairs-v1", single_event_temporal_policy: "metric_not_applicable_not_global_block-v1",
    public_reblinding_scheme: "opaque-item-local-id-uniqueness-only-v1", created_at: "2026-08-13T00:00:00.000Z", api_execution_allowed: false,
  };
  value.public_evidence_derivation_policy_sha256 = hashOracleGatePublicEvidenceDerivationPolicyV2(value); return value;
}

function response(index: number): OracleGateResponseV1 {
  return { schema_version: "teacher-evidence-response-v1", observed_board_actions: [{ sequence_index: 1, operation: "add", content: `Visible mark ${index}`, region: "upper board" }],
    generalized_teaching_capability: { name: `Capability ${index}`, mechanism: `Mechanism ${index}`, action_program: [`Program ${index}`] },
    evidence_claims: [{ claim: `Claim ${index}`, evidence_slot: "transcript" }], uncertainties: [] };
}

function fixture() {
  const runSha = sha("a"), datasetSha = sha("b"), manifestSha = sha("c"), specSha = sha("d"), scheduleSha = sha("e"), planSha = sha("f");
  const structural = arms.map((arm, index) => ({ request_id: `request-${index}`, idempotency_key: String(index + 1).repeat(64), case_id: "case-1",
    package_id: "package-1", group_id: "group-1", source_video_id: "video-1", arm, seed: 7 }));
  const responses = arms.map((_, schedule_index) => { const value=response(schedule_index);return { request_id:`request-${schedule_index}`,schedule_index,
    canonical_response_bytes_sha256:sha(String(schedule_index+1)),canonical_response_commitment_sha256:hashPublicBlindResponse(value as unknown as Record<string,unknown>),response:value as unknown as Record<string,unknown>};});
  const completed = { schema_version:"formal-oracle-completed-transport-schema-run-v1",status:"completed_transport_and_schema_chain_revalidated",
    run:{run_sha256:runSha,blinding_secret_commitment_sha256:hashFormalOracleBlindingSecretCommitment(secret),schedule_sha256:scheduleSha,
      execution_plan_sha256:planSha,ledger_registry_sha256:sha("1"),signed_gold_dataset_sha256:datasetSha,formal_input_manifest_sha256:manifestSha,
      formal_spec_sha256:specSha,media_attestation_sha256:sha("2"),speech_attestation_sha256:sha("3")},
    formal_spec:{spec_sha256:specSha,evaluation:{rubric_version:"rubric-v1",rubric_sha256:sha("4")}},structural_schedule:structural,
    execution_plan:{execution_plan_sha256:planSha},head_pin:{schema_version:"formal-oracle-head-pin-v1",run_sha256:runSha,generation:13,checkpoint_sha256:sha("5")},
    checkpoints:[{created_at:"2026-08-13T01:00:00.000Z"}],intents:[],attempts:[],committed_requests:[],canonical_responses:responses,api_execution_allowed:false } as unknown as FormalOracleCompletedTransportSchemaRunV1;
  const event = (id:string,label:string,time:number) => ({ event_id:id,source_event_refs:[`source-${id}`],operation:"ADD" as const,time:{start:time,end:time+1},semantic_label:label,region:null,relation:null,modification:null });
  const dataset = { dataset_sha256:datasetSha,packages:[{package_id:"package-1",source_video_id:"video-1",groups:[{group_id:"group-1",final_events:[event("event-1","draw axis",1),event("event-2","mark vector",2)]}]}] } as unknown as SignedGoldDataset;
  const manifest = { manifest_sha256:manifestSha,sources:[{source_video_id:"video-1",teacher_id:"teacher-1"}],cases:[{case_id:"case-1",package_id:"package-1",group_id:"group-1",source_video_id:"video-1",event_ids:["event-1","event-2"]}] } as never;
  const byte = { cases:[{case_id:"case-1",source_video_id:"video-1",speech:{selected_transcript:"Teacher explains the vector.",selected_transcript_sha256:sha("6"),selected_transcript_byte_length:28}}] } as never;
  return { completed, dataset, manifest, byte, p:policy() };
}

describe("post-run evidence deterministic source records", () => {
  it("derives HMAC blind IDs and source-resolved v2 evidence without ratings", () => {
    const value=fixture(),records=deriveNonAuthoritativeFormalOraclePostRunEvidenceRecordsV1({policy:value.p,completed_run:value.completed,
      manifest:value.manifest,byte_preflight:value.byte,dataset:value.dataset,registry_sha256:sha("1"),frame_preflight_sha256:sha("2"),
      inventory_sha256:sha("3"),blinding_secret:secret,derived_at:"2026-08-13T02:00:00.000Z"});
    const expected=`B-${createHmac("sha256",secret).update(canonicalFormalOracleBlindIdPreimage({run_sha256:sha("a"),request_id:"request-0"})).digest("hex")}`;
    expect(records.public_responses.items[0].blind_id).toBe(expected);
    expect(records.public_evidence.items[0].evidence_units.map(item=>item.content)).toEqual([
      "Teacher explains the vector.",
      '{"modification":null,"operation":"ADD","region":null,"relation":null,"semantic_label":"draw axis"}',
      '{"modification":null,"operation":"ADD","region":null,"relation":null,"semantic_label":"mark vector"}',
    ]);
    expect(records.private_derivation.items[0].evidence_sources.map(item=>item.source_json_pointer)).toEqual([
      "/byte_preflight/cases/0/speech/selected_transcript",
      "/signed_gold_dataset/packages/0/groups/0/final_events/0",
      "/signed_gold_dataset/packages/0/groups/0/final_events/1",
    ]);
    expect(validateOracleGateEvidenceV2AgainstBlindArtifacts({policy:value.p,public_evidence:records.public_evidence,
      private_derivation:records.private_derivation,public_responses:records.public_responses,private_answer_key:records.private_answer_key})).toEqual({valid:true,issues:[]});
    expect(records.private_derivation.evidence_scope).toBe("post_hoc_development_only");
  });

  it("rejects the wrong blinding authority and signed-event order drift", () => {
    const value=fixture();
    expect(()=>deriveNonAuthoritativeFormalOraclePostRunEvidenceRecordsV1({policy:value.p,completed_run:value.completed,manifest:value.manifest,
      byte_preflight:value.byte,dataset:value.dataset,registry_sha256:sha("1"),frame_preflight_sha256:sha("2"),inventory_sha256:sha("3"),
      blinding_secret:new TextEncoder().encode("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"),derived_at:"2026-08-13T02:00:00.000Z"})).toThrow(/commitment/);
    const drift=structuredClone(value.dataset);drift.packages[0].groups[0].final_events.reverse();
    expect(()=>deriveNonAuthoritativeFormalOraclePostRunEvidenceRecordsV1({policy:value.p,completed_run:value.completed,manifest:value.manifest,
      byte_preflight:value.byte,dataset:drift,registry_sha256:sha("1"),frame_preflight_sha256:sha("2"),inventory_sha256:sha("3"),
      blinding_secret:secret,derived_at:"2026-08-13T02:00:00.000Z"})).toThrow(/未闭合/);
  });

  it("rejects accessors before execution and closes every case to one source video", () => {
    const value=fixture();let getterHits=0;
    const hostile=Object.assign({}, {policy:value.p,completed_run:value.completed,manifest:value.manifest,byte_preflight:value.byte,
      dataset:value.dataset,registry_sha256:sha("1"),frame_preflight_sha256:sha("2"),inventory_sha256:sha("3"),
      blinding_secret:secret,derived_at:"2026-08-13T02:00:00.000Z"}) as Record<string,unknown>;
    Object.defineProperty(hostile,"policy",{enumerable:true,get(){getterHits+=1;return value.p;}});
    expect(()=>deriveNonAuthoritativeFormalOraclePostRunEvidenceRecordsV1(hostile as never)).toThrow(/accessor/);
    expect(getterHits).toBe(0);
    const byteDrift=structuredClone(value.byte) as unknown as {cases:Array<{source_video_id:string}>};byteDrift.cases[0].source_video_id="video-2";
    expect(()=>deriveNonAuthoritativeFormalOraclePostRunEvidenceRecordsV1({policy:value.p,completed_run:value.completed,manifest:value.manifest,
      byte_preflight:byteDrift as never,dataset:value.dataset,registry_sha256:sha("1"),frame_preflight_sha256:sha("2"),inventory_sha256:sha("3"),
      blinding_secret:secret,derived_at:"2026-08-13T02:00:00.000Z"})).toThrow(/未闭合/);
  });
});
