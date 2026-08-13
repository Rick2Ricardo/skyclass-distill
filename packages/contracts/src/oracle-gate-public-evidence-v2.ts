import { canonicalOracleGateJson, validateOracleGateResponse, type OracleGateResponseV1 } from "./oracle-gate-response.js";
import { sha256Hex } from "./sha256.js";
import { validatePrivateAnswerKeyAgainstPublicPackage, validatePublicBlindPackage, type PrivateAnswerKeyV1, type PublicBlindPackageV1 } from "./oracle-gate-run.js";

export const ORACLE_GATE_PUBLIC_EVIDENCE_POLICY_V2_DOMAIN =
  "skyclass/formal-oracle/public-evidence-derivation-policy/v2\0";
export const ORACLE_GATE_PUBLIC_EVIDENCE_PACKAGE_V2_DOMAIN =
  "skyclass/formal-oracle/public-evidence-package/v2\0";
export const ORACLE_GATE_PRIVATE_EVIDENCE_DERIVATION_V2_DOMAIN =
  "skyclass/formal-oracle/private-evidence-derivation-receipt/v2\0";
export const ORACLE_GATE_EVIDENCE_PROJECTION_V2_DOMAIN = "skyclass/formal-oracle/evidence-projection/v2\0";
export const ORACLE_GATE_UNDERLYING_EVIDENCE_DENOMINATOR_V2_DOMAIN = "skyclass/formal-oracle/underlying-evidence-denominator/v2\0";

export interface OracleGatePublicEvidenceDerivationPolicyV2 {
  schema_version: "oracle-gate-public-evidence-derivation-policy-v2";
  public_evidence_derivation_policy_sha256: string;
  claim_projection_version: "response-v1-fixed-json-pointer-assertion-slots-v1";
  claim_source_paths: [
    "/observed_board_actions/*/operation",
    "/observed_board_actions/*/content",
    "/observed_board_actions/*/region",
    "/generalized_teaching_capability/name",
    "/generalized_teaching_capability/mechanism",
    "/generalized_teaching_capability/action_program/*",
    "/evidence_claims/*/claim",
  ];
  uncertainty_policy: "not_a_scored_claim";
  speech_segmentation_version: "one_verified_selected_transcript_unit_per_case-v1";
  speech_gold_status: "context_not_gold";
  board_event_renderer_version: "signed-gold-final-event-semantic-projection-v1";
  board_event_projection: [
    "operation",
    "semantic_label",
    "region",
    "relation",
    "modification",
  ];
  eligible_evidence_policy: "verified_transcript_plus_all_signed_gold_final_events-v1";
  board_edit_denominator_policy: "all_signed_gold_final_events-v1";
  temporal_pair_policy: "all_ordered_signed_gold_final_event_pairs-v1";
  single_event_temporal_policy: "metric_not_applicable_not_global_block-v1";
  public_reblinding_scheme: "opaque-item-local-id-uniqueness-only-v1";
  created_at: string;
  api_execution_allowed: false;
}

export interface OracleGatePublicClaimUnitV2 {
  claim_id: string;
  claim_index: number;
  content: string;
}
export interface OracleGatePublicEvidenceUnitV2 {
  unit_id: string;
  kind: "verified_speech_context" | "signed_gold_board_event";
  sequence_index: number;
  content: string;
}
export interface OracleGatePublicTemporalPairV2 {
  pair_id: string;
  before_unit_id: string;
  after_unit_id: string;
}
export interface OracleGatePublicEvidenceItemV2 {
  blind_id: string;
  response_sha256: string;
  claim_units: OracleGatePublicClaimUnitV2[];
  evidence_units: OracleGatePublicEvidenceUnitV2[];
  eligible_evidence_unit_ids: string[];
  board_edit_unit_ids: string[];
  temporal_metric_status: "eligible_multi_edit" | "not_applicable_single_event";
  temporal_pairs: OracleGatePublicTemporalPairV2[];
}
export interface OracleGatePublicEvidencePackageV2 {
  schema_version: "oracle-gate-public-evidence-package-v2";
  evidence_package_sha256: string;
  record_trust: "non_authoritative_public_blind_evidence_record";
  public_response_package_sha256: string;
  public_evidence_derivation_policy_sha256: string;
  rubric_version: string;
  rubric_sha256: string;
  blinding_statement: "opaque_item_local_ids_only_content_privacy_pending_external_review";
  distribution_independence_status: "pending_external_randomized_independent_sessions";
  item_count: number;
  items: OracleGatePublicEvidenceItemV2[];
  api_execution_allowed: false;
}

export interface OracleGatePrivateClaimSourceV2 {
  public_claim_id: string;
  response_json_pointer: string;
  projected_value_sha256: string;
}
export interface OracleGatePrivateEvidenceSourceV2 {
  public_unit_id: string;
  source_kind: "verified_selected_transcript" | "signed_gold_final_event";
  source_json_pointer: string;
  projected_value_sha256: string;
}
export interface OracleGatePrivateTemporalSourceV2 {
  public_pair_id: string;
  before_source_json_pointer: string;
  after_source_json_pointer: string;
}
export interface OracleGatePrivateEvidenceDerivationItemV2 {
  blind_id: string;
  response_sha256: string;
  public_evidence_item_sha256: string;
  case_id: string;
  seed: number;
  claim_sources: OracleGatePrivateClaimSourceV2[];
  evidence_sources: OracleGatePrivateEvidenceSourceV2[];
  temporal_sources: OracleGatePrivateTemporalSourceV2[];
  underlying_evidence_denominator_sha256: string;
}
export interface OracleGatePrivateEvidenceDerivationReceiptV2 {
  schema_version: "oracle-gate-private-evidence-derivation-receipt-v2";
  derivation_receipt_sha256: string;
  record_trust: "non_authoritative_until_post_run_source_gate_and_external_worm";
  evidence_scope: "post_hoc_development_only" | "preregistered_formal_candidate";
  run_sha256: string;
  terminal_checkpoint_sha256: string;
  public_response_package_sha256: string;
  private_answer_key_sha256: string;
  public_evidence_package_sha256: string;
  public_evidence_derivation_policy_sha256: string;
  ledger_registry_sha256: string;
  signed_gold_dataset_sha256: string;
  formal_input_manifest_sha256: string;
  formal_spec_sha256: string;
  schedule_sha256: string;
  execution_plan_sha256: string;
  verified_byte_inventory_sha256: string;
  frame_derivation_preflight_sha256: string;
  rubric_sha256: string;
  rights_publication_status: "pending_authoritative_resource_active_head";
  item_count: number;
  items: OracleGatePrivateEvidenceDerivationItemV2[];
  api_execution_allowed: false;
}

export interface OracleGateEvidenceV2Issue { path: string; message: string }
export interface OracleGateEvidenceV2Report {
  valid: boolean;
  issues: OracleGateEvidenceV2Issue[];
}

const SHA = /^[a-f0-9]{64}$/;
const OPAQUE = /^u_[a-f0-9]{32,64}$/;
const BLIND = /^B-[a-f0-9]{64}$/;
const POINTER = /^(?:\/(?:[^~/]|~0|~1)+)+$/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
function isDense(value: unknown): value is unknown[] {
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype &&
    Object.keys(value).every((key, index) => key === String(index));
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}
function iso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}
function safeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 32_768 &&
    value.trim() === value && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ud800-\udfff]/.test(value);
}
function normalizedPrivateLeakText(value:string):string{return value.normalize("NFKC").replace(/\p{Default_Ignorable_Code_Point}/gu,"");}
function containsExplicitPrivateLeak(value:string, privateValues:ReadonlySet<string>):boolean{
  const normalized=normalizedPrivateLeakText(value),compact=normalized.replace(/\s+/g,"").toLowerCase();
  if(/(?:transcript_only|static_final_board|uniform_frame|oracle_delta|(?:arm|case[_ -]?id|seed(?:[_ -]?index)?|teacher[_ -]?id|source[_ -]?video[_ -]?id|window[_ -]?id|request[_ -]?id|idempotency[_ -]?key)\s*[:=])/i.test(normalized))return true;
  for(const candidate of privateValues){const clean=normalizedPrivateLeakText(candidate);if(clean.length>=4&&(normalized.includes(clean)||compact.includes(clean.replace(/\s+/g,"").toLowerCase())))return true;}
  return false;
}
function issue(issues: OracleGateEvidenceV2Issue[], ok: boolean, path: string, message: string): void {
  if (!ok) issues.push({ path, message });
}
function result(issues: OracleGateEvidenceV2Issue[]): OracleGateEvidenceV2Report {
  return { valid: issues.length === 0, issues };
}
function withoutSelf<T extends Record<string, unknown>>(value: T, key: string): Record<string, unknown> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}
function domainHash(domain: string, value: Record<string, unknown>, self: string): string {
  return sha256Hex(domain + canonicalOracleGateJson(withoutSelf(value, self)));
}
function safeSnapshot(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw Error("non-finite number");
    return value;
  }
  if (!value || typeof value !== "object") throw Error("not plain data");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length)
      throw Error("non-plain array");
    const names = Object.keys(descriptors).filter((key) => key !== "length");
    if (names.length !== value.length || names.some((key, index) => key !== String(index)))
      throw Error("sparse array");
    if (names.some((key) => !("value" in descriptors[key]) || !descriptors[key].enumerable))
      throw Error("array accessor");
    return names.map((key) => safeSnapshot((descriptors[key] as PropertyDescriptor & { value: unknown }).value));
  }
  if (Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length ||
      Object.hasOwn(value, "toJSON") || Object.values(descriptors).some((d) => !("value" in d) || !d.enumerable))
    throw Error("non-plain object");
  const out: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors))
    out[key] = safeSnapshot((descriptor as PropertyDescriptor & { value: unknown }).value);
  return out;
}

export function hashOracleGatePublicEvidenceDerivationPolicyV2(
  value: OracleGatePublicEvidenceDerivationPolicyV2,
): string {
  return domainHash(ORACLE_GATE_PUBLIC_EVIDENCE_POLICY_V2_DOMAIN, value as unknown as Record<string, unknown>, "public_evidence_derivation_policy_sha256");
}
export function hashOracleGatePublicEvidenceItemV2(value: OracleGatePublicEvidenceItemV2): string {
  return sha256Hex(`${ORACLE_GATE_PUBLIC_EVIDENCE_PACKAGE_V2_DOMAIN}item\0${canonicalOracleGateJson(value)}`);
}
export function hashOracleGatePublicEvidencePackageV2(value: OracleGatePublicEvidencePackageV2): string {
  return domainHash(ORACLE_GATE_PUBLIC_EVIDENCE_PACKAGE_V2_DOMAIN, value as unknown as Record<string, unknown>, "evidence_package_sha256");
}
export function hashOracleGatePrivateEvidenceDerivationReceiptV2(value: OracleGatePrivateEvidenceDerivationReceiptV2): string {
  return domainHash(ORACLE_GATE_PRIVATE_EVIDENCE_DERIVATION_V2_DOMAIN, value as unknown as Record<string, unknown>, "derivation_receipt_sha256");
}
export function hashOracleGateEvidenceProjectionV2(value: string): string {
  return sha256Hex(ORACLE_GATE_EVIDENCE_PROJECTION_V2_DOMAIN + canonicalOracleGateJson(value));
}
export function hashOracleGateUnderlyingEvidenceDenominatorV2(input: {
  public_evidence_derivation_policy_sha256: string;
  evidence_sources: Array<Pick<OracleGatePrivateEvidenceSourceV2, "source_kind" | "source_json_pointer" | "projected_value_sha256">>;
  temporal_sources: Array<Pick<OracleGatePrivateTemporalSourceV2, "before_source_json_pointer" | "after_source_json_pointer">>;
}): string {
  return sha256Hex(ORACLE_GATE_UNDERLYING_EVIDENCE_DENOMINATOR_V2_DOMAIN + canonicalOracleGateJson(input));
}

export function validateOracleGatePublicEvidenceDerivationPolicyV2(input: unknown): OracleGateEvidenceV2Report {
  const issues: OracleGateEvidenceV2Issue[] = [];
  let value: unknown;
  try { value = safeSnapshot(input); } catch { return result([{ path: "$", message: "必须是无 accessor 的 plain data" }]); }
  if (!isPlainRecord(value)) return result([{ path: "$", message: "必须是 object" }]);
  const keys = ["schema_version","public_evidence_derivation_policy_sha256","claim_projection_version","claim_source_paths","uncertainty_policy","speech_segmentation_version","speech_gold_status","board_event_renderer_version","board_event_projection","eligible_evidence_policy","board_edit_denominator_policy","temporal_pair_policy","single_event_temporal_policy","public_reblinding_scheme","created_at","api_execution_allowed"];
  issue(issues, exact(value, keys), "$", "字段无效");
  issue(issues, value.schema_version === "oracle-gate-public-evidence-derivation-policy-v2", "schema_version", "无效");
  issue(issues, SHA.test(String(value.public_evidence_derivation_policy_sha256)), "public_evidence_derivation_policy_sha256", "无效");
  const expectedPaths = ["/observed_board_actions/*/operation","/observed_board_actions/*/content","/observed_board_actions/*/region","/generalized_teaching_capability/name","/generalized_teaching_capability/mechanism","/generalized_teaching_capability/action_program/*","/evidence_claims/*/claim"];
  issue(issues, JSON.stringify(value.claim_source_paths) === JSON.stringify(expectedPaths), "claim_source_paths", "必须冻结固定响应投影");
  issue(issues, value.claim_projection_version === "response-v1-fixed-json-pointer-assertion-slots-v1" && value.uncertainty_policy === "not_a_scored_claim", "claim_projection_version", "无效");
  issue(issues, value.speech_segmentation_version === "one_verified_selected_transcript_unit_per_case-v1" && value.speech_gold_status === "context_not_gold", "speech_segmentation_version", "无效");
  issue(issues, value.board_event_renderer_version === "signed-gold-final-event-semantic-projection-v1" && JSON.stringify(value.board_event_projection) === JSON.stringify(["operation","semantic_label","region","relation","modification"]), "board_event_projection", "无效");
  issue(issues, value.eligible_evidence_policy === "verified_transcript_plus_all_signed_gold_final_events-v1" && value.board_edit_denominator_policy === "all_signed_gold_final_events-v1", "eligible_evidence_policy", "无效");
  issue(issues, value.temporal_pair_policy === "all_ordered_signed_gold_final_event_pairs-v1" && value.single_event_temporal_policy === "metric_not_applicable_not_global_block-v1", "temporal_pair_policy", "无效");
  issue(issues, value.public_reblinding_scheme === "opaque-item-local-id-uniqueness-only-v1", "public_reblinding_scheme", "无效");
  issue(issues, iso(value.created_at), "created_at", "无效");
  issue(issues, value.api_execution_allowed === false, "api_execution_allowed", "必须 false");
  if (SHA.test(String(value.public_evidence_derivation_policy_sha256)))
    try { issue(issues, hashOracleGatePublicEvidenceDerivationPolicyV2(value as unknown as OracleGatePublicEvidenceDerivationPolicyV2) === value.public_evidence_derivation_policy_sha256, "public_evidence_derivation_policy_sha256", "不匹配"); } catch { issues.push({ path: "$", message: "不可规范化" }); }
  return result(issues);
}

function validatePublicItem(item: unknown, path: string, issues: OracleGateEvidenceV2Issue[], globalIds: Set<string>): void {
  if (!isPlainRecord(item)) { issues.push({ path, message: "必须是 object" }); return; }
  issue(issues, exact(item,["blind_id","response_sha256","claim_units","evidence_units","eligible_evidence_unit_ids","board_edit_unit_ids","temporal_metric_status","temporal_pairs"]),path,"字段无效");
  issue(issues, BLIND.test(String(item.blind_id)),`${path}.blind_id`,"无效");
  issue(issues, SHA.test(String(item.response_sha256)),`${path}.response_sha256`,"无效");
  const claimIds = new Set<string>();
  issue(issues,isDense(item.claim_units) && item.claim_units.length>0,`${path}.claim_units`,"必须非空稠密");
  for (const [index, claim] of (isDense(item.claim_units)?item.claim_units:[]).entries()) {
    if (!isPlainRecord(claim) || !exact(claim,["claim_id","claim_index","content"])) { issues.push({path:`${path}.claim_units[${index}]`,message:"字段无效"}); continue; }
    const id=String(claim.claim_id); issue(issues,OPAQUE.test(id)&&!claimIds.has(id)&&!globalIds.has(id),`${path}.claim_units[${index}].claim_id`,"必须全包唯一 opaque id"); claimIds.add(id);globalIds.add(id);
    issue(issues,claim.claim_index===index,`${path}.claim_units[${index}].claim_index`,"必须连续");
    issue(issues,text(claim.content),`${path}.claim_units[${index}].content`,"无效");
  }
  const units = new Map<string,{kind:string;sequence:number}>();
  issue(issues,isDense(item.evidence_units) && item.evidence_units.length>=2,`${path}.evidence_units`,"必须含 transcript 与至少一个 Gold event");
  for (const [index, unit] of (isDense(item.evidence_units)?item.evidence_units:[]).entries()) {
    if (!isPlainRecord(unit) || !exact(unit,["unit_id","kind","sequence_index","content"])) { issues.push({path:`${path}.evidence_units[${index}]`,message:"字段无效"}); continue; }
    const id=String(unit.unit_id);issue(issues,OPAQUE.test(id)&&!units.has(id)&&!globalIds.has(id),`${path}.evidence_units[${index}].unit_id`,"必须全包唯一 opaque id");globalIds.add(id);
    issue(issues,unit.kind===(index===0?"verified_speech_context":"signed_gold_board_event"),`${path}.evidence_units[${index}].kind`,"首项必须speech，其后必须Gold event");
    issue(issues,unit.sequence_index===index,`${path}.evidence_units[${index}].sequence_index`,"必须连续");issue(issues,text(unit.content),`${path}.evidence_units[${index}].content`,"无效");
    units.set(id,{kind:String(unit.kind),sequence:Number(unit.sequence_index)});
  }
  const expectedEligible=[...units.keys()], expectedEdits=[...units.entries()].filter(([,v])=>v.kind==="signed_gold_board_event").map(([id])=>id);
  issue(issues,isDense(item.eligible_evidence_unit_ids)&&JSON.stringify(item.eligible_evidence_unit_ids)===JSON.stringify(expectedEligible),`${path}.eligible_evidence_unit_ids`,"必须覆盖 transcript + 全部 Gold events");
  issue(issues,isDense(item.board_edit_unit_ids)&&JSON.stringify(item.board_edit_unit_ids)===JSON.stringify(expectedEdits),`${path}.board_edit_unit_ids`,"必须覆盖全部 Gold events");
  const pairs=isDense(item.temporal_pairs)?item.temporal_pairs:[], expectedPairCount=expectedEdits.length*(expectedEdits.length-1)/2;
  issue(issues,isDense(item.temporal_pairs)&&pairs.length===expectedPairCount,`${path}.temporal_pairs`,"必须为全部有序Gold event pairs");
  const observedEdges:string[]=[];
  for(const [index,pair] of pairs.entries()){
    if(!isPlainRecord(pair)||!exact(pair,["pair_id","before_unit_id","after_unit_id"])) {issues.push({path:`${path}.temporal_pairs[${index}]`,message:"字段无效"});continue;}
    const id=String(pair.pair_id);issue(issues,OPAQUE.test(id)&&!globalIds.has(id),`${path}.temporal_pairs[${index}].pair_id`,"必须全包唯一 opaque id");globalIds.add(id);
    const before=units.get(String(pair.before_unit_id)),after=units.get(String(pair.after_unit_id));issue(issues,Boolean(before&&after&&before.kind==="signed_gold_board_event"&&after.kind==="signed_gold_board_event"&&before.sequence<after.sequence),`${path}.temporal_pairs[${index}]`,"必须为正向Gold event pair");
    observedEdges.push(`${pair.before_unit_id}\0${pair.after_unit_id}`);
  }
  const expectedEdges:string[]=[];for(let i=0;i<expectedEdits.length;i++)for(let j=i+1;j<expectedEdits.length;j++)expectedEdges.push(`${expectedEdits[i]}\0${expectedEdits[j]}`);
  issue(issues,JSON.stringify(observedEdges)===JSON.stringify(expectedEdges),`${path}.temporal_pairs`,"pair必须按全组合顺序排列");
  issue(issues,item.temporal_metric_status===(expectedEdits.length===1?"not_applicable_single_event":"eligible_multi_edit"),`${path}.temporal_metric_status`,"与事件数不符");
}

export function validateOracleGatePublicEvidencePackageV2(input: unknown): OracleGateEvidenceV2Report {
  let value: unknown;try{value=safeSnapshot(input);}catch{return result([{path:"$",message:"必须是无 accessor 的 plain data"}]);}
  const issues:OracleGateEvidenceV2Issue[]=[];if(!isPlainRecord(value))return result([{path:"$",message:"必须是 object"}]);
  const keys=["schema_version","evidence_package_sha256","record_trust","public_response_package_sha256","public_evidence_derivation_policy_sha256","rubric_version","rubric_sha256","blinding_statement","distribution_independence_status","item_count","items","api_execution_allowed"];
  issue(issues,exact(value,keys),"$","字段无效");issue(issues,value.schema_version==="oracle-gate-public-evidence-package-v2"&&value.record_trust==="non_authoritative_public_blind_evidence_record","schema_version","无效");
  ["evidence_package_sha256","public_response_package_sha256","public_evidence_derivation_policy_sha256","rubric_sha256"].forEach(k=>issue(issues,SHA.test(String(value[k])),k,"无效"));
  issue(issues,text(value.rubric_version),"rubric_version","无效");issue(issues,value.blinding_statement==="opaque_item_local_ids_only_content_privacy_pending_external_review","blinding_statement","无效");issue(issues,value.distribution_independence_status==="pending_external_randomized_independent_sessions","distribution_independence_status","必须 pending");
  issue(issues,safeInteger(value.item_count)&&Number(value.item_count)>0&&isDense(value.items)&&value.items.length===value.item_count,"items","数量无效");
  const blinds=new Set<string>(),globalIds=new Set<string>();for(const [index,item] of (isDense(value.items)?value.items:[]).entries()){if(isPlainRecord(item)){issue(issues,!blinds.has(String(item.blind_id)),`items[${index}].blind_id`,"重复");blinds.add(String(item.blind_id));}validatePublicItem(item,`items[${index}]`,issues,globalIds);}
  issue(issues,value.api_execution_allowed===false,"api_execution_allowed","必须 false");
  if(SHA.test(String(value.evidence_package_sha256)))try{issue(issues,hashOracleGatePublicEvidencePackageV2(value as unknown as OracleGatePublicEvidencePackageV2)===value.evidence_package_sha256,"evidence_package_sha256","不匹配");}catch{issues.push({path:"$",message:"不可规范化"});}
  return result(issues);
}

export function validateOracleGatePrivateEvidenceDerivationReceiptV2(input: unknown): OracleGateEvidenceV2Report {
  let value:unknown;try{value=safeSnapshot(input);}catch{return result([{path:"$",message:"必须是无 accessor 的 plain data"}]);}const issues:OracleGateEvidenceV2Issue[]=[];if(!isPlainRecord(value))return result([{path:"$",message:"必须是 object"}]);
  const keys=["schema_version","derivation_receipt_sha256","record_trust","evidence_scope","run_sha256","terminal_checkpoint_sha256","public_response_package_sha256","private_answer_key_sha256","public_evidence_package_sha256","public_evidence_derivation_policy_sha256","ledger_registry_sha256","signed_gold_dataset_sha256","formal_input_manifest_sha256","formal_spec_sha256","schedule_sha256","execution_plan_sha256","verified_byte_inventory_sha256","frame_derivation_preflight_sha256","rubric_sha256","rights_publication_status","item_count","items","api_execution_allowed"];
  issue(issues,exact(value,keys),"$","字段无效");issue(issues,value.schema_version==="oracle-gate-private-evidence-derivation-receipt-v2"&&value.record_trust==="non_authoritative_until_post_run_source_gate_and_external_worm","schema_version","无效");issue(issues,value.evidence_scope==="post_hoc_development_only","evidence_scope","FormalSpec/Run/RatingPlan 尚未绑定 policy root，只允许 post-hoc development");
  keys.filter(k=>k.endsWith("sha256")).forEach(k=>issue(issues,SHA.test(String(value[k])),k,"无效"));issue(issues,value.rights_publication_status==="pending_authoritative_resource_active_head","rights_publication_status","必须 pending");issue(issues,safeInteger(value.item_count)&&Number(value.item_count)>0&&isDense(value.items)&&value.items.length===value.item_count,"items","数量无效");
  const blinds=new Set<string>();for(const [index,item]of(isDense(value.items)?value.items:[]).entries()){const path=`items[${index}]`;if(!isPlainRecord(item)){issues.push({path,message:"必须 object"});continue;}issue(issues,exact(item,["blind_id","response_sha256","public_evidence_item_sha256","case_id","seed","claim_sources","evidence_sources","temporal_sources","underlying_evidence_denominator_sha256"]),path,"字段无效");issue(issues,BLIND.test(String(item.blind_id))&&!blinds.has(String(item.blind_id)),`${path}.blind_id`,"无效/重复");blinds.add(String(item.blind_id));["response_sha256","public_evidence_item_sha256","underlying_evidence_denominator_sha256"].forEach(k=>issue(issues,SHA.test(String(item[k])),`${path}.${k}`,"无效"));issue(issues,text(item.case_id),`${path}.case_id`,"无效");issue(issues,safeInteger(item.seed),`${path}.seed`,"无效");
    for(const [field,idKey]of[["claim_sources","public_claim_id"],["evidence_sources","public_unit_id"],["temporal_sources","public_pair_id"]]as const){issue(issues,isDense(item[field]),`${path}.${field}`,"必须稠密");const ids=new Set<string>();for(const [j,source]of(isDense(item[field])?item[field]:[]).entries()){if(!isPlainRecord(source)){issues.push({path:`${path}.${field}[${j}]`,message:"必须 object"});continue;}const expected=field==="claim_sources"?["public_claim_id","response_json_pointer","projected_value_sha256"]:field==="evidence_sources"?["public_unit_id","source_kind","source_json_pointer","projected_value_sha256"]:["public_pair_id","before_source_json_pointer","after_source_json_pointer"];issue(issues,exact(source,expected),`${path}.${field}[${j}]`,"字段无效");const id=String(source[idKey]);issue(issues,OPAQUE.test(id)&&!ids.has(id),`${path}.${field}[${j}].${idKey}`,"无效/重复");ids.add(id);for(const [k,v]of Object.entries(source))if(k.endsWith("json_pointer"))issue(issues,POINTER.test(String(v)),`${path}.${field}[${j}].${k}`,"无效");if(field!=="temporal_sources")issue(issues,SHA.test(String(source.projected_value_sha256)),`${path}.${field}[${j}].projected_value_sha256`,"无效");if(field==="evidence_sources")issue(issues,source.source_kind===(j===0?"verified_selected_transcript":"signed_gold_final_event"),`${path}.${field}[${j}].source_kind`,"首项必须 transcript");}}
  }
  issue(issues,value.api_execution_allowed===false,"api_execution_allowed","必须 false");if(SHA.test(String(value.derivation_receipt_sha256)))try{issue(issues,hashOracleGatePrivateEvidenceDerivationReceiptV2(value as unknown as OracleGatePrivateEvidenceDerivationReceiptV2)===value.derivation_receipt_sha256,"derivation_receipt_sha256","不匹配");}catch{issues.push({path:"$",message:"不可规范化"});}return result(issues);
}

export function validateOracleGateEvidenceV2AgainstBlindArtifacts(input: {
  policy: unknown;
  public_evidence: unknown;
  private_derivation: unknown;
  public_responses: unknown;
  private_answer_key: unknown;
}): OracleGateEvidenceV2Report {
  let snapshot:unknown;try{snapshot=safeSnapshot(input);}catch{return result([{path:"$",message:"必须是无 accessor 的 plain data"}]);}if(!isPlainRecord(snapshot))return result([{path:"$",message:"必须 object"}]);
  if(!exact(snapshot,["policy","public_evidence","private_derivation","public_responses","private_answer_key"]))return result([{path:"$",message:"字段无效"}]);
  const blindReport=validatePublicBlindPackage(snapshot.public_responses),keyReport=validatePrivateAnswerKeyAgainstPublicPackage(snapshot.private_answer_key,snapshot.public_responses);
  const issues=[...validateOracleGatePublicEvidenceDerivationPolicyV2(snapshot.policy).issues,...validateOracleGatePublicEvidencePackageV2(snapshot.public_evidence).issues,...validateOracleGatePrivateEvidenceDerivationReceiptV2(snapshot.private_derivation).issues,...blindReport.issues.map(x=>({path:`public_responses.${x.path}`,message:x.message})),...keyReport.issues.map(x=>({path:`private_answer_key.${x.path}`,message:x.message}))];
  if(issues.length||!isPlainRecord(snapshot.policy)||!isPlainRecord(snapshot.public_evidence)||!isPlainRecord(snapshot.private_derivation)||!isPlainRecord(snapshot.public_responses)||!isPlainRecord(snapshot.private_answer_key))return result(issues);
  const policy=snapshot.policy as unknown as OracleGatePublicEvidenceDerivationPolicyV2,pub=snapshot.public_evidence as unknown as OracleGatePublicEvidencePackageV2,receipt=snapshot.private_derivation as unknown as OracleGatePrivateEvidenceDerivationReceiptV2,responses=snapshot.public_responses as unknown as PublicBlindPackageV1,key=snapshot.private_answer_key as unknown as PrivateAnswerKeyV1;
  issue(issues,pub.public_evidence_derivation_policy_sha256===policy.public_evidence_derivation_policy_sha256&&receipt.public_evidence_derivation_policy_sha256===policy.public_evidence_derivation_policy_sha256,"policy","根不匹配");issue(issues,pub.public_response_package_sha256===responses.package_sha256&&receipt.public_response_package_sha256===responses.package_sha256,"public_response_package_sha256","根不匹配");issue(issues,receipt.private_answer_key_sha256===key.answer_key_sha256,"private_answer_key_sha256","根不匹配");issue(issues,receipt.run_sha256===responses.run_commitment_sha256&&receipt.run_sha256===key.run_sha256,"run_sha256","不匹配");issue(issues,receipt.public_evidence_package_sha256===pub.evidence_package_sha256,"evidence_package_sha256","根不匹配");issue(issues,pub.rubric_version===responses.rubric_version&&pub.rubric_sha256===responses.rubric_sha256&&receipt.rubric_sha256===responses.rubric_sha256,"rubric","version/hash不匹配");
  const responseByBlind=new Map(responses.items.map(x=>[x.blind_id,x.response_sha256])),keyByBlind=new Map(key.entries.map(x=>[x.blind_id,x])),receiptByBlind=new Map(receipt.items.map(x=>[x.blind_id,x])),privateValues=new Set(key.entries.flatMap(x=>[x.request_id,x.idempotency_key,x.case_id,x.arm,String(x.seed),x.teacher_id,x.source_video_id,x.window_id]));issue(issues,pub.items.length===responses.items.length&&pub.items.length===key.entries.length&&pub.items.length===receipt.items.length,"items","必须逐项覆盖");const publicOrder=pub.items.map(x=>x.blind_id);issue(issues,JSON.stringify(publicOrder)===JSON.stringify(responses.items.map(x=>x.blind_id))&&JSON.stringify(publicOrder)===JSON.stringify(key.entries.map(x=>x.blind_id))&&JSON.stringify(publicOrder)===JSON.stringify(receipt.items.map(x=>x.blind_id)),"items","public/private/receipt必须同序覆盖");
  const denominators=new Map<string,string>(),armsByGroup=new Map<string,string[]>();for(const item of pub.items){const source=receiptByBlind.get(item.blind_id),answer=keyByBlind.get(item.blind_id),responseItem=responses.items.find(x=>x.blind_id===item.blind_id);if(!source||!answer||!responseItem){issues.push({path:`items.${item.blind_id}`,message:"缺失private映射"});continue;}issue(issues,item.response_sha256===responseByBlind.get(item.blind_id)&&item.response_sha256===answer.response_sha256&&item.response_sha256===source.response_sha256,`items.${item.blind_id}.response_sha256`,"不匹配");issue(issues,source.public_evidence_item_sha256===hashOracleGatePublicEvidenceItemV2(item),`items.${item.blind_id}.public_evidence_item_sha256`,"不匹配");issue(issues,JSON.stringify(source.claim_sources.map(x=>x.public_claim_id))===JSON.stringify(item.claim_units.map(x=>x.claim_id)),`items.${item.blind_id}.claim_sources`,"ID映射不匹配");issue(issues,JSON.stringify(source.evidence_sources.map(x=>x.public_unit_id))===JSON.stringify(item.evidence_units.map(x=>x.unit_id)),`items.${item.blind_id}.evidence_sources`,"ID映射不匹配");issue(issues,JSON.stringify(source.temporal_sources.map(x=>x.public_pair_id))===JSON.stringify(item.temporal_pairs.map(x=>x.pair_id)),`items.${item.blind_id}.temporal_sources`,"ID映射不匹配");issue(issues,source.case_id===answer.case_id&&source.seed===answer.seed,`items.${item.blind_id}.case_seed`,"不匹配");
    try{validateOracleGateResponse(responseItem.response,answer.arm);}catch{issues.push({path:`items.${item.blind_id}.response`,message:"响应不符合冻结arm schema"});continue;}
    const projected=projectOracleGateResponseClaimsV2(responseItem.response as unknown as OracleGateResponseV1);issue(issues,projected.length===item.claim_units.length&&projected.length===source.claim_sources.length,`items.${item.blind_id}.claims`,"固定响应投影数量不匹配");for(let index=0;index<Math.min(projected.length,item.claim_units.length,source.claim_sources.length);index++){const expected=projected[index],claim=item.claim_units[index],descriptor=source.claim_sources[index];issue(issues,claim.content===expected.content&&descriptor.response_json_pointer===expected.pointer&&descriptor.projected_value_sha256===hashOracleGateEvidenceProjectionV2(expected.content),`items.${item.blind_id}.claim_sources[${index}]`,"未由冻结响应路径逐项派生");}
    for(const [index,claim]of item.claim_units.entries())issue(issues,!containsExplicitPrivateLeak(claim.content,privateValues),`items.${item.blind_id}.claim_units[${index}].content`,"显式泄漏private metadata");for(let index=0;index<Math.min(item.evidence_units.length,source.evidence_sources.length);index++){issue(issues,source.evidence_sources[index].projected_value_sha256===hashOracleGateEvidenceProjectionV2(item.evidence_units[index].content),`items.${item.blind_id}.evidence_sources[${index}]`,"public evidence content与私有projection hash不匹配");issue(issues,!containsExplicitPrivateLeak(item.evidence_units[index].content,privateValues),`items.${item.blind_id}.evidence_units[${index}].content`,"显式泄漏private metadata");}const evidencePointers=source.evidence_sources.map(x=>x.source_json_pointer);issue(issues,new Set(evidencePointers).size===evidencePointers.length,`items.${item.blind_id}.evidence_sources`,"source pointer不得重复");issue(issues,/\/speech\/selected_transcript$/.test(evidencePointers[0]??"")&&source.evidence_sources.slice(1).every((x,index)=>new RegExp(`/final_events/${index}$`).test(x.source_json_pointer)),`items.${item.blind_id}.evidence_sources`,"必须一个speech pointer后接连续唯一final_event pointers");
    const evidencePointerById=new Map(source.evidence_sources.map(x=>[x.public_unit_id,x.source_json_pointer]));for(let index=0;index<Math.min(item.temporal_pairs.length,source.temporal_sources.length);index++){const pair=item.temporal_pairs[index],descriptor=source.temporal_sources[index];issue(issues,descriptor.before_source_json_pointer===evidencePointerById.get(pair.before_unit_id)&&descriptor.after_source_json_pointer===evidencePointerById.get(pair.after_unit_id),`items.${item.blind_id}.temporal_sources[${index}]`,"pair source pointer未闭合对应evidence");}
    const expectedDenominator=hashOracleGateUnderlyingEvidenceDenominatorV2({public_evidence_derivation_policy_sha256:policy.public_evidence_derivation_policy_sha256,evidence_sources:source.evidence_sources.map(({source_kind,source_json_pointer,projected_value_sha256})=>({source_kind,source_json_pointer,projected_value_sha256})),temporal_sources:source.temporal_sources.map(({before_source_json_pointer,after_source_json_pointer})=>({before_source_json_pointer,after_source_json_pointer}))});issue(issues,source.underlying_evidence_denominator_sha256===expectedDenominator,`items.${item.blind_id}.underlying_evidence_denominator_sha256`,"未由declared source descriptors重算");
    const group=`${answer.case_id}\0${answer.seed}`,previous=denominators.get(group),arms=armsByGroup.get(group)??[];arms.push(answer.arm);armsByGroup.set(group,arms);if(previous===undefined)denominators.set(group,source.underlying_evidence_denominator_sha256);else issue(issues,previous===source.underlying_evidence_denominator_sha256,`items.${item.blind_id}.underlying_evidence_denominator_sha256`,"同case×seed四臂底层分母漂移");}
  for(const [group,arms]of armsByGroup){const counts=new Map<string,number>();for(const arm of arms)counts.set(arm,(counts.get(arm)??0)+1);issue(issues,arms.length===4&&["transcript_only","static_final_board","uniform_frame","oracle_delta"].every(arm=>counts.get(arm)===1),`groups.${group.replace("\0",":")}`,"必须恰好四项且每臂一次");}
  return result(issues);
}

export function projectOracleGateResponseClaimsV2(response: OracleGateResponseV1): Array<{pointer:string;content:string}> {
  const out:Array<{pointer:string;content:string}>=[];
  response.observed_board_actions.forEach((action,index)=>{
    out.push({pointer:`/observed_board_actions/${index}/operation`,content:action.operation});
    if(action.content!==null)out.push({pointer:`/observed_board_actions/${index}/content`,content:action.content});
    if(action.region!==null)out.push({pointer:`/observed_board_actions/${index}/region`,content:action.region});
  });
  out.push({pointer:"/generalized_teaching_capability/name",content:response.generalized_teaching_capability.name});
  out.push({pointer:"/generalized_teaching_capability/mechanism",content:response.generalized_teaching_capability.mechanism});
  response.generalized_teaching_capability.action_program.forEach((content,index)=>out.push({pointer:`/generalized_teaching_capability/action_program/${index}`,content}));
  response.evidence_claims.forEach((claim,index)=>out.push({pointer:`/evidence_claims/${index}/claim`,content:claim.claim}));
  return out;
}

export function renderSignedGoldFinalEventEvidenceV2(event: {
  operation: string;
  semantic_label: string;
  region: unknown;
  relation: unknown;
  modification: unknown;
}): string {
  return canonicalOracleGateJson({
    operation: event.operation,
    semantic_label: event.semantic_label,
    region: event.region,
    relation: event.relation,
    modification: event.modification,
  });
}
