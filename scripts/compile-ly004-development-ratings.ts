import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateOracleGateResponse } from "../packages/contracts/src/oracle-gate-response.js";

const root = process.cwd();
const base = resolve(root, "data/board2skill/oracle-gate-development");
const ratingsRoot = join(base, "ratings");
const expectedHeader = ["blind_id","rater_id","evidence_true_positive","evidence_false_positive","evidence_false_negative","evidence_precision","evidence_recall","evidence_f1","edit_content_correct","operation_add_correct","unsupported_claim_count","factual_claim_count","unsupported_claim_rate","schema_privacy_hard_failure","temporal_fidelity","notes"];
const arms = ["transcript_only","static_final_board","uniform_frame","oracle_delta"] as const;
type Arm = typeof arms[number];
interface CsvRow { [key: string]: string }
interface KeyItem { blind_id:string; paired_case_id:string; case_id:string; arm:Arm; seed:number; condition_sha256?:string; development_seed_index?:number; spec_sha256?:string }
interface RaterViewItem { blind_id:string; evidence_card:{evidence_units:unknown[]} }
interface ActiveBlindItem { blind_id:string; response:Record<string,unknown>; response_sha256:string }
interface CheckedRating {
  blind_id:string; rater_id:"R1"|"R2"; evidence_f1:number; edit_content_correct:number;
  operation_add_correct:number; unsupported_claim_rate:number; schema_privacy_hard_failure:boolean;
}
interface MergedRating {
  blind_id:string; paired_case_id:string; case_id:string; arm:Arm; seed:number;
  evidence_f1:number; edit_content_correct:number; operation_add_correct:number; unsupported_claim_rate:number;
  schema_privacy_hard_failure:boolean; rater_disagreement:{evidence_f1_absolute:number;unsupported_rate_absolute:number};
}
function assert(condition:unknown,message:string):asserts condition { if(!condition)throw new Error(message); }
function parseCsv(text:string):CsvRow[]{
  const lines=text.trim().split(/\r?\n/);const header=lines.shift()?.split(",")??[];
  assert(JSON.stringify(header)===JSON.stringify(expectedHeader),"rating CSV header无效");
  return lines.filter(Boolean).map((line)=>{const values:string[]=[];let current="";let quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){current+='"';i++;}else quoted=!quoted;}else if(c===","&&!quoted){values.push(current);current="";}else current+=c;}values.push(current);assert(!quoted&&values.length===header.length,"rating CSV列数或引号无效");return Object.fromEntries(header.map((key,index)=>[key,values[index]]));});
}
function finite(value:string,label:string):number{const n=Number(value);assert(value.trim()!==""&&Number.isFinite(n),`${label}不是有限数值`);return n;}
function integer(value:string,label:string):number{const n=finite(value,label);assert(Number.isSafeInteger(n)&&n>=0,`${label}不是非负安全整数`);return n;}
function binary(value:string,label:string):number{const n=integer(value,label);assert(n===0||n===1,`${label}不是0/1`);return n;}
function close(actual:number,expected:number,label:string):void{assert(Math.abs(actual-expected)<=1e-6,`${label}与计数重算不一致`);}
function mean(values:number[]):number{assert(values.length>0,"不能计算空均值");return values.reduce((a,b)=>a+b,0)/values.length;}
function sha(value:string|Buffer):string{return createHash("sha256").update(value).digest("hex");}
function parseView(text:string):RaterViewItem[]{return text.trim().split("\n").filter(Boolean).map((line)=>JSON.parse(line) as RaterViewItem);}
function stableJson(value:unknown):string{if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stableJson).join(",")}]`;const object=value as Record<string,unknown>;return`{${Object.keys(object).sort().map((key)=>`${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;}

const resultsRoot=join(base,"results");
const stagingRoot=join(base,"results.next");
await rm(stagingRoot,{recursive:true,force:true});
await rm(resultsRoot,{recursive:true,force:true});
const packageManifest=JSON.parse(await readFile(join(base,"blind-package/manifest.json"),"utf8")) as {schema_version:string;matrix_receipt_sha256:string;matrix_receipt_domain:string;rater_views:string[];matrix:Record<string,unknown>&{private_map_payload_sha256:string;rater_item_roots:{R1:string;R2:string}}};
assert(packageManifest.schema_version==="ly004-development-blind-package-v2"&&packageManifest.rater_views.join(",")==="r1,r2"&&/^[a-f0-9]{64}$/.test(packageManifest.matrix_receipt_sha256),"blind package manifest无效");
assert(sha(packageManifest.matrix_receipt_domain+stableJson(packageManifest.matrix))===packageManifest.matrix_receipt_sha256,"matrix receipt重算无效");
const viewItemsByRater=new Map<string,RaterViewItem[]>();

const raterIds=["R1","R2"] as const;
const checkedByRater=new Map<string,CheckedRating[]>();
const ratingFileHashes:Array<{rater_id:string;file_sha256:string}>=[];
for(const raterId of raterIds){
  const suffix=raterId.toLowerCase();
  const viewBytes=await readFile(join(base,"blind-package",suffix,"items.jsonl"));
  const view=parseView(viewBytes.toString("utf8"));
  const viewManifest=JSON.parse(await readFile(join(base,"blind-package",suffix,"manifest.json"),"utf8")) as {schema_version:string;rater_id:string;item_count:number;items_sha256:string;matrix_receipt_sha256:string};
  assert(viewManifest.schema_version==="ly004-development-rater-view-v2"&&viewManifest.rater_id===raterId&&viewManifest.item_count===24&&viewManifest.items_sha256===sha(viewBytes)&&viewManifest.matrix_receipt_sha256===packageManifest.matrix_receipt_sha256,`${raterId} view manifest/root无效`);
  assert(viewManifest.items_sha256===packageManifest.matrix.rater_item_roots[raterId],`${raterId} items未绑定matrix receipt`);viewItemsByRater.set(raterId,view);
  assert(view.length===24&&new Set(view.map((item)=>item.blind_id)).size===24,`${raterId} blind view无效`);
  const viewByBlind=new Map(view.map((item)=>[item.blind_id,item]));
  const file=`rater-${suffix}.csv`;const bytes=await readFile(join(ratingsRoot,file));const rows=parseCsv(bytes.toString("utf8"));
  assert(rows.length===24&&new Set(rows.map((row)=>row.blind_id)).size===24,`${file}必须24个唯一blind_id`);
  assert(rows.every((row)=>row.rater_id===raterId),`${file} rater_id无效`);
  assert(JSON.stringify([...viewByBlind.keys()].sort())===JSON.stringify(rows.map((row)=>row.blind_id).sort()),`${file} blind集合与隔离视图不一致`);
  const checked=rows.map((row):CheckedRating=>{
    const viewItem=viewByBlind.get(row.blind_id) as (RaterViewItem & {response:{evidence_claims:unknown[];observed_board_actions:Array<{content:unknown}>}})|undefined;
    assert(viewItem,`${row.blind_id} view item缺失`);const denominator=viewItem.evidence_card.evidence_units.length;assert(denominator,`${row.blind_id} evidence card无效`);
    const tp=integer(row.evidence_true_positive,"TP"),fp=integer(row.evidence_false_positive,"FP"),fn=integer(row.evidence_false_negative,"FN");
    assert(tp+fn===denominator,`${row.blind_id} TP+FN必须等于固定证据单元数`);
    const precision=tp+fp===0?1:tp/(tp+fp);const recall=tp/(tp+fn);const f1=precision+recall===0?0:2*precision*recall/(precision+recall);
    close(finite(row.evidence_precision,"precision"),precision,"precision");close(finite(row.evidence_recall,"recall"),recall,"recall");close(finite(row.evidence_f1,"F1"),f1,"F1");
    assert(Array.isArray(viewItem.response.evidence_claims)&&Array.isArray(viewItem.response.observed_board_actions),`${row.blind_id} response claim结构无效`);
    const expectedFactual=viewItem.response.evidence_claims.length+viewItem.response.observed_board_actions.filter((item)=>item.content!==null).length;
    assert(fp<=viewItem.response.evidence_claims.length,`${row.blind_id} FP不能超过evidence claim数`);const unsupported=integer(row.unsupported_claim_count,"unsupported count"),factual=integer(row.factual_claim_count,"factual count");assert(factual===expectedFactual,`${row.blind_id} factual claim分母与响应不一致`);assert(unsupported>=fp,`${row.blind_id} evidence FP必须计入unsupported`);assert(unsupported<=factual,"unsupported不能超过factual");const unsupportedRate=factual===0?0:unsupported/factual;close(finite(row.unsupported_claim_rate,"unsupported rate"),unsupportedRate,"unsupported rate");
    assert(row.schema_privacy_hard_failure==="true"||row.schema_privacy_hard_failure==="false","hard failure必须是boolean");assert(row.temporal_fidelity==="NA","temporal必须为NA");
    return{blind_id:row.blind_id,rater_id:raterId,evidence_f1:f1,edit_content_correct:binary(row.edit_content_correct,"edit content"),operation_add_correct:binary(row.operation_add_correct,"operation"),unsupported_claim_rate:unsupportedRate,schema_privacy_hard_failure:row.schema_privacy_hard_failure==="true"};
  });
  checkedByRater.set(raterId,checked);ratingFileHashes.push({rater_id:raterId,file_sha256:sha(bytes)});
}

const privateMapDocument=JSON.parse(await readFile(join(base,"private/rating-map-v2.json"),"utf8")) as {schema_version:string;matrix_receipt_sha256:string;private_map_payload_sha256:string;items:KeyItem[]};
const privatePayload={schema_version:"ly004-development-private-rating-map-payload-v2",items:privateMapDocument.items};
const privatePayloadSha=sha("skyclass/ly004-development-private-rating-map-payload/v2\0"+stableJson(privatePayload));
assert(privateMapDocument.schema_version==="ly004-development-private-rating-map-v2"&&privateMapDocument.matrix_receipt_sha256===packageManifest.matrix_receipt_sha256&&privateMapDocument.private_map_payload_sha256===privatePayloadSha&&privatePayloadSha===packageManifest.matrix.private_map_payload_sha256,"private rating map root无效");
const privateMap=privateMapDocument.items;
assert(privateMap.length===24&&new Set(privateMap.map((item)=>item.blind_id)).size===24,"private rating map无效");
const sourceMap:KeyItem[]=[];const activeBlindById=new Map<string,ActiveBlindItem>();const expectedSourceRoots:Array<Record<string,unknown>>=[];for(const [index,run] of ["run-01","run-03","run-04"].entries()){const specName=["01","03","04"][index];const specBytes=await readFile(resolve(root,`research/board2skill/experiments/ly004-development-seed-${specName}.json`));const specSha=sha(specBytes);const manifestBytes=await readFile(join(base,run,"manifest.json"));const blindBytes=await readFile(join(base,run,"blind/items.jsonl"));const recordsBytes=await readFile(join(base,run,"private/run-records.jsonl"));const pilotBytes=await readFile(join(base,run,"private/input-pilot.json"));const keys=JSON.parse(await readFile(join(base,run,"private/answer-key.json"),"utf8")) as KeyItem[];sourceMap.push(...keys.map((item)=>({...item,development_seed_index:index,spec_sha256:specSha})));for(const item of parseView(blindBytes.toString("utf8")) as unknown as ActiveBlindItem[]){assert(!activeBlindById.has(item.blind_id),"active blind id重复");activeBlindById.set(item.blind_id,item);}expectedSourceRoots.push({development_seed_index:index,generation_spec_sha256:specSha,run_manifest_sha256:sha(manifestBytes),blind_items_sha256:sha(blindBytes),private_run_records_sha256:sha(recordsBytes),input_pilot_sha256:sha(pilotBytes),item_count:8});}
assert(stableJson([...sourceMap].sort((a,b)=>a.blind_id.localeCompare(b.blind_id)))===stableJson(privateMap),"private rating map未与active answer keys闭合");
assert(stableJson(packageManifest.matrix.source_roots)===stableJson(expectedSourceRoots),"matrix source roots未与active artifacts闭合");
const r1View=new Map(viewItemsByRater.get("R1")!.map((item)=>[item.blind_id,item]));const r2View=new Map(viewItemsByRater.get("R2")!.map((item)=>[item.blind_id,item]));for(const [blindId,item] of r1View){assert(stableJson(item)===stableJson(r2View.get(blindId)),`${blindId} R1/R2内容漂移`);}
const expectedMatrix={protocol_scope:"ly004_preregistered_development_value_gate_v1",protocol_document_sha256:sha(await readFile(resolve(root,"research/board2skill/experiments/LY004_DEVELOPMENT_VALUE_GATE_V1.md"))),case_count:2,arm_count:4,arms_sha256:sha(stableJson([...arms].sort())),development_seed_count:3,active_generation_seeds_sha256:sha(stableJson([20260814,20260816,20260817])),request_count:24,model:"gpt-5.5",prompt_sha256:"38cdf0bfad57415873b0d17572eebe592d8ec348571a38254a68dace84d5d080",output_schema_sha256:"99ff47e5ea52494303b0acc7b6d3128b0c51a90f2451a396a60a05c5de932a11",source_roots:expectedSourceRoots,private_map_payload_sha256:privatePayloadSha,rater_item_roots:{R1:sha(await readFile(join(base,"blind-package/r1/items.jsonl"))),R2:sha(await readFile(join(base,"blind-package/r2/items.jsonl")))} };
assert(stableJson(packageManifest.matrix)===stableJson(expectedMatrix),"matrix声明未从active artifacts确定性重建");
const keyByBlind=new Map(privateMap.map((item)=>[item.blind_id,item]));
for(const item of viewItemsByRater.get("R1")!){const key=keyByBlind.get(item.blind_id);assert(key,`${item.blind_id}缺private key`);const publicItem=item as RaterViewItem&{response:Record<string,unknown>;response_sha256:string};const active=activeBlindById.get(item.blind_id);assert(active&&stableJson(publicItem.response)===stableJson(active.response)&&publicItem.response_sha256===active.response_sha256,`${item.blind_id} public response未与active run闭合`);validateOracleGateResponse(publicItem.response,key.arm);}
const r1ByBlind=new Map(checkedByRater.get("R1")!.map((item)=>[item.blind_id,item]));
const r2ByBlind=new Map(checkedByRater.get("R2")!.map((item)=>[item.blind_id,item]));
const merged:MergedRating[]=privateMap.map((key)=>{
  const r1=r1ByBlind.get(key.blind_id),r2=r2ByBlind.get(key.blind_id);assert(r1&&r2,"rating缺项");
  return{blind_id:key.blind_id,paired_case_id:key.paired_case_id,case_id:key.case_id,arm:key.arm,seed:key.seed,evidence_f1:mean([r1.evidence_f1,r2.evidence_f1]),edit_content_correct:mean([r1.edit_content_correct,r2.edit_content_correct]),operation_add_correct:mean([r1.operation_add_correct,r2.operation_add_correct]),unsupported_claim_rate:mean([r1.unsupported_claim_rate,r2.unsupported_claim_rate]),schema_privacy_hard_failure:r1.schema_privacy_hard_failure||r2.schema_privacy_hard_failure,rater_disagreement:{evidence_f1_absolute:Math.abs(r1.evidence_f1-r2.evidence_f1),unsupported_rate_absolute:Math.abs(r1.unsupported_claim_rate-r2.unsupported_claim_rate)}};
});
for(const caseId of new Set(merged.map((item)=>item.case_id)))for(const seed of new Set(merged.filter((item)=>item.case_id===caseId).map((item)=>item.seed))){const group=merged.filter((item)=>item.case_id===caseId&&item.seed===seed);assert(group.length===4&&JSON.stringify(group.map((item)=>item.arm).sort())===JSON.stringify([...arms].sort()),"统计私有矩阵不完整");}
const armSummary=arms.map((arm)=>{const rows=merged.filter((item)=>item.arm===arm);assert(rows.length===6,`${arm}必须6项`);return{arm,n:rows.length,evidence_f1:mean(rows.map((item)=>item.evidence_f1)),edit_coverage:mean(rows.map((item)=>item.edit_content_correct)),operation_fidelity:mean(rows.map((item)=>item.operation_add_correct)),unsupported_claim_rate:mean(rows.map((item)=>item.unsupported_claim_rate)),hard_failures:rows.filter((item)=>item.schema_privacy_hard_failure).length,mean_absolute_rater_f1_disagreement:mean(rows.map((item)=>item.rater_disagreement.evidence_f1_absolute))};});
const tieOrder:Arm[]=["static_final_board","uniform_frame","transcript_only"];
const nonOracle=armSummary.filter((item)=>item.arm!=="oracle_delta").sort((a,b)=>b.evidence_f1-a.evidence_f1||tieOrder.indexOf(a.arm)-tieOrder.indexOf(b.arm))[0];const oracle=armSummary.find((item)=>item.arm==="oracle_delta")!;
const paired=[...new Set(merged.map((item)=>item.paired_case_id))].map((pair)=>{const rows=merged.filter((item)=>item.paired_case_id===pair);const oracleItem=rows.find((item)=>item.arm==="oracle_delta"),baselineItem=rows.find((item)=>item.arm===nonOracle.arm);assert(rows.length===4&&oracleItem&&baselineItem,"pair不完整");return{paired_case_id:pair,case_id:oracleItem.case_id,seed:oracleItem.seed,oracle_evidence_f1:oracleItem.evidence_f1,baseline_evidence_f1:baselineItem.evidence_f1,delta:oracleItem.evidence_f1-baselineItem.evidence_f1};});
assert(paired.length===6,"必须恰有6个pair");
const caseIds=[...new Set(paired.map((item)=>item.case_id))];const caseDeltas=caseIds.map((caseId)=>({case_id:caseId,mean_delta:mean(paired.filter((item)=>item.case_id===caseId).map((item)=>item.delta))}));const positiveCases=caseDeltas.filter((item)=>item.mean_delta>0).length;const positivePairs=paired.filter((item)=>item.delta>0).length;
let decision:"GO"|"FIX"|"PIVOT_STOP"="PIVOT_STOP";if(positiveCases===2&&positivePairs>=4&&oracle.edit_coverage>nonOracle.edit_coverage&&oracle.unsupported_claim_rate<=nonOracle.unsupported_claim_rate&&oracle.hard_failures===0)decision="GO";else if(oracle.evidence_f1>nonOracle.evidence_f1&&oracle.hard_failures===0)decision="FIX";
const result={schema_version:"ly004-development-value-gate-result-v2",status:"development_agent_rated_not_paper_result",decision,strongest_non_oracle_arm:nonOracle.arm,aggregation:"equal_rater_mean_then_global_item_mean; no adjudication",arm_summary:armSummary,paired_differences:paired,case_differences:caseDeltas,decision_evidence:{positive_cases:positiveCases,positive_case_seed_pairs:positivePairs,required_positive_pairs:4,oracle_edit_coverage_advantage:oracle.edit_coverage-nonOracle.edit_coverage,oracle_unsupported_claim_rate_difference:oracle.unsupported_claim_rate-nonOracle.unsupported_claim_rate,oracle_hard_failures:oracle.hard_failures},rating_files:ratingFileHashes,warning:"two_independent_agent_ratings_for_development_direction_only_not_human_expert_or_paper_evidence"};
await mkdir(stagingRoot,{recursive:true,mode:0o700});await writeFile(join(stagingRoot,"value-gate-result.json"),JSON.stringify(result,null,2)+"\n",{encoding:"utf8",mode:0o600});await writeFile(join(stagingRoot,"item-ratings-private.json"),JSON.stringify(merged,null,2)+"\n",{encoding:"utf8",mode:0o600});await rename(stagingRoot,resultsRoot);console.log(JSON.stringify({decision,strongest_non_oracle:nonOracle.arm,positiveCases,positivePairs,oracleF1:oracle.evidence_f1,baselineF1:nonOracle.evidence_f1}));
